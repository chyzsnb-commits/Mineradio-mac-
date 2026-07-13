const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

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

test('播放进度定时器只为当前正在播放的媒体运行', () => {
  const source = read('public/js/modules/06-lyrics/04-progress-seek.js');
  const names = [
    'shouldRunPlaybackProgressTimer',
    'stopPlaybackProgressTimer',
    'runPlaybackProgressTimerTick',
    'startPlaybackProgressTimer',
    'syncPlaybackProgressTimerForEvent',
  ];
  let nextTimerId = 1;
  const timers = new Map();
  const counts = { stats: 0, ui: 0, snapshot: 0 };
  const sandbox = {
    PLAYBACK_PROGRESS_TICK_MS: 200,
    playbackProgressTimer: 0,
    playbackProgressTimerMedia: null,
    audio: null,
    setTimeout(fn, delay) {
      const id = nextTimerId++;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    updateListenStatsTick() { counts.stats += 1; },
    updatePlaybackProgressUi() { counts.ui += 1; },
    saveLastPlaybackSnapshot() { counts.snapshot += 1; },
  };
  vm.runInNewContext(names.map((name) => readFunction(source, name)).join(';'), sandbox);

  const first = { src: 'first', paused: false, ended: false };
  sandbox.audio = first;
  vm.runInNewContext('syncPlaybackProgressTimerForEvent(firstMedia, "play")', Object.assign(sandbox, { firstMedia: first }));
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 200);

  const firstTick = [...timers.entries()][0];
  timers.delete(firstTick[0]);
  firstTick[1].fn();
  assert.deepEqual(counts, { stats: 1, ui: 1, snapshot: 1 });
  assert.equal(timers.size, 1, '播放中应安排下一次进度更新');

  first.paused = true;
  vm.runInNewContext('syncPlaybackProgressTimerForEvent(firstMedia, "pause")', sandbox);
  assert.equal(timers.size, 0, '暂停后不得保留进度定时器');

  const second = { src: 'second', paused: false, ended: false };
  sandbox.audio = second;
  sandbox.secondMedia = second;
  vm.runInNewContext('syncPlaybackProgressTimerForEvent(secondMedia, "playing")', sandbox);
  assert.equal(timers.size, 1);
  vm.runInNewContext('syncPlaybackProgressTimerForEvent(firstMedia, "pause")', sandbox);
  assert.equal(timers.size, 1, '旧媒体的迟到暂停事件不得停止当前媒体定时器');
});

test('播放进度不再使用页面启动后永久运行的 200ms interval', () => {
  const source = read('public/js/modules/06-lyrics/04-progress-seek.js');
  assert.doesNotMatch(source, /setInterval\(function \(\) \{[\s\S]*?\}, 200\)/);
  assert.match(source, /syncPlaybackProgressTimerForEvent\(audioEl, name\)/);
});

