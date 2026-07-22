const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/modules/10-shell/00-gesture-control.js'), 'utf8');

test('保留 PR 53 的 GPU Worker 手势引擎和低负载相机参数', () => {
  assert.match(source, /await ensureGestureWorker\(\)[\s\S]*gestureEngineMode = 'worker'/);
  assert.match(source, /width:\s*\{ ideal:\s*320 \}[\s\S]*height:\s*\{ ideal:\s*240 \}[\s\S]*frameRate:\s*\{ ideal:\s*30, max:\s*30 \}/);
  assert.doesNotMatch(source, /GESTURE_HANDS_LOCAL|ensureGestureHandsSolution/);
});

test('双手推拉允许短暂丢手并稳定左右手身份', () => {
  assert.match(source, /GESTURE_TWO_HAND_GRACE_MS\s*=\s*180/);
  assert.match(source, /GESTURE_SLOT_REACQUIRE_MS\s*=\s*240/);
  assert.match(source, /tNow - slot\.lastSeen < GESTURE_SLOT_REACQUIRE_MS/);
  assert.match(source, /pinchDebounceFrames = slot\.pinch \? 3 : 2/);
  assert.match(source, /gestureTwoHand\.distSm \+= \(dist - gestureTwoHand\.distSm\) \* 0\.34/);
  assert.match(source, /while \(da > Math\.PI \/ 2\) da -= Math\.PI/);
  assert.match(source, /tNow - gestureTwoHand\.lastPairAt <= GESTURE_TWO_HAND_GRACE_MS/);
});
