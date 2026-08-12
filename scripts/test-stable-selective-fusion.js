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
  assert.doesNotMatch(index, /音域地形|音域回响·WE|sonicGround|sonicWorkshop/);
  assert.equal(fs.existsSync(path.join(root, 'public/sonic-topography-preset.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'public/sonic-workshop-preset.js')), false);
});

test('音域回响双手缩放使用移植版的目标与显示相机缓动', () => {
  assert.match(voxel, /var _voxCamDisplay\s*=\s*\{\s*radius:\s*VOX_CAM_DEF_RADIUS,\s*height:\s*VOX_CAM_DEF_HEIGHT,\s*azimuth:\s*VOX_CAM_DEF_AZIMUTH\s*\}/);
  assert.match(voxel, /function shortestVoxelAzimuthDelta\(from, to\)/);
  assert.match(voxel, /function voxSnapCameraDisplayState\(\)/);
  assert.match(voxel, /function tickVoxelCameraDisplayState\(display, target, dt\)/);
  assert.match(voxel, /1 - Math\.pow\(1 - 0\.055, frames\)/);
  assert.match(voxel, /tickVoxelCameraDisplayState\(_voxCamDisplay, _voxCam, dt\)/);
  assert.match(voxel, /_voxCamDisplay\.radius \* _voxCamDisplay\.radius/);
  assert.match(voxel, /Math\.sin\(_voxCamDisplay\.azimuth\)/);
  assert.match(voxel, /voxRecenterCamera\(\)[\s\S]*?voxSnapCameraDisplayState\(\)/);
  assert.match(voxel, /voxSyncCamFromCurrentCamera\(\)[\s\S]*?voxSnapCameraDisplayState\(\)/);
  assert.doesNotMatch(voxel, /voxelShelfComposition|voxelShelfCameraFocusPose/);

  const helperBlock = voxel.match(/function shortestVoxelAzimuthDelta\(from, to\)[\s\S]*?function voxRecenterCamera\(\)/);
  assert.ok(helperBlock, 'camera follow helper block');
  const source = helperBlock[0].replace(/function voxRecenterCamera\(\)[\s\S]*$/, '');
  const context = {};
  vm.runInNewContext(`${source}; this.tick = tickVoxelCameraDisplayState;`, context);
  const display = { radius: 128, height: 48, azimuth: 3.13 };
  const target = { radius: 64, height: 24, azimuth: -3.13 };
  context.tick(display, target, 1 / 60);
  assert.ok(Math.abs(display.radius - (128 + (64 - 128) * 0.055)) < 1e-9);
  assert.ok(display.azimuth > 3.13, '跨越 -PI/PI 时应沿最短方向移动');
  const a = { radius: 128, height: 48, azimuth: 0 };
  const b = { radius: 128, height: 48, azimuth: 0 };
  const target2 = { radius: 64, height: 24, azimuth: 0.2 };
  context.tick(a, target2, 1 / 60);
  context.tick(b, target2, 1 / 120);
  context.tick(b, target2, 1 / 120);
  assert.ok(Math.abs(a.radius - b.radius) < 1e-9, '不同帧率应保持同一跟随速度');

  assert.match(gesture, /present\[1\]\.pinchPt\.x - present\[0\]\.pinchPt\.x/);
  assert.match(gesture, /GESTURE_TWO_HAND_GRACE_MS\s*=\s*180/);
  assert.match(gesture, /GESTURE_SLOT_REACQUIRE_MS\s*=\s*240/);
  assert.match(gesture, /gestureTwoHand\.distSm \+= \(dist - gestureTwoHand\.distSm\) \* 0\.34/);
  assert.match(gesture, /gestureTwoHand\.voxRadiusBase \/ ratio, 12, 140/);
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
