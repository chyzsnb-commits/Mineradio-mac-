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
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

function audioGraphSource() {
  return read('public/js/modules/05-playback/08-audio-graph-controls.js');
}

test('原唱 100% 直连分析器且 99% 才创建去人声链', () => {
  const source = audioGraphSource();
  const directSource = { connections: [], connect(node) { this.connections.push(node); } };
  const analyser = { name: 'analyser' };
  const chainInput = { name: 'chain-input' };
  const chainOutput = { connections: [], connect(node) { this.connections.push(node); } };
  let buildCount = 0;
  const sandbox = {
    singingModeEnabled: true,
    singingVocalLevel: 1,
    vocalCutChain: { stale: true },
    buildVocalCutChain() {
      buildCount += 1;
      return { input: chainInput, output: chainOutput, setLevel() {} };
    },
    connectSingingKeyShiftOutput(ctx, inputNode, outputNodes) {
      outputNodes.forEach((node) => inputNode.connect(node));
    },
  };
  vm.runInNewContext(
    `${readFunction(source, 'singingVocalProcessingNeeded')};`
      + `${readFunction(source, 'connectSingingPlaybackGraph')};`
      + 'connectSingingPlaybackGraph({}, playbackSource, outputAnalyser, false);',
    { ...sandbox, playbackSource: directSource, outputAnalyser: analyser },
  );
  assert.equal(buildCount, 0);
  assert.deepEqual(directSource.connections, [analyser]);

  directSource.connections.length = 0;
  const processingSandbox = {
    ...sandbox,
    singingVocalLevel: 0.99,
    playbackSource: directSource,
    outputAnalyser: analyser,
  };
  vm.runInNewContext(
    `${readFunction(source, 'singingVocalProcessingNeeded')};`
      + `${readFunction(source, 'connectSingingPlaybackGraph')};`
      + 'connectSingingPlaybackGraph({}, playbackSource, outputAnalyser, false);',
    processingSandbox,
  );
  assert.equal(buildCount, 1);
  assert.deepEqual(directSource.connections, [chainInput]);
  assert.deepEqual(chainOutput.connections, [analyser]);
});

test('原唱滑块只在跨越 100% 边界时重建音频图', async () => {
  const source = audioGraphSource();
  let rebuildCount = 0;
  let workletLoadCount = 0;
  const sandbox = {
    singingModeEnabled: true,
    singingVocalLevel: 1,
    vocalCutChain: null,
    audioCtx: {},
    parseFloat,
    isNaN,
    syncSingingVocalUi() {},
    showToast() {},
    rebuildAudioGraphNow() { rebuildCount += 1; },
    ensureVocalRemoverWorklet() { workletLoadCount += 1; return Promise.resolve(true); },
    vocalRemoverWorkletReady() { return false; },
  };
  vm.runInNewContext(
    `${readFunction(source, 'singingVocalProcessingNeeded')};\n`
      + `${readFunction(source, 'prepareSingingVocalProcessor')};\n`
      + `${readFunction(source, 'setSingingVocalLevel')};`,
    sandbox,
  );

  await vm.runInNewContext('setSingingVocalLevel(0.99, { silent: true }); Promise.resolve();', sandbox);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(workletLoadCount, 1);
  assert.equal(rebuildCount, 2, '先切到回退链，Worklet 就绪后再切一次');

  vm.runInNewContext('setSingingVocalLevel(0.5, { silent: true });', sandbox);
  assert.equal(rebuildCount, 2, '低于 100% 的普通调节不重建');

  vm.runInNewContext('setSingingVocalLevel(1, { silent: true });', sandbox);
  assert.equal(rebuildCount, 3, '回到 100% 时移除去人声链');
});

