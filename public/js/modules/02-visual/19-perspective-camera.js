// ============================================================
//  透视模式：摄像头只作 DOM 底层，WebGL 歌词 / 封面 / 粒子保持在上方。
//  手势识别通过 shared camera manager 共用同一条摄像头流。
// ============================================================
var perspectiveModeActive = false;
var perspectiveModeStarting = false;
var perspectiveModeStartGen = 0;
var perspectiveModeError = '';
var perspectiveModeUserStart = false;
var perspectiveCameraVideo = null;
var perspectiveCameraLayer = null;
var perspectivePausedCustomBackgroundVideo = false;
var perspectiveLifecycleInstalled = false;
var perspectiveDesktopState = { minimized: false, visible: true, occluded: false };

function ensurePerspectiveCameraElements() {
  var layer = document.getElementById('perspective-bg');
  var video = document.getElementById('perspective-bg-video');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'perspective-bg';
    layer.setAttribute('aria-hidden', 'true');
    var anchor = document.getElementById('custom-bg');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(layer, anchor);
    else if (document.body.firstChild) document.body.insertBefore(layer, document.body.firstChild);
    else document.body.appendChild(layer);
  }
  if (!video) {
    video = document.createElement('video');
    video.id = 'perspective-bg-video';
    layer.appendChild(video);
  } else if (video.parentNode !== layer) {
    layer.appendChild(video);
  }
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('autoplay', '');
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  try { video.disablePictureInPicture = true; } catch (e) { }
  perspectiveCameraLayer = layer;
  perspectiveCameraVideo = video;
  return { layer: layer, video: video };
}

function perspectiveLiveVideoTrack() {
  var stream = perspectiveCameraVideo && perspectiveCameraVideo.srcObject;
  if (!stream || typeof stream.getVideoTracks !== 'function') return null;
  var tracks = stream.getVideoTracks();
  for (var i = 0; i < tracks.length; i++) {
    if (tracks[i] && tracks[i].readyState !== 'ended') return tracks[i];
  }
  return null;
}

function perspectiveCameraBackgroundActive() {
  return !!(perspectiveModeActive
    && perspectiveCameraVideo
    && perspectiveCameraVideo.readyState >= 2
    && perspectiveLiveVideoTrack());
}

function perspectiveModeDesired() {
  return !!(typeof fx !== 'undefined' && fx && fx.perspectiveMode === true);
}

function perspectiveModeShouldCapture() {
  if (!perspectiveModeDesired()) return false;
  if (typeof document === 'undefined' || document.hidden) return false;
  if (!document.body || document.body.classList.contains('splash-active')) return false;
  if (document.body.classList.contains('mw-wallpaper')) return false;
  if (typeof fx !== 'undefined' && fx && fx.wallpaperMode) return false;
  if (perspectiveDesktopState.minimized || perspectiveDesktopState.visible === false || perspectiveDesktopState.occluded) return false;
  try {
    if (typeof desktopRuntimeState !== 'undefined' && desktopRuntimeState) {
      if (desktopRuntimeState.minimized || desktopRuntimeState.visible === false || desktopRuntimeState.occluded) return false;
    }
  } catch (e) { }
  return true;
}

function perspectiveCameraFailureMessage(error) {
  var code = String(error && (error.code || error.message) || '');
  var name = String(error && error.name || '');
  var permissionStatus = String(error && (error.cameraPermissionStatus || error.gestureCameraPermissionStatus) || '');
  if (code.indexOf('PERSPECTIVE_CAMERA_FRAME_TIMEOUT') >= 0) return '摄像头没有画面或正被其他应用占用';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '没有检测到可用摄像头';
  if (name === 'NotReadableError' || name === 'TrackStartError') return '摄像头正被其他应用占用';
  if (permissionStatus === 'restricted') return '摄像头受系统限制，无法开启透视模式';
  if (permissionStatus === 'denied' || name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '摄像头权限未开启，请在系统设置 > 隐私与安全性 > 摄像头中允许 Mineradio';
  }
  return '透视模式启动失败，请重试';
}

