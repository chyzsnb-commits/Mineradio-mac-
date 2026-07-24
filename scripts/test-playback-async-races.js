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
  };
  vm.runInNewContext(`${readFunction(source, 'pauseCurrentAudioForTrackSwitch')}; pauseCurrentAudioForTrackSwitch();`, sandbox);

  assert.deepEqual(calls.slice(0, 4), ['clear-fade', 'pause', 'remove:src', 'load']);
  assert.equal(sandbox.audio.src, '');
  assert.equal(sandbox.audio.currentSrc, '');
  assert.equal(sandbox.playing, false);
});

test('旧切歌任务不能清掉较新的音源', () => {
  const source = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const calls = [];
  const sandbox = {
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
  };
  vm.runInNewContext(readFunction(source, 'clearFailedPlaybackAudioSource'), sandbox);
  assert.equal(vm.runInNewContext('clearFailedPlaybackAudioSource(8)', sandbox), false);
  assert.equal(sandbox.audio.src, 'new-song');
  assert.equal(vm.runInNewContext('clearFailedPlaybackAudioSource(9)', sandbox), true);
  assert.equal(sandbox.audio.src, '');
  assert.deepEqual(calls, ['pause', 'remove', 'load']);
});

test('慢网络中快速点五次下一首会合并到最终目标且不并发', async () => {
  const source = read('public/js/modules/05-playback/14-player-controls.js');
  const calls = [];
  const releases = [];
  const sandbox = {
    Promise,
    console: { warn() {} },
    playQueue: Array.from({ length: 8 }, (_, index) => ({ id: index })),
    currentIdx: 0,
    playMode: 'list',
    playToggleBusy: false,
    trackNavigationState: { inProgress: false, pendingDelta: 0, manual: false, promise: null },
    forcePlaybackControlsInteractive() {},
    playQueueAt(index) {
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

  const pending = [
    sandbox.nextTrack(true),
    sandbox.nextTrack(true),
    sandbox.nextTrack(true),
    sandbox.nextTrack(true),
    sandbox.nextTrack(true),
  ];
  assert.deepEqual(calls, [1]);
  assert.equal(sandbox.trackNavigationState.pendingDelta, 4);

  releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [1, 5]);
  assert.equal(releases.length, 1);

  releases.shift()();
  await Promise.all(pending);
  assert.equal(sandbox.currentIdx, 5);
  assert.equal(sandbox.trackNavigationState.inProgress, false);
  assert.equal(sandbox.trackNavigationState.pendingDelta, 0);
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
