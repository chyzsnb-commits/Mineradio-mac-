function pulseObjectValue(target, key, amount, duration) {
  if (!target) return;
  target[key] = Math.max(target[key] || 0, amount || 1);
  if (window.gsap) {
    window.gsap.killTweensOf(target, key);
    var vars = { duration: duration || 0.42, ease: 'power3.out' };
    vars[key] = 0;
    window.gsap.to(target, vars);
  } else {
    setTimeout(function () { if (target) target[key] = 0; }, (duration || 0.42) * 1000);
  }
}

var desktopRuntimeState = {
  desktop: !!window.desktopWindow,
  minimized: false,
  visible: true,
  focused: true,
  occluded: false,
  fullscreen: false
};
var renderPowerState = { mode: '', width: 0, height: 0, pixelRatio: 0 };
var backgroundCacheTrimTimer = 0;
var backgroundAppMemoryTrimTimer = 0;
var backgroundAppMemoryTrimInFlight = false;
var runtimePerfState = {
  lastCacheTrimAt: 0,
  lastAppMemoryTrimAt: 0,
  lastAppMemoryTrimReason: '',
  lastAppMemoryTrimResult: null,
  cacheTrimCount: 0,
  lastCacheTrimReason: '',
  lastHeapSampleAt: 0,
  heapMB: 0,
  cacheCounts: {}
};
var runtimeGpuDiagnostics = null;
var runtimeGpuDiagnosticsError = '';
var runtimeHardwareProfile = detectRuntimeHardwareProfile();
function detectRuntimeHardwareProfile() {
  var nav = window.navigator || {};
  var cores = Number(nav.hardwareConcurrency) || 0;
  var memory = Number(nav.deviceMemory) || 0;
  var dpr = Number(window.devicePixelRatio) || 1;
  var cssPixels = Math.max(1, (Number(window.innerWidth) || 1) * (Number(window.innerHeight) || 1));
  var renderPixels = cssPixels * dpr * dpr;
  var lowCore = cores > 0 && cores <= 4;
  var lowMemory = memory > 0 && memory <= 4;
  var largeSurface = renderPixels >= 4200000;
  var veryLargeSurface = renderPixels >= 7200000;
  var lowSpec = lowCore || lowMemory || (cores > 0 && cores <= 6 && veryLargeSurface);
  var balancedSpec = lowSpec || (cores > 0 && cores <= 8) || largeSurface;
  return {
    cores: cores,
    deviceMemoryGB: memory,
    devicePixelRatio: dpr,
    cssPixels: cssPixels,
    renderPixels: Math.round(renderPixels),
    lowCore: lowCore,
    lowMemory: lowMemory,
    largeSurface: largeSurface,
    veryLargeSurface: veryLargeSurface,
    lowSpec: lowSpec,
    balancedSpec: balancedSpec
  };
}
function refreshRuntimeHardwareSurfaceProfile() {
  var next = detectRuntimeHardwareProfile();
  runtimeHardwareProfile.devicePixelRatio = next.devicePixelRatio;
  runtimeHardwareProfile.cssPixels = next.cssPixels;
  runtimeHardwareProfile.renderPixels = next.renderPixels;
  runtimeHardwareProfile.largeSurface = next.largeSurface;
  runtimeHardwareProfile.veryLargeSurface = next.veryLargeSurface;
  runtimeHardwareProfile.lowSpec = runtimeHardwareProfile.lowCore || runtimeHardwareProfile.lowMemory || (runtimeHardwareProfile.cores > 0 && runtimeHardwareProfile.cores <= 6 && next.veryLargeSurface);
  runtimeHardwareProfile.balancedSpec = runtimeHardwareProfile.lowSpec || (runtimeHardwareProfile.cores > 0 && runtimeHardwareProfile.cores <= 8) || next.largeSurface;
  return runtimeHardwareProfile;
}
function resolveAutoPerformanceQuality() {
  // 自适应治理器就绪(有近 5s 内有效样本)时,用实测帧率决定的 rank 映射档名(0 eco/1 balanced/2 high/3 ultra);
  // 否则回落下方原静态硬件档实现(冷启动 / 后台 / splash 无样本期)。
  if (typeof autoGov !== 'undefined' && autoGov && autoGov.lastSampleAt
      && (performance.now() - autoGov.lastSampleAt) < 5000) {
    return AUTO_GOV_RANK_NAMES[autoGov.rank] || 'high';
  }
  var profile = runtimeHardwareProfile || detectRuntimeHardwareProfile();
  if (profile.lowSpec) return 'eco';
  if (profile.balancedSpec) return 'balanced';
  return 'ultra';
}
function performanceQualityRank() {
  var quality = (typeof normalizePerformanceQuality === 'function')
    ? normalizePerformanceQuality(fx && fx.performanceQuality)
    : String(fx && fx.performanceQuality || 'balanced');
  if (quality === 'auto') quality = resolveAutoPerformanceQuality();
  if (quality === 'eco') return 0;
  if (quality === 'balanced') return 1;
  if (quality === 'ultra') return 3;
  return 2;
}
function runtimePerfBudgetLevel() {
  var rank = performanceQualityRank();
  var profile = runtimeHardwareProfile || detectRuntimeHardwareProfile();
  if (rank <= 0) return 0;
  if (profile.lowSpec && rank <= 2) return 0;
  if (rank <= 1 || (profile.balancedSpec && rank <= 2)) return 1;
  if (rank >= 3 && !profile.lowSpec) return 3;
  return 2;
}
function runtimePerfScale() {
  var level = runtimePerfBudgetLevel();
  return level <= 0 ? 0.72 : (level === 1 ? 0.84 : (level >= 3 ? 1.08 : 1.0));
}
// 供体素等子系统挂钩:eco(level 0)时禁流星/新增粒子
function perfTierAllowsVoxExtras() { return runtimePerfBudgetLevel() > 0; }
function runtimeAudioAnalysisScale() {
  if (isDeepBackgroundMode()) return 0.18;
  var level = runtimePerfBudgetLevel();
  var profile = runtimeHardwareProfile || detectRuntimeHardwareProfile();
  if (level <= 0) return profile.lowMemory ? 0.62 : 0.68;
  if (level === 1) return 0.78;
  if (level >= 3) return 1.0;
  return 0.90;
}
function runtimeAnalysisStride(kind, length) {
  length = Math.max(1, Number(length) || 1);
  var level = runtimePerfBudgetLevel();
  if (kind === 'time') {
    if (level <= 0) return Math.max(2, Math.floor(length / 512));
    if (level === 1) return Math.max(1, Math.floor(length / 768));
    return 1;
  }
  if (kind === 'wide-band') {
    if (level <= 0) return 3;
    if (level === 1) return 2;
    return 1;
  }
  return 1;
}
function isDeepBackgroundMode() {
  if (isLiveBackgroundKeepMode()) return false;
  return !!(document.hidden || desktopRuntimeState.minimized || desktopRuntimeState.visible === false || desktopRuntimeState.occluded);
}
function currentPerformanceBackgroundMode() {
  return normalizePerformanceBackgroundMode(fx && fx.performanceBackground, fx && fx.liveBackgroundKeep === true);
}
function isLiveBackgroundKeepMode() {
  return currentPerformanceBackgroundMode() === 'keep';
}
function isBackgroundReleaseMode() {
  return currentPerformanceBackgroundMode() === 'release';
}
function isHiddenForBackgroundOptimization() {
  return !!(document.hidden && !isLiveBackgroundKeepMode());
}
function isVisibleBackgroundMode() {
  // 恢复 1.1.0 的逻辑：窗口可见 + 没最小化 + 没聚焦（用户在用别的软件）→ 进低帧模式。
  // 1.1.3 曾把这里改成 return false，导致切到别的软件时仍满帧渲染 → 发烫。
  // 现在恢复：失去焦点即降到 RENDER_BACKGROUND_FPS（15 FPS），大幅降温。
  if (isLiveBackgroundKeepMode()) return false;
  return !!(!document.hidden
    && !desktopRuntimeState.minimized
    && desktopRuntimeState.visible !== false
    && !desktopRuntimeState.focused);
}
function updateRenderPowerClasses() {
  document.body.classList.toggle('render-deep-sleep', isDeepBackgroundMode());
  document.body.classList.toggle('render-background-eco', isVisibleBackgroundMode());
}
function safeObjectKeys(obj) {
  try { return obj ? Object.keys(obj) : []; } catch (e) { return []; }
}
function markProtectedKey(map, key) {
  if (key) map[String(key)] = true;
}
function collectProtectedCoverUrls() {
  var keep = Object.create(null);
  function mark(url) { if (url) keep[String(url)] = true; }
  try {
    var song = (typeof currentCoverSong === 'function') ? currentCoverSong() : (playQueue && currentIdx >= 0 ? playQueue[currentIdx] : null);
    if (song) {
      mark(song.cover);
      if (typeof songCoverSrc === 'function') {
        mark(songCoverSrc(song, 60));
        mark(songCoverSrc(song, 360));
        mark(songCoverSrc(song, 400));
      }
    }
    if (typeof currentCoverSource !== 'undefined' && currentCoverSource && currentCoverSource.src) mark(currentCoverSource.src);
    if (typeof playlistPanelDetailState !== 'undefined' && playlistPanelDetailState && playlistPanelDetailState.playlist) {
      var cover = playlistPanelDetailState.playlist.cover;
      mark(cover);
      if (typeof coverUrlWithSize === 'function') {
        mark(coverUrlWithSize(cover, 88));
        mark(coverUrlWithSize(cover, 96));
      }
    }
    if (shelfManager && shelfManager.getCards) {
      shelfManager.getCards().forEach(function (card) {
        if (card && card.item) mark(card.item.cover);
      });
    }
  } catch (e) { }
  return keep;
}
function collectProtectedBeatMapKeys() {
  var keep = Object.create(null);
  try {
    if (typeof beatMapSongKey === 'function' && playQueue && playQueue.length) {
      var start = Math.max(0, currentIdx - 5);
      var end = Math.min(playQueue.length - 1, currentIdx + 5);
      for (var i = start; i <= end; i++) markProtectedKey(keep, beatMapSongKey(playQueue[i]));
    }
    if (typeof beatPrefetchLastKey !== 'undefined') markProtectedKey(keep, beatPrefetchLastKey);
    if (typeof djMode !== 'undefined' && djMode && djMode.songKey) markProtectedKey(keep, djMode.songKey);
    if (typeof localBeatAnalysis !== 'undefined' && localBeatAnalysis && localBeatAnalysis.song && typeof beatMapSongKey === 'function') {
      markProtectedKey(keep, beatMapSongKey(localBeatAnalysis.song));
    }
  } catch (e) { }
  return keep;
}
function collectProtectedCoverDepthIds() {
  var keep = Object.create(null);
  try {
    if (typeof coverDepthCacheId !== 'function') return keep;
    var candidates = [];
    if (typeof currentCoverSource !== 'undefined' && currentCoverSource && currentCoverSource.src) candidates.push(currentCoverSource.src);
    var song = (typeof currentCoverSong === 'function') ? currentCoverSong() : null;
    if (song && typeof songCoverSrc === 'function') {
      candidates.push(songCoverSrc(song, 360));
      candidates.push(songCoverSrc(song, 400));
    }
    var texImg = (typeof coverTex !== 'undefined' && coverTex && coverTex.image) ? coverTex.image : null;
    var w = texImg && texImg.width ? texImg.width : 0;
    var h = texImg && texImg.height ? texImg.height : 0;
    candidates.forEach(function (src) {
      if (src) markProtectedKey(keep, coverDepthCacheId(src + '|tex=' + w + 'x' + h));
    });
  } catch (e) { }
  return keep;
}
function trimObjectCache(cache, keep, protectedKeys, skipRecord) {
  var keys = safeObjectKeys(cache);
  if (!cache || keys.length <= keep) return 0;
  var drop = keys.length - keep;
  var dropped = 0;
  for (var i = 0; i < keys.length && drop > 0; i++) {
    var key = keys[i];
    if (protectedKeys && protectedKeys[key]) continue;
    var rec = cache[key];
    if (skipRecord && skipRecord(rec, key)) continue;
    delete cache[key];
    drop--;
    dropped++;
  }
  return dropped;
}
function trimCoverDepthCache(keep, protectedKeys) {
  if (!coverDepthCache || !coverDepthCacheKeys) return 0;
  var keys = coverDepthCacheKeys.filter(function (key) { return !!coverDepthCache[key]; });
  if (keys.length <= keep) {
    coverDepthCacheKeys = keys;
    return 0;
  }
  var keepSet = Object.create(null);
  var count = 0;
  for (var i = keys.length - 1; i >= 0 && count < keep; i--) {
    keepSet[keys[i]] = true;
    count++;
  }
  Object.keys(protectedKeys || {}).forEach(function (key) { keepSet[key] = true; });
  var dropped = 0;
  keys.forEach(function (key) {
    if (keepSet[key]) return;
    delete coverDepthCache[key];
    dropped++;
  });
  coverDepthCacheKeys = keys.filter(function (key) { return !!coverDepthCache[key]; });
  return dropped;
}
function collectRuntimePerfSnapshot(now) {
  now = now || performance.now();
  runtimePerfState.cacheCounts = {
    playlistCovers: safeObjectKeys(playlistCoverCache).length,
    coverDepth: coverDepthCacheKeys ? coverDepthCacheKeys.length : 0,
    beatMaps: safeObjectKeys(beatMapCache).length,
    djBeatMaps: safeObjectKeys(djBeatMapCache).length,
    stageLyricTrack: (typeof stageLyricTrackCache !== 'undefined' && stageLyricTrackCache && stageLyricTrackCache.entries) ? stageLyricTrackCache.entries.length : 0
  };
  if (performance && performance.memory && now - runtimePerfState.lastHeapSampleAt > 12000) {
    runtimePerfState.lastHeapSampleAt = now;
    runtimePerfState.heapMB = Math.round((performance.memory.usedJSHeapSize || 0) / 1048576);
  }
  return {
    render: (typeof renderPerfState !== 'undefined') ? {
      mode: renderPerfState.mode,
      fps: renderPerfState.fps,
      targetFps: renderPerfState.targetFps,
      displayHz: renderPerfState.displayHz,
      adaptiveDivisor: renderPerfState.adaptiveDivisor,
      adaptiveKind: renderPerfState.adaptiveKind,
      adaptivePressure: renderPerfState.adaptivePressure,
      adaptiveFrameCostMs: renderPerfState.adaptiveFrameCostMs,
      foregroundFpsMode: renderPerfState.foregroundFpsMode,
      interactionBoost: renderPerfState.interactionBoost,
      skipped: renderPerfState.skipped,
      longFrames: renderPerfState.longFrames
    } : null,
    runtime: runtimePerfState,
    gpu: runtimeGpuDiagnostics || (runtimeGpuDiagnosticsError ? { error: runtimeGpuDiagnosticsError } : null),
    hardware: refreshRuntimeHardwareSurfaceProfile(),
    budget: {
      qualityRank: performanceQualityRank(),
      level: runtimePerfBudgetLevel(),
      perfScale: runtimePerfScale(),
      audioScale: runtimeAudioAnalysisScale()
    },
    renderer: (typeof renderer !== 'undefined' && renderer && renderer.info) ? {
      geometries: renderer.info.memory && renderer.info.memory.geometries,
      textures: renderer.info.memory && renderer.info.memory.textures,
      calls: renderer.info.render && renderer.info.render.calls,
      triangles: renderer.info.render && renderer.info.render.triangles
    } : null,
    viewport: (typeof renderer !== 'undefined' && renderer && renderer.domElement) ? {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      renderPixelRatio: renderer.getPixelRatio ? Number(renderer.getPixelRatio().toFixed(3)) : 0,
      canvasWidth: renderer.domElement.width || 0,
      canvasHeight: renderer.domElement.height || 0,
      renderPixels: (renderer.domElement.width || 0) * (renderer.domElement.height || 0),
      targetFps: (typeof getAdaptiveRenderFps === 'function') ? getAdaptiveRenderFps(now) : 0,
      displayHz: (typeof estimatedDisplayRefreshHz === 'function') ? Math.round(estimatedDisplayRefreshHz() * 10) / 10 : 0,
      adaptiveLoad: (typeof adaptiveFrameLoadSnapshot === 'function') ? adaptiveFrameLoadSnapshot() : null,
      foregroundFpsMode: (typeof normalizeForegroundFpsMode === 'function') ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode) : '',
      interactionBoost: (typeof isRenderInteractionActive === 'function') ? isRenderInteractionActive() : false,
      interactionReason: (typeof renderInteractionReason !== 'undefined') ? renderInteractionReason : ''
    } : null,
    frameGates: (typeof collectFrameGateSnapshot === 'function' && typeof mainFrameGates !== 'undefined')
      ? collectFrameGateSnapshot(mainFrameGates)
      : null,
    deepSleep: isDeepBackgroundMode(),
    probe: (window.__mineradioPerf && window.__mineradioPerf.summary)
      ? window.__mineradioPerf.summary()
      : null
  };
}
window.__mineradioPerfSnapshot = collectRuntimePerfSnapshot;