test('麦克风只在唱歌模式播放前台运行', () => {
  const source = audioGraphSource();
  const state = { deep: false };
  const sandbox = {
    singingModeEnabled: true,
    audio: { src: 'song.mp3', paused: false, ended: false, error: null },
    isDeepBackgroundMode() { return state.deep; },
  };
  vm.runInNewContext(`${readFunction(source, 'singingMicShouldRun')}; result = singingMicShouldRun();`, sandbox);
  assert.equal(sandbox.result, true);

  sandbox.audio.paused = true;
  vm.runInNewContext('result = singingMicShouldRun();', sandbox);
  assert.equal(sandbox.result, false);
  sandbox.audio.paused = false;
  sandbox.audio.src = '';
  vm.runInNewContext('result = singingMicShouldRun();', sandbox);
  assert.equal(sandbox.result, false);
  sandbox.audio.src = 'song.mp3';
  state.deep = true;
  vm.runInNewContext('result = singingMicShouldRun();', sandbox);
  assert.equal(sandbox.result, false);
});

test('并发播放事件只申请一次麦克风且暂停后丢弃过期流', async () => {
  const source = audioGraphSource();
  let resolveMedia;
  let requestCount = 0;
  let stopped = 0;
  let rebuildCount = 0;
  const mediaPromise = new Promise((resolve) => { resolveMedia = resolve; });
  const sandbox = {
    singingModeEnabled: true,
    audio: { src: 'song.mp3', paused: false, ended: false, error: null },
    micStream: null,
    micSource: null,
    micVisualNode: null,
    _singingMicRequestPromise: null,
    _singingMicRequestSerial: 0,
    _singingMicPermissionBlocked: false,
    isDeepBackgroundMode() { return false; },
    navigator: {
      mediaDevices: {
        getUserMedia() { requestCount += 1; return mediaPromise; },
      },
    },
    rebuildAudioGraphNow() { rebuildCount += 1; },
    showToast() {},
    Promise,
  };
  vm.runInNewContext(
    `${readFunction(source, 'singingMicShouldRun')};`
      + `${readFunction(source, 'singingMicPermissionDenied')};`
      + `${readFunction(source, 'stopMediaStreamTracks')};`
      + `${readFunction(source, 'stopSingingMic')};`
      + `${readFunction(source, 'startSingingMic')};`
      + `${readFunction(source, 'syncSingingMicPowerState')};`,
    sandbox,
  );

  const first = vm.runInNewContext('syncSingingMicPowerState({ silent: true });', sandbox);
  const second = vm.runInNewContext('syncSingingMicPowerState({ silent: true });', sandbox);
  assert.equal(requestCount, 1);
  assert.equal(first, second);

  sandbox.audio.paused = true;
  vm.runInNewContext('syncSingingMicPowerState({ silent: true });', sandbox);
  resolveMedia({ getTracks() { return [{ stop() { stopped += 1; } }]; } });
  await first;
  assert.equal(stopped, 1);
  assert.equal(sandbox.micStream, null);
  assert.equal(rebuildCount, 0);
});

test('麦克风请求期间快速暂停恢复仍只保留一个请求', async () => {
  const source = audioGraphSource();
  let resolveMedia;
  let requestCount = 0;
  let rebuildCount = 0;
  const mediaPromise = new Promise((resolve) => { resolveMedia = resolve; });
  const stream = { getTracks() { return [{ stop() {} }]; } };
  const sandbox = {
    singingModeEnabled: true,
    audio: { src: 'song.mp3', paused: false, ended: false, error: null },
    micStream: null,
    micSource: null,
    micVisualNode: null,
    _singingMicRequestPromise: null,
    _singingMicRequestSerial: 0,
    _singingMicPermissionBlocked: false,
    isDeepBackgroundMode() { return false; },
    navigator: { mediaDevices: { getUserMedia() { requestCount += 1; return mediaPromise; } } },
    rebuildAudioGraphNow() { rebuildCount += 1; },
    showToast() {},
    Promise,
  };
  vm.runInNewContext(
    `${readFunction(source, 'singingMicShouldRun')};`
      + `${readFunction(source, 'singingMicPermissionDenied')};`
      + `${readFunction(source, 'stopMediaStreamTracks')};`
      + `${readFunction(source, 'stopSingingMic')};`
      + `${readFunction(source, 'startSingingMic')};`
      + `${readFunction(source, 'syncSingingMicPowerState')};`,
    sandbox,
  );
  const first = vm.runInNewContext('syncSingingMicPowerState({ silent: true });', sandbox);
  sandbox.audio.paused = true;
  vm.runInNewContext('syncSingingMicPowerState({ silent: true });', sandbox);
  sandbox.audio.paused = false;
  const resumed = vm.runInNewContext('syncSingingMicPowerState({ silent: true });', sandbox);
  assert.equal(requestCount, 1);
  assert.equal(resumed, first);
  resolveMedia(stream);
  assert.equal(await resumed, true);
  assert.equal(sandbox.micStream, stream);
  assert.equal(rebuildCount, 1);
});

