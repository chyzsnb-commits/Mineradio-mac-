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
  // Mac 适配:FX_CONSOLE_LAYOUT 引用的所有控件 id 必须存在于 index.html(否则 tab 组空白)
  const layoutRefs = [];
  const itemRe = /fxConsoleItem\('([^']+)'/g;
  let itemM;
  while ((itemM = itemRe.exec(consoleWs))) layoutRefs.push(itemM[1]);
  const missingIds = layoutRefs.filter(function (id) { return !indexHtml.includes('id="' + id + '"'); });
  assert.deepStrictEqual(missingIds, [], 'FX 控制台引用的控件 id 在 index.html 缺失: ' + missingIds.join(','));
  // Mac 适配:setFxPanelTab 支持 FX 控制台新 key(home/interface/lyrics/motion/shelf/system)
  assert.match(panel, /var fxPanelTab = \(function/);
  assert.match(panel, /var legacyToNew = \{ presets: 'home'/);
  // 搜索框事件绑定必须在启动入口 bindFxPanel 内(否则启动后搜索无响应)
  assert.match(bindings, /initFxConsoleSearchAndHistory\(\)/);
  assert.match(bindings, /function bindFxPanel/);
  const bindFxPanelBlock = bindings.slice(bindings.indexOf('function bindFxPanel'), bindings.indexOf('function setRainThunderMode'));
  assert.match(bindFxPanelBlock, /initFxConsoleSearchAndHistory\(\)/, 'bindFxPanel 内必须绑定 FX 控制台搜索事件');

  // 播放标题音源切换(Windows v2.1.0):control-title-badges + 可点击 chip + 切换面板
  const ripples = read('public/js/modules/02-visual/15-ripples-cover-depth.js');
  assert.match(ripples, /control-title-badges/);
  assert.match(ripples, /songSourceTagHtml\(song, \{ switcher: true \}\)/);
  assert.match(ripples, /songVipTagHtml/);
  const searchSrc = read('public/js/modules/05-playback/07-search.js');
  assert.match(searchSrc, /function switchCurrentSongSource\(/);
  assert.match(searchSrc, /function toggleControlSourceSwitcher\(/);
  assert.match(searchSrc, /function songSourceTagHtml\(/);
  assert.match(searchSrc, /function songVipTagHtml\(/);
  assert.match(css, /\.control-source-switcher/);
  assert.match(css, /\.control-title-badges/);

  // 三个 review bug 修复断言
  // 1. setFxPanelTab 兼容旧分页(旧 key 集合 + newToLegacy),避免 fallback 白屏
  assert.match(panel, /var legacyAllowed = \{ presets: 1/);
  assert.match(panel, /var newToLegacy = \{ home: 'presets'/);
  assert.match(panel, /isConsole \? newAllowed : legacyAllowed/);
  // 2. 音源切换竞态保护(await 后歌曲引用比对,避免覆盖用户新选歌曲)
  assert.match(searchSrc, /stillSameSong/);
  assert.match(searchSrc, /currentControlSong\(\) === song/);

  // listen-stats v2 本地每日聚合(纯本地,不上报服务端)
  const listenStats = read('public/js/modules/05-playback/02-listen-stats.js');
  assert.match(listenStats, /var HOME_LISTEN_ROLLUP_V2_KEY/);
  assert.match(listenStats, /function recordListenRollupV2\(/);
  assert.match(listenStats, /function loadListenRollupV2\(/);
  assert.match(listenStats, /recordListenRollupV2\(record\)/);
  assert.doesNotMatch(listenStats, /api\/listen\/report/, 'Mac 不上报服务端(平台同步为上游 experimental,不迁移)');

  // 首页小窗口布局修复(每日热评与歌曲列表不重叠)
  const css2 = read('public/css/index.css');
  assert.match(css2, /home-recent-inner \.home-recent-list\{flex:1 1 auto;min-height:48px\}/);
  assert.match(css2, /@media \(max-height:760px\)/);
  assert.match(css2, /home-recent-inner \.home-recent-stats\{display:none\}/);

  // 洞察 dock 卡片布局修复(显式 grid 行列,消除自动布局重叠)
  assert.match(css2, /\.home-insight-dock \.home-listen-card \{ grid-column: 1; grid-row: 1 \}/);
  assert.match(css2, /\.home-insight-dock \.home-next-card \{ grid-column: 2; grid-row: 1 \}/);
  assert.match(css2, /\.home-insight-dock \.home-discovery-strip \{ grid-column: 1; grid-row: 2 \}/);
  assert.match(css2, /\.home-ranking-entry:not\(\.home-radio-entry\)/);
  assert.match(css2, /\.home-ranking-entry\.home-radio-entry \{ grid-column: 1 \/ -1; grid-row: 3 \}/);

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
