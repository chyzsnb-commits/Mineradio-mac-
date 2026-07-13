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

test('唱歌面板提供对称的伴奏和人声双滑块', () => {
  const html = read('public/index.html');
  assert.match(html, /<label for="accompaniment-level-slider">伴奏<\/label>[\s\S]*?<input id="accompaniment-level-slider"[^>]*value="1"[\s\S]*?<span id="accompaniment-level-value">100%<\/span>/);
  assert.match(html, /<label for="vocal-level-slider">人声<\/label>[\s\S]*?<input id="vocal-level-slider"[^>]*value="0"[\s\S]*?<span id="vocal-level-value">0%<\/span>/);
  assert.match(html, /title="唱歌模式\(调节伴奏与人声,开麦跟唱\)"/);
});

test('只有伴奏和人声同时 100% 才绕过分离处理', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const sandbox = {
    singingModeEnabled: true,
    singingAccompanimentLevel: 1,
    singingVocalLevel: 1,
    Number,
    isFinite,
  };
  vm.runInNewContext(`${readFunction(source, 'singingVocalProcessingNeeded')};`, sandbox);
  vm.runInNewContext('direct = singingVocalProcessingNeeded();', sandbox);
  assert.equal(sandbox.direct, false);
  sandbox.singingVocalLevel = 0;
  vm.runInNewContext('removeVocal = singingVocalProcessingNeeded();', sandbox);
  assert.equal(sandbox.removeVocal, true);
  sandbox.singingVocalLevel = 1;
  sandbox.singingAccompanimentLevel = 0;
  vm.runInNewContext('isolateVocal = singingVocalProcessingNeeded();', sandbox);
  assert.equal(sandbox.isolateVocal, true);
});

test('Worklet 用同一掩码混合伴奏和人声且加强中置抑制', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  assert.match(source, /processorOptions:\s*\{\s*accompaniment:\s*singingAccompanimentLevel,\s*vocal:\s*singingVocalLevel\s*\}/);
  assert.match(source, /Math\.pow\(ratio,\s*2\.2\)/);
  assert.match(source, /var applied = accompaniment \* mask \+ vocal \* \(1 - mask\);/);
  assert.doesNotMatch(source, /var applied = lv \+ \(1 - lv\) \* mask;/);
});

test('分离链滑块调节只发送参数而不创建第二个处理器', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  assert.match(source, /setLevels:\s*function\s*\(accompaniment, vocal\)[\s\S]*postMessage\(\{ accompaniment: accompaniment, vocal: vocal \}\)/);
  assert.equal((source.match(/new AudioWorkletNode\(/g) || []).length, 1);
  assert.match(source, /function setSingingAccompanimentLevel\(/);
  assert.match(source, /function setSingingVocalLevel\(/);
});

test('无 Worklet 回退链也按伴奏和人声两个音量混合', () => {
  const source = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const fallback = readFunction(source, 'buildVocalCutChainBiquad');
  assert.match(fallback, /original\.gain\.value = singingVocalLevel/);
  assert.match(fallback, /separated\.gain\.value = singingAccompanimentLevel - singingVocalLevel/);
  assert.match(fallback, /setLevels:\s*function/);
});

test('核心状态默认伴奏满、人声零', () => {
  const stores = read('public/js/modules/00-state/00-core-stores.js');
  assert.match(stores, /singingAccompanimentLevel\s*=\s*1/);
  assert.match(stores, /singingVocalLevel\s*=\s*0/);
});
