// ============================================================
var scene = new THREE.Scene();
scene.background = null;
var camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
// 0 = display vsync. Foreground visible motion must keep VSync cadence.
var RENDER_VISIBLE_VSYNC = true;
var RENDER_IDLE_FPS = 72;
var RENDER_IDLE_LARGE_FPS = 60;
var RENDER_IDLE_HUGE_FPS = 48;
var RENDER_ACTIVE_FPS = 90;
var RENDER_LARGE_FPS = 75;
var RENDER_HUGE_FPS = 60;
var RENDER_INTERACTION_FPS = 0;
var RENDER_INTERACTION_LARGE_FPS = 90;
var RENDER_INTERACTION_HUGE_FPS = 75;
var RENDER_INTERACTION_HOLD_MS = 900;
var renderInteractionBoostUntil = 0;
var renderInteractionReason = '';
var renderRefreshState = {
  lastRafAt: 0,
  hz: 60,
  stableHz: 60,
  samples: []
};
var adaptiveFrameLoadState = {
  avgMs: 0,
  lastCostMs: 0,
  lastTargetFps: 0,
  pressure: 0,
  level: 0
};
function roundRenderNumber(value, digits) {
  var scale = Math.pow(10, digits || 0);
  return Math.round((Number(value) || 0) * scale) / scale;
}
function sampleDisplayRefreshHz(now) {
  now = Number(now) || performance.now();
  var last = renderRefreshState.lastRafAt || 0;
  renderRefreshState.lastRafAt = now;
  if (!last) return renderRefreshState.stableHz || renderRefreshState.hz || 60;
  var gap = now - last;
  if (gap < 4 || gap > 40) return renderRefreshState.stableHz || renderRefreshState.hz || 60;
  renderRefreshState.samples.push(gap);
  if (renderRefreshState.samples.length > 36) renderRefreshState.samples.shift();
  var sorted = renderRefreshState.samples.slice().sort(function (a, b) { return a - b; });
  var median = sorted[Math.floor(sorted.length / 2)] || gap;
  var hz = Math.max(48, Math.min(240, 1000 / Math.max(1, median)));
  renderRefreshState.hz = hz;
  var stable = renderRefreshState.stableHz || hz;
  renderRefreshState.stableHz = Math.abs(stable - hz) > 18 ? hz : stable * 0.90 + hz * 0.10;
  return renderRefreshState.stableHz;
}
function estimatedDisplayRefreshHz() {
  return Math.max(48, Math.min(240, renderRefreshState.stableHz || renderRefreshState.hz || 60));
}
function adaptiveLoadPressureLevel() {
  return adaptiveFrameLoadState.level || 0;
}
function sampleAdaptiveFrameCost(costMs, targetFps) {
  var cost = Number(costMs);
  if (!isFinite(cost) || cost < 0) return adaptiveFrameLoadSnapshot();
  var fps = Math.max(1, Number(targetFps) || estimatedDisplayRefreshHz());
  var budget = (1000 / fps) * 0.78;
  adaptiveFrameLoadState.lastCostMs = cost;
  adaptiveFrameLoadState.lastTargetFps = fps;
  adaptiveFrameLoadState.avgMs = adaptiveFrameLoadState.avgMs
    ? adaptiveFrameLoadState.avgMs * 0.92 + cost * 0.08
    : cost;
  if (adaptiveFrameLoadState.avgMs > budget) {
    adaptiveFrameLoadState.pressure = Math.min(8, adaptiveFrameLoadState.pressure + 0.70);
  } else if (adaptiveFrameLoadState.avgMs < budget * 0.62) {
    adaptiveFrameLoadState.pressure = Math.max(0, adaptiveFrameLoadState.pressure - 0.30);
  } else {
    adaptiveFrameLoadState.pressure = Math.max(0, adaptiveFrameLoadState.pressure - 0.10);
  }
  adaptiveFrameLoadState.level = adaptiveFrameLoadState.pressure >= 4 ? 2 : (adaptiveFrameLoadState.pressure >= 2 ? 1 : 0);
  return adaptiveFrameLoadSnapshot();
}
function adaptiveFrameLoadSnapshot() {
  return {
    avgMs: roundRenderNumber(adaptiveFrameLoadState.avgMs, 3),
    lastCostMs: roundRenderNumber(adaptiveFrameLoadState.lastCostMs, 3),
    lastTargetFps: roundRenderNumber(adaptiveFrameLoadState.lastTargetFps, 1),
    pressure: roundRenderNumber(adaptiveFrameLoadState.pressure, 2),
    level: adaptiveFrameLoadState.level || 0
  };
}
function clampAdaptiveCadenceDivisor(displayHz, divisor, minFps) {
  divisor = Math.max(1, Math.round(Number(divisor) || 1));
  minFps = Math.max(1, Number(minFps) || 60);
  while (divisor > 1 && displayHz / divisor < minFps) divisor--;
  return divisor;
}
function selectAdaptiveRenderCadence(kind, tier) {
  var displayHz = estimatedDisplayRefreshHz();
  var pressure = adaptiveLoadPressureLevel();
  var budgetLevel = (typeof runtimePerfBudgetLevel === 'function') ? runtimePerfBudgetLevel() : 2;
  var divisor = 1;
  kind = kind || 'playback';
  tier = Math.max(0, Number(tier) || 0);
  if (kind === 'idle') {
    divisor = (displayHz >= 144 && (tier >= 1 || budgetLevel <= 0)) ? 2 : 1;
  } else if (kind === 'playback') {
    divisor = (displayHz >= 190 && (tier >= 2 || pressure >= 1)) ? 2 : 1;
  } else if (kind === 'interaction') {
    divisor = 1;
  }
  if (kind !== 'interaction') {
    if (budgetLevel <= 0 && pressure >= 2 && displayHz >= 118) divisor = Math.max(divisor, 2);
    else if (budgetLevel === 1 && pressure >= 2 && displayHz >= 144) divisor = Math.max(divisor, 2);
    if (pressure >= 3 && displayHz >= 180) divisor = Math.max(divisor, 3);
  }
  divisor = clampAdaptiveCadenceDivisor(displayHz, divisor, kind === 'idle' ? 48 : 60);
  return {
    fps: Math.max(1, Math.round(displayHz / divisor)),
    divisor: divisor,
    displayHz: roundRenderNumber(displayHz, 1),
    kind: kind,
    tier: tier,
    pressure: pressure
  };
}
var RENDER_SCALE_KEY = 'mineradio-render-scale-v1';
var _renderScale = (function () { try { var v = parseFloat(localStorage.getItem(RENDER_SCALE_KEY)); return (v > 0) ? Math.max(0.7, Math.min(v, 3)) : 1.0; } catch (e) { return 1.0; } })();
function getRenderScale() { return _renderScale; }
function renderScaleResLabel() { var s = getRenderScale(); return Math.round(innerWidth * s) + ' × ' + Math.round(innerHeight * s); }
function setRenderScale(v) { _renderScale = Math.max(0.7, Math.min(parseFloat(v) || 1, 3)); try { localStorage.setItem(RENDER_SCALE_KEY, _renderScale); } catch (e) { } if (typeof applyRendererPowerMode === 'function') applyRendererPowerMode(); }
// 绝对渲染缓冲像素上限:无风扇 M4 核显跑重体素着色器,满屏 2940×1846(≈540 万像素)实测仅 9-13fps。
// 不管窗口多大、治理器降到哪,都把 3D 绘制缓冲钳到此像素数以内 —— 只软化 WebGL 场景清晰度,歌词/UI 是 DOM 始终清晰。
// 无风扇机的救命闸:一个 4K/大窗口不会再把 GPU 直接压死。要更清晰/更省分别调大/调小。
var MAX_RENDER_BUFFER_PX = 1600000;   // ≈ 1730×925;约为满屏 2940×1846 的 1/3.4 像素 → 目标把 ~9fps 拉回 ~25-30fps
function getRenderPixelRatio() {
  var device = window.devicePixelRatio || 1;
  if (isDeepBackgroundMode()) return Math.min(device, 0.30);
  // 分辨率滑块 = 用户设定的天花板(所见即所得)。auto 档下自适应治理器只在此天花板之下、按实测帧率向下微调像素比,
  // 绝不写回滑块 / localStorage;非 auto 或治理器未就绪时乘子恒为 1。
  var ratio = Math.max(0.5, Math.min(getRenderScale(), 3));
  var isAuto = (typeof normalizePerformanceQuality === 'function')
    ? normalizePerformanceQuality(fx && fx.performanceQuality) === 'auto'
    : String(fx && fx.performanceQuality) === 'auto';
  if (isAuto && typeof autoGovScaleMul === 'function') ratio *= autoGovScaleMul();
  // 绝对缓冲上限(见上):大窗口下把像素比再压到缓冲不超过 MAX_RENDER_BUFFER_PX;地板 0.4 保证场景不糊到不可辨。
  var cssPx = Math.max(1, innerWidth * innerHeight);
  var capRatio = Math.sqrt(MAX_RENDER_BUFFER_PX / cssPx);
  if (ratio > capRatio) ratio = Math.max(0.4, capRatio);
  return ratio;
}
function getRenderPixelLoad() {
  var ratio = getRenderPixelRatio();
  return Math.max(1, innerWidth * innerHeight) * ratio * ratio;
}
function markRenderInteraction(reason, holdMs) {
  if (isDeepBackgroundMode()) return;
  var now = performance.now();
  renderInteractionBoostUntil = Math.max(renderInteractionBoostUntil, now + (holdMs || RENDER_INTERACTION_HOLD_MS));
  renderInteractionReason = reason || renderInteractionReason || 'interaction';
  if (typeof renderPerfState !== 'undefined' && renderPerfState) renderPerfState.lastRenderAt = 0;
  if (typeof wakeMainLoopFromBackground === 'function') wakeMainLoopFromBackground();
}
function isRenderInteractionActive(now) {
  return (now || performance.now()) < renderInteractionBoostUntil;
}
function getRenderLoadTier() {
  var cssPixels = Math.max(1, innerWidth * innerHeight);
  var renderPixels = (typeof getRenderPixelLoad === 'function') ? getRenderPixelLoad() : cssPixels;
  if (cssPixels >= 7200000 || renderPixels >= 5000000) return 2;
  if (cssPixels >= 3200000 || renderPixels >= 3600000) return 1;
  return 0;
}
var mainGpuPowerPreference = window.MineradioGpuMode
  ? window.MineradioGpuMode.powerPreferenceForMode(window.MineradioGpuMode.readMode(window.localStorage))
  : 'default';

