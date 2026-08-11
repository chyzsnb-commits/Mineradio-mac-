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
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`${name} 函数未闭合`);
}

test('最近播放列表记录滚动活动并在 240ms 后恢复', () => {
  const home = read('public/js/modules/05-playback/03-home-discover-weather.js');
  assert.match(home, /var homeRecentScrollActiveUntil = 0/);
  assert.match(home, /function markHomeRecentScrollActivity\(/);
  assert.match(home, /homeRecentScrollActiveUntil\s*=\s*performance\.now\(\)\s*\+\s*240/);
  assert.match(home, /addEventListener\('wheel',\s*markHomeRecentScrollActivity,\s*\{ passive: true \}\)/);
  assert.match(home, /addEventListener\('scroll',\s*markHomeRecentScrollActivity,\s*\{ passive: true \}\)/);
});

test('最近播放滚动时 3D 上限 20 FPS 且不抬高用户 24 FPS 设置', () => {
  const loop = read('public/js/modules/11-main-loop.js');
  const sandbox = {
    fx: { foregroundFpsMode: 'vsync', maxFps: 0 },
    isDeepBackgroundMode() { return false; },
    isDocumentScrollActive() { return false; },
    isHomeRecentScrollActive() { return true; },
    isVisibleBackgroundMode() { return false; },
    normalizeForegroundFpsMode(value) { return value; },
    foregroundFixedFpsForMode(mode) { return mode === 'vsync' ? 0 : null; },
    foregroundFpsGovernorCap() { return 0; },
    resolveAdaptiveRenderCadence() { return null; },
    currentRenderAdaptiveContext() { return { kind: 'playback', tier: 0 }; },
    RENDER_VISIBLE_VSYNC: false,
    RENDER_INTERACTION_HUGE_FPS: 45,
    RENDER_INTERACTION_LARGE_FPS: 60,
    RENDER_INTERACTION_FPS: 72,
    RENDER_IDLE_HUGE_FPS: 18,
    RENDER_IDLE_LARGE_FPS: 24,
    RENDER_IDLE_FPS: 30,
    RENDER_HUGE_FPS: 30,
    RENDER_LARGE_FPS: 45,
    RENDER_ACTIVE_FPS: 60,
    Math,
  };
  vm.runInNewContext(`${readFunction(loop, 'getAdaptiveRenderFps')};${readFunction(loop, 'applyMaxFpsCap')};`, sandbox);
  vm.runInNewContext('scrollFps = getAdaptiveRenderFps(1000);', sandbox);
  assert.equal(sandbox.scrollFps, 20);
  sandbox.fx.maxFps = 24;
  vm.runInNewContext('fixedScrollFps = applyMaxFpsCap(getAdaptiveRenderFps(1000));', sandbox);
  assert.equal(sandbox.fixedScrollFps, 20);
  assert.match(readFunction(loop, 'shouldSkipAdaptiveRenderFrame'), /applyMaxFpsCap\(cadence \? cadence\.fps : getAdaptiveRenderFps\(now\)\)/);
});

test('所有滚动容器进入同一 20 FPS 渲染预算，滚轮先于 scroll 事件也会降帧', () => {
  const loop = read('public/js/modules/11-main-loop.js');
  const sandbox = {
    fx: { foregroundFpsMode: 'vsync', maxFps: 0 },
    isDeepBackgroundMode() { return false; },
    isDocumentScrollActive() { return true; },
    isVisibleBackgroundMode() { return false; },
    normalizeForegroundFpsMode(value) { return value; },
    foregroundFixedFpsForMode() { return null; },
    foregroundFpsGovernorCap() { return 0; },
    resolveAdaptiveRenderCadence() { return null; },
    currentRenderAdaptiveContext() { return { kind: 'playback', tier: 0 }; },
    RENDER_VISIBLE_VSYNC: false,
    RENDER_INTERACTION_HUGE_FPS: 45,
    RENDER_INTERACTION_LARGE_FPS: 60,
    RENDER_INTERACTION_FPS: 72,
    RENDER_IDLE_HUGE_FPS: 18,
    RENDER_IDLE_LARGE_FPS: 24,
    RENDER_IDLE_FPS: 30,
    RENDER_HUGE_FPS: 30,
    RENDER_LARGE_FPS: 45,
    RENDER_ACTIVE_FPS: 60,
  };
  vm.runInNewContext(`${readFunction(loop, 'getAdaptiveRenderFps')};`, sandbox);
  vm.runInNewContext('scrollFps = getAdaptiveRenderFps(1000);', sandbox);
  assert.equal(sandbox.scrollFps, 20);
  assert.match(loop, /function markDocumentScrollActivity\(/);
  assert.match(loop, /document\.addEventListener\('wheel',\s*markDocumentScrollActivity,\s*\{ passive: true, capture: true \}\)/);
  assert.match(loop, /document\.addEventListener\('scroll',\s*markDocumentScrollActivity,\s*\{ passive: true, capture: true \}\)/);
});

test('搜索、歌单、设置和歌词详情使用原生滚轮滚动，不在每个 wheel 事件接管 scrollTop', () => {
  const shell = read('public/js/modules/06-lyrics/01-playlist-panel-shell.js');
  const bind = readFunction(shell, 'bindSmoothWheelScroll');
  assert.doesNotMatch(bind, /preventDefault\(/, '滚轮不能被 JS 阻断');
  assert.doesNotMatch(bind, /gsap\.to\(/, '滚轮不能为每个事件创建 GSAP scrollTop tween');
  assert.match(bind, /__nativeWheelScrolling\s*=\s*true/);
});

test('最近播放滚动层独立合成且滚动时停用卡片重阴影', () => {
  const css = read('public/css/index.css');
  assert.match(css, /\.home-recent-list\{[^}]*overscroll-behavior:contain[^}]*contain:layout paint[^}]*will-change:scroll-position[^}]*transform:translateZ\(0\)/);
  assert.match(css, /\.home-recent-list\.is-scrolling \.home-recent-card:hover\{[^}]*transform:none[^}]*box-shadow:/);
  assert.match(css, /\.home-recent-card\{[^}]*content-visibility:auto[^}]*contain-intrinsic-size:auto 58px/);
  assert.match(css, /\.home-hero[\s\S]*backdrop-filter:/, '首页玻璃效果必须保留');
});

