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
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

test('主循环按深后台、失焦、聚焦空闲和活跃状态选择调度', () => {
  const source = read('public/js/modules/11-main-loop.js');
  const state = { deep: false, visibleBackground: false, idle: false, release: false };
  const sandbox = {
    fx: {},
    mainLoopDeepBackgroundSleeping() { return state.deep; },
    isVisibleBackgroundMode() { return state.visibleBackground; },
    isForegroundIdleForRender() { return state.idle; },
    isBackgroundReleaseMode() { return state.release; },
  };
  vm.runInNewContext(`${readFunction(source, 'mainLoopFrameDelayMs')}; result = mainLoopFrameDelayMs(1000);`, sandbox);
  assert.equal(sandbox.result, 0);

  state.visibleBackground = true;
  vm.runInNewContext('result = mainLoopFrameDelayMs(1000);', sandbox);
  assert.equal(sandbox.result, 67);

  state.visibleBackground = false;
  state.idle = true;
  vm.runInNewContext('result = mainLoopFrameDelayMs(1000);', sandbox);
  assert.equal(sandbox.result, 500);
  assert.ok(Math.ceil(3000 / sandbox.result) <= 6, '3 秒空闲唤醒应不超过约 6 次');

  state.deep = true;
  state.idle = false;
  vm.runInNewContext('result = mainLoopFrameDelayMs(1000);', sandbox);
  assert.equal(sandbox.result, 1000);
  state.release = true;
  vm.runInNewContext('result = mainLoopFrameDelayMs(1000);', sandbox);
  assert.equal(sandbox.result, 1500);
  sandbox.fx.desktopLyrics = true;
  vm.runInNewContext('result = mainLoopFrameDelayMs(1000);', sandbox);
  assert.equal(sandbox.result, 250);
});

