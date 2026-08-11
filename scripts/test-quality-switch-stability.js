'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const qualitySource = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/00-api-quality-output.js'), 'utf8');
const playbackSource = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/13-playback-start-audio.js'), 'utf8');
const fallbackSource = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/11-provider-fallback.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/index.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

function createDeferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createHarness() {
  const requests = [];
  const notices = [];
  const resumePositions = [];
  const media = {
    src: 'http://127.0.0.1:4000/api/audio?url=old',
    currentTime: 42,
    duration: 240,
    paused: false,
    ended: false,
    autoplay: true,
    preload: 'auto',
    loadCount: 0,
    pause() { this.paused = true; },
    load() { this.loadCount += 1; },
    get currentSrc() { return this.src; }
  };
  const context = {
    console,
    Promise,
    setTimeout,
    clearTimeout,
    AbortController,
    window: {},
    document: {
      createElement() { return { textContent: '', innerHTML: '' }; },
      getElementById() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    PLAYBACK_QUALITY_OPTIONS: { netease: [], qq: [], kugou: [], qishui: [], spotify: [] },
    PLAYBACK_QUALITY_DEFAULTS: { netease: 'hires', qq: 'lossless', kugou: 'lossless', qishui: 'standard', spotify: 'standard' },
    playbackQualityPrefs: { qq: 'hires' },
    playbackQualityRuntimeCaps: {},
    playbackQuality: 'hires',
    loginStatus: {},
    playQueue: [{ id: 'song-1', mid: 'song-1', mediaMid: 'media-1', name: 'Test', artist: 'Artist', source: 'qq' }],
    currentIdx: 0,
    trackSwitchToken: 7,
    audio: media,
    playing: true,
    songProviderKey(song) { return song && song.source || 'netease'; },
    queueItemKey(song) { return `${song.source}:${song.id}`; },
    hasProviderSvip() { return true; },
    hasPlatformLogin() { return true; },
    showToast() {},
    showSourceFallbackNotice(title, body, opts) { notices.push({ title, body, opts }); },
    forcePlaybackControlsInteractive() {},
    bindPlaybackProgressEvents() {},
    applyVolumeToAudio() {},
    applyAudioOutputDevice() { return Promise.resolve(true); },
    resetPlaybackAudioGraphForSourceSwitch() {},
    applyPlaybackSpeedToAudio() {},
    scheduleAudioResumePosition(target, seconds) {
      resumePositions.push(seconds);
      target.currentTime = seconds;
    },
    updatePlaybackProgressUi() {},
    markStageLyricsPlaybackResume() {},
    qqPlaybackEvidenceQuery() { return ''; },
    qqPlaybackRetryQualities() { return ['exhigh', 'standard']; },
    playAudio() {
      media.paused = false;
      return Promise.resolve(true);
    },
    requests,
    notices,
    resumePositions
  };
  vm.createContext(context);
  vm.runInContext(qualitySource, context, { filename: '00-api-quality-output.js' });
  context.updatePlaybackQualityUi = function () {};
  context.markPlaybackQualityRuntimeCap = function () { return true; };
  context.bindPlaybackProgressEvents = function () {};
  context.applyVolumeToAudio = function () {};
  context.applyAudioOutputDevice = function () { return Promise.resolve(true); };
  context.resetPlaybackAudioGraphForSourceSwitch = function () {};
  context.applyPlaybackSpeedToAudio = function () {};
  context.scheduleAudioResumePosition = function (target, seconds) {
    resumePositions.push(seconds);
    target.currentTime = seconds;
  };
  context.updatePlaybackProgressUi = function () {};
  context.markStageLyricsPlaybackResume = function () {};
  context.playAudio = function () {
    media.paused = false;
    return Promise.resolve(true);
  };
  context.apiJson = function (url) {
    const deferred = createDeferred();
    requests.push({ url, deferred });
    return deferred.promise;
  };
  return { context, media, requests, notices, resumePositions };
}

test('连续选择音质时串行请求并只应用最后一次选择', async () => {
  const harness = createHarness();
  const { context, media, requests, notices, resumePositions } = harness;

  const done = context.applyPlaybackQualityToCurrentTrack('hires', 'qq');
  context.applyPlaybackQualityToCurrentTrack('exhigh', 'qq');
  context.applyPlaybackQualityToCurrentTrack('standard', 'qq');

  assert.equal(requests.length, 1);
  assert.equal(media.src, 'http://127.0.0.1:4000/api/audio?url=old', '新流确认前保留旧流');
  requests[0].deferred.resolve({ url: '', level: '' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 2, '中间选择被覆盖，只请求最后一次选择');
  assert.match(requests[1].url, /quality=standard/);
  assert.doesNotMatch(requests[1].url, /quality=exhigh/);
  requests[1].deferred.resolve({ url: 'https://audio.example/final.mp3', level: 'standard' });
  await done;

  assert.match(media.src, /final\.mp3/);
  assert.equal(resumePositions.at(-1), 42);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].title, '音质已切换');
  assert.equal(notices[0].opts.kind, 'quality-switch');
  assert.equal(notices[0].opts.replace, true);
  assert.equal(context.playbackQualitySwitchState.running, false);
  assert.equal(context.playbackQualitySwitchState.pending, null);
});

