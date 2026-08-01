'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('壁纸库主进程扫描器已迁移且 Mac 安全', () => {
  const library = read('desktop/wallpaper-engine-library.js');
  const bridge = read('desktop/wallpaper-library-bridge.js');
  const mainJs = read('desktop/main.js');
  const indexHtml = read('public/index.html');

  assert.match(library, /class WallpaperEngineLibrary/);
  assert.match(library, /registerWallpaperEngineScheme/);
  // Windows 专属(注册表发现)在 Mac 返回空,不报错
  assert.match(library, /process\.platform !== 'win32'\) return \[\]/);
  // 手动目录扫描可用
  assert.match(library, /async addManualRoot\(/);
  assert.match(library, /async performScan\(/);

  // 桥接:目录 + HTTP 双通道
  assert.match(bridge, /async function scanDirectory\(/);
  assert.match(bridge, /async function scanHttpSource\(/);
  assert.match(bridge, /api\/wallpapers/);
  assert.match(mainJs, /mineradio-wallpaper-library-scan-dir/);
  assert.match(mainJs, /mineradio-wallpaper-library-scan-http/);
  assert.match(mainJs, /mineradio-wallpaper-library-list/);
  assert.match(mainJs, /mineradio-wallpaper-library-media/);

  // Win 端录制 mp4 方案:导出页 + 导出视频列表合并
  const share = read('tools/wallpaper-share-server.js');
  assert.match(share, /\/export\.html/);
  assert.match(share, /\/api\/exported-videos/);
  assert.match(share, /\/api\/exported-file/);
  assert.match(share, /MediaRecorder/);
  assert.match(share, /getDisplayMedia/);
  assert.match(bridge, /api\/exported-videos/);
  assert.match(bridge, /Scene 导出/);

  // 雨境/云瀑/音域回响控件已进 FX 控制台动效 tab(修复用户反馈的动效设置消失)
  const consoleWs = read('public/js/modules/07-fx/09-console-workspace.js');
  assert.match(consoleWs, /key: 'rain-mood', title: '雨境'/);
  assert.match(consoleWs, /key: 'rain-resonance', title: '云瀑共振'/);
  assert.match(consoleWs, /key: 'vox-echo', title: '音域回响'/);
  assert.match(consoleWs, /fxConsoleItem\('fx-rainamount'/);
  assert.match(consoleWs, /fxConsoleItem\('fx-rainresonanceintensity'/);
  assert.match(consoleWs, /fxConsoleItem\('fx-voxsens'/);
  // 新增动效设置:雨境风向偏移 + 雨幕浓度
  assert.match(consoleWs, /fxConsoleItem\('fx-rainwindoffset'/);
  const rainMood = read('public/js/modules/02-visual/18-rain-mood.js');
  assert.match(rainMood, /function rainWindOffsetValue\(\)/);
  assert.match(rainMood, /function rainDensityValue\(\)/);
  assert.match(rainMood, /rainWindOffsetValue\(\) \* 1\.8/);
  assert.match(rainMood, /\* amount \* densityMul/);
  const fxDefaults2 = read('public/js/modules/00-state/04-fx-defaults.js');
  assert.match(fxDefaults2, /rainWindOffset: 0/);
  assert.match(fxDefaults2, /rainDensity: 1\.0/);

  // 动效 tab 预设专属过滤:每个预设只显示自己的动效组,不混杂
  const panelPerf = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  assert.match(panelPerf, /function updateMineradioMotionGroupVisibility\(\)/);
  assert.match(panelPerf, /'rain-mood': preset === 9/);
  assert.match(panelPerf, /'rain-resonance': preset === 11/);
  assert.match(panelPerf, /'vox-echo': preset === 10/);
  assert.match(panelPerf, /'sonic-we': preset === SONIC_WORKSHOP_PRESET_INDEX/);
  assert.match(panelPerf, /visibleMap\[key\] !== false/);
  const gridUniforms = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');
  assert.match(gridUniforms, /updateMineradioMotionGroupVisibility\(\)/);
});

test('壁纸库渲染层面板与入口已接线', () => {
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  const preload = read('desktop/preload.js');
  const indexHtml = read('public/index.html');
  const loader = read('public/js/index-loader.js');
  const css = read('public/css/index.css');

  assert.match(loader, /07-fx\/10-wallpaper-library-panel\.js/);
  assert.match(preload, /wallpaperLibraryScanDir:/);
  assert.match(preload, /wallpaperLibraryScanHttp:/);
  assert.match(preload, /wallpaperLibraryList:/);
  assert.match(panel, /function scanWallpaperLibraryDir\(/);
  assert.match(panel, /function scanWallpaperLibraryHttp\(/);
  assert.match(panel, /function selectWallpaperLibraryRecord\(/);
  assert.match(panel, /Scene 场景壁纸需 Wallpaper Engine 软件/);
  assert.ok(indexHtml.includes('id="wallpaper-library-modal"'), 'index.html 应包含壁纸库面板');
  assert.ok(indexHtml.includes('onclick="openWallpaperLibraryPanel()"'), '应有壁纸库入口');
  assert.match(css, /\.wallpaper-library-modal/);
  assert.match(css, /\.wallpaper-library-list/);
  assert.match(css, /\.wallpaper-library-preview/);
});
