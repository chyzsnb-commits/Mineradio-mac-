var homeWaveTrackState = { bars: 0, smooth: [] };

// ---- 声波系列(预设 12 声波地形 / 13 声波工坊)fx 面板显隐 —— Windows v2.1.0 迁移 ----
var SONIC_ORIGINAL_FX_CONTROL_IDS = [
  'fx-sonic-ground-section', 'fx-sonicamp', 'fx-sonicspeed', 'fx-sonicdensity', 'fx-sonicrange', 'fx-soniclower', 'fx-sonicdepth', 'fx-sonicautorotate',
  'fx-sonicsubbass', 'fx-sonicbass', 'fx-soniclowmid', 'fx-sonicmid', 'fx-sonichighmid', 'fx-sonicpresence', 'fx-sonicbrilliance', 'fx-sonicair',
  'fx-sonic-color-section', 'sonic-ground-base-row', 'sonic-ground-cool-row', 'sonic-ground-warm-row', 'sonic-ground-accent-row', 'fx-sonicglow',
  'fx-sonic-floating-section', 'sonic-floating-toggle-grid', 'fx-sonicfloatcount', 'fx-sonicfloatintensity', 'fx-sonicfloatmin', 'fx-sonicfloatmax', 'fx-sonicfloatspeed'
];
var SONIC_WORKSHOP_FX_CONTROL_IDS = [
  'fx-sonic-workshop-section', 'fx-sonicwegain', 'fx-sonicweaudio', 'fx-sonicwerange', 'fx-sonicwepeak',
  'sonic-workshop-color-row', 'sonic-workshop-base-row', 'sonic-workshop-warm-row', 'sonic-workshop-cool-row',
  'sonic-workshop-ripple-row', 'sonic-workshop-peak-row', 'sonic-workshop-theme-seg'
];
function fxPanelControlBlockById(id) {
  var el = document.getElementById(id);
  if (!el) return null;
  if (el.classList && (el.classList.contains('fx-section-label') || el.classList.contains('fx-slider') || el.classList.contains('fx-toggle-grid') || el.classList.contains('sonic-audio-monitor') || el.classList.contains('lyric-color-row') || el.classList.contains('fx-seg'))) return el;
  return el.closest ? el.closest('.fx-slider,.fx-toggle-grid,.sonic-audio-monitor,.lyric-color-row,.fx-seg,.fx-section-label') : null;
}
function setFxPanelControlsHidden(ids, hidden) {
  ids.forEach(function (id) {
    var node = fxPanelControlBlockById(id);
    if (node) node.classList.toggle('fx-sonic-hidden', !!hidden);
  });
}
function updateSonicSeriesControlVisibility() {
  var preset = Number(fx && fx.preset) || 0;
  var original = preset === SONIC_PRESET_INDEX;
  var workshop = preset === SONIC_WORKSHOP_PRESET_INDEX;
  setFxPanelControlsHidden(SONIC_ORIGINAL_FX_CONTROL_IDS, !original);
  setFxPanelControlsHidden(SONIC_WORKSHOP_FX_CONTROL_IDS, !workshop);
  setFxPanelControlsHidden(['fx-lyricbgadapt-row', 'fx-lyricbgadapt'], false);
}

