const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/modules/10-shell/00-gesture-control.js'), 'utf8');
const cameraManager = fs.readFileSync(path.join(root, 'public/js/modules/10-shell/00-camera-stream-manager.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'public/js/gesture-worker.js'), 'utf8');
const mediaPipeVersion = fs.readFileSync(path.join(root, 'public/vendor/mediapipe-tasks/VERSION'), 'utf8');
const mediaPipeBundle = fs.readFileSync(path.join(root, 'public/vendor/mediapipe-tasks/vision_bundle.mjs'), 'utf8');

function readFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

test('保留 PR 53 的 GPU Worker 手势引擎和低负载相机参数', () => {
  assert.match(source, /await ensureGestureWorker\(\)[\s\S]*gestureEngineMode = 'worker'/);
  assert.match(cameraManager, /width:\s*\{ ideal:\s*320 \}[\s\S]*height:\s*\{ ideal:\s*240 \}[\s\S]*frameRate:\s*\{ ideal:\s*30, max:\s*30 \}/);
  assert.match(source, /acquireSharedCameraStream\(['"]gesture['"]\)/);
  assert.doesNotMatch(source, /GESTURE_HANDS_LOCAL|ensureGestureHandsSolution/);
});

test('MediaPipe 升级到无新增云端统计的 0.10 稳定线，Worker 回传左右手身份', () => {
  assert.match(mediaPipeVersion, /@mediapipe\/tasks-vision 0\.10\.35/);
  assert.match(source, /@mediapipe\/tasks-vision@0\.10\.35/);
  assert.match(workerSource, /function compactHandedness\(result\)/);
  assert.match(workerSource, /handedness:\s*compactHandedness\(res\)/);
  assert.doesNotMatch(mediaPipeBundle, /odml\.pa\.googleapis|\/v1\/log|sendBeacon/);
});

test('双手推拉保留宽高比、使用 handedness 且允许短暂丢手', () => {
  assert.match(source, /GESTURE_TWO_HAND_GRACE_MS\s*=\s*180/);
  assert.match(source, /GESTURE_SLOT_REACQUIRE_MS\s*=\s*240/);
  assert.match(source, /function gestureWorkerFrameSize\(video\)/);
  assert.match(source, /resizeWidth:\s*workerSize\.width[\s\S]*resizeHeight:\s*workerSize\.height/);
  assert.doesNotMatch(source, /GESTURE_WORKER_W\s*=\s*256[\s\S]*GESTURE_WORKER_H\s*=\s*192/);
  assert.match(source, /res\.handedness \|\| res\.handednesses/);
  assert.match(source, /slot\.handedness === cands\[ci\]\.handedness/);
  assert.match(source, /tNow - slot\.lastSeen < GESTURE_SLOT_REACQUIRE_MS/);
  assert.match(source, /gestureMetricDistance\(cands\[ci\], slot\.palm, gestureHandsAspect\(\)\)/);
  assert.match(source, /pinchDebounceFrames = slot\.pinch \? 3 : 2/);
  assert.match(source, /gestureTwoHand\.distSm \+= \(dist - gestureTwoHand\.distSm\) \* 0\.34/);
  assert.match(source, /tNow - gestureTwoHand\.lastPairAt <= GESTURE_TWO_HAND_GRACE_MS/);
});

test('手势 Worker 按摄像头实际比例生成推理帧', () => {
  const context = {};
  vm.runInNewContext(`var GESTURE_WORKER_LONG_SIDE = 320; ${readFunction('gestureWorkerFrameSize')}`, context);
  assert.deepEqual({ ...context.gestureWorkerFrameSize({ videoWidth: 1280, videoHeight: 720 }) }, { width: 320, height: 180 });
  assert.deepEqual({ ...context.gestureWorkerFrameSize({ videoWidth: 640, videoHeight: 480 }) }, { width: 320, height: 240 });
});

test('宽屏手势距离按画面比例校正，张手和捏合不会被 16:9 拉扁误判', () => {
  const context = { Math, Number };
  vm.runInNewContext(readFunction('gestureMetricDistance'), context);
  assert.ok(Math.abs(context.gestureMetricDistance({ x: 0.75, y: 0.5 }, { x: 0.25, y: 0.5 }, 16 / 9) - (8 / 9)) < 1e-9);
  assert.equal(context.gestureMetricDistance({ x: 0.5, y: 0.75 }, { x: 0.5, y: 0.25 }, 16 / 9), 0.5);
  assert.match(source, /handOpenness\(slot\.lm, palm, metricAspect\)/);
  assert.match(source, /pinchRatio = gestureMetricDistance\(slot\.lm\[8\], slot\.lm\[4\], metricAspect\) \/ span/);
});

test('双手张开/收拢直接缩放，不再要求双捏或叠加旋转惯性', () => {
  assert.match(source, /GESTURE_TWO_HAND_ARM_MS\s*=\s*140/);
  assert.match(source, /GESTURE_TWO_HAND_DEADZONE\s*=\s*0\.025/);
  assert.match(source, /twoHandsReady = present\.length === 2[\s\S]*present\[0\]\.pinch && present\[1\]\.pinch/);
  assert.match(source, /gestureMetricDistance\(present\[1\]\.palm, present\[0\]\.palm, aspect\)/);
  assert.match(source, /gestureTwoHandScaleRatio\(gestureTwoHand\.distSm, gestureTwoHand\.d0\)/);
  assert.doesNotMatch(source, /var twoPinch = present\.length === 2/);
  assert.doesNotMatch(source, /gestureRotation\.z \+= da/);
  assert.match(source, /lyricDepthActive && fx && fx\.lyricDepthInteraction === true\) return 'lyric-depth'/);
  assert.match(source, /gestureZoom\.target = clampRange\(gestureTwoHand\.zoomBase \* ratio, GESTURE_ZOOM_MIN, GESTURE_ZOOM_MAX\)/);
});

test('双手缩放是基准距离的直接比例，只有 2.5% 防抖死区', () => {
  const context = {};
  vm.runInNewContext(`var GESTURE_TWO_HAND_DEADZONE = 0.025; ${readFunction('gestureTwoHandScaleRatio')}`, context);
  assert.equal(context.gestureTwoHandScaleRatio(1.02, 1), 1);
  assert.ok(Math.abs(context.gestureTwoHandScaleRatio(1.2, 1) - 1.175) < 1e-9);
  assert.ok(Math.abs(context.gestureTwoHandScaleRatio(0.8, 1) - 0.825) < 1e-9);
});

test('单手捏合旋转保留，不影响双手缩放的直接手感', () => {
  assert.match(source, /gestureRotation\.y \+= spinY[\s\S]*gestureRotation\.x \+= spinX/);
  assert.match(source, /particleSpin\.vy = clampParticleSpinVelocity\(spinY \/ pinchDt \* 0\.48\)/);
  assert.match(source, /particleSpin\.vx = clampParticleSpinVelocity\(spinX \/ pinchDt \* 0\.48\)/);
});

test('全局回正和多圈旋转 rebase 通过可选 hook 同步词境穿行', () => {
  assert.match(source, /typeof resetLyricDepthInteractionTransform === 'function'[\s\S]*resetLyricDepthInteractionTransform\(!!syncVisual\)/);
  assert.match(source, /typeof rebaseLyricDepthInteractionAxis === 'function'[\s\S]*rebaseLyricDepthInteractionAxis\(axis, offset\)/);
});
