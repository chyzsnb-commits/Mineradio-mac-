// ============================================================
//  手势控制 v9 — MediaPipe Tasks HandLandmarker(本地 vendor, GPU)
//  · 双手追踪(numHands=2)+ One Euro 滤波:静止无抖动、快挥低滞后
//  · requestVideoFrameCallback 帧泵:相机帧一到立即推理,不再经 rAF 转发
//  · 捏合/握拳按手掌跨度归一(远近尺度不变)+ 迟滞 + 连续帧去抖
//  · 单手:掌推 / 捏合拖动旋转 / 握拳收束
//  · 双手:双捏 = 拉伸缩放 + 连线角旋转(roll);双拳 = 强收束爆发
//  · 全预设:粒子系(掌推/旋转/缩放)· 安魂(旋转/变焦/闪光)· 音域回响(掌浪/转镜/推拉/压城)
// ============================================================
function startHeadTracking() { }     // stub: 兼容旧调用
function stopHeadTracking() { }      // stub

var GESTURE_MP_LOCAL = 'vendor/mediapipe-tasks';
var GESTURE_MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
var GESTURE_MP_CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

var gestureVideo = null, gestureStream = null, gestureLandmarker = null, gestureVisionNS = null;
var gestureActive = false;
var gestureStarting = false;
var gestureStartGen = 0;   // 启动代次: stop/重启会使进行中的启动失效(防「关-开」竞态留下死管线)
var gestureRvfcId = 0, gestureRafId = 0;
var gestureLastVideoTs = 0;
var gestureDetectAvgMs = 8, gestureFrameSkipFlip = false;   // 自适应降载:推理太慢时隔帧跑
var gestureInferWinStart = 0, gestureInferWinCount = 0, gestureInferRate = 0;   // 推理速率滑动窗
var gestureStats = { delegate: '', avgMs: 8, ratePerSec: 0, transport: '' };    // HUD 消费(下方导出到 window.__gestureStats)
if (typeof window !== 'undefined') window.__gestureStats = gestureStats;
var handLmLastSeen = 0;
var gestureHudIdleAt = 0;   // 无手超时后 HUD 已归位的时间戳(防止反复覆盖)

// 捏合拖动(单手旋转)状态; slot = 正在拖动的那只手(换手需重新捏合, 防瞬跳)
var pinchState = { active: false, slot: -1, lastX: 0, lastY: 0, lastT: 0 };
// 物理旋转: 给 particles 一个角速度, 每帧衰减
var particleSpin = { vx: 0, vy: 0, damping: 0.90 };
// 手势驱动的总旋转 (累计角度), 输出到 particles / 骷髅
var gestureRotation = { x: 0, y: 0, z: 0 };
var gestureGrip = { value: 0, target: 0, openness: 1, lastState: 'open', pulse: 0 };
// 双捏缩放(粒子系预设:作用到粒子组 scale)
var gestureZoom = { value: 1, target: 1 };
// 双手变换(双捏)状态
var gestureTwoHand = { active: false, d0: 1, lastAngle: 0, zoomBase: 1, voxOk: false, voxRadiusBase: 60, voxPolar: 0.5, skullZoomBase: 0 };
var gesturePrevFistCount = 0;   // 上一帧拳头数(入拳脉冲按增量触发)
// 安魂:握拳触发骷髅闪光(01-float-skull-backcover.js 的 flashTarget 会取用)
var skullGestureFlash = 0;
var PARTICLE_POINTER_SPIN_X = 0.0032;
var PARTICLE_POINTER_SPIN_Y = 0.0034;
var PARTICLE_HAND_SPIN_X = 4.15;
var PARTICLE_HAND_SPIN_Y = 4.30;
var PARTICLE_SPIN_MAX = 6.2;
var GESTURE_ZOOM_MIN = 0.55, GESTURE_ZOOM_MAX = 1.9;

function clampParticleSpinVelocity(v) {
  if (!isFinite(v)) return 0;
  return Math.max(-PARTICLE_SPIN_MAX, Math.min(PARTICLE_SPIN_MAX, v));
}

function applyParticleSpinDrag(dx, dy, dt) {
  var rx = dy * PARTICLE_POINTER_SPIN_X;
  var ry = dx * PARTICLE_POINTER_SPIN_Y;
  gestureRotation.x += rx;
  gestureRotation.y += ry;
  if (dt > 0) {
    particleSpin.vx = clampParticleSpinVelocity(rx / dt * 0.46);
    particleSpin.vy = clampParticleSpinVelocity(ry / dt * 0.46);
  }
}

function resetParticleRotationTarget(syncVisual) {
  gestureRotation.x = 0;
  gestureRotation.y = 0;
  gestureRotation.z = 0;
  particleSpin.vx = 0;
  particleSpin.vy = 0;
  gestureZoom.target = 1;
  gestureTwoHand.active = false;
  pinchState.active = false;
  if (syncVisual && particles) {
    gestureZoom.value = 1;
    particles.rotation.set(0, 0, 0);
    particles.scale.setScalar(1);
    if (bloomParticles) { bloomParticles.rotation.set(0, 0, 0); bloomParticles.scale.setScalar(1); }
    if (floatGroup) { floatGroup.rotation.set(0, 0, 0); floatGroup.scale.setScalar(1); }
    if (backCoverGroup) { backCoverGroup.rotation.set(0, 0, 0); backCoverGroup.scale.setScalar(1); }
  }
}

function rebaseParticleRotationAxis(axis) {
  var limit = Math.PI * 10;
  if (Math.abs(gestureRotation[axis]) < limit) return;
  var offset = Math.round(gestureRotation[axis] / (Math.PI * 2)) * Math.PI * 2;
  gestureRotation[axis] -= offset;
  if (particles) particles.rotation[axis] -= offset;
  if (bloomParticles) bloomParticles.rotation[axis] -= offset;
  if (floatGroup) floatGroup.rotation[axis] -= offset;
  if (backCoverGroup) backCoverGroup.rotation[axis] -= offset;
  if (skullParticleGroup) skullParticleGroup.rotation[axis] -= offset;
  if (stageLyrics.group) stageLyrics.group.rotation[axis] -= offset;
}

function rebaseParticleRotationIfNeeded() {
  rebaseParticleRotationAxis('x');
  rebaseParticleRotationAxis('y');
  rebaseParticleRotationAxis('z');
}
// 手骨架 canvas
var handCanvas = null, handCanvasCtx = null;