test('麦克风权限失败后本次开启期间不重复申请', async () => {
  const source = audioGraphSource();
  let requestCount = 0;
  const sandbox = {
    singingModeEnabled: true,
    audio: { src: 'song.mp3', paused: false, ended: false, error: null },
    micStream: null,
    micSource: null,
    micVisualNode: null,
    _singingMicRequestPromise: null,
    _singingMicRequestSerial: 0,
    _singingMicPermissionBlocked: false,
    isDeepBackgroundMode() { return false; },
    navigator: { mediaDevices: { getUserMedia() { requestCount += 1; return Promise.reject(new Error('denied')); } } },
    rebuildAudioGraphNow() {},
    showToast() {},
    Promise,
  };
  vm.runInNewContext(
    `${readFunction(source, 'singingMicShouldRun')};`
      + `${readFunction(source, 'singingMicPermissionDenied')};`
      + `${readFunction(source, 'stopMediaStreamTracks')};`
      + `${readFunction(source, 'stopSingingMic')};`
      + `${readFunction(source, 'startSingingMic')};`
      + `${readFunction(source, 'syncSingingMicPowerState')};`,
    sandbox,
  );
  await vm.runInNewContext('syncSingingMicPowerState({ silent: true });', sandbox);
  await vm.runInNewContext('syncSingingMicPowerState({ silent: true });', sandbox);
  assert.equal(requestCount, 1);
  assert.equal(sandbox._singingMicPermissionBlocked, true);
  assert.match(source, /function setSingingMode[\s\S]*_singingMicPermissionBlocked = false/);
});

test('麦克风临时设备错误不会锁死后续重试', async () => {
  const source = audioGraphSource();
  let requestCount = 0;
  const sandbox = {
    singingModeEnabled: true,
    audio: { src: 'song.mp3', paused: false, ended: false, error: null },
    micStream: null,
    micSource: null,
    micVisualNode: null,
    _singingMicRequestPromise: null,
    _singingMicRequestSerial: 0,
    _singingMicPermissionBlocked: false,
    isDeepBackgroundMode() { return false; },
    navigator: {
      mediaDevices: {
        getUserMedia() {
          requestCount += 1;
          const error = new Error('device busy');
          error.name = 'NotReadableError';
          return Promise.reject(error);
        },
      },
    },
    rebuildAudioGraphNow() {},
    showToast() {},
    console: { warn() {} },
    Promise,
  };
  vm.runInNewContext(
    `${readFunction(source, 'singingMicShouldRun')};`
      + `${readFunction(source, 'singingMicPermissionDenied')};`
      + `${readFunction(source, 'stopMediaStreamTracks')};`
      + `${readFunction(source, 'stopSingingMic')};`
      + `${readFunction(source, 'startSingingMic')};`
      + `${readFunction(source, 'syncSingingMicPowerState')};`,
    sandbox,
  );
  await vm.runInNewContext('syncSingingMicPowerState({ silent: true });', sandbox);
  assert.equal(requestCount, 1);
  assert.equal(sandbox._singingMicPermissionBlocked, false);
});

