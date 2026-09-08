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
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`${name} 函数未闭合`);
}

test('整队失败计数只在当前歌曲确认播放后清零', () => {
  const source = read('public/js/modules/05-playback/11-provider-fallback.js');
  let scheduledSnapshot = null;
  const snapshots = [];
  const sandbox = {
    playbackSkipCascade: 3,
    trackSwitchToken: 7,
    currentIdx: 2,
    audio: { paused: false, ended: false },
    setTimeout(fn, delay) { scheduledSnapshot = { fn, delay }; return 1; },
    saveLastPlaybackSnapshot(force, reason) { snapshots.push([force, reason]); },
  };
  vm.runInNewContext([
    readFunction(source, 'resetPlaybackSkipCascade'),
    readFunction(source, 'confirmQueuePlaybackStarted'),
  ].join(';'), sandbox);

  assert.equal(vm.runInNewContext('confirmQueuePlaybackStarted(2, 7)', sandbox), true);
  assert.equal(sandbox.playbackSkipCascade, 0);
  assert.equal(scheduledSnapshot.delay, 80);
  scheduledSnapshot.fn();
  assert.deepEqual(snapshots, [[true, 'track-started']]);

  sandbox.playbackSkipCascade = 3;
  sandbox.audio.paused = true;
  assert.equal(vm.runInNewContext('confirmQueuePlaybackStarted(2, 7)', sandbox), false);
  assert.equal(sandbox.playbackSkipCascade, 3, '播放失败或仍暂停时不能清零');

  sandbox.audio.paused = false;
  assert.equal(vm.runInNewContext('confirmQueuePlaybackStarted(2, 6)', sandbox), false);
  assert.equal(sandbox.playbackSkipCascade, 3, '旧切歌任务的迟到结果不能清零');

  assert.equal(vm.runInNewContext('confirmQueuePlaybackStarted(1, 7)', sandbox), false);
  assert.equal(sandbox.playbackSkipCascade, 3, '非当前歌曲不能清零');
});

test('拿到音频地址时不再提前清零，远程和本地播放成功路径都会确认', () => {
  const source = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const urlReady = source.indexOf('if (!data.url)');
  const audioElement = source.indexOf("markPlayPhase('audio-element')", urlReady);
  const earlyReset = source.indexOf('resetPlaybackSkipCascade()', urlReady);

  assert.ok(urlReady >= 0 && audioElement > urlReady, '缺少远程音频地址处理路径');
  assert.ok(earlyReset < 0 || earlyReset > audioElement, '拿到 URL 后、播放前不得清零');

  const confirmations = source.match(/confirmQueuePlaybackStarted\(idx, token\)/g) || [];
  assert.equal(confirmations.length, 2, '本地和远程播放成功路径都应确认并清零');
});

test('手动点歌自动换源最多一次，失败后不继续跳整队', async () => {
  const source = read('public/js/modules/05-playback/11-provider-fallback.js');
  const calls = { skip: 0, failed: 0, unavailable: 0 };
  const sandbox = {
    calls,
    console: { warn() {} },
    _playbackFailExceeded() { return false; },
    _recordPlaybackFail() { return 1; },
    markQueueItemPlaybackFailed() { calls.failed += 1; },
    handlePlaybackUnavailable() { calls.unavailable += 1; },
    skipFailedQueueItem() { calls.skip += 1; },
  };
  const fallbackFunction = readFunction(source, 'tryAutoPlaybackFallback').replace(/^function /, 'async function ');
  vm.runInNewContext(`${readFunction(source, 'playbackFallbackOutcome')}; ${fallbackFunction};`, sandbox);

  await vm.runInNewContext("tryAutoPlaybackFallback({ name: '测试歌曲' }, { url: '' }, 0, 1, { fallbackDepth: 1, startupAutoplay: false })", sandbox);
  assert.deepEqual(calls, { skip: 0, failed: 1, unavailable: 1 }, '手动点歌的替代源失败后必须停住');

  calls.skip = calls.failed = calls.unavailable = 0;
  await vm.runInNewContext("tryAutoPlaybackFallback({ name: '测试歌曲' }, { url: '' }, 0, 1, { fallbackDepth: 1, startupAutoplay: true })", sandbox);
  assert.deepEqual(calls, { skip: 1, failed: 0, unavailable: 0 }, '只有启动自动续播可以继续扫描队列');
});
