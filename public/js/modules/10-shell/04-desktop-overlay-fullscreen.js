var desktopOverlayPushState = {
  lyricsAt: 0,
  wallpaperAt: 0,
  lastLyricsKey: '',
  lastLyricsBeatKey: '',
  lastLyricsCustomFontId: '',
  lastWallpaperKey: ''
};
function getDesktopWindowApi() {
  return window.desktopWindow && window.desktopWindow.isDesktop ? window.desktopWindow : null;
}
function currentDesktopSongMeta() {
  var song = playQueue && currentIdx >= 0 ? playQueue[currentIdx] : null;
  song = song || currentLyricSong && currentLyricSong() || {};
  return {
    title: song.name || song.title || 'Mineradio',
    artist: song.artist || song.ar || song.author || '',
    cover: (typeof songCoverSrc === 'function' && song) ? (songCoverSrc(song, 360) || song.cover || '') : (song.cover || '')
  };
}
function normalizeDesktopLyricText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}
function currentDesktopLyricSnapshot() {
  var rawT = audio && isFinite(audio.currentTime) ? Number(audio.currentTime) : 0;
  var t = typeof getAdjustedLyricPlaybackTime === 'function' ? getAdjustedLyricPlaybackTime(rawT) : rawT;
  var lines = Array.isArray(lyricsLines) ? lyricsLines : [];
  if (playing && audio && lines.length) {
    var idx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].t <= t + 0.05) idx = i;
      else break;
    }
    if (idx >= 0) {
      var curLine = lines[idx] || { t: t, text: '' };
      var nextLine = lines[idx + 1];
      var nextT = nextLine && nextLine.t > curLine.t ? nextLine.t : Math.min((audio && audio.duration) || t + 4, curLine.t + (curLine.duration || 4.8));
      var span = Math.max(0.75, nextT - curLine.t);
      return {
        text: normalizeDesktopLyricText(curLine.text || currentLyricFallbackText()),
        progress: getLyricLineProgress(curLine, nextLine, t),
        progressSpan: span
      };
    }
    var introText = normalizeDesktopLyricText(currentLyricFallbackText());
    if (introText) {
      var firstLine = lines[0];
      var introEnd = firstLine && firstLine.t > 0 ? firstLine.t : Math.min((audio && audio.duration) || 4.8, 4.8);
      return {
        text: introText,
        progress: getLyricLineProgress({ t: 0, text: introText, duration: Math.max(0.8, introEnd), charCount: Math.max(1, introText.length), fallback: true }, null, t),
        progressSpan: Math.max(0.8, introEnd)
      };
    }
  }
  if (stageLyrics && stageLyrics.currentText) {
    return {
      text: normalizeDesktopLyricText(stageLyrics.currentText),
      progress: stageLyrics.current && stageLyrics.current.userData ? clampRange(Number(stageLyrics.current.userData.lastLyricProgress) || 0, 0, 1) : 0,
      progressSpan: 4.8
    };
  }
  return { text: normalizeDesktopLyricText(currentDesktopSongMeta().title || 'Mineradio'), progress: 0, progressSpan: 4.8 };
}
function desktopOverlayColorValue(value, fallback) {
  var raw = String(value || '').trim();
  fallback = String(fallback || '#d6f8ff').trim();
  if (/^#[0-9a-f]{3}$/i.test(raw) || /^#[0-9a-f]{6}$/i.test(raw)) return normalizeHexColor(raw, fallback);
  if (/^rgba?\(/i.test(raw) || /^hsla?\(/i.test(raw)) return raw;
  return normalizeHexColor(raw, fallback);
}
function desktopOverlayColors() {
  var pal = stageLyrics && stageLyrics.palette || {};
  return {
    primary: desktopOverlayColorValue(pal.primary || fx.lyricColor || '#d6f8ff', '#d6f8ff'),
    secondary: desktopOverlayColorValue(pal.secondary || fx.visualTintColor || '#9cffdf', '#9cffdf'),
    highlight: desktopOverlayColorValue(pal.highlight || fx.lyricHighlightColor || '#fff0b8', '#fff0b8'),
    glow: desktopOverlayColorValue(pal.glowColor || pal.secondary || pal.primary || fx.lyricGlowColor || '#9cffdf', '#9cffdf')
  };
}
function desktopLyricsMotionPayload() {
  return {
    lyricGlow: !!fx.lyricGlow,
    lyricGlowBeat: !!fx.lyricGlowBeat,
    lyricGlowStrength: fx.lyricGlow ? clampRange(Number(fx.lyricGlowStrength) || 0, 0, 0.85) : 0,
    highBloom: stageLyrics && isFinite(stageLyrics.highBloom) ? clampRange(stageLyrics.highBloom, 0, 1.45) : 0,
    beatGlow: stageLyrics && isFinite(stageLyrics.beatGlow) ? clampRange(stageLyrics.beatGlow, 0, 1.7) : 0,
    beatPulse: isFinite(beatPulse) ? clampRange(beatPulse, 0, 1.4) : 0,
    bass: isFinite(bass) ? clampRange(bass, 0, 1.2) : 0
  };
}
function desktopLyricsPlaybackPayload() {
  var time = audio && isFinite(audio.currentTime) ? Number(audio.currentTime) : 0;
  var duration = audio && isFinite(audio.duration) ? Number(audio.duration) : 0;
  var rate = audio && isFinite(audio.playbackRate) && audio.playbackRate > 0 ? Number(audio.playbackRate) : 1;
  return {
    time: Math.max(0, time),
    duration: Math.max(0, duration),
    rate: clampRange(rate, 0.25, 4)
  };
}
function desktopLyricsActiveBeatMap() {
  var useDj = !!(djMode && djMode.active && currentDjBeatMap);
  return {
    source: useDj ? 'dj' : 'mr',
    map: useDj ? currentDjBeatMap : currentBeatMap
  };
}
function desktopLyricsBeatMapPayload(force) {
  var selected = desktopLyricsActiveBeatMap();
  var map = selected && selected.map;
  var source = selected && selected.source || 'mr';
  var cameraCount = map ? ((map.cameraBeats && map.cameraBeats.length) || (map.beats && map.beats.length) || (map.kicks && map.kicks.length) || 0) : 0;
  var pulseCount = map ? ((map.pulseBeats && map.pulseBeats.length) || (map.kicks && map.kicks.length) || 0) : 0;
  var duration = map && isFinite(map.duration) ? Number(map.duration) : 0;
  var partialUntil = map && isFinite(map.partialUntilSec) ? Number(map.partialUntilSec) : 0;
  var key = map
    ? [source, map.analyzedAt || 0, cameraCount, pulseCount, Math.round(duration * 10), Math.round(partialUntil * 10), map.tempoSource || 'local'].join('|')
    : 'none';
  var shouldSendMap = !!force || key !== desktopOverlayPushState.lastLyricsBeatKey;
  desktopOverlayPushState.lastLyricsBeatKey = key;
  var payload = { beatMapKey: key };
  if (shouldSendMap) payload.beatMap = map ? packLocalBeatMap(map) : null;
  return payload;
}
function notifyDesktopLyricsBeatMapReady() {
  try {
    if (fx && fx.desktopLyrics) pushDesktopLyricsState(true);
  } catch (e) { }
}
function desktopLyricsPushInterval() {
  var fps = normalizeDesktopLyricsFps(fx && fx.desktopLyricsFps);
  if (!fps) return 8;
  return Math.max(8, Math.min(42, 1000 / fps));
}
function desktopLyricsCurrentCustomFontId() {
  var font = customLyricFontRecordForKey(fx && fx.lyricFont);
  return font ? font.id : '';
}
function desktopLyricsCustomFontPayload(includeDataUrl) {
  var font = customLyricFontRecordForKey(fx && fx.lyricFont);
  if (!font) return null;
  var payload = {
    id: font.id,
    family: font.family,
    name: font.name
  };
  if (includeDataUrl !== false) payload.dataUrl = font.dataUrl;
  return payload;
}
function desktopLyricsPayload(forceBeatMap, includeCustomFontData) {
  var meta = currentDesktopSongMeta();
  var lyric = currentDesktopLyricSnapshot();
  var beatPayload = desktopLyricsBeatMapPayload(!!forceBeatMap);
  var payload = {
    enabled: !!fx.desktopLyrics && !isDevelopmentLockedFx('desktopLyrics'),
    text: lyric.text,
    progress: lyric.progress,
    progressSpan: lyric.progressSpan,
    title: meta.title,
    artist: meta.artist,
    playing: !!playing,
    size: clampRange(Number(fx.desktopLyricsSize) || fxDefaults.desktopLyricsSize, 0.72, 1.55),
    opacity: clampRange(fx.desktopLyricsOpacity == null ? fxDefaults.desktopLyricsOpacity : Number(fx.desktopLyricsOpacity), 0.28, 1),
    y: clampRange(fx.desktopLyricsY == null ? fxDefaults.desktopLyricsY : Number(fx.desktopLyricsY), 0.08, 0.92),
    clickThrough: isDevelopmentLockedFx('desktopLyricsClickThrough') ? true : fx.desktopLyricsClickThrough !== false,
    lyricGlowParticles: !!fx.lyricGlowParticles,
    cinema: fx.desktopLyricsCinema !== false,
    highlightFollow: fx.desktopLyricsHighlight === true,
    frameRate: normalizeDesktopLyricsFps(fx.desktopLyricsFps),
    fontFamily: lyricFontStackForKey(fx.lyricFont),
    customFont: desktopLyricsCustomFontPayload(includeCustomFontData),
    fontWeight: lyricFontWeightValue(),
    letterSpacing: clampRange(Number(fx.lyricLetterSpacing) || 0, -0.04, 0.18),
    lineHeight: lyricLineHeightFactor(),
    lyricScale: clampRange(Number(fx.lyricScale) || 1, 0.35, 1.65),
    feather: lyricsHasNativeKaraoke ? 0.030 : 0.055,
    motion: desktopLyricsMotionPayload(),
    playback: desktopLyricsPlaybackPayload(),
    beatMapKey: beatPayload.beatMapKey,
    colors: desktopOverlayColors()
  };
  if (Object.prototype.hasOwnProperty.call(beatPayload, 'beatMap')) payload.beatMap = beatPayload.beatMap;
  return payload;
}
function wallpaperPayload() {
  var meta = currentDesktopSongMeta();
  return {
    enabled: !!fx.wallpaperMode && !isDevelopmentLockedFx('wallpaperMode'),
    title: meta.title,
    artist: meta.artist,
    cover: meta.cover,
    playing: !!playing,
    preset: fx.preset,
    opacity: clampRange(fx.wallpaperOpacity == null ? fxDefaults.wallpaperOpacity : Number(fx.wallpaperOpacity), 0.35, 1),
    colors: desktopOverlayColors()
  };
}
function pushDesktopLyricsState(force) {
  var api = getDesktopWindowApi();
  if (!api || typeof api.updateDesktopLyrics !== 'function') return;
  var now = performance.now();
  if (!force && now - desktopOverlayPushState.lyricsAt < desktopLyricsPushInterval()) return;
  var currentCustomFontId = desktopLyricsCurrentCustomFontId();
  var includeCustomFontData = !!currentCustomFontId && currentCustomFontId !== desktopOverlayPushState.lastLyricsCustomFontId;
  var payload = desktopLyricsPayload(!!force, includeCustomFontData);
  var colors = payload.colors || {};
  var motion = payload.motion || {};
  var payloadCustomFontId = payload.customFont ? payload.customFont.id : '';
  var key = payload.enabled + '|' + payload.text + '|' + Math.round(payload.progress * 1000) + '|' + Math.round((payload.progressSpan || 0) * 100) + '|' + payload.playing + '|' + payload.size + '|' + payload.opacity + '|' + payload.y + '|' + payload.clickThrough + '|' + payload.cinema + '|' + payload.highlightFollow + '|' + payload.frameRate + '|' + payload.fontFamily + '|' + payloadCustomFontId + '|' + payload.fontWeight + '|' + payload.letterSpacing + '|' + payload.lineHeight + '|' + payload.lyricScale + '|' + payload.feather + '|' + payload.beatMapKey + '|' + colors.primary + '|' + colors.secondary + '|' + colors.highlight + '|' + colors.glow + '|' + motion.lyricGlow + '|' + motion.lyricGlowBeat + '|' + Math.round((motion.lyricGlowStrength || 0) * 100) + '|' + Math.round((motion.highBloom || 0) * 100) + '|' + Math.round((motion.beatGlow || 0) * 100) + '|' + Math.round((motion.beatPulse || 0) * 100) + '|' + Math.round((motion.bass || 0) * 100);
  if (!force && key === desktopOverlayPushState.lastLyricsKey && now - desktopOverlayPushState.lyricsAt < 900) return;
  desktopOverlayPushState.lyricsAt = now;
  desktopOverlayPushState.lastLyricsKey = key;
  desktopOverlayPushState.lastLyricsCustomFontId = payloadCustomFontId;
  api.updateDesktopLyrics(payload).catch(function (e) { console.warn('desktop lyrics update failed:', e); });
}
function applyDesktopLyricsState(force) {
  var api = getDesktopWindowApi();
  if (!api) return;
  normalizeDevelopmentLockedFxState();
  var payload = desktopLyricsPayload(true, true);
  var payloadCustomFontId = payload.customFont ? payload.customFont.id : '';
  if (typeof api.setDesktopLyricsEnabled === 'function') {
    desktopOverlayPushState.lastLyricsCustomFontId = payloadCustomFontId;
    api.setDesktopLyricsEnabled(!!payload.enabled, payload).catch(function (e) { console.warn('desktop lyrics state failed:', e); });
  } else {
    desktopOverlayPushState.lastLyricsCustomFontId = '';
  }
  pushDesktopLyricsState(!!force);
}
function pushWallpaperState(force) {
  var api = getDesktopWindowApi();
  if (!api || typeof api.updateWallpaperMode !== 'function') return;
  var now = performance.now();
  if (!force && now - desktopOverlayPushState.wallpaperAt < 260) return;
  var payload = wallpaperPayload();
  var key = payload.enabled + '|' + payload.title + '|' + payload.artist + '|' + payload.cover + '|' + payload.playing + '|' + payload.preset + '|' + payload.opacity;
  if (!force && key === desktopOverlayPushState.lastWallpaperKey && now - desktopOverlayPushState.wallpaperAt < 1400) return;
  desktopOverlayPushState.wallpaperAt = now;
  desktopOverlayPushState.lastWallpaperKey = key;
  api.updateWallpaperMode(payload).catch(function (e) { console.warn('wallpaper update failed:', e); });
}
function applyWallpaperModeState(force) {
  var api = getDesktopWindowApi();
  if (!api) return;
  normalizeDevelopmentLockedFxState();
  var payload = wallpaperPayload();
  // 壁纸模式:隐藏全部 UI 外壳(CSS body.mw-wallpaper)+ 关负载监视器(移植自主线 fork)
  document.body.classList.toggle('mw-wallpaper', !!payload.enabled);
  try {
    if (payload.enabled) { var _ph = document.getElementById('perf-hud'); if (_ph) _ph.style.display = 'none'; if (typeof _perfHudTimer !== 'undefined' && _perfHudTimer) { clearInterval(_perfHudTimer); _perfHudTimer = null; } }
    else if (typeof perfHudOn === 'function' && perfHudOn() && typeof setPerfHud === 'function') setPerfHud(true);
  } catch (e) {}
  if (typeof api.setWallpaperMode === 'function') {
    api.setWallpaperMode(!!payload.enabled, payload).catch(function (e) { console.warn('wallpaper state failed:', e); });
  }
  pushWallpaperState(!!force);
}
// 主进程通知:壁纸激活状态 / 从 Tray、Dock 强制退出(移植自主线 fork)
(function initMacWallpaperBridges() {
  var api = getDesktopWindowApi();
  if (!api) return;
  if (typeof api.onWallpaperActive === 'function') {
    api.onWallpaperActive(function (active) {
      document.body.classList.toggle('mw-wallpaper', !!active);
    });
  }
  if (typeof api.onWallpaperForceOff === 'function') {
    api.onWallpaperForceOff(function () {
      document.body.classList.remove('mw-wallpaper');
      if (fx && fx.wallpaperMode) {
        fx.wallpaperMode = false;
        var tg = document.getElementById('t-wallpaperMode'); if (tg) tg.classList.remove('on');
        if (typeof saveLyricLayout === 'function') saveLyricLayout();
      }
    });
  }
  // 菜单栏 Tray 控制面板(wallpaper-mode.js 主动请求状态 + 音量遥控)——移植自 1.1.2 zip index.html:29578
  if (typeof api.onWallpaperRequestState === 'function') {
    api.onWallpaperRequestState(function () {
      try {
        var v = (typeof targetVolume === 'number') ? targetVolume : (typeof audio !== 'undefined' && audio ? audio.volume : 0.7);
        if (api.reportWallpaperState) api.reportWallpaperState({ playing: !!(typeof playing !== 'undefined' && playing), volume: v });
      } catch (e) {}
    });
  }
  if (typeof api.onWallpaperSetVolume === 'function') {
    api.onWallpaperSetVolume(function (v) { if (typeof setVolume === 'function') setVolume(v); });
  }
})();
function syncDesktopOverlayState() {
  if (fx.desktopLyrics) pushDesktopLyricsState(false);
  if (fx.wallpaperMode) pushWallpaperState(false);
}
setInterval(function () {
  if (fx && (fx.desktopLyrics || fx.wallpaperMode)) syncDesktopOverlayState();
}, 320);

// 全屏
var desktopFullscreenActive = false;
var documentFullscreenActive = false;
var desktopWindowState = {};
var desktopWindowMinimizeTimer = 0;
var desktopWindowRestoreTimer = 0;

function desktopWindowReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function clearDesktopWindowTransitionClasses() {
  document.body.classList.remove('desktop-window-minimizing');
  document.body.classList.remove('desktop-window-restoring');
}

function animateDesktopWindowMinimize(api) {
  if (!api || typeof api.minimize !== 'function') return;
  if (desktopWindowReducedMotion()) {
    api.minimize();
    return;
  }
  clearTimeout(desktopWindowMinimizeTimer);
  clearTimeout(desktopWindowRestoreTimer);
  document.body.classList.remove('desktop-window-restoring');
  document.body.classList.add('desktop-window-minimizing');
  desktopWindowMinimizeTimer = setTimeout(function () {
    document.body.classList.remove('desktop-window-minimizing');
    api.minimize();
  }, 150);
}

function animateDesktopWindowRestore() {
  if (desktopWindowReducedMotion()) {
    clearDesktopWindowTransitionClasses();
    return;
  }
  clearTimeout(desktopWindowMinimizeTimer);
  clearTimeout(desktopWindowRestoreTimer);
  document.body.classList.remove('desktop-window-minimizing');
  document.body.classList.add('desktop-window-restoring');
  desktopWindowRestoreTimer = setTimeout(function () {
    document.body.classList.remove('desktop-window-restoring');
  }, 280);
}

function toggleFullscreen() {
  var api = window.desktopWindow;
  if (api && api.isDesktop && typeof api.toggleFullscreen === 'function') {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function () { });
      scheduleMainRendererViewportRefresh('document-fullscreen-exit');
      return;
    }
    api.toggleFullscreen();
    scheduleMainRendererViewportRefresh('desktop-fullscreen-toggle');
    return;
  }
  if (api && api.isDesktop && desktopFullscreenActive && !document.fullscreenElement && typeof api.exitFullscreenWindowed === 'function') {
    api.exitFullscreenWindowed();
    scheduleMainRendererViewportRefresh('desktop-fullscreen-exit');
    return;
  }
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(function () {
      if (api && api.isDesktop && typeof api.toggleFullscreen === 'function') api.toggleFullscreen();
      else showToast('全屏被浏览器拒绝');
    });
  } else {
    document.exitFullscreen();
    scheduleMainRendererViewportRefresh('document-fullscreen-exit');
  }
}