// GPU 计时查询不会等待显卡；结果没准备好时直接留到下次读取。
function createRendererGpuTimer(gl, nowFn) {
  if (!gl || typeof gl.getExtension !== 'function') return null;
  nowFn = typeof nowFn === 'function' ? nowFn : function () { return performance.now(); };
  var ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  var webgl2 = !!(ext && typeof gl.createQuery === 'function' && typeof gl.beginQuery === 'function');
  if (!webgl2) ext = gl.getExtension('EXT_disjoint_timer_query');
  if (!ext) return null;
  var webgl1 = !webgl2 && typeof ext.createQueryEXT === 'function' && typeof ext.beginQueryEXT === 'function';
  if (!webgl2 && !webgl1) return null;

  var pending = [];
  var active = null;
  var previous = null;
  var previousStartedAt = 0;
  var usagePct = null;

  function deleteQuery(query) {
    try {
      if (webgl2) gl.deleteQuery(query);
      else ext.deleteQueryEXT(query);
    } catch (e) {}
  }
  function resetPending() {
    for (var i = 0; i < pending.length; i++) deleteQuery(pending[i].query);
    pending.length = 0;
    active = null;
    previous = null;
  }
  function poll() {
    try {
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        resetPending();
        usagePct = null;
        return;
      }
      while (pending.length) {
        var item = pending[0];
        var ready = webgl2
          ? gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)
          : ext.getQueryObjectEXT(item.query, ext.QUERY_RESULT_AVAILABLE_EXT);
        if (!ready) break;
        var nanoseconds = webgl2
          ? gl.getQueryParameter(item.query, gl.QUERY_RESULT)
          : ext.getQueryObjectEXT(item.query, ext.QUERY_RESULT_EXT);
        pending.shift();
        deleteQuery(item.query);
        if (item.periodMs > 0 && typeof nanoseconds === 'number' && isFinite(nanoseconds)) {
          var next = Math.max(0, Math.min(100, nanoseconds / 1000000 / item.periodMs * 100));
          usagePct = usagePct == null ? next : usagePct * 0.72 + next * 0.28;
        }
      }
    } catch (e) {
      resetPending();
      usagePct = null;
    }
  }
  return {
    begin: function (periodMs) {
      if (active) return false;
      var now = nowFn();
      if (previous && !(previous.periodMs > 0)) previous.periodMs = Math.max(1, now - previousStartedAt);
      poll();
      if (pending.length >= 4) return false;
      var query = webgl2 ? gl.createQuery() : ext.createQueryEXT();
      if (!query) return false;
      var item = { query: query, periodMs: Number(periodMs) > 0 ? Number(periodMs) : 0 };
      try {
        if (webgl2) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        else ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, query);
      } catch (e) {
        deleteQuery(query);
        return false;
      }
      pending.push(item);
      active = item;
      previous = item;
      previousStartedAt = now;
      return true;
    },
    end: function () {
      if (!active) return false;
      try {
        if (webgl2) gl.endQuery(ext.TIME_ELAPSED_EXT);
        else ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
      } catch (e) {
        resetPending();
        usagePct = null;
        return false;
      }
      active = null;
      return true;
    },
    value: function () { poll(); return usagePct; },
    dispose: resetPending
  };
}

var renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: mainGpuPowerPreference });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(getRenderPixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.background = 'transparent';
renderer.domElement.style.display = 'block';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.tabIndex = 0;
document.getElementById('canvas-container').appendChild(renderer.domElement);

var rendererGpuTimer = createRendererGpuTimer(renderer.getContext());
var rendererGpuSampleLastAt = 0;
function rendererGpuUsagePct() {
  return rendererGpuTimer ? rendererGpuTimer.value() : null;
}
function beginRendererGpuSample() {
  if (!rendererGpuTimer || typeof perfHudOn !== 'function' || !perfHudOn()) return false;
  var now = performance.now();
  if (now - rendererGpuSampleLastAt < 250) return false;
  rendererGpuSampleLastAt = now;
  var fps = (typeof renderPerfState !== 'undefined' && renderPerfState && renderPerfState.fps) || 0;
  return rendererGpuTimer.begin(fps > 0 ? 1000 / fps : 0);
}
function renderMainSceneWithGpuSample(sceneRef, cameraRef) {
  var sampled = beginRendererGpuSample();
  try { renderer.render(sceneRef, cameraRef); }
  finally { if (sampled && rendererGpuTimer) rendererGpuTimer.end(); }
}

// WebGL 上下文丢失处理（修复"窗口全黑"bug）。
// GPU 压力大或驱动异常时会触发 webglcontextlost，画面变黑且不自动恢复。
// 监听该事件：阻止默认行为，延迟 2 秒尝试恢复；仍失败则刷新页面（最可靠的恢复）。
var _webglContextLostAt = 0;
renderer.domElement.addEventListener('webglcontextlost', function (event) {
  event.preventDefault();  // 阻止默认，允许后续恢复
  if (rendererGpuTimer) rendererGpuTimer.dispose();
  rendererGpuTimer = null;
  _webglContextLostAt = Date.now();
  console.error('[WebGL] 上下文丢失，画面将变黑。2 秒后尝试恢复...');
  if (typeof showToast === 'function') {
    try { showToast('画面渲染异常，正在恢复...'); } catch (e) {}
  }
}, false);
renderer.domElement.addEventListener('webglcontextrestored', function () {
  console.log('[WebGL] 上下文已恢复');
  _webglContextLostAt = 0;
  try {
    renderer.setPixelRatio(getRenderPixelRatio());
    renderer.setSize(innerWidth, innerHeight);
    rendererGpuTimer = createRendererGpuTimer(renderer.getContext());
    rendererGpuSampleLastAt = 0;
  } catch (e) {}
}, false);
// 兜底：上下文丢失 5 秒还没恢复 → 刷新页面（最可靠的重置）
setInterval(function () {
  if (_webglContextLostAt && Date.now() - _webglContextLostAt > 5000) {
    console.error('[WebGL] 上下文 5 秒未恢复，刷新页面');
    try { location.reload(); } catch (e) {}
  }
}, 1000);

// ============================================================
//  相机系统 v7.1 — 分离 user offset / cinema offset
//   - userOrbit: 用户拖拽的目标 (永久保留, 不会被电影模式覆盖)
//   - cinemaOffset: 电影模式的微偏移 (始终叠加, 即使用户在拖)
//   - 最终 theta = userOrbit.theta + cinemaOffset.theta
//   - 回正按钮 / 双击屏幕: 让 userOrbit 缓慢归零
