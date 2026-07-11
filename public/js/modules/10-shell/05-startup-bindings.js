applyDiyMode(diyPlayerMode, { save: false });
// 一次性迁移: 老用户的 3D 歌单架镜头强制切到「动态」——静态镜头会禁用 shelf-side 聚焦, 导致歌架在多数预设错位。
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('mineradio-beat-shelfdyn-migrated-v1') !== '1') {
    if (normalizeShelfCameraMode(fx.shelfCameraMode) !== 'dynamic') {
      fx.shelfCameraMode = 'dynamic';
      if (fx.shelfAngleYManual !== true) fx.shelfAngleY = shelfDefaultAngleForCameraMode('dynamic');
      if (typeof saveLyricLayout === 'function') saveLyricLayout({ user: false, reason: 'shelfdyn-migrate' });
    }
    localStorage.setItem('mineradio-beat-shelfdyn-migrated-v1', '1');
  }
} catch (e) { }
if (typeof loadVoxBg === 'function') loadVoxBg();   // 音域回响:恢复自定义背景/歌单颜色(须在控件绑定读 fx.vox* 之前)
if (typeof loadVoxToggles === 'function') loadVoxToggles();   // 恢复体素/侧边歌词开关(自转/取色/流星/封面图/悬浮方块/闪烁点/侧边歌词/柱数)
bindFxPanel();
if (typeof _voxApplyBg === 'function') _voxApplyBg();   // 音域回响:恢复「所有预设通用」背景(非体素预设也生效)
if (typeof _voxApplyPlaylistColor === 'function') _voxApplyPlaylistColor();
applySavedLyricPaletteState();
bindQualityControl();
bindAudioOutputControls();
bindVolumeControls();
initControlGlassSurface();
bindPlayerControlAnimations();
scheduleUiWarmTask(function () {
  updateControlGlassDisplacementMap();
  updateSearchBoxGlassDisplacementMap();
  updateSearchPillGlassDisplacementMap();
  try {
    if (renderer && renderer.compile && scene && camera) renderer.compile(scene, camera);
  } catch (e) { }
}, 900);
applyUserCapsuleAutoHideState();
applyFxFabAutoHideState();
initializeDesktopCloseBehavior();
applyStartupAutoplayUi();
applyControlsAutoHidePreference();
applyDesktopLyricsState(false);
applyWallpaperModeState(false);
setShelfMode(fx.shelf);
if (fx.shelf === 'side') setShelfPinnedOpen(!!fx.shelfPinnedOpen, true, false);
var restoredPlaybackAtStartup = restoreLastPlaybackSnapshot();
applyStartupStarfieldPreset();
switchPlaylistTab(queueViewTab, { save: false, animate: false, refresh: false });
applyPlaylistPanelPinState(false);
if (fx.floatLayer) createFloatLayer();
if (fx.particleLyrics) createLyricsParticles();
if (fx.backCover) createBackCoverLayer();
initIdleGuideCanvas();
// netease + QQ 立即拉取;startupLoginStatusPromise 只等这两家(下游 hasAnyPlatformLogin 链沿用 Promise.all 语义)
var startupLoginStatusPromise = Promise.all([refreshLoginStatus(), refreshQQLoginStatus({ forceVip: true, reason: 'startup' })]);
startQQLoginStatusAutoRefresh();
// kugou/qishui/spotify 错峰启动:推迟 3500ms 降低首屏争抢(打开登录面板时既有逻辑本就会即时刷新)
setTimeout(function () {
  refreshKugouLoginStatus();
  refreshQishuiLoginStatus();
  refreshSpotifyLoginStatus();
  startKugouLoginStatusAutoRefresh();
  startQishuiLoginStatusAutoRefresh();
  startSpotifyLoginStatusAutoRefresh();
}, 3500);
if (startupLoginStatusPromise && startupLoginStatusPromise.then) {
  startupLoginStatusPromise.then(function () {
    if (hasAnyPlatformLogin()) {
      refreshUserPlaylists(true);
      loadHomeDiscover(true);
    }
    if (restoredPlaybackAtStartup) queueStartupAutoplayAfterHomeReveal('login-status');
    if (document.body.classList.contains('splash-active')) return;
    var homeShown = updateEmptyHomeVisibility({ forceLoad: hasAnyPlatformLogin() });
    if (!hasAnyPlatformLogin()) maybeRunStartupLoginGuide('status');
    else if (!homeShown) maybeRunStartupLoginGuide('status');
  }, function () {
    if (restoredPlaybackAtStartup) queueStartupAutoplayAfterHomeReveal('login-status');
  });
} else if (restoredPlaybackAtStartup) {
  queueStartupAutoplayAfterHomeReveal('startup');
}
var collectNameInput = document.getElementById('collect-new-name');
if (collectNameInput) {
  collectNameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      createPlaylistFromCollect();
    }
  });
}
var customLyricInput = document.getElementById('custom-lyric-input');
if (customLyricInput) {
  customLyricInput.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveCustomLyricForCurrent();
    }
  });
}
safeRenderQueuePanel('startup');
if (!restoredPlaybackAtStartup) {
  restoredPlaybackAtStartup = restoreLastPlaybackSnapshot();
  if (restoredPlaybackAtStartup) queueStartupAutoplayAfterHomeReveal('startup-restore');
}
safeRenderQueuePanel('startup-restore');
updateCustomCoverButton();
updateCustomLyricControls();
updateLikeButtons();
setTimeout(initUpdatePreview, 9000);
window.addEventListener('beforeunload', function () {
  saveLastPlaybackSnapshot(true, 'beforeunload');
});

// ============================================================
//  主循环
