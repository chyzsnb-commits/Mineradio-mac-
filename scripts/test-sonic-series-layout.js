const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/index.css'), 'utf8');
const presetGrid = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/04-preset-grid-uniforms.js'), 'utf8');
const lyricLayout = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/02-lyrics-state-layout.js'), 'utf8');
const lyricStage = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js'), 'utf8');
const lyricActions = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js'), 'utf8');
const pointerControls = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/00-pointer-cover-particles.js'), 'utf8');
const gestureControls = fs.readFileSync(path.join(root, 'public/js/modules/10-shell/00-gesture-control.js'), 'utf8');
const sonicWorkshop = fs.readFileSync(path.join(root, 'public/sonic-workshop-preset.js'), 'utf8');

function extractFunction(source, name) {
  const match = source.match(new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\s*\\}'));
  assert.ok(match, name + ' 需要可测试的独立函数');
  return match[0];
}

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{[\\s\\S]*?\\n\\}'));
  assert.ok(match, selector + ' 需要独立 CSS 规则');
  return match[0];
}

test('所有视觉预设卡固定同一尺寸，音域系列按钮压缩到卡片内', () => {
  const cardRule = cssBlock('.preset-card');
  const seriesRule = cssBlock('.preset-series-card');
  const optionsRule = cssBlock('.pc-series-options');
  const optionRule = cssBlock('.pc-series-option');
  assert.match(cardRule, /(?:^|\n)\s*height:\s*94px\b/, '普通预设卡需要固定高度');
  assert.match(cardRule, /box-sizing:\s*border-box/, '预设卡高度需要包含边框和内边距');
  assert.match(seriesRule, /(?:^|\n)\s*height:\s*94px\b/, '音域系列外卡必须与普通预设卡同高');
  assert.match(optionsRule, /grid-template-columns:\s*repeat\(3\s*,\s*minmax\(0,\s*1fr\)\)/, '三个音域版本需要横向压缩排列');
  assert.match(optionRule, /min-height:\s*36px\b/, '音域版本按钮需要使用更易读的固定高度');
  assert.match(optionRule, /height:\s*36px\b/, '三个音域版本按钮需要固定同高');
});

test('音域回响系列卡在桌面预设网格中与 emily 并列', () => {
  const cardRule = css.match(/\.preset-series-card\s*\{[\s\S]*?\n\}/);
  assert.ok(cardRule, '系列卡需要独立 CSS 规则');
  assert.match(cardRule[0], /grid-column:\s*auto\b/, '系列卡不能继续占满整行');
  assert.doesNotMatch(cardRule[0], /grid-column:\s*1\s*\/\s*-1/, '桌面系列卡不能固定为整行');
});

