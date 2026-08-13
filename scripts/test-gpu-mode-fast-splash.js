'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function extractFunction(source, name) {
  const match = source.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
  assert.ok(match, '缺少函数 ' + name);
  return match[0];
}

test('WebGL 固定使用当前 Mac 的默认 Metal 设备，不保留下次启动偏好', () => {
  const html = read('public/index.html');
  const renderer = read('public/js/modules/01-scene/00-renderer-quality.js');
  const splash = read('public/js/modules/10-shell/03-splash.js');

  assert.doesNotMatch(html, /js\/gpu-mode\.js/);
  assert.doesNotMatch(renderer, /MineradioGpuMode|mineradio-gpu-mode-v1/);
  assert.doesNotMatch(splash, /MineradioGpuMode|mineradio-gpu-mode-v1/);
  assert.match(renderer, /powerPreference:\s*'default'/);
  assert.match(splash, /powerPreference:\s*'default'/);
});

test('性能面板四档是纯运行时设置，不再出现重启弹窗或重启 IPC', () => {
  const html = read('public/index.html');
  const controls = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const preload = read('desktop/preload.js');
  const main = read('desktop/main.js');
  const segment = html.match(/<div[^>]*id="performance-mode-seg"[^>]*>[\s\S]*?<\/div>/);

  assert.ok(segment, '缺少 performance-mode-seg');
  assert.deepEqual(
    Array.from(segment[0].matchAll(/data-performance-mode="([^"]+)"/g), (match) => match[1]),
    ['auto', 'eco', 'balanced', 'ultra']
  );
  assert.match(segment[0], />自动<\/button>/);
  assert.match(segment[0], />省电<\/button>/);
  assert.match(segment[0], />均衡<\/button>/);
  assert.match(segment[0], />高性能<\/button>/);
  assert.doesNotMatch(html, /id="gpu-mode-seg"/);
  assert.doesNotMatch(html, /id="performance-quality-seg"/);
  assert.match(controls, /function setUnifiedPerformanceMode/);
  assert.doesNotMatch(html, /gpu-mode-restart-modal|重启后生效|立即重启|稍后重启/);
  assert.doesNotMatch(controls, /GpuModeRestart|restartForGpuMode|setGpuMode|currentGpuMode|MineradioGpuMode/);
  assert.doesNotMatch(preload, /restartApp|mineradio-restart-app/);
  assert.doesNotMatch(main, /mineradio-restart-app/);
});

test('切换性能档后立即刷新当前运行态并唤醒渲染', () => {
  const controls = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const calls = { controls: 0, renderer: 0, glass: 0, wake: 0, restart: 0, save: [], toast: [] };
  const sandbox = {
    fx: { performanceQuality: 'balanced' },
    normalizePerformanceQuality(value) { return String(value || 'auto'); },
    updatePerformanceControls() { calls.controls += 1; },
    applyRendererPowerMode() { calls.renderer += 1; },
    syncGlassLiteClass() { calls.glass += 1; },
    markRenderInteraction() { calls.wake += 1; },
    saveLyricLayout(opts) { calls.save.push(opts); },
    showToast(message) { calls.toast.push(message); },
    unifiedPerformanceModeLabel(mode) { return mode === 'eco' ? '省电' : mode; },
    openGpuModeRestartPrompt() { calls.restart += 1; },
    currentGpuMode() { return 'auto'; },
    performanceModeGpuMode(mode) { return mode === 'eco' ? 'low-power' : 'auto'; },
    window: { localStorage: {}, MineradioGpuMode: { saveMode() {}, readMode() { return 'auto'; } } },
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(controls, 'setUnifiedPerformanceMode'), sandbox);
  sandbox.setUnifiedPerformanceMode('eco', false);

  assert.equal(sandbox.fx.performanceQuality, 'eco');
  assert.deepEqual(
    { controls: calls.controls, renderer: calls.renderer, glass: calls.glass, wake: calls.wake, restart: calls.restart },
    { controls: 1, renderer: 1, glass: 1, wake: 1, restart: 0 }
  );
  assert.equal(calls.save[0] && calls.save[0].reason, 'performanceMode');
  assert.match(calls.toast[0] || '', /立即应用/);
});

test('启动页无需等待即可手动跳过', () => {
  const splash = read('public/js/modules/10-shell/03-splash.js');
  const handler = splash.match(/function requestSplashEnter\(\)\s*\{([\s\S]*?)\n\s*\}/);

  assert.ok(handler, '缺少启动页进入处理函数');
  assert.doesNotMatch(handler[1], /splashReadyToEnter/);
  assert.match(handler[1], /dismissSplash\(\{\s*quick:\s*true/);
});

test('启动页显示时普通播放热键不会抢先处理空格', () => {
  const shortcuts = read('public/js/modules/10-shell/01-viewport-resize-shortcuts.js');
  const handler = shortcuts.match(/document\.addEventListener\('keydown', function \(e\) \{([\s\S]*?)\n\}\);/);

  assert.ok(handler, '缺少普通键盘热键处理函数');
  assert.match(handler[1], /splash-active[\s\S]*return/);
  assert.ok(handler[1].indexOf('splash-active') < handler[1].indexOf("e.code === 'Space'"), '启动页拦截必须先于播放热键');
});

test('首页悬浮动画只在后台省电状态暂停', () => {
  const css = read('public/css/index.css');

  assert.match(css, /body\.render-background-eco\.empty-home-active[\s\S]*animation-play-state:\s*paused/);
  assert.match(css, /body\.render-deep-sleep\.empty-home-active[\s\S]*animation-play-state:\s*paused/);
  assert.match(css, /\.home-card[\s\S]*\.home-visual/);
});
