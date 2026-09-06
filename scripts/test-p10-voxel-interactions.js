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
const focusCinema = fs.readFileSync(path.join(root, 'public/js/modules/01-scene/03-focus-cinema-camera.js'), 'utf8');
const skullBackcover = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/01-float-skull-backcover.js'), 'utf8');

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

test('p10 右键必须复用 Win 的统一歌架状态机', () => {
  assert.doesNotMatch(shelfInteractions, /function toggleSideShelfFromContextMenu\(/);
  assert.match(shelfInteractions, /if \(isPointerOverUi\(e\)\) return;/);
  assert.match(shelfInteractions, /markRenderInteraction\('shelf-context', 1200\)/, '右键必须唤醒空闲渲染，才能在 P10 立即绘制一级歌架');
  assert.match(shelfInteractions, /var shouldOpen = shelfHardHidden \|\| !shelfPinnedOpen/);
  assert.match(shelfInteractions, /if \(shouldOpen\)\s*\{\s*shelfHardHidden = false/);
  assert.doesNotMatch(shelfInteractions, /shelfManager\.rebuild\(false\)/);
  assert.match(shelfInteractions, /setShelfPinnedOpen\(shouldOpen, true\)/);
  assert.doesNotMatch(shelfInteractions, /openCenteredShelfContentForContextMenu/);
  assert.doesNotMatch(shelfInteractions, /requestCenteredShelfContentForContextMenu/);
  assert.match(shelfLayoutHover, /setFocusZone\(shelfPinnedOpen \? 'shelf-side' : null, immediate\)/);
});

test('右键唤起歌架前必须清除悬停选中，避免 p10 以抬升卡片进入错误位置', () => {
  assert.match(
    shelfInteractions,
    /if \(shouldOpen\)\s*\{[\s\S]*?shelfManager\.clearSelected\(\)[\s\S]*?setShelfPinnedOpen\(shouldOpen, true\)/
  );
});

test('p10 歌架根节点必须与焦点相机方位同向旋转', () => {
  assert.match(shelfManager, /var shelfFrameYaw[\s\S]*voxelShelfFocusFrameYaw\(\)/);
  assert.match(shelfManager, /shelfFrameYaw \+ clampRange\(particles\.rotation\.y/);
  assert.match(shelfManager, /shelfFrameYaw \+ px \* 0\.018/);
});

test('p10 一级歌架与其他预设共用同一布局与屏幕姿态', () => {
  assert.match(voxel, /function voxelShelfFocusFrameYaw\(/);
  assert.doesNotMatch(shelfLayoutHover, /function p10ShelfSideLayout\(/, 'P10 不得再改编布局, 必须与普通预设 1:1');
  assert.doesNotMatch(shelfManager, /p10ShelfSideLayout\(/, 'P10 不得再把布局缩进体素比例');
  assert.doesNotMatch(shelfManager, /voxelShelfWorldScale|p10ShelfScale/, 'P10 歌架不得再按体素世界比例放大');
  assert.doesNotMatch(voxel, /voxelShelfWorldScale/, '体素世界比例函数已随歌架同步下线');
  assert.match(shelfManager, /var frameLayout = shelfLayoutProfile\(\)/);
  assert.match(shelfManager, /var p10FocusMix = 0/, 'P10 必须维护常驻/呼出位姿混合系数');
  assert.match(shelfManager, /p10FocusWanted = !!\(typeof orbit !== 'undefined' && orbit && orbit\.focus && orbit\.focus\.active && \/\^shelf-\//, 'P10 必须跟随电影镜头的 focus 状态切换位姿');
  assert.match(shelfManager, /var p10Anchor = p10ShelfCameraAnchor\(camera, p10FocusMix\)/, 'P10 常驻与呼出共用锚点函数, 只过渡位姿');
  assert.match(shelfManager, /var p10RootPose = p10ShelfRootPose\(p10FocusMix\)/, 'P10 常驻与呼出共用朝向函数, 不得再传入鼠标指针');
  assert.match(shelfManager, /p10RootPoseQuatB\.copy\(camera\.quaternion\)\.multiply\(p10RootPoseQuatA\)/, 'P10 朝向必须由相机四元数合成, 才能与其他预设同姿态');
  assert.match(shelfManager, /var p10AnchorActive = !p10WorldFallback && !!p10Anchor/, '锚点激活不再限于 P10: 全预设(横屏)共用同一相机相对锚点');
  assert.match(shelfManager, /var p10WorldFallback = !p10ShelfActive && typeof shelfLayoutProfile === 'function' && !!shelfLayoutProfile\(\)\.portrait/, '只有竖屏窄窗回退世界摆位, 横屏全预设锚定');
  assert.match(shelfManager, /if \(p10AnchorActive\)[\s\S]*else if \(bindToCover\)/, '锚定激活时朝向必须由相机四元数驱动, 不得落到封面跟随分支');
  assert.match(shelfManager, /onCoverChange:[\s\S]*p10WorldFallbackOnCover && /, '换封面旋转只在竖屏世界摆位下生效, 锚定预设不得被瞬间套用封面旋转');

  const rootPose = readFunction(shelfLayoutHover, 'p10ShelfRootPose');
  const poseMix = readFunction(shelfLayoutHover, 'p10ShelfPoseMix');
  const restPose = shelfLayoutHover.match(/var P10_SHELF_POSE_REST = \{[^}]*\}/)[0];
  const focusPose = shelfLayoutHover.match(/var P10_SHELF_POSE_FOCUS = \{[^}]*\}/)[0];
  const context = { clampRange: (v, min, max) => Math.max(min, Math.min(max, v)) };
  vm.runInNewContext(`${restPose}; ${focusPose}; ${poseMix}; ${rootPose}; this.p10ShelfRootPose = p10ShelfRootPose; this.p10ShelfPoseMix = p10ShelfPoseMix;`, context);
  const rest = context.p10ShelfRootPose(0);
  assert.ok(Math.abs(rest.x - 0.084) < 0.005 && Math.abs(rest.y) < 0.005 && rest.z === 0, '常驻基础角必须是普通预设常驻机位朝向的逆(0.084, 0, 0), 保证贴右缘');
  const focus = context.p10ShelfRootPose(1);
  assert.ok(Math.abs(focus.x + 0.12) < 0.005 && Math.abs(focus.y + 0.42) < 0.005, '呼出基础角必须是普通预设呼出机位朝向的逆(-0.12, -0.42)');
  assert.doesNotMatch(rootPose, /pointer|0\.018|0\.010/, '歌单架朝向不得混入鼠标指针视差: 歌单固定, 能转动的只有场景本体');
  const half = context.p10ShelfPoseMix(0.5);
  assert.ok(Math.abs(half.d - (6.553 + 5.804) / 2) < 1e-9 && Math.abs(half.r - -0.9125 < 1e-9), '常驻/呼出两套位姿必须按混合系数线性过渡');

  const mainLoop = fs.readFileSync(path.join(root, 'public/js/modules/11-main-loop.js'), 'utf8');
  assert.match(shelfManager, /applySideShelfRootPose\(dt\);\n/, 'update() 里必须经 applySideShelfRootPose 应用整组位姿');
  assert.match(shelfManager, /syncCameraAnchor: function \(\) \{[\s\S]*?applySideShelfRootPose\(0, true\)/, '必须暴露 syncCameraAnchor 供相机定稿后二次锚定');
  assert.match(shelfManager, /var p10Transitioning = Math\.abs\(p10FocusMix[\s\S]*?if \(p10Transitioning\) \{\n          if \(!lateFrame\) group\.quaternion\.slerp\(p10RootPoseQuatB, 0\.12\);\n        \} else \{\n          group\.quaternion\.copy\(p10RootPoseQuatB\);/, '姿态稳定期必须锁死四元数, 只在呼出过渡期保留 slerp 缓动, 拖拽不得残留橡皮筋追赶');
  const afterVoxel = mainLoop.indexOf('updateVoxelCity(dt)');
  const anchorCall = mainLoop.indexOf('shelfManager.syncCameraAnchor()');
  const renderCall = mainLoop.lastIndexOf('renderMainSceneWithGpuSample(scene, camera)');
  assert.ok(afterVoxel > -1 && anchorCall > afterVoxel, '二次锚定必须发生在体素机位写入之后');
  assert.ok(renderCall > anchorCall, '渲染必须在二次锚定之后, 歌单才能零滞后贴住相机');
});

test('全预设歌单架统一: 壁纸/安魂不再有专用呼出机位, 安魂相机在呼出期间让位', () => {
  assert.match(focusCinema, /function shouldUseWallpaperSafeShelfCamera\(\) \{[\s\S]*?return false;/, '壁纸预设不得再走专用浅推近机位');
  assert.match(focusCinema, /function shouldDimWallpaperForShelf\(\) \{[\s\S]*?Number\(fx\.preset\) === 5/, '壁纸压暗行为保留, 不得因机位统一而丢失');
  const skullPose = readFunction(skullBackcover, 'applySkullCameraPose');
  assert.match(skullPose, /orbit\.focus && orbit\.focus\.active && \/\^shelf-\//, '安魂相机必须在歌单架呼出时让位给标准电影镜头');
  assert.match(skullPose, /skullCameraResume = 0/, '让位时必须清零恢复斜坡');
  assert.match(skullPose, /skullCameraResume \+= \(1 - skullCameraResume\)/, '呼出结束后按斜坡平滑接管, 不得硬切');
  assert.match(skullPose, /camera\.position\.lerp\(skullCameraTargetPos, poseBlend\)/, '接管强度必须乘恢复斜坡');
  assert.match(skullBackcover, /var skullCameraResume = 1/, '恢复斜坡默认值必须是 1, 不影响无呼出的日常帧');
});

test('p10 一级卡使用带上限的冷色玻璃表面，不直接拿用户背景透明度绘制纯黑', () => {
  assert.match(shelfLayoutHover, /function p10ShelfCardSurface\(/);
  assert.match(shelfManager, /var cardSurface = p10ShelfCardSurface\(shelfLook\)/);
  assert.match(shelfManager, /ctx\.fillStyle = cardSurface \? cardSurface\.base/);
  assert.match(shelfManager, /if \(cardSurface\) \{ ctx\.fillStyle = cardSurface\.highlight/);
  assert.match(shelfManager, /p10Surface \? p10Surface\.key : ''/, '切入或切出 P10 时必须重绘卡面');
  assert.doesNotMatch(
    shelfManager,
    /ctx\.fillStyle = 'rgba\(0,0,0,' \+ shelfLook\.bgOpacity\.toFixed\(3\) \+ '\)'\s*;\s*ctx\.fill\(\)/,
    '一级卡不得直接以高不透明纯黑作为最终卡面'
  );
});

test('拖拽状态机防卡死: 松手事件丢失时用按钮状态兜底, up/cancel 挂 window', () => {
  assert.match(pointer, /if \(!_voxDrag\.active\) return;\n  if \(!\(e\.buttons & 1\)\) \{ _voxDragEnd\(e\); return; \}/, '体素拖拽中左键已松开必须立即结束, 不得等可能丢失的 pointerup');
  assert.match(pointer, /window\.addEventListener\('pointerup', _voxDragEnd\)/, 'pointerup 必须挂 window, 松手落在歌单详情等悬浮层上也要能收到');
  assert.match(pointer, /window\.addEventListener\('pointercancel', _voxDragEnd\)/, 'pointercancel 必须挂 window');
  assert.doesNotMatch(pointer, /renderer\.domElement\.addEventListener\('pointerup', _voxDragEnd\)/, '不得再只挂 canvas: 松手在悬浮层上会把 _voxDrag 卡成 true, 之后鼠标到哪转到哪');
  assert.match(pointer, /if \(orbit\.rotating && !\(e\.buttons & 1\)\)/, '封面旋转拖拽同样需要按钮状态兜底, 防止无按键继续转');
});

test('p10 一级卡面在正常歌架状态必须保持可读的玻璃底色', () => {
  const surface = readFunction(shelfLayoutHover, 'p10ShelfCardSurface');
  const context = {
    voxelCityActive: () => true,
    stageLyrics: { palette: { secondary: '#4f9fc4' } },
    hexToRgb: (value) => {
      const match = String(value).match(/^#([0-9a-f]{6})$/i);
      return match ? {
        r: parseInt(match[1].slice(0, 2), 16),
        g: parseInt(match[1].slice(2, 4), 16),
        b: parseInt(match[1].slice(4, 6), 16)
      } : null;
    },
    clampRange: (value, min, max) => Math.max(min, Math.min(max, value))
  };
  vm.runInNewContext(`${surface}; this.p10ShelfCardSurface = p10ShelfCardSurface;`, context);
  const result = context.p10ShelfCardSurface({ bgOpacity: 0.90 });
  assert.ok(result && result.base, 'P10 一级卡必须返回玻璃底色');
  const rgba = result.base.match(/^rgba\((\d+),(\d+),(\d+),([0-9.]+)\)$/);
  assert.ok(rgba, 'P10 卡面底色必须是可检查的 rgba');
  const [, r, g, b, alpha] = rgba.map(Number);
  assert.ok(r >= 24 && g >= 40 && b >= 60, '一级卡面不能接近纯黑，必须保留可见冷色玻璃层');
  assert.ok(alpha >= 0.42 && alpha <= 0.58, '一级卡面透明度必须在可读范围内');
});

test('p10 一级歌架锚在与普通预设相同的相机相对位姿', () => {
  assert.match(shelfLayoutHover, /function p10ShelfCameraAnchor\(/);
  assert.match(shelfManager, /var p10Anchor = p10ShelfCameraAnchor\(camera, p10FocusMix\)/);
  assert.match(shelfManager, /group\.position\.set\(p10Anchor\.x, p10Anchor\.y, p10Anchor\.z\)/);

  const anchor = readFunction(shelfLayoutHover, 'p10ShelfCameraAnchor');
  const poseMix = readFunction(shelfLayoutHover, 'p10ShelfPoseMix');
  const restPose = shelfLayoutHover.match(/var P10_SHELF_POSE_REST = \{[^}]*\}/)[0];
  const focusPose = shelfLayoutHover.match(/var P10_SHELF_POSE_FOCUS = \{[^}]*\}/)[0];
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    applyQuaternion() { return this; }
  }
  const context = { THREE: { Vector3 }, clampRange: (v, min, max) => Math.max(min, Math.min(max, v)) };
  vm.runInNewContext(`${restPose}; ${focusPose}; ${poseMix}; ${anchor}; this.p10ShelfCameraAnchor = p10ShelfCameraAnchor;`, context);
  const camera = {
    position: { x: 10, y: 20, z: 30 },
    quaternion: {},
    getWorldDirection(vector) { return vector.set(0, 0, -1); }
  };
  const restAnchor = context.p10ShelfCameraAnchor(camera, 0);
  assert.ok(restAnchor, 'p10 可用相机必须给一级歌架提供锚点');
  // 常驻常数 = 普通预设常驻机位组原点的相机相对位姿(前 6.553 / 右 0 / 上 0, 实测)
  assert.ok(Math.abs(restAnchor.x - camera.position.x) < 0.01, '常驻锚点必须横向对齐普通预设常驻机位');
  assert.ok(Math.abs(restAnchor.y - camera.position.y) < 0.01, '常驻锚点必须纵向对齐普通预设常驻机位');
  assert.ok(Math.abs(restAnchor.z - (camera.position.z - 6.553)) < 0.01, '常驻锚点必须落在相机前方与普通预设相同的深度');
  const focusAnchor = context.p10ShelfCameraAnchor(camera, 1);
  // 呼出常数 = 普通预设呼出机位组原点的相机相对位姿(前 5.804 / 右 -1.825 / 上 -0.093, 实测)
  assert.ok(Math.abs(focusAnchor.x - (camera.position.x - 1.825)) < 0.01, '呼出锚点右移量必须等于普通预设呼出机位');
  assert.ok(Math.abs(focusAnchor.y - (camera.position.y - 0.093)) < 0.01, '呼出锚点抬升量必须等于普通预设呼出机位');
  assert.ok(Math.abs(focusAnchor.z - (camera.position.z - 5.804)) < 0.01, '呼出锚点必须落在相机前方与普通预设相同的深度');
  assert.equal(context.p10ShelfCameraAnchor(null, 0), null, '没有相机时不得生成错误世界坐标');
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

test('p10 交互边界仍尊重启动页、播放切换保护和空歌单', () => {
  assert.match(peekPanels, /if \(document\.body\.classList\.contains\('splash-active'\)\)/);
  assert.match(shelfInteractions, /shelfPlaybackSwitchGuardActive\(\)/);
  assert.match(shelfManager, /if \(!allItems\.length && !contentOpen\) targetVis = 0/);
  assert.match(shelfInteractions, /if \(document\.body\.classList\.contains\('splash-active'\)\) return/);
  assert.match(shelfInteractions, /shelfPlaybackSwitchGuardActive\(\)/);
});

test('左边缘歌单必须停留 300ms 后才触发，不能进入边缘即呼出', () => {
  assert.match(peekPanels, /var PLAYLIST_EDGE_DWELL_MS\s*=\s*300/);
  const edge = readFunction(peekPanels, 'isPlaylistEdgeTrigger');
  let now = 0;
  const context = {
    performance: { now: () => now },
    PLAYLIST_EDGE_DWELL_MS: 300,
    secondaryPlaylistEdgeGuard: { enteredAt: 0, timer: null, x: 0, y: 0, H: 0 },
    isVisualPointerDragActive: () => false,
    isSecondaryLeftDisplaySeamGuardActive: () => false,
    resetSecondaryPlaylistEdgeGuard() {},
  };
  vm.runInNewContext(`${edge}; this.isPlaylistEdgeTrigger = isPlaylistEdgeTrigger;`, context);
  now = 1;
  assert.equal(context.isPlaylistEdgeTrigger(0, 300, 800), false, '首次进入边缘不能立即呼出');
  now = 299;
  assert.equal(context.isPlaylistEdgeTrigger(0, 300, 800), false, '停留不足 300ms 不能呼出');
  now = 301;
  assert.equal(context.isPlaylistEdgeTrigger(0, 300, 800), true, '连续停留 300ms 后才允许呼出');
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
    PLAYLIST_EDGE_DWELL_MS: 300,
    secondaryPlaylistEdgeGuard: { enteredAt: 0, timer: null, x: 0, y: 0, H: 0 },
    resetSecondaryPlaylistEdgeGuard() {},
    isSecondaryLeftDisplaySeamGuardActive() { return false; },
    isVisualPointerDragActive() { return false; },
  };
  vm.runInNewContext(`${edge}; this.isPlaylistEdgeTrigger = isPlaylistEdgeTrigger;`, edgeContext);
  assert.equal(edgeContext.isPlaylistEdgeTrigger(0, 300, 800), false, '有效左边缘首次进入应等待');
  edgeContext.performance.now = () => 301;
  assert.equal(edgeContext.isPlaylistEdgeTrigger(0, 300, 800), true, '有效左边缘持续停留后必须触发');
  assert.equal(edgeContext.isPlaylistEdgeTrigger(0, 80, 800), false, '顶部控制区不能误触发歌单');
});