test('已经播放的预载媒体在绑定时立即接管进度定时器', () => {
  const source = read('public/js/modules/06-lyrics/04-progress-seek.js');
  const names = [
    'shouldRunPlaybackProgressTimer',
    'stopPlaybackProgressTimer',
    'runPlaybackProgressTimerTick',
    'startPlaybackProgressTimer',
    'syncPlaybackProgressTimerForCurrentMedia',
    'syncPlaybackProgressTimerForEvent',
    'bindPlaybackProgressEvents',
  ];
  let nextTimerId = 1;
  const timers = new Map();
  const gaplessEvents = [];
  const listeners = new Map();
  const media = {
    src: 'preloaded',
    paused: false,
    ended: false,
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
  };
  const sandbox = {
    PLAYBACK_PROGRESS_TICK_MS: 200,
    playbackProgressTimer: 0,
    playbackProgressTimerMedia: null,
    audio: media,
    media,
    setTimeout(fn, delay) {
      const id = nextTimerId++;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    updateListenStatsTick() {},
    updatePlaybackProgressUi() {},
    saveLastPlaybackSnapshot() {},
    syncPlaybackStateFromAudioEvent() {},
    syncAlbumGaplessMonitorForPlaybackEvent(_media, name) { gaplessEvents.push(name); },
  };
  vm.runInNewContext(names.map((name) => readFunction(source, name)).join(';'), sandbox);
  vm.runInNewContext('bindPlaybackProgressEvents(media)', sandbox);
  assert.equal(timers.size, 1, '已播放的预载媒体不依赖新的 play 事件也要启动进度更新');
  assert.equal([...timers.values()][0].delay, 200);

  function emit(name) {
    (listeners.get(name) || []).forEach((fn) => fn());
  }
  media.paused = true;
  emit('pause');
  assert.equal(timers.size, 0);
  media.paused = false;
  emit('play');
  assert.equal(timers.size, 1);
  emit('seeked');
  assert.deepEqual(gaplessEvents, ['pause', 'play', 'seeked']);
});

test('无缝连播只在最后 9 秒且正在播放时高频检查', () => {
  const source = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const sandbox = {
    audio: { paused: false, ended: false },
    ALBUM_GAPLESS_MONITOR_TAIL_SECONDS: 9,
    ALBUM_GAPLESS_MONITOR_IDLE_MS: 1000,
    ALBUM_GAPLESS_MONITOR_TAIL_MS: 70,
    isFinite,
  };
  vm.runInNewContext(readFunction(source, 'albumGaplessMonitorDelay'), sandbox);
  vm.runInNewContext('middleDelay = albumGaplessMonitorDelay(120); tailDelay = albumGaplessMonitorDelay(9);', sandbox);
  assert.equal(sandbox.middleDelay, 1000);
  assert.equal(sandbox.tailDelay, 70);
  sandbox.audio.paused = true;
  vm.runInNewContext('pausedTailDelay = albumGaplessMonitorDelay(2);', sandbox);
  assert.equal(sandbox.pausedTailDelay, 1000);
  sandbox.audio.paused = false;
  sandbox.audio.ended = true;
  vm.runInNewContext('endedTailDelay = albumGaplessMonitorDelay(2);', sandbox);
  assert.equal(sandbox.endedTailDelay, 1000);
});

test('无缝连播监视改用可变频递归 timeout', () => {
  const source = read('public/js/modules/05-playback/13-playback-start-audio.js');
  assert.doesNotMatch(source, /albumGaplessState\.monitorTimer\s*=\s*setInterval/);
  assert.match(readFunction(source, 'scheduleAlbumGaplessMonitor'), /setTimeout/);
  assert.match(readFunction(source, 'runAlbumGaplessMonitorTick'), /albumGaplessMonitorDelay\(remaining\)/);
});

test('尾段暂停恢复和 seek 会立即重排无缝连播监视器', () => {
  const source = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const names = [
    'albumGaplessMonitorDelay',
    'scheduleAlbumGaplessMonitor',
    'armAlbumGaplessMonitor',
    'syncAlbumGaplessMonitorForPlaybackEvent',
  ];
  let nextTimerId = 1;
  const timers = new Map();
  const media = { paused: true, ended: false, duration: 180, currentTime: 179.5 };
  const sandbox = {
    audio: media,
    media,
    oldMedia: { paused: false, ended: false, duration: 180, currentTime: 179.5 },
    albumGaplessState: { preload: { media: {} }, monitorTimer: 0 },
    trackSwitchToken: 7,
    ALBUM_GAPLESS_MONITOR_TAIL_SECONDS: 9,
    ALBUM_GAPLESS_MONITOR_IDLE_MS: 1000,
    ALBUM_GAPLESS_MONITOR_TAIL_MS: 70,
    isFinite,
    setTimeout(fn, delay) {
      const id = nextTimerId++;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    runAlbumGaplessMonitorTick() { return 0; },
  };
  vm.runInNewContext(names.map((name) => readFunction(source, name)).join(';'), sandbox);

  vm.runInNewContext('syncAlbumGaplessMonitorForPlaybackEvent(media, "pause")', sandbox);
  assert.equal([...timers.values()][0].delay, 1000);
  media.paused = false;
  vm.runInNewContext('syncAlbumGaplessMonitorForPlaybackEvent(media, "play")', sandbox);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 70, '剩余 0.5 秒恢复时必须立即切回尾段频率');

  media.currentTime = 60;
  vm.runInNewContext('syncAlbumGaplessMonitorForPlaybackEvent(media, "seeked")', sandbox);
  assert.equal([...timers.values()][0].delay, 1000);
  vm.runInNewContext('oldResult = syncAlbumGaplessMonitorForPlaybackEvent(oldMedia, "play")', sandbox);
  assert.equal(sandbox.oldResult, false);
  assert.equal([...timers.values()][0].delay, 1000, '旧媒体事件不得重排当前无缝监视器');
});
