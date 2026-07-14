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