// ------------------------------------------------------------
//  One Euro 滤波 — 静止时强平滑消抖, 快速移动时降低平滑保跟手
// ------------------------------------------------------------
function GestureOneEuro(minCutoff, beta, dCutoff) {
  this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff || 1.0;
  this.xPrev = null; this.dxPrev = 0; this.tPrev = 0;
}
GestureOneEuro.prototype.alpha = function (cutoff, dt) {
  var tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};
GestureOneEuro.prototype.filter = function (x, tMs) {
  if (this.xPrev === null || tMs <= this.tPrev) {
    this.xPrev = x; this.dxPrev = 0; this.tPrev = tMs;
    return x;
  }
  var dt = Math.min(0.2, Math.max(1e-3, (tMs - this.tPrev) / 1000));
  this.tPrev = tMs;
  var dx = (x - this.xPrev) / dt;
  var aD = this.alpha(this.dCutoff, dt);
  this.dxPrev = this.dxPrev + aD * (dx - this.dxPrev);
  var cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
  var a = this.alpha(cutoff, dt);
  this.xPrev = this.xPrev + a * (x - this.xPrev);
  return this.xPrev;
};
var GESTURE_EURO_MINCUTOFF = 1.35, GESTURE_EURO_BETA = 0.45;

// ------------------------------------------------------------
//  双手槽位: 每只手 21 点滤波 + 手势派生量 + 去抖状态
// ------------------------------------------------------------
function makeGestureHandSlot() {
  var filters = [];
  for (var i = 0; i < 63; i++) filters.push(new GestureOneEuro(GESTURE_EURO_MINCUTOFF, GESTURE_EURO_BETA, 1.0));
  var lm = [];
  for (var j = 0; j < 21; j++) lm.push({ x: 0, y: 0, z: 0 });
  return {
    present: false, lastSeen: 0, filters: filters, lm: lm,
    palm: { x: 0.5, y: 0.5 }, openness: 1, openSm: 1, pinchRatio: 2,
    pinch: false, pinchPend: 0, fist: false, fistPend: 0, fistArmed: false,
    voxAmt: 0, voxX: 0, voxZ: 0, voxOk: false,
  };
}
var gestureHandSlots = [makeGestureHandSlot(), makeGestureHandSlot()];

function resetGestureSlot(slot) {
  slot.present = false;
  slot.pinch = false; slot.pinchPend = 0;
  slot.fist = false; slot.fistPend = 0; slot.fistArmed = false;
  slot.voxOk = false;
  for (var i = 0; i < 63; i++) { slot.filters[i].xPrev = null; }
}

// 手掌中心 ≈ wrist(0) 和 mcp 平均 (5,9,13,17 是各指根)
function palmCenter(lm) {
  var px = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
  var py = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;
  return { x: px, y: py };
}

function handOpenness(lm, palm) {
  var span = Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y);
  span = Math.max(0.055, span);
  var tips = [8, 12, 16, 20];
  var avg = 0;
  for (var i = 0; i < tips.length; i++) avg += Math.hypot(lm[tips[i]].x - palm.x, lm[tips[i]].y - palm.y);
  avg /= tips.length;
  return clampRange((avg / span - 0.62) / 0.78, 0, 1);
}

// ------------------------------------------------------------
//  模型加载: 本地 vendor 优先(离线/免翻墙/首启快), 失败回退 CDN
// ------------------------------------------------------------
async function ensureGestureLandmarker() {
  if (gestureLandmarker) return;
  var lastErr = null;
  var sources = [
    { base: GESTURE_MP_LOCAL, model: GESTURE_MP_LOCAL + '/hand_landmarker.task' },
    { base: GESTURE_MP_CDN, model: GESTURE_MP_CDN_MODEL },
  ];
  for (var s = 0; s < sources.length; s++) {
    try {
      gestureVisionNS = await import(sources[s].base + '/vision_bundle.mjs');
      var fileset = await gestureVisionNS.FilesetResolver.forVisionTasks(sources[s].base + '/wasm');
      var delegates = ['GPU', 'CPU'];
      for (var d = 0; d < delegates.length; d++) {
        try {
          gestureLandmarker = await gestureVisionNS.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: sources[s].model, delegate: delegates[d] },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          });
          return;
        } catch (e) { lastErr = e; }
      }
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('hand landmarker unavailable');
}

