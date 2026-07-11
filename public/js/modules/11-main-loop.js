// ============================================================
var prevTime = performance.now();
var renderPerfState = {
  mode: 'vsync',
  fps: 0,
  frames: 0,
  skipped: 0,
  longFrames: 0,
  targetFps: 0,
  displayHz: 60,
  adaptiveDivisor: 1,
  adaptiveKind: '',
  adaptivePressure: 0,
  adaptiveFrameCostMs: 0,
  adaptiveCadenceTick: 0,
  lastRenderAt: 0,
  lastSampleAt: performance.now()
};
window.__mineradioRenderPerf = renderPerfState;
if (window.__mineradioPerf && typeof window.__mineradioPerf.registerRenderState === 'function') {
  window.__mineradioPerf.registerRenderState(renderPerfState);
} else {
  window.__mineradioPerf = renderPerfState;
}
var splashWarmRenderLast = 0;
function isMainSceneCoveredBySplash() {
  return document.body.classList.contains('splash-active') && !document.body.classList.contains('splash-revealing');
}
function currentRenderAdaptiveContext(now) {
  var tier = (typeof getRenderLoadTier === 'function') ? getRenderLoadTier() : 0;
  if (typeof isRenderInteractionActive === 'function' && isRenderInteractionActive(now)) {
    return { kind: 'interaction', tier: tier };
  }
  var activePlayback = !!(playing && audio && !audio.paused);
  return { kind: activePlayback ? 'playback' : 'idle', tier: tier };
}
function resolveAdaptiveRenderCadence(now, mode) {
  if (isDeepBackgroundMode()) return null;
  mode = mode || ((typeof normalizeForegroundFpsMode === 'function') ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode) : 'adaptive');
  if (mode !== 'adaptive' || RENDER_VISIBLE_VSYNC || typeof selectAdaptiveRenderCadence !== 'function') return null;
  var context = currentRenderAdaptiveContext(now);
  return selectAdaptiveRenderCadence(context.kind, context.tier);
}
// 前台帧率治理钩子(P1):vsync 分支不再无条件放行满帧,而是问治理器要一个上限,复用现有 minGap 跳帧机制。
//  返回 >0 = 帧率上限(fps);返回 0 = 不设限(真 vsync)。
//  - eco(用户显式选低配):立即硬上限 30fps,不等治理器 16s 爬坡。
//  - auto + vsync + 未手动钉死 maxFps:治理器降档时返回 45/30;未降档时高刷屏(>62Hz)钳到 60,
//    60Hz 屏返 0 保持真 vsync(避免 minGap 在 ~16.7ms vsync 抖动下误跳帧成半速)。
//  - 其余(非 auto/eco、numeric 固定帧率、手动 maxFps):返回 0,完全不碰。
function foregroundFpsGovernorCap() {
  if (typeof fx === 'undefined' || !fx) return 0;
  var quality = (typeof normalizePerformanceQuality === 'function')
    ? normalizePerformanceQuality(fx.performanceQuality) : String(fx.performanceQuality || '');
  if (quality === 'eco') return 30;
  if (quality !== 'auto') return 0;
  var mode = (typeof normalizeForegroundFpsMode === 'function')
    ? normalizeForegroundFpsMode(fx.foregroundFpsMode) : String(fx.foregroundFpsMode || 'vsync');
  if (mode !== 'vsync') return 0;
  if (fx.maxFps > 0) return 0;
  var gov = (typeof autoGovForegroundFps === 'function') ? autoGovForegroundFps() : 60;
  if (gov < 60) return gov;
  var hz = (typeof estimatedDisplayRefreshHz === 'function') ? estimatedDisplayRefreshHz() : 60;
  return hz > 62 ? 60 : 0;
}
function getAdaptiveRenderFps(now) {
  if (isDeepBackgroundMode()) return 1;
  var mode = (typeof normalizeForegroundFpsMode === 'function') ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode) : 'adaptive';
  var fixedFps = (typeof foregroundFixedFpsForMode === 'function') ? foregroundFixedFpsForMode(mode) : null;
  if (fixedFps !== null) {
    if (fixedFps === 0) return foregroundFpsGovernorCap();   // vsync:交给治理器决定上限(45/30/60 钳位)或 0=真 vsync
    return fixedFps;                                          // 用户显式选的固定帧率,原样返回
  }
  if (RENDER_VISIBLE_VSYNC) return foregroundFpsGovernorCap();
  var cadence = resolveAdaptiveRenderCadence(now, mode);
  if (cadence) return cadence.fps;
  var context = currentRenderAdaptiveContext(now);
  var tier = context.tier;
  if (context.kind === 'interaction') {
    if (tier >= 2) return RENDER_INTERACTION_HUGE_FPS;
    if (tier >= 1) return RENDER_INTERACTION_LARGE_FPS;
    return RENDER_INTERACTION_FPS;
  }
  var activePlayback = context.kind === 'playback';
  if (!activePlayback) {
    if (tier >= 2) return RENDER_IDLE_HUGE_FPS;
    if (tier >= 1) return RENDER_IDLE_LARGE_FPS;
    return RENDER_IDLE_FPS;
  }
  if (tier >= 2) return RENDER_HUGE_FPS;
  if (tier >= 1) return RENDER_LARGE_FPS;
  return RENDER_ACTIVE_FPS;
}
function applyMaxFpsCap(fps) {
  var cap = (typeof fx !== 'undefined' && fx && fx.maxFps) ? fx.maxFps : 0;
  if (!cap || cap <= 0) return fps;   // 0 = 无上限(随显示器 vsync)
  if (!fps) return cap;               // 自适应=vsync(0) 时直接用上限
  return Math.min(fps, cap);
}
// 测显示器实际刷新率 → 禁用屏幕达不到的档位(60Hz 屏禁 120)
(function initMaxFps() {
  try { var sv = parseInt(localStorage.getItem('mineradio_max_fps'), 10); if (!isNaN(sv) && fx) fx.maxFps = sv; } catch (_) { }
  var samples = [], last = 0, count = 0;
  function tick(t) {
    if (last) samples.push(t - last);
    last = t;
    if (++count < 40) { requestAnimationFrame(tick); return; }
    samples.sort(function (a, b) { return a - b; });
    var p = samples[Math.floor(samples.length * 0.15)] || 16.7;   // 取最快的一批帧≈真 vsync(重负载下中位数会偏慢误判)
    var hz = 1000 / p;
    var disp = hz >= 170 ? 240 : (hz >= 132 ? 144 : (hz >= 108 ? 120 : (hz >= 75 ? 90 : 60)));
    window.__displayHz = disp;
    var seg = document.getElementById('max-fps-seg');
    if (seg) seg.querySelectorAll('[data-max-fps]').forEach(function (b) {
      var v = +b.getAttribute('data-max-fps');
      var bad = v > 0 && v > disp;
      b.disabled = bad; b.classList.toggle('seg-disabled', bad);
      b.title = bad ? ('屏幕最高 ' + disp + 'Hz,达不到') : '';
    });
    // 只在会话内钳到屏幕上限, 不写回 localStorage——开机一次性采样可能在卡顿帧误判(120Hz 测成 60), 写盘会永久坑用户
    if (fx && fx.maxFps > 0 && fx.maxFps > disp) { fx.maxFps = disp; }
    if (typeof syncMaxFpsSeg === 'function') syncMaxFpsSeg();
  }
  requestAnimationFrame(tick);
})();
function isTextInputFocused() {
  var a = document.activeElement;
  if (!a) return false;
  if (a.tagName === 'TEXTAREA' || a.isContentEditable === true) return true;
  if (a.tagName === 'INPUT') { var t = (a.type || 'text').toLowerCase(); return t === 'text' || t === 'search' || t === 'url' || t === 'email' || t === 'number' || t === 'password' || t === 'tel'; }
  return false;   // range/color 滑块不算,避免拖滑块时反被降帧
}
function shouldSkipAdaptiveRenderFrame(now) {
  if (typeof sampleDisplayRefreshHz === 'function') sampleDisplayRefreshHz(now);
  var mode = (typeof normalizeForegroundFpsMode === 'function') ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode) : 'adaptive';
  var maxFpsCap = (fx && fx.maxFps > 0) ? fx.maxFps : 0;
  var cadence = resolveAdaptiveRenderCadence(now, mode);
  var fps = applyMaxFpsCap(cadence ? cadence.fps : getAdaptiveRenderFps(now));
  // 搜索/文本框聚焦时(用户在打字看结果、不看 3D)硬性把 3D 帧率降到 18,把主线程和合成让给输入 → 消除打字卡顿
  if (isTextInputFocused()) fps = fps ? Math.min(fps, 18) : 18;
  var displayHz = (typeof estimatedDisplayRefreshHz === 'function') ? estimatedDisplayRefreshHz() : 60;
  renderPerfState.displayHz = Math.round(displayHz * 10) / 10;
  renderPerfState.mode = cadence
    ? ('adaptive-' + cadence.fps + 'fps/' + cadence.divisor + 'x')
    : (fps ? (mode === 'adaptive' ? ('adaptive-' + fps + 'fps') : (fps + 'fps')) : 'vsync');
  renderPerfState.targetFps = fps;
  renderPerfState.foregroundFpsMode = mode;
  renderPerfState.interactionBoost = (typeof isRenderInteractionActive === 'function') ? isRenderInteractionActive(now) : false;
  if (cadence) {
    var prevDivisor = renderPerfState.adaptiveDivisor;
    var prevKind = renderPerfState.adaptiveKind;
    renderPerfState.adaptiveDivisor = cadence.divisor;
    renderPerfState.adaptiveKind = cadence.kind;
    renderPerfState.adaptivePressure = cadence.pressure;
    if (prevDivisor !== cadence.divisor || prevKind !== cadence.kind) renderPerfState.adaptiveCadenceTick = 0;
    renderPerfState.adaptiveCadenceTick += 1;
    if (cadence.divisor > 1 && (renderPerfState.adaptiveCadenceTick - 1) % cadence.divisor !== 0) {
      renderPerfState.skipped += 1;
      if (window.__mineradioPerf && window.__mineradioPerf.count) window.__mineradioPerf.count('frame.skipped');
      return true;
    }
    if (maxFpsCap && now - renderPerfState.lastRenderAt < 1000 / maxFpsCap) {
      renderPerfState.skipped += 1;
      if (window.__mineradioPerf && window.__mineradioPerf.count) window.__mineradioPerf.count('frame.skipped');
      return true;
    }
    renderPerfState.lastRenderAt = now;
    return false;
  }
  renderPerfState.adaptiveDivisor = 0;
  renderPerfState.adaptiveKind = '';
  if (!fps) {
    renderPerfState.lastRenderAt = now;
    return false;
  }
  var minGap = 1000 / fps;
  if (now - renderPerfState.lastRenderAt < minGap) {
    renderPerfState.skipped += 1;
    if (window.__mineradioPerf && window.__mineradioPerf.count) window.__mineradioPerf.count('frame.skipped');
    return true;
  }
  renderPerfState.lastRenderAt = now;
  return false;
}
function sampleRenderPerf(now, dt) {
  renderPerfState.frames += 1;
  if (dt > 0.034) renderPerfState.longFrames += 1;
  if (now - renderPerfState.lastSampleAt >= 1000) {
    renderPerfState.fps = Math.round(renderPerfState.frames * 1000 / Math.max(1, now - renderPerfState.lastSampleAt));
    renderPerfState.frames = 0;
    renderPerfState.lastSampleAt = now;
  }
  maybeTrimRuntimeCaches(now);
}
var mainFrameGates = {
  voxelAudio: createFrameGate('main.voxelAudio', 30),   // P3:治理器降档时把音域回响音频泵门到 ~30Hz(正常负载不经此门,满帧喂)
  audio: createFrameGate('main.audio', 60),
  shelf: createFrameGate('main.shelf', 30),
  lyricsParticles: createFrameGate('main.lyricsParticles', 45),
  stageLyrics: createFrameGate('main.stageLyrics', 45),
  skullParticles: createFrameGate('main.skullParticles', 45),
  homeAudio: createFrameGate('main.homeAudio', 15),
  desktopOverlay: createFrameGate('main.desktopOverlay', 12)
};
window.__mineradioMainFrameGates = mainFrameGates;
var mainLoopBackgroundTimer = 0;
var mainLoopAnimationRequested = false;
function mainLoopDeepBackgroundSleeping() {
  return typeof isDeepBackgroundMode === 'function'
    && isDeepBackgroundMode()
    && !(typeof isLiveBackgroundKeepMode === 'function' && isLiveBackgroundKeepMode());
}
function mainLoopBackgroundDelayMs() {
  if (!mainLoopDeepBackgroundSleeping()) return 0;
  if (fx && (fx.desktopLyrics || fx.wallpaperMode)) return 250;
  if (typeof isBackgroundReleaseMode === 'function' && isBackgroundReleaseMode()) return 1500;
  return 1000;
}
function requestMainLoopAnimationFrame() {
  if (mainLoopAnimationRequested) return;
  mainLoopAnimationRequested = true;
  requestAnimationFrame(animate);
}
function scheduleNextMainLoopFrame() {
  var delay = mainLoopBackgroundDelayMs();
  if (delay > 0) {
    if (mainLoopBackgroundTimer) return;
    mainLoopBackgroundTimer = setTimeout(function () {
      mainLoopBackgroundTimer = 0;
      requestMainLoopAnimationFrame();
    }, delay);
    return;
  }
  requestMainLoopAnimationFrame();
}
function wakeMainLoopFromBackground() {
  if (mainLoopBackgroundTimer) {
    clearTimeout(mainLoopBackgroundTimer);
    mainLoopBackgroundTimer = 0;
  }
  requestMainLoopAnimationFrame();
}
function tickDeepBackgroundFrame(now, dt) {
  sampleRenderPerf(now, dt);
  if (fx && (fx.desktopLyrics || fx.wallpaperMode) && typeof syncDesktopOverlayState === 'function') {
    syncDesktopOverlayState();
  }
}
document.addEventListener('visibilitychange', function () {
  if (!mainLoopDeepBackgroundSleeping()) wakeMainLoopFromBackground();
});
window.addEventListener('focus', wakeMainLoopFromBackground);
function mainLoopInteractionActive(now) {
  return (typeof isRenderInteractionActive === 'function') && isRenderInteractionActive(now);
}
function visibleMotionFollowVsync(now) {
  if (isDeepBackgroundMode()) return false;
  if (mainLoopInteractionActive(now)) return true;
  if (!(playing && audio && !audio.paused)) return false;
  var pressure = (typeof adaptiveLoadPressureLevel === 'function') ? adaptiveLoadPressureLevel() : 0;
  var budget = (typeof runtimePerfBudgetLevel === 'function') ? runtimePerfBudgetLevel() : 2;
  return !(budget <= 0 && pressure >= 2);
}
function capMainLoopFpsToDisplay(fps) {
  var hz = (typeof estimatedDisplayRefreshHz === 'function') ? estimatedDisplayRefreshHz() : 60;
  return Math.max(1, Math.min(Number(fps) || 60, Math.max(48, hz)));
}
function capMainLoopFpsForBudget(fps, minFps) {
  var scale = (typeof runtimePerfScale === 'function') ? runtimePerfScale() : 1;
  var target = Math.round((Number(fps) || 60) * scale);
  return Math.max(minFps || 1, capMainLoopFpsToDisplay(target));
}
function targetMainAudioFps(now) {
  if (isDeepBackgroundMode()) return 1;
  var scale = (typeof runtimeAudioAnalysisScale === 'function') ? runtimeAudioAnalysisScale() : 1;
  if (playing && audio && !audio.paused) {
    var base = mainLoopInteractionActive(now) ? 72 : 54;
    return capMainLoopFpsToDisplay(Math.max(30, Math.round(base * scale)));
  }
  return mainLoopInteractionActive(now) ? 30 : 24;
}
function targetMainShelfFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!fx || fx.shelf === 'off') return 12;
  if (mainLoopInteractionActive(now)) return 0;
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return 0;
  if (typeof shelfPreviewIsVisible === 'function' && shelfPreviewIsVisible()) return 0;
  if (shelfPinnedOpen || (typeof shelfAlwaysVisible === 'function' && shelfAlwaysVisible())) return 0;
  return capMainLoopFpsForBudget(mainLoopInteractionActive(now) ? 72 : 38, 18);
}
function targetMainLyricsParticleFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!fx || fx.particleLyrics === false) return 12;
  if (visibleMotionFollowVsync(now)) return 0;
  if (mainLoopInteractionActive(now)) return capMainLoopFpsForBudget(120, 72);
  return (playing && audio && !audio.paused) ? capMainLoopFpsForBudget(60, 48) : 24;
}
function targetMainStageLyricsFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!fx || fx.particleLyrics === false) return 12;
  if (visibleMotionFollowVsync(now)) return 0;
  if (mainLoopInteractionActive(now)) return capMainLoopFpsForBudget(120, 72);
  return (playing && audio && !audio.paused) ? capMainLoopFpsForBudget(60, 48) : 24;
}
function targetMainSkullParticleFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!fx || fx.preset !== SKULL_PRESET_INDEX) return 10;
  if (visibleMotionFollowVsync(now)) return 0;
  if (mainLoopInteractionActive(now)) return capMainLoopFpsForBudget(120, 72);
  return (playing && audio && !audio.paused) ? capMainLoopFpsForBudget(60, 45) : 24;
}
function targetMainHomeAudioFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!emptyHomeActive) return 6;
  return mainLoopInteractionActive(now) ? 30 : 15;
}
function targetMainDesktopOverlayFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (fx && (fx.desktopLyrics || fx.wallpaperMode)) {
    if (fx.desktopLyricsFps === 0 || mainLoopInteractionActive(now)) return 0;
    return Math.max(24, Math.min(120, Number(fx.desktopLyricsFps) || 60));
  }
  return 6;
}
function animate() {
  mainLoopAnimationRequested = false;
  scheduleNextMainLoopFrame();
  var perfProbe = window.__mineradioPerf;
  var framePerfStart = performance.now();
  var now = performance.now();
  if (mainLoopDeepBackgroundSleeping()) {
    var deepDt = Math.min((now - prevTime) / 1000, 0.25);
    prevTime = now;
    tickDeepBackgroundFrame(now, deepDt);
    return;
  }
  // 音域回响:音频/节拍满帧率泵(跳帧判断之前)——检测器语义按显示器帧率,与原作 useFrame 一致。
  // 取舍(P3):满帧喂节拍检测最准(冷却/平滑/阈值自适应都按显示器帧率标定);但治理器把前台帧率降到 ≤45
  // (含 eco 30)= 过热降载场景,发热优先,泵也门到 ~30Hz —— 30Hz 仍够触发涟漪/流星,只是精度略降。
  if (typeof pumpVoxelAudioFrame === 'function') {
    var voxPumpCap = (typeof foregroundFpsGovernorCap === 'function') ? foregroundFpsGovernorCap() : 0;
    if (voxPumpCap > 0 && voxPumpCap <= 45) {
      var _vg = mainFrameGates.voxelAudio, _vgRuns = _vg.runs;
      consumeFrameGate(_vg, now, 0, 30, false, 'voxel-audio-pump');   // dt 传 0:泵不用 stepDt,只借 gate 计时;是否运行看 runs 是否递增
      if (_vg.runs !== _vgRuns) pumpVoxelAudioFrame();
    } else {
      pumpVoxelAudioFrame();   // 正常负载:满帧喂,维持原作检测精度
    }
  }
  if (shouldSkipAdaptiveRenderFrame(now)) return;
  var dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;
  sampleRenderPerf(now, dt);
  uniforms.uTime.value += dt;
  if (isMainSceneCoveredBySplash()) {
    if (now - splashWarmRenderLast > 520) {
      splashWarmRenderLast = now;
      var splashRenderPerfStart = performance.now();
      renderer.render(scene, camera);
      if (perfProbe && perfProbe.markSince) perfProbe.markSince('renderer.render.splash', splashRenderPerfStart);
    }
    var splashFrameCostMs = performance.now() - framePerfStart;
    if (typeof sampleAdaptiveFrameCost === 'function') {
      var splashFrameLoad = sampleAdaptiveFrameCost(splashFrameCostMs, renderPerfState.targetFps || renderPerfState.displayHz || 60);
      if (splashFrameLoad) {
        renderPerfState.adaptiveFrameCostMs = splashFrameLoad.avgMs;
        renderPerfState.adaptivePressure = splashFrameLoad.level;
      }
    }
    if (perfProbe && perfProbe.mark) perfProbe.mark('frame.total', splashFrameCostMs);
    return;
  }
  pointerParallax.x += (pointerTarget.x - pointerParallax.x) * 0.040;
  pointerParallax.y += (pointerTarget.y - pointerParallax.y) * 0.040;

  // 频谱分析 — v7.1: 真正分离 kick 和人声
  // bin = sampleRate / fftSize = 44100/2048 ≈ 21.5Hz
  // kick 60-150Hz → bin 3-7 (用前 5 个 bin)
  // vocal 200-3000Hz → bin 9-140 (尽量不计入 bass/mid 的"鼓点"判断)
  // 真正的 mid 乐器/和声: 3000-6000Hz → bin 140-280
  // treble: 6000Hz+ → bin 280+
  var audioPerfStart = performance.now();
  beatOnsetFlag = false;
  var audioStepDt = consumeFrameGate(mainFrameGates.audio, now, dt, targetMainAudioFps(now), false, 'audio-analysis');
  if (audioStepDt > 0) {
  if (analyser && playing && audio && !audio.paused) {
    if (audioCtx && audioCtx.state === 'suspended') resumeAudioAnalysis();
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(timeDomainData);
    var len = frequencyData.length;
    // 精确频段
    var kickEnd = 7;                          // 60-150 Hz, 鼓 kick
    var vocalEnd = Math.min(len, 140);         // 200-3000 Hz, 人声主体
    var midEnd = Math.min(len, 280);         // 3-6 kHz, 中高乐器
    // 累积
    var bKick = 0, mInst = 0, tHigh = 0, voc = 0, rms = 0;
    var timeStride = (typeof runtimeAnalysisStride === 'function') ? runtimeAnalysisStride('time', timeDomainData.length) : 1;
    var rmsCount = 0;
    for (var j = 0; j < timeDomainData.length; j += timeStride) {
      var tv = (timeDomainData[j] - 128) / 128;
      rms += tv * tv;
      rmsCount++;
    }
    rms = Math.sqrt(rms / Math.max(1, rmsCount));
    var analysisSampleRate = (audioCtx && audioCtx.sampleRate) || 44100;
    var analysisFftSize = (analyser && analyser.fftSize) || len * 2;
    if (typeof beatBandRms === 'function') {
      var subKick = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 38, 74);
      var kickCore = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 52, 165);
      var kickBody = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 165, 420);
      bKick = Math.min(1, kickCore * 0.86 + subKick * 0.42 + kickBody * 0.10);
      voc = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 420, 2600);
      mInst = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 2600, 6200);
      tHigh = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 6200, Math.min(16000, analysisSampleRate / 2));
    }

    // 动态峰值跟踪
    bassPeak = Math.max(bassPeak * 0.994, bKick, 0.030);
    midPeak = Math.max(midPeak * 0.993, mInst, 0.026);
    treblePeak = Math.max(treblePeak * 0.992, tHigh, 0.018);
    energyPeak = Math.max(energyPeak * 0.995, rms, 0.030);

    var rb = Math.min(1, Math.pow(bKick / Math.max(0.038, bassPeak * 0.66), 0.78));
    var rm = Math.min(1, Math.pow(mInst / Math.max(0.025, midPeak * 0.70), 0.86));
    var rt = Math.min(1, Math.pow(tHigh / Math.max(0.020, treblePeak * 0.74), 0.92));
    var re = Math.min(1, Math.pow(rms / Math.max(0.034, energyPeak * 0.68), 0.82));

    var bassOnset = Math.max(0, rb - smoothBass);
    var energyOnset = Math.max(0, re - prevEnergy);
    prevEnergy = prevEnergy * 0.88 + re * 0.12;

    var realtimeBeat = processRealtimeBeatEngine(audioStepDt);
    if (realtimeBeat && realtimeBeat.hit && typeof pulseCoreNotifyHit === 'function') pulseCoreNotifyHit(realtimeBeat);
    if (realtimeBeat && realtimeBeat.hit) {
      var dj = djMode.active;
      var djMapCoversCurrentTime = !dj || !currentDjBeatMap || !currentDjBeatMap.partialUntilSec || !audio || (audio.currentTime || 0) <= currentDjBeatMap.partialUntilSec - 1.25;
      var djBeatMapReadyForCamera = dj && currentDjBeatMap && currentDjBeatMap.cameraBeats && currentDjBeatMap.cameraBeats.length >= 4 && djMapCoversCurrentTime;
      // partial 半图只在覆盖段内算"就绪", 越界回落 live 兜底(与 DJ 路径同语义, 否则半图期间节拍视觉双向封死)
      var mapCoversCurrentTime = !currentBeatMap || currentBeatMap.partial !== true || !currentBeatMap.partialUntilSec || !audio || (audio.currentTime || 0) <= currentBeatMap.partialUntilSec - 1.25;
      var beatMapReadyForCamera = dj ? djBeatMapReadyForCamera : (currentBeatMap && currentBeatMap.cameraBeats && currentBeatMap.cameraBeats.length >= 4 && mapCoversCurrentTime);
      var waitingForBeatMap = dj ? !djBeatMapReadyForCamera : (!beatMapReadyForCamera && (!!beatMapBusy || !!beatAnalysisTimer || ((audio && audio.currentTime) || 0) < 18));
      var liveKickFrame = dj
        ? (realtimeBeat.low > 0.42 && rb > 0.32 && bassOnset > 0.040 && energyOnset > 0.006 && (realtimeBeat.lowDominance || 0) > 0.72)
        : (realtimeBeat.low > 0.42 && rb > 0.34 && bassOnset > 0.048 && energyOnset > 0.008);
      var liveStrongHit = dj
        ? (realtimeBeat.confidence > 0.52 && realtimeBeat.strength > 0.48 && realtimeBeat.score > 0.42 && liveKickFrame)
        : (realtimeBeat.confidence > 0.62 && realtimeBeat.strength > 0.54 && realtimeBeat.score > 0.44 && liveKickFrame);
      var liveTempoHit = dj
        ? (realtimeBeat.tempoAssist && realtimeBeat.confidence > 0.50 && realtimeBeat.strength > 0.46 && realtimeBeat.low > 0.40 && (liveKickFrame || bassOnset > 0.034))
        : (realtimeBeat.tempoAssist && realtimeBeat.confidence > 0.62 && realtimeBeat.strength > 0.50 && realtimeBeat.low > 0.40 && bassOnset > 0.036);
      var liveFallbackOk = dj
        ? (liveStrongHit || liveTempoHit)
        : (waitingForBeatMap
          ? (liveStrongHit || liveTempoHit)
          : (realtimeBeat.confidence > 0.68 && realtimeBeat.strength > 0.62 && realtimeBeat.low > 0.44 && (liveKickFrame || realtimeBeat.score > 0.52)));
      if (!beatMapReadyForCamera && liveFallbackOk) {
        scheduleBeatCamera({
          time: realtimeBeat.time,
          strength: realtimeBeat.strength,
          confidence: realtimeBeat.confidence,
          low: realtimeBeat.low,
          body: realtimeBeat.body,
          snap: realtimeBeat.snap,
          mass: realtimeBeat.mass,
          sharpness: realtimeBeat.sharpness,
          combo: realtimeBeat.combo,
          impact: clamp01(realtimeBeat.strength * 0.46 + realtimeBeat.confidence * 0.20 + realtimeBeat.low * 0.28),
          preview: waitingForBeatMap,
          primary: true,
          dj: dj
        }, 'live');
      }
      if (!beatMapReadyForCamera && liveFallbackOk) {
        var previewPulseScale = waitingForBeatMap && !dj ? 0.68 : 1;
        var rtPulse = Math.min(dj ? 0.42 : (waitingForBeatMap ? 0.56 : 0.76), realtimeBeat.strength * (realtimeBeat.tempoAssist ? (dj ? 0.54 : 0.76) : (dj ? 0.62 : 0.84)) * previewPulseScale);
        if (rtPulse > beatPulse + 0.09) beatOnsetFlag = true;
        beatPulse = Math.max(beatPulse, rtPulse);
      }
    } else if (bassOnset > 0.075 && rb > 0.32 && energyOnset > 0.020) {
      beatPulse = Math.max(beatPulse, Math.min(0.12, bassOnset * 0.18));
    }
    beatPulse *= Math.pow(0.36, audioStepDt);

    // v7.2+: 预解析 beatmap 只在实时引擎暂时没锁住时补位.
    tickPodcastDjBeatMap();
    tickBeatMap();
    if (scheduledBeatFlag) {
      beatOnsetFlag = true;
      scheduledBeatFlag = false;
    }
    // scheduledBeatPulse 衰减并合并到 beatPulse
    if (scheduledBeatPulse > beatPulse) beatPulse = scheduledBeatPulse;
    scheduledBeatPulse *= Math.pow(0.32, audioStepDt);

    function env(prev, next, attack, release) {
      var k = next > prev ? attack : release;
      return prev + (next - prev) * k;
    }
    // smoothBass 主要由 kick 驱动 (不被人声干扰)
    smoothBass = env(smoothBass, Math.min(0.82, rb * 0.78 + re * 0.025), 0.28, 0.075);
    // smoothMid 用 中高乐器, 不再混入人声
    smoothMid = env(smoothMid, Math.min(0.68, rm * 0.64 + re * 0.025), 0.18, 0.060);
    smoothTreb = env(smoothTreb, Math.min(0.56, rt * 0.54), 0.18, 0.055);
    smoothEnergy = env(smoothEnergy, Math.min(0.72, re), 0.16, 0.055);
    var cinemaProfileSample = { energy: re, low: rb, vocal: voc, melody: rm, lowOnset: bassOnset, energyOnset: energyOnset };
    updateCinemaDynamics(re, rb);
    updateCinemaTrackProfile(cinemaProfileSample);
    // 歌词阳光溢光: 独立于律动强度, 看持续能量 + 中高频抬升, 更像副歌/高音段落而不是单个鼓点.
    var sunEnergy = clamp01((smoothEnergy - 0.18) / 0.38);
    var sunVoice = clamp01((voc - 0.11) / 0.34);
    var sunMelody = clamp01((smoothMid - 0.16) / 0.27);
    var sunAir = clamp01((smoothTreb - 0.105) / 0.17);
    var sunRaw = clamp01(sunEnergy * 0.36 + sunVoice * 0.18 + sunMelody * 0.26 + sunAir * 0.20);
    sunRaw = sunRaw * sunRaw * (3 - 2 * sunRaw);
    lyricSunAvg += (sunRaw - lyricSunAvg) * 0.006;
    lyricSunPeak = Math.max(0.48, lyricSunPeak * 0.9985, sunRaw);
    var sunThreshold = Math.max(0.78, lyricSunAvg + 0.20, lyricSunPeak * 0.74);
    var sunGate = clamp01((sunRaw - sunThreshold) / Math.max(0.08, 1.0 - sunThreshold));
    sunGate = sunGate * sunGate * (3 - 2 * sunGate);
    lyricSunHold += (sunGate - lyricSunHold) * (sunGate > lyricSunHold ? 0.035 : 0.014);
    lyricSunTarget = lyricSunHold > 0.16 ? clamp01((lyricSunHold - 0.16) / 0.84) : 0;
    lyricSunEnergy += (lyricSunTarget - lyricSunEnergy) * (lyricSunTarget > lyricSunEnergy ? 0.075 : 0.030);
  } else {
    var audioIdleDecay = Math.max(1, audioStepDt * 60);
    smoothBass *= Math.pow(0.91, audioIdleDecay); smoothMid *= Math.pow(0.91, audioIdleDecay); smoothTreb *= Math.pow(0.91, audioIdleDecay); smoothEnergy *= Math.pow(0.91, audioIdleDecay); beatPulse *= Math.pow(0.82, audioIdleDecay);
    liveCamAvg *= Math.pow(0.94, audioIdleDecay);
    liveCamPeak = Math.max(0.28, liveCamPeak * Math.pow(0.98, audioIdleDecay));
    liveCamLastRaw *= Math.pow(0.80, audioIdleDecay);
    lyricSunTarget = 0;
    lyricSunHold *= Math.pow(0.90, audioIdleDecay);
    lyricSunEnergy *= Math.pow(0.92, audioIdleDecay);
    lyricSunAvg *= Math.pow(0.995, audioIdleDecay);
    lyricSunPeak = Math.max(0.48, lyricSunPeak * Math.pow(0.997, audioIdleDecay));
  }
  }
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('audio.analysis', audioPerfStart);
  audioEnergy = Math.max(smoothEnergy, beatPulse * 0.30);
  if (typeof pulseCoreStep === 'function') pulseCoreStep(dt);
  bass = Math.min(0.90, smoothBass * 1.05 + beatPulse * 0.18) * fx.intensity;
  mid = Math.min(0.72, smoothMid * 1.12) * fx.intensity;
  treble = Math.min(0.62, smoothTreb * 1.20) * fx.intensity;
  if (fx.preset >= 4) {
    var wallpaperAudio = fx.preset === 5;
    var ringBass = smoothBass * (wallpaperAudio ? 1.10 : 1.58) + beatPulse * (wallpaperAudio ? 0.18 : 0.42) - smoothMid * 0.16 - smoothTreb * 0.06;
    var ringMid = smoothMid * (wallpaperAudio ? 1.16 : 1.82) - smoothBass * 0.14 - smoothTreb * 0.07;
    var ringTreble = smoothTreb * (wallpaperAudio ? 1.34 : 2.28) - smoothMid * 0.10 - smoothBass * 0.05;
    bass = Math.pow(clamp01((ringBass - 0.050) / 0.58), 0.72) * fx.intensity;
    mid = Math.pow(clamp01((ringMid - 0.045) / 0.46), 0.78) * fx.intensity;
    treble = Math.pow(clamp01((ringTreble - 0.030) / 0.34), 0.84) * fx.intensity;
    if (wallpaperAudio) {
      bass = Math.min(bass, 0.46 * fx.intensity);
      mid = Math.min(mid, 0.40 * fx.intensity);
      treble = Math.min(treble, 0.36 * fx.intensity);
      beatPulse *= 0.34;
    }
  }
  if (djMode.active) {
    bass = Math.min(1.00, bass * 1.06 + beatPulse * 0.085);
    mid = Math.min(0.76, mid * 1.00 + clamp01(djMode.sectionChange * 1.6) * 0.020);
    treble = Math.min(0.66, treble * 0.98);
    audioEnergy = Math.max(audioEnergy, beatPulse * 0.38, djMode.sectionEnergy * 0.54);
  }

  var vinylSpeedMul = isFinite(fx.speed) ? Math.max(0.05, fx.speed) : 1;
  var vinylSpinSpeed = (0.40 + smoothBass * 0.09) * vinylSpeedMul;
  uniforms.uVinylSpin.value = (uniforms.uVinylSpin.value + dt * vinylSpinSpeed) % (Math.PI * 2);

  var visualUniformPerfStart = performance.now();
  updateParticlePointerFrame();
  uniforms.uBass.value = bass;
  uniforms.uMid.value = mid;
  uniforms.uTreble.value = treble;
  uniforms.uBeat.value = beatPulse;
  uniforms.uEnergy.value = audioEnergy;
  uniforms.uMouseXY.value.set(mouseWorld.x, mouseWorld.y);
  uniforms.uMouseActive.value = mouseActive ? 1 : 0;
  var skullBackdropDim = fx && fx.preset === SKULL_PRESET_INDEX ? 0.58 : 1;
  var shelfDimTarget = shouldDimWallpaperForShelf() ? 0.48 : skullBackdropDim;
  var shelfDimEase = shelfDimTarget < uniforms.uParticleDim.value ? 0.18 : 0.10;
  uniforms.uParticleDim.value += (shelfDimTarget - uniforms.uParticleDim.value) * Math.min(1, shelfDimEase * Math.max(1, dt * 60));
  if (typeof updateBackgroundStarRiverState === 'function') updateBackgroundStarRiverState(dt, false);

  // 通用转场脉冲: 只作为切换预设时的短促提亮。
  uniforms.uBurstAmt.value *= 0.90;
  tickPresetTransition();
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.uniforms-preset', visualUniformPerfStart);

  var coverLayerPerfStart = performance.now();
  updateRipples(dt);
  updateFloatLayer(dt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.cover-layers', coverLayerPerfStart);
  var shelfPerfStart = performance.now();
  var shelfStepDt = consumeFrameGate(mainFrameGates.shelf, now, dt, targetMainShelfFps(now), false, 'shelf-manager');
  if (shelfStepDt > 0 && shelfManager) shelfManager.update(shelfStepDt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.shelf-manager', shelfPerfStart);
  var lyricsParticlePerfStart = performance.now();
  var lyricsParticleStepDt = consumeFrameGate(mainFrameGates.lyricsParticles, now, dt, targetMainLyricsParticleFps(now), false, 'lyrics-particles');
  if (lyricsParticleStepDt > 0) tickLyricsParticles();
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.lyrics-particles', lyricsParticlePerfStart);
  var homeAudioPerfStart = performance.now();
  var homeAudioStepDt = consumeFrameGate(mainFrameGates.homeAudio, now, dt, targetMainHomeAudioFps(now), false, 'home-audio');
  if (homeAudioStepDt > 0) updateHomeAudioVisual(homeAudioStepDt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.home-audio', homeAudioPerfStart);

  // 电影镜头
  var cameraPerfStart = performance.now();
  updateCinema(dt);
  updateFreeCamera(dt);
  updateCamera();
  applySkullCameraPose(dt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('camera.update', cameraPerfStart);

  // v7.2 旋转 = 头部+眼球追踪 + 鼠标/手势拖动 + 惯性
  tickGestureRotation(dt);
  var skullPresetActive = fx && fx.preset === SKULL_PRESET_INDEX;
  var voxelActive = typeof voxelCityActive === 'function' && voxelCityActive();
  var presetUsesStarRiverParticles = fx && Number(fx.preset) === 5;
  var presetStarRiverMuted = presetUsesStarRiverParticles && fx.backgroundStarRiver === false;
  var hidePoints = skullPresetActive || voxelActive;
  particles.visible = !hidePoints && !presetStarRiverMuted;
  if (bloomParticles) bloomParticles.visible = !hidePoints && !presetStarRiverMuted && fx.bloom && fx.bloomStrength > 0.01;
  if (floatGroup) floatGroup.visible = !hidePoints;
  if (backCoverGroup) backCoverGroup.visible = !hidePoints;
  var targetRotY = orbit.centerLocked ? 0 : (headParallax.active ? headParallax.x * 0.5 : 0) + gestureRotation.y;
  var targetRotX = orbit.centerLocked ? 0 : (headParallax.active ? -headParallax.y * 0.35 : 0) + gestureRotation.x;
  var targetRotZ = orbit.centerLocked ? 0 : (gestureRotation.z || 0);   // v9 双捏旋转(roll)
  particles.rotation.y += (targetRotY - particles.rotation.y) * 0.055;
  particles.rotation.x += (targetRotX - particles.rotation.x) * 0.055;
  particles.rotation.z += (targetRotZ - particles.rotation.z) * 0.055;
  if (bloomParticles) {
    bloomParticles.rotation.copy(particles.rotation);
  }
  // 同步给背面粒子层
  if (floatGroup) {
    floatGroup.rotation.copy(particles.rotation);
  }
  if (backCoverGroup) {
    backCoverGroup.rotation.copy(particles.rotation);
  }
  var voxelEchoPerfStart = performance.now();
  if (typeof updateVoxelCity === 'function') updateVoxelCity(dt);   // 音域回响每帧更新(内部按预设显隐);须在舞台歌词之前,避免歌词用上一帧体素相机而滞后抖动
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.voxel-echo', voxelEchoPerfStart);
  var skullPerfStart = performance.now();
  var skullStepDt = consumeFrameGate(mainFrameGates.skullParticles, now, dt, targetMainSkullParticleFps(now), false, 'skull-particles');
  if (skullStepDt > 0) updateSkullParticleLayer(skullStepDt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.skull-particles', skullPerfStart);
  var stageLyricsPerfStart = performance.now();
  var stageLyricsStepDt = consumeFrameGate(mainFrameGates.stageLyrics, now, dt, targetMainStageLyricsFps(now), false, 'stage-lyrics');
  if (stageLyricsStepDt > 0) updateStageLyrics3D(stageLyricsStepDt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.stage-lyrics', stageLyricsPerfStart);
  var desktopOverlayPerfStart = performance.now();
  var desktopOverlayStepDt = consumeFrameGate(mainFrameGates.desktopOverlay, now, dt, targetMainDesktopOverlayFps(now), false, 'desktop-overlay');
  if (desktopOverlayStepDt > 0) syncDesktopOverlayState();
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('desktop.overlay-sync', desktopOverlayPerfStart);

  // 缩略图脉动
  if (currentIdx >= 0) {
    var s = 1 + bass * 0.08;
    if (!_thumbCoverEl) _thumbCoverEl = document.getElementById('thumb-cover');
    if (_thumbCoverEl) {
      var sq = Math.round(s * 1000);   // 量化避免浮点抖动导致的每帧重复写 style(触发合成)
      if (sq !== _thumbCoverLast) { _thumbCoverEl.style.transform = 'scale(' + s + ')'; _thumbCoverLast = sq; }
    }
  }

  var rendererPerfStart = performance.now();
  renderer.render(scene, camera);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('renderer.render', rendererPerfStart);
  var frameCostMs = performance.now() - framePerfStart;
  if (typeof sampleAdaptiveFrameCost === 'function') {
    var frameLoad = sampleAdaptiveFrameCost(frameCostMs, renderPerfState.targetFps || renderPerfState.displayHz || 60);
    if (frameLoad) {
      renderPerfState.adaptiveFrameCostMs = frameLoad.avgMs;
      renderPerfState.adaptivePressure = frameLoad.level;
    }
  }
  if (perfProbe && perfProbe.mark) perfProbe.mark('frame.total', frameCostMs);
}
requestMainLoopAnimationFrame();
