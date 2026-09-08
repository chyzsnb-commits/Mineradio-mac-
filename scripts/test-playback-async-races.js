const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const declarationStart = source.slice(Math.max(0, start - 6), start) === 'async ' ? start - 6 : start;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(declarationStart, i + 1);
  }
  assert.fail(`${name} 函数未闭合`);
}

test('切歌开始立即暂停并卸载旧音源', () => {
  const source = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const calls = [];
  const sandbox = {
    performance: { now: () => 100 },
    trackSwitchToken: 3,
    playToggleBusy: true,
    audioFadeSerial: 0,
    playing: true,
    audio: {
      src: 'http://127.0.0.1:3000/api/audio?url=old',
      currentSrc: 'http://127.0.0.1:3000/api/audio?url=old',
      onended() {},
      pause() { calls.push('pause'); },
      removeAttribute(name) { calls.push(`remove:${name}`); if (name === 'src') this.src = ''; },
      load() { calls.push('load'); this.currentSrc = ''; },
    },
    clearAudioFadeTimers() { calls.push('clear-fade'); },
    setPlayIcon(value) { calls.push(`icon:${value}`); },
    syncPlaybackStateFromAudioEvent(reason) { calls.push(`sync:${reason}`); },
    syncAudioOutputMirrors() {},
  };
  vm.runInNewContext(`${readFunction(source, 'markPlaybackTrackTeardown')}; ${readFunction(source, 'pauseCurrentAudioForTrackSwitch')}; pauseCurrentAudioForTrackSwitch();`, sandbox);

  assert.deepEqual(calls.slice(0, 4), ['clear-fade', 'pause', 'remove:src', 'load']);
  assert.equal(sandbox.audio.src, '');
  assert.equal(sandbox.audio.currentSrc, '');
  assert.equal(sandbox.playing, false);
});

test('旧切歌任务不能清掉较新的音源', () => {
  const source = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const calls = [];
  const sandbox = {
    performance: { now: () => 100 },
    trackSwitchToken: 9,
    playing: true,
    audio: {
      src: 'new-song',
      pause() { calls.push('pause'); },
      removeAttribute() { calls.push('remove'); this.src = ''; },
      load() { calls.push('load'); },
    },
    setPlayIcon() {},
    syncPlaybackStateFromAudioEvent() {},
    syncAudioOutputMirrors() {},
  };
  vm.runInNewContext([readFunction(source, 'markPlaybackTrackTeardown'), readFunction(source, 'clearFailedPlaybackAudioSource')].join(';'), sandbox);
  assert.equal(vm.runInNewContext('clearFailedPlaybackAudioSource(8)', sandbox), false);
  assert.equal(sandbox.audio.src, 'new-song');
  assert.equal(vm.runInNewContext('clearFailedPlaybackAudioSource(9)', sandbox), true);
  assert.equal(sandbox.audio.src, '');
  assert.deepEqual(calls, ['pause', 'remove', 'load']);
});