// 启动被中途取消(加载期间切关/再切开): 清掉半成品资源;若此刻仍想要手势, 重新走完整启动
function abortGestureStart() {
  try { if (gestureStream) gestureStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { }
  try { if (gestureVideo) gestureVideo.remove(); } catch (e) { }
  gestureVideo = null; gestureStream = null;
  gestureStarting = false;
  if (fx.cam === 'gesture' && !gestureActive) startGestureControl();
}

// ── 引擎模式:'native'=Vision/ANE 原生(mac 优先,不碰 GPU)| 'mediapipe'=WASM 兜底 ──
var gestureEngineMode = '';
var _hpCanvas = null, _hpCtx = null, _hpInFlight = false, _hpSentAt = 0, _hpW = 256, _hpH = 192;
var gestureLastInferAt = 0;
var _hpBridge = (typeof window !== 'undefined' && window.desktopWindow && typeof window.desktopWindow.handposeStart === 'function') ? window.desktopWindow : null;

// 原生结果回调:把助手回的 [[x,y,c]×21] 转成 {x,y,z} 喂现有 handleGestureResults(下游零改动)
function onNativeHandpose(hands) {
  _hpInFlight = false;
  if (!gestureActive || gestureEngineMode !== 'native') return;
  var tNow = performance.now();
  gestureDetectAvgMs += (Math.min(50, tNow - _hpSentAt) - gestureDetectAvgMs) * 0.08;   // 端到端往返耗时(HUD 显示)
  if (gestureInferWinStart === 0) gestureInferWinStart = tNow;
  gestureInferWinCount++;
  if (tNow - gestureInferWinStart >= 500) { gestureInferRate = gestureInferWinCount * 1000 / (tNow - gestureInferWinStart); gestureInferWinStart = tNow; gestureInferWinCount = 0; }
  gestureStats.avgMs = gestureDetectAvgMs; gestureStats.ratePerSec = gestureInferRate;
  var landmarks = [];
  for (var i = 0; i < hands.length && i < 2; i++) {
    var h = hands[i]; if (!h || h.length < 21) continue;
    var pts = [];
    for (var j = 0; j < 21; j++) pts.push({ x: h[j][0], y: h[j][1], z: 0 });
    landmarks.push(pts);
  }
  handleGestureResults({ landmarks: landmarks }, tNow);
}

// 引擎选择:mac(有原生桥接)优先 Vision/ANE;失败/非桌面回退 MediaPipe WASM
async function ensureGestureEngine() {
  if (_hpBridge) {
    try {
      var r = await _hpBridge.handposeStart();
      if (r && r.ok) {
        _hpBridge.onHandposeResult(onNativeHandpose);
        if (!_hpCanvas) { _hpCanvas = document.createElement('canvas'); _hpCanvas.width = _hpW; _hpCanvas.height = _hpH; _hpCtx = _hpCanvas.getContext('2d', { willReadFrequently: true }); }
        _hpInFlight = false; gestureEngineMode = 'native';
        gestureStats.delegate = 'ANE'; gestureStats.transport = 'native';
        return;
      }
      console.warn('[Handpose] 原生启动失败, 回退 MediaPipe:', r && r.error);
    } catch (e) { console.warn('[Handpose] 原生异常, 回退 MediaPipe:', e); }
  }
  await ensureGestureLandmarker();
  gestureEngineMode = 'mediapipe';
  gestureStats.delegate = (typeof gestureDelegate !== 'undefined' && gestureDelegate) || 'GPU'; gestureStats.transport = 'main';
}

async function startGestureControl() {
  if (gestureActive || gestureStarting) return;
  gestureStarting = true;
  var gen = ++gestureStartGen;
  showToast('正在加载手势识别…');
  try {
    await ensureGestureEngine();
    if (gen !== gestureStartGen || fx.cam !== 'gesture') { abortGestureStart(); return; }
    gestureStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60, max: 60 } },
      audio: false,
    });
    if (gen !== gestureStartGen || fx.cam !== 'gesture') { abortGestureStart(); return; }
    gestureVideo = document.createElement('video');
    gestureVideo.playsInline = true; gestureVideo.muted = true;
    // 不用 display:none — 避免部分内核暂停隐藏视频的帧回调;移出屏幕即可
    gestureVideo.style.cssText = 'position:fixed;left:-9999px;top:0;width:4px;height:3px;opacity:0;pointer-events:none';
    gestureVideo.srcObject = gestureStream;
    document.body.appendChild(gestureVideo);
    await gestureVideo.play();
    if (gen !== gestureStartGen || fx.cam !== 'gesture') { abortGestureStart(); return; }
    gestureActive = true;
    gestureLastVideoTs = 0;
    gesturePumpFrame();
    // 准备 hand canvas
    handCanvas = document.getElementById('hand-canvas');
    handCanvasCtx = handCanvas.getContext('2d');
    resizeHandCanvas();
    handCanvas.classList.add('show');
    showToast('手势已开启: 掌推 · 捏合旋转 · 握拳收束 · 双捏缩放');
    showGestureHUD('待命', 0, '把手放进视野(支持双手)');
  } catch (e) {
    console.warn('Gesture failed:', e);
    gestureActive = false;
    try { if (gestureStream) gestureStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) { }
    try { if (gestureVideo) gestureVideo.remove(); } catch (e2) { }
    gestureVideo = null; gestureStream = null;
    showToast('手势启动失败 (需要摄像头权限)');
    fx.cam = 'off';
    document.querySelectorAll('#cam-seg button').forEach(function (b) { b.classList.toggle('active', b.dataset.cam === 'off'); });
  }
  gestureStarting = false;
}

