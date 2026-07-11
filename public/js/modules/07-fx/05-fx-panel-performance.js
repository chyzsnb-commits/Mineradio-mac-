var homeWaveTrackState = { bars: 0, smooth: [] };
function ensureHomeWaveTrackBars() {
  var el = document.getElementById('home-wave-track');
  if (!el) return;
  var count = 24;
  if (homeWaveTrackState.bars === count && el.children.length === count) return;
  homeWaveTrackState.bars = count;
  homeWaveTrackState.smooth = new Array(count).fill(0);
  el.innerHTML = new Array(count + 1).join('<span></span>');
}
function updateHomeAudioVisual(dt) {
  if (!emptyHomeActive) return;
  var wave = document.getElementById('home-wave-track');
  if (!wave) return;
  var nowMs = performance.now();
  if (homeWaveTrackState.lastAt && nowMs - homeWaveTrackState.lastAt < 80) return;
  homeWaveTrackState.lastAt = nowMs;
  ensureHomeWaveTrackBars();
  var bars = wave.children;
  var nowT = uniforms && uniforms.uTime ? uniforms.uTime.value : performance.now() / 1000;
  for (var i = 0; i < bars.length; i++) {
    var ratio = bars.length > 1 ? i / (bars.length - 1) : 0;
    var bin = 0;
    if (frequencyData && frequencyData.length) {
      bin = (frequencyData[Math.min(frequencyData.length - 1, Math.floor(Math.pow(ratio, 1.2) * (frequencyData.length - 1)))] || 0) / 255;
    } else {
      bin = 0.16 + Math.sin(nowT * 1.4 + i * 0.34) * 0.06;
    }
    var target = clampRange(Math.max(bin, smoothBass * 0.35 + smoothMid * 0.18 + beatPulse * 0.24), 0.03, 1);
    var prev = homeWaveTrackState.smooth[i] || 0;
    prev += (target - prev) * (target > prev ? 0.34 : 0.12);
    homeWaveTrackState.smooth[i] = prev;
    bars[i].style.height = Math.max(4, prev * 18) + 'px';
    bars[i].style.opacity = String(clampRange(0.36 + prev * 0.68, 0.32, 1));
  }
}
function setRange(id, value) {
  var el = document.getElementById(id);
  if (!el) return;
  if (id === 'fx-lyricglow') value = Math.min(0.85, Math.max(0, value));
  if (id === 'fx-coverres') value = normalizeCoverResolution(value);
  if (id === 'fx-glassaberration') value = normalizeControlGlassChromaticOffset(value);
  if (id === 'fx-lyriccustomlines') value = lyricCustomLineCountValue();
  if (id === 'fx-memory-interval' || id === 'fx-memory-threshold') value = Math.round(Number(value) || 0);
  el.value = value;
  var out = el.parentElement.querySelector('output');
  if (out) out.textContent = id === 'fx-coverres'
    ? coverParticleCountLabel(value)
    : (id === 'fx-lyricweight' || id === 'fx-lyriccustomlines' || id === 'fx-glassaberration' || id === 'fx-playlistblur' || id === 'fx-lyrictiltx' || id === 'fx-lyrictilty' || id === 'fx-shelfangle' || id === 'fx-shelfdetailanglex' || id === 'fx-shelfdetailangley' || id === 'fx-memory-interval' || id === 'fx-memory-threshold' ? String(Math.round(Number(value) || 0)) : Number(value).toFixed(id === 'fx-lyricspacing' ? 3 : 2));
}
function updateDevelopmentFxControls() {
  [
    ['desktopLyrics', 't-desktopLyrics', '全屏幕置顶歌词'],
    ['desktopLyricsClickThrough', 't-desktopLyricsClickThrough', '锁定后防误触；鼠标移到桌面歌词上按中键可锁定/解锁'],
    ['desktopLyricsCinema', 't-desktopLyricsCinema', '桌面歌词绑定鼓点电影震动，基础漂浮始终保留'],
    ['desktopLyricsHighlight', 't-desktopLyricsHighlight', '桌面歌词按播放进度高亮'],
    ['wallpaperMode', 't-wallpaperMode', '把 Mineradio 变成桌面动态壁纸(图标之下);点 Dock 图标退出']
  ].forEach(function (item) {
    var locked = isDevelopmentLockedFx(item[0]);
    var el = document.getElementById(item[1]);
    if (!el) return;
    el.classList.toggle('dev-locked', locked);
    if (locked) {
      el.classList.remove('on');
      el.setAttribute('aria-disabled', 'true');
      el.title = '开发中，暂不可用';
    } else {
      el.removeAttribute('aria-disabled');
      el.title = item[2];
    }
  });
  [
    ['desktopLyrics', 'fx-desktoplyricssize'],
    ['desktopLyrics', 'fx-desktoplyricsopacity'],
    ['desktopLyrics', 'fx-desktoplyricsy'],
    ['wallpaperMode', 'fx-wallpaperopacity']
  ].forEach(function (item) {
    var locked = isDevelopmentLockedFx(item[0]);
    var input = document.getElementById(item[1]);
    if (!input) return;
    input.disabled = locked;
    var row = input.closest && input.closest('.fx-slider');
    if (row) row.classList.toggle('dev-locked', locked);
  });
}
function updateDesktopLyricsFpsControls() {
  var fps = normalizeDesktopLyricsFps(fx.desktopLyricsFps);
  document.querySelectorAll('#desktop-lyrics-fps-seg [data-desktop-lyrics-fps]').forEach(function (btn) {
    btn.classList.toggle('active', normalizeDesktopLyricsFps(btn.getAttribute('data-desktop-lyrics-fps')) === fps);
  });
}
function updatePerformanceControls() {
  fx.performanceBackground = normalizePerformanceBackgroundMode(fx.performanceBackground, fx.liveBackgroundKeep === true);
  fx.liveBackgroundKeep = fx.performanceBackground === 'keep';
  fx.performanceQuality = normalizePerformanceQuality(fx.performanceQuality);
  fx.foregroundFpsMode = normalizeForegroundFpsMode(fx.foregroundFpsMode);
  document.querySelectorAll('#performance-background-seg [data-performance-background]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-performance-background') === fx.performanceBackground);
  });
  syncPerformanceQualitySeg();
  var liveBackgroundKeepToggle = document.getElementById('t-liveBackgroundKeep');
  if (liveBackgroundKeepToggle) liveBackgroundKeepToggle.classList.toggle('on', fx.liveBackgroundKeep === true);
}
function setPerformanceBackgroundMode(mode, silent) {
  var next = normalizePerformanceBackgroundMode(mode, false);
  fx.performanceBackground = next;
  fx.liveBackgroundKeep = next === 'keep';
  updatePerformanceControls();
  saveLyricLayout({ user: true, reason: 'performanceBackground' });
  updateRenderPowerClasses();
  applyRendererPowerMode();
  if (next === 'keep') recoverVisualsAfterBackground('performance-background-keep');
  else if (next === 'release' && isDeepBackgroundMode()) trimRuntimeCaches('performance-release', true);
  if (!silent) {
    showToast(next === 'keep' ? '后台策略: 保持运行' : (next === 'release' ? '后台策略: 停止并释放' : '后台策略: 自动优化'));
  }
}
// 性能档位分段控件 active 态同步(auto/eco/balanced/ultra),面板打开或改档时刷新
function syncPerformanceQualitySeg() {
  var seg = document.getElementById('performance-quality-seg');
  if (!seg) return;
  var current = normalizePerformanceQuality(fx && fx.performanceQuality);
  seg.querySelectorAll('[data-perf-quality]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-perf-quality') === current);
  });
}
function setPerformanceQualityMode(mode, silent) {
  var next = normalizePerformanceQuality(mode);
  fx.performanceQuality = next;
  updatePerformanceControls();
  applyRendererPowerMode();
  saveLyricLayout({ user: true, reason: 'performanceQuality' });
  if (!silent) {
    if (next === 'auto') {
      showToast('性能档位: 自动(按帧率自适应)');
    } else {
      // 档位切换只调「真性能」(分析步长/流星门/体素额外量等 rank 语义),绝不再联动用户的渲染分辨率滑块与体素密度
      var label = next === 'eco' ? '低配' : (next === 'balanced' ? '均衡' : (next === 'ultra' ? '高性能' : '高'));
      showToast('性能档位: ' + label);
    }
  }
}
// 总刷新率上限:用户选的全局帧率上限(0=无上限随显示器)
function syncMaxFpsSeg() {
  var seg = document.getElementById('max-fps-seg'); if (!seg) return;
  seg.querySelectorAll('[data-max-fps]').forEach(function (b) {
    b.classList.toggle('active', (+b.getAttribute('data-max-fps')) === ((fx && fx.maxFps) || 0));
  });
}
function setMaxRenderFps(n) {
  n = +n || 0;
  fx.maxFps = n;
  try { localStorage.setItem('mineradio_max_fps', String(n)); } catch (_) { }
  syncMaxFpsSeg();
  if (typeof showToast === 'function') showToast(n ? ('刷新率上限 ' + n + ' fps') : '刷新率无上限(随显示器)');
}
// 负载监视器 HUD
var _perfHudTimer = null;
var _devStats = null; // 主进程 device-stats 最近一次返回(HUD 可见时每 2s 刷新)
var _devStatsTimer = null;
function fetchDeviceStats() {
  try {
    if (!(window.desktopWindow && typeof window.desktopWindow.deviceStats === 'function')) { _devStats = null; return; }
    window.desktopWindow.deviceStats().then(function (s) {
      _devStats = (s && typeof s === 'object') ? s : null;
    }).catch(function () { _devStats = null; });
  } catch (e) { _devStats = null; }
}
function perfHudOn() { try { return localStorage.getItem('mr_perfHud') === '1'; } catch (e) { return false; } }
function setPerfHud(on) {
  try { localStorage.setItem('mr_perfHud', on ? '1' : '0'); } catch (e) { }
  var hud = document.getElementById('perf-hud');
  var tog = document.getElementById('t-perfHud');
  if (tog) tog.classList.toggle('on', !!on);
  if (hud) hud.style.display = on ? 'block' : 'none';
  if (on) {
    updatePerfHud();
    if (!_perfHudTimer) _perfHudTimer = setInterval(updatePerfHud, 500);
    fetchDeviceStats();
    if (!_devStatsTimer) _devStatsTimer = setInterval(fetchDeviceStats, 2000);
  } else {
    if (_perfHudTimer) { clearInterval(_perfHudTimer); _perfHudTimer = null; }
    if (_devStatsTimer) { clearInterval(_devStatsTimer); _devStatsTimer = null; }
    _devStats = null;
  }
}
function togglePerfHud() { setPerfHud(!perfHudOn()); }
function updatePerfHud() {
  var hud = document.getElementById('perf-hud');
  if (!hud || hud.style.display === 'none') return;
  var fps = (typeof renderPerfState !== 'undefined' && renderPerfState) ? (renderPerfState.fps || 0) : 0;
  // 显示「真实绘制缓冲」= innerWidth×getRenderPixelRatio(含治理器 scaleMul + 绝对缓冲上限),这样降档/封顶肉眼可见;
  // 括号内附滑块天花板。用户报「满屏 9fps 但分辨率显示没降」正是因为旧标签只显示滑块值、不反映实际缓冲。
  var pr = (typeof getRenderPixelRatio === 'function') ? getRenderPixelRatio() : 1;
  var bufLabel = Math.round(innerWidth * pr) + ' × ' + Math.round(innerHeight * pr);
  var scaleLabel = (typeof renderScaleResLabel === 'function') ? renderScaleResLabel() : (innerWidth + '×' + innerHeight);
  var resLabel = bufLabel + (bufLabel !== scaleLabel ? '  (滑块 ' + scaleLabel + ')' : '');
  // 「状态」行换成真实设备指标:系统/播放器 CPU + 系统/播放器内存;数据来自主进程 device-stats(渲染层每 2s 拉一次,缓存于 _devStats)
  var d = (_devStats && typeof _devStats === 'object') ? _devStats : null;
  var fmtPct = function (v) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v) + '%' : '--'; };
  var cpuLine = '系统 ' + fmtPct(d ? d.sysCpuPct : null) + ' · 播放器 ' + fmtPct(d ? d.appCpuPct : null);
  var memPct = (d && typeof d.memUsedMB === 'number' && typeof d.memTotalMB === 'number' && d.memTotalMB > 0)
    ? Math.round(d.memUsedMB * 100 / d.memTotalMB) + '%' : '--';
  var freeGB = (d && typeof d.memFreeMB === 'number' && isFinite(d.memFreeMB)) ? (d.memFreeMB / 1024).toFixed(1) + ' GB' : '--';
  var appMem = (d && typeof d.appMemMB === 'number' && isFinite(d.appMemMB)) ? Math.round(d.appMemMB) + ' MB' : '--';
  var memLine = memPct + '(剩余 ' + freeGB + ')· 播放器 ' + appMem;
  // auto 档:保留自适应治理器态(如「自适应 ×0.84 · 高」),移到独立小行;非 auto 不显示该行
  var adaptRow = '';
  var isAutoQuality = (typeof normalizePerformanceQuality === 'function')
    && normalizePerformanceQuality(fx && fx.performanceQuality) === 'auto';
  if (isAutoQuality && typeof autoGovState === 'function') {
    var gs = autoGovState();
    if (gs) {
      var govRankName = ['低', '均衡', '高', '超高'][gs.rank] || '高';
      var govFps = (gs.fgFps && gs.fgFps < 60) ? (' · ' + gs.fgFps + 'fps') : '';   // P1:治理器把前台帧率降到 45/30 时显示,便于确认降档
      adaptRow = '<div class="ph-r"><span>自适应</span><b>×' + (Math.round(gs.scaleMul * 100) / 100).toFixed(2) + ' · ' + govRankName + govFps + '</b></div>';
    }
  }
  // 手势推理指标(另一任务导出 window.__gestureStats = {delegate, avgMs, ratePerSec});无则不显示
  var gestureRow = '';
  try {
    var gst = window.__gestureStats;
    if (gst && typeof gst === 'object' && Object.keys(gst).length > 0) {
      var gMs = (typeof gst.avgMs === 'number' && isFinite(gst.avgMs)) ? (Math.round(gst.avgMs * 10) / 10) : '--';
      var gRate = (typeof gst.ratePerSec === 'number' && isFinite(gst.ratePerSec)) ? Math.round(gst.ratePerSec) : '--';
      var gDelg = gst.delegate ? (' (' + gst.delegate + ')') : '';
      gestureRow = '<div class="ph-r"><span>手势</span><b>推理 ' + gMs + 'ms @ ' + gRate + '/s' + gDelg + '</b></div>';
    }
  } catch (e) { }
  hud.innerHTML =
    '<div class="ph-h">MINERADIO · 负载</div>' +
    '<div class="ph-r"><span>帧率</span><b>' + fps + ' FPS</b></div>' +
    '<div class="ph-r"><span>渲染分辨率</span><b>' + resLabel + '</b></div>' +
    '<div class="ph-r"><span>CPU</span><b>' + cpuLine + '</b></div>' +
    adaptRow +
    '<div class="ph-r"><span>内存</span><b>' + memLine + '</b></div>' +
    gestureRow +
    '<div class="ph-tip">卡顿 / 发烫 → 手动调低分辨率或帧率</div>';
}
function updateFxInputs() {
  normalizeDevelopmentLockedFxState();
  applyShelfCameraDefaultAngle(false);
  setRange('fx-intensity', fx.intensity);
  setRange('fx-cineshake', fx.cinemaShake);
  setRange('fx-depth', fx.depth);
  setRange('fx-coverres', fx.coverResolution);
  setRange('fx-lyricglow', fx.lyricGlowStrength);
  setRange('fx-bgopacity', fx.backgroundOpacity == null ? 1 : fx.backgroundOpacity);
  setRange('fx-glassaberration', fx.controlGlassChromaticOffset);
  setRange('fx-playlistblur', fx.playlistPanelGlassBlur);
  setRange('fx-playlistdensity', fx.playlistPanelGlassDensity);
  setRange('fx-playlistopen', fx.playlistPanelOpenDuration);
  setRange('fx-playlistclose', fx.playlistPanelCloseDuration);
  setRange('fx-desktoplyricssize', fx.desktopLyricsSize);
  setRange('fx-desktoplyricsopacity', fx.desktopLyricsOpacity);
  setRange('fx-desktoplyricsy', fx.desktopLyricsY);
  setRange('fx-wallpaperopacity', fx.wallpaperOpacity);
  setRange('fx-shelfsize', fx.shelfSize);
  setRange('fx-shelfx', fx.shelfOffsetX);
  setRange('fx-shelfy', fx.shelfOffsetY);
  setRange('fx-shelfz', fx.shelfOffsetZ);
  setRange('fx-shelfangle', fx.shelfAngleY);
  setRange('fx-shelfopacity', fx.shelfOpacity);
  setRange('fx-shelfbgalpha', fx.shelfBgOpacity);
  setRange('fx-shelfdetailx', fx.shelfDetailOffsetX);
  setRange('fx-shelfdetaily', fx.shelfDetailOffsetY);
  setRange('fx-shelfdetailz', fx.shelfDetailOffsetZ);
  setRange('fx-shelfdetailscale', fx.shelfDetailScale);
  setRange('fx-shelfdetailanglex', fx.shelfDetailAngleX);
  setRange('fx-shelfdetailangley', fx.shelfDetailAngleY);
  setRange('fx-shelfdetailrowgap', fx.shelfDetailRowGap);
  setRange('fx-shelfdetailopen', fx.shelfDetailOpenDuration);
  setRange('fx-shelfdetailclose', fx.shelfDetailCloseDuration);
  setRange('fx-shelfdetailrowtime', fx.shelfDetailRowDuration);
  setRange('fx-shelfdetailintro', fx.shelfDetailIntroStrength);
  setRange('fx-shelfdetailparallax', fx.shelfDetailParallax);
  setRange('fx-shelfsummonopen', fx.shelfSummonOpenDuration);
  setRange('fx-shelfsummonclose', fx.shelfSummonCloseDuration);
  setRange('fx-shelfsummonslide', fx.shelfSummonSlide);
  setRange('fx-shelfsummonstagger', fx.shelfSummonStagger);
  setRange('fx-shelfsummonscale', fx.shelfSummonScale);
  setRange('fx-shelfsummonparallax', fx.shelfSummonParallax);
  setRange('fx-shelfcamenter', fx.shelfCameraEnterSpeed);
  setRange('fx-shelfcamexit', fx.shelfCameraExitSpeed);
  setRange('fx-lyricspacing', fx.lyricLetterSpacing);
  setRange('fx-lyriclineheight', fx.lyricLineHeight);
  setRange('fx-lyricweight', fx.lyricWeight);
  setRange('fx-lyriccustomlines', fx.lyricCustomLineCount);
  setRange('fx-lyricscalepulse', fx.lyricScalePulse);
  setRange('fx-lyricglitchintensity', fx.lyricGlitchIntensity);
  setRange('fx-lyricglitchslice', fx.lyricGlitchSlice);
  setRange('fx-lyricglitchchroma', fx.lyricGlitchChroma);
  setRange('fx-lyricglitchrate', fx.lyricGlitchRate);
  setRange('fx-lyricglitchjitter', fx.lyricGlitchJitter);
  setRange('fx-lyriccontextopacity', fx.lyricContextOpacity);
  setRange('fx-lyriccontextspread', fx.lyricContextSpread);
  setRange('fx-lyrictranslationgap', fx.lyricTranslationGap);
  setRange('fx-lyrictranslationscale', fx.lyricTranslationScale);
  setRange('fx-lyrictranslationopacity', fx.lyricTranslationOpacity);
  setRange('fx-lyricedgefade', fx.lyricEdgeFade);
  setRange('fx-lyricmotionsoftness', fx.lyricMotionSoftness);
  setRange('fx-lyricscale', fx.lyricScale);
  setRange('fx-lyricx', fx.lyricOffsetX);
  setRange('fx-lyricy', fx.lyricOffsetY);
  setRange('fx-lyricz', fx.lyricOffsetZ);
  setRange('fx-lyrictiltx', fx.lyricTiltX);
  setRange('fx-lyrictilty', fx.lyricTiltY);
  setRange('fx-point', fx.point);
  setRange('fx-speed', fx.speed);
  setRange('fx-twist', fx.twist);
  setRange('fx-color', fx.color);
  setRange('fx-bloom', fx.bloomStrength);
  setRange('fx-scatter', fx.scatter);
  setRange('fx-bgfade', fx.bgFade);
  updateLyricGlowControls();
  applyPlaylistPanelFxSettings();
  // 同步开关
  document.getElementById('t-float').classList.toggle('on', fx.floatLayer);
  var floatToggle = document.getElementById('t-float');
  if (floatToggle) floatToggle.classList.toggle('on', fx.floatLayer);
  document.getElementById('t-cinema').classList.toggle('on', fx.cinema);
  var lyricGlowToggle = document.getElementById('t-lyricGlow');
  if (lyricGlowToggle) lyricGlowToggle.classList.toggle('on', fx.lyricGlow);
  var lyricGlowBeatToggle = document.getElementById('t-lyricGlowBeat');
  if (lyricGlowBeatToggle) lyricGlowBeatToggle.classList.toggle('on', fx.lyricGlowBeat);
  var lyricGlowParticlesToggle = document.getElementById('t-lyricGlowParticles');
  if (lyricGlowParticlesToggle) lyricGlowParticlesToggle.classList.toggle('on', fx.lyricGlowParticles);
  var lyricCameraLockToggle = document.getElementById('t-lyricCameraLock');
  if (lyricCameraLockToggle) lyricCameraLockToggle.classList.toggle('on', fx.lyricCameraLock);
  document.getElementById('t-bloom').classList.toggle('on', fx.bloom);
  document.getElementById('t-edge').classList.toggle('on', fx.edge);
  var desktopLyricsToggle = document.getElementById('t-desktopLyrics');
  if (desktopLyricsToggle) desktopLyricsToggle.classList.toggle('on', fx.desktopLyrics);
  var desktopLyricsClickToggle = document.getElementById('t-desktopLyricsClickThrough');
  if (desktopLyricsClickToggle) desktopLyricsClickToggle.classList.toggle('on', fx.desktopLyricsClickThrough !== false);
  var desktopLyricsCinemaToggle = document.getElementById('t-desktopLyricsCinema');
  if (desktopLyricsCinemaToggle) desktopLyricsCinemaToggle.classList.toggle('on', fx.desktopLyricsCinema !== false);
  var desktopLyricsHighlightToggle = document.getElementById('t-desktopLyricsHighlight');
  if (desktopLyricsHighlightToggle) desktopLyricsHighlightToggle.classList.toggle('on', fx.desktopLyricsHighlight === true);
  updateDesktopLyricsFpsControls();
  var wallpaperModeToggle = document.getElementById('t-wallpaperMode');
  if (wallpaperModeToggle) wallpaperModeToggle.classList.toggle('on', fx.wallpaperMode);
  var shelfPodcastsToggle = document.getElementById('t-shelfShowPodcasts');
  if (shelfPodcastsToggle) shelfPodcastsToggle.classList.toggle('on', fx.shelfShowPodcasts !== false);
  var shelfMergeToggle = document.getElementById('t-shelfMergeCollections');
  if (shelfMergeToggle) shelfMergeToggle.classList.toggle('on', fx.shelfMergeCollections === true);
  var liveBackgroundKeepToggle = document.getElementById('t-liveBackgroundKeep');
  if (liveBackgroundKeepToggle) liveBackgroundKeepToggle.classList.toggle('on', fx.liveBackgroundKeep === true);
  applyStartupAutoplayUi();
  updatePerformanceControls();
  if (typeof updateMemoryControls === 'function') updateMemoryControls();
  updateDevelopmentFxControls();
  var aiDepthToggle = document.getElementById('t-aidepth');
  if (aiDepthToggle) aiDepthToggle.classList.toggle('on', fx.aiDepth);
  // 三态
  document.querySelectorAll('#shelf-seg button').forEach(function (b) { b.classList.toggle('active', b.dataset.shelf === fx.shelf); });
  updateShelfControlUi();
  document.querySelectorAll('#cam-seg button').forEach(function (b) { b.classList.toggle('active', b.dataset.cam === fx.cam); });
  var voxAutoRotateToggle = document.getElementById('t-voxAutoRotate');
  if (voxAutoRotateToggle) voxAutoRotateToggle.classList.toggle('on', fx.voxAutoRotate === true);
  var voxResSeg = document.getElementById('vox-res-seg');
  if (voxResSeg) voxResSeg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.dataset.voxres === ((fx && fx.voxRes) || 'mid')); });
  if (typeof setRange === 'function') setRange('fx-voxsens', fx.voxSensitivity == null ? 1 : fx.voxSensitivity);
  if (typeof setRange === 'function') setRange('fx-voxrotspeed', fx.voxRotateSpeed == null ? 0.5 : fx.voxRotateSpeed);
  var voxCoverColorToggle = document.getElementById('t-voxCoverColor');
  if (voxCoverColorToggle) voxCoverColorToggle.classList.toggle('on', fx.voxCoverColor !== false);
  var voxMeteorsToggle = document.getElementById('t-voxMeteors');
  if (voxMeteorsToggle) voxMeteorsToggle.classList.toggle('on', fx.voxMeteors !== false);
  var voxGhostCoverToggle = document.getElementById('t-voxGhostCover');
  if (voxGhostCoverToggle) voxGhostCoverToggle.classList.toggle('on', fx.voxGhostCover !== false);
  var voxFloatBlocksToggle = document.getElementById('t-voxFloatBlocks');
  if (voxFloatBlocksToggle) voxFloatBlocksToggle.classList.toggle('on', fx.voxFloatBlocks !== false);
  var voxShimmerToggle = document.getElementById('t-voxShimmer');
  if (voxShimmerToggle) voxShimmerToggle.classList.toggle('on', fx.voxShimmer !== false);
  refreshPresetGrid();
  updateLyricColorControls();
  updateLyricHighlightControls();
  updateLyricGlowControls();
  updateLyricDisplayModeControls();
  updateLyricTranslationModeControls();
  updateLyricMotionStyleControls();
  updateLyricFontControls();
  updateUiAccentControls();
  updateHomeAccentControls();
  updateIconAccentControls();
  updateCustomBackgroundControls();
  updateVisualTintControls();
  applyControlGlassChromaticOffset();
  syncFxUniforms();
}
function animateFxResetButton(btn) {
  if (!btn || !window.gsap) return;
  window.gsap.fromTo(btn, { rotate: -120, scale: 0.88 }, { rotate: 0, scale: 1, duration: 0.48, ease: 'expo.out', overwrite: true });
  window.gsap.fromTo(btn, { boxShadow: '0 0 0 0 rgba(244,210,138,.38)' }, { boxShadow: '0 0 0 8px rgba(244,210,138,0)', duration: 0.55, ease: 'sine.out', overwrite: true });
}
function isStageLyricRealtimeFxKey(key) {
  return key === 'lyricLetterSpacing'
    || key === 'lyricLineHeight'
    || key === 'lyricWeight'
    || key === 'lyricCustomLineCount'
    || key === 'lyricContextOpacity'
    || key === 'lyricContextSpread'
    || key === 'lyricTranslationGap'
    || key === 'lyricTranslationScale'
    || key === 'lyricTranslationOpacity'
    || key === 'lyricEdgeFade'
    || key === 'lyricMotionSoftness'
    || /^lyricGlitch/.test(key);
}
function isDesktopLyricRealtimeFxKey(key) {
  return isStageLyricRealtimeFxKey(key)
    || key === 'lyricScale'
    || key === 'lyricGlowStrength';
}
var lyricRealtimeRefreshTimer = null;
var lyricRealtimeLastRefreshAt = 0;
function flushStageLyricRealtimeRefresh() {
  if (lyricRealtimeRefreshTimer) {
    clearTimeout(lyricRealtimeRefreshTimer);
    lyricRealtimeRefreshTimer = null;
  }
  lyricRealtimeLastRefreshAt = window.performance && performance.now ? performance.now() : Date.now();
  refreshStageLyricDisplayMode();
}
function scheduleStageLyricRealtimeRefresh(deferred) {
  if (!deferred) {
    flushStageLyricRealtimeRefresh();
    return;
  }
  var now = window.performance && performance.now ? performance.now() : Date.now();
  var wait = Math.max(0, 120 - (now - lyricRealtimeLastRefreshAt));
  if (wait <= 0) {
    flushStageLyricRealtimeRefresh();
    return;
  }
  if (lyricRealtimeRefreshTimer) clearTimeout(lyricRealtimeRefreshTimer);
  lyricRealtimeRefreshTimer = setTimeout(flushStageLyricRealtimeRefresh, wait);
}
function syncLyricRealtimeFxChange(key, opts) {
  opts = opts || {};
  if (key === 'lyricCustomLineCount') updateLyricDisplayModeControls();
  if (key === 'lyricMotionSoftness' || /^lyricGlitch/.test(key)) updateLyricMotionStyleControls();
  if (isStageLyricRealtimeFxKey(key)) scheduleStageLyricRealtimeRefresh(!!opts.deferred);
  else if (key === 'lyricLetterSpacing' || key === 'lyricLineHeight' || key === 'lyricWeight') refreshCurrentLyricStyle();
  if (isDesktopLyricRealtimeFxKey(key)) pushDesktopLyricsState(true);
}
function resetFxSliderValue(id, key, btn) {
  if (!Object.prototype.hasOwnProperty.call(fxDefaults, key)) return;
  if (key === 'shelfAngleY') {
    fx.shelfAngleYManual = false;
    fx.shelfAngleY = shelfDefaultAngleForCameraMode(fx.shelfCameraMode);
  } else {
    fx[key] = fxDefaults[key];
  }
  setRange(id, fx[key]);
  if (key === 'coverResolution') applyCoverParticleResolution(fx[key], { reload: true });
  if (key === 'controlGlassChromaticOffset') applyControlGlassChromaticOffset();
  if (/^playlistPanel/.test(key)) applyPlaylistPanelFxSettings();
  syncFxUniforms();
  if (/^shelf/.test(key) && shelfManager && shelfManager.refreshTheme) shelfManager.refreshTheme();
  syncLyricRealtimeFxChange(key);
  saveLyricLayout({ syncDisk: key === 'controlGlassChromaticOffset', user: true, reason: 'reset:' + key });
  animateFxResetButton(btn);
  showToast('已恢复默认数值');
}
function ensureFxSliderResetButton(id, key) {
  var el = document.getElementById(id);
  if (!el || !el.parentElement || el.parentElement.querySelector('.fx-reset-one')) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fx-reset-one';
  btn.title = '恢复当前滑条默认值';
  btn.setAttribute('aria-label', '恢复当前滑条默认值');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    resetFxSliderValue(id, key, btn);
  });
  el.parentElement.appendChild(btn);
}
var fxPanelTab = 'presets';
function setFxPanelTab(tab) {
  var allowed = { presets: 1, appearance: 1, lyrics: 1, motion: 1, advanced: 1, playlist: 1 };
  fxPanelTab = allowed[tab] ? tab : 'presets';
  var panel = document.getElementById('fx-panel');
  if (panel) panel.setAttribute('data-active-tab', fxPanelTab);
  document.querySelectorAll('#fx-panel-tabs [data-fx-tab]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-fx-tab') === fxPanelTab);
  });
  document.querySelectorAll('#fx-panel .fx-tab-page').forEach(function (page) {
    page.classList.toggle('active', page.getAttribute('data-fx-page') === fxPanelTab);
  });
  repositionFxFloatingPanels();
}
function fxPanelInputId(node) {
  var input = node && node.querySelector ? node.querySelector('input[id]') : null;
  return input ? input.id : '';
}
function fxPanelTargetForNode(node, current) {
  if (!node) return current || 'presets';
  var id = node.id || '';
  var inputId = fxPanelInputId(node);
  if (id === 'preset-grid' || id === 'user-archive-grid') return 'presets';
  if (id === 'vox-fx-section') return 'motion';   // 音域回响控件 → 动态 tab
  if (id === 'app-bg-section') return 'appearance';   // 全局背景 → 外观 tab
  if (id === 'fx-lyric-fold') return 'lyrics';
  if (id === 'fx-overlay-fold' || id === 'fx-stage-fold') return 'motion';
  if (id === 'fx-advanced' || node.classList.contains('fx-actions')) return 'advanced';
  if (node.classList.contains('lyric-color-row') || node.classList.contains('cover-color-pop') || node.classList.contains('color-lab-pop') || node.classList.contains('cover-color-loupe')) return 'appearance';
  if (inputId === 'fx-bgopacity' || inputId === 'fx-glassaberration' || /^fx-playlist/.test(inputId)) return 'appearance';
  if (inputId === 'fx-lyricglow') return 'lyrics';
  if (/^fx-(intensity|depth|coverres|cineshake|shelf)/.test(inputId)) return 'motion';
  return current || 'presets';
}
function organizeFxPanel() {
  var panel = document.getElementById('fx-panel');
  if (!panel) return;
  if (panel._fxPanelOrganized) {
    setFxPanelTab(fxPanelTab);
    return;
  }
  var head = panel.querySelector('.fx-head');
  var tabMeta = [
    ['presets', '\u9884\u8bbe'],
    ['appearance', '\u5916\u89c2'],
    ['lyrics', '\u6b4c\u8bcd'],
    ['motion', '\u52a8\u6001'],
    ['advanced', '\u9ad8\u7ea7'],
    ['playlist', '\u6b4c\u5355']   // \u6b4c\u5355\u9875:\u4f53\u7d20\u9884\u8bbe\u4e13\u7528(CSS \u975e vox-on \u9690\u85cf),_voxDockPlaylist \u628a #playlist-panel \u8fc1\u8fdb\u6765
  ];
  var tabs = document.createElement('div');
  tabs.className = 'fx-panel-tabs';
  tabs.id = 'fx-panel-tabs';
  tabMeta.forEach(function (meta) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-fx-tab', meta[0]);
    btn.textContent = meta[1];
    tabs.appendChild(btn);
  });
  if (head && head.nextSibling) panel.insertBefore(tabs, head.nextSibling);
  else panel.insertBefore(tabs, panel.firstChild);
  var pages = {};
  var insertAfter = tabs;
  tabMeta.forEach(function (meta) {
    var page = document.createElement('div');
    page.className = 'fx-tab-page';
    page.setAttribute('data-fx-page', meta[0]);
    insertAfter.parentNode.insertBefore(page, insertAfter.nextSibling);
    insertAfter = page;
    pages[meta[0]] = page;
  });
  var original = Array.prototype.slice.call(panel.children).filter(function (child) {
    return child !== head && child !== tabs && !child.classList.contains('fx-tab-page');
  });
  var current = 'presets';
  original.forEach(function (node, idx) {
    var target;
    if (node.classList.contains('fx-section-label')) {
      target = fxPanelTargetForNode(original[idx + 1], current);
      current = target;
    } else {
      target = fxPanelTargetForNode(node, current);
      current = target;
    }
    (pages[target] || pages.presets).appendChild(node);
  });
  ['fx-lyric-fold', 'fx-overlay-fold', 'fx-stage-fold', 'fx-advanced'].forEach(function (id) {
    var fold = document.getElementById(id);
    if (fold) fold.classList.add('open');
  });
  // 外观 tab:默认「界面与背景」控件包进 wrap(体素预设时 CSS 隐藏);背景移出 wrap 置顶(体素/非体素通用)。音域回响(#vox-fx-section)已改由路由进「动态」tab
  var appearancePage = panel.querySelector('[data-fx-page="appearance"]');
  if (appearancePage) {
    if (!document.getElementById('appearance-default-wrap')) {
      var defWrap = document.createElement('div');
      defWrap.id = 'appearance-default-wrap';
      var appBgSection = document.getElementById('app-bg-section');   // 背景(所有预设通用):不进 wrap,体素和非体素都要能看到(用户要求)
      while (appearancePage.firstChild) defWrap.appendChild(appearancePage.firstChild);
      appearancePage.appendChild(defWrap);
      if (appBgSection) appearancePage.insertBefore(appBgSection, defWrap);   // 移出 wrap、置顶,体素下也不会被 body.vox-on 隐藏
    }
  }
  tabs.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-fx-tab]') : null;
    if (!btn) return;
    setFxPanelTab(btn.getAttribute('data-fx-tab'));
  });
  panel._fxPanelOrganized = true;
  setFxPanelTab(fxPanelTab);
}