test('首页最近播放封面只在可视区附近加载，不在渲染列表时一次性请求全部图片', () => {
  const home = read('public/js/modules/05-playback/03-home-discover-weather.js');
  assert.match(home, /function bindHomeRecentCoverLazyLoading\(/);
  assert.match(home, /data-home-recent-cover/);
  assert.match(home, /rootMargin:\s*['"]180px 0px['"]/);
  assert.match(home, /bindHomeRecentCoverLazyLoading\(listEl\)/);
});

test('首页最近播放保留深色滚动条，不显示原生白色轨道', () => {
  const css = read('public/css/index.css');
  assert.match(css, /\.home-recent-list\{[^}]*overflow-y:auto[^}]*scrollbar-width:thin[^}]*scrollbar-color:/);
  assert.match(css, /\.home-recent-list::-webkit-scrollbar\{[^}]*width:6px/);
  assert.match(css, /\.home-recent-list::-webkit-scrollbar-track\{[^}]*background:rgba\(5,9,14,\.40\)/);
  assert.match(css, /\.home-recent-list::-webkit-scrollbar-thumb\{[^}]*background:rgba\(116,130,146,\.42\)/);
  assert.doesNotMatch(css, /\.home-recent-list::-webkit-scrollbar\{[^}]*display:none/);
});

test('Home 只模糊背景画布，离开 Home 后不再保留模糊', () => {
  const css = read('public/css/index.css');
  const homeBlurRule = css.match(/body\.empty-home-active #canvas-container\s*\{[^}]*\}/);
  const previewBlurRule = css.match(/body\.home-wallpaper-preview #canvas-container\s*\{[^}]*\}/);
  assert.ok(homeBlurRule && /filter:\s*blur\(/.test(homeBlurRule[0]), 'Home 可见时背景画布必须模糊');
  assert.ok(previewBlurRule && /filter:\s*blur\(/.test(previewBlurRule[0]), 'Home 壁纸预览不能覆盖背景模糊');
  const home = read('public/js/modules/05-playback/04-home-empty-wallpaper.js');
  assert.match(home, /document\.body\.classList\.remove\('home-wallpaper-preview'\)/);
  assert.match(home, /homeSuppressed\s*=\s*true[\s\S]*?updateEmptyHomeVisibility\(/, '离开 Home 必须撤销背景模糊的状态类');
});

test('负载监视器使用 GPU 文案并保持 CPU 与内存之间', () => {
  const hud = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const cpuRow = hud.indexOf('<span>CPU</span>');
  const gpuRow = hud.indexOf('<span>GPU</span>');
  const memoryRow = hud.indexOf('<span>内存</span>');
  assert.ok(cpuRow >= 0 && gpuRow > cpuRow && memoryRow > gpuRow);
  assert.doesNotMatch(hud, /<span>显卡<\/span>/);
});
