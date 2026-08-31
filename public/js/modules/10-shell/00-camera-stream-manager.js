// ============================================================
//  Shared camera stream manager
//  手势识别与透视背景共用一条 MediaStream，避免双开摄像头和互相 stop。
// ============================================================
var sharedCameraStream = null;
var sharedCameraAcquirePromise = null;
var sharedCameraOwners = new Set();
var sharedCameraConstraintGen = 0;
var sharedCameraProfile = '';
var sharedCameraCaptureCount = 0;

function sharedCameraLiveTrack(stream) {
  if (!stream || typeof stream.getVideoTracks !== 'function') return null;
  var tracks = stream.getVideoTracks();
  for (var i = 0; i < tracks.length; i++) {
    if (tracks[i] && tracks[i].readyState !== 'ended') return tracks[i];
  }
  return null;
}

function sharedCameraStreamIsLive(stream) {
  return !!sharedCameraLiveTrack(stream);
}

function sharedCameraDispatch(type, detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));
  } catch (e) { }
}

function sharedCameraOwnerName(owner) {
  var value = String(owner || '').trim();
  if (!value) throw new Error('CAMERA_OWNER_REQUIRED');
  return value;
}

function sharedCameraPermissionError(result) {
  var status = String(result && result.status || 'unknown');
  var error = new Error('CAMERA_PERMISSION_' + status.toUpperCase());
  error.name = status === 'denied' ? 'NotAllowedError' : 'CameraPermissionError';
  error.cameraPermissionStatus = status;
  error.cameraSettingsRequired = !!(result && result.settingsRequired);
  // 保留旧手势错误字段，让现有提示和上层调用无需分叉。
  error.gestureCameraPermissionStatus = status;
  error.gestureCameraSettingsRequired = error.cameraSettingsRequired;
  return error;
}

async function requestSharedCameraPermission() {
  var bridge = typeof window !== 'undefined' ? window.desktopWindow : null;
  if (!bridge || typeof bridge.requestCameraAccess !== 'function') {
    return { ok: true, status: 'browser', requested: false, settingsRequired: false };
  }
  var result = await bridge.requestCameraAccess();
  if (result && result.ok) return result;
  throw sharedCameraPermissionError(result);
}

function sharedCameraDesiredProfile() {
  if (!sharedCameraOwners.has('perspective')) {
    return {
      key: 'gesture',
      constraints: {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 30, max: 30 },
      },
    };
  }
  var quality = '';
  try { quality = String(fx && fx.performanceQuality || ''); } catch (e) { }
  var economical = quality === 'eco' || quality === 'balanced';
  return {
    key: economical ? 'perspective-balanced' : 'perspective',
    constraints: {
      width: { ideal: economical ? 960 : 1280 },
      height: { ideal: economical ? 540 : 720 },
      frameRate: { ideal: 30, max: 30 },
    },
  };
}

async function rebalanceSharedCameraTrack() {
  var stream = sharedCameraStream;
  var track = sharedCameraLiveTrack(stream);
  if (!track) return false;
  var profile = sharedCameraDesiredProfile();
  if (profile.key === sharedCameraProfile) return true;
  var gen = ++sharedCameraConstraintGen;
  if (typeof track.applyConstraints === 'function') {
    try {
      await track.applyConstraints(profile.constraints);
    } catch (error) {
      // ideal 约束在部分摄像头上不可用；保留已采集的流，不把画面整体判为失败。
      console.warn('[Camera] applyConstraints failed, keeping current stream:', error);
    }
  }
  if (gen !== sharedCameraConstraintGen || stream !== sharedCameraStream) return false;
  sharedCameraProfile = profile.key;
  sharedCameraDispatch('mineradio:camera-profile-change', {
    profile: profile.key,
    owners: Array.from(sharedCameraOwners),
  });
  return true;
}

function stopSharedCameraStream(reason) {
  var stream = sharedCameraStream;
  sharedCameraStream = null;
  sharedCameraProfile = '';
  sharedCameraConstraintGen++;
  if (stream && typeof stream.getTracks === 'function') {
    try { stream.getTracks().forEach(function (track) { track.stop(); }); } catch (e) { }
  }
  sharedCameraDispatch('mineradio:camera-stream-change', {
    active: false,
    reason: reason || 'released',
    owners: Array.from(sharedCameraOwners),
  });
}

function handleSharedCameraTrackEnded(stream) {
  if (stream !== sharedCameraStream) return;
  sharedCameraStream = null;
  sharedCameraProfile = '';
  sharedCameraConstraintGen++;
  sharedCameraDispatch('mineradio:camera-stream-ended', {
    owners: Array.from(sharedCameraOwners),
  });
  sharedCameraDispatch('mineradio:camera-stream-change', {
    active: false,
    reason: 'ended',
    owners: Array.from(sharedCameraOwners),
  });
}