test('交互会取消休眠定时器并立即请求一帧', () => {
  const mainLoop = read('public/js/modules/11-main-loop.js');
  const rendererQuality = read('public/js/modules/01-scene/00-renderer-quality.js');
  assert.match(rendererQuality, /function markRenderInteraction[\s\S]*wakeMainLoopFromBackground\(\)/);
  assert.match(mainLoop, /function scheduleNextMainLoopFrame[\s\S]*mainLoopFrameDelayMs\(/);
  assert.match(mainLoop, /function wakeMainLoopFromBackground[\s\S]*clearTimeout\(mainLoopBackgroundTimer\)[\s\S]*requestMainLoopAnimationFrame\(\)/);
  assert.match(mainLoop, /audio\.addEventListener\(['"]play['"],\s*wakeMainLoopFromBackground\)/);
});

test('自动性能治理跳过主动空闲降帧', () => {
  const source = read('public/js/modules/00-state/08-desktop-render-power.js');
  assert.match(source, /isForegroundIdleForRender\(now\)[\s\S]{0,240}autoGov\.jankVotes = 0/);
});

test('主循环调度会执行定时帧且唤醒时取消等待', () => {
  const source = read('public/js/modules/11-main-loop.js');
  let delay = 500;
  let timeoutCallback = null;
  let clearedTimer = 0;
  let animationCallback = null;
  const sandbox = {
    mainLoopBackgroundTimer: 0,
    mainLoopAnimationRequested: false,
    mainLoopFrameDelayMs() { return delay; },
    performance: { now() { return 1000; } },
    setTimeout(callback, wait) {
      assert.equal(wait, delay);
      timeoutCallback = callback;
      return 41;
    },
    clearTimeout(timer) { clearedTimer = timer; },
    requestAnimationFrame(callback) { animationCallback = callback; return 77; },
    animate() {},
  };
  vm.runInNewContext(
    `${readFunction(source, 'requestMainLoopAnimationFrame')};`
      + `${readFunction(source, 'scheduleNextMainLoopFrame')};`
      + `${readFunction(source, 'wakeMainLoopFromBackground')};`
      + 'scheduleNextMainLoopFrame();',
    sandbox,
  );
  assert.equal(sandbox.mainLoopBackgroundTimer, 41);
  assert.equal(animationCallback, null);

  timeoutCallback();
  assert.equal(sandbox.mainLoopBackgroundTimer, 0);
  assert.equal(animationCallback, sandbox.animate);
  assert.equal(sandbox.mainLoopAnimationRequested, true);

  sandbox.mainLoopAnimationRequested = false;
  animationCallback = null;
  timeoutCallback = null;
  delay = 67;
  vm.runInNewContext('scheduleNextMainLoopFrame(); wakeMainLoopFromBackground();', sandbox);
  assert.equal(clearedTimer, 41);
  assert.equal(sandbox.mainLoopBackgroundTimer, 0);
  assert.equal(animationCallback, sandbox.animate);
});

test('idle guide 禁用且无提示或进入深后台时不再安排帧', () => {
  const idleGuide = read('public/js/modules/09-idle-toast-libraries.js');
  const shelf = read('public/js/modules/04-shelf/00-layout-hover.js');
  const guideState = { deep: false };
  const sandbox = {
    IDLE_GUIDE_BACKGROUND_ENABLED: false,
    shelfHoverCue: { guide: false, target: 0, value: 0 },
    isDeepBackgroundMode() { return guideState.deep; },
  };
  vm.runInNewContext(`${readFunction(idleGuide, 'idleGuideLoopShouldRun')}; result = idleGuideLoopShouldRun();`, sandbox);
  assert.equal(sandbox.result, false);

  sandbox.shelfHoverCue.target = 1;
  vm.runInNewContext('result = idleGuideLoopShouldRun();', sandbox);
  assert.equal(sandbox.result, true);

  guideState.deep = true;
  vm.runInNewContext('result = idleGuideLoopShouldRun();', sandbox);
  assert.equal(sandbox.result, false);

  assert.match(idleGuide, /function stopIdleGuideLoop[\s\S]*cancelAnimationFrame\(idleGuideAnimationFrame\)/);
  assert.match(idleGuide, /function wakeIdleGuideLoop\(\)/);
  assert.match(idleGuide, /visibilitychange[\s\S]*stopIdleGuideLoop\(true\)/);
  assert.match(shelf, /function setShelfGuideCueActive[\s\S]*wakeIdleGuideLoop\(\)/);
  assert.match(shelf, /function updateShelfHoverCueFromPointer[\s\S]*wakeIdleGuideLoop\(\)/);
});

test('普通鼠标移动且歌架提示未激活时不唤醒 idle guide', () => {
  const shelf = read('public/js/modules/04-shelf/00-layout-hover.js');
  let wakeCount = 0;
  let shouldRun = false;
  const sandbox = {
    shelfHoverCue: {
      guide: false,
      target: 0,
      value: 0,
      zoneActive: false,
      enteredAt: 0,
      x: 0,
      y: 0,
      lastAt: 0,
    },
    shelfPlaybackSwitchGuardActive() { return false; },
    canShowShelfHoverCueAt() { return false; },
    idleGuideLoopShouldRun() { return shouldRun; },
    wakeIdleGuideLoop() { wakeCount += 1; },
    performance: { now() { return 1000; } },
  };
  vm.runInNewContext(
    `${readFunction(shelf, 'updateShelfHoverCueFromPointer')}; updateShelfHoverCueFromPointer({ clientX: 20, clientY: 30 });`,
    sandbox,
  );
  assert.equal(wakeCount, 0);

  shouldRun = true;
  vm.runInNewContext('updateShelfHoverCueFromPointer({ clientX: 40, clientY: 50 });', sandbox);
  assert.equal(wakeCount, 1);
});

test('进入深后台会清掉尚未淡出的歌架提示残值', () => {
  const idleGuide = read('public/js/modules/09-idle-toast-libraries.js');
  const sandbox = {
    idleGuideDelayTimer: 17,
    idleGuideAnimationFrame: 23,
    idleGuideCtx: { clearRect() {} },
    idleGuideW: 100,
    idleGuideH: 80,
    shelfHoverCue: {
      guide: false,
      target: 0,
      value: 0.64,
      zoneActive: false,
      enteredAt: 900,
    },
    clearTimeout() {},
    cancelAnimationFrame() {},
    resetIdleGuideTrails() {},
    setIdleGuideVisible() {},
  };
  vm.runInNewContext(`${readFunction(idleGuide, 'stopIdleGuideLoop')}; stopIdleGuideLoop(true, true);`, sandbox);
  assert.equal(sandbox.shelfHoverCue.value, 0);
  assert.equal(sandbox.shelfHoverCue.enteredAt, 0);
});