function perspectiveSetControlState(state, message) {
  var toggle = document.getElementById('t-perspectiveMode');
  if (toggle) {
    toggle.classList.toggle('on', state === 'active');
    toggle.classList.toggle('is-starting', state === 'loading');
    toggle.classList.toggle('error', state === 'error');
    toggle.setAttribute('aria-checked', perspectiveModeDesired() ? 'true' : 'false');
    toggle.dataset.state = state;
  }
  var stateEl = document.getElementById('perspective-mode-label')
    || document.getElementById('perspective-mode-state')
    || (toggle && toggle.querySelector('[data-perspective-state]'));
  if (stateEl) {
    if (message) stateEl.textContent = message;
    else if (state === 'active') stateEl.textContent = '已开启';
    else if (state === 'loading') stateEl.textContent = '正在连接';
    else if (state === 'error') stateEl.textContent = '开启失败';
    else if (state === 'suspended') stateEl.textContent = '已暂停';
    else stateEl.textContent = '关闭';
  }
}

function updatePerspectiveModeControls() {
  if (perspectiveModeStarting) perspectiveSetControlState('loading');
  else if (perspectiveCameraBackgroundActive()) perspectiveSetControlState('active');
  else if (perspectiveModeError) perspectiveSetControlState('error', perspectiveModeError);
  else if (perspectiveModeDesired() && !perspectiveModeShouldCapture()) perspectiveSetControlState('suspended');
  else perspectiveSetControlState('off');
}

function waitForPerspectiveVideoFrame(video) {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('PERSPECTIVE_CAMERA_FRAME_TIMEOUT'));
    }, 6000);
    function cleanup() {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('canplay', ready);
      video.removeEventListener('error', failed);
    }
    function ready() {
      if (settled || video.readyState < 2) return;
      settled = true;
      cleanup();
      resolve();
    }
    function failed() {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('PERSPECTIVE_CAMERA_VIDEO_ERROR'));
    }
    video.addEventListener('loadeddata', ready);
    video.addEventListener('canplay', ready);
    video.addEventListener('error', failed);
  });
}

function pauseCustomBackgroundForPerspective() {
  var video = document.getElementById('custom-bg-video');
  perspectivePausedCustomBackgroundVideo = !!(video && !video.paused);
  if (perspectivePausedCustomBackgroundVideo) {
    try { video.pause(); } catch (e) { }
  }
}

function restoreBackgroundAfterPerspective() {
  perspectivePausedCustomBackgroundVideo = false;
  if (typeof applyCustomBackground === 'function') {
    try { applyCustomBackground(); } catch (e) { }
  }
  if (typeof _voxApplyBg === 'function') {
    try { _voxApplyBg(); } catch (e) { }
  }
}

function activatePerspectiveCameraBackground() {
  if (!perspectiveCameraVideo || perspectiveCameraVideo.readyState < 2 || !perspectiveLiveVideoTrack()) return false;
  perspectiveModeActive = true;
  perspectiveModeError = '';
  pauseCustomBackgroundForPerspective();
  document.body.classList.add('perspective-mode');
  if (typeof scene !== 'undefined' && scene) scene.background = null;
  if (typeof _voxApplyBg === 'function') {
    try { _voxApplyBg(); } catch (e) { }
  }
  updatePerspectiveModeControls();
  try {
    window.dispatchEvent(new CustomEvent('mineradio:perspective-mode-change', { detail: { active: true } }));
  } catch (e) { }
  return true;
}

function deactivatePerspectiveCameraBackground(opts) {
  opts = opts || {};
  var wasActive = perspectiveModeActive || document.body.classList.contains('perspective-mode');
  perspectiveModeActive = false;
  document.body.classList.remove('perspective-mode');
  if (perspectiveCameraVideo) {
    try { perspectiveCameraVideo.pause(); } catch (e) { }
    try { perspectiveCameraVideo.srcObject = null; } catch (e) { }
  }
  if (typeof releaseSharedCameraStream === 'function') {
    try { releaseSharedCameraStream('perspective'); } catch (e) { }
  }
  if (wasActive || perspectivePausedCustomBackgroundVideo) restoreBackgroundAfterPerspective();
  if (!opts.keepError) perspectiveModeError = '';
  updatePerspectiveModeControls();
  if (wasActive) {
    try {
      window.dispatchEvent(new CustomEvent('mineradio:perspective-mode-change', { detail: { active: false, suspended: !!opts.suspended } }));
    } catch (e) { }
  }
}