(function initDesktopWindowShell() {
  var api = window.desktopWindow;
  if (!api || !api.isDesktop) return;

  document.documentElement.classList.add('desktop-shell-root');
  document.body.classList.add('desktop-shell');
  document.body.classList.remove('desktop-fullscreen');
  desktopFullscreenActive = false;
  syncCursorAutoHideMode();

  var maxBtn = document.querySelector('[data-window-action="maximize"]');
  var maxIcon = maxBtn && maxBtn.querySelector('.icon-maximize');
  var restoreIcon = maxBtn && maxBtn.querySelector('.icon-restore');
  function applyState(state) {
    var wasHidden = !!desktopWindowState.isMinimized || desktopWindowState.isVisible === false;
    desktopWindowState = Object.assign(desktopWindowState, state || {});
    var isHidden = !!desktopWindowState.isMinimized || desktopWindowState.isVisible === false;
    if (wasHidden && !isHidden) animateDesktopWindowRestore();
    var isMaximized = !!desktopWindowState.isMaximized;
    var isFullScreen = !!desktopWindowState.isFullScreen || !!desktopWindowState.isNativeFullScreen || !!desktopWindowState.isHtmlFullScreen || !!desktopWindowState.isWindowFullScreen || !!document.fullscreenElement;
    var wasFullScreen = desktopFullscreenActive;
    desktopFullscreenActive = isFullScreen;
    document.body.classList.toggle('desktop-maximized', isMaximized);
    document.body.classList.toggle('desktop-fullscreen', isFullScreen);
    desktopRuntimeState.fullscreen = isFullScreen;
    if (isFullScreen) layoutFullscreenDiyZone();
    if (isFullScreen !== wasFullScreen) {
      scheduleMainRendererViewportRefresh('desktop-shell-state');
      if (!isFullScreen) {
        document.body.classList.remove('fullscreen-diy-peek');
        setTimeout(function () { clearPlayerControlFocusState('desktop-fullscreen-exit'); }, 80);
      }
    }
    syncCursorAutoHideMode();
    if (maxBtn) {
      maxBtn.title = isFullScreen ? '退出全屏' : '全屏';
      maxBtn.setAttribute('aria-label', maxBtn.title);
    }
    if (maxIcon) maxIcon.style.display = isFullScreen ? 'none' : '';
    if (restoreIcon) restoreIcon.style.display = isFullScreen ? '' : 'none';
  }

  document.querySelectorAll('[data-window-action]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var action = btn.getAttribute('data-window-action');
      if (action === 'minimize') animateDesktopWindowMinimize(api);
      if (action === 'maximize') toggleFullscreen();
      if (action === 'close') {
        saveLastPlaybackSnapshot(true, 'window-close');
        api.close(closeBehaviorPreference);
      }
    });
  });

  if (typeof api.onDesktopLyricsLockState === 'function') {
    api.onDesktopLyricsLockState(function (payload) {
      var locked = !payload || payload.locked !== false;
      if (fx.desktopLyricsClickThrough === locked) return;
      fx.desktopLyricsClickThrough = locked;
      updateFxInputs();
      saveLyricLayout({ user: true, reason: 'desktopLyricsClickThrough' });
      pushDesktopLyricsState(true);
      showToast(locked ? '桌面歌词已锁定' : '桌面歌词可移动');
    });
  }
  if (typeof api.onDesktopLyricsEnabledState === 'function') {
    api.onDesktopLyricsEnabledState(function (payload) {
      var enabled = !!(payload && payload.enabled);
      if (fx.desktopLyrics === enabled) return;
      fx.desktopLyrics = enabled;
      updateFxInputs();
      saveLyricLayout({ user: true, reason: 'desktopLyrics' });
      showToast(enabled ? '桌面歌词已开启' : '桌面歌词已关闭');
    });
  }

  api.onStateChange(applyState);
  if (typeof api.getState === 'function') {
    api.getState().then(applyState).catch(function () { applyState({}); });
  } else {
    applyState({});
  }
  document.addEventListener('fullscreenchange', function () {
    var wasDocumentFullscreen = documentFullscreenActive;
    documentFullscreenActive = !!document.fullscreenElement;
    desktopWindowState.isHtmlFullScreen = documentFullscreenActive;
    if (wasDocumentFullscreen && !documentFullscreenActive && typeof api.exitFullscreenWindowed === 'function') {
      api.exitFullscreenWindowed();
    }
    applyState({});
  });
})();

// ============================================================
//  启动
// ============================================================