test('音域回响系列卡在窄面板自动回到整行且选项不溢出', () => {
  assert.match(css, /@media[^{]*\{[\s\S]*?\.preset-series-card\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/, '窄面板需要整行回退');
  assert.match(cssBlock('.pc-series-options'), /grid-template-columns:\s*repeat\(3/, '系列选项需要保留三选一结构');
});

test('切入音域回响后会主动唤醒已有歌词舞台但不强开用户关闭的歌词', () => {
  assert.match(lyricStage, /function\s+refreshVoxelLyricStageAfterPresetChange\s*\(/, '需要 p10 歌词唤醒函数');
  assert.match(presetGrid, /refreshVoxelLyricStageAfterPresetChange\s*\(/, '切换预设必须调用歌词唤醒函数');
  assert.match(lyricStage, /particleLyrics\s*===\s*false/, '歌词唤醒不能覆盖用户关闭状态');
});

test('歌词异步到达时会重新唤醒已切入的音域回响', () => {
  const helper = lyricStage.match(/function\s+refreshVoxelLyricStageAfterLyricsReady\s*\([\s\S]*?\n\}/);
  assert.ok(helper, '需要歌词就绪后的 p10 唤醒入口');
  const calls = [];
  const sandbox = {
    fx: { preset: 10, particleLyrics: true },
    VOXEL_PRESET_INDEX: 10,
    lyricsLines: [{ text: 'ready' }],
    refreshVoxelLyricStageAfterPresetChange(reason) {
      calls.push(reason);
      return true;
    }
  };
  vm.runInNewContext(helper[0], sandbox);
  assert.equal(sandbox.refreshVoxelLyricStageAfterLyricsReady('lyrics-ready'), true);
  assert.deepEqual(calls, ['lyrics-ready']);
  const applyBlock = lyricActions.match(/function\s+applyLyricsState\([\s\S]*?\n\}\nfunction\s+applyOriginalLyricsState/);
  assert.ok(applyBlock, '需要定位歌词状态应用入口');
  assert.match(applyBlock[0], /refreshVoxelLyricStageAfterLyricsReady\(['"]lyrics-ready['"]\)/, '歌词状态应用后必须通知 p10 唤醒');
  assert.match(applyBlock[0], /refreshSonicWorkshopLyricStageAfterLyricsReady\(['"]lyrics-ready['"]\)/, '歌词状态应用后必须通知 p13 唤醒');
});

test('第三个音域回响复用原舞台歌词，且不再创建独立文字层', () => {
  const workshopCanvasRule = css.match(/body\.sonic-workshop-active #canvas-container\s*\{[\s\S]*?\n\}/);
  assert.ok(workshopCanvasRule, '工坊预设需要独立处理主画布叠层');
  assert.match(workshopCanvasRule[0], /visibility:\s*visible/, '工坊预设不能再隐藏承载舞台歌词的主画布');
  assert.match(workshopCanvasRule[0], /mix-blend-mode:\s*screen/, '工坊画布需要以 screen 混合透出 iframe');
  assert.doesNotMatch(sonicWorkshop, /sonic-workshop-lyrics/, '工坊预设不能创建另一套 DOM 歌词');
  assert.match(lyricStage, /function\s+refreshSonicWorkshopLyricStageAfterPresetChange\s*\(/, '工坊预设需要唤醒原舞台歌词');
  assert.match(presetGrid, /refreshSonicWorkshopLyricStageAfterPresetChange\s*\(/, '切入工坊预设必须唤醒原舞台歌词');
});

test('两个音域回响预设以初始机位补偿歌词，滚轮变焦后歌词仍随画面缩放', () => {
  const helper = extractFunction(lyricLayout, 'stageLyricPresetScale');
  const sandbox = {};
  vm.runInNewContext(helper, sandbox);
  assert.equal(sandbox.stageLyricPresetScale(0, 10, 6.6), 1, '普通预设不应改变歌词比例');
  var initialScale = sandbox.stageLyricPresetScale(12, 10, 6.6, 10);
  assert.ok(Math.abs(initialScale - (10 / 6.6)) < 0.001, '音域地形初始字号需要按远景机位补偿');
  assert.equal(sandbox.stageLyricPresetScale(12, 15, 6.6, 10), initialScale, '拉远镜头时不能用实时距离抵消歌词缩小');
  assert.equal(sandbox.stageLyricPresetScale(13, 6.6, 6.6, 10), initialScale, '拉近镜头时不能用实时距离抵消歌词放大');
  assert.match(lyricStage, /stageLyricPresetScale\(fx\.preset,\s*stageLyricCameraDistance,\s*STAGE_LYRIC_REFERENCE_DISTANCE,\s*orbit\s*&&\s*orbit\.baselineRadius\)/, '歌词补偿必须读取预设初始机位');
});

test('音域回响·WE 将主相机的滚轮比例同步给 iframe 音柱', () => {
  const helper = extractFunction(sonicWorkshop, 'sonicWorkshopCameraDistanceForOrbit');
  const sandbox = {
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
  };
  vm.runInNewContext(helper, sandbox);
  assert.equal(sandbox.sonicWorkshopCameraDistanceForOrbit(10, 10, 80), 80, '初始机位应保持 WE 原始构图');
  assert.equal(sandbox.sonicWorkshopCameraDistanceForOrbit(10, 15, 80), 120, '主相机拉远时 WE 音柱应缩小');
  assert.equal(sandbox.sonicWorkshopCameraDistanceForOrbit(10, 5, 80), 40, '主相机拉近时 WE 音柱应放大');
  assert.match(sonicWorkshop, /pushProperties\(false,\s*ctx\)/, 'WE 每帧属性同步必须带入当前相机状态');
});

test('音域系列初始半径与滚轮下限一致，滚轮可以立即生效', () => {
  assert.match(presetGrid, /p === 12\)\{ orbit\.userRadius = 10\.0;[\s\S]*?orbit\.baselineRadius = 10\.0;/, '音域地形初始半径不能小于滚轮下限');
  assert.match(presetGrid, /p === 13\)\{ orbit\.userRadius = 10\.0;[\s\S]*?orbit\.baselineRadius = 10\.0;/, '音域回响·WE初始半径不能小于滚轮下限');
  assert.match(pointerControls, /orbit\.userRadius = Math\.max\(orbit\.minRadius, Math\.min\(orbit\.maxRadius, orbit\.userRadius \+ e\.deltaY \* 0\.005\)\)/, '两个音域预设必须继续使用全局滚轮相机缩放');
});

test('p12/p13 的滚轮范围必须允许在初始机位内外双向缩放', () => {
  assert.match(presetGrid, /if \(p === 10 \|\| p === 12 \|\| p === 13\) \{ orbit\.minRadius = 4\.0; orbit\.maxRadius = 180\.0; \}/, '音域预设不能把最小半径锁在初始半径 10，滚轮向上必须能放大');
});

test('p10 与普通预设共享同一个鼠标惯性阻尼常量', () => {
  assert.match(pointerControls, /var POINTER_ROTATION_DAMPING\s*=\s*0\.90/);
  assert.match(pointerControls, /var VOX_POINTER_DAMPING\s*=\s*POINTER_ROTATION_DAMPING/);
  assert.match(gestureControls, /var particleSpin\s*=\s*\{[^}]*damping:\s*POINTER_ROTATION_DAMPING/);
});
