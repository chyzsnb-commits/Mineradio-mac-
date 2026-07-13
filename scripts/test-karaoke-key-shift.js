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

test('唱歌面板提供左右对称的降 Key、原调和升 Key 控件', () => {
  const html = read('public/index.html');
  const css = read('public/css/index.css');
  assert.match(html, /id="singing-key-shift"[\s\S]*data-singing-key-step="-1"[\s\S]*id="singing-key-value"[^>]*>0 Key<[\s\S]*data-singing-key-step="1"/);
  assert.match(css, /\.singing-key-control\s*\{[\s\S]*grid-template-columns:\s*32px minmax\(0,\s*1fr\) 32px/);
});

test('Key 只允许 -6 到 +6 的整数', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const sandbox = { Math, Number, isFinite };
  vm.runInNewContext(`${readFunction(source, 'normalizeSingingKeyShift')};`, sandbox);
  for (const [input, expected] of [[-20, -6], [-5.6, -6], [-2.2, -2], [0, 0], [2.6, 3], [20, 6], ['x', 0]]) {
    sandbox.input = input;
    vm.runInNewContext('result = normalizeSingingKeyShift(input);', sandbox);
    assert.equal(sandbox.result, expected);
  }
});

test('0 Key 旁路，非 0 Key 才需要实时变调', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const sandbox = { singingModeEnabled: true, singingKeyShift: 0, Number, isFinite };
  vm.runInNewContext(`${readFunction(source, 'normalizeSingingKeyShift')};${readFunction(source, 'effectiveSingingKeyShift')};${readFunction(source, 'singingKeyShiftProcessingNeeded')};`, sandbox);
  vm.runInNewContext('original = singingKeyShiftProcessingNeeded();', sandbox);
  assert.equal(sandbox.original, false);
  sandbox.singingKeyShift = -3;
  vm.runInNewContext('lowered = singingKeyShiftProcessingNeeded();', sandbox);
  assert.equal(sandbox.lowered, true);
  sandbox.singingModeEnabled = false;
  vm.runInNewContext('disabled = singingKeyShiftProcessingNeeded();', sandbox);
  assert.equal(sandbox.disabled, false);
});

test('实时分离和 AI 双轨混音共用最终输出端的一个变调节点', () => {
  const graph = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const ai = read('public/js/modules/05-playback/09-ai-stem-playback.js');
  assert.match(readFunction(graph, 'connectSingingPlaybackGraph'), /connectSingingKeyShiftOutput\(ctx,[\s\S]*outputAnalyser/);
  assert.match(readFunction(ai, 'connectAiStemPlaybackGraph'), /connectSingingKeyShiftOutput\(ctx,\s*aiStemMixNode,\s*\[analyserNode,\s*beatNode\]\)/);
  assert.doesNotMatch(readFunction(ai, 'connectAiStemPlaybackGraph'), /new AudioWorkletNode/);
});

test('变调启用时 SoundTouch 同步倍速，浏览器不重复保调', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const parameterValues = {};
  const sandbox = {
    audio: {},
    aiStemVocalAudio: {},
    singingKeyShiftNode: {
      parameters: new Map([
        ['playbackRate', { cancelScheduledValues() {}, setValueAtTime(value) { parameterValues.playbackRate = value; } }],
        ['pitchSemitones', { cancelScheduledValues() {}, setValueAtTime(value) { parameterValues.pitchSemitones = value; } }],
      ]),
      context: { currentTime: 2 },
    },
    playbackSpeed: 1.25,
    singingKeyShift: -3,
    singingModeEnabled: true,
    Math,
    Number,
    isFinite,
  };
  vm.runInNewContext(`${readFunction(source, 'normalizeSingingKeyShift')};${readFunction(source, 'effectiveSingingKeyShift')};${readFunction(source, 'setAudioParamImmediate')};${readFunction(source, 'updateSingingKeyShiftNodeParameters')};${readFunction(source, 'applyPlaybackSpeedToAudio')};`, sandbox);
  vm.runInNewContext('applyPlaybackSpeedToAudio();', sandbox);
  assert.equal(sandbox.audio.playbackRate, 1.25);
  assert.equal(sandbox.aiStemVocalAudio.playbackRate, 1.25);
  assert.equal(sandbox.audio.preservesPitch, false);
  assert.equal(sandbox.aiStemVocalAudio.preservesPitch, false);
  assert.equal(parameterValues.playbackRate, 1.25);
  assert.equal(parameterValues.pitchSemitones, -3);
});

test('两个启动开关固定同一行并保持等宽等高', () => {
  const html = read('public/index.html');
  const css = read('public/css/index.css');
  const organizer = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  assert.match(html, /id="startup-toggle-grid" class="fx-toggle-grid startup-toggle-grid"[\s\S]*id="t-startupAutoplay"[\s\S]*id="t-startupFastSkip"/);
  assert.match(css, /\.startup-toggle-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.startup-toggle-grid\s*>\s*\.fx-toggle\s*\{[\s\S]*width:\s*100%[\s\S]*min-height:\s*39px/);
  assert.match(css, /@media\s*\(max-width:520px\)[\s\S]*\.startup-toggle-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(organizer, /setFxSectionBefore\('startup-toggle-grid',\s*'启动播放'\)/);
  assert.doesNotMatch(organizer, /setFxSectionBefore\('t-startupAutoplay',\s*'启动播放'\)/);
});

test('SoundTouch 处理器与许可证会随 App 一起打包', () => {
  assert.ok(fs.existsSync(path.join(root, 'public/vendor/soundtouch/soundtouch-processor.js')));
  assert.ok(fs.existsSync(path.join(root, 'public/vendor/soundtouch/LICENSE')));
  const processor = read('public/vendor/soundtouch/soundtouch-processor.js');
  assert.match(processor, /PROCESSOR_NAME\s*=\s*["']soundtouch-processor["'][\s\S]*registerProcessor\(PROCESSOR_NAME/);
});
