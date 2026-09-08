'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const index = read('public/index.html');
const css = read('public/css/index.css');
const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
const voxel = read('public/js/modules/02-visual/16-voxel-echo.js');
const gesture = read('public/js/modules/10-shell/00-gesture-control.js');
const pointer = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
const controls = read('public/js/modules/02-visual/15-ripples-cover-depth.js');
const background = read('public/js/modules/07-fx/02-accent-background-controls.js');

test('音域回响只增加悬浮方块尺寸，不引入移植版模式', () => {
  assert.match(index, /id="fx-voxfloatblockscale"[^>]+min="1"[^>]+max="2"[^>]+step="0\.05"/);
  assert.match(defaults, /voxFloatBlockScale:\s*1/);
  assert.match(bindings, /\['fx-voxfloatblockscale',\s*'voxFloatBlockScale'\]/);
  assert.match(panel, /setRange\('fx-voxfloatblockscale',\s*fx\.voxFloatBlockScale == null \? 1 : fx\.voxFloatBlockScale\)/);
  assert.match(panel, /function updateVoxFloatBlockScaleControl\(\)/);
  assert.match(bindings, /key === 'voxFloatBlocks'[\s\S]*?updateVoxFloatBlockScaleControl\(\)/);
  assert.match(bindings, /function resetFx\(\)[\s\S]*?saveVoxToggles\(\)[\s\S]*?reason: 'resetFx'/);
  assert.match(voxel, /function voxFloatBlockScaleValue\(value\)/);
  assert.match(voxel, /var _floatBlockScale = voxFloatBlockScaleValue\(fx && fx\.voxFloatBlockScale\)/);
  assert.match(voxel, /_blk\.baseScale \* _pulseScale \* _floatBlockScale/);
  assert.match(voxel, /floatBlockScale:\s*voxFloatBlockScaleValue\(fx\.voxFloatBlockScale\)/);
  // 声波地形/工坊(预设 12/13)已按第六批完整迁移回归(见 test-sonic-series-migration.js),
  // 此处不再断言"不引入移植版模式";悬浮方块尺寸滑杆仍是体素专属。
});

test('音域回响双手张合直接缩放内容，不复用滚轮相机半径', () => {
  const voxelPinch = gesture.match(/if \(kind === 'voxel'\) \{([\s\S]*?)\n    \} else if \(kind === 'skull'\)/);
  assert.ok(voxelPinch, '双手音域回响分支');
  assert.doesNotMatch(voxelPinch[1], /_voxCam\.(?:radius|height)\s*=/);
  assert.match(gesture, /gestureTwoHand\.voxScaleBase\s*=\s*getVoxelGestureContentScale\(\)/);
  assert.match(voxelPinch[1], /setVoxelGestureContentScale\(gestureTwoHand\.voxScaleBase \* ratio\)/);
  assert.match(voxelPinch[1], /markRenderInteraction\('vox-gesture', 900\)/);
  assert.match(voxel, /var _voxGestureContentScale\s*=\s*1/);
  assert.match(voxel, /function setVoxelGestureContentScale\(value\)/);
  assert.match(voxel, /voxelCity\.contentRoot\.scale\.setScalar\(_voxGestureContentScale\)/);
  assert.match(voxel, /contentRoot\.add\(platter\)/);
  assert.match(voxel, /contentRoot\.add\(_coverPlane\)/);
  // 滚轮也改成直接缩放内容(和手势双手缩放同一条路径),不再推拉相机半径
  assert.match(pointer, /setVoxelGestureContentScale\(getVoxelGestureContentScale\(\) \* Math\.exp\(-e\.deltaY \* 0\.0022\)\)/);
  assert.doesNotMatch(pointer, /_voxCam\.radius\s*=\s*clampRange\(_voxCam\.radius \* \(1 \+ e\.deltaY/);

  const helperBlock = voxel.match(/var _voxGestureContentScale\s*=\s*1;[\s\S]*?function voxFloatBlockScaleValue\(value\)/);
  assert.ok(helperBlock, '体素内容缩放 helper');
  const source = helperBlock[0].replace(/function voxFloatBlockScaleValue\(value\)[\s\S]*$/, '');
  const root = { scale: { value: 1, setScalar(value) { this.value = value; } } };
  const context = { voxelCity: { contentRoot: root } };
  vm.runInNewContext(`${source}; this.setScale = setVoxelGestureContentScale; this.getScale = getVoxelGestureContentScale;`, context);
  context.setScale(4);
  assert.equal(context.getScale(), 1.9);
  assert.equal(root.scale.value, 1.9);
  context.setScale(0.1);
  assert.equal(context.getScale(), 0.55);
  assert.equal(root.scale.value, 0.55);
});

test('音域回响鼠标拖动即时驱动相机，不经过全局显示相机惯性', () => {
  assert.doesNotMatch(voxel, /_voxCamDisplay/);
  assert.doesNotMatch(voxel, /tickVoxelCameraDisplayState/);
  assert.doesNotMatch(voxel, /voxSnapCameraDisplayState/);
  const updateCamera = voxel.match(/function _voxUpdateCamera\(dt\)\s*\{[\s\S]*?\n\}/);
  assert.ok(updateCamera, '音域回响相机更新函数');
  assert.match(updateCamera[0], /_voxCam\.radius \* _voxCam\.radius/);
  assert.match(updateCamera[0], /Math\.sin\(_voxCam\.azimuth\)/);
  assert.match(updateCamera[0], /_voxCam\.height \* _vsc/);
  assert.doesNotMatch(voxel, /voxelShelfComposition|voxelShelfCameraFocusPose/);
});

test('全屏播放器歌曲区保持单行并为长标题省略', () => {
  assert.match(index, /id="control-title"[^>]*>[\s\n]*<span id="control-title-text" class="control-title-text"><\/span>/);
  assert.match(controls, /var titleText = document\.getElementById\('control-title-text'\)/);
  assert.match(controls, /titleText\.textContent = song\.name \|\| ''/);
  assert.match(css, /desktop-fullscreen \.control-cluster\.actions,[\s\S]*?html:fullscreen body\.desktop-shell \.control-cluster\.actions\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*align-content:\s*center/);
  assert.match(css, /desktop-fullscreen \.control-cluster\.actions \.control-track,[\s\S]*?\.control-track\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0/);
  assert.match(css, /desktop-fullscreen \.control-cluster\.actions \.control-meta,[\s\S]*?\.control-meta\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0/);
  assert.match(css, /\.control-title-text\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/);
});

test('删除背景封面、裁切、清除入口及背景裁切弹窗，保留媒体背景和歌曲封面裁切', () => {
  assert.doesNotMatch(index, /bg-album-toggle-btn|bg-media-crop-btn|background-crop-modal|toggleCustomBackgroundAlbumCover|openCustomBackgroundCropModal|clearCustomBackgroundImage/);
  assert.doesNotMatch(background, /customBackgroundCropModalState|openCustomBackgroundCropModal|openCustomBackgroundCropModalSoon|clearCustomBackgroundImage|toggleCustomBackgroundAlbumCover/);
  assert.doesNotMatch(css, /\.background-crop-/);
  assert.match(index, /id="video-bg-grid"/);
  assert.match(index, /id="video-bg-file"/);
  assert.match(index, /id="fx-bgcropx"/);
  assert.match(index, /id="fx-bgcropy"/);
  assert.match(index, /id="fx-bgzoom"/);
  assert.match(index, /id="cover-crop-modal"/);
  assert.match(index, /commitCoverCrop\(\)/);
  assert.match(background, /function setCustomBackgroundMedia\(/);
  assert.match(background, /function setCustomBackgroundAlbumCover\(/);
});