async function openSharedCameraStream() {
  // macOS TCC gate 必须在 getUserMedia 之前，否则会出现“未弹授权却直接报未开权限”。
  await requestSharedCameraPermission();
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    var unsupported = new Error('CAMERA_MEDIA_DEVICES_UNAVAILABLE');
    unsupported.name = 'NotSupportedError';
    throw unsupported;
  }
  var profile = sharedCameraDesiredProfile();
  sharedCameraCaptureCount++;
  var stream = await navigator.mediaDevices.getUserMedia({
    video: Object.assign({ facingMode: 'user' }, profile.constraints),
    audio: false,
  });
  var track = sharedCameraLiveTrack(stream);
  if (!track) {
    try { stream.getTracks().forEach(function (item) { item.stop(); }); } catch (e) { }
    var unreadable = new Error('CAMERA_STREAM_HAS_NO_LIVE_VIDEO_TRACK');
    unreadable.name = 'NotReadableError';
    throw unreadable;
  }
  if (sharedCameraOwners.size === 0) {
    try { stream.getTracks().forEach(function (item) { item.stop(); }); } catch (e) { }
    var cancelled = new Error('CAMERA_ACQUIRE_CANCELLED');
    cancelled.name = 'AbortError';
    throw cancelled;
  }
  sharedCameraStream = stream;
  sharedCameraProfile = profile.key;
  if (typeof track.addEventListener === 'function') {
    track.addEventListener('ended', function () { handleSharedCameraTrackEnded(stream); }, { once: true });
  } else {
    track.onended = function () { handleSharedCameraTrackEnded(stream); };
  }
  sharedCameraDispatch('mineradio:camera-stream-change', {
    active: true,
    profile: profile.key,
    owners: Array.from(sharedCameraOwners),
  });
  return stream;
}

async function acquireSharedCameraStream(owner) {
  owner = sharedCameraOwnerName(owner);
  sharedCameraOwners.add(owner);
  if (sharedCameraStreamIsLive(sharedCameraStream)) {
    await rebalanceSharedCameraTrack();
    return sharedCameraStream;
  }
  if (!sharedCameraAcquirePromise) sharedCameraAcquirePromise = openSharedCameraStream();
  var pending = sharedCameraAcquirePromise;
  try {
    var stream = await pending;
    if (!sharedCameraOwners.has(owner)) {
      var cancelled = new Error('CAMERA_OWNER_RELEASED_DURING_ACQUIRE');
      cancelled.name = 'AbortError';
      throw cancelled;
    }
    await rebalanceSharedCameraTrack();
    return stream;
  } catch (error) {
    sharedCameraOwners.delete(owner);
    if (sharedCameraOwners.size === 0 && sharedCameraStream) stopSharedCameraStream('acquire-failed');
    throw error;
  } finally {
    if (sharedCameraAcquirePromise === pending) sharedCameraAcquirePromise = null;
  }
}

function releaseSharedCameraStream(owner) {
  owner = sharedCameraOwnerName(owner);
  sharedCameraOwners.delete(owner);
  if (sharedCameraOwners.size === 0) {
    if (sharedCameraStream) stopSharedCameraStream('released');
    return Promise.resolve(true);
  }
  return rebalanceSharedCameraTrack();
}

function sharedCameraHasOwner(owner) {
  return sharedCameraOwners.has(String(owner || ''));
}

function getSharedCameraStream() {
  return sharedCameraStreamIsLive(sharedCameraStream) ? sharedCameraStream : null;
}

function getSharedCameraState() {
  return {
    active: sharedCameraStreamIsLive(sharedCameraStream),
    owners: Array.from(sharedCameraOwners),
    profile: sharedCameraProfile,
    captureCount: sharedCameraCaptureCount,
  };
}

if (typeof window !== 'undefined') {
  window.requestSharedCameraPermission = requestSharedCameraPermission;
  window.acquireSharedCameraStream = acquireSharedCameraStream;
  window.releaseSharedCameraStream = releaseSharedCameraStream;
  window.rebalanceSharedCameraTrack = rebalanceSharedCameraTrack;
  window.sharedCameraHasOwner = sharedCameraHasOwner;
  window.getSharedCameraStream = getSharedCameraStream;
  window.getSharedCameraState = getSharedCameraState;
  window.__mineradioCameraStreamManager = {
    acquire: acquireSharedCameraStream,
    release: releaseSharedCameraStream,
    rebalance: rebalanceSharedCameraTrack,
    getStream: getSharedCameraStream,
    getState: getSharedCameraState,
  };
}
