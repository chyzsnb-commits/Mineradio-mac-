function isFreeCameraControlCode(code) {
  return /^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(code);
}
function consumeFreeCameraKeyEvent(e, isDown) {
  if (isTypingTarget(e.target)) return false;
  if (isDown && e.code === 'KeyR') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return true;
    toggleFreeCamera();
    return true;
  }
  // 音域回响里 R 固定后仍捕获 WASD(机位可继续平移);其它场景保持只在 active 时捕获
  var voxLockedMove = freeCamera && freeCamera.locked && !freeCamera.active && typeof voxelCityActive === 'function' && voxelCityActive();
  if (!freeCamera || !(freeCamera.active || voxLockedMove)) return false;
  if (isDown && e.code === 'KeyK') {
    e.preventDefault();
    e.stopImmediatePropagation();
    resetFreeCameraToDefault();
    return true;
  }
  if (!isFreeCameraControlCode(e.code)) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  freeCamera.keys = freeCamera.keys || {};
  freeCamera.keys[e.code] = !!isDown;
  markRenderInteraction('free-camera-key', 900);
  return true;
}
document.addEventListener('keydown', function (e) {
  consumeFreeCameraKeyEvent(e, true);
}, true);
document.addEventListener('keyup', function (e) {
  consumeFreeCameraKeyEvent(e, false);
}, true);
document.addEventListener('keydown', function (e) {
  if (isTypingTarget(e.target)) return;
  markRenderInteraction('keyboard', 700);
  if (e.code === 'KeyK') {
    e.preventDefault();
    if (freeCamera && (freeCamera.active || freeCamera.locked)) resetFreeCameraToDefault();
    else {
      recenterCamera();
      showToast('镜头已回正');
    }
    return;
  }
  if (e.code === 'KeyR') {
    if (e.repeat) return;
    e.preventDefault();
    toggleFreeCamera();
    return;
  }
  if (freeCamera && freeCamera.active) {
    if (/^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      freeCamera.keys[e.code] = true;
      return;
    }
  }
  if (!shelfManager) return;
  if (e.code === 'BracketRight' || e.code === 'PageDown') shelfManager.next();
  else if (e.code === 'BracketLeft' || e.code === 'PageUp') shelfManager.prev();
});
document.addEventListener('keyup', function (e) {
  if (!freeCamera || !freeCamera.keys) return;
  if (/^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)) {
    freeCamera.keys[e.code] = false;
  }
});
window.addEventListener('blur', function () {
  if (freeCamera && freeCamera.keys) freeCamera.keys = {};
});

// ============================================================
//  API 助手
