const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const defaults = fs.readFileSync(path.join(root, 'public/js/modules/00-state/04-fx-defaults.js'), 'utf8');
const pointer = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/00-pointer-cover-particles.js'), 'utf8');
const voxel = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/16-voxel-echo.js'), 'utf8');
const mainLoop = fs.readFileSync(path.join(root, 'public/js/modules/11-main-loop.js'), 'utf8');
const persistence = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/04-visual-settings-persistence.js'), 'utf8');
const archive = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/00-preset-archive-data.js'), 'utf8');
const bindings = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/07-bindings-shelf-immersive.js'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

function readFunction(source, name) {
  const match = source.match(new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'));
  assert.ok(match, name + ' 需要可测试的独立函数');
  return match[0];
}

test('拖动缓冲有四档，弱档更跟手但仍保留轻微阻尼', () => {
  assert.match(defaults, /pointerDragFollowMode:\s*'medium-strong'/);
  assert.match(defaults, /POINTER_DRAG_FOLLOW_DEFAULT_60FPS\s*=\s*0\.055/);
  assert.match(defaults, /light:\s*0\.22/);
  assert.match(defaults, /medium:\s*0\.12/);
  assert.match(defaults, /'medium-strong':\s*POINTER_DRAG_FOLLOW_DEFAULT_60FPS/);
  assert.match(defaults, /strong:\s*0\.032/);
  assert.match(defaults, /pointerDragFollowRateForMode\(/);
  const helpers = [
    readFunction(defaults, 'normalizePointerDragFollowMode'),
    readFunction(defaults, 'pointerDragFollowRateForMode'),
    readFunction(defaults, 'getPointerDragFollowRate')
  ].join('\n');
  const context = {
    fx: { pointerDragFollowMode: 'medium-strong' },
    fxDefaults: { pointerDragFollowMode: 'medium-strong' },
    POINTER_DRAG_FOLLOW_LEVELS: { light: 0.22, medium: 0.12, 'medium-strong': 0.055, strong: 0.032 }
  };
  vm.runInNewContext(helpers + '\nthis.normalizePointerDragFollowMode = normalizePointerDragFollowMode; this.pointerDragFollowRateForMode = pointerDragFollowRateForMode; this.getPointerDragFollowRate = getPointerDragFollowRate;', context);
  assert.deepEqual(['light', 'medium', 'medium-strong', 'strong'].map(context.normalizePointerDragFollowMode), ['light', 'medium', 'medium-strong', 'strong']);
  assert.equal(context.pointerDragFollowRateForMode('medium-strong'), 0.055);
  assert.equal(context.pointerDragFollowRateForMode('light'), 0.22, '弱档需要明显更跟手');
  assert.ok(context.pointerDragFollowRateForMode('light') < 1, '弱档仍必须保留阻尼，不能变成直接跟手');
  assert.ok(context.pointerDragFollowRateForMode('light') > context.pointerDragFollowRateForMode('medium'));
  assert.ok(context.pointerDragFollowRateForMode('strong') < context.pointerDragFollowRateForMode('medium-strong'));
  assert.equal(context.getPointerDragFollowRate(), 0.055);
});

test('普通预设和 p10 都通过同一个跟随率 helper，0.90 仍只属于释放惯性', () => {
  assert.match(mainLoop, /pointerDragFollowBlend\(/);
  assert.doesNotMatch(mainLoop, /particles\.rotation\.y \+= \(targetRotY - particles\.rotation\.y\) \* 0\.055/);
  assert.match(voxel, /pointerDragFollowBlend\(/);
  assert.doesNotMatch(voxel, /VOX_CAMERA_FOLLOW_60FPS\s*=\s*0\.055/);
  assert.match(pointer, /POINTER_ROTATION_DAMPING\s*=\s*0\.90/);
  assert.match(pointer, /VOX_POINTER_DAMPING\s*=\s*POINTER_ROTATION_DAMPING/);
});

test('设置控件、当前自动保存和 DIY 存档都携带拖动缓冲档位', () => {
  assert.match(panel, /拖动缓冲（镜头\s*\/\s*歌架\s*\/\s*音柱）/);
  assert.match(panel, /弱更跟手；强更有缓冲/);
  assert.match(panel, /id="pointer-drag-follow-seg"/);
  assert.match(panel, /data-pointer-drag-follow="light"/);
  assert.match(panel, /data-pointer-drag-follow="medium-strong"/);
  assert.match(panel, /data-pointer-drag-follow="strong"/);
  assert.match(bindings, /pointer-drag-follow-seg/);
  assert.match(bindings, /pointerDragFollowMode/);
  assert.match(persistence, /pointerDragFollowMode:\s*normalizePointerDragFollowMode/);
  assert.match(archive, /pointerDragFollowMode:\s*archiveMode/);
  assert.match(archive, /'cam',\s*'pointerDragFollowMode'/);
});

test('跟随率按 60Hz 基准归一，设置变化不改变释放阻尼', () => {
  const blend = readFunction(defaults, 'pointerDragFollowBlend');
  const context = {
    fx: { pointerDragFollowMode: 'medium-strong' },
    fxDefaults: { pointerDragFollowMode: 'medium-strong' },
    POINTER_DRAG_FOLLOW_DEFAULT_60FPS: 0.055,
    POINTER_DRAG_FOLLOW_LEVELS: { light: 0.22, medium: 0.12, 'medium-strong': 0.055, strong: 0.032 }
  };
  const helpers = [
    readFunction(defaults, 'normalizePointerDragFollowMode'),
    readFunction(defaults, 'pointerDragFollowRateForMode'),
    readFunction(defaults, 'getPointerDragFollowRate'),
    blend
  ].join('\n');
  vm.runInNewContext(helpers + '\nthis.pointerDragFollowBlend = pointerDragFollowBlend;', context);
  const oneAt60 = context.pointerDragFollowBlend(1 / 60);
  const twoAt120 = 1 - Math.pow(1 - context.getPointerDragFollowRate(), 2);
  assert.ok(Math.abs(oneAt60 - 0.055) < 0.000001);
  assert.ok(Math.abs(twoAt120 - (1 - Math.pow(1 - 0.055, 2))) < 0.000001);
  assert.match(pointer, /Math\.pow\(VOX_POINTER_DAMPING, dt \* 60\)/);
});
