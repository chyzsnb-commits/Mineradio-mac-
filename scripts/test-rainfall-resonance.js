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

test('云瀑共振保留官网 Rainform 的高密度雨幕比例和液态金属材质', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(rain, /RAINFORM_BASE_CHAIN_COUNT = 2000/);
  assert.match(rain, /RAINFORM_AMBIENT_CHAIN_COUNT = 800/);
  assert.match(rain, /RAINFORM_DOWNPOUR_CHAIN_COUNT = 1400/);
  assert.match(rain, /RAINFORM_WATERFALL_FILAMENT_COUNT = 1900/);
  assert.match(rain, /InstancedMesh/);
  assert.match(rain, /RAINFORM_RAIN_LUT_SIZE = 256/);
  assert.match(rain, /RAINFORM_ZERO_RAIN_SUPPRESSION/);
  assert.match(rain, /uPearlBandFrequency/);
  assert.match(rain, /uPearlSpecularPower/);
  assert.match(rain, /uPearlFresnelStrength/);
  assert.match(rain, /procedural-liquid-metal/);
});

test('云瀑共振包含官网底部水线、雾带和曲线包络，而不是仅在空中生成水滴', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(rain, /createRainformWaterSurface\(/);
  assert.match(rain, /createRainformMistBand\(/);
  assert.match(rain, /RAINFORM_WATERLINE/);
  assert.match(rain, /rainformCurveLut/);
  assert.match(rain, /rainformRainfallResponse/);
  assert.match(rain, /rainformDataDrivenCeiling/);
  assert.match(rain, /InstancedBufferGeometry/);
});

test('云瀑共振把底部做成可见的水平水面，并由旋律曲线驱动水波与雾带', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(rain, /RAINFORM_WATER_SURFACE_DEPTH/);
  assert.match(rain, /geometry\.rotateX\(-Math\.PI \* 0\.5\)/);
  assert.match(rain, /uRainLut/);
  assert.match(rain, /rainformUploadCurveLut\(/);
  assert.match(rain, /rainformMelodyWaveAt\(/);
  assert.match(rain, /uMelodyPhase/);
  assert.match(rain, /updateRainformSurface\(rr, rainResonanceClock\)/);
});

test('云瀑共振让分层雨幕的高度自然形成随旋律移动的雨峰', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.doesNotMatch(rain, /RAINFORM_TOP_EDGE_SAMPLES/);
  assert.doesNotMatch(rain, /topRain/);
  assert.match(rain, /rainformDataDrivenCeiling\(xNorm\)/);
  assert.match(rain, /rainformDataDrivenCeiling\(filament\.normX\[i\]\)/);
});

test('云瀑共振由分层雨幕本身形成峰谷，不再绘制独立顶部波形', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.doesNotMatch(rain, /createRainformTopRainSystem\(/);
  assert.doesNotMatch(rain, /updateRainformTopRain\(/);
  assert.match(rain, /rainformDataDrivenCeiling\(xNorm\)/);
  assert.match(rain, /rainformDataDrivenCeiling\(filament\.normX\[i\]\)/);
});

test('云瀑共振水面使用可衰减的雨点击高度场，而不是固定正弦波', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(rain, /RAINFORM_HEIGHTFIELD_WIDTH/);
  assert.match(rain, /RAINFORM_HEIGHTFIELD_HEIGHT/);
  assert.match(rain, /createRainformHeightField\(/);
  assert.match(rain, /updateRainformHeightField\(/);
  assert.match(rain, /rainformInjectRipple\(/);
  assert.match(rain, /uHeightField/);
  assert.match(rain, /WebGLRenderTarget/);
});

test('云瀑共振从真实 FFT 频段生成 25 点雨势，不用固定正弦波伪造旋律', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(rain, /function rainformAudioBinAt\(/);
  assert.match(rain, /frequencyData/);
  assert.match(rain, /var tonal = rainformAudioBinAt\(normalized\)/);
  assert.doesNotMatch(rain, /var broad = 0\.5 \+ 0\.5 \* Math\.sin/);
  assert.doesNotMatch(rain, /var detail = 0\.5 \+ 0\.5 \* Math\.sin/);
});

test('云瀑共振开场使用细密雨链，尺寸只在音乐能量升高时增加', () => {
  const rain = read('public/js/modules/02-visual/20-rainfall-resonance.js');

  assert.match(rain, /RAINFORM_INITIAL_PEARL_SCALE = 0\.62/);
  assert.match(rain, /RAINFORM_INITIAL_WATERFALL_SCALE = 0\.56/);
  assert.match(rain, /baseSize \*= RAINFORM_INITIAL_PEARL_SCALE/);
  assert.match(rain, /sizes\[index\] \*= RAINFORM_INITIAL_WATERFALL_SCALE/);
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
