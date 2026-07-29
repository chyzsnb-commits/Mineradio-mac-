'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('云瀑共振预设接入主循环并使用独立音乐雨幕模块', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');
  const loader = read('public/js/index-loader.js');
  const mainLoop = read('public/js/modules/11-main-loop.js');
  const presets = read('public/js/modules/07-fx/00-preset-archive-data.js');
  const grid = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');
  const particles = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
  const css = read('public/css/index.css');

  assert.match(rain, /RAIN_RESONANCE_PRESET_INDEX = 11/);
  assert.match(rain, /function rainResonanceActive\(/);
  assert.match(rain, /function ensureRainResonance\(/);
  assert.match(rain, /function updateRainResonance\(/);
  assert.match(rain, /function disposeRainResonance\(/);
  assert.match(rain, /bass/);
  assert.match(rain, /mid/);
  assert.match(rain, /treble/);
  assert.match(rain, /beatPulse/);
  assert.doesNotMatch(rain, /document\.createElement\(['"]canvas['"]\)/);
  assert.doesNotMatch(rain, /requestAnimationFrame/);

  assert.match(loader, /02-visual\/20-rainfall-resonance\.js/);
  assert.match(mainLoop, /rainResonanceActive/);
  assert.match(mainLoop, /updateRainResonance\(dt\)/);
  assert.match(mainLoop, /hidePoints = skullPresetActive \|\| voxelActive \|\| rainActive \|\| resonanceActive/);
  assert.match(particles, /Number\(fx\.preset\) === 11/);
  assert.match(rain, /rain-resonance-on/);
  assert.match(css, /#rain-resonance-fx-section/);

  assert.match(presets, /name: '云瀑共振'/);
  assert.match(presets, /音乐喷泉/);
  assert.match(presets, /presetDisplayOrder = \[[^\]]*11/);
  assert.match(grid, /p === 11\)/);
});

test('云瀑共振把低中高频和节拍分别映射到雨瀑运动', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(rain, /bassS/);
  assert.match(rain, /midS/);
  assert.match(rain, /trebS/);
  assert.match(rain, /beatS/);
  assert.match(rain, /resonanceIntensityValue\(\)/);
  assert.match(rain, /resonanceMelodyValue\(\)/);
  assert.match(rain, /resonanceBeatValue\(\)/);
  assert.match(rain, /aAspect/);
  assert.match(rain, /aSeed/);
  assert.match(rain, /aAlpha/);
  assert.match(rain, /uWaterfall/);
  assert.match(rain, /RAINFORM_PEARL_FRAG/);
  assert.match(rain, /rainResonanceEase/);
});

test('云瀑共振控件独立持久化并支持强度、旋律起伏、拍点爆发', () => {
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const html = read('public/index.html');
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(defaults, /rainResonanceIntensity:\s*0\.90/);
  assert.match(defaults, /rainResonanceMelody:\s*0\.80/);
  assert.match(defaults, /rainResonanceBeat:\s*0\.75/);
  assert.match(html, /id="rain-resonance-fx-section"/);
  assert.match(html, /id="fx-rainresonanceintensity"/);
  assert.match(html, /id="fx-rainresonancemelody"/);
  assert.match(html, /id="fx-rainresonancebeat"/);
  assert.match(bindings, /\['fx-rainresonanceintensity',\s*'rainResonanceIntensity'\]/);
  assert.match(bindings, /\['fx-rainresonancemelody',\s*'rainResonanceMelody'\]/);
  assert.match(bindings, /\['fx-rainresonancebeat',\s*'rainResonanceBeat'\]/);
  assert.match(bindings, /rainResonanceIntensity.*clampRange\(fx\.rainResonanceIntensity,\s*0,\s*1\.6\)/);
  assert.match(bindings, /rainResonanceMelody.*clampRange\(fx\.rainResonanceMelody,\s*0,\s*1\.8\)/);
  assert.match(bindings, /rainResonanceBeat.*clampRange\(fx\.rainResonanceBeat,\s*0,\s*1\.8\)/);
  assert.match(panel, /fx-rainresonanceintensity/);
  assert.match(panel, /fx-rainresonancemelody/);
  assert.match(panel, /fx-rainresonancebeat/);
  assert.match(rain, /RAIN_RESONANCE_STORE_KEY/);
  assert.match(rain, /localStorage/);
});

test('云瀑共振采用 Rainform 的分层雨景结构而不是单一点云雨柱', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(rain, /Required Notice: Rainform \/ 数据成雨/);
  assert.match(rain, /RAINFORM_DERIVED_SOURCE/);
  assert.match(rain, /RAINFORM_CURVE_POINTS = 25/);
  assert.match(rain, /createRainformChainSystem\(/);
  assert.match(rain, /updateRainformChains\(/);
  assert.match(rain, /createRainformWaterfallSystem\(/);
  assert.match(rain, /updateRainformWaterfall\(/);
  assert.match(rain, /createRainformSplashSystem\(/);
  assert.match(rain, /emitRainformSplash\(/);
  assert.match(rain, /createRainformRippleSystem\(/);
  assert.match(rain, /updateRainformRipples\(/);
  assert.match(rain, /aAspect/);
  assert.match(rain, /reflectionWave/);
  assert.match(rain, /uWaterfall/);
  assert.match(rain, /RAINFORM_CHAIN_ROLE/);
  assert.doesNotMatch(rain, /RAIN_RESONANCE_COLUMN_COUNT/);
  assert.doesNotMatch(rain, /RAIN_RESONANCE_ROWS_PER_COLUMN/);
});

test('Rainform 音乐映射通过 25 点雨量曲线驱动，不改变现有主循环入口', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(rain, /buildRainformAudioCurve\(/);
  assert.match(rain, /rainformCurve\.length = RAINFORM_CURVE_POINTS/);
  assert.match(rain, /bass/);
  assert.match(rain, /mid/);
  assert.match(rain, /treble/);
  assert.match(rain, /beatPulse/);
  assert.match(rain, /rainformCurveAt\(/);
  assert.match(rain, /rainformChainCount/);
  assert.match(rain, /rainformWaterfallCount/);
  assert.match(rain, /rainformSplashCount/);
});