const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/00-layout-hover.js'), 'utf8');
const managerSource = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/01-manager-core.js'), 'utf8');

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

test('3D 歌架的侧栏与详情角度读取歌词倾角', () => {
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
  assert.ok(Math.abs(sandbox.result.sideRotX - (0.042 + 12 * radians)) < 1e-9);
  assert.ok(Math.abs(sandbox.result.sideRotY - (0.28 - 18 * radians)) < 1e-9);
  assert.ok(Math.abs(sandbox.result.detail.rx - (-0.008 + 12 * radians)) < 1e-9);
  assert.ok(Math.abs(sandbox.result.detail.ry - (0.020 - 18 * radians)) < 1e-9);
});

test('歌架实际卡片旋转使用同一组歌词倾角', () => {
  assert.match(managerSource, /layout\.lyricTiltX/);
  assert.match(managerSource, /layout\.lyricTiltY/);
  assert.match(managerSource, /sideFanRotX/);
});
