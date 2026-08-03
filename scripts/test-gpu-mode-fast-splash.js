'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('显卡模式把三个用户选项映射为 WebGL 偏好', () => {
  const helperPath = path.join(root, 'public/js/gpu-mode.js');
  assert.ok(fs.existsSync(helperPath), '缺少 public/js/gpu-mode.js');
  const gpuMode = require(helperPath);

  assert.equal(gpuMode.normalizeMode('auto'), 'auto');
  assert.equal(gpuMode.normalizeMode('low-power'), 'low-power');
  assert.equal(gpuMode.normalizeMode('high-performance'), 'high-performance');
  assert.equal(gpuMode.normalizeMode('broken'), 'auto');
  assert.equal(gpuMode.powerPreferenceForMode('auto'), 'default');
  assert.equal(gpuMode.powerPreferenceForMode('low-power'), 'low-power');
  assert.equal(gpuMode.powerPreferenceForMode('high-performance'), 'high-performance');
});

test('显卡模式读取失败时回到自动并能保存合法值', () => {
  const helperPath = path.join(root, 'public/js/gpu-mode.js');
  assert.ok(fs.existsSync(helperPath), '缺少 public/js/gpu-mode.js');
  const gpuMode = require(helperPath);
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); }
  };

  assert.equal(gpuMode.readMode(storage), 'auto');
  assert.equal(gpuMode.saveMode(storage, 'low-power'), 'low-power');
  assert.equal(gpuMode.readMode(storage), 'low-power');
  assert.equal(gpuMode.saveMode(storage, 'invalid'), 'auto');
  assert.equal(gpuMode.readMode({ getItem() { throw new Error('blocked'); } }), 'auto');
});

test('显卡模式脚本先于主模块加载且两个 WebGL 上下文共用设置', () => {
  const html = read('public/index.html');
  const renderer = read('public/js/modules/01-scene/00-renderer-quality.js');
  const splash = read('public/js/modules/10-shell/03-splash.js');
  const helperAt = html.indexOf('js/gpu-mode.js');
  const loaderAt = html.indexOf('js/index-loader.js');

  assert.ok(helperAt >= 0, 'index.html 没有加载显卡模式脚本');
  assert.ok(loaderAt > helperAt, '显卡模式脚本必须先于主模块加载');
  assert.match(renderer, /MineradioGpuMode\.powerPreferenceForMode/);
  assert.match(splash, /MineradioGpuMode\.powerPreferenceForMode/);
});

test('性能面板把显卡偏好和性能档位融合为一个四档控件', () => {
  const html = read('public/index.html');
  const controls = read('public/js/modules/07-fx/05-fx-panel-performance.js');
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
  assert.match(controls, /mode === 'eco' \? 'low-power' : \(mode === 'ultra' \? 'high-performance' : 'auto'\)/);
  assert.match(html, /id="gpu-mode-restart-modal"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(controls, /function setGpuMode/);
  assert.match(controls, /restartApp/);
  assert.match(controls, /gpu-mode-later-btn[\s\S]*\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  assert.match(controls, /previousFocus\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  assert.match(controls, /e\.key !== 'Tab'/);
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
