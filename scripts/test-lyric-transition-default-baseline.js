'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const rendering = read('public/js/modules/02-visual/14-stage-lyrics-rendering.js');
const persistence = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
const archive = read('public/js/modules/07-fx/00-preset-archive-data.js');

function transitionTransform() {
  const match = rendering.match(/function lyricTransitionTransform\(style, phase, direction, isOutgoing\) \{[\s\S]*?\n\}/);
  assert.ok(match, '歌词转场必须保留可独立验证的 transform 函数');
  const context = { clampRange: (value, min, max) => Math.max(min, Math.min(max, value)) };
  vm.runInNewContext(match[0] + '; this.transform = lyricTransitionTransform;', context);
  return context.transform;
}

test('旧自动保存没有明确选择时必须回到 PR #111 原始切换', () => {
  assert.match(persistence, /function resolveSavedLyricTransition\(raw\)/,
    '启动恢复需要区分历史自动保存与用户明确选择');
  assert.match(persistence, /raw\.lyricTransitionExplicit\s*!==\s*true[\s\S]{0,180}return\s+fxDefaults\.lyricTransitionStyle/,
    '历史自动保存不得把测试期的新动效伪装为启动默认值');
  assert.match(read('public/js/modules/00-state/04-fx-defaults.js'), /lyricTransitionStyle:\s*'original'/,
    '没有用户选择时必须使用 PR #111 原始切换，而不是新增的交叉叠化');
  assert.match(persistence, /lyricTransitionExplicit:\s*fx\.lyricTransitionExplicit\s*===\s*true/,
    '用户明确选择的转场必须随自动保存持续保留');
  assert.match(archive, /lyricTransitionExplicit:\s*raw\.lyricTransitionExplicit\s*===\s*true/,
    '旧 DIY 存档缺少显式选择时必须保留原始默认，不得猜成某种新增动效');
});

test('原始切换完整保留 PR #111 的当前轨道复用路径', () => {
  assert.match(rendering,
    /function stageLyricUsesOriginalTransition\(\)[\s\S]{0,240}return\s+normalizeLyricTransitionStyle\(fx\s*&&\s*fx\.lyricTransitionStyle\)\s*===\s*'original'/,
    '必须有明确且可测试的 PR #111 原始路径开关');
  assert.match(rendering,
    /var crossfadeBoundary\s*=\s*!redrawOnly\s*&&\s*stageLyrics\.current\s*&&\s*!stageLyricUsesOriginalTransition\(\)\s*&&\s*stageLyricShouldCrossfadeBoundary\(stageLyrics\.current,\s*payload\);/,
    '只有用户选择新增转场时才允许不同轨道阻止 #111 的 mesh 复用');
  assert.match(rendering,
    /if\s*\(!crossfadeBoundary\s*&&\s*!redrawOnly\s*&&\s*stageLyrics\.current\s*&&\s*setLyricTrackTarget\(stageLyrics\.current,\s*payload\)\)/,
    '原始切换必须优先复用当前轨道 mesh，和 #111 一致');
});

test('新增转场只能在 PR #111 基线旁做克制的瞬时偏移', () => {
  const transform = transitionTransform();
  const rise = transform('rise', 0, 1, false);
  const slide = transform('slide', 0, 1, false);
  const focus = transform('focus', 0, 1, false);
  const settled = transform('slide', 1, 1, false);

  assert.ok(Math.abs(rise.y) <= 0.16, '上浮淡入不能用大幅纵向位移替换经典基线');
  assert.ok(rise.transitionBlur <= 0.10, '上浮淡入的起始失焦必须轻微');
  assert.ok(Math.abs(slide.x) <= 0.18, '分层掠过不能横跨歌词舞台');
  assert.ok(Math.abs(slide.rotationZ) <= 0.012, '分层掠过不能产生可感知歪斜');
  assert.ok(slide.transitionBlur <= 0.10, '分层掠过的失焦必须轻微');
  assert.ok(focus.scale <= 1.03, '镜头推进不能额外放大到破坏歌词比例');
  assert.ok(focus.transitionBlur <= 0.12, '镜头推进不能使用重模糊遮盖转场');
  for (const [key, value] of Object.entries({ x: 0, y: 0, z: 0, scale: 1, rotationZ: 0, transitionBlur: 0 })) {
    assert.equal(settled[key], value, '结束帧 ' + key + ' 必须回到 PR #111 基线');
  }
});
