'use strict';

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

test('audioGraphHealthy 在需要去人声但链缺失时返回 false', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const sandbox = {
    audio: {},
    audioReady: true,
    audioCtx: { state: 'running' },
    source: {},
    analyser: {},
    beatAnalyser: {},
    gainNode: {},
    analysisSinkNode: null,
    vocalCutChain: null,
    singingModeEnabled: true,
    singingVocalLevel: 0,
    singingAccompanimentLevel: 1,
    singingKeyShift: 0,
    singingKeyShiftNode: null,
    aiStemVocalSource: null,
    aiStemMixNode: null,
    aiStemAccompanimentGain: null,
    aiStemVocalGain: null,
    aiStemPlaybackActive() { return false; },
    singingKeyShiftProcessingNeeded() { return false; },
    singingKeyShiftWorkletReady() { return false; },
    isFinite,
    Number,
  };
  vm.runInNewContext(
    `${readFunction(source, 'singingVocalProcessingNeeded')};`
      + `${readFunction(source, 'audioGraphHealthy')};`
      + 'result = audioGraphHealthy();',
    sandbox,
  );
  assert.equal(sandbox.result, false, '需要去人声且 vocalCutChain 缺失 → 不健康');

  sandbox.vocalCutChain = { input: {}, output: {} };
  vm.runInNewContext('result = audioGraphHealthy();', sandbox);
  assert.equal(sandbox.result, true, '挂上 vocalCutChain 后健康');

  sandbox.vocalCutChain = null;
  sandbox.source.__mineradioUsesCapture = true;
  vm.runInNewContext('result = audioGraphHealthy();', sandbox);
  assert.equal(sandbox.result, true, '捕获流回退路径不要求去人声链');
});

test('开启/关闭唱歌模式都会强制 rebuildAudioGraphNow', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  let rebuildCount = 0;
  const sandbox = {
    singingModeEnabled: false,
    singingMicEnabled: false,
    singingVocalLevel: 0,
    singingAccompanimentLevel: 1,
    singingKeyShift: 0,
    _singingKeyShiftChangeSerial: 0,
    _singingMicPermissionBlocked: true,
    isFinite,
    Number,
    singingVocalProcessingNeeded() {
      return !!(sandbox.singingModeEnabled && (sandbox.singingVocalLevel < 1 || sandbox.singingAccompanimentLevel < 1));
    },
    singingKeyShiftProcessingNeeded() { return false; },
    rebuildAudioGraphNow() { rebuildCount += 1; },
    prepareSingingVocalProcessor() {},
    prepareSingingKeyShiftProcessor() {},
    syncSingingMicPowerState() { return Promise.resolve(true); },
    ensureSingingLyrics() {},
    stopSingingMic() {},
    setAiStemMode() {},
    syncSingingModeUi() {},
    showToast() {},
  };
  vm.runInNewContext(
    `${readFunction(source, 'setSingingMode')};`
      + 'setSingingMode(true); setSingingMode(false);',
    sandbox,
  );
  assert.equal(rebuildCount, 2, '开一次 + 关一次各强制重建一次');
  assert.equal(sandbox.singingModeEnabled, false);
  assert.equal(sandbox._singingMicPermissionBlocked, false, '开启时重置麦克风权限阻断标记');
});

test('setSingingMode 源码不再依赖处理边界判断才重建', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const fn = readFunction(source, 'setSingingMode');
  assert.match(fn, /rebuildAudioGraphNow\(\)/);
  assert.doesNotMatch(fn, /wasVocalProcessing !== needsVocalProcessing/);
});