test('慢网络中的旧切歌不能阻塞后续导航，连续输入只启动最新目标', async () => {
  const source = read('public/js/modules/05-playback/14-player-controls.js');
  const calls = [];
  const releases = [];
  const sandbox = {
    Promise,
    setTimeout,
    clearTimeout,
    console: { warn() {} },
    trackSwitchToken: 1,
    playQueue: Array.from({ length: 8 }, (_, index) => ({ id: index, type: 'local', localUrl: `local-${index}` })),
    currentIdx: 0,
    playMode: 'list',
    playToggleBusy: false,
    trackNavigationState: { inProgress: false, scheduled: false, timer: 0, desiredIndex: -1, pendingDelta: 0, manual: false, promise: null, settle: null, serial: 0 },
    cancelPlaybackSourceRequest() {},
    forcePlaybackControlsInteractive() {},
    playQueueAt(index) {
      sandbox.currentIdx = index;
      calls.push(index);
      return new Promise((resolve) => releases.push(resolve));
    },
  };
  vm.runInNewContext([
    readFunction(source, 'trackNavigationTargetIndex'),
    readFunction(source, 'drainTrackNavigation'),
    readFunction(source, 'requestTrackNavigation'),
    readFunction(source, 'nextTrack'),
    readFunction(source, 'prevTrack'),
  ].join(';'), sandbox);

  const first = sandbox.nextTrack(true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(calls, [1]);

  const pending = [];
  for (let index = 0; index < 4; index += 1) {
    pending.push(sandbox.nextTrack(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.deepEqual(calls, [1, 5]);
  assert.equal(releases.length, 2, '旧网络请求未完成时也要立即启动最终目标');

  releases[1]();
  await Promise.all(pending);
  assert.equal(sandbox.currentIdx, 5);
  assert.equal(sandbox.trackNavigationState.inProgress, false);
  assert.equal(sandbox.trackNavigationState.pendingDelta, 0);
  releases[0]();
  await first;
  assert.equal(sandbox.trackNavigationState.inProgress, false, '过期任务结束不能覆盖最新导航状态');
});

test('结算窗口内下一首再上一首会抵消，不重启当前歌曲', async () => {
  const source = read('public/js/modules/05-playback/14-player-controls.js');
  const calls = [];
  const sandbox = {
    Promise,
    setTimeout,
    clearTimeout,
    console: { warn() {} },
    trackSwitchToken: 2,
    playQueue: Array.from({ length: 5 }, (_, index) => ({ id: index, type: 'local', localUrl: `local-${index}` })),
    currentIdx: 2,
    playMode: 'list',
    playToggleBusy: false,
    trackNavigationState: { inProgress: false, scheduled: false, timer: 0, desiredIndex: -1, pendingDelta: 0, manual: false, promise: null, settle: null, serial: 0 },
    cancelPlaybackSourceRequest() {},
    forcePlaybackControlsInteractive() {},
    playQueueAt(index) { calls.push(index); return Promise.resolve(true); },
  };
  vm.runInNewContext([
    readFunction(source, 'trackNavigationTargetIndex'),
    readFunction(source, 'drainTrackNavigation'),
    readFunction(source, 'requestTrackNavigation'),
    readFunction(source, 'nextTrack'),
    readFunction(source, 'prevTrack'),
  ].join(';'), sandbox);

  const next = sandbox.nextTrack(true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const previous = sandbox.prevTrack(true);
  await Promise.all([next, previous]);
  assert.deepEqual(calls, []);
  assert.equal(sandbox.currentIdx, 2);
});

test('滚轮式连续找歌二十次只启动最终目标', async () => {
  const source = read('public/js/modules/05-playback/14-player-controls.js');
  const calls = [];
  const sandbox = {
    Promise,
    setTimeout,
    clearTimeout,
    console: { warn() {} },
    trackSwitchToken: 4,
    playQueue: Array.from({ length: 32 }, (_, index) => ({ id: index, type: 'local', localUrl: `local-${index}` })),
    currentIdx: 0,
    playMode: 'list',
    playToggleBusy: false,
    trackNavigationState: { inProgress: false, scheduled: false, timer: 0, desiredIndex: -1, pendingDelta: 0, manual: false, promise: null, settle: null, serial: 0 },
    cancelPlaybackSourceRequest() {},
    forcePlaybackControlsInteractive() {},
    async playQueueAt(index) { calls.push(index); sandbox.currentIdx = index; return true; },
  };
  vm.runInNewContext([
    readFunction(source, 'trackNavigationTargetIndex'),
    readFunction(source, 'drainTrackNavigation'),
    readFunction(source, 'requestTrackNavigation'),
    readFunction(source, 'nextTrack'),
  ].join(';'), sandbox);

  const requests = [];
  for (let index = 0; index < 20; index += 1) {
    requests.push(sandbox.nextTrack(true));
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  await Promise.all(requests);
  assert.deepEqual(calls, [20]);
  assert.equal(sandbox.currentIdx, 20);
});

test('导航预取超时或网络失败后仍回退普通播放并返回真实结果', async () => {
  const source = read('public/js/modules/05-playback/14-player-controls.js');
  const calls = [];
  const warnings = [];
  const sandbox = {
    Promise,
    setTimeout,
    clearTimeout,
    console: { warn(...args) { warnings.push(args); } },
    trackSwitchToken: 5,
    playQueue: [{ id: 0, source: 'netease' }, { id: 1, source: 'netease' }],
    currentIdx: 0,
    playMode: 'list',
    playToggleBusy: false,
    trackNavigationState: { inProgress: false, scheduled: false, timer: 0, desiredIndex: -1, pendingDelta: 0, manual: false, promise: null, settle: null, serial: 0 },
    cancelPlaybackSourceRequest() {},
    forcePlaybackControlsInteractive() {},
    beginPlaybackSourceRequest() { return { signal: null, abortReason: '', timer: 0 }; },
    finishPlaybackSourceRequest() {},
    async resolveAlbumGaplessPlaybackData() { throw new Error('preload timeout'); },
    async playQueueAt(index, opts) {
      calls.push({ index, hasPreload: Object.prototype.hasOwnProperty.call(opts, 'preloadedData') });
      sandbox.currentIdx = index;
      return true;
    },
  };
  vm.runInNewContext([
    readFunction(source, 'trackNavigationTargetIndex'),
    readFunction(source, 'drainTrackNavigation'),
    readFunction(source, 'requestTrackNavigation'),
    readFunction(source, 'nextTrack'),
  ].join(';'), sandbox);

  assert.equal(await sandbox.nextTrack(true), true);
  assert.deepEqual(calls, [{ index: 1, hasPreload: false }]);
  assert.equal(warnings.length, 1);
});

test('清空队列会结算尚未执行的导航 Promise，旧定时器不能再播放', async () => {
  const playerSource = read('public/js/modules/05-playback/14-player-controls.js');
  const switchSource = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const calls = [];
  const sandbox = {
    Promise,
    setTimeout,
    clearTimeout,
    console: { warn() {} },
    trackSwitchToken: 1,
    playQueue: [{ id: 0, type: 'local' }, { id: 1, type: 'local' }],
    currentIdx: 0,
    playMode: 'list',
    playToggleBusy: false,
    trackNavigationState: { inProgress: false, scheduled: false, timer: 0, desiredIndex: -1, pendingDelta: 0, manual: false, promise: null, settle: null, serial: 0 },
    cancelPlaybackSourceRequest() {},
    forcePlaybackControlsInteractive() {},
    async playQueueAt(index) { calls.push(index); return true; },
  };
  vm.runInNewContext([
    readFunction(playerSource, 'trackNavigationTargetIndex'),
    readFunction(playerSource, 'drainTrackNavigation'),
    readFunction(playerSource, 'requestTrackNavigation'),
    readFunction(playerSource, 'nextTrack'),
    readFunction(switchSource, 'cancelTrackNavigationRequest'),
  ].join(';'), sandbox);

  const pending = sandbox.nextTrack(true);
  assert.equal(sandbox.cancelTrackNavigationRequest('clear-queue'), true);
  assert.equal(await pending, false);
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.deepEqual(calls, []);
  assert.match(readFunction(playerSource, 'clearQueue'), /cancelTrackNavigationRequest\('clear-queue'\)/);
});

test('直接点歌会取消尚未结算的滚轮或快捷键导航', async () => {
  const switchSource = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const playbackSource = read('public/js/modules/05-playback/13-playback-start-audio.js');
  let settledValue = null;
  let cancelledReason = '';
  const sandbox = {
    clearTimeout() {},
    cancelPlaybackSourceRequest(reason) { cancelledReason = reason; },
    trackNavigationState: {
      inProgress: true,
      scheduled: true,
      timer: 41,
      desiredIndex: 6,
      pendingDelta: 4,
      manual: true,
      promise: Promise.resolve(true),
      settle(value) { settledValue = value; },
      serial: 8,
    },
  };
  vm.runInNewContext(readFunction(switchSource, 'cancelTrackNavigationRequest'), sandbox);
  assert.equal(sandbox.cancelTrackNavigationRequest('direct-play'), true);
  assert.equal(settledValue, false);
  assert.equal(cancelledReason, 'direct-play');
  assert.equal(sandbox.trackNavigationState.serial, 9);
  assert.equal(sandbox.trackNavigationState.timer, 0);
  assert.equal(sandbox.trackNavigationState.desiredIndex, -1);
  assert.equal(sandbox.trackNavigationState.promise, null);
  assert.match(
    playbackSource.slice(playbackSource.indexOf('async function playQueueAt'), playbackSource.indexOf('function navigationRequestCurrent')),
    /cancelTrackNavigationRequest\('direct-play'\)/,
    '直接 playQueueAt 必须先让旧导航失效'
  );
});

test('新播放地址请求会取消旧请求，旧请求收尾不能清掉新控制器', () => {
  const source = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const sandbox = {
    AbortController,
    setTimeout,
    clearTimeout,
    playbackSourceRequestState: { token: 0, controller: null, request: null, timer: 0 },
  };
  vm.runInNewContext([
    readFunction(source, 'cancelPlaybackSourceRequest'),
    readFunction(source, 'beginPlaybackSourceRequest'),
    readFunction(source, 'finishPlaybackSourceRequest'),
  ].join(';'), sandbox);

  const first = sandbox.beginPlaybackSourceRequest(11, 5000);
  const second = sandbox.beginPlaybackSourceRequest(12, 5000);
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  sandbox.finishPlaybackSourceRequest(first);
  assert.equal(sandbox.playbackSourceRequestState.controller, second.controller);
  sandbox.finishPlaybackSourceRequest(second);
  assert.equal(sandbox.playbackSourceRequestState.controller, null);
});

test('playAudio 把切歌 token 守卫传进底层播放流程', async () => {
  const source = read('public/js/modules/05-playback/14-player-controls.js');
  let received = null;
  const sandbox = {
    attemptAudioPlay(options) { received = options; return Promise.resolve(true); },
  };
  vm.runInNewContext(readFunction(source, 'playAudio'), sandbox);
  const guard = () => true;
  assert.equal(await sandbox.playAudio({ trackSwitch: true, playRequestCurrent: guard }), true);
  assert.equal(received.playRequestCurrent, guard);
});

test('切歌重试等待就绪或输出路由期间过期，旧音频不能再次 play', async () => {
  const source = read('public/js/modules/05-playback/14-player-controls.js');
  const retryDeclaration = readFunction(source, 'retryTrackSwitchAudioPlayOnce');

  async function runScenario(blockAt) {
    let current = true;
    let release;
    let playCalls = 0;
    let outputCalls = 0;
    let graphCalls = 0;
    const blocked = new Promise((resolve) => { release = resolve; });
    const media = {
      src: 'retry-song',
      currentSrc: 'retry-song',
      readyState: 2,
      networkState: 1,
      NETWORK_EMPTY: 0,
      load() {},
      play() { playCalls += 1; return Promise.resolve(); },
    };
    const sandbox = {
      Promise,
      audio: media,
      mediaPlaybackTargetSrc: () => 'retry-song',
      waitForAudioReadyToPlay: () => blockAt === 'ready' ? blocked : Promise.resolve(true),
      audioPlayRequestCurrent: () => current,
      audioGraphHealthy: () => true,
      initAudio() {},
      applyAudioOutputDevice() {
        outputCalls += 1;
        return blockAt === 'output' ? blocked : Promise.resolve(true);
      },
      ensurePlaybackAudioGraph() { graphCalls += 1; return Promise.resolve(true); },
      completeAudioPlayStart: async () => true,
    };
    vm.runInNewContext(retryDeclaration, sandbox);
    const pending = sandbox.retryTrackSwitchAudioPlayOnce({ manual: true, playRequestCurrent: () => current }, new Error('first play failed'));
    await new Promise((resolve) => setImmediate(resolve));
    current = false;
    release(true);
    const result = await pending;
    return { result, playCalls, outputCalls, graphCalls };
  }

  const duringReady = await runScenario('ready');
  assert.equal(duringReady.result, null);
  assert.equal(duringReady.playCalls, 0);
  assert.equal(duringReady.outputCalls, 0);

  const duringOutput = await runScenario('output');
  assert.equal(duringOutput.result, null);
  assert.equal(duringOutput.playCalls, 0);
  assert.equal(duringOutput.outputCalls, 1);
  assert.equal(duringOutput.graphCalls, 0);
});

test('相同输出对象和 sink 的并发及重复 setSinkId 只执行一次', async () => {
  const source = read('public/js/modules/05-playback/00-api-quality-output.js');
  let calls = 0;
  const target = {
    setSinkId() {
      calls += 1;
      return new Promise((resolve) => setImmediate(resolve));
    },
  };
  const sandbox = {
    Promise,
    audioOutputSinkAppliedCache: new WeakMap(),
    audioOutputSinkPendingCache: new WeakMap(),
    audioOutputSinkCacheEpoch: 0,
  };
  vm.runInNewContext(readFunction(source, 'applyAudioSinkOnce'), sandbox);
  await Promise.all([
    sandbox.applyAudioSinkOnce(target, 'speaker-a'),
    sandbox.applyAudioSinkOnce(target, 'speaker-a'),
    sandbox.applyAudioSinkOnce(target, 'speaker-a'),
  ]);
  assert.equal(calls, 1);
  assert.equal((await sandbox.applyAudioSinkOnce(target, 'speaker-a')).cached, true);
  assert.equal(calls, 1);
  await sandbox.applyAudioSinkOnce(target, 'speaker-b');
  assert.equal(calls, 2);
});

test('同一输出对象切换不同 sink 时严格串行，最终缓存最后一个设备', async () => {
  const source = read('public/js/modules/05-playback/00-api-quality-output.js');
  const calls = [];
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  const target = {
    setSinkId(sinkId) {
      calls.push(sinkId);
      return sinkId === 'speaker-a' ? first : Promise.resolve();
    },
  };
  const sandbox = {
    Promise,
    audioOutputSinkAppliedCache: new WeakMap(),
    audioOutputSinkPendingCache: new WeakMap(),
    audioOutputSinkCacheEpoch: 0,
  };
  vm.runInNewContext(readFunction(source, 'applyAudioSinkOnce'), sandbox);

  const firstApply = sandbox.applyAudioSinkOnce(target, 'speaker-a');
  const secondApply = sandbox.applyAudioSinkOnce(target, 'speaker-b');
  await Promise.resolve();
  assert.deepEqual(calls, ['speaker-a']);
  releaseFirst();
  await Promise.all([firstApply, secondApply]);
  assert.deepEqual(calls, ['speaker-a', 'speaker-b']);
  assert.equal((await sandbox.applyAudioSinkOnce(target, 'speaker-b')).cached, true);
});

test('设备列表变化会让在途 setSinkId 的旧结果失效', async () => {
  const source = read('public/js/modules/05-playback/00-api-quality-output.js');
  let calls = 0;
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  const target = {
    setSinkId() {
      calls += 1;
      return calls === 1 ? first : Promise.resolve();
    },
  };
  const sandbox = {
    Promise,
    WeakMap,
    audioOutputSinkAppliedCache: new WeakMap(),
    audioOutputSinkPendingCache: new WeakMap(),
    audioOutputSinkCacheEpoch: 0,
  };
  vm.runInNewContext([
    readFunction(source, 'invalidateAudioOutputSinkCache'),
    readFunction(source, 'applyAudioSinkOnce'),
  ].join(';'), sandbox);

  const pending = sandbox.applyAudioSinkOnce(target, 'speaker-a');
  await Promise.resolve();
  sandbox.invalidateAudioOutputSinkCache();
  const reapplied = sandbox.applyAudioSinkOnce(target, 'speaker-a');
  await Promise.resolve();
  assert.equal(calls, 1, '新 epoch 的请求必须等待旧 setSinkId 收尾，不能并发路由');
  releaseFirst();
  await Promise.all([pending, reapplied]);
  assert.equal(calls, 2);
  assert.equal((await sandbox.applyAudioSinkOnce(target, 'speaker-a')).cached, true);
});

test('导航预解析使用短窗口，不能额外等待一次完整取链超时', () => {
  const source = read('public/js/modules/05-playback/14-player-controls.js');
  const body = readFunction(source, 'drainTrackNavigation');
  const timeout = body.match(/navigationPreloadTimeoutMs\s*=\s*(\d+)/);
  assert.ok(timeout, '缺少导航预解析短超时');
  assert.ok(Number(timeout[1]) <= 3000, '导航预解析最长只能占用 3 秒');
  assert.match(body, /beginPlaybackSourceRequest\(trackSwitchToken \+ 1, navigationPreloadTimeoutMs\)/);
  assert.match(body, /timeoutMs: navigationPreloadTimeoutMs/);
});

test('本地曲库删歌先取消待执行导航，删除最后一首也不会悬空', () => {
  const source = read('public/js/modules/06-lyrics/07-local-library-panel.js');
  const body = readFunction(source, 'removeLocalLibraryTrackFromQueue');
  const cancelAt = body.indexOf("cancelTrackNavigationRequest('local-library-remove')");
  const spliceAt = body.indexOf('playQueue.splice(qIdx, 1)');
  assert.ok(cancelAt >= 0 && spliceAt > cancelAt);
});

test('QQ 音质降级丢弃旧预取地址，换源链持续携带导航守卫', () => {
  const fallbackSource = read('public/js/modules/05-playback/11-provider-fallback.js');
  const playbackSource = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const sandbox = { Object };
  vm.runInNewContext(readFunction(fallbackSource, 'playbackRetryOptionsWithoutPreload'), sandbox);
  const guard = () => true;
  const next = sandbox.playbackRetryOptionsWithoutPreload({
    preloadedAudio: {},
    preloadedData: { url: 'failed-url' },
    preloadedProxyAudioUrl: 'failed-proxy',
    albumGaplessHandoff: true,
    albumGaplessMixed: true,
    playRequestCurrent: guard,
    manual: true,
  });
  assert.equal(next.preloadedAudio, undefined);
  assert.equal(next.preloadedData, undefined);
  assert.equal(next.preloadedProxyAudioUrl, undefined);
  assert.equal(next.albumGaplessHandoff, undefined);
  assert.equal(next.albumGaplessMixed, undefined);
  assert.equal(next.playRequestCurrent, guard);
  assert.equal(next.manual, true);
  assert.match(readFunction(fallbackSource, 'retryQQPlaybackWithCompatibleQuality'), /playbackRetryOptionsWithoutPreload\(opts\)/);
  assert.match(readFunction(fallbackSource, 'tryAutoPlaybackFallback'), /playbackFallbackRequestCurrent\(opts, token\)/);
  assert.match(readFunction(fallbackSource, 'tryAutoPlaybackFallback'), /fallbackPlaybackOpts\.playRequestCurrent = opts\.playRequestCurrent/);
  assert.match(playbackSource, /qqUrlRetryOutcome && qqUrlRetryOutcome\.handled/);
  assert.match(playbackSource, /return qqUrlRetryOutcome\.started === true/);
  assert.match(playbackSource, /autoFallbackOutcome && autoFallbackOutcome\.handled/);
  assert.match(playbackSource, /return autoFallbackOutcome\.started === true/);
});

test('自动换源返回真实启动结果，过期链不会再覆盖状态卡', async () => {
  const source = read('public/js/modules/05-playback/11-provider-fallback.js');
  const declarations = [
    readFunction(source, 'playbackFallbackNavigationCurrent'),
    readFunction(source, 'playbackFallbackRequestCurrent'),
    readFunction(source, 'playbackFallbackOutcome'),
    readFunction(source, 'tryAutoPlaybackFallback'),
  ].join(';');

  async function run(staleAfterPlay) {
    let current = true;
    const notices = [];
    const original = { id: 'qq-old', name: '同名歌曲', artist: '歌手', source: 'qq' };
    const alternate = { id: 'ne-new', name: '同名歌曲', artist: '歌手', source: 'netease' };
    const sandbox = {
      Promise,
      console: { warn() {} },
      trackSwitchToken: 4,
      currentIdx: 0,
      playQueue: [original],
      miniQueueOpen: false,
      _playbackFailExceeded: () => false,
      _recordPlaybackFail: () => 1,
      playbackRestrictionCategory: () => 'unavailable',
      playbackProviderLabel: () => 'QQ 音乐',
      playbackLoginProvider: () => 'qq',
      qishuiPlaybackFailureDetail: () => '',
      alternatePlaybackProvider: () => 'netease',
      showSourceSwitchNotice(title) { notices.push(title); },
      async searchAlternatePlatformSong() { return alternate; },
      songProviderKey: (song) => song.source,
      hydrateCustomCover: (song) => song,
      safeRenderQueuePanel() {},
      safeShelfRebuild() {},
      markQueueItemPlaybackFailed() {},
      handlePlaybackUnavailable() {},
      skipFailedQueueItem() {},
      async playQueueAt() {
        if (staleAfterPlay) current = false;
        return true;
      },
    };
    vm.runInNewContext(declarations, sandbox);
    const outcome = await sandbox.tryAutoPlaybackFallback(original, { url: '' }, 0, 4, {
      fallbackDepth: 0,
      startupAutoplay: false,
      playRequestCurrent: () => current,
    });
    return { outcome: JSON.parse(JSON.stringify(outcome)), notices };
  }

  const active = await run(false);
  assert.deepEqual(active.outcome, { handled: true, started: true });
  assert.deepEqual(active.notices, ['正在自动换源', '已自动切换音源']);

  const stale = await run(true);
  assert.deepEqual(stale.outcome, { handled: true, started: true });
  assert.deepEqual(stale.notices, ['正在自动换源'], '旧链完成后不能覆盖新歌曲的状态卡');
});

test('标题歌手只在新 audio.src 赋值后提交，失败路径会清源', () => {
  const source = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const localSource = source.indexOf('audio.src = song.localUrl');
  const localUi = source.indexOf('commitPlaybackTrackUi(song, token)', localSource);
  const remoteSource = source.indexOf('audio.src = proxyAudioUrl');
  const remoteUi = source.indexOf('commitPlaybackTrackUi(song, token)', remoteSource);
  const oldEarlyUi = source.indexOf("safePlaybackStep('track-ui'");
  const failureClears = source.match(/clearFailedPlaybackAudioSource\(token\)/g) || [];

  assert.ok(localSource >= 0 && localUi > localSource, '本地歌曲 UI 必须晚于 src');
  assert.ok(remoteSource >= 0 && remoteUi > remoteSource, '网络歌曲 UI 必须晚于 src');
  assert.equal(oldEarlyUi, -1, '网络请求前不能先提交标题歌手');
  assert.ok(failureClears.length >= 3, '播放失败和异常路径都应清理当前源');
  assert.match(source, /safeSyncQueuePanelCurrent\('play-queue-at-switch'/, '切歌只能 patch 当前行，不能在播放前重建整栏');
  assert.doesNotMatch(source, /safeRenderQueuePanel\('play-queue-at(?:-switch)?'/, '切歌热路径不能重复 full render 队列');
  assert.match(source, /safeSyncQueuePanelCurrent\('play-local-queue'/, '本地切歌成功后也只能 patch 当前行');
  assert.doesNotMatch(source, /safeRenderQueuePanel\('(?:play-local-queue|local-metadata)'/, '本地歌曲与元数据到达不能重建整栏');
  assert.doesNotMatch(source, /if \(typeof updateControlTrackInfo === 'function'\) updateControlTrackInfo\(song\)/, '播放地址解析后不能在正式 commit 前重复提交歌曲 UI');
});

test('随机重排完整刷新队列，隐藏主列表的高亮缺口会在打开时补齐', () => {
  const playbackSource = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const syncSource = read('public/js/modules/04-shelf/02-rebuild-panel-sync.js');
  const panelSource = read('public/js/modules/06-lyrics/01-playlist-panel-shell.js');
  assert.match(playbackSource, /queueOrderChanged = true/);
  assert.match(playbackSource, /safeRenderQueuePanel\('shuffle-play-queue-at'/);
  assert.match(readFunction(syncSource, 'patchRenderedQueueCurrentIndex'), /queueListRendered/);
  assert.match(readFunction(syncSource, 'patchRenderedQueueCurrentIndex'), /currentMarkerDirty = '1'/);
  assert.match(readFunction(syncSource, 'patchRenderedQueueCurrentIndex'), /queuePanelRenderKey !== queuePanelListKey\(\)/);
  assert.match(readFunction(panelSource, 'switchPlaylistTab'), /queuePanelDirty[\s\S]*currentMarkerDirty/);
});

test('普通切歌使用 3D 歌架增量同步，失败才回退完整重建', () => {
  const managerSource = read('public/js/modules/04-shelf/01-manager-core.js');
  const syncSource = read('public/js/modules/04-shelf/02-rebuild-panel-sync.js');
  const body = readFunction(managerSource, 'syncQueueCurrent');
  const coverChange = managerSource.slice(managerSource.indexOf('onCoverChange: function'), managerSource.indexOf('rebuild: rebuild'));
  const setMode = managerSource.slice(managerSource.indexOf('setMode: function'), managerSource.indexOf('getMode: function'));
  assert.doesNotMatch(body, /disposeRenderedCards|\brebuild\s*\(/);
  assert.match(managerSource, /syncQueueCurrent: syncQueueCurrent/);
  assert.match(coverChange, /if \(!syncQueueCurrent\(currentIdx, true\)\) rebuild\(true\)/);
  assert.doesNotMatch(coverChange, /lastUpdate = uniforms\.uTime\.value;\s*rebuild\(/);
  assert.match(setMode, /disposeRenderedCards\(\)/);
  assert.match(setMode, /allItems = \[\]/);
  assert.match(setMode, /queueCurrentIdx = -1/);
  assert.match(readFunction(syncSource, 'isShelfQueueCurrentSyncReason'), /play-queue-at/);
  assert.match(readFunction(syncSource, 'isShelfQueueCurrentSyncReason'), /play-local-queue/);
  assert.match(readFunction(syncSource, 'scheduleShelfRebuild'), /safeSyncShelfQueueCurrent\(reason, asyncCards\)/);
});

test('磁盘节拍缓存并行读取，不能挡在新音频启动之前', () => {
  const source = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const playStart = source.indexOf("markPlayPhase('audio-start')");
  const confirmed = source.indexOf('if (!confirmQueuePlaybackStarted(idx, token)) return false;', playStart);
  const deferredCommit = source.indexOf('Promise.resolve(beatLookup.promise).then', confirmed);
  assert.ok(playStart >= 0 && confirmed > playStart && deferredCommit > confirmed, '缓存结果只能在播放确认后提交');
  assert.doesNotMatch(source, /await readBeatDiskCache\(bmKey\)/, '切歌热路径不能等待磁盘缓存');
  assert.match(source, /promise: bmKey \? readBeatDiskCache\(bmKey\) : Promise\.resolve\(null\)/, '播放前只允许并行发起缓存读取');
  assert.match(source, /beatLookup\.beatToken !== beatMapToken/, '旧歌曲缓存结果必须受 beat token 保护');
});

test('已退出首页视觉后重复播放事件不会再次恢复整套 viewport', () => {
  const source = read('public/js/modules/05-playback/04-home-empty-wallpaper.js');
  let syncs = 0;
  let recovers = 0;
  const classNames = new Set();
  const sandbox = {
    homeVisualPresetActive: false,
    startupVisualPreviewActive: false,
    document: { body: { classList: { contains: (name) => classNames.has(name), remove: (name) => classNames.delete(name) } } },
    syncFxUniforms() { syncs += 1; },
    updateRenderPowerClasses() {},
    recoverVisualsAfterBackground() { recovers += 1; },
    isDeepBackgroundMode: () => false,
    deactivateHomeWallpaperPreview() {
      sandbox.homeVisualPresetActive = false;
    },
  };
  vm.runInNewContext(readFunction(source, 'switchPlaybackVisualToEmily'), sandbox);
  assert.equal(sandbox.switchPlaybackVisualToEmily(), false);
  assert.equal(syncs, 0);
  assert.equal(recovers, 0);
  sandbox.homeVisualPresetActive = true;
  assert.equal(sandbox.switchPlaybackVisualToEmily(), true);
  assert.equal(syncs, 1);
  assert.equal(recovers, 1);
});

function createSeekMedia(initialTime = 0) {
  const listeners = new Map();
  const seeks = [];
  let currentTime = initialTime;
  const media = {
    src: 'song-audio',
    currentSrc: 'song-audio',
    readyState: 1,
    paused: true,
    ended: false,
    seeking: false,
    seeks,
    addEventListener(name, fn, options) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push({ fn, once: !!(options && options.once) });
    },
    removeEventListener(name, fn) {
      const entries = listeners.get(name) || [];
      listeners.set(name, entries.filter((entry) => entry.fn !== fn));
    },
    emit(name) {
      if (name === 'seeked') this.seeking = false;
      const entries = (listeners.get(name) || []).slice();
      entries.forEach((entry) => {
        entry.fn();
        if (entry.once) this.removeEventListener(name, entry.fn);
      });
    },
  };
  Object.defineProperty(media, 'currentTime', {
    get() { return currentTime; },
    set(value) {
      currentTime = Number(value) || 0;
      seeks.push(currentTime);
      media.seeking = true;
    },
  });
  return media;
}

test('内部切歌 teardown 的 pause/abort/emptied 不重复同步，随后手动暂停仍会保存', () => {
  const switchSource = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const progressSource = read('public/js/modules/06-lyrics/04-progress-seek.js');
  const media = createSeekMedia();
  const synced = [];
  const snapshots = [];
  const timerEvents = [];
  const sandbox = {
    performance: { now: () => 100 },
    audio: media,
    trackSwitchToken: 7,
    updatePlaybackProgressUi() {},
    syncPlaybackProgressTimerForEvent(_media, name) { timerEvents.push(name); },
    syncPlaybackProgressTimerForCurrentMedia() {},
    syncAlbumGaplessMonitorForPlaybackEvent() {},
    syncPlaybackStateFromAudioEvent(name) { synced.push(name); },
    saveLastPlaybackSnapshot(force, name) { snapshots.push([force, name]); },
  };
  vm.runInNewContext([
    readFunction(switchSource, 'markPlaybackTrackTeardown'),
    readFunction(switchSource, 'isPlaybackTrackTeardownEvent'),
    readFunction(switchSource, 'clearPlaybackTrackTeardown'),
    readFunction(progressSource, 'bindPlaybackProgressEvents'),
  ].join(';'), sandbox);

  sandbox.bindPlaybackProgressEvents(media);
  sandbox.markPlaybackTrackTeardown(media, 7);
  sandbox.trackSwitchToken = 99;
  media.emit('pause');
  media.emit('abort');
  media.emit('emptied');
  assert.deepEqual(timerEvents, ['pause', 'abort', 'emptied']);
  assert.deepEqual(synced, []);
  assert.deepEqual(snapshots, []);

  media.emit('play');
  media.emit('pause');
  assert.deepEqual(synced, ['play', 'pause']);
  assert.deepEqual(snapshots, [[false, 'play'], [true, 'pause']]);
});

test('连续 20 次进度跳转只执行当前和最后一次，完成后恢复播放', async () => {
  const source = read('public/js/modules/06-lyrics/04-progress-seek.js');
  const media = createSeekMedia();
  const gains = [];
  let playCalls = 0;
  let finishPlay;
  const playbackStarted = new Promise((resolve) => { finishPlay = resolve; });
  const sandbox = {
    Promise,
    console: { warn() {} },
    performance: { now: () => 100 },
    setTimeout: () => 1,
    clearTimeout() {},
    isFinite,
    audio: media,
    progressDragState: {
      active: false,
      media,
      mediaSrc: 'song-audio',
      previewTime: 0,
      previewDuration: 240,
      previewClockRunning: false,
      previewHoldUntil: 0,
      previewHoldSerial: 0,
      resumePlaySerial: 0,
      commitSerial: 0,
      seekInFlight: false,
      pendingSeek: null,
      seekPromise: null,
      resumePlaybackAfterSeek: false,
    },
    clampRange(value, min, max) { return Math.max(min, Math.min(max, value)); },
    scheduleProgressLyricPreviewTick() {},
    renderProgressPreview() {},
    syncBeatMapPlaybackCursor() {},
    saveLastPlaybackSnapshot() {},
    setAudioOutputGainImmediate(value) { gains.push(value); },
    restorePlaybackGain() { gains.push('restore'); },
    attemptAudioPlay() {
      playCalls += 1;
      media.paused = false;
      return playbackStarted;
    },
  };
  const names = [
    'getActiveProgressSeekMedia',
    'getProgressPreviewClockSeconds',
    'beginProgressPreviewHold',
    'finishProgressPreviewHold',
    'waitForProgressSeekReady',
    'restoreProgressSeekAudio',
    'primeProgressSeekPlayback',
    'runProgressSeekCommit',
    'drainProgressSeekQueue',
    'finishProgressSeekQueueState',
    'commitProgressSeek',
  ];
  const declarations = names
    .filter((name) => source.includes(`function ${name}(`))
    .map((name) => readFunction(source, name));
  vm.runInNewContext(declarations.join(';'), sandbox);

  const pending = [];
  for (let target = 1; target <= 20; target += 1) {
    pending.push(sandbox.commitProgressSeek(target, true));
  }

  assert.deepEqual(media.seeks, [1], '第一轮等待时不能并发写入 20 个 currentTime');
  assert.equal(playCalls, 0, '主轨仍在 seeking 时不能提前播放');

  media.emit('seeked');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(media.seeks, [1, 20], '第一轮完成后只执行最后一次目标');
  assert.equal(playCalls, 0, '最后一次 seeking 完成前仍不能播放');

  media.emit('seeked');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(playCalls, 1);
  assert.equal(media.paused, false);
  assert.equal(sandbox.progressDragState.seekInFlight, true, '恢复播放完成前 seek 队列必须保持占用');
  assert.equal(sandbox.progressDragState.resumePlaybackAfterSeek, true);
  finishPlay(true);
  await Promise.all(pending);
  assert.ok(gains.includes('restore'), '过期 seek 也必须撤销自己留下的静音');
  assert.equal(sandbox.progressDragState.seekInFlight, false);
  assert.equal(sandbox.progressDragState.pendingSeek, null);
});

test('过期进度跳转退出前也会恢复输出增益', () => {
  const source = read('public/js/modules/06-lyrics/04-progress-seek.js');
  const media = createSeekMedia();
  let restores = 0;
  const sandbox = {
    audio: media,
    progressDragState: { commitSerial: 3 },
    restorePlaybackGain() { restores += 1; },
  };
  vm.runInNewContext(readFunction(source, 'restoreProgressSeekAudio'), sandbox);
  sandbox.restoreProgressSeekAudio(media, 'song-audio', true, 2);
  assert.equal(restores, 1);
});

test('内部 pause 事件后再次拖动仍保留原来的继续播放意图', () => {
  const source = read('public/js/modules/06-lyrics/04-progress-seek.js');
  assert.match(source, /function shouldResumeProgressSeekPlayback\(/);
  const sandbox = {
    audio: { src: 'song-audio', paused: true, ended: false },
    playing: false,
    progressDragState: {
      seekInFlight: true,
      resumePlaybackAfterSeek: true,
    },
  };
  vm.runInNewContext(readFunction(source, 'shouldResumeProgressSeekPlayback'), sandbox);
  assert.equal(sandbox.shouldResumeProgressSeekPlayback(), true);
});

test('旧 seek 队列结束时不会清掉正在拖动的新请求状态', () => {
  const source = read('public/js/modules/06-lyrics/04-progress-seek.js');
  assert.match(source, /function finishProgressSeekQueueState\(/);
  const sandbox = {
    progressDragState: {
      active: true,
      seekInFlight: true,
      pendingSeek: null,
      seekPromise: Promise.resolve(),
      resumeAfterSeek: true,
      resumePlaybackAfterSeek: true,
    },
  };
  vm.runInNewContext(readFunction(source, 'finishProgressSeekQueueState'), sandbox);
  sandbox.finishProgressSeekQueueState();
  assert.equal(sandbox.progressDragState.seekInFlight, false);
  assert.equal(sandbox.progressDragState.resumeAfterSeek, true);
  assert.equal(sandbox.progressDragState.resumePlaybackAfterSeek, true);
});

test('attemptAudioPlay 会等待 seeking 完成后再调用 audio.play', async () => {
  const source = read('public/js/modules/05-playback/14-player-controls.js');
  const media = createSeekMedia();
  media.currentTime = 18;
  let playCalls = 0;
  media.play = function () {
    playCalls += 1;
    media.paused = false;
    return Promise.resolve();
  };
  const sandbox = {
    Promise,
    console: { warn() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    audio: media,
    playQueue: [],
    currentIdx: -1,
    playbackResumePausedLongEnough: () => false,
    resumePausedAudioFast: async () => false,
    audioGraphHealthy: () => true,
    preparePlaybackFadeIn() {},
    applyAudioOutputDevice: async () => true,
    ensurePlaybackAudioGraph: async () => true,
    completeAudioPlayStart: async () => true,
    restorePlaybackGain() {},
  };
  const requestGuardDeclaration = source.includes('function audioPlayRequestCurrent(')
    ? readFunction(source, 'audioPlayRequestCurrent')
    : 'function audioPlayRequestCurrent(opts) { return !opts.playRequestCurrent || opts.playRequestCurrent(); }';
  vm.runInNewContext([
    readFunction(source, 'waitForAudioSeekCompletion'),
    readFunction(source, 'mediaPlaybackTargetSrc'),
    readFunction(source, 'isSameAudioPlaybackTarget'),
    requestGuardDeclaration,
    readFunction(source, 'attemptAudioPlay'),
  ].join(';'), sandbox);

  const pending = sandbox.attemptAudioPlay({ manual: true, silent: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(playCalls, 0);
  media.emit('seeked');
  assert.equal(await pending, true);
  assert.equal(playCalls, 1);
});

test('等待 seeked 的旧播放请求被新拖动取代后不能启动播放', async () => {
  const playerSource = read('public/js/modules/05-playback/14-player-controls.js');
  const progressSource = read('public/js/modules/06-lyrics/04-progress-seek.js');
  const media = createSeekMedia();
  media.currentTime = 24;
  let playCalls = 0;
  let current = true;
  media.play = function () {
    playCalls += 1;
    return Promise.resolve();
  };
  const sandbox = {
    Promise,
    console: { warn() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    audio: media,
    playQueue: [],
    currentIdx: -1,
    playbackResumePausedLongEnough: () => false,
    resumePausedAudioFast: async () => false,
    audioGraphHealthy: () => true,
    preparePlaybackFadeIn() {},
    applyAudioOutputDevice: async () => true,
    ensurePlaybackAudioGraph: async () => true,
    completeAudioPlayStart: async () => true,
    restorePlaybackGain() {},
  };
  const requestGuardDeclaration = playerSource.includes('function audioPlayRequestCurrent(')
    ? readFunction(playerSource, 'audioPlayRequestCurrent')
    : 'function audioPlayRequestCurrent(opts) { return !opts.playRequestCurrent || opts.playRequestCurrent(); }';
  vm.runInNewContext([
    readFunction(playerSource, 'waitForAudioSeekCompletion'),
    readFunction(playerSource, 'mediaPlaybackTargetSrc'),
    readFunction(playerSource, 'isSameAudioPlaybackTarget'),
    requestGuardDeclaration,
    readFunction(playerSource, 'attemptAudioPlay'),
  ].join(';'), sandbox);

  const pending = sandbox.attemptAudioPlay({
    manual: true,
    silent: true,
    playRequestCurrent: () => current,
  });
  await new Promise((resolve) => setImmediate(resolve));
  current = false;
  media.emit('seeked');
  assert.equal(await pending, false);
  assert.equal(playCalls, 0);
  assert.match(readFunction(progressSource, 'primeProgressSeekPlayback'), /playRequestCurrent/);
});

test('AI 主轨 seeking 时不追副轨，主轨 seeked 后只同步一次', () => {
  const source = read('public/js/modules/05-playback/09-ai-stem-playback.js');
  const main = { currentTime: 42, playbackRate: 1, paused: true, ended: false, seeking: true };
  let secondaryTime = 10;
  let seekWrites = 0;
  const secondary = {
    playbackRate: 1,
    paused: true,
    ended: false,
    seeking: false,
    pause() {},
  };
  Object.defineProperty(secondary, 'currentTime', {
    get() { return secondaryTime; },
    set(value) {
      secondaryTime = value;
      seekWrites += 1;
      secondary.seeking = true;
    },
  });
  const sandbox = { Promise, aiStemSecondarySeekInFlight: false };
  vm.runInNewContext(readFunction(source, 'syncAiStemSecondaryForEvent'), sandbox);

  sandbox.syncAiStemSecondaryForEvent('seeking', main, secondary);
  assert.equal(seekWrites, 0);

  main.seeking = false;
  sandbox.syncAiStemSecondaryForEvent('seeked', main, secondary);
  assert.equal(seekWrites, 1);

  main.currentTime = 43;
  sandbox.syncAiStemSecondaryForEvent('timeupdate', main, secondary);
  assert.equal(seekWrites, 1, '副轨自己的 seek 尚未结束时不能再次追赶');
});

test('AI 副轨已有 seek 时先暂停旧位置，追到最终目标后再播放', () => {
  const source = read('public/js/modules/05-playback/09-ai-stem-playback.js');
  const main = { currentTime: 70, playbackRate: 1, paused: true, ended: false, seeking: true };
  let secondaryTime = 18;
  let seekWrites = 0;
  let playCalls = 0;
  let pauseCalls = 0;
  const secondary = {
    playbackRate: 1,
    paused: false,
    ended: false,
    seeking: true,
    _mineradioAiStemSeekInFlight: true,
    play() { playCalls += 1; this.paused = false; return Promise.resolve(); },
    pause() { pauseCalls += 1; this.paused = true; },
  };
  Object.defineProperty(secondary, 'currentTime', {
    get() { return secondaryTime; },
    set(value) {
      secondaryTime = value;
      seekWrites += 1;
      secondary.seeking = true;
    },
  });
  const sandbox = { Promise };
  vm.runInNewContext(readFunction(source, 'syncAiStemSecondaryForEvent'), sandbox);

  sandbox.syncAiStemSecondaryForEvent('pause', main, secondary);
  assert.equal(pauseCalls, 1, '主轨暂停事件即使在 seeking 中也必须暂停副轨');
  assert.equal(secondary.paused, true);

  main.seeking = false;
  sandbox.syncAiStemSecondaryForEvent('seeked', main, secondary);
  main.paused = false;
  sandbox.syncAiStemSecondaryForEvent('play', main, secondary);
  assert.equal(seekWrites, 0);
  assert.equal(playCalls, 0, '副轨仍在旧 seek 中时不能从旧位置播放');

  secondary.seeking = false;
  sandbox.syncAiStemSecondaryForEvent('timeupdate', main, secondary);
  assert.equal(seekWrites, 1, '旧 seek 完成后应跳到主轨保存的最终目标');
  assert.equal(playCalls, 0);

  secondary.seeking = false;
  sandbox.syncAiStemSecondaryForEvent('timeupdate', main, secondary);
  assert.equal(playCalls, 1, '副轨到达最终目标后才能播放');
});