function fxControlBlock(id) {
  var el = document.getElementById(id);
  if (!el) return null;
  return el.closest('.fx-slider,.lyric-color-row,.lyric-color-grid,.fx-seg,.preset-grid,.user-archive-grid,.fx-font-grid') || el;
}
function setFxSectionBefore(id, text) {
  var block = fxControlBlock(id);
  if (!block || !block.parentNode) return;
  var prev = block.previousElementSibling;
  if (!prev || !prev.classList || !prev.classList.contains('fx-section-label')) {
    prev = document.createElement('div');
    prev.className = 'fx-section-label';
    block.parentNode.insertBefore(prev, block);
  }
  prev.textContent = text;
}
function setFxSliderLabel(id, text) {
  var block = fxControlBlock(id);
  var label = block && block.querySelector ? block.querySelector('label') : null;
  if (label) label.textContent = text;
}
function setFxSectionBeforeNode(node, text) {
  if (!node || !node.parentNode) return;
  var prev = node.previousElementSibling;
  if (!prev || !prev.classList || !prev.classList.contains('fx-section-label')) {
    prev = document.createElement('div');
    prev.className = 'fx-section-label';
    node.parentNode.insertBefore(prev, node);
  }
  prev.textContent = text;
}
function moveToggleToGrid(toggleId, grid) {
  var node = document.getElementById(toggleId);
  if (!node || !grid || node.parentNode === grid) return;
  grid.appendChild(node);
}
function ensureFxRangeControl(anchorId, id, label, min, max, step) {
  var existing = document.getElementById(id);
  if (existing) {
    existing.min = String(min);
    existing.max = String(max);
    existing.step = String(step);
    return;
  }
  var anchor = fxControlBlock(anchorId);
  if (!anchor || !anchor.parentNode) return;
  var block = document.createElement('div');
  block.className = 'fx-slider';
  var lab = document.createElement('label');
  lab.textContent = label;
  var input = document.createElement('input');
  input.id = id;
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  var output = document.createElement('output');
  block.appendChild(lab);
  block.appendChild(input);
  block.appendChild(output);
  anchor.parentNode.insertBefore(block, anchor.nextSibling);
}
function ensureLyricPrimaryControls() {
  var body = document.querySelector('#fx-lyric-fold .fx-fold-body');
  if (!body) return;
  var grid = document.getElementById('fx-lyric-primary-controls');
  if (!grid) {
    var label = document.createElement('div');
    label.className = 'fx-section-label';
    label.id = 'fx-lyric-primary-label';
    label.textContent = '歌词开关';
    grid = document.createElement('div');
    grid.className = 'fx-toggle-grid lyric-primary-toggle-grid';
    grid.id = 'fx-lyric-primary-controls';
    body.insertBefore(grid, body.firstChild);
    body.insertBefore(label, grid);
  }
  [
    't-desktopLyrics',
    't-desktopLyricsClickThrough',
    't-desktopLyricsCinema',
    't-desktopLyricsHighlight',
    't-lyricCameraLock',
    't-lyricGlow',
    't-lyricGlowBeat',
    't-lyricGlowParticles'
  ].forEach(function (id) { moveToggleToGrid(id, grid); });
}
function applyBackgroundMediaHint() {
  var value = document.getElementById('bg-image-value');
  if (value && !value.dataset.mediaHint) {
    value.dataset.mediaHint = '1';
    value.title = '支持图片 JPG / PNG / WebP 与视频 MP4 / WebM / MOV 上传';
  }
  var label = value && value.closest ? value.closest('.fx-color-row-label') : null;
  if (label && !document.getElementById('bg-media-hint')) {
    var hint = document.createElement('small');
    hint.id = 'bg-media-hint';
    hint.textContent = '支持图片 / 视频上传';
    label.appendChild(hint);
  }
}
function relabelFxPanelControls() {
  var title = document.querySelector('#fx-panel .fx-title');
  if (title) title.textContent = '视觉控制台';
  ensureLyricPrimaryControls();
  ensureFxRangeControl('fx-lyrictranslationgap', 'fx-lyrictranslationscale', '译文字号', 0.46, 1.12, 0.01);
  ensureFxRangeControl('fx-lyrictranslationscale', 'fx-lyrictranslationopacity', '译文透明', 0.20, 1, 0.01);
  applyBackgroundMediaHint();
  var overlayGrid = document.getElementById('t-cinema');
  overlayGrid = overlayGrid && overlayGrid.closest('.fx-toggle-grid');
  setFxSectionBeforeNode(overlayGrid, '镜头与叠加');
  setFxSectionBefore('preset-grid', '预设与存档');
  setFxSectionBefore('user-archive-grid', '用户存档');
  setFxSectionBefore('ui-accent-picker', '界面与背景');
  setFxSectionBefore('fx-intensity', '画面基础');
  setFxSectionBefore('fx-lyricglow', '歌词溢光强度');
  setFxSectionBefore('lyric-color-grid', '文字颜色');
  setFxSectionBefore('lyric-highlight-picker', '跟唱高亮');
  setFxSectionBefore('lyric-glow-row', '歌词溢光颜色');
  setFxSectionBefore('lyric-source-seg', '歌词来源');
  setFxSectionBefore('lyric-display-mode-seg', '歌词行数');
  setFxSectionBefore('lyric-motion-style-seg', '歌词动画');
  setFxSectionBefore('lyric-font-grid', '字体与字距');
  setFxSectionBefore('fx-lyricscale', '位置与角度');
  setFxSectionBefore('fx-desktoplyricssize', '桌面歌词');
  setFxSectionBefore('desktop-lyrics-fps-seg', '桌面歌词帧率');
  setFxSectionBefore('close-behavior-seg', '关闭窗口');
  setFxSectionBefore('t-startupAutoplay', '启动播放');
  setFxSectionBefore('fx-playlistblur', '左侧歌单栏');
  setFxSectionBefore('shelf-seg', '3D 歌单架');
  setFxSectionBefore('shelf-camera-seg', '歌单架镜头');
  setFxSectionBefore('shelf-presence-seg', '歌单架显示');
  setFxSectionBefore('shelf-accent-picker', '歌单架外观');
  setFxSectionBefore('fx-shelfsize', '歌单架参数');
  setFxSectionBefore('fx-shelfdetailx', '歌单详情页位置');
  setFxSectionBefore('fx-shelfdetailopen', '歌单详情页动画');
  setFxSectionBefore('fx-shelfsummonopen', '歌单架唤出动画');
  setFxSectionBefore('cam-seg', '摄像头交互');
  setFxSectionBefore('fx-point', '粒子高级参数');
  setFxSliderLabel('fx-intensity', '律动强度');
  setFxSliderLabel('fx-depth', '画面景深');
  setFxSliderLabel('fx-coverres', '封面清晰度');
  setFxSliderLabel('fx-cineshake', '电影镜头');
  setFxSliderLabel('fx-lyricglow', '溢光强度');
  setFxSliderLabel('fx-bgopacity', '背景透明度');
  setFxSliderLabel('fx-glassaberration', '玻璃色差');
  setFxSliderLabel('fx-playlistblur', '左栏雾面');
  setFxSliderLabel('fx-playlistdensity', '左栏遮挡');
  setFxSliderLabel('fx-playlistopen', '左栏唤出秒数');
  setFxSliderLabel('fx-playlistclose', '左栏收起秒数');
  setFxSliderLabel('fx-lyricspacing', '字间距');
  setFxSliderLabel('fx-lyriclineheight', '行距');
  setFxSliderLabel('fx-lyricweight', '字重');
  setFxSliderLabel('fx-lyriccustomlines', '显示行数');
  setFxSliderLabel('fx-lyricglitchintensity', '故障强度');
  setFxSliderLabel('fx-lyricglitchslice', '切片幅度');
  setFxSliderLabel('fx-lyricglitchchroma', '色散强度');
  setFxSliderLabel('fx-lyricglitchrate', '触发速度');
  setFxSliderLabel('fx-lyricglitchjitter', '抖动幅度');
  setFxSliderLabel('fx-lyriccontextopacity', '上下句清晰');
  setFxSliderLabel('fx-lyriccontextspread', '上下句间距');
  setFxSliderLabel('fx-lyrictranslationgap', '译文间距');
  setFxSliderLabel('fx-lyrictranslationscale', '译文字号');
  setFxSliderLabel('fx-lyrictranslationopacity', '译文透明');
  setFxSliderLabel('fx-lyricedgefade', '边缘渐隐');
  setFxSliderLabel('fx-lyricmotionsoftness', '动画柔顺');
  setFxSliderLabel('fx-lyricscale', '歌词大小');
  setFxSliderLabel('fx-lyricx', '左右位置');
  setFxSliderLabel('fx-lyricy', '上下位置');
  setFxSliderLabel('fx-lyricz', '前后景深');
  setFxSliderLabel('fx-lyrictiltx', '上下旋转');
  setFxSliderLabel('fx-lyrictilty', '左右旋转');
  setFxSliderLabel('fx-desktoplyricssize', '桌面歌词大小');
  setFxSliderLabel('fx-desktoplyricsopacity', '桌面歌词透明度');
  setFxSliderLabel('fx-desktoplyricsy', '桌面歌词高度');
  setFxSliderLabel('fx-wallpaperopacity', '壁纸透明度');
  setFxSliderLabel('fx-shelfsize', '歌单架大小');
  setFxSliderLabel('fx-shelfx', '左右位置');
  setFxSliderLabel('fx-shelfy', '上下位置');
  setFxSliderLabel('fx-shelfz', '前后景深');
  setFxSliderLabel('fx-shelfangle', '侧向角度');
  setFxSliderLabel('fx-shelfopacity', '整体透明度');
  setFxSliderLabel('fx-shelfbgalpha', '背景透明度');
  setFxSliderLabel('fx-shelfdetailx', '详情左右');
  setFxSliderLabel('fx-shelfdetaily', '详情上下');
  setFxSliderLabel('fx-shelfdetailz', '详情前后');
  setFxSliderLabel('fx-shelfdetailscale', '详情大小');
  setFxSliderLabel('fx-shelfdetailanglex', '详情俯仰');
  setFxSliderLabel('fx-shelfdetailangley', '详情侧旋');
  setFxSliderLabel('fx-shelfdetailrowgap', '详情行间距');
  setFxSliderLabel('fx-shelfdetailopen', '展开秒数');
  setFxSliderLabel('fx-shelfdetailclose', '关闭秒数');
  setFxSliderLabel('fx-shelfdetailrowtime', '行入场秒数');
  setFxSliderLabel('fx-shelfdetailintro', '展开位移');
  setFxSliderLabel('fx-shelfdetailparallax', '悬浮视差');
  setFxSliderLabel('fx-shelfsummonopen', '唤出秒数');
  setFxSliderLabel('fx-shelfsummonclose', '收起秒数');
  setFxSliderLabel('fx-shelfsummonslide', '唤出位移');
  setFxSliderLabel('fx-shelfsummonstagger', '卡片错层');
  setFxSliderLabel('fx-shelfsummonscale', '唤出缩放');
  setFxSliderLabel('fx-shelfsummonparallax', '唤出视差');
  setFxSliderLabel('fx-shelfcamenter', '镜头进入速度');
  setFxSliderLabel('fx-shelfcamexit', '镜头离开速度');
  setFxSliderLabel('fx-point', '粒子尺寸');
  setFxSliderLabel('fx-speed', '运动速度');
  setFxSliderLabel('fx-twist', '粒子扭曲');
  setFxSliderLabel('fx-color', '色彩张力');
  setFxSliderLabel('fx-bloom', '光晕强度');
  setFxSliderLabel('fx-scatter', '离散感');
  setFxSliderLabel('fx-bgfade', '背景压暗');
}