test('不同 AudioContext 的 Worklet 逆序完成也分别保持就绪', async () => {
  const source = audioGraphSource();
  let resolveA;
  let resolveB;
  const ctxA = { audioWorklet: { addModule() { return new Promise((resolve) => { resolveA = resolve; }); } } };
  const ctxB = { audioWorklet: { addModule() { return new Promise((resolve) => { resolveB = resolve; }); } } };
  const sandbox = {
    _vocalWorkletCtx: null,
    _vocalWorkletPromise: null,
    _vocalWorkletReadyContexts: new WeakSet(),
    _vocalWorkletPromisesByContext: new WeakMap(),
    VOCAL_REMOVER_PROCESSOR_SRC: 'registerProcessor("test", class {});',
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    Blob: class {},
    console: { warn() {} },
    Promise,
  };
  vm.runInNewContext(
    `${readFunction(source, 'vocalRemoverWorkletReady')};`
      + `${readFunction(source, 'ensureVocalRemoverWorklet')};`,
    sandbox,
  );
  sandbox.ctxA = ctxA;
  sandbox.ctxB = ctxB;
  const promiseA = vm.runInNewContext('ensureVocalRemoverWorklet(ctxA)', sandbox);
  const promiseB = vm.runInNewContext('ensureVocalRemoverWorklet(ctxB)', sandbox);
  resolveB();
  await promiseB;
  resolveA();
  await promiseA;
  vm.runInNewContext('readyA = vocalRemoverWorkletReady(ctxA); readyB = vocalRemoverWorkletReady(ctxB);', sandbox);
  assert.equal(sandbox.readyA, true);
  assert.equal(sandbox.readyB, true);
});

test('开关唱歌模式始终重建播放音频图，确保去人声链与麦克风接线生效', () => {
  const source = audioGraphSource();
  let rebuildCount = 0;
  const toasts = [];
  const sandbox = {
    singingModeEnabled: false,
    singingVocalLevel: 1,
    singingAccompanimentLevel: 1,
    _singingMicPermissionBlocked: false,
    rebuildAudioGraphNow() { rebuildCount += 1; },
    syncSingingMicPowerState() { return Promise.resolve(false); },
    stopSingingMic() {},
    ensureSingingLyrics() {},
    syncSingingModeUi() {},
    prepareSingingVocalProcessor() {},
    prepareSingingKeyShiftProcessor() {},
    singingKeyShiftProcessingNeeded() { return false; },
    _singingKeyShiftChangeSerial: 0,
    singingMicShouldRun() { return false; },
    showToast(message) { toasts.push(message); },
    Promise,
    Number,
    isFinite,
  };
  vm.runInNewContext(
    `${readFunction(source, 'singingVocalProcessingNeeded')};`
      + `${readFunction(source, 'setSingingMode')};`,
    sandbox,
  );
  vm.runInNewContext('setSingingMode(true); setSingingMode(false);', sandbox);
  // 开/关各重建一次：避免“模式已开但音频图仍是旧接线”导致去人声/开麦不生效。
  assert.equal(rebuildCount, 2);
  assert.equal(toasts[0], '唱歌模式:伴奏人声混音已开启,正在开麦…');
  assert.doesNotMatch(source, /播放后自动开麦/);
});

test('播放状态和窗口电源状态都会同步麦克风生命周期', () => {
  const playback = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const power = read('public/js/modules/00-state/08-desktop-render-power.js');
  const audioGraph = audioGraphSource();
  assert.match(playback, /function syncPlaybackStateFromAudioEvent[\s\S]*syncSingingMicPowerState/);
  assert.match(playback, /function syncPlaybackStateFromAudioEvent[\s\S]*prepareSingingVocalProcessor/);
  assert.match(power, /function updateRenderPowerClasses[\s\S]*syncSingingMicPowerState/);
  assert.match(audioGraph, /function setSingingMode[\s\S]*syncSingingMicPowerState/);
});
