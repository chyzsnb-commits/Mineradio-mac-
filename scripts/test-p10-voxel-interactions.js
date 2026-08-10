'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pointer = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/00-pointer-cover-particles.js'), 'utf8');
const voxel = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/16-voxel-echo.js'), 'utf8');
const shelfManager = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/01-manager-core.js'), 'utf8');
const stageLyrics = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js'), 'utf8');
const shelfBindings = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/07-bindings-shelf-immersive.js'), 'utf8');
const shelfInteractions = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/05-card-interactions.js'), 'utf8');
const shelfLayoutHover = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/00-layout-hover.js'), 'utf8');
const contentList = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/03-content-list-manager.js'), 'utf8');
const consoleWorkspace = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/09-console-workspace.js'), 'utf8');
const peekPanels = fs.readFileSync(path.join(root, 'public/js/modules/10-shell/02-peek-panels-upload.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/index.css'), 'utf8');

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name} 函数没有闭合`);
}

test('p10 鼠标拖动使用普通预设同源的速度采样、加速度增益和阻尼', () => {
  assert.match(pointer, /VOX_POINTER_INERTIA_GAIN\s*=\s*0\.46/);
  assert.match(pointer, /POINTER_ROTATION_DAMPING\s*=\s*0\.90/);
  assert.match(pointer, /VOX_POINTER_DAMPING\s*=\s*POINTER_ROTATION_DAMPING/);
  assert.match(pointer, /function applyVoxelPointerDragState\(/);
  assert.match(pointer, /function tickVoxelPointerDragState\(/);
  assert.match(pointer, /applyVoxelPointerDragState\(_voxCam/);
  assert.match(voxel, /tickVoxelPointerDragState\(_voxCam/);

  const helper = readFunction(pointer, 'applyVoxelPointerDragState');
  const context = {
    VOX_POINTER_INERTIA_GAIN: 0.46,
    VOX_POINTER_AZIMUTH_MAX: 6.2,
    VOX_POINTER_HEIGHT_MAX: 62,
    clampRange: (v, min, max) => Math.max(min, Math.min(max, v)),
  };
  vm.runInNewContext(`${helper}; this.applyVoxelPointerDragState = applyVoxelPointerDragState;`, context);
  const state = { azimuth: 0, height: 10, azimuthVelocity: 0, heightVelocity: 0 };
  context.applyVoxelPointerDragState(state, 20, 5, 0.1, 20);
  assert.equal(state.azimuth, -0.12, '横向拖动仍应即时生效');
  assert.equal(state.height, 11.1, '纵向拖动仍应即时生效');
  assert.ok(Math.abs(state.azimuthVelocity) > 0, '释放后横向应保留惯性');
  assert.ok(Math.abs(state.heightVelocity) > 0, '释放后纵向应保留惯性');
});

test('p10 释放后继续惯性移动并按帧率归一阻尼', () => {
  assert.match(pointer, /var _voxDrag = \{[^}]*azimuthVelocity:\s*0[^}]*heightVelocity:\s*0/);
  const helper = readFunction(pointer, 'tickVoxelPointerDragState');
  const context = {
    VOX_POINTER_DAMPING: 0.90,
    clampRange: (v, min, max) => Math.max(min, Math.min(max, v)),
  };
  vm.runInNewContext(`${helper}; this.tickVoxelPointerDragState = tickVoxelPointerDragState;`, context);
  const state = { active: false, azimuth: 0, height: 10, azimuthVelocity: 1, heightVelocity: 2 };
  context.tickVoxelPointerDragState(state, 1 / 60, 20);
  assert.ok(state.azimuth > 0 && state.height > 10, '释放后第一帧必须继续移动');
  assert.ok(state.azimuthVelocity < 1 && state.azimuthVelocity > 0, '横向速度必须衰减');
  assert.ok(state.heightVelocity < 2 && state.heightVelocity > 0, '纵向速度必须衰减');
  const after60 = state.azimuthVelocity;
  context.tickVoxelPointerDragState(state, 1, 20);
  assert.ok(state.azimuthVelocity < after60, '长帧也必须按秒数衰减而非固定减量');
});

test('p10 显示相机按普通预设同源的帧率归一缓动跟随拖拽目标', () => {
  assert.match(voxel, /pointerDragFollowBlend\(/);
  const angularDelta = readFunction(voxel, 'shortestVoxelAzimuthDelta');
  const follow = readFunction(voxel, 'tickVoxelCameraDisplayState');
  const context = {
    getPointerDragFollowRate: () => 0.055,
    pointerDragFollowBlend: (dt) => 1 - Math.pow(1 - 0.055, Math.max(0, Math.min(6, dt * 60)))
  };
  vm.runInNewContext(`${angularDelta}; ${follow}; this.tickVoxelCameraDisplayState = tickVoxelCameraDisplayState;`, context);

  const target = { radius: 120, height: 48, azimuth: 1 };
  const at60 = { radius: 100, height: 40, azimuth: 0 };
  context.tickVoxelCameraDisplayState(at60, target, 1 / 60);
  assert.ok(at60.azimuth > 0 && at60.azimuth < target.azimuth, '拖拽目标变化后，显示相机首帧只能跟随一部分');
  assert.ok(Math.abs(at60.azimuth - 0.055) < 0.0001, '60Hz 首帧必须匹配普通预设的 0.055 跟随率');

  const at120 = { radius: 100, height: 40, azimuth: 0 };
  context.tickVoxelCameraDisplayState(at120, target, 1 / 120);
  context.tickVoxelCameraDisplayState(at120, target, 1 / 120);
  assert.ok(Math.abs(at120.azimuth - at60.azimuth) < 0.0001, '120Hz 两帧必须与 60Hz 一帧等价');

  const acrossWrap = { radius: 100, height: 40, azimuth: 3.13 };
  context.tickVoxelCameraDisplayState(acrossWrap, { radius: 100, height: 40, azimuth: -3.13 }, 1 / 60);
  assert.ok(acrossWrap.azimuth > 3.13, '跨越 -PI/PI 时必须走最短角路径，不能绕整圈');
});

test('p10 右键必须复用 Win 的统一歌架状态机', () => {
  assert.doesNotMatch(shelfInteractions, /function toggleSideShelfFromContextMenu\(/);
  assert.match(shelfInteractions, /if \(isPointerOverUi\(e\)\) return;/);
  assert.match(shelfInteractions, /var shouldOpen = shelfHardHidden \|\| !shelfPinnedOpen/);
  assert.match(shelfInteractions, /if \(shouldOpen\)\s*\{\s*shelfHardHidden = false/);
  assert.doesNotMatch(shelfInteractions, /shelfManager\.rebuild\(false\)/);
  assert.match(shelfInteractions, /setShelfPinnedOpen\(shouldOpen, true\)/);
  assert.match(shelfLayoutHover, /setFocusZone\(shelfPinnedOpen \? 'shelf-side' : null, immediate\)/);
});

test('右键唤起歌架前必须清除悬停选中，避免 p10 以抬升卡片进入错误位置', () => {
  assert.match(
    shelfInteractions,
    /if \(shouldOpen\)\s*\{[\s\S]*?shelfManager\.clearSelected\(\)[\s\S]*?setShelfPinnedOpen\(shouldOpen, true\)/
  );
});

test('p10 只把通用 focus 的平滑姿态映射到旧场景尺度', () => {
  assert.match(voxel, /function voxelShelfCameraFocusPose\(/);
  assert.match(voxel, /function voxelShelfWorldFrameYaw\(/);
  assert.doesNotMatch(voxel, /readVoxelShelfCompositionMix/);
  const helper = readFunction(voxel, 'voxelShelfCameraFocusPose');
  const frameYaw = readFunction(voxel, 'voxelShelfWorldFrameYaw');
  const pinnedOffset = readFunction(voxel, 'voxelShelfPinnedLookAtOffset');
  const context = {
    VOX_CAM_DEF_RADIUS: 103,
    VOX_CAM_DEF_HEIGHT: 48,
    VOX_CAM_DEF_AZIMUTH: -Math.PI / 4,
    VOX_CAM_DEF_LOOKY: 0,
    clampRange: (value, min, max) => Math.max(min, Math.min(max, value)),
    orbit: {
      focus: { active: true, type: 'shelf-side' },
      baselineRadius: 6.6,
      baselineTheta: 0,
      baselinePhi: 0,
      theta: 0.42,
      phi: -0.12,
      radius: 4.2,
      lookAt: { x: 2.32, y: -0.10, z: 0.72 },
    },
  };
  vm.runInNewContext(`${frameYaw}; ${pinnedOffset}; ${helper}; this.voxelShelfCameraFocusPose = voxelShelfCameraFocusPose;`, context);
  const pose = context.voxelShelfCameraFocusPose();
  assert.ok(pose, '通用 shelf focus 激活时必须返回 p10 相机姿态');
  assert.ok(pose.radius < 103, '歌架 focus 应按通用相机半径平滑推近');
  assert.ok(pose.azimuth > -Math.PI / 4, '歌架 focus 应使用通用 theta 向右转');
  assert.ok(pose.height < 0, 'Win shelf-side 的负仰角必须保留，不能被 p10 硬钳到地平线以上');
  assert.ok(pose.lookAt.x > 0, '歌架 focus 应使用通用 lookAt 偏移');
  assert.ok(Math.abs(pose.lookAt.x - 2.32 * (103 / 6.6)) > 0.1, '歌架 focus 的 lookAt 必须转换到 p10 世界方位');
  context.orbit.focus.active = false;
  context.orbit.focus.type = null;
  assert.equal(context.voxelShelfCameraFocusPose(), null, '没有 focus 时必须回到 p10 自由镜头');
});

test('p10 歌架根节点必须与默认相机方位同向旋转', () => {
  assert.match(shelfManager, /var shelfFrameYaw[\s\S]*voxelShelfWorldFrameYaw\(\)/);
  assert.match(shelfManager, /shelfFrameYaw \+ clampRange\(particles\.rotation\.y/);
  assert.match(shelfManager, /shelfFrameYaw \+ px \* 0\.018/);
});

test('p10 右键构图使用同一过渡进度，固定态不再套用截图猜值', () => {
  assert.match(voxel, /function voxelShelfCompositionMixValue\(/);
  assert.match(voxel, /function voxelShelfCompositionScale\(/);
  assert.match(voxel, /tickVoxelShelfComposition\(/);
  assert.match(voxel, /function voxelShelfPinnedScale\(/);
  assert.match(voxel, /function voxelShelfPinnedLookAtOffset\(/);
  assert.doesNotMatch(voxel, /return \(typeof shelfPinnedOpen[^\n]+\) \? 0\.93 : 1/);
  assert.doesNotMatch(voxel, /return \{ x: 0\.18, y: 0\.30, z: 0\.07 \}/);

  const helpers = [
    readFunction(voxel, 'voxelShelfCompositionMixValue'),
    readFunction(voxel, 'voxelShelfCompositionScale'),
    readFunction(voxel, 'voxelShelfPinnedScale'),
    readFunction(voxel, 'voxelShelfPinnedLookAtOffset')
  ].join('\n');
  const context = {
    voxelShelfCompositionMix: 0.5,
    shelfPinnedOpen: true,
    clampRange: (value, min, max) => Math.max(min, Math.min(max, value))
  };
  vm.runInNewContext(`${helpers}; this.voxelShelfCompositionMixValue = voxelShelfCompositionMixValue; this.voxelShelfCompositionScale = voxelShelfCompositionScale; this.voxelShelfPinnedScale = voxelShelfPinnedScale; this.voxelShelfPinnedLookAtOffset = voxelShelfPinnedLookAtOffset;`, context);
  assert.ok(context.voxelShelfCompositionScale() > 0.93 && context.voxelShelfCompositionScale() < 1, '固定态缩放必须由过渡进度驱动');
  assert.equal(context.voxelShelfPinnedScale(), 1, '旧固定态缩放补丁必须失效');
  assert.equal(JSON.stringify(context.voxelShelfPinnedLookAtOffset()), '{"x":0,"y":0,"z":0}', '旧固定态 lookAt 偏移必须移除');
});

test('p10 构图适配器只作用于 p10，详情歌词优先于普通 camera-lock 避让', () => {
  assert.match(voxel, /function voxelShelfCompositionShouldFocus\(/);
  assert.match(voxel, /function voxelShelfCameraFocusPose\(/);
  assert.match(stageLyrics, /var voxelShelfMix = [^;]*voxelShelfCompositionMixValue\(\)/);
  assert.match(stageLyrics, /normalShelfDetailOpen[\s\S]*voxelShelfMix/);
  assert.match(stageLyrics, /shelfDetailOpen && normalShelfDetailOpen/);
  assert.match(shelfManager, /voxelShelfCompositionMixValue\(\)/);
  assert.match(contentList, /shouldUseShelfDynamicCamera\('shelf-detail'\)/);
  assert.doesNotMatch(voxel, /tickVoxelShelfComposition[\s\S]*return \(typeof shelfPinnedOpen[^\n]+0\.93/);
});

test('四档拖动缓冲必须在动效基础画面中直接可见', () => {
  assert.match(consoleWorkspace, /key: 'motion'[\s\S]*key: 'base'[\s\S]*pointer-drag-follow-seg/);
  assert.match(consoleWorkspace, /拖动缓冲（镜头\s*\/\s*歌架\s*\/\s*音柱跟手）/);
  assert.match(consoleWorkspace, /fxConsoleItem\('pointer-drag-follow-seg',[\s\S]*'弱更跟手；强更有缓冲。松手后的惯性不变。'/);
  assert.match(consoleWorkspace, /function fxConsoleAppendItemNote\(/);
  assert.match(consoleWorkspace, /fx-console-item-note/);
});

test('p10 保留普通左边缘歌单触发，不把歌单面板迁入控制台', () => {
  assert.doesNotMatch(voxel, /_voxDockPlaylist\(true\)/, 'p10 不应阻断左边缘歌单面板');
  assert.doesNotMatch(voxel, /_voxDockPlaylist\(false\)/, '退出 p10 不应依赖迁移歌单面板');
  assert.doesNotMatch(css, /body\.vox-on #playlist-panel\{/, 'p10 不应覆盖普通歌单面板左侧定位');
  assert.match(peekPanels, /ex >= 0 && ex < 86/, '普通左边缘热区必须保留');
  assert.match(peekPanels, /isPlaylistEdgeTrigger\(ex, ey, H, e\)/, '全局鼠标移动必须调用左边缘热区');
});

test('p10 右键可以切换右侧 3D 歌架，且不被预设级隐藏', () => {
  assert.doesNotMatch(shelfManager, /shelfSuppressedByPreset\s*=\s*\(typeof voxelCityActive/);
  assert.doesNotMatch(shelfBindings, /if \(typeof voxelCityActive[\s\S]*?setFxPanelTab\('playlist'\)/);
  assert.match(shelfInteractions, /renderer\.domElement\.addEventListener\('contextmenu'/);
  assert.match(shelfInteractions, /if \(shouldOpen\)\s*\{\s*shelfHardHidden = false/);
  assert.match(shelfInteractions, /setShelfPinnedOpen\(shouldOpen, true\)/);
});

test('p10 交互边界仍尊重启动页、播放切换保护和空歌单', () => {
  assert.match(peekPanels, /if \(document\.body\.classList\.contains\('splash-active'\)\)/);
  assert.match(shelfInteractions, /shelfPlaybackSwitchGuardActive\(\)/);
  assert.match(shelfManager, /if \(!allItems\.length && !contentOpen\) targetVis = 0/);
  assert.match(shelfInteractions, /if \(document\.body\.classList\.contains\('splash-active'\)\) return/);
  assert.match(shelfInteractions, /shelfPlaybackSwitchGuardActive\(\)/);
});

test('左边缘歌单必须停留 600ms 后才触发，不能进入边缘即呼出', () => {
  assert.match(peekPanels, /var PLAYLIST_EDGE_DWELL_MS\s*=\s*600/);
  const edge = readFunction(peekPanels, 'isPlaylistEdgeTrigger');
  let now = 0;
  const context = {
    performance: { now: () => now },
    PLAYLIST_EDGE_DWELL_MS: 600,
    secondaryPlaylistEdgeGuard: { enteredAt: 0, timer: null, x: 0, y: 0, H: 0 },
    isVisualPointerDragActive: () => false,
    isSecondaryLeftDisplaySeamGuardActive: () => false,
    resetSecondaryPlaylistEdgeGuard() {},
  };
  vm.runInNewContext(`${edge}; this.isPlaylistEdgeTrigger = isPlaylistEdgeTrigger;`, context);
  now = 1;
  assert.equal(context.isPlaylistEdgeTrigger(0, 300, 800), false, '首次进入边缘不能立即呼出');
  now = 599;
  assert.equal(context.isPlaylistEdgeTrigger(0, 300, 800), false, '停留不足 600ms 不能呼出');
  now = 601;
  assert.equal(context.isPlaylistEdgeTrigger(0, 300, 800), true, '连续停留 600ms 后才允许呼出');
});

test('左键拖动期间必须同时抑制左侧歌单和右侧 3D 歌架唤醒', () => {
  assert.match(peekPanels, /function isVisualPointerDragActive\(/);
  assert.match(peekPanels, /var visualDragActive = isVisualPointerDragActive\(e\)/);
  assert.match(peekPanels, /if \(visualDragActive\)\s*\{[\s\S]*?updateShelfHoverCueFromPointer\(null\)[\s\S]*?resetSecondaryPlaylistEdgeGuard\(\)/);
  assert.match(peekPanels, /isPlaylistEdgeTrigger\(ex, ey, H, e\)/);
  const helper = readFunction(peekPanels, 'isVisualPointerDragActive');
  const context = { orbit: { rotating: false }, _voxDrag: { active: false } };
  vm.runInNewContext(`${helper}; this.isVisualPointerDragActive = isVisualPointerDragActive;`, context);
  assert.equal(context.isVisualPointerDragActive({ buttons: 1 }), true, '左键按住必须进入抑制态');
  assert.equal(context.isVisualPointerDragActive({ buttons: 0 }), false, '未按键时不能误判为拖动');
});

test('p10 拖动中的帧不会叠加释放惯性，边缘触发只在有效垂直带生效', () => {
  const helper = readFunction(pointer, 'tickVoxelPointerDragState');
  const context = {
    VOX_POINTER_DAMPING: 0.90,
    clampRange: (v, min, max) => Math.max(min, Math.min(max, v)),
  };
  vm.runInNewContext(`${helper}; this.tickVoxelPointerDragState = tickVoxelPointerDragState;`, context);
  const state = { azimuth: 0, height: 10 };
  const velocity = { active: true, azimuthVelocity: 4, heightVelocity: 4 };
  context.tickVoxelPointerDragState(state, 1 / 60, 20, velocity);
  assert.equal(state.azimuth, 0, '拖动中不能让渲染帧重复积分');
  assert.equal(velocity.azimuthVelocity, 4, '拖动中不能衰减当前采样速度');

  const edge = readFunction(peekPanels, 'isPlaylistEdgeTrigger');
  const edgeContext = {
    performance: { now: () => 1 },
    PLAYLIST_EDGE_DWELL_MS: 600,
    secondaryPlaylistEdgeGuard: { enteredAt: 0, timer: null, x: 0, y: 0, H: 0 },
    resetSecondaryPlaylistEdgeGuard() {},
    isSecondaryLeftDisplaySeamGuardActive() { return false; },
    isVisualPointerDragActive() { return false; },
  };
  vm.runInNewContext(`${edge}; this.isPlaylistEdgeTrigger = isPlaylistEdgeTrigger;`, edgeContext);
  assert.equal(edgeContext.isPlaylistEdgeTrigger(0, 300, 800), false, '有效左边缘首次进入应等待');
  edgeContext.performance.now = () => 601;
  assert.equal(edgeContext.isPlaylistEdgeTrigger(0, 300, 800), true, '有效左边缘持续停留后必须触发');
  assert.equal(edgeContext.isPlaylistEdgeTrigger(0, 80, 800), false, '顶部控制区不能误触发歌单');
});