function requestBackgroundAppMemoryTrim(reason, delayMs) {
  if (!window.desktopWindow || typeof window.desktopWindow.trimAppMemory !== 'function') return;
  if (!isDeepBackgroundMode() || isLiveBackgroundKeepMode()) return;
  if (fx && fx.memoryAutoTrimApp === false) return;
  if (fx && fx.memoryAutoTrimOnBackground === false) return;
  var now = performance.now();
  if (backgroundAppMemoryTrimInFlight || now - runtimePerfState.lastAppMemoryTrimAt < 30000) return;
  if (backgroundAppMemoryTrimTimer) clearTimeout(backgroundAppMemoryTrimTimer);
  backgroundAppMemoryTrimTimer = setTimeout(function () {
    backgroundAppMemoryTrimTimer = 0;
    if (!isDeepBackgroundMode() || isLiveBackgroundKeepMode() || backgroundAppMemoryTrimInFlight) return;
    if (fx && fx.memoryAutoTrimApp === false) return;
    if (fx && fx.memoryAutoTrimOnBackground === false) return;
    if (fx && fx.memoryAutoSystemTrim && typeof configureMemoryReductFromFx === 'function') {
      configureMemoryReductFromFx('deep-background', true);
    }
    backgroundAppMemoryTrimInFlight = true;
    runtimePerfState.lastAppMemoryTrimAt = performance.now();
    runtimePerfState.lastAppMemoryTrimReason = reason || 'deep-background';
    window.desktopWindow.trimAppMemory({ reason: runtimePerfState.lastAppMemoryTrimReason }).then(function (result) {
      runtimePerfState.lastAppMemoryTrimResult = result || null;
    }).catch(function (error) {
      runtimePerfState.lastAppMemoryTrimResult = { ok: false, error: String(error && error.message || error || 'APP_MEMORY_TRIM_FAILED') };
    }).finally(function () {
      backgroundAppMemoryTrimInFlight = false;
    });
  }, Math.max(500, delayMs || 1800));
}