async function startPerspectiveMode(opts) {
  opts = opts || {};
  if (perspectiveCameraBackgroundActive() || perspectiveModeStarting) return;
  if (!perspectiveModeShouldCapture()) {
    updatePerspectiveModeControls();
    return;
  }
  if (typeof acquireSharedCameraStream !== 'function') {
    perspectiveModeError = '摄像头管理器未加载';
    updatePerspectiveModeControls();
    return;
  }
  perspectiveModeStarting = true;
  perspectiveModeUserStart = opts.user === true;
  perspectiveModeError = '';
  var gen = ++perspectiveModeStartGen;
  updatePerspectiveModeControls();
  try {
    var stream = await acquireSharedCameraStream('perspective');
    if (gen !== perspectiveModeStartGen || !perspectiveModeShouldCapture()) {
      // 若已有更新一代启动接手同一 owner，旧代不得把新代的共享流释放。
      if (!perspectiveModeDesired() || !perspectiveModeShouldCapture()) releaseSharedCameraStream('perspective');
      return;
    }
    var elements = ensurePerspectiveCameraElements();
    elements.video.srcObject = stream;
    await elements.video.play();
    await waitForPerspectiveVideoFrame(elements.video);
    if (gen !== perspectiveModeStartGen) {
      if (!perspectiveModeDesired() || !perspectiveModeShouldCapture()) deactivatePerspectiveCameraBackground({ suspended: true });
      return;
    }
    if (!perspectiveModeShouldCapture()) {
      deactivatePerspectiveCameraBackground({ suspended: true });
      return;
    }
    activatePerspectiveCameraBackground();
    if (typeof showToast === 'function' && opts.user === true) showToast('透视模式已开启');
  } catch (error) {
    if (gen !== perspectiveModeStartGen || (error && error.name === 'AbortError')) return;
    console.warn('[Perspective] camera start failed:', error);
    deactivatePerspectiveCameraBackground({ keepError: true });
    perspectiveModeError = perspectiveCameraFailureMessage(error);
    var settingsRequired = !!(error && (error.cameraSettingsRequired || error.gestureCameraSettingsRequired));
    if (opts.user === true && settingsRequired && window.desktopWindow && typeof window.desktopWindow.openCameraPrivacySettings === 'function') {
      try { await window.desktopWindow.openCameraPrivacySettings(); } catch (settingsError) { }
    }
    // 用户本次主动开启失败时回退开关；后台恢复失败则保留意图，等窗口下次可见时重试。
    if (opts.user === true && typeof fx !== 'undefined' && fx) {
      fx.perspectiveMode = false;
      if (typeof saveLyricLayout === 'function') saveLyricLayout({ user: true, reason: 'perspectiveMode' });
    }
    updatePerspectiveModeControls();
    if (typeof showToast === 'function') showToast(perspectiveModeError);
  } finally {
    if (gen === perspectiveModeStartGen) perspectiveModeStarting = false;
    perspectiveModeUserStart = false;
    updatePerspectiveModeControls();
  }
}

function stopPerspectiveMode(opts) {
  opts = opts || {};
  perspectiveModeStartGen++;
  perspectiveModeStarting = false;
  deactivatePerspectiveCameraBackground({ suspended: opts.suspended === true });
  if (!opts.suspended && typeof fx !== 'undefined' && fx) fx.perspectiveMode = false;
  updatePerspectiveModeControls();
}

