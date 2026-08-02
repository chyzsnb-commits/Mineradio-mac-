const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/00-layout-hover.js'), 'utf8');
const managerSource = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/01-manager-core.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/03-content-list-manager.js'), 'utf8');

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

test('3D 歌架布局保留歌词倾角输入与独立歌架角度', () => {
  const start = source.indexOf('function isPortraitShelfViewport');
  const end = source.indexOf('function shelfHotZoneWidth', start);
  assert.notEqual(source.indexOf('function shelfLyricAngleSettings'), -1, '缺少歌架歌词角度适配函数');
  assert.notEqual(start, -1, '歌架布局函数起点不存在');
  assert.notEqual(end, -1, '歌架布局函数边界不存在');

  const sandbox = {
    fx: { lyricTiltX: 12, lyricTiltY: -18 },
    innerWidth: 1440,
    innerHeight: 900,
    clampRange,
    voxelCityActive: () => false,
    shouldUseSkullSafeShelfCamera: () => false,
    shelfSettings: () => ({ x: 0, y: 0, z: 0, size: 1, angle: 0 }),
    shelfDetailSettings: () => ({ x: 0, y: 0, z: 0, scale: 1, rx: 0, ry: 0, rowGap: 1 }),
    isFinite,
  };
  vm.runInNewContext(
    source.slice(start, end) + '\nresult = shelfLayoutProfile();',
    sandbox,
  );

  const radians = Math.PI / 180;
  assert.ok(Math.abs(sandbox.result.lyricTiltX - 12 * radians) < 1e-9);
  assert.ok(Math.abs(sandbox.result.lyricTiltY + 18 * radians) < 1e-9);
  assert.ok(Math.abs(sandbox.result.sideRotX - 0.042) < 1e-9);
  assert.ok(Math.abs(sandbox.result.sideRotY - 0.28) < 1e-9);
  assert.ok(Math.abs(sandbox.result.detail.rx - (-0.008)) < 1e-9);
  assert.ok(Math.abs(sandbox.result.detail.ry - 0.020) < 1e-9);
});

test('歌架和歌单详情复用歌词最终四元数', () => {
  assert.match(source, /function shelfLyricQuaternion/);
  assert.match(managerSource, /shelfLyricQuaternion\(group\.quaternion\)/);
  assert.match(contentSource, /shelfLyricQuaternion\(group\.quaternion\)/);
  assert.match(managerSource, /lyricQuaternionAvailable/);
  assert.match(contentSource, /lyricQuaternionAvailable/);
});

test('歌架玻璃底色不能再是接近全黑的固定填充', () => {
  assert.match(source, /function shelfGlassRgba/);
  assert.match(managerSource, /shelfGlassRgba\(/);
  assert.match(contentSource, /shelfGlassRgba\(/);
  assert.doesNotMatch(managerSource, /rgba\(0,0,0,' \+ shelfLook\.bgOpacity/);
  assert.doesNotMatch(contentSource, /rgba\(0,0,0,' \+ panelBgAlpha/);
  assert.doesNotMatch(contentSource, /rgba\(0,0,0,' \+ Math\.min/);
});

test('歌架卡片局部旋转只负责弧形扇出，不重复叠加歌词倾角', () => {
  assert.doesNotMatch(managerSource, /card\.mesh\.rotation\.x = \(layout\.lyricTiltX/);
  assert.doesNotMatch(managerSource, /card\.mesh\.rotation\.y = \(layout\.lyricTiltY/);
  assert.match(managerSource, /sideFanRotX/);
});