test('新音质启动失败时恢复旧流和原播放位置', async () => {
  const harness = createHarness();
  const { context, media, requests, notices, resumePositions } = harness;
  let playAttempt = 0;
  context.playAudio = function () {
    playAttempt += 1;
    if (playAttempt === 1) return Promise.resolve(false);
    media.paused = false;
    return Promise.resolve(true);
  };

  const done = context.applyPlaybackQualityToCurrentTrack('lossless', 'qq');
  requests[0].deferred.resolve({ url: 'https://audio.example/bad.flac', level: 'lossless' });
  await done;

  assert.equal(media.src, 'http://127.0.0.1:4000/api/audio?url=old');
  assert.equal(media.paused, false);
  assert.equal(resumePositions.at(-1), 42);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].title, '音质切换失败');
  assert.match(notices[0].body, /继续播放切换前的音频/);
});

test('音质切换不再走整首切歌或重建歌词舞台', () => {
  const applyStart = qualitySource.indexOf('function applyPlaybackQualityToCurrentTrack(');
  const applyEnd = qualitySource.indexOf('function toggleQualityPanel(', applyStart);
  const applyBlock = qualitySource.slice(applyStart, applyEnd);
  assert.doesNotMatch(applyBlock, /playQueueAt\s*\(/);
  assert.match(applyBlock, /playbackQualitySwitchState\.pending/);
  assert.match(qualitySource, /resetPlaybackAudioGraphForSourceSwitch\('quality-switch'\)/);
  assert.doesNotMatch(qualitySource, /applyPreferredLyricsForCurrent\s*\(/);

  const legacyQualityBranch = playbackSource.slice(
    playbackSource.indexOf("if (qualitySwitch) {", playbackSource.indexOf("markPlayPhase('lyric-prep')")),
    playbackSource.indexOf('} else {', playbackSource.indexOf("if (qualitySwitch) {", playbackSource.indexOf("markPlayPhase('lyric-prep')")))
  );
  assert.doesNotMatch(legacyQualityBranch, /applyPreferredLyricsForCurrent/);
  assert.match(playbackSource, /if \(!qualitySwitch\) finalizeListenSession/);
  assert.match(playbackSource, /if \(!qualitySwitch\) beginListenSession/);
});

test('音质通知使用单卡替换，控制栏给音质和点赞留出间距', () => {
  assert.match(fallbackSource, /opts\.kind && opts\.replace/);
  assert.match(fallbackSource, /existing\.dataset\.noticeKind === opts\.kind/);
  assert.match(css, /\.control-cluster\.actions\s*\{[^}]*column-gap:\s*16px/s);
  assert.match(css, /\.control-cluster\.actions #quality-control\s*\{[^}]*margin-left:\s*0;[^}]*margin-right:\s*2px/s);
  assert.match(css, /\.control-cluster\.actions #quality-btn\s*\{[^}]*min-width:\s*64px/s);
  assert.match(css, /desktop-fullscreen \.quality-control[^}]*\{[^}]*width:\s*66px/s);
});

test('音质选择在简约和窄窗口 DIY 播放器中始终保留可见入口', () => {
  assert.match(index, /id="quality-control"[\s\S]*?id="quality-btn"/, '底栏必须保留可操作的音质按钮');
  assert.doesNotMatch(css, /body\.simple-mode #quality-control,[\s\S]*?display:\s*none\s*!important/, '简约模式不能把音质入口直接隐藏');
  assert.doesNotMatch(css, /@media \(max-width:1180px\)\s*\{[\s\S]*?body\.diy-mode #quality-control\s*\{\s*display:\s*none\s*!important/, '窄窗口 DIY 模式也必须保留音质入口');
});