// 动效 tab 预设专属分组:每个预设只显示自己的动效组 + 通用组,不混杂其他预设。
// 通用组: base(基础画面,所有预设) particles(粒子与光影,仅粒子类预设 0-8)
//         audio-spectrum(频谱面板,所有预设)
// 专属组: rain-mood(预设9雨境) vox-echo(预设10音域回响)
//         sonic-terrain/sonic-audio/sonic-blocks(预设12声波地形) sonic-we(预设13声波工坊)
// 粒子层在雨境/音域回响/声波地形/声波工坊激活时隐藏(hidePoints),粒子参数不生效,故不显示。
function updateMineradioMotionGroupVisibility() {
  var preset = Number(fx && fx.preset) || 0;
  var nonParticlePreset = preset === 9 || preset === 10 || preset === 12 || preset === 13;
  var groups = document.querySelectorAll('#fx-panel [data-fx-page="motion"] .fx-console-group');
  var visibleMap = {
    'particles': !nonParticlePreset,
    'audio-spectrum': true,
    'rain-mood': preset === 9,
    'vox-echo': preset === 10,
    'sonic-terrain': preset === SONIC_PRESET_INDEX,
    'sonic-audio': preset === SONIC_PRESET_INDEX,
    'sonic-blocks': preset === SONIC_PRESET_INDEX,
    'sonic-we': preset === SONIC_WORKSHOP_PRESET_INDEX,
  };
  groups.forEach(function (group) {
    var key = group.getAttribute('data-fx-console-group') || '';
    var visible = visibleMap[key] !== false;   // 未在映射里的组(base 等)= 通用组,始终显示
    group.classList.toggle('fx-sonic-hidden', !visible);
  });
}

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
    : id === 'fx-voxfloatblockscale'
      ? Math.round(Number(value || 1) * 100) + '%'
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
  syncUnifiedPerformanceModeSeg();
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
function unifiedPerformanceModeLabel(mode) {
  mode = normalizePerformanceQuality(mode);
  return mode === 'eco' ? '省电' : (mode === 'balanced' ? '均衡' : (mode === 'ultra' ? '高性能' : '自动'));
}
// 四档只治理当前运行态的帧率、分析频率和视觉预算；切换后立即生效。
function syncUnifiedPerformanceModeSeg() {
  var seg = document.getElementById('performance-mode-seg');
  if (!seg) return;
  var current = normalizePerformanceQuality(fx && fx.performanceQuality);
  seg.querySelectorAll('[data-performance-mode]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-performance-mode') === current);
  });
}
function setUnifiedPerformanceMode(mode, silent) {
  var next = normalizePerformanceQuality(mode);
  fx.performanceQuality = next;
  updatePerformanceControls();
  applyRendererPowerMode();
  if (typeof syncGlassLiteClass === 'function') syncGlassLiteClass();
  if (typeof markRenderInteraction === 'function') markRenderInteraction('performance-mode', 900);
  else if (typeof wakeMainLoopFromBackground === 'function') wakeMainLoopFromBackground();
  saveLyricLayout({ user: true, reason: 'performanceMode' });
  if (!silent) showToast('性能模式: ' + unifiedPerformanceModeLabel(next) + ' · 已立即应用');
}
function syncPerformanceQualitySeg() {
  syncUnifiedPerformanceModeSeg();
}
function setPerformanceQualityMode(mode, silent) {
  setUnifiedPerformanceMode(mode, silent);
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
function suspendPerfHudSampling() {
  var hud = document.getElementById('perf-hud');
  if (hud) hud.style.display = 'none';
  if (_perfHudTimer) { clearInterval(_perfHudTimer); _perfHudTimer = null; }
  if (_devStatsTimer) { clearInterval(_devStatsTimer); _devStatsTimer = null; }
  _devStats = null;
}
function resumePerfHudSampling() {
  if (!perfHudOn()) return;
  if (document.body && document.body.classList.contains('mw-wallpaper')) {
    suspendPerfHudSampling();
    return;
  }
  var hud = document.getElementById('perf-hud');
  if (hud) hud.style.display = 'block';
  if (!_perfHudTimer) {
    updatePerfHud();
    _perfHudTimer = setInterval(updatePerfHud, 500);
  }
  if (!_devStatsTimer) {
    _devStatsTimer = setInterval(fetchDeviceStats, 2000);
    fetchDeviceStats();
  }
}
function setPerfHud(on) {
  try { localStorage.setItem('mr_perfHud', on ? '1' : '0'); } catch (e) { }
  var tog = document.getElementById('t-perfHud');
  if (tog) tog.classList.toggle('on', !!on);
  if (on) resumePerfHudSampling();
  else suspendPerfHudSampling();
}
function togglePerfHud() { setPerfHud(!perfHudOn()); }
// 省内存一键档:把实际渲染分辨率降到 0.75(用户自愿点,非强制)。状态由 renderScale 反推,重启后仍准。
var _memSaverPrevScale = null;
function memorySaverActive() { return typeof getRenderScale === 'function' && getRenderScale() <= 0.80; }
function toggleMemorySaver() {
  if (typeof setRenderScale !== 'function' || typeof getRenderScale !== 'function') return;
  if (memorySaverActive()) {
    setRenderScale(_memSaverPrevScale && _memSaverPrevScale > 0.80 ? _memSaverPrevScale : 1.0);
    _memSaverPrevScale = null;
    if (typeof showToast === 'function') showToast('已恢复渲染分辨率 ' + Math.round(getRenderScale() * 100) + '%');
  } else {
    _memSaverPrevScale = getRenderScale();
    setRenderScale(0.75);
    if (typeof showToast === 'function') showToast('省内存档:渲染降到 75%(更凉更省内存,画面略软,再点恢复)');
  }
  updatePerfHud();
}
function updatePerfHud() {
  var hud = document.getElementById('perf-hud');
  if (!hud || hud.style.display === 'none') return;
  var fps = (typeof renderPerfState !== 'undefined' && renderPerfState) ? (renderPerfState.fps || 0) : 0;
  // 显示实际绘制缓冲；自动治理不会改用户的分辨率滑块，括号仅在显示缓冲与手动滑块不同才出现。
  var pr = (typeof getRenderPixelRatio === 'function') ? getRenderPixelRatio() : 1;
  var bufLabel = Math.round(innerWidth * pr) + ' × ' + Math.round(innerHeight * pr);
  var scaleLabel = (typeof renderScaleResLabel === 'function') ? renderScaleResLabel() : (innerWidth + '×' + innerHeight);
  var resLabel = bufLabel + (bufLabel !== scaleLabel ? '  (滑块 ' + scaleLabel + ')' : '');
  // 真实设备指标:系统/播放器 CPU + macOS 系统/播放器 GPU + 系统/播放器内存。
  var d = (_devStats && typeof _devStats === 'object') ? _devStats : null;
  var fmtPct = function (v) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v) + '%' : '--'; };
  var cpuLine = '系统 ' + fmtPct(d ? d.sysCpuPct : null) + ' · 播放器 ' + fmtPct(d ? d.appCpuPct : null);
  var appGpuPct = (typeof rendererGpuUsagePct === 'function') ? rendererGpuUsagePct() : null;
  var gpuLine = '系统 ' + fmtPct(d ? d.sysGpuPct : null) + ' · 播放器 ' + fmtPct(appGpuPct);
  var memPct = (d && typeof d.memUsedMB === 'number' && typeof d.memTotalMB === 'number' && d.memTotalMB > 0)
    ? Math.round(d.memUsedMB * 100 / d.memTotalMB) + '%' : '--';
  var freeGB = (d && typeof d.memFreeMB === 'number' && isFinite(d.memFreeMB)) ? (d.memFreeMB / 1024).toFixed(1) + ' GB' : '--';
  var appMem = (d && typeof d.appMemMB === 'number' && isFinite(d.appMemMB)) ? Math.round(d.appMemMB) + ' MB' : '--';
  var memLine = memPct + '(剩余 ' + freeGB + ')· 播放器 ' + appMem;
  // auto 档只展示实际生效的品质 rank；不把不存在的分辨率或帧率降档伪装成状态。
  var adaptRow = '';
  var isAutoQuality = (typeof normalizePerformanceQuality === 'function')
    && normalizePerformanceQuality(fx && fx.performanceQuality) === 'auto';
  if (isAutoQuality && typeof autoGovState === 'function') {
    var gs = autoGovState();
    if (gs) {
      var govRankName = ['低', '均衡', '高', '超高'][gs.rank] || '高';
      adaptRow = '<div class="ph-r"><span>自适应</span><b>' + govRankName + '</b></div>';
    }
  }
  hud.innerHTML =
    '<div class="ph-h"><span class="ph-close" onclick="setPerfHud(false)" title="关闭负载监视器">✕</span>MINERADIO · 负载</div>' +
    '<div class="ph-r"><span>帧率</span><b>' + fps + ' FPS</b></div>' +
    '<div class="ph-r"><span>渲染分辨率</span><b>' + resLabel + '</b></div>' +
    '<div class="ph-r"><span>CPU</span><b>' + cpuLine + '</b></div>' +
    '<div class="ph-r"><span>GPU</span><b>' + gpuLine + '</b></div>' +
    adaptRow +
    '<div class="ph-r"><span>内存</span><b>' + memLine + '</b></div>' +
    '<div class="ph-tip ph-tip-btn' + (memorySaverActive() ? ' on' : '') + '" onclick="toggleMemorySaver()" title="一键把渲染分辨率降到75%,更凉更省内存;再点恢复">' +
    (memorySaverActive() ? '✓ 省内存档 开(渲染 75%)· 点这里恢复' : '卡顿 / 发烫 → 点这里一键省内存') + '</div>';
}
function updateVoxFloatBlockScaleControl() {
  var input = document.getElementById('fx-voxfloatblockscale');
  var row = document.getElementById('vox-float-block-scale-row');
  var disabled = fx.voxFloatBlocks === false;
  if (input) input.disabled = disabled;
  if (row) {
    row.classList.toggle('disabled', disabled);
    row.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }
}
function updateLyricDepthSettingsControls() {
  var interaction = fx && fx.lyricDepthInteraction === true;
  var interactionButton = document.getElementById('t-lyricDepthInteraction');
  if (interactionButton) {
    interactionButton.classList.toggle('on', interaction);
    interactionButton.setAttribute('aria-pressed', interaction ? 'true' : 'false');
    var state = interactionButton.querySelector('.lyric-depth-orbit-state');
    if (state) state.textContent = interaction ? '已开启' : '开启';
  }
  var wordSweep = !fx || fx.lyricDepthWordSweep !== false;
  var wordSweepToggle = document.getElementById('t-lyricDepthWordSweep');
  if (wordSweepToggle) {
    wordSweepToggle.classList.toggle('on', wordSweep);
    wordSweepToggle.setAttribute('aria-pressed', wordSweep ? 'true' : 'false');
  }
}
function updateLyricDepthControlAvailability() {
  var locked = !!(fx && Number(fx.preset) === 11);
  var seg = document.getElementById('lyric-display-mode-seg');
  if (seg) {
    seg.classList.toggle('lyric-depth-locked', locked);
    seg.setAttribute('aria-disabled', locked ? 'true' : 'false');
    seg.querySelectorAll('button').forEach(function (button) {
      button.disabled = locked;
      if (locked) button.title = '词境穿行固定使用五层景深';
      else button.removeAttribute('title');
    });
  }
  var lineInput = document.getElementById('fx-lyriccustomlines');
  if (lineInput) lineInput.disabled = locked;
  var lineRow = document.getElementById('lyric-custom-line-row');
  if (lineRow) {
    lineRow.classList.toggle('disabled', locked);
    lineRow.setAttribute('aria-disabled', locked ? 'true' : 'false');
  }
}
function toggleLyricDepthInteraction() {
  if (typeof resetParticleRotationTarget === 'function') resetParticleRotationTarget(true);
  fx.lyricDepthInteraction = fx.lyricDepthInteraction !== true;
  updateLyricDepthSettingsControls();
  saveLyricLayout({ user: true, reason: 'lyricDepthInteraction' });
  if (typeof markRenderInteraction === 'function') markRenderInteraction('lyric-depth-interaction', 900);
  showToast(fx.lyricDepthInteraction ? '360° 词境漫游已开启' : '360° 词境漫游已关闭');
}
function toggleLyricDepthWordSweep() {
  fx.lyricDepthWordSweep = fx.lyricDepthWordSweep === false;
  updateLyricDepthSettingsControls();
  saveLyricLayout({ user: true, reason: 'lyricDepthWordSweep' });
  if (typeof markRenderInteraction === 'function') markRenderInteraction('lyric-depth-word-sweep', 500);
  showToast(fx.lyricDepthWordSweep ? '逐字流光已开启' : '逐字流光已关闭');
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
  setRange('fx-lyrictransitionspeed', fx.lyricTransitionSpeed);
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
  // 声波地形(预设 12)控件
  setRange('fx-sonicamp', fx.sonicGroundAmplitude);
  setRange('fx-sonicspeed', fx.sonicGroundMotionSpeed);
  setRange('fx-sonicdensity', fx.sonicGroundDensity);
  setRange('fx-sonicrange', fx.sonicGroundRange);
  setRange('fx-soniclower', fx.sonicGroundLower);
  setRange('fx-sonicdepth', fx.sonicGroundDepth);
  setRange('fx-sonicautorotate', fx.sonicGroundAutoRotate);
  setRange('fx-sonicglow', fx.sonicGroundGlow);
  setRange('fx-sonicsubbass', fx.sonicGroundSubBass);
  setRange('fx-sonicbass', fx.sonicGroundBass);
  setRange('fx-soniclowmid', fx.sonicGroundLowMid);
  setRange('fx-sonicmid', fx.sonicGroundMid);
  setRange('fx-sonichighmid', fx.sonicGroundHighMid);
  setRange('fx-sonicpresence', fx.sonicGroundPresence);
  setRange('fx-sonicbrilliance', fx.sonicGroundBrilliance);
  setRange('fx-sonicair', fx.sonicGroundAir);
  setRange('fx-sonicfloatcount', fx.sonicGroundFloatingCount);
  setRange('fx-sonicfloatintensity', fx.sonicGroundFloatingIntensity);
  setRange('fx-sonicfloatmin', fx.sonicGroundFloatingMinSize);
  setRange('fx-sonicfloatmax', fx.sonicGroundFloatingMaxSize);
  setRange('fx-sonicfloatspeed', fx.sonicGroundFloatingSpeed);
  // 声波频谱(监视器)控件
  setRange('fx-sonicaudiosensitivity', fx.sonicAudioSensitivity);
  setRange('fx-sonicaudiobandstart', fx.sonicAudioBandStart);
  setRange('fx-sonicaudiobandend', fx.sonicAudioBandEnd);
  setRange('fx-sonicaudiothreshold', fx.sonicAudioThreshold);
  setRange('fx-sonicaudiopulse', fx.sonicAudioPulseStrength);
  // 声波工坊(预设 13)控件
  setRange('fx-sonicwegain', fx.sonicWorkshopInputGain);
  setRange('fx-sonicweaudio', fx.sonicWorkshopAudioIntensity);
  setRange('fx-sonicwerange', fx.sonicWorkshopResponseRange);
  setRange('fx-sonicwepeak', fx.sonicWorkshopPeakIntensity);
  var sonicMonitorToggle = document.getElementById('t-sonicAudioMonitorEnabled');
  if (sonicMonitorToggle) sonicMonitorToggle.classList.toggle('on', fx.sonicAudioMonitorEnabled !== false);
  var sonicAutoToggle = document.getElementById('t-sonicAudioAutoTrack');
  if (sonicAutoToggle) sonicAutoToggle.classList.toggle('on', fx.sonicAudioAutoTrack !== false);
  var sonicFloatingToggle = document.getElementById('t-sonicGroundFloatingEnabled');
  if (sonicFloatingToggle) sonicFloatingToggle.classList.toggle('on', fx.sonicGroundFloatingEnabled !== false);
  if (typeof updateSonicGroundColorControls === 'function') updateSonicGroundColorControls();
  if (typeof updateSonicWorkshopColorControls === 'function') updateSonicWorkshopColorControls();
  if (typeof updateSonicSeriesControlVisibility === 'function') updateSonicSeriesControlVisibility();
  if (typeof updateMineradioMotionGroupVisibility === 'function') updateMineradioMotionGroupVisibility();
  if (typeof refreshSonicAudioMonitorUi === 'function') refreshSonicAudioMonitorUi();
  var albumBackgroundMouseBindToggle = document.getElementById('t-albumBackgroundMouseBind');
  if (albumBackgroundMouseBindToggle) albumBackgroundMouseBindToggle.classList.toggle('on', fx.albumBackgroundMouseBind === true);
  var wallpaperMouseParallaxToggle = document.getElementById('t-wallpaperMouseParallax');
  if (wallpaperMouseParallaxToggle) wallpaperMouseParallaxToggle.classList.toggle('on', fx.wallpaperMouseParallax === true);
  if (typeof updateCustomBackgroundMouseParallax === 'function') updateCustomBackgroundMouseParallax();
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
  if (typeof setRange === 'function') setRange('fx-voxfloatblockscale', fx.voxFloatBlockScale == null ? 1 : fx.voxFloatBlockScale);
  if (typeof setRange === 'function') setRange('fx-rainamount', fx.rainAmount == null ? 1 : fx.rainAmount);
  if (typeof setRange === 'function') setRange('fx-rainthunder', fx.rainThunder == null ? 0.55 : fx.rainThunder);
  if (typeof setRange === 'function') setRange('fx-rainrandomfrequency', fx.rainRandomFrequency == null ? 15 : fx.rainRandomFrequency);
  var rainThunderMode = typeof rainThunderModeValue === 'function' ? rainThunderModeValue() : ((fx && fx.rainThunderMode) || 'music');
  var rainThunderModeSeg = document.getElementById('rain-thunder-mode-seg');
  if (rainThunderModeSeg) rainThunderModeSeg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.dataset.rainthundermode === rainThunderMode); });
  var musicThunderControl = document.getElementById('rain-thunder-music-control');
  if (musicThunderControl) musicThunderControl.hidden = rainThunderMode !== 'music';
  var randomThunderControl = document.getElementById('rain-thunder-random-control');
  if (randomThunderControl) randomThunderControl.hidden = rainThunderMode !== 'random';
  var randomThunderOutput = document.querySelector('#rain-thunder-random-control output');
  if (randomThunderOutput) randomThunderOutput.textContent = Math.round(fx.rainRandomFrequency == null ? 15 : fx.rainRandomFrequency) + ' 秒';
  if (typeof setRange === 'function') setRange('fx-rainglassamount', fx.rainGlassAmount == null ? 0.70 : fx.rainGlassAmount);
  if (typeof setRange === 'function') setRange('fx-rainglassspeed', fx.rainGlassSpeed == null ? 5.00 : fx.rainGlassSpeed);
  if (typeof setRange === 'function') setRange('fx-rainglasssize', fx.rainGlassSize == null ? 1.00 : fx.rainGlassSize);
  if (typeof setRange === 'function') setRange('fx-rainwindoffset', fx.rainWindOffset == null ? 0 : fx.rainWindOffset);
  if (typeof setRange === 'function') setRange('fx-rainDensity', fx.rainDensity == null ? 1 : fx.rainDensity);
  var voxCoverColorToggle = document.getElementById('t-voxCoverColor');
  if (voxCoverColorToggle) voxCoverColorToggle.classList.toggle('on', fx.voxCoverColor !== false);
  var voxMeteorsToggle = document.getElementById('t-voxMeteors');
  if (voxMeteorsToggle) voxMeteorsToggle.classList.toggle('on', fx.voxMeteors !== false);
  var voxGhostCoverToggle = document.getElementById('t-voxGhostCover');
  if (voxGhostCoverToggle) voxGhostCoverToggle.classList.toggle('on', fx.voxGhostCover !== false);
  var rainGhostCoverToggle = document.getElementById('t-rainGhostCover');
  if (rainGhostCoverToggle) rainGhostCoverToggle.classList.toggle('on', fx.rainGhostCover !== false);
  var rainGlassToggle = document.getElementById('t-rainGlassEnabled');
  if (rainGlassToggle) rainGlassToggle.classList.toggle('on', fx.rainGlassEnabled !== false);
  var voxFloatBlocksToggle = document.getElementById('t-voxFloatBlocks');
  if (voxFloatBlocksToggle) voxFloatBlocksToggle.classList.toggle('on', fx.voxFloatBlocks !== false);
  updateVoxFloatBlockScaleControl();
  var voxShimmerToggle = document.getElementById('t-voxShimmer');
  if (voxShimmerToggle) voxShimmerToggle.classList.toggle('on', fx.voxShimmer !== false);
  updateLyricDepthSettingsControls();
  updateLyricDepthControlAvailability();
  refreshPresetGrid();
  updateLyricColorControls();
  updateLyricHighlightControls();
  updateLyricGlowControls();
  updateLyricDisplayModeControls();
  updateLyricTranslationModeControls();
  updateLyricMotionStyleControls();
  updateLyricTransitionControls();
  updateLyricFontControls();
  updateUiAccentControls();
  updateHomeAccentControls();
  updateIconAccentControls();
  updateCustomBackgroundControls();
  if (typeof updatePerspectiveModeControls === 'function') updatePerspectiveModeControls();
  if (typeof syncPerspectiveCameraPowerState === 'function') syncPerspectiveCameraPowerState();
  updateVisualTintControls();
  if (typeof initAppThemeFromState === 'function') initAppThemeFromState();
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
  if (key === 'voxFloatBlockScale' && typeof saveVoxToggles === 'function') saveVoxToggles();
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
// 控制台分页元数据(图标 + 副标题由网页版美术规整而来;歌单页为本地体素预设专属,网页版没有)
var FX_TAB_META = [
  { id: 'presets', label: '预设', hint: '视觉预设与用户存档', icon: '◇' },
  { id: 'appearance', label: '外观', hint: '颜色、背景与玻璃', icon: '◐' },
  { id: 'lyrics', label: '歌词', hint: '行数、翻译与字体', icon: '〰' },
  { id: 'motion', label: '动态', hint: '律动、音域与镜头', icon: '⌁' },
  { id: 'advanced', label: '高级', hint: '性能与粒子细节', icon: '⚙' },
  { id: 'playlist', label: '歌单', hint: '体素预设的内嵌歌单', icon: '≣' }
];
function fxTabMeta(id) {
  for (var i = 0; i < FX_TAB_META.length; i++) if (FX_TAB_META[i].id === id) return FX_TAB_META[i];
  return FX_TAB_META[0];
}
var fxPanelTab = (function () {
  try {
    var saved = localStorage.getItem(FX_PANEL_TAB_STORE_KEY);
    if (/^(presets|appearance|lyrics|motion|advanced|playlist)$/.test(saved || '')) return saved;
  } catch (_) {}
  return 'presets';
})();
var fxPanelTabScroll = {};
function updateFxConsoleStatus() {
  var status = document.getElementById('fx-console-status');
  if (!status) return;
  var meta = fxTabMeta(fxPanelTab);
  var presetName = '';
  try {
    if (typeof presetMeta !== 'undefined' && presetMeta && typeof fx !== 'undefined' && fx && presetMeta[fx.preset]) {
      presetName = String(presetMeta[fx.preset].name || '').replace(/<[^>]+>/g, '');
    }
  } catch (_) {}
  status.textContent = meta.label + (presetName ? (' · ' + presetName) : (' · ' + meta.hint));
}
function setFxPanelTab(tab, opts) {
  opts = opts || {};
  // 兼容两种布局: FX 控制台(task-first-v2)用新 key;旧分页用旧 key。
  // 根据面板实际 data-console-layout 决定 key 集合,避免旧分页下映射到不存在的页面。
  var legacyToNew = { presets: 'home', appearance: 'interface', advanced: 'system', playlist: 'shelf' };
  var newToLegacy = { home: 'presets', interface: 'appearance', shelf: 'playlist', system: 'advanced' };
  var newAllowed = { home: 1, interface: 1, lyrics: 1, motion: 1, shelf: 1, system: 1 };
  var legacyAllowed = { presets: 1, appearance: 1, lyrics: 1, motion: 1, advanced: 1, playlist: 1 };
  var panel = document.getElementById('fx-panel');
  var isConsole = !!(panel && panel.getAttribute('data-console-layout') === 'task-first-v2');
  var allowed = isConsole ? newAllowed : legacyAllowed;
  var raw = String(tab || '');
  if (isConsole && legacyToNew[raw]) raw = legacyToNew[raw];
  if (!isConsole && newToLegacy[raw]) raw = newToLegacy[raw];
  var nextTab = allowed[raw] ? raw : (isConsole ? 'home' : 'presets');
  var previousTab = fxPanelTab;
  var changed = nextTab !== previousTab;
  if (panel && changed && isConsole) {
    fxPanelTabScroll[previousTab] = panel.scrollTop;
  }
  fxPanelTab = nextTab;
  try { localStorage.setItem(FX_PANEL_TAB_STORE_KEY, fxPanelTab); } catch (_) {}
  if (panel) panel.setAttribute('data-active-tab', fxPanelTab);
  document.querySelectorAll('#fx-panel-tabs [data-fx-tab]').forEach(function (btn) {
    var active = btn.getAttribute('data-fx-tab') === fxPanelTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.setAttribute('tabindex', active ? '0' : '-1');
    if (active && changed) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  document.querySelectorAll('#fx-panel .fx-tab-page').forEach(function (page) {
    var active = page.getAttribute('data-fx-page') === fxPanelTab;
    page.classList.toggle('active', active);
    page.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (active && changed && !opts.silent) {
      page.classList.remove('fx-page-enter');
      void page.offsetWidth;
      page.classList.add('fx-page-enter');
    }
  });
  if (panel && changed && isConsole) {
    requestAnimationFrame(function () {
      panel.scrollTop = Object.prototype.hasOwnProperty.call(fxPanelTabScroll, fxPanelTab) ? fxPanelTabScroll[fxPanelTab] : 0;
    });
  }
  var title = document.getElementById('fx-page-title');
  var hint = document.getElementById('fx-page-hint');
  var meta = fxTabMeta(fxPanelTab);
  if (title) title.textContent = meta.label;
  if (hint) hint.textContent = meta.hint;
  updateFxConsoleStatus();
  repositionFxFloatingPanels();
}
function applyFxPanelPinState() {
  var panel = document.getElementById('fx-panel');
  var btn = document.getElementById('fx-panel-pin-btn');
  if (panel) {
    panel.classList.toggle('pinned', !!fxPanelPinned);
    if (fxPanelPinned && typeof diyPlayerMode !== 'undefined' && diyPlayerMode) {
      panel.classList.add('peek');
      panel.classList.remove('closing');
      document.body.classList.add('fx-console-open');
      updateFxConsoleStatus();
      var fab = document.getElementById('fx-fab');
      if (fab) fab.classList.add('active');
    }
  }
  if (btn) {
    btn.classList.toggle('active', !!fxPanelPinned);
    btn.setAttribute('aria-pressed', fxPanelPinned ? 'true' : 'false');
    btn.title = fxPanelPinned ? '取消固定控制台' : '固定控制台';
    btn.setAttribute('aria-label', btn.title);
  }
}
function setFxPanelPinned(on, silent) {
  fxPanelPinned = !!on;
  saveBooleanPreference(FX_PANEL_PIN_STORE_KEY, fxPanelPinned);
  applyFxPanelPinState();
  if (!silent) showToast(fxPanelPinned ? '视觉控制台已固定' : '视觉控制台已恢复自动隐藏');
}
function toggleFxPanelPinned() {
  if (typeof diyPlayerMode !== 'undefined' && !diyPlayerMode) {
    showToast('请先开启 DIY 玩家模式');
    return;
  }
  setFxPanelPinned(!fxPanelPinned);
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
  if (id === 'vox-fx-section' || id === 'lyric-depth-fx-section') return 'motion';   // 预设专属控件(音域回响 / 词境穿行)→ 动态 tab
  if (id === 'rain-fx-section') return 'motion';  // 雨境控件 → 动态 tab
  if (id === 'app-bg-section') return 'appearance';   // 全局背景 → 外观 tab
  if (id === 'fx-lyric-fold') return 'lyrics';
  if (id === 'fx-overlay-fold' || id === 'fx-stage-fold') return 'motion';
  if (id === 'fx-advanced' || node.classList.contains('fx-actions')) return 'advanced';
  if (node.classList.contains('lyric-color-row') || node.classList.contains('cover-color-pop') || node.classList.contains('color-lab-pop') || node.classList.contains('cover-color-loupe') || node.classList.contains('app-theme-grid')) return 'appearance';
  if (inputId === 'fx-bgopacity' || inputId === 'fx-glassaberration' || /^fx-playlist/.test(inputId)) return 'appearance';
  if (inputId === 'fx-lyricglow') return 'lyrics';
  if (/^fx-(intensity|depth|coverres|cineshake|shelf)/.test(inputId)) return 'motion';
  return current || 'presets';
}
function organizeFxPanel() {
  if (typeof organizeFxConsoleWorkspace === 'function') {
    organizeFxConsoleWorkspace();
    return;
  }
  var panel = document.getElementById('fx-panel');
  if (!panel) return;
  if (panel._fxPanelOrganized) {
    setFxPanelTab(fxPanelTab, { silent: true });
    return;
  }
  panel.classList.add('fx-console');
  var head = panel.querySelector('.fx-head');
  var actions = panel.querySelector('.fx-actions');
  // \u7f51\u9875\u7248\u89c4\u6574\u540e\u7684\u9aa8\u67b6:head / shell(\u5de6\u4fa7\u7ad6\u6392 tab \u680f + \u53f3\u4fa7 \u9875\u5934+\u6eda\u52a8\u533a) / actions
  var shell = document.createElement('div');
  shell.className = 'fx-console-shell';
  shell.id = 'fx-console-shell';
  var tabs = document.createElement('nav');
  tabs.className = 'fx-panel-tabs';
  tabs.id = 'fx-panel-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '\u63a7\u5236\u53f0\u5206\u9875');
  FX_TAB_META.forEach(function (meta) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('data-fx-tab', meta.id);
    btn.innerHTML = '<span class="fx-tab-icon" aria-hidden="true">' + meta.icon + '</span><span class="fx-tab-label">' + meta.label + '</span>';
    btn.title = meta.hint;
    tabs.appendChild(btn);
  });
  var main = document.createElement('div');
  main.className = 'fx-console-main';
  var pageHead = document.createElement('div');
  pageHead.className = 'fx-page-head';
  pageHead.innerHTML = '<div><div class="fx-page-title" id="fx-page-title">\u9884\u8bbe</div><div class="fx-page-hint" id="fx-page-hint">\u89c6\u89c9\u9884\u8bbe\u4e0e\u7528\u6237\u5b58\u6863</div></div>';
  var pagesWrap = document.createElement('div');
  pagesWrap.className = 'fx-console-pages';
  pagesWrap.id = 'fx-console-pages';
  main.appendChild(pageHead);
  main.appendChild(pagesWrap);
  shell.appendChild(tabs);
  shell.appendChild(main);
  if (head && head.nextSibling) panel.insertBefore(shell, head.nextSibling);
  else panel.insertBefore(shell, panel.firstChild);
  var pages = {};
  FX_TAB_META.forEach(function (meta) {
    var page = document.createElement('div');
    page.className = 'fx-tab-page';
    page.setAttribute('data-fx-page', meta.id);
    page.setAttribute('role', 'tabpanel');
    pagesWrap.appendChild(page);
    pages[meta.id] = page;
  });
  var original = Array.prototype.slice.call(panel.children).filter(function (child) {
    return child !== head && child !== shell && child !== actions && !child.classList.contains('fx-tab-page');
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
  if (actions) panel.appendChild(actions);   // 恢复默认按钮固定在最底,不随分页滚动
  // 兜底:把仍留在 shell 外的散块扫进预设页,避免 flex 空洞
  Array.prototype.slice.call(panel.children).forEach(function (child) {
    if (child === head || child === shell || child === actions) return;
    (pages.presets || pagesWrap).appendChild(child);
  });
  ['fx-lyric-fold', 'fx-overlay-fold', 'fx-stage-fold', 'fx-advanced'].forEach(function (id) {
    var fold = document.getElementById(id);
    if (fold) fold.classList.add('open');
  });
  // 动态 tab:雨境/音域回响自定义区固定置顶,避免被镜头/粒子滑条挤到下面
  var motionPage = panel.querySelector('[data-fx-page="motion"]');
  if (motionPage) {
    var rainFxSection = document.getElementById('rain-fx-section');
    var voxFxSection = document.getElementById('vox-fx-section');
    // 顺序:雨境 → 音域回响 → 其余(摄像头/粒子等)
    if (voxFxSection) motionPage.insertBefore(voxFxSection, motionPage.firstChild);
    if (rainFxSection) motionPage.insertBefore(rainFxSection, motionPage.firstChild);
  }
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
  setFxPanelTab(fxPanelTab, { silent: true });
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
  setFxSectionBefore('lyric-translation-mode-seg', '歌词翻译 / 译文显示');
  setFxSectionBefore('lyric-motion-style-seg', '歌词动画');
  setFxSectionBefore('lyric-transition-style-seg', '歌词切换动效');
  setFxSectionBefore('lyric-font-grid', '字体与字距');
  setFxSectionBefore('fx-lyricscale', '位置与角度');
  setFxSectionBefore('fx-desktoplyricssize', '桌面歌词');
  setFxSectionBefore('desktop-lyrics-fps-seg', '桌面歌词帧率');
  setFxSectionBefore('close-behavior-seg', '关闭窗口');
  setFxSectionBefore('startup-toggle-grid', '启动播放');
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
  setFxSliderLabel('fx-lyrictransitionspeed', '切换速度');
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
