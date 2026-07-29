'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('雨境玻璃水珠作为主 renderer 后处理接入，不创建第二个 Canvas 或 RAF', () => {
  const glass = read('public/js/modules/02-visual/19-rain-glass.js');
  const loader = read('public/js/index-loader.js');
  const mainLoop = read('public/js/modules/11-main-loop.js');

  assert.match(loader, /02-visual\/18-rain-mood\.js'[\s\S]*02-visual\/19-rain-glass\.js'/);
  assert.match(glass, /function rainGlassActive\(/);
  assert.match(glass, /function updateRainGlass\(/);
  assert.match(glass, /function renderRainGlassScene\(/);
  assert.match(glass, /function disposeRainGlass\(/);
  assert.match(glass, /THREE\.WebGLRenderTarget/);
  assert.match(glass, /RAIN_GLASS_FIELD_FRAG/);
  assert.match(glass, /refract\(/);
  assert.match(glass, /fresnel/);
  assert.doesNotMatch(glass, /document\.createElement\(['"]canvas['"]\)/);
  assert.doesNotMatch(glass, /requestAnimationFrame/);
  assert.match(mainLoop, /updateRainGlass\(dt\)/);
  assert.match(mainLoop, /renderRainGlassScene\(renderer, scene, camera\)/);
  assert.match(mainLoop, /renderMainSceneWithGpuSample\(scene, camera\)/);
});

test('雨境玻璃水珠具有独立开关、数量、流速、尺寸设置并持久化', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const html = read('public/index.html');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');

  assert.match(defaults, /rainGlassEnabled:\s*true/);
  assert.match(defaults, /rainGlassAmount:\s*0\.70/);
  assert.match(defaults, /rainGlassSpeed:\s*1\.00/);
  assert.match(defaults, /rainGlassSize:\s*1\.00/);
  assert.match(html, /toggleFx\('rainGlassEnabled'\)/);
  assert.match(html, /id="fx-rainglassamount"/);
  assert.match(html, /id="fx-rainglassspeed"/);
  assert.match(html, /id="fx-rainglasssize"/);
  assert.match(bindings, /\['fx-rainglassamount',\s*'rainGlassAmount'\]/);
  assert.match(bindings, /\['fx-rainglassspeed',\s*'rainGlassSpeed'\]/);
  assert.match(bindings, /\['fx-rainglasssize',\s*'rainGlassSize'\]/);
  assert.match(bindings, /rainGlassAmount.*clampRange\(fx\.rainGlassAmount,\s*0\.15,\s*2\.5\)/);
  assert.match(html, /id="fx-rainglassspeed" type="range" min="0\.2" max="8"/);
  assert.match(bindings, /rainGlassSpeed.*clampRange\(fx\.rainGlassSpeed,\s*0\.2,\s*8\)/);
  assert.match(read('public/js/modules/02-visual/19-rain-glass.js'), /rainGlassClamp\(Math\.sqrt\(speed\) \* \(0\.90 \+ energy \* 0\.10\), 0\.45, 3\.00\)/);
  assert.match(read('public/js/modules/02-visual/19-rain-glass.js'), /rainGlassClamp\(Math\.sqrt\(speed\), 0\.45, 3\.00\)/);
  assert.match(read('public/js/modules/02-visual/19-rain-glass.js'), /\n\s*30,\n\s*336\n\s*\);/);
  assert.match(rain, /rainGlassSpeed\)\) \? Number\(fx\.rainGlassSpeed\) : 1\.00[\s\S]*Math\.min\(8, v\)/);
  assert.match(rain, /'glassSpeed' in raw[\s\S]*Math\.min\(8, Number\(raw\.glassSpeed\)\)/);
  assert.match(bindings, /rainGlassSize.*clampRange\(fx\.rainGlassSize,\s*0\.6,\s*1\.8\)/);
  assert.match(panel, /fx-rainglassamount/);
  assert.match(panel, /fx-rainglassspeed/);
  assert.match(panel, /fx-rainglasssize/);
  assert.match(rain, /glassEnabled:\s*rainGlassEnabledValue\(\)/);
  assert.match(rain, /glassAmount:\s*rainGlassAmountValue\(\)/);
  assert.match(rain, /glassSpeed:\s*rainGlassSpeedValue\(\)/);
  assert.match(rain, /glassSize:\s*rainGlassSizeValue\(\)/);
  assert.match(rain, /'glassEnabled' in raw/);
  assert.match(rain, /'glassAmount' in raw/);
  assert.match(rain, /'glassSpeed' in raw/);
  assert.match(rain, /'glassSize' in raw/);
});

test('雨量不放大水珠，而是以雨点击中玻璃的方式生成水珠', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  const glass = read('public/js/modules/02-visual/19-rain-glass.js');
  const html = read('public/index.html');

  assert.match(html, /id="fx-rainamount" type="range" min="0\.05" max="4"/);
  assert.match(html, /id="fx-rainglassamount" type="range" min="0\.15" max="2\.5"/);
  assert.match(rain, /Math\.min\(4, v\)/);
  assert.match(glass, /RAIN_GLASS_FIELD_SCALE = 1(?:\.0)?/);
  assert.match(glass, /RAIN_GLASS_FIELD_MAX_WIDTH = 2048/);
  assert.match(glass, /RAIN_GLASS_FIELD_MAX_HEIGHT = 1280/);
  assert.match(glass, /IMPACTING: 'impacting'/);
  assert.match(glass, /function rainGlassSpawnImpactDrop\(/);
  assert.match(glass, /function rainGlassUpdateImpacting\(/);
  assert.match(glass, /RAIN_GLASS_DROP_STATE\.IMPACTING/);
  assert.match(glass, /rainGlassSpawnCarry \+= density \* \(1\.1 \+ density \* 1\.8\) \* step/);
  assert.doesNotMatch(glass, /function rainGlassRainSizeFactor\(/);
  assert.doesNotMatch(glass, /rainSize\s*=/);
  assert.doesNotMatch(glass, /rainGlassImpactCarry/);
  assert.doesNotMatch(glass, /rainAmountValue\(\)/);
});

test('水滴模块在关闭或切出雨境时释放 GPU 资源并回退原始雨境渲染', () => {
  const glass = read('public/js/modules/02-visual/19-rain-glass.js');
  const mainLoop = read('public/js/modules/11-main-loop.js');

  assert.match(glass, /if \(!rainGlassActive\(\) \|\|[\s\S]*disposeRainGlass\(\)/);
  assert.match(glass, /sharpTarget/);
  assert.match(glass, /blurATarget/);
  assert.match(glass, /blurBTarget/);
  assert.match(glass, /fieldTarget/);
  assert.match(glass, /\.dispose\(\)/);
  assert.match(mainLoop, /rainGlassActive\(\)[\s\S]*renderRainGlassScene\(renderer, scene, camera\)/);
  assert.match(mainLoop, /if \(!renderedRainGlass\) renderMainSceneWithGpuSample\(scene, camera\)/);
});

test('水滴场之外保持锐利背景，模糊纹理只参与水滴内部光学效果', () => {
  const glass = read('public/js/modules/02-visual/19-rain-glass.js');
  assert.match(glass, /vec3 glassBase = sharpSample\.rgb/);
  assert.match(glass, /vec3 softened = texture2D\(uBlur/);
});

test('玻璃水珠只保留低频平滑微表面，不能出现像素点阵', () => {
  const glass = read('public/js/modules/02-visual/19-rain-glass.js');

  assert.match(glass, /uFieldResolution \* 0\.028/);
  assert.match(glass, /edgeNoise\(vUv \* 0\.62/);
  assert.doesNotMatch(glass, /edgeNoise\(vUv \* 3\.7/);
  assert.doesNotMatch(glass, /vUv \* uFieldResolution \+ uTime/);
});
