'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('雨境复用预设索引 9，挂主循环频段，不另起 Canvas / 不引入水膜', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  const loader = read('public/js/index-loader.js');
  const mainLoop = read('public/js/modules/11-main-loop.js');
  const presets = read('public/js/modules/07-fx/00-preset-archive-data.js');
  const grid = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');
  const starRiver = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
  const persist = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
  const layout = read('public/js/modules/00-state/06-fx-runtime-layout.js');

  assert.match(rain, /RAIN_MOOD_PRESET_INDEX = 9/);
  assert.match(rain, /function rainMoodActive\(/);
  assert.match(rain, /function updateRainMood\(/);
  assert.match(rain, /function ensureRainMood\(/);
  assert.match(rain, /RAIN_MOOD_MAX_DROPS/);
  assert.match(rain, /freeList/);
  assert.match(rain, /typeof bass === 'number' \? bass/);
  assert.match(rain, /typeof mid === 'number' \? mid/);
  assert.match(rain, /typeof treble === 'number' \? treble/);
  assert.match(rain, /beatPulse/);
  assert.doesNotMatch(rain, /document\.createElement\(['"]canvas['"]\)/);
  assert.doesNotMatch(rain, /getContext\(['"]2d['"]\)/);
  assert.doesNotMatch(rain, /water-membrane|水膜/);

  assert.match(loader, /02-visual\/18-rain-mood\.js/);
  assert.doesNotMatch(loader, /water-membrane/);

  assert.match(mainLoop, /rainMoodActive/);
  assert.match(mainLoop, /updateRainMood\(dt\)/);
  assert.match(mainLoop, /hidePoints = skullPresetActive \|\| voxelActive \|\| rainActive/);

  assert.match(presets, /name: '雨境'/);
  assert.match(presets, /节奏雨丝/);
  assert.doesNotMatch(presets, /name: '声波走廊'/);
  assert.match(presets, /presetDisplayOrder = \[[^\]]*9/);
  assert.doesNotMatch(presets, /if \(savedPreset === 9\) savedPreset = 0/);

  assert.doesNotMatch(grid, /seen = \{ 9: true \}/);
  assert.match(grid, /p === 9\) \{ orbit\.userRadius = 7\.2/);

  assert.match(starRiver, /Number\(fx\.preset\) === 9\) return 0/);
  assert.match(starRiver, /rainMoodActive\(\)\) return 0/);

  assert.doesNotMatch(persist, /if \(savedPreset === 9\) savedPreset = 0/);
  assert.doesNotMatch(layout, /if \(savedPreset === 9\) savedPreset = 0/);
});

test('雨境不强制切换用户视觉，切走时清空雨滴', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  assert.match(rain, /function setRainMoodVisible\(on\)/);
  assert.match(rain, /if \(!on\) rainMoodClearDrops\(rm\)/);
  assert.match(rain, /if \(rainMood && rainMood\.points && rainMood\.points\.visible\) setRainMoodVisible\(false\)/);
});

test('雨境幽灵封面：湿玻璃海报，复用 coverTex，雨丝画在前面', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');

  // 独立海报尺寸/机位，不是体素那块 140 大斜面
  assert.match(rain, /RAIN_COVER_SIZE/);
  assert.match(rain, /RAIN_COVER_POS/);
  assert.match(rain, /RAIN_COVER_FRAG/);
  assert.match(rain, /function updateRainMoodCover\(/);
  assert.match(rain, /function rainMoodHasCover\(/);
  assert.match(rain, /coverPlane/);
  assert.match(rain, /coverUniforms/);

  // 复用主封面管线，不另起加载
  assert.match(rain, /uTexture:\s*\{\s*value:\s*\(typeof coverTex/);
  assert.match(rain, /uniforms\.uHasCover/);
  assert.match(rain, /cu\.uTexture\.value = coverTex/);

  // 层级：暗底 < 封面 < 雨丝 < 闪白；封面关 depthTest
  assert.match(rain, /coverPlane\.renderOrder = -2/);
  assert.match(rain, /points\.renderOrder = 0/);
  assert.match(rain, /depthTest:\s*false/);
  assert.match(rain, /湿玻璃|rain streak|竖向雨痕/);

  // 切走时关掉封面
  assert.match(rain, /if \(rm\.coverPlane\) rm\.coverPlane\.visible = false/);
  assert.match(rain, /updateRainMoodCover\(rm,/);
});

test('雨境封面图开关：动态 tab 可关，独立持久化，默认开', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const html = read('public/index.html');
  const css = read('public/css/index.css');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
  const startup = read('public/js/modules/10-shell/05-startup-bindings.js');

  // 默认开 + UI 入口与音域回响同构
  assert.match(defaults, /rainGhostCover:\s*true/);
  assert.match(html, /id="rain-fx-section"/);
  assert.match(html, /id="t-rainGhostCover"/);
  assert.match(html, /toggleFx\('rainGhostCover'\)/);
  assert.match(html, /雨境:雨幕后的湿玻璃专辑封面|雨幕后的湿玻璃/);
  assert.match(panel, /t-rainGhostCover/);
  assert.match(panel, /fx\.rainGhostCover !== false/);
  assert.match(panel, /id === 'rain-fx-section'/);

  // 只在 rain-on 时显示区块(旧分页);FX 控制台接管后不隐藏,动效 tab 展示全部预设设置
  assert.match(css, /body:not\(\[data-console-layout="task-first-v2"\]\):not\(\.rain-on\) #rain-fx-section\{display:none\}/);
  assert.doesNotMatch(css, /body\.rain-on \[data-fx-page="motion"\] > \*:not\(#rain-fx-section\)/, 'FX 控制台结构下不得隐藏动效 tab 其他分组(会全黑)');
  assert.match(rain, /function rainMoodSetBodyClass\(/);
  assert.match(rain, /classList\.add\('rain-on'\)/);
  assert.match(rain, /classList\.remove\('rain-on'\)/);

  // 动态 tab 置顶:雨境/音域回响自定义区钉在 motion 页最上面
  assert.match(panel, /motionPage\.insertBefore\(rainFxSection, motionPage\.firstChild\)/);
  assert.match(panel, /motionPage\.insertBefore\(voxFxSection, motionPage\.firstChild\)/);

  // 独立持久化 + 启动加载 + toggle 写入
  assert.match(rain, /mineradio-rain-toggles-v1/);
  assert.match(rain, /function saveRainToggles\(/);
  assert.match(rain, /function loadRainToggles\(/);
  assert.match(rain, /'ghostCover' in raw/);
  assert.match(bindings, /\^rain\/\.test\(key\).*saveRainToggles/);
  assert.match(startup, /loadRainToggles\(\)/);

  // 显隐受开关约束
  assert.match(rain, /fx\.rainGhostCover === false/);
  assert.match(rain, /rainMoodHasCover\(\) && !\(typeof fx/);
});

test('雨境雨量与打雷阈值可调，驱动 spawn / flash，独立持久化', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const html = read('public/index.html');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');

  // 默认值 + UI 滑条
  assert.match(defaults, /rainAmount:\s*1(?:\.0)?/);
  assert.match(defaults, /rainThunder:\s*0\.70/);
  assert.match(rain, /rainThunder\)\) \? Number\(fx\.rainThunder\) : 0\.70/);
  assert.match(html, /id="fx-rainamount"/);
  assert.match(html, /id="fx-rainthunder"/);
  assert.match(html, /雨量/);
  assert.match(html, /打雷阈值/);
  assert.match(panel, /setRange\('fx-rainamount'/);
  assert.match(panel, /setRange\('fx-rainthunder'/);
  assert.match(bindings, /\['fx-rainamount',\s*'rainAmount'\]/);
  assert.match(bindings, /\['fx-rainthunder',\s*'rainThunder'\]/);
  assert.match(bindings, /rainAmount.*clampRange\(fx\.rainAmount,\s*0\.05,\s*4\)/);
  assert.match(bindings, /rainThunder.*clampRange\(fx\.rainThunder,\s*0\.15,\s*0\.95\)/);
  assert.match(bindings, /saveRainToggles/);

  // 运行时读取 + 驱动逻辑
  assert.match(rain, /function rainAmountValue\(/);
  assert.match(rain, /function rainThunderValue\(/);
  assert.match(rain, /var amount = rainAmountValue\(\)/);
  assert.match(rain, /var thunderGate = rainThunderValue\(\)/);
  assert.match(rain, /\* amount/);
  assert.match(rain, /flashChance/);
  assert.match(rain, /spawnCap/);

  // 持久化 amount / thunder
  assert.match(rain, /amount:\s*rainAmountValue\(\)/);
  assert.match(rain, /thunder:\s*rainThunderValue\(\)/);
  assert.match(rain, /'amount' in raw/);
  assert.match(rain, /'thunder' in raw/);
});

test('雨境旧随机开关存档会迁移为随机模式，且随机雷不依赖音乐节拍', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');

  assert.match(defaults, /rainRandomThunder:\s*false/);
  assert.match(rain, /function rainRandomThunderEnabledValue\(/);
  assert.match(rain, /rainThunderModeValue\(\) === 'random'/);
  assert.match(rain, /randomThunder:\s*rainRandomThunderEnabledValue\(\)/);
  assert.match(rain, /'randomThunder' in raw/);
  assert.match(rain, /fx\.rainThunderMode = raw\.randomThunder === true \? 'random' : 'music'/);
  assert.match(rain, /nextRandomThunderAt/);
  assert.match(rain, /rainMoodClock >= rm\.nextRandomThunderAt/);
  assert.match(rain, /thunderMode === 'random'/);
  assert.doesNotMatch(rain, /thunderMode === 'random' && playingNow/);
});

test('雨境随机打雷有单闪和连续闪，并复用闪电折线营造云层照明', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');

  assert.match(rain, /function rainMoodQueueRandomThunder\(/);
  assert.match(rain, /flashCount = Math\.random\(\) < 0\.38 \? 2 \+ Math\.floor\(Math\.random\(\) \* 2\) : 1/);
  assert.match(rain, /function rainMoodConsumeThunderFlash\(/);
  assert.match(rain, /function rainMoodDrawLightning\(/);
  assert.match(rain, /new THREE\.LineSegments\(/);
  assert.match(rain, /thunderFlashes/);
  assert.match(rain, /lightningAmt/);
  assert.match(rain, /rm\.thunderFlashes\.length = 0/);
  assert.match(rain, /rm\.lightning\.visible = false/);
});

test('雨境打雷模式三选一，随机频率与音乐阈值互不干扰', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const html = read('public/index.html');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');

  assert.match(defaults, /rainThunderMode:\s*'music'/);
  assert.match(defaults, /rainRandomFrequency:\s*15/);
  assert.match(html, /id="rain-thunder-mode-seg"/);
  assert.match(html, /setRainThunderMode\('off'\)/);
  assert.match(html, /setRainThunderMode\('music'\)/);
  assert.match(html, /setRainThunderMode\('random'\)/);
  assert.match(html, /id="fx-rainrandomfrequency"/);
  assert.match(panel, /rain-thunder-mode-seg/);
  assert.match(bindings, /function setRainThunderMode\(/);
  assert.match(bindings, /\['fx-rainrandomfrequency',\s*'rainRandomFrequency'\]/);
  assert.match(rain, /function rainThunderModeValue\(/);
  assert.match(rain, /function rainRandomFrequencyValue\(/);
  assert.match(rain, /thunderMode === 'music'/);
  assert.match(rain, /thunderMode === 'random'/);
  assert.match(rain, /thunderMode === 'off'/);
  assert.match(rain, /randomFrequency:\s*rainRandomFrequencyValue\(\)/);
  assert.match(rain, /'thunderMode' in raw/);
  assert.match(rain, /'randomFrequency' in raw/);
});