function trimRuntimeCaches(reason, aggressive) {
  var protectedCovers = collectProtectedCoverUrls();
  var protectedBeats = collectProtectedBeatMapKeys();
  var dropped = 0;
  dropped += trimObjectCache(playlistCoverCache, aggressive ? 72 : 180, protectedCovers, function (rec) {
    return rec && rec.loading;
  });
  dropped += trimCoverDepthCache(aggressive ? 4 : 10, collectProtectedCoverDepthIds());
  dropped += trimObjectCache(beatMapCache, aggressive ? 12 : 36, protectedBeats);
  dropped += trimObjectCache(djBeatMapCache, aggressive ? 4 : 12, protectedBeats);
  if (aggressive && typeof stageLyricTrackCache !== 'undefined' && stageLyricTrackCache) {
    stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
  }
  if (aggressive && typeof renderer !== 'undefined' && renderer && renderer.renderLists && renderer.renderLists.dispose) {
    try { renderer.renderLists.dispose(); } catch (e) { }
  }
  runtimePerfState.lastCacheTrimAt = performance.now();
  runtimePerfState.cacheTrimCount += 1;
  runtimePerfState.lastCacheTrimReason = reason || (aggressive ? 'deep' : 'active');
  collectRuntimePerfSnapshot(runtimePerfState.lastCacheTrimAt);
  return dropped;
}
function trimVisualCachesForBackground() {
  if (!isDeepBackgroundMode()) return;
  trimRuntimeCaches('deep-background', true);
  requestBackgroundAppMemoryTrim('deep-background', isBackgroundReleaseMode() ? 900 : 1800);
}
function scheduleBackgroundCacheTrim() {
  if (!isDeepBackgroundMode()) return;
  if (backgroundCacheTrimTimer) clearTimeout(backgroundCacheTrimTimer);
  backgroundCacheTrimTimer = setTimeout(function () {
    backgroundCacheTrimTimer = 0;
    trimVisualCachesForBackground();
  }, 900);
}
function maybeTrimRuntimeCaches(now) {
  now = now || performance.now();
  var deep = isDeepBackgroundMode();
  var gap = deep ? (isBackgroundReleaseMode() ? 3600 : 7000) : 45000;
  if (!deep && now < 30000) return;
  if (now - runtimePerfState.lastCacheTrimAt < gap) return;
  trimRuntimeCaches(deep ? (isBackgroundReleaseMode() ? 'release-frame' : 'deep-frame') : 'active-frame', deep);
}
function applyRendererPowerMode() {
  if (typeof renderer === 'undefined' || !renderer) return;
  var deep = isDeepBackgroundMode();
  var width = deep ? 4 : Math.max(1, innerWidth);
  var height = deep ? 4 : Math.max(1, innerHeight);
  var pixelRatio = getRenderPixelRatio();
  var mode = deep ? 'sleep' : 'active';
  if (renderPowerState.mode === mode && renderPowerState.width === width && renderPowerState.height === height && Math.abs(renderPowerState.pixelRatio - pixelRatio) < 0.001) return;
  renderPowerState = { mode: mode, width: width, height: height, pixelRatio: pixelRatio };
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  if (typeof uniforms !== 'undefined' && uniforms && uniforms.uPixel) uniforms.uPixel.value = renderer.getPixelRatio();
  if (deep) {
    if (renderer.renderLists && renderer.renderLists.dispose) renderer.renderLists.dispose();
    scheduleBackgroundCacheTrim();
    requestBackgroundAppMemoryTrim('renderer-deep-sleep', isBackgroundReleaseMode() ? 900 : 2200);
  }
}
function updateDesktopRuntimeState(state) {
  state = state || {};
  var wasFullscreen = desktopRuntimeState.fullscreen;
  var wasDeep = isDeepBackgroundMode();
  desktopRuntimeState.desktop = !!window.desktopWindow;
  desktopRuntimeState.minimized = !!state.isMinimized;
  desktopRuntimeState.visible = state.isVisible !== false;
  desktopRuntimeState.focused = state.isFocused !== false;
  desktopRuntimeState.occluded = !!state.isOccluded;
  desktopRuntimeState.fullscreen = !!(state.isFullScreen || state.isNativeFullScreen || state.isHtmlFullScreen || state.isWindowFullScreen);
  updateRenderPowerClasses();
  applyRendererPowerMode();
  if ((desktopRuntimeState.minimized || !desktopRuntimeState.visible) && typeof flushLyricLayoutSave === 'function') {
    flushLyricLayoutSave();
  }
  if (fx && (fx.desktopLyrics || fx.wallpaperMode)) setTimeout(syncDesktopOverlayState, 0);
  if (wasDeep && !isDeepBackgroundMode()) recoverVisualsAfterBackground('desktop-runtime-state');
  if (desktopRuntimeState.fullscreen !== wasFullscreen) scheduleMainRendererViewportRefresh('desktop-runtime-state');
}
function installRenderPowerHooks() {
  updateRenderPowerClasses();
  if (window.desktopWindow && typeof window.desktopWindow.getGpuDiagnostics === 'function') {
    window.desktopWindow.getGpuDiagnostics().then(function (info) {
      runtimeGpuDiagnostics = info || null;
      runtimeGpuDiagnosticsError = '';
    }).catch(function (error) {
      runtimeGpuDiagnosticsError = String(error && error.message || error || 'GPU_DIAGNOSTICS_FAILED');
    });
  }
  document.addEventListener('visibilitychange', function () {
    updateRenderPowerClasses();
    applyRendererPowerMode();
    if (!isDeepBackgroundMode()) recoverVisualsAfterBackground('visibilitychange');
  });
  window.addEventListener('focus', function () {
    desktopRuntimeState.focused = true;
    updateRenderPowerClasses();
    applyRendererPowerMode();
    if (!isDeepBackgroundMode()) recoverVisualsAfterBackground('focus');
  });
  window.addEventListener('blur', function () {
    desktopRuntimeState.focused = false;
    updateRenderPowerClasses();
    applyRendererPowerMode();
  });
  if (window.desktopWindow && typeof window.desktopWindow.onStateChange === 'function') {
    window.desktopWindow.onStateChange(updateDesktopRuntimeState);
    if (typeof window.desktopWindow.getState === 'function') {
      window.desktopWindow.getState().then(updateDesktopRuntimeState).catch(function () { });
    }
  }
}