function stopGestureControl() {
  gestureStartGen++;   // 使进行中的启动失效(其代次检查点会走 abortGestureStart 清理)
  if (!gestureActive && !gestureStarting) return;
  gestureActive = false;
  if (_hpBridge) { try { _hpBridge.handposeStop(); } catch (e) { } }   // 停原生助手进程
  _hpInFlight = false; gestureEngineMode = '';
  try { if (gestureVideo && gestureRvfcId && gestureVideo.cancelVideoFrameCallback) gestureVideo.cancelVideoFrameCallback(gestureRvfcId); } catch (e) { }
  if (gestureRafId) { cancelAnimationFrame(gestureRafId); gestureRafId = 0; }
  gestureRvfcId = 0;
  try { if (gestureStream) gestureStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { }
  try { if (gestureVideo) gestureVideo.remove(); } catch (e) { }
  try { if (gestureLandmarker && gestureLandmarker.close) gestureLandmarker.close(); } catch (e) { }
  gestureVideo = null; gestureStream = null; gestureLandmarker = null;
  pinchState.active = false;
  gestureTwoHand.active = false;
  gestureZoom.target = 1;
  gesturePrevFistCount = 0;
  gestureHandSlots.forEach(resetGestureSlot);
  uniforms.uHandActive.value = 0;
  uniforms.uHandXY.value.set(-999, -999);
  if (uniforms.uHand2Active) { uniforms.uHand2Active.value = 0; uniforms.uHand2XY.value.set(-999, -999); }
  if (uniforms.uGestureGrip) uniforms.uGestureGrip.value = 0;
  gestureGrip.value = 0;
  gestureGrip.target = 0;
  gestureGrip.openness = 1;
  skullGestureFlash = 0;
  clearVoxelGestureUniforms();
  document.getElementById('gesture-hud').classList.remove('show');
  if (handCanvas) {
    handCanvas.classList.remove('show');
    if (handCanvasCtx) handCanvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  }
}

function resizeHandCanvas() {
  if (!handCanvas) return;
  var dpr = Math.min(devicePixelRatio || 1, 2);
  handCanvas.width = innerWidth * dpr;
  handCanvas.height = innerHeight * dpr;
  handCanvas.style.width = innerWidth + 'px';
  handCanvas.style.height = innerHeight + 'px';
  handCanvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeHandCanvas);

// ------------------------------------------------------------
//  帧泵: 相机新帧到达 → 立即推理(严格递增时间戳)
// ------------------------------------------------------------
function gesturePumpFrame() {
  if (!gestureActive || !gestureVideo) return;
  if (gestureVideo.requestVideoFrameCallback) {
    gestureRvfcId = gestureVideo.requestVideoFrameCallback(gesturePumpFrame);
  } else {
    gestureRafId = requestAnimationFrame(gesturePumpFrame);
  }
  if (gestureVideo.readyState < 2) return;
  // 原生 Vision/ANE 模式:抽 256×192 RGBA 帧送助手(in-flight 背压:上一帧结果回来前不发下一帧);推理在 ANE,不碰 GPU
  if (gestureEngineMode === 'native') {
    if (_hpInFlight || !_hpBridge) return;
    var nNow = performance.now();
    if (nNow - gestureLastInferAt < 28) return;   // ≤~33 帧/秒
    gestureLastInferAt = nNow;
    try {
      _hpCtx.drawImage(gestureVideo, 0, 0, _hpW, _hpH);
      var frame = _hpCtx.getImageData(0, 0, _hpW, _hpH);
      _hpInFlight = true; _hpSentAt = nNow;
      _hpBridge.handposeFrame(frame.data.buffer);
    } catch (e) { _hpInFlight = false; }
    return;
  }
  // MediaPipe WASM 兜底路径(非 mac / 原生启动失败)
  if (!gestureLandmarker) return;
  if (gestureDetectAvgMs > 14) {   // 自适应降载: 推理均值过半帧预算时隔帧推理
    gestureFrameSkipFlip = !gestureFrameSkipFlip;
    if (gestureFrameSkipFlip) return;
  }
  var t0 = performance.now();
  var ts = Math.max(t0, gestureLastVideoTs + 0.01);
  gestureLastVideoTs = ts;
  var res;
  try { res = gestureLandmarker.detectForVideo(gestureVideo, ts); }
  catch (e) { return; }
  gestureDetectAvgMs += (Math.min(50, performance.now() - t0) - gestureDetectAvgMs) * 0.08;
  handleGestureResults(res, t0);
}

// ------------------------------------------------------------
//  结果分发: 槽位匹配(按掌心距离, 保持滤波连续性)
// ------------------------------------------------------------
function handleGestureResults(res, tNow) {
  if (!gestureActive) return;
  var lms = (res && res.landmarks) || [];
  if (lms.length > 2) lms = lms.slice(0, 2);
  // 候选掌心(镜像后)
  var cands = [];
  for (var i = 0; i < lms.length; i++) {
    var raw = lms[i];
    var cx = 0, cy = 0, idxs = [0, 5, 9, 13, 17];
    for (var k = 0; k < idxs.length; k++) { cx += 1 - raw[idxs[k]].x; cy += raw[idxs[k]].y; }
    cands.push({ lm: raw, x: cx / 5, y: cy / 5, slot: -1 });
  }
  // 贪心: 已在场的槽位优先匹配最近候选
  var taken = [false, false];
  var order = gestureHandSlots.map(function (s, si) { return si; }).sort(function (a, b) {
    return (gestureHandSlots[b].present ? 1 : 0) - (gestureHandSlots[a].present ? 1 : 0);
  });
  order.forEach(function (si) {
    var slot = gestureHandSlots[si];
    if (!slot.present) return;
    var best = -1, bestD = 1e9;
    for (var c = 0; c < cands.length; c++) {
      if (cands[c].slot >= 0) continue;
      var d = Math.hypot(cands[c].x - slot.palm.x, cands[c].y - slot.palm.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best >= 0 && bestD < 0.42) { cands[best].slot = si; taken[si] = true; }
  });
  // 剩余候选进空槽
  for (var c2 = 0; c2 < cands.length; c2++) {
    if (cands[c2].slot >= 0) continue;
    for (var si2 = 0; si2 < 2; si2++) {
      if (!taken[si2]) { cands[c2].slot = si2; taken[si2] = true; resetGestureSlot(gestureHandSlots[si2]); break; }
    }
  }
  // 滤波 + 派生量
  for (var si3 = 0; si3 < 2; si3++) {
    var slot3 = gestureHandSlots[si3];
    var cand = null;
    for (var c3 = 0; c3 < cands.length; c3++) if (cands[c3].slot === si3) { cand = cands[c3]; break; }
    if (!cand) { slot3.present = false; slot3.fistArmed = false; continue; }
    filterSlotLandmarks(slot3, cand.lm, tNow);
    slot3.present = true;
    slot3.lastSeen = tNow;
    handLmLastSeen = tNow;
  }
  processGestureState(tNow);
  drawHandsOverlay();
}

function filterSlotLandmarks(slot, rawLm, tNow) {
  for (var i = 0; i < 21; i++) {
    var f = slot.filters;
    slot.lm[i].x = f[i * 3].filter(1 - rawLm[i].x, tNow);       // 镜像 X(摄像头是反的)
    slot.lm[i].y = f[i * 3 + 1].filter(rawLm[i].y, tNow);
    slot.lm[i].z = f[i * 3 + 2].filter(rawLm[i].z || 0, tNow);
  }
  var palm = palmCenter(slot.lm);
  slot.palm.x = palm.x; slot.palm.y = palm.y;
  slot.openness = handOpenness(slot.lm, palm);
  slot.openSm += (slot.openness - slot.openSm) * 0.34;
  var span = Math.max(0.05, Math.hypot(slot.lm[5].x - slot.lm[17].x, slot.lm[5].y - slot.lm[17].y));
  slot.pinchRatio = Math.hypot(slot.lm[8].x - slot.lm[4].x, slot.lm[8].y - slot.lm[4].y) / span;
  // 捏合: 尺度不变 + 迟滞 + 2 帧去抖
  var pinchWant = slot.pinch ? (slot.pinchRatio < 0.68) : (slot.pinchRatio < 0.46 && slot.openness > 0.16);
  slot.pinchPend = (pinchWant !== slot.pinch) ? slot.pinchPend + 1 : 0;
  if (slot.pinchPend >= 2 || (pinchWant !== slot.pinch && slot.pinch)) { slot.pinch = pinchWant; slot.pinchPend = 0; }
  // 握拳: 迟滞 + 2 帧去抖(捏合优先)
  var fistWant = !slot.pinch && (slot.fist ? (slot.openSm < 0.40) : (slot.openSm < 0.26));
  slot.fistPend = (fistWant !== slot.fist) ? slot.fistPend + 1 : 0;
  if (slot.fistPend >= 2) { slot.fist = fistWant; slot.fistPend = 0; }
}

// ------------------------------------------------------------
//  手势状态机(推理帧率): 双捏变换 / 单捏旋转 / 握拳收束
// ------------------------------------------------------------
function gesturePresetKind() {
  if (typeof voxelCityActive === 'function' && voxelCityActive()) return 'voxel';
  if (typeof SKULL_PRESET_INDEX !== 'undefined' && fx && fx.preset === SKULL_PRESET_INDEX) return 'skull';
  return 'particles';
}

function gestureHandsAspect() {
  return (gestureVideo && gestureVideo.videoHeight > 0) ? (gestureVideo.videoWidth / gestureVideo.videoHeight) : (4 / 3);
}

function voxGestureCamReady() {
  if (typeof _voxCam === 'undefined') return false;
  if (typeof freeCamera !== 'undefined' && freeCamera) {
    if (freeCamera.active) return false;   // 飞行中不抢相机
    if (freeCamera.locked) {
      if (typeof voxSyncCamFromCurrentCamera === 'function' && voxSyncCamFromCurrentCamera()) {
        freeCamera.locked = false;
        if (typeof saveFreeCameraState === 'function') saveFreeCameraState();
        if (typeof updateFreeCameraHint === 'function') updateFreeCameraHint();
      } else return false;
    }
  }
  return true;
}

function processGestureState(tNow) {
  var kind = gesturePresetKind();
  var a = gestureHandSlots[0], b = gestureHandSlots[1];
  var present = [];
  if (a.present) present.push(a);
  if (b.present) present.push(b);

  if (!present.length) {
    if (pinchState.active) pinchState.active = false;
    gestureTwoHand.active = false;
    gestureGrip.target = 0;
    gesturePrevFistCount = 0;
    return;
  }

  var aspect = gestureHandsAspect();
  var twoPinch = present.length === 2 && present[0].pinch && present[1].pinch;

  // ---- 双捏 = 拉伸缩放 + 连线角旋转 ----
  if (twoPinch) {
    var dxh = (present[1].palm.x - present[0].palm.x) * aspect;
    var dyh = present[1].palm.y - present[0].palm.y;
    var dist = Math.max(0.04, Math.hypot(dxh, dyh));
    var ang = Math.atan2(dyh, dxh);
    if (!gestureTwoHand.active) {
      gestureTwoHand.active = true;
      gestureTwoHand.d0 = dist;
      gestureTwoHand.lastAngle = ang;
      gestureTwoHand.zoomBase = gestureZoom.target;
      if (kind === 'voxel' && typeof _voxCam !== 'undefined') {
        gestureTwoHand.voxOk = voxGestureCamReady();   // 先把锁定机位折算回轨道参数再取基准, 否则基准是过期值、相机会跳
        gestureTwoHand.voxRadiusBase = _voxCam.radius;
        gestureTwoHand.voxPolar = _voxCam.height / Math.max(1e-6, _voxCam.radius);
      }
      if (kind === 'skull' && typeof skullWheelZoomTarget !== 'undefined') gestureTwoHand.skullZoomBase = skullWheelZoomTarget;
      particleSpin.vx = particleSpin.vy = 0;
      pinchState.active = false;
    }
    var ratio = clampRange(dist / gestureTwoHand.d0, 0.34, 3.0);
    // 连线角增量(最短角差, 防 ±π 跳变); 体素/安魂视角语义下不施加 roll
    var da = ang - gestureTwoHand.lastAngle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    gestureTwoHand.lastAngle = ang;
    if (kind === 'voxel') {
      if (gestureTwoHand.voxOk && voxGestureCamReady()) {
        _voxCam.radius = clampRange(gestureTwoHand.voxRadiusBase / ratio, 12, 140);
        _voxCam.height = _voxCam.radius * clampRange(gestureTwoHand.voxPolar, 0.10, 0.995);
        if (typeof requestStageLyricCameraSnap === 'function') requestStageLyricCameraSnap(4);
      }
      showGestureHUD('双手推拉', clampRange(ratio / 2, 0.05, 1), '拉开=拉近 · 收拢=推远');
    } else if (kind === 'skull') {
      if (typeof skullWheelZoomTarget !== 'undefined') {
        skullWheelZoomTarget = clampRange(gestureTwoHand.skullZoomBase - (ratio - 1) * 1.6, -0.95, 1.28);
      }
      showGestureHUD('双手变焦', clampRange(ratio / 2, 0.05, 1), '拉开=拉近 · 收拢=推远');
    } else {
      unlockCenteredView();
      gestureZoom.target = clampRange(gestureTwoHand.zoomBase * ratio, GESTURE_ZOOM_MIN, GESTURE_ZOOM_MAX);
      gestureRotation.z += da * 0.9;
      rebaseParticleRotationIfNeeded();
      showGestureHUD('双手缩放 ' + Math.round(gestureZoom.target * 100) + '%', clampRange((gestureZoom.target - GESTURE_ZOOM_MIN) / (GESTURE_ZOOM_MAX - GESTURE_ZOOM_MIN), 0, 1), '拉伸=缩放 · 转动双手=旋转');
    }
    gestureGrip.target = Math.min(0.2, gestureGrip.target);
    updateGesturePushTargets(present, kind);
    return;
  }
  gestureTwoHand.active = false;

  // ---- 单捏 = 拖动旋转 / 体素转镜头(拖动绑定发起的那只手, 换手需重新捏合, 防瞬跳甩飞) ----
  var hudDone = false;
  if (pinchState.active) {
    var dragOwner = pinchState.slot >= 0 ? gestureHandSlots[pinchState.slot] : null;
    if (!(dragOwner && dragOwner.present && dragOwner.pinch)) {
      pinchState.active = false;
      showGestureHUD('松开', 0.4, '可继续触碰或捏合');
      hudDone = true;
    }
  }
  var pincher = pinchState.active
    ? gestureHandSlots[pinchState.slot]
    : (present[0].pinch ? present[0] : (present[1] && present[1].pinch ? present[1] : null));
  if (pincher && !pinchState.active) {
    if (kind !== 'voxel') unlockCenteredView();
    pinchState.active = true;
    pinchState.slot = gestureHandSlots.indexOf(pincher);
    pinchState.lastX = pincher.palm.x;
    pinchState.lastY = pincher.palm.y;
    pinchState.lastT = tNow;
    particleSpin.vx = particleSpin.vy = 0;
    gestureGrip.target = Math.min(0.34, gestureGrip.target);
    showGestureHUD(kind === 'voxel' ? '捏合转镜' : '捏合拖动', 1, kind === 'voxel' ? '移动手掌 -> 环绕城市' : '移动手掌 -> 旋转封面');
    hudDone = true;
  } else if (pincher && pinchState.active) {
    var dx = pincher.palm.x - pinchState.lastX;
    var dy = pincher.palm.y - pinchState.lastY;
    var pinchDt = Math.max(1 / 120, Math.min(0.08, (tNow - pinchState.lastT) / 1000 || 1 / 60));
    if (kind === 'voxel') {
      if (voxGestureCamReady()) {
        _voxCam.azimuth -= dx * 3.0;                              // 横移: 绕原点旋转
        _voxCam.height = clampRange(_voxCam.height + dy * 110, 0.10 * _voxCam.radius, 0.995 * _voxCam.radius);   // 纵移: 俯仰(与鼠标拖拽同范围, 不设额外限制)
        if (typeof markRenderInteraction === 'function') markRenderInteraction('vox-gesture', 900);
      }
      showGestureHUD('环绕城市', 1, '横移旋转 · 纵移俯仰');
    } else {
      unlockCenteredView();
      var spinY = dx * PARTICLE_HAND_SPIN_Y;
      var spinX = dy * PARTICLE_HAND_SPIN_X;
      gestureRotation.y += spinY;
      gestureRotation.x += spinX;
      particleSpin.vy = clampParticleSpinVelocity(spinY / pinchDt * 0.48);
      particleSpin.vx = clampParticleSpinVelocity(spinX / pinchDt * 0.48);
      showGestureHUD('拖动中', 1, '松手后保留惯性');
    }
    pinchState.lastX = pincher.palm.x;
    pinchState.lastY = pincher.palm.y;
    pinchState.lastT = tNow;
    gestureGrip.target = Math.min(0.34, gestureGrip.target);
    hudDone = true;
  }

  // ---- 握拳收束(单拳/双拳) ----
  var fists = present.filter(function (h) { return h.fist; });
  var doubleFist = fists.length === 2;
  if (fists.length) {
    var maxGrip = 0;
    fists.forEach(function (h) { maxGrip = Math.max(maxGrip, clampRange(1 - h.openSm, 0, 1)); });
    var gripTarget = doubleFist ? 1 : (maxGrip > 0.55 ? maxGrip : 0.62);
    if (fists.length > gesturePrevFistCount) {   // 新增一只拳: 入拳脉冲
      gestureGrip.pulse = Math.max(gestureGrip.pulse, doubleFist ? 1.35 : 1);
      uniforms.uBurstAmt.value = Math.max(uniforms.uBurstAmt.value, doubleFist ? 0.42 : 0.26);
      if (kind === 'skull') skullGestureFlash = Math.max(skullGestureFlash, doubleFist ? 1 : 0.8);
    }
    if (!pinchState.active) gestureGrip.target = gripTarget;
    gestureGrip.lastState = 'fist';
    if (!pincher && !hudDone) showGestureHUD(doubleFist ? '双拳收束' : '握拳收束', Math.max(0.55, gripTarget), kind === 'voxel' ? '城市塌缩 · 张开释放冲击波' : '粒子向中心收缩');
  } else {
    var openest = 0;
    present.forEach(function (h) { openest = Math.max(openest, h.openSm); });
    if (!pinchState.active) gestureGrip.target = 0;
    gestureGrip.lastState = openest > 0.62 ? 'open' : 'hover';
    if (!pincher && !hudDone) {
      var legend = kind === 'voxel' ? '掌浪 / 捏合转镜 / 双捏推拉 / 握拳压城'
        : (kind === 'skull' ? '捏合旋转 / 双捏变焦 / 握拳闪光'
          : '掌推 / 捏合旋转 / 握拳收束 / 双捏缩放');
      showGestureHUD(present.length === 2 ? '双手悬停' : (openest > 0.62 ? '张开恢复' : '悬停'), 0.30 + openest * 0.34, legend);
    }
  }
  gesturePrevFistCount = fists.length;
  // 逐手释放: 握过拳的那只手完全张开 -> 在它自己的位置爆发(不受另一只手状态影响)
  present.forEach(function (h) {
    if (h.fist) { h.fistArmed = true; }
    else if (h.fistArmed && h.openSm > 0.58) {
      h.fistArmed = false;
      uniforms.uBurstAmt.value = Math.max(uniforms.uBurstAmt.value, 0.18);
      if (kind === 'voxel') spawnVoxelGestureRipple(h);
      if (kind === 'skull') skullGestureFlash = Math.max(skullGestureFlash, 0.9);
    }
  });

  updateGesturePushTargets(present, kind);
}

// 掌推目标: 槽位 0 -> uHandXY, 槽位 1 -> uHand2XY(实际写入在 tick 里按渲染帧率平滑)
function updateGesturePushTargets(present, kind) {
  if (kind !== 'voxel') return;
  // 体素: 每只手投影到城市地面(平截 y=0), 存到槽位, tick 里写 uniform
  for (var i = 0; i < 2; i++) {
    var slot = gestureHandSlots[i];
    if (!slot.present) { slot.voxOk = false; continue; }
    slot.voxOk = projectGestureHandToVoxel(slot.palm, slot);
  }
}

// ------------------------------------------------------------
//  体素城市(音域回响)接线
// ------------------------------------------------------------
var _gestureNdc = null, _gestureVoxRay = null, _gestureVoxPlane = null, _gestureVoxHit = null;
function projectGestureHandToVoxel(palm, out) {
  if (typeof voxelCity === 'undefined' || !voxelCity || !voxelCity.mesh || !camera) return false;
  if (!_gestureVoxRay) {
    _gestureNdc = new THREE.Vector2();
    _gestureVoxRay = new THREE.Raycaster();
    _gestureVoxPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    _gestureVoxHit = new THREE.Vector3();
  }
  _gestureNdc.set(palm.x * 2 - 1, -(palm.y * 2 - 1));
  _gestureVoxRay.setFromCamera(_gestureNdc, camera);
  if (!_gestureVoxRay.ray.intersectPlane(_gestureVoxPlane, _gestureVoxHit)) return false;
  voxelCity.mesh.worldToLocal(_gestureVoxHit);   // 转到柱体实例局部坐标(含转盘旋转/缩放)
  if (!isFinite(_gestureVoxHit.x) || !isFinite(_gestureVoxHit.z)) return false;
  out.voxX = _gestureVoxHit.x;
  out.voxZ = _gestureVoxHit.z;
  return true;
}

function voxelGestureUniforms() {
  if (typeof voxelCity === 'undefined' || !voxelCity || !voxelCity.uniforms || !voxelCity.uniforms.uHandAAmt) return null;
  return voxelCity.uniforms;
}

function clearVoxelGestureUniforms() {
  var u = voxelGestureUniforms();
  if (!u) return;
  u.uHandAAmt.value = 0;
  u.uHandBAmt.value = 0;
  u.uVoxGrip.value = 0;
  gestureHandSlots[0].voxAmt = 0;
  gestureHandSlots[1].voxAmt = 0;
}

function spawnVoxelGestureRipple(hand) {
  if (typeof _voxAddRipple !== 'function') return;
  var hx = 0, hz = 0;
  if (hand && projectGestureHandToVoxel(hand.palm, hand)) { hx = hand.voxX; hz = hand.voxZ; }
  _voxAddRipple(hx, hz, 2.6, true);   // 张拳释放: 手掌位置起一圈白色冲击波
}

// ------------------------------------------------------------
//  每帧调用(渲染帧率) — 惯性旋转 + 缩放 + uniform 平滑写入/衰减
// ------------------------------------------------------------
function tickGestureRotation(dt) {
  if (Math.abs(particleSpin.vx) > 0.0001 || Math.abs(particleSpin.vy) > 0.0001) {
    var rx = particleSpin.vx * dt;
    var ry = particleSpin.vy * dt;
    gestureRotation.x += rx;
    gestureRotation.y += ry;
    rebaseParticleRotationIfNeeded();
  }
  particleSpin.vx *= Math.pow(particleSpin.damping, dt * 60);
  particleSpin.vy *= Math.pow(particleSpin.damping, dt * 60);
  if (Math.abs(particleSpin.vx) < 0.01) particleSpin.vx = 0;
  if (Math.abs(particleSpin.vy) < 0.01) particleSpin.vy = 0;
  gestureGrip.value += (gestureGrip.target - gestureGrip.value) * (gestureGrip.target > gestureGrip.value ? 0.18 : 0.10);
  gestureGrip.pulse *= Math.pow(0.84, dt * 60);
  if (uniforms.uGestureGrip) uniforms.uGestureGrip.value = clampRange(gestureGrip.value + gestureGrip.pulse * 0.16, 0, 1);

  // 双捏缩放: 粒子组整体 scale(骷髅/体素走各自的相机变焦, 不缩放粒子组)
  gestureZoom.value += (gestureZoom.target - gestureZoom.value) * Math.min(1, dt * 7);
  if (particles && Math.abs(particles.scale.x - gestureZoom.value) > 0.0004) {
    particles.scale.setScalar(gestureZoom.value);
    if (bloomParticles) bloomParticles.scale.setScalar(gestureZoom.value);
    if (floatGroup) floatGroup.scale.setScalar(gestureZoom.value);
    if (backCoverGroup) backCoverGroup.scale.setScalar(gestureZoom.value);
  }

  // 骷髅手势闪光衰减
  if (skullGestureFlash > 0.003) skullGestureFlash *= Math.pow(0.20, dt);
  else skullGestureFlash = 0;

  if (!gestureActive) return;
  var now = performance.now();
  var stale = now - handLmLastSeen > 200;
  var kind = gesturePresetKind();

  // 掌推 uniform(渲染帧率写入: 相机动了推点也跟着走)
  for (var i = 0; i < 2; i++) {
    var slot = gestureHandSlots[i];
    var xyU = i === 0 ? uniforms.uHandXY : uniforms.uHand2XY;
    var actU = i === 0 ? uniforms.uHandActive : uniforms.uHand2Active;
    if (!xyU || !actU) continue;
    var fresh = slot.present && (now - slot.lastSeen < 260);
    if (fresh && kind !== 'voxel') {
      var ndcX = slot.palm.x * 2 - 1;
      var ndcY = -(slot.palm.y * 2 - 1);
      var hx = ndcX * PLANE_SIZE * 0.62;
      var hy = ndcY * PLANE_SIZE * 0.62;
      if (particleLocalPointFromNdc(ndcX, ndcY, particlePointerLocalHit)) {
        hx = particlePointerLocalHit.x;
        hy = particlePointerLocalHit.y;
      }
      var cur = xyU.value;
      cur.x += (hx - cur.x) * 0.55;
      cur.y += (hy - cur.y) * 0.55;
      var tgtActive = 0.44 + slot.openSm * 0.56;
      actU.value += (tgtActive - actU.value) * 0.30;
    } else {
      actU.value *= Math.pow(0.02, dt);      // 快速淡出
      if (actU.value < 0.02) actU.value = 0;
    }
  }
  if (stale) gestureGrip.target *= 0.92;

  // 体素手浪 uniform
  var vu = voxelGestureUniforms();
  if (vu) {
    for (var j = 0; j < 2; j++) {
      var s = gestureHandSlots[j];
      var posU = j === 0 ? vu.uHandA : vu.uHandB;
      var amtU = j === 0 ? vu.uHandAAmt : vu.uHandBAmt;
      var wantAmt = 0;
      if (kind === 'voxel' && s.present && s.voxOk && !s.pinch && (now - s.lastSeen < 260)) {
        wantAmt = 0.5 + s.openSm * 0.85;
        posU.value.x += (s.voxX - posU.value.x) * 0.4;
        posU.value.y += (s.voxZ - posU.value.y) * 0.4;
      }
      amtU.value += (wantAmt - amtU.value) * Math.min(1, dt * (wantAmt > amtU.value ? 9 : 5));
      if (amtU.value < 0.004) amtU.value = 0;
    }
    vu.uVoxGrip.value = kind === 'voxel' ? clampRange(gestureGrip.value + gestureGrip.pulse * 0.16, 0, 1) : 0;
  }

  // 无手超时: HUD 归位(每次失手只归位一次)
  if (handLmLastSeen > 0 && now - handLmLastSeen > 600 && gestureHudIdleAt !== handLmLastSeen) {
    gestureHudIdleAt = handLmLastSeen;
    gestureHandSlots.forEach(function (sl) { sl.present = false; sl.fistArmed = false; });
    if (handCanvasCtx) handCanvasCtx.clearRect(0, 0, innerWidth, innerHeight);
    showGestureHUD('待命', 0, '把手放进视野(支持双手)');
  }
}

// ------------------------------------------------------------
//  骨架/光效绘制(两只手 + 双捏连线)
// ------------------------------------------------------------
var HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // 拇指
  [0, 5], [5, 6], [6, 7], [7, 8],        // 食指
  [0, 9], [9, 10], [10, 11], [11, 12],   // 中指
  [0, 13], [13, 14], [14, 15], [15, 16], // 无名指
  [0, 17], [17, 18], [18, 19], [19, 20], // 小指
  [5, 9], [9, 13], [13, 17],           // 掌横连
];
function drawHandsOverlay() {
  if (!handCanvasCtx) return;
  var ctx = handCanvasCtx;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  var drawn = [];
  for (var i = 0; i < 2; i++) {
    var slot = gestureHandSlots[i];
    if (!slot.present) continue;
    drawOneHand(ctx, slot, i);
    drawn.push(slot);
  }
  // 双捏: 两掌间连线 + 中点光斑
  if (gestureTwoHand.active && drawn.length === 2) {
    var W = innerWidth, H = innerHeight;
    var x1 = drawn[0].palm.x * W, y1 = drawn[0].palm.y * H;
    var x2 = drawn[1].palm.x * W, y2 = drawn[1].palm.y * H;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, 'rgba(156,255,223,0.55)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(244,210,138,0.55)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    var dot = ctx.createRadialGradient(mx, my, 0, mx, my, 26);
    dot.addColorStop(0, 'rgba(255,255,255,0.85)');
    dot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(mx, my, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
function drawOneHand(ctx, slot, slotIndex) {
  var lm = slot.lm;
  var isPinch = slot.pinch, isFist = slot.fist;
  var openness = clampRange(slot.openSm, 0, 1);
  var W = innerWidth, H = innerHeight;
  var px = slot.palm.x * W, py = slot.palm.y * H;
  var warm = slotIndex === 1;   // 第二只手用暖金色区分
  var primary = isFist ? 'rgba(244,210,138,0.92)' : (isPinch ? 'rgba(156,255,223,0.95)' : (warm ? 'rgba(255,232,190,0.92)' : 'rgba(226,247,255,0.92)'));
  var soft = isFist ? 'rgba(244,210,138,0.18)' : (isPinch ? 'rgba(156,255,223,0.20)' : (warm ? 'rgba(244,210,138,0.16)' : 'rgba(143,233,255,0.18)'));
  var coreR = 26 + openness * 34;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var aura = ctx.createRadialGradient(px, py, 0, px, py, coreR * 2.15);
  aura.addColorStop(0, isFist ? 'rgba(244,210,138,0.26)' : 'rgba(255,255,255,0.22)');
  aura.addColorStop(0.28, soft);
  aura.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(px, py, coreR * 2.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var ringR = 34 + openness * 48;
  for (var r = 0; r < 3; r++) {
    var alpha = (0.18 - r * 0.045) + (isFist ? 0.08 : 0);
    ctx.strokeStyle = primary.replace(/0\.\d+\)/, alpha.toFixed(3) + ')');
    ctx.lineWidth = 1.2 + r * 0.55;
    ctx.beginPath();
    ctx.arc(px, py, ringR + r * 13 + Math.sin(uniforms.uTime.value * 1.5 + r) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  var tips = [4, 8, 12, 16, 20];
  for (var i = 0; i < tips.length; i++) {
    var p = lm[tips[i]];
    var tx = p.x * W, ty = p.y * H;
    var dx = tx - px, dy = ty - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var beamAlpha = clampRange(0.26 - dist / 720, 0.045, 0.18) * (0.55 + openness * 0.45);
    var grad = ctx.createLinearGradient(px, py, tx, ty);
    grad.addColorStop(0, 'rgba(255,255,255,' + (beamAlpha * 0.20).toFixed(3) + ')');
    grad.addColorStop(0.65, 'rgba(255,255,255,' + (beamAlpha * 0.42).toFixed(3) + ')');
    grad.addColorStop(1, primary.replace(/0\.\d+\)/, Math.min(0.72, beamAlpha + 0.14).toFixed(3) + ')'));
    ctx.strokeStyle = grad;
    ctx.lineWidth = tips[i] === 8 || tips[i] === 4 ? 1.7 : 1.05;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + dx * 0.42 - dy * 0.05, py + dy * 0.42 + dx * 0.05, tx, ty);
    ctx.stroke();
    var dotR = (tips[i] === 8 || tips[i] === 4 ? 4.2 : 3.0) + (isFist ? 0.8 : 0);
    var dot = ctx.createRadialGradient(tx, ty, 0, tx, ty, dotR * 4.2);
    dot.addColorStop(0, 'rgba(255,255,255,0.92)');
    dot.addColorStop(0.32, primary);
    dot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(tx, ty, dotR * 4.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(px, py, isFist ? 7.2 : 5.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,' + (isFist ? 0.82 : 0.62).toFixed(3) + ')';
  ctx.fill();

  if (isPinch) {
    var t1 = lm[4], t2 = lm[8];
    ctx.strokeStyle = 'rgba(220,255,241,0.88)';
    ctx.lineWidth = 2.0;
    ctx.shadowColor = 'rgba(126,226,168,0.82)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(t1.x * W, t1.y * H);
    ctx.lineTo(t2.x * W, t2.y * H);
    ctx.stroke();
  }
  ctx.restore();
}

function showGestureHUD(label, progress, detail) {
  var hud = document.getElementById('gesture-hud');
  if (!hud) return;
  document.getElementById('gesture-label').textContent = label || '待命';
  document.getElementById('gesture-confirm').textContent = detail || '将手放进摄像头视野';
  var fill = document.getElementById('gesture-fill');
  if (fill) fill.style.width = Math.max(0, Math.min(100, (progress || 0) * 100)) + '%';
  hud.classList.add('show');
}
function showGestureCursor() { }  // stub: 兼容旧调用
function hideGestureCursor() { }  // stub: 兼容旧调用


// ============================================================
//  Resize / 快捷键