function setPerspectiveMode(enabled, opts) {
  opts = opts || {};
  enabled = !!enabled;
  if (typeof fx !== 'undefined' && fx) fx.perspectiveMode = enabled;
  perspectiveModeError = '';
  if (typeof saveLyricLayout === 'function' && opts.save !== false) {
    saveLyricLayout({ user: opts.user !== false, reason: 'perspectiveMode' });
  }
  if (enabled) startPerspectiveMode({ user: opts.user !== false });
  else stopPerspectiveMode({ suspended: false });
  updatePerspectiveModeControls();
}

function togglePerspectiveMode(force) {
  var enabled = typeof force === 'boolean' ? force : !perspectiveModeDesired();
  setPerspectiveMode(enabled, { user: true, save: true });
}

function syncPerspectiveCameraPowerState() {
  if (perspectiveModeShouldCapture()) {
    if (!perspectiveCameraBackgroundActive() && !perspectiveModeStarting) startPerspectiveMode({ user: false });
    else if (perspectiveCameraBackgroundActive() && typeof rebalanceSharedCameraTrack === 'function') rebalanceSharedCameraTrack();
  } else if (perspectiveModeActive || perspectiveModeStarting || (typeof sharedCameraHasOwner === 'function' && sharedCameraHasOwner('perspective'))) {
    stopPerspectiveMode({ suspended: perspectiveModeDesired() });
  } else {
    updatePerspectiveModeControls();
  }
}

function bindPerspectiveModeControl() {
  var toggle = document.getElementById('t-perspectiveMode');
  if (!toggle || toggle.dataset.perspectiveBound === '1') return;
  toggle.dataset.perspectiveBound = '1';
  if (!toggle.hasAttribute('onclick')) {
    toggle.addEventListener('click', function () { togglePerspectiveMode(); });
  }
  updatePerspectiveModeControls();
}

function installPerspectiveCameraLifecycle() {
  if (perspectiveLifecycleInstalled) return;
  perspectiveLifecycleInstalled = true;
  ensurePerspectiveCameraElements();
  bindPerspectiveModeControl();
  document.addEventListener('visibilitychange', syncPerspectiveCameraPowerState);
  window.addEventListener('pagehide', function () { stopPerspectiveMode({ suspended: perspectiveModeDesired() }); });
  window.addEventListener('pageshow', syncPerspectiveCameraPowerState);
  window.addEventListener('mineradio:camera-stream-ended', function (event) {
    var owners = event && event.detail && event.detail.owners || [];
    if (owners.indexOf('perspective') < 0 && !perspectiveModeActive) return;
    perspectiveModeActive = false;
    document.body.classList.remove('perspective-mode');
    if (perspectiveCameraVideo) perspectiveCameraVideo.srcObject = null;
    try { releaseSharedCameraStream('perspective'); } catch (e) { }
    restoreBackgroundAfterPerspective();
    updatePerspectiveModeControls();
    if (perspectiveModeShouldCapture()) setTimeout(function () { startPerspectiveMode({ user: false }); }, 420);
  });
  if (window.desktopWindow && typeof window.desktopWindow.onStateChange === 'function') {
    window.desktopWindow.onStateChange(function (state) {
      state = state || {};
      perspectiveDesktopState.minimized = !!state.isMinimized;
      perspectiveDesktopState.visible = state.isVisible !== false;
      perspectiveDesktopState.occluded = !!state.isOccluded;
      syncPerspectiveCameraPowerState();
    });
  }
  var observer = new MutationObserver(function () {
    bindPerspectiveModeControl();
    syncPerspectiveCameraPowerState();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: false });
  syncPerspectiveCameraPowerState();
}

if (typeof window !== 'undefined') {
  window.perspectiveCameraBackgroundActive = perspectiveCameraBackgroundActive;
  window.startPerspectiveMode = startPerspectiveMode;
  window.stopPerspectiveMode = stopPerspectiveMode;
  window.setPerspectiveMode = setPerspectiveMode;
  window.togglePerspectiveMode = togglePerspectiveMode;
  window.syncPerspectiveCameraPowerState = syncPerspectiveCameraPowerState;
  window.updatePerspectiveModeControls = updatePerspectiveModeControls;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPerspectiveCameraLifecycle);
  else setTimeout(installPerspectiveCameraLifecycle, 0);
}
