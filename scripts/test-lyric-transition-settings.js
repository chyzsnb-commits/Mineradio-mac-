'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
const displayModes = read('public/js/modules/02-visual/08-lyrics-display-modes.js');
const controls = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
const persistence = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
const archive = read('public/js/modules/07-fx/00-preset-archive-data.js');
const html = read('public/index.html');
const rendering = read('public/js/modules/02-visual/14-stage-lyrics-rendering.js');

test('歌词切换动效默认原始切换，且完整进入持久化、DIY 与控制台', () => {
  assert.match(defaults, /lyricTransitionStyle:\s*'original'/, '默认必须是 PR #111 原始切换');
  assert.match(defaults, /lyricTransitionSpeed:\s*1(?:\.0)?/, '默认切换速度必须可预测');
  assert.match(displayModes, /STAGE_LYRIC_TRANSITION_STYLES\s*=\s*\{[^}]*original[^}]*crossfade[^}]*rise[^}]*slide[^}]*focus/s,
    '原始切换与新增动效都必须有稳定的内部枚举');
  assert.match(displayModes, /style\s*===\s*'quick'\)\s*style\s*=\s*'crossfade'/,
    '旧快速切换必须迁移为经典叠化');
  assert.match(displayModes, /style\s*===\s*'scale'\)\s*style\s*=\s*'focus'/,
    '旧柔和缩放必须迁移为镜头推进');
  assert.match(displayModes, /function lyricTransitionProfile\(/, '运行时必须有独立于持续歌词动画的切换配置');
  assert.match(controls, /function setLyricTransitionStyle\(/, '切换样式必须可以即时生效');
  assert.match(controls, /fx\.lyricTransitionExplicit\s*=\s*true/,
    '用户明确选择的动效必须标记为显式选择，避免历史自动保存覆盖启动默认值');
  assert.match(controls, /function setLyricTransitionSpeed\(/, '切换速度必须可以即时生效');
  assert.match(persistence, /lyricTransitionStyle:/, '自动保存必须包含切换样式');
  assert.match(persistence, /lyricTransitionExplicit:/, '自动保存必须区分用户选择与历史自动保存');
  assert.match(persistence, /lyricTransitionSpeed:/, '自动保存必须包含切换速度');
  assert.match(archive, /'lyricTransitionStyle'/, 'DIY 导出字段必须包含切换样式');
  assert.match(archive, /'lyricTransitionSpeed'/, 'DIY 导出字段必须包含切换速度');
  assert.match(archive, /lyricTransitionSpeed:\s*archiveNumber\(raw,\s*'lyricTransitionSpeed',\s*fxDefaults\.lyricTransitionSpeed,\s*0\.55,\s*1\.65\)/,
    'DIY 导入必须用既有 archiveNumber(raw, key, ...) 归一化速度，不能把值当作整个对象传入');
  assert.match(html, /id="lyric-transition-style-seg"/, '用户必须在歌词控制台直接看到动效选择');
  assert.match(html, /id="fx-lyrictransitionspeed"/, '用户必须在歌词控制台直接调整动效速度');
});

test('原始切换与交叉叠化均复用 PR #111 的时序与位移，其他动效才走新分支', () => {
  assert.match(displayModes, /if\s*\(style\s*===\s*'original'\s*\|\|\s*style\s*===\s*'crossfade'\)[\s\S]{0,260}enter:\s*motion\.enter[\s\S]{0,160}exit:\s*motion\.exit/,
    '原始切换与交叉叠化必须共用 PR #111 的歌词动画 enter/exit 时序');
  assert.match(rendering, /var lyricTransition\s*=\s*typeof lyricTransitionProfile === 'function' \? lyricTransitionProfile\(lyricMotion\)/,
    '渲染路径必须将现有歌词动画参数传给切换动效，而非用新的固定时长覆盖');
  assert.match(rendering, /if\s*\(\(transitionStyle\s*===\s*'original'\s*\|\|\s*transitionStyle\s*===\s*'crossfade'\)\s*&&\s*!lyricTransition\.reduced\)[\s\S]{0,420}var enterOffsetY\s*=\s*enterDir \* lineStepWorld \* \(1 - a\)/,
    '原始切换的 fallback entering 位移必须保持 PR #111 公式');
  assert.match(rendering, /if\s*\(\(exitTransition\.style\s*===\s*'original'\s*\|\|\s*exitTransition\.style\s*===\s*'crossfade'\)\s*&&\s*!exitTransition\.reduced\)[\s\S]{0,360}mesh\.position\.y \+= \(\(mesh\.userData\.exitStartY \+ exitDir \* lineStepWorld \* 1\.02 \* a \+ 0\.050 \* a\) - mesh\.position\.y\)/,
    '原始切换的 fallback outgoing 位移必须保持 PR #111 公式');
});