// ============================================================
//  自适应性能治理器(单一职责):仅在用户「自动」档时,读 window.__mineradioRenderPerf 实测帧率,
//  在「用户分辨率滑块=天花板」之下做两级向下微调 —— rank(真性能:分析步长/流星门/体素额外量,
//  经 resolveAutoPerformanceQuality→performanceQualityRank 生效)与 scaleMul(仅渲染像素比)。
//  自起 1s setInterval 采样,不挂主循环钩子(11-main-loop.js 禁改);状态全存内存,绝不落盘、
//  绝不写 fx.performanceQuality / fx.voxRes / 渲染分辨率滑块。longFrames 累计不清零,故取每秒增量。
var AUTO_GOV_RANK_NAMES = ['eco', 'balanced', 'high', 'ultra'];
var autoGov = {
  rank: 2,                 // 0 eco / 1 balanced / 2 high / 3 ultra —— 初始 high,先稳后升
  scaleMul: 1.0,           // 渲染像素比乘子(0.55–1.0),仅经 getRenderPixelRatio 的 auto 分支生效
  lastStepAt: 0,           // 上次任意升/降步 perf.now()(降 6s / 升 12s 冷却锚点)
  cleanSince: 0,           // 当前连续「干净」样本起点 perf.now();0=当前不干净
  lastSeenFrames: 0,       // 上一 tick 的累计 longFrames 基线(每秒增量用;跳过态也同步以防泄漏)
  lastSampleAt: 0,         // 上次有效采样 perf.now()(resolveAuto 判「近 5s 内有样本」)
  jankVotes: 0,            // 连续 jank 票(累计 2 → 降一步)
  recoveryWindowMs: 12000, // 回升观察期;滞回翻倍(封顶 48s),稳定升档后逐档回落至 12s
  lastStepDir: 0,          // 上一步方向:+1 升 / -1 降 / 0 无(滞回回退判定)
  lastUpKind: '',          // 上一「升步」改的是 'rank' 还是 'scale'(滞回精确回退)
  // —— 前台帧率降档(P1,发热主因直接解):scaleMul/rank 之外再加一级,只降 vsync 目标帧率 ——
  fgFps: 60,               // 前台目标帧率档:60/45/30;仅 auto+vsync+maxFps0 时经 foregroundFpsGovernorCap 生效
  fgOverloadSince: 0,      // scaleMul 触地板(≤0.56)且仍过载的连续起点 perf.now();≥8s → 帧率降一档
  fgCleanSince: 0          // 前台帧率回升观察:连续干净起点 perf.now();≥12s → 帧率升一档(30→45→60)
};
function autoGovScaleMul() { return autoGov.scaleMul; }
function autoGovForegroundFps() { return autoGov.fgFps; }
function autoGovState() {
  return {
    rank: autoGov.rank,
    scaleMul: autoGov.scaleMul,
    jankVotes: autoGov.jankVotes,
    cleanForMs: autoGov.cleanSince ? Math.max(0, performance.now() - autoGov.cleanSince) : 0,
    recoveryWindowMs: autoGov.recoveryWindowMs,
    fgFps: autoGov.fgFps
  };
}
function autoGovStepDown(now) {
  // 先降 scaleMul(便宜、见效快),到下限 0.55 再降 rank(真性能)
  if (autoGov.scaleMul > 0.55 + 1e-6) {
    autoGov.scaleMul = Math.max(0.55, Math.round((autoGov.scaleMul - 0.08) * 100) / 100);
  } else {
    autoGov.rank = Math.max(0, autoGov.rank - 1);
  }
  autoGov.lastStepAt = now;
  autoGov.lastStepDir = -1;
  autoGov.cleanSince = 0;
}
function autoGovStepUp(now) {
  // 先升 rank(恢复真性能特性),到上限 3 再升 scaleMul
  if (autoGov.rank < 3) {
    autoGov.rank += 1;
    autoGov.lastUpKind = 'rank';
  } else if (autoGov.scaleMul < 1.0 - 1e-6) {
    autoGov.scaleMul = Math.min(1.0, Math.round((autoGov.scaleMul + 0.04) * 100) / 100);
    autoGov.lastUpKind = 'scale';
  } else {
    return;   // 已满档(rank 3 / scaleMul 1.0)
  }
  autoGov.lastStepAt = now;
  autoGov.lastStepDir = 1;
  autoGov.cleanSince = now;                                         // 升档后重新计观察期
  autoGov.recoveryWindowMs = Math.max(12000, autoGov.recoveryWindowMs - 6000);   // 稳定后逐档回落
}
function autoGovRollbackUp() {
  // 滞回:精确回退上一「升步」(与 autoGovStepUp 镜像)
  if (autoGov.lastUpKind === 'scale') {
    autoGov.scaleMul = Math.max(0.55, Math.round((autoGov.scaleMul - 0.04) * 100) / 100);
  } else {
    autoGov.rank = Math.max(0, autoGov.rank - 1);
  }
}
function autoGovTick() {
  syncGlassLiteClass();                                            // P4:玻璃降级判定每秒同步(eco / 前台帧率 ≤45),放守卫之前以覆盖非 auto 的 eco 档
  var rp = window.__mineradioRenderPerf;
  if (!rp) return;                                                 // 主循环尚未就绪(11-main-loop 未加载)
  // 三守卫:页面隐藏 / 深后台 / 开屏 —— 任一命中都只同步基线并跳过,避免累计 longFrames 泄漏进下次增量
  if (document.hidden
      || (typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode())
      || (document.body && document.body.classList.contains('splash-active'))) {
    autoGov.lastSeenFrames = rp.longFrames || 0;
    return;
  }
  var isAuto = (typeof normalizePerformanceQuality === 'function')
    ? normalizePerformanceQuality(fx && fx.performanceQuality) === 'auto'
    : String(fx && fx.performanceQuality) === 'auto';
  if (!isAuto) { autoGov.lastSeenFrames = rp.longFrames || 0; return; }             // 仅治理 auto 档
  var effTarget = (rp.targetFps > 0) ? rp.targetFps : (rp.displayHz || 60);         // vsync(targetFps=0)用 displayHz
  if (!(effTarget > 0)) { autoGov.lastSeenFrames = rp.longFrames || 0; return; }
  if (!(rp.frames > 0)) { autoGov.lastSeenFrames = rp.longFrames || 0; return; }     // 本秒无新帧(冻结)
  var now = performance.now();
  var curLong = rp.longFrames || 0;
  var dLong = curLong - autoGov.lastSeenFrames;                    // 每秒长帧增量(longFrames 累计不清零)
  if (dLong < 0) dLong = curLong;                                  // 计数器重置/首样本兜底
  autoGov.lastSeenFrames = curLong;
  autoGov.lastSampleAt = now;                                      // 标记有效样本(resolveAuto 5s 时效)
  var fps = rp.fps || 0;
  var isJank = (fps > 0 && fps < effTarget * 0.82) || (dLong >= 4);
  var isClean = (fps >= effTarget * 0.92) && (dLong <= 1);
  if (isJank) {
    autoGov.cleanSince = 0;
    if (autoGov.lastStepDir > 0 && (now - autoGov.lastStepAt) < 8000) {
      // 滞回:刚升档 8s 内又卡 → 立即回退该升步 + 观察期翻倍(封顶 48s),防振荡
      autoGovRollbackUp();
      autoGov.recoveryWindowMs = Math.min(48000, autoGov.recoveryWindowMs * 2);
      autoGov.lastStepDir = -1;
      autoGov.lastStepAt = now;
      autoGov.jankVotes = 0;
    } else {
      autoGov.jankVotes += 1;
      if (autoGov.jankVotes >= 2 && (now - autoGov.lastStepAt) >= 6000) {            // 连续 2 票 + 6s 降档冷却
        autoGovStepDown(now);
        autoGov.jankVotes = 0;
      }
    }
  } else {
    autoGov.jankVotes = 0;
    if (isClean) {
      if (!autoGov.cleanSince) autoGov.cleanSince = now;
      if ((now - autoGov.cleanSince) >= autoGov.recoveryWindowMs && (now - autoGov.lastStepAt) >= 12000) {
        autoGovStepUp(now);                                        // 连续干净够久 + 12s 升档冷却 → 升一步
      }
    } else {
      autoGov.cleanSince = 0;                                      // 中间态样本打断回升连续性
    }
  }
  // —— 前台帧率降档(P1,发热主因直接解)——:仅 vsync + 未手动钉死 maxFps 时接管(auto 已由上方守卫保证);
  //   用户手动设过帧率模式 / maxFps 即完全释放(回 60、清计时),治理器绝不碰帧率。
  var fgMode = (typeof normalizeForegroundFpsMode === 'function')
    ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode)
    : String(fx && fx.foregroundFpsMode || 'vsync');
  if (fgMode !== 'vsync' || (fx && fx.maxFps > 0)) {
    autoGov.fgFps = 60; autoGov.fgOverloadSince = 0; autoGov.fgCleanSince = 0;
  } else {
    // 降档:scaleMul 已压到地板(≤0.56)且仍 jank,连续 ≥8s 降一档(60→45→30)——分辨率已到底还压不住,才动帧率
    if (isJank && autoGov.scaleMul <= 0.56 + 1e-6) {
      if (!autoGov.fgOverloadSince) autoGov.fgOverloadSince = now;
      if (autoGov.fgFps > 30 && (now - autoGov.fgOverloadSince) >= 8000) {
        autoGov.fgFps = (autoGov.fgFps === 60) ? 45 : 30;
        autoGov.fgOverloadSince = now;                             // 下一级再等 8s
      }
    } else {
      autoGov.fgOverloadSince = 0;
    }
    // 回升:连续干净 ≥12s 升一档(30→45→60),滞回慢于降档,避免帧率抖动
    if (isClean) {
      if (!autoGov.fgCleanSince) autoGov.fgCleanSince = now;
      if (autoGov.fgFps < 60 && (now - autoGov.fgCleanSince) >= 12000) {
        autoGov.fgFps = (autoGov.fgFps === 30) ? 45 : 60;
        autoGov.fgCleanSince = now;
      }
    } else {
      autoGov.fgCleanSince = 0;
    }
  }
}
// —— 玻璃 UI 过载降级(P4)——:治理器把前台帧率降到 ≤45(过热)或用户显式选 eco 时,给 body 挂 glass-lite,
//   常驻玻璃控件的 SVG 位移滤镜(每帧重合成动态底层)降级为普通 blur;正常负载下逐像素不变(液态玻璃是产品签名)。
function shouldEngageGlassLite() {
  if (!fx) return false;
  var quality = (typeof normalizePerformanceQuality === 'function')
    ? normalizePerformanceQuality(fx.performanceQuality) : String(fx.performanceQuality || '');
  if (quality === 'eco') return true;
  return quality === 'auto' && autoGov.fgFps <= 45;
}
function syncGlassLiteClass() {
  if (!document.body) return;
  var want = shouldEngageGlassLite();
  if (want === document.body.classList.contains('glass-lite')) return;
  document.body.classList.toggle('glass-lite', want);
  if (typeof setControlGlassDisplacementPaused === 'function') setControlGlassDisplacementPaused(want);   // 降级时顺带暂停位移贴图更新器(贴图此时不被引用)
}
if (typeof window !== 'undefined') {
  window.autoGovScaleMul = autoGovScaleMul;
  window.autoGovForegroundFps = autoGovForegroundFps;
  window.autoGovState = autoGovState;
  setInterval(autoGovTick, 1000);
}


// ============================================================
//  Three.js 场景
