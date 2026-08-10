// ============================================================
var shelfPinnedOpen = false;
var shelfManager = null;
var shelfOpenAnimAt = -10;
var shelfHoverCue = { target: 0, value: 0, x: 0, y: 0, lastAt: 0, enteredAt: 0, zoneActive: false, guide: false };
var shelfVisibility = 0;  // 0..1, 侧栏自动隐藏的整体透明度系数
var shelfHardHidden = false;  // 播放栏按钮:把整个 3D 歌架硬隐藏(优先级高于 presence='always')
var shelfPlaybackSwitchGuardUntil = 0;
var shelfPlaybackSwitchGuardUntil = 0;
function shelfPlaybackSwitchGuardActive(now) {
  return (now || performance.now()) < shelfPlaybackSwitchGuardUntil;
}
function markShelfPlaybackSwitchGuard(ms) {
  shelfPlaybackSwitchGuardUntil = Math.max(shelfPlaybackSwitchGuardUntil, performance.now() + Math.max(220, ms || 980));
  shelfHoverCue.target = 0;
  shelfHoverCue.value = 0;
  shelfHoverCue.zoneActive = false;
  shelfHoverCue.enteredAt = 0;
  shelfHoverCue.guide = false;
  shelfVisibility = 0;
  if (typeof setShelfHoverTabVisible === 'function') setShelfHoverTabVisible(false);
  if (shelfManager && shelfManager.clearSelected) shelfManager.clearSelected();
  if (typeof setFocusZone === 'function') setFocusZone(null, true);
}
function isPortraitShelfViewport() {
  return innerHeight > innerWidth * 1.08;
}
function p10ShelfSideLayout(layout, forceActive) {
  var p10Active = forceActive === true || (forceActive !== false && typeof voxelCityActive === 'function' && voxelCityActive());
  if (!p10Active || !layout) return layout;
  // 图二构图：中心卡位于右侧中部，卡组沿完整纵向间距展开。
  // 保留用户的歌架微调，只抵消普通预设中不适合 P10 远景的默认偏移。
  var next = Object.assign({}, layout);
  next.sideX = (Number(layout.sideX) || 0) - 0.63;
  next.sideY = (Number(layout.sideY) || 0) + 0.08;
  next.sideZ = (Number(layout.sideZ) || 0) - 0.10;
  next.sideXStep = (Number(layout.sideXStep) || 0) * 1.15;
  next.sideYStep = Number(layout.sideYStep) || 0;
  next.sideZStep = Number(layout.sideZStep) || 0;
  next.sideEntryX = (Number(layout.sideEntryX) || 0) * 0.90;
  next.sideDetailShift = (Number(layout.sideDetailShift) || 0) * 0.90;
  next.sideScale = (Number(layout.sideScale) || 1) * 0.82;
  // P10 只改变远景坐标与尺寸，不削弱普通歌架已经验证过的斜切角度。
  next.sideRotY = Number(layout.sideRotY) || 0;
  next.sideRotX = Number(layout.sideRotX) || 0;
  return next;
}
function p10ShelfRootPose(frameYaw, pointerX, pointerY) {
  return {
    x: 0.035 - (Number(pointerY) || 0) * 0.006,
    y: (Number(frameYaw) || 0) - 0.055 + (Number(pointerX) || 0) * 0.012,
    z: 0.035
  };
}
function p10ShelfCameraAnchor(cameraRef) {
  if (!cameraRef || !cameraRef.position || !cameraRef.quaternion || typeof cameraRef.getWorldDirection !== 'function' || typeof THREE === 'undefined') return null;
  var forward = new THREE.Vector3();
  var right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRef.quaternion);
  cameraRef.getWorldDirection(forward);
  // P10 保留原生远景镜头；一级歌架因此不能继续留在体素地形原点。
  // 放到镜头前方偏右的净空区域，既不会缩成黑色远景，也不会放大塞进音柱。
  return {
    x: cameraRef.position.x + forward.x * 18 + right.x * -1.2,
    y: cameraRef.position.y + forward.y * 18,
    z: cameraRef.position.z + forward.z * 18 + right.z * -1.2
  };
}
function p10ShelfCardSurface(shelfLook) {
  if (typeof voxelCityActive !== 'function' || !voxelCityActive()) return null;
  var palette = typeof stageLyrics !== 'undefined' && stageLyrics && stageLyrics.palette ? stageLyrics.palette : null;
  var source = palette && (palette.secondary || palette.primary || palette.highlight);
  var rgb = typeof hexToRgb === 'function' ? hexToRgb(source) : null;
  if (!rgb) rgb = { r: 92, g: 126, b: 148 };
  var raw = shelfLook ? Number(shelfLook.bgOpacity) : 0.90;
  // 一级卡处在体素远景和黑色场景上，普通的暗玻璃比例会被两次透明度合成吃掉。
  // 提高冷色底和 alpha，但仍限制在玻璃范围，避免变成不透明色块。
  var alpha = clampRange(raw * 0.62, 0.34, 0.62);
  var r = Math.round(12 + rgb.r * 0.24);
  var g = Math.round(24 + rgb.g * 0.28);
  var b = Math.round(36 + rgb.b * 0.34);
  return {
    base: 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')',
    highlight: 'rgba(' + Math.min(245, r + 132) + ',' + Math.min(248, g + 138) + ',' + Math.min(255, b + 148) + ',0.105)',
    key: [r, g, b, alpha.toFixed(3)].join(':')
  };
}
function shelfLayoutProfile() {
  var portrait = isPortraitShelfViewport();
  var narrow = !portrait && innerWidth < 980;
  var skullShelf = shouldUseSkullSafeShelfCamera();
  var detailScale = portrait ? clampRange(innerWidth / 820, 0.70, 0.86) : (narrow ? 0.92 : 1.04);
  var shelfCtl = shelfSettings();
  var detailCtl = shelfDetailSettings();
  return {
    portrait: portrait,
    narrow: narrow,
    sideX: (skullShelf ? (portrait ? 0.22 : (narrow ? 0.46 : 0.76)) : (portrait ? 1.56 : (narrow ? 2.48 : 3.18))) + shelfCtl.x,
    sideY: (skullShelf ? (portrait ? -0.22 : (narrow ? -0.30 : -0.34)) : 0) + shelfCtl.y,
    sideXStep: skullShelf ? (portrait ? 0.018 : 0.034) : (portrait ? 0.018 : 0.040),
    sideYStep: skullShelf ? (portrait ? 0.46 : 0.62) : (portrait ? 0.52 : 0.68),
    sideZ: (skullShelf ? (portrait ? 0.86 : 0.92) : (portrait ? 0.78 : 0.86)) + shelfCtl.z,
    sideZStep: skullShelf ? (portrait ? 0.108 : 0.158) : (portrait ? 0.118 : 0.170),
    sideEntryX: skullShelf ? (portrait ? 0.30 : 0.50) : (portrait ? 0.38 : 0.82),
    sideDetailShift: skullShelf ? (portrait ? 0.00 : 0.00) : (portrait ? 0.38 : 0.82),
    sideScale: (skullShelf ? (portrait ? 0.84 : (narrow ? 1.04 : 1.22)) : (portrait ? 0.70 : (narrow ? 0.86 : 1))) * shelfCtl.size,
    sideRotY: (skullShelf ? (portrait ? -0.085 : -0.190) : (portrait ? 0.12 : 0.28)) + shelfCtl.angle,
    sideRotX: skullShelf ? (portrait ? 0.018 : 0.030) : (portrait ? 0.022 : 0.042),
    stageX: shelfCtl.x,
    stageXStep: portrait ? 0.92 : (narrow ? 1.22 : 1.55),
    stageY: (portrait ? -2.46 : -2.20) + shelfCtl.y,
    stageZ: (portrait ? 0.84 : 1.0) + shelfCtl.z,
    stageScale: (portrait ? 0.72 : (narrow ? 0.86 : 1)) * shelfCtl.size,
    detail: {
      x: (skullShelf ? (portrait ? 0.16 : (narrow ? 0.40 : 0.64)) : (portrait ? 0.38 : (narrow ? 0.96 : 1.28))) + shelfCtl.x * 0.62 + detailCtl.x,
      y: (skullShelf ? (portrait ? -0.40 : -0.68) : (portrait ? 0.10 : 0.18)) + shelfCtl.y * 0.55 + detailCtl.y,
      z: (skullShelf ? (portrait ? 1.10 : 1.22) : (portrait ? 1.28 : 1.36)) + shelfCtl.z * 0.45 + detailCtl.z,
      rx: (skullShelf ? (portrait ? 0.006 : 0.014) : (portrait ? -0.004 : -0.008)) + detailCtl.rx,
      ry: (skullShelf ? (portrait ? -0.070 : -0.165) : (portrait ? 0.00 : 0.020)) + shelfCtl.angle * 0.55 + detailCtl.ry,
      scale: (skullShelf ? detailScale * (portrait ? 0.88 : 1.02) : detailScale) * shelfCtl.size * detailCtl.scale,
      rowStep: (skullShelf ? (portrait ? 0.37 : 0.43) : (portrait ? 0.36 : 0.42)) * detailCtl.rowGap,
      openDuration: detailCtl.openDuration,
      closeDuration: detailCtl.closeDuration,
      rowDuration: detailCtl.rowDuration,
      intro: detailCtl.intro,
      parallax: detailCtl.parallax,
      rowScale: skullShelf ? (portrait ? 0.90 : 1.02) : (portrait ? 0.88 : (narrow ? 0.96 : 1.00))
    }
  };
}
function shelfHotZoneWidth() {
  var ratio = isPortraitShelfViewport() ? 0.26 : 0.18;
  return Math.min(isPortraitShelfViewport() ? 280 : 360, Math.max(148, innerWidth * ratio));
}
function shelfPreviewUseZoneWidth() {
  return Math.min(820, Math.max(shelfHotZoneWidth(), innerWidth * 0.56));
}
function shelfWheelZoneWidth() {
  var portrait = isPortraitShelfViewport();
  var ratioWidth = innerWidth * (portrait ? 0.24 : 0.18);
  return Math.min(portrait ? 280 : 360, Math.max(shelfHotZoneWidth(), ratioWidth));
}
function isShelfClickZone(e) {
  var edge = shelfPinnedOpen ? Math.min(390, Math.max(210, innerWidth * 0.22)) : shelfHotZoneWidth();
  return e.clientX > innerWidth - edge && e.clientY > 130 && e.clientY < innerHeight - 150;
}
function isShelfPreviewUseZone(e) {
  var edge = shelfPreviewUseZoneWidth();
  return e.clientX > innerWidth - edge && e.clientY > 96 && e.clientY < innerHeight - 96;
}
function isShelfWheelZone(e) {
  var edge = shelfWheelZoneWidth();
  return e.clientX > innerWidth - edge && e.clientY > 116 && e.clientY < innerHeight - 116;
}
function canUseSideShelfWithoutPinnedOpen() {
  return !!shelfAlwaysVisible();
}
function shelfPreviewIsVisible() {
  if (shelfPlaybackSwitchGuardActive()) return false;
  return shelfHoverCue.guide || shelfHoverCue.zoneActive || shelfHoverCue.target > 0 || shelfHoverCue.value > 0.10 || shelfVisibility > 0.12;
}
function shelfAutoHiddenInputReady() {
  if (shelfPlaybackSwitchGuardActive()) return false;
  if (shelfPinnedOpen || shelfAlwaysVisible()) return true;
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return true;
  return !!(shelfHoverCue.guide || shelfHoverCue.zoneActive || shelfHoverCue.value > 0.18 || shelfVisibility > 0.16);
}
function canShowShelfHoverCueAt(e) {
  if (!e) return false;
  if (shelfPlaybackSwitchGuardActive()) return false;
  if (!shelfHoverCue.guide) return false;
  if (document.body.classList.contains('splash-active')) return false;
  if (visualGuideActive || emptyHomeActive || homeForcedOpen) return false;
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  if (shelfPinnedOpen) return false;
  if (shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return false;
  if (isPointerOverUi(e)) return false;
  if (isShelfClickZone(e)) return true;
  return shelfPreviewIsVisible() && isShelfPreviewUseZone(e);
}
function shelfCueRect() {
  var w = shelfHotZoneWidth();
  var top = Math.max(136, innerHeight * 0.22);
  var h = Math.min(390, innerHeight - top - 142);
  return { left: innerWidth - w, top: top, width: w, height: h, right: innerWidth, bottom: top + h };
}
function shelfCueCenter() {
  var r = shelfCueRect();
  return { x: r.left + r.width * 0.58, y: r.top + r.height * 0.50 };
}
function setShelfGuideCueActive(on) {
  shelfHoverCue.guide = !!on;
  if (on) {
    var c = shelfCueCenter();
    shelfHoverCue.target = 1;
    shelfHoverCue.value = Math.max(shelfHoverCue.value, 0.72);
    shelfHoverCue.x = c.x;
    shelfHoverCue.y = c.y;
    shelfHoverCue.lastAt = performance.now();
  } else {
    shelfHoverCue.target = 0;
  }
  if (typeof wakeIdleGuideLoop === 'function') wakeIdleGuideLoop();
}
function updateShelfHoverCueFromPointer(e) {
  if (shelfPlaybackSwitchGuardActive()) {
    shelfHoverCue.target = 0;
    shelfHoverCue.value = 0;
    shelfHoverCue.zoneActive = false;
    shelfHoverCue.enteredAt = 0;
    shelfHoverCue.guide = false;
    return;
  }
  if (!e) {
    if (!shelfHoverCue.guide) shelfHoverCue.target = 0;
    shelfHoverCue.zoneActive = false;
    shelfHoverCue.enteredAt = 0;
    return;
  }
  var active = false;
  var inZone = canShowShelfHoverCueAt(e);
  if (inZone && !shelfHoverCue.zoneActive) {
    shelfHoverCue.zoneActive = true;
    shelfHoverCue.enteredAt = performance.now();
  } else if (!inZone) {
    shelfHoverCue.zoneActive = false;
    shelfHoverCue.enteredAt = 0;
  }
  active = inZone;
  if (!shelfHoverCue.guide) shelfHoverCue.target = active ? 1 : 0;
  shelfHoverCue.x = e.clientX;
  shelfHoverCue.y = e.clientY;
  shelfHoverCue.lastAt = performance.now();
  if (typeof idleGuideLoopShouldRun === 'function'
      && idleGuideLoopShouldRun()
      && typeof wakeIdleGuideLoop === 'function') wakeIdleGuideLoop();
}
function tickShelfHoverCue(dt) {
  if (shelfPlaybackSwitchGuardActive()) {
    shelfHoverCue.target = 0;
    shelfHoverCue.value = 0;
    shelfHoverCue.zoneActive = false;
    shelfHoverCue.enteredAt = 0;
    shelfHoverCue.guide = false;
    return 0;
  }
  if (!shelfHoverCue.guide && shelfHoverCue.zoneActive) {
    var heldPointer = { clientX: shelfHoverCue.x, clientY: shelfHoverCue.y };
    if (canShowShelfHoverCueAt(heldPointer)) {
      if (performance.now() - shelfHoverCue.enteredAt > 400) shelfHoverCue.target = 1;   // 停留阈值 260→400ms, 别一靠近就弹出
    } else {
      shelfHoverCue.zoneActive = false;
      shelfHoverCue.enteredAt = 0;
      shelfHoverCue.target = 0;
    }
  }
  if (!shelfHoverCue.guide && !shelfHoverCue.zoneActive && performance.now() - shelfHoverCue.lastAt > 650) shelfHoverCue.target = 0;
  var target = shelfHoverCue.guide ? 1 : shelfHoverCue.target;
  // fork 灵敏度: 上行 0.08 / 下行 0.07 的柔和淡入淡出(用户觉得太快, 从 0.12/0.10 再调低), 不随 summon 时长变快。
  var rate = target > shelfHoverCue.value ? 0.08 : 0.07;
  shelfHoverCue.value += (target - shelfHoverCue.value) * Math.min(1, rate * Math.max(1, dt * 60));
  if (shelfHoverCue.value < 0.006 && !target) shelfHoverCue.value = 0;
  return shelfHoverCue.value;
}
function setShelfPinnedOpen(open, immediate, persist) {
  var nextOpen = !!open;
  if (nextOpen && typeof suppressBottomControlsForShelf === 'function') suppressBottomControlsForShelf(980);
  if (nextOpen && !shelfPinnedOpen) {
    var nowT = uniforms && uniforms.uTime ? uniforms.uTime.value : performance.now() / 1000;
    var previewVisible = shelfHoverCue.guide || shelfHoverCue.value > 0.28 || shelfVisibility > 0.20;
    var summon = shelfSummonSettings();
    shelfOpenAnimAt = previewVisible ? nowT - summon.openDuration : nowT;
    shelfHoverCue.target = 0;
    shelfHoverCue.zoneActive = false;
    shelfHoverCue.enteredAt = 0;
  }
  shelfPinnedOpen = nextOpen;
  if (fx) fx.shelfPinnedOpen = nextOpen;
  if (!nextOpen) {
    updateShelfHoverCueFromPointer(null);
    shelfHoverCue.target = 0;
    shelfHoverCue.value = 0;
    shelfHoverCue.zoneActive = false;
    shelfHoverCue.enteredAt = 0;
    shelfHoverCue.guide = false;
    shelfVisibility = 0;
    if (typeof setShelfHoverTabVisible === 'function') setShelfHoverTabVisible(false);
    if (shelfManager && shelfManager.clearSelected) shelfManager.clearSelected();
  }
  var hint = document.getElementById('hint');
  if (hint) hint.classList.toggle('shelf-hidden', shelfPinnedOpen || !!(shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()));
  if (nextOpen && typeof setPeek === 'function') setPeek(document.getElementById('search-area'), false, 'search');
  if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility({ forceLoad: false });
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return;
  if (typeof setFocusZone === 'function') setFocusZone(shelfPinnedOpen ? 'shelf-side' : null, immediate);
  if (!nextOpen && typeof restoreBottomControlsAfterShelfExit === 'function') {
    requestAnimationFrame(function () { restoreBottomControlsAfterShelfExit('shelf-pin-close'); });
  }
  if (persist !== false) {
    if (typeof scheduleLyricLayoutSave === 'function') scheduleLyricLayoutSave(220, { user: true, reason: 'shelfPinnedOpen' });
    else saveLyricLayout({ user: true, reason: 'shelfPinnedOpen' });
  }
}
function clearShelfPreviewOnPointerExit() {
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return;
  var hasContent = shelfManager.hasOpenContent && shelfManager.hasOpenContent();
  updateShelfHoverCueFromPointer(null);
  shelfHoverCue.target = 0;
  shelfHoverCue.value = 0;
  shelfHoverCue.zoneActive = false;
  shelfHoverCue.enteredAt = 0;
  if (typeof setShelfHoverTabVisible === 'function') setShelfHoverTabVisible(false);
  if (shelfManager && shelfManager.clearSelected) shelfManager.clearSelected();
  if (hasContent && shelfManager.closeContent) safeShelfCloseContent('shelf-mode-reset');
  if (shelfPinnedOpen) setShelfPinnedOpen(false, true);
  shelfVisibility = 0;
  if (typeof setFocusZone === 'function') setFocusZone(null, true);
}
function suppressShelfPreviewForPlaybackSwitch() {
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return;
  if (shelfPinnedOpen || (shelfManager.hasOpenContent && shelfManager.hasOpenContent())) return;
  markShelfPlaybackSwitchGuard(1120);
  updateShelfHoverCueFromPointer(null);
  shelfHoverCue.target = 0;
  shelfHoverCue.value = 0;
  shelfHoverCue.zoneActive = false;
  shelfHoverCue.enteredAt = 0;
  shelfHoverCue.guide = false;
  shelfVisibility = 0;
  if (typeof setShelfHoverTabVisible === 'function') setShelfHoverTabVisible(false);
  if (shelfManager && shelfManager.clearSelected) shelfManager.clearSelected();
  if (typeof setFocusZone === 'function') setFocusZone(null, true);
}
