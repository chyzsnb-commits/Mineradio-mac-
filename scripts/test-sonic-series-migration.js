'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('声波监视器模块已迁移并接入主循环', () => {
  const monitor = read('public/js/modules/03-beat/06-sonic-audio-monitor.js');
  const loader = read('public/js/index-loader.js');
  const mainLoop = read('public/js/modules/11-main-loop.js');

  assert.match(monitor, /function stepSonicAudioMonitor\(/);
  assert.match(monitor, /function getSonicAudioMonitorSnapshot\(/);
  assert.match(monitor, /var sonicAudioMonitorState = \{/);
  assert.match(monitor, /SONIC_AUDIO_BASE_BINS = 512/);
  assert.match(monitor, /function drawSonicAudioMonitorPanel\(/);
  assert.match(monitor, /window\.stepSonicAudioMonitor = stepSonicAudioMonitor/);

  assert.match(loader, /03-beat\/06-sonic-audio-monitor\.js/);

  // 主循环:播放中喂 rawData,暂停喂 null 衰减,快照供预设消费
  assert.match(mainLoop, /getSonicAudioMonitorSnapshot\(\)\.frame/);
  assert.match(mainLoop, /stepSonicAudioMonitor\(frequencyData, audioStepDt/);
  assert.match(mainLoop, /stepSonicAudioMonitor\(null, audioStepDt, \{ fx: fx, playing: false \}\)/);
  assert.match(mainLoop, /sonicAudioFrame \|\| \{ bass: bass, mid: mid, treble: treble/);
});

test('声波地形预设(索引 12)与声波工坊预设(索引 13)已迁移且不与 Mac 既有预设冲突', () => {
  const topo = read('public/sonic-topography-preset.js');
  const workshop = read('public/sonic-workshop-preset.js');
  const coreStores = read('public/js/modules/00-state/00-core-stores.js');
  const presets = read('public/js/modules/07-fx/00-preset-archive-data.js');

  // Mac 预设索引:7=黑洞,8=极光,10=音域回响(体素),11=云瀑共振 —— sonic 用 12/13
  assert.match(topo, /var INDEX = 12/);
  assert.match(workshop, /var INDEX = 13/);
  assert.doesNotMatch(topo, /var INDEX = 7;/);
  assert.doesNotMatch(workshop, /var INDEX = 8;/);

  assert.match(coreStores, /var SONIC_PRESET_INDEX = 12/);
  assert.match(coreStores, /var SONIC_WORKSHOP_PRESET_INDEX = 13/);
  assert.match(coreStores, /var MAX_VISUAL_PRESET_INDEX = 13/);

  // 预设网格:新预设名与既有 12 项共存,不覆盖黑洞/极光
  assert.match(presets, /name: '音域回响', nameHtml: '音域回响 <span class="pc-name-en">Sonic-Topography<\/span>'/);
  assert.match(presets, /name: '音域回响', nameHtml: '音域回响 <span class="pc-name-en">Wallpaper Engine<\/span>'/);
  assert.match(presets, /presetDisplayOrder = \[[^\]]*12[^\]]*13/);
  assert.ok(presets.includes("name: '黑洞'"), 'Mac 既有黑洞预设必须保留');
  assert.ok(presets.includes("name: '极光'"), 'Mac 既有极光预设必须保留');
  assert.ok(presets.includes("name: '雨境'"), 'Mac 既有雨境预设必须保留');
  assert.ok(presets.includes("name: '云瀑共振'"), 'Mac 既有云瀑共振预设必须保留');
});

test('两个预设已挂到主循环与预设切换,粒子层在 sonic 激活时隐藏', () => {
  const mainLoop = read('public/js/modules/11-main-loop.js');
  const grid = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');

  assert.match(mainLoop, /MineradioSonicTopography\.update\(dt/);
  assert.match(mainLoop, /MineradioSonicWorkshop\.update\(dt/);
  assert.match(mainLoop, /sonicTopoActive \|\| sonicWorkshopActive/);
  assert.match(mainLoop, /Number\(fx\.preset\) === SONIC_PRESET_INDEX/);

  assert.match(grid, /MineradioSonicTopography\.onPresetChange\(prev, p/);
  assert.match(grid, /MineradioSonicWorkshop\.onPresetChange\(prev, p/);
  assert.match(grid, /updateSonicSeriesControlVisibility\(\)/);
  assert.match(grid, /p === 12\)/);
  assert.match(grid, /p === 13\)/);
});

test('fx 默认值/持久化/面板控件/UI/CSS 已接线', () => {
  const fxDefaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const persistence = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const indexHtml = read('public/index.html');
  const css = read('public/css/index.css');

  assert.match(fxDefaults, /sonicGroundAmplitude: 50/);
  assert.match(fxDefaults, /sonicAudioMonitorEnabled: true/);
  assert.match(fxDefaults, /sonicWorkshopAudioIntensity: 1\.15/);

  assert.match(persistence, /sonicGroundAmplitude: clampRange\(raw\.sonicGroundAmplitude/);
  assert.match(persistence, /sonicWorkshopPeakColorMode: raw\.sonicWorkshopPeakColorMode === 'custom'/);
  // 保存端(对称): saveLyricLayout 必须写 sonic 字段,否则用户设置重启后丢失
  assert.match(persistence, /sonicGroundAmplitude: clampRange\(fx\.sonicGroundAmplitude/);
  assert.match(persistence, /sonicWorkshopPeakColor: normalizeHexColor\(fx\.sonicWorkshopPeakColor/);
  assert.match(persistence, /sonicGroundColorAuto: \['sonicGroundColorMode'/);
  assert.match(persistence, /sonicWorkshopRegionColors: \['sonicWorkshopColorMode'/);

  assert.match(panel, /function updateSonicSeriesControlVisibility\(\)/);
  assert.match(panel, /SONIC_ORIGINAL_FX_CONTROL_IDS/);
  assert.match(panel, /SONIC_WORKSHOP_FX_CONTROL_IDS/);
  assert.match(panel, /setRange\('fx-sonicamp', fx\.sonicGroundAmplitude\)/);
  assert.match(panel, /setRange\('fx-sonicwegain', fx\.sonicWorkshopInputGain\)/);
  assert.match(panel, /refreshSonicAudioMonitorUi/);

  assert.match(indexHtml, /id="fx-sonic-ground-section">音域地形/);
  assert.match(indexHtml, /id="fx-sonic-audio-section">音域频谱/);
  assert.match(indexHtml, /id="fx-sonic-workshop-section">音域回响·WE/);
  assert.match(indexHtml, /id="sonic-audio-monitor-canvas"/);
  assert.match(indexHtml, /id="sonic-workshop-theme-seg"/);

  assert.match(css, /#sonic-workshop-layer/);
  assert.match(css, /\.sonic-audio-monitor-panel\.open/);
  assert.match(css, /\.fx-sonic-hidden/);
  assert.match(css, /body\.sonic-workshop-active #album-bg/);
  // macOS 修复：工坊激活时隐藏 canvas 容器，否则 WebGL canvas 不透明合成会盖住 iframe 导致白屏
  assert.match(css, /body\.sonic-workshop-active #canvas-container/);
  // 加载失败降级：React 未 ready 超时自动回退，避免白屏挂死
  var workshopSrc = read('public/sonic-workshop-preset.js');
  assert.match(workshopSrc, /state\.loadTimeout/);
  assert.match(workshopSrc, /presetBeforeWorkshop/);
  assert.match(workshopSrc, /渲染失败（WebGL 不可用或资源受限）/);
  assert.match(workshopSrc, /mineradio-sonic-workshop-ready/);
});

test('声波工坊 vendor 资源齐备(preview.gif 按用户决定跳过)', () => {
  const bridge = read('public/vendor/sonic-workshop/mineradio-bridge.html');
  const project = read('public/vendor/sonic-workshop/project.json');
  const assetsJs = read('public/vendor/sonic-workshop/assets/index-Z-j1MQ-r.js');
  const assetsCss = read('public/vendor/sonic-workshop/assets/index-Bhwp8mwk.css');

  assert.match(bridge, /Mineradio Sonic Workshop Bridge/);
  assert.match(bridge, /mineradio-sonic-workshop-ready/);
  assert.match(project, /"approved"/);
  assert.ok(assetsJs.length > 100000, 'assets JS 应大于 100KB(React 构建产物)');
  assert.ok(assetsCss.length > 1000, 'assets CSS 应存在');
  assert.ok(!fs.existsSync(path.join(root, 'public/vendor/sonic-workshop/preview.gif')), 'preview.gif 应跳过');
});

test('Mac 既有 sonic 死壳(颜色控件)在新 UI 元素下可寻址', () => {
  const accent = read('public/js/modules/07-fx/02-accent-background-controls.js');
  const indexHtml = read('public/index.html');

  assert.match(accent, /function updateSonicGroundColorControls\(\)/);
  assert.match(accent, /function updateSonicWorkshopColorControls\(\)/);
  assert.match(accent, /var SONIC_WORKSHOP_THEMES = \{/);
  assert.match(accent, /function resetSonicGroundColor\(/);

  // 死壳引用的 UI 元素现在存在于 index.html
  ['sonic-ground-base-picker', 'sonic-workshop-cover-picker', 'sonic-workshop-base-picker',
    'sonic-workshop-warm-picker', 'sonic-workshop-cool-picker', 'sonic-workshop-ripple-picker',
    'sonic-workshop-peak-picker'].forEach(function (id) {
    assert.ok(indexHtml.includes('id="' + id + '"'), 'index.html 应包含 ' + id);
  });
});

test('FX 控制台(设置搜索/撤销历史)与缓存设置(只读版)已迁移', () => {
  const consoleWs = read('public/js/modules/07-fx/09-console-workspace.js');
  const cacheSettings = read('public/js/modules/07-fx/08-cache-storage-settings.js');
  const loader = read('public/js/index-loader.js');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
  const mainJs = read('desktop/main.js');
  const preload = read('desktop/preload.js');
  const indexHtml = read('public/index.html');
  const css = read('public/css/index.css');

  // FX 控制台:模块就位 + organizeFxPanel 优先分支 + init 接线
  assert.match(loader, /07-fx\/09-console-workspace\.js/);
  assert.match(consoleWs, /var FX_CONSOLE_TABS = \[/);
  assert.match(consoleWs, /function organizeFxConsoleWorkspace\(\)/);
  assert.match(consoleWs, /function initFxConsoleSearchAndHistory\(\)/);
  assert.match(consoleWs, /function pushFxConsoleHistory\(/);
  assert.match(consoleWs, /function undoFxConsoleHistory\(\)/);
  assert.match(panel, /organizeFxConsoleWorkspace\(\)/);
  assert.match(bindings, /initFxConsoleSearchAndHistory\(\)/);
  assert.match(css, /\.fx-console-toolbar/);
  assert.match(css, /\.fx-console-search/);
  assert.match(css, /\.fx-search-hit/);

  // 缓存设置:只读版模块 + 主进程 IPC + preload API + 面板 UI
  assert.match(loader, /07-fx\/08-cache-storage-settings\.js/);
  assert.match(cacheSettings, /function refreshMineradioCacheSettings\(\)/);
  assert.match(cacheSettings, /function clearMineradioLyricCache\(\)/);
  // 硬约束:不迁移 Chromium 目录搬迁(无 chooseCacheDirectory/setCacheSettings)
  assert.doesNotMatch(cacheSettings, /chooseCacheDirectory/);
  assert.doesNotMatch(cacheSettings, /setCacheSettings/);
  assert.doesNotMatch(cacheSettings, /restartApp/);
  assert.match(mainJs, /mineradio-cache-get-usage/);
  assert.match(mainJs, /mineradio-cache-clear-lyrics/);
  assert.match(mainJs, /不迁移 Chromium 缓存目录搬迁/);
  assert.match(preload, /getCacheUsage:/);
  assert.match(preload, /clearLyricCache:/);
  assert.ok(indexHtml.includes('id="cache-storage-panel"'), 'index.html 应包含缓存面板');
  assert.match(css, /\.cache-storage-panel/);

  // 界面配色:上游 5 个 color row 已迁入,死壳函数激活
  const accentSrc = read('public/js/modules/07-fx/02-accent-background-controls.js');
  ['ui-accent-picker', 'visual-tint-picker', 'home-accent-picker', 'home-icon-picker',
    'visual-icon-picker'].forEach(function (id) {
    assert.ok(indexHtml.includes('id="' + id + '"'), 'index.html 应包含 ' + id);
  });
  assert.match(accentSrc, /function resetUiAccentColor\(\)/);
  assert.match(accentSrc, /function resetVisualTintColor\(\)/);
  assert.match(panel, /updateUiAccentControls\(\)/);
});
