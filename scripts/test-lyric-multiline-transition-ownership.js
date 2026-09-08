'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const rendering = read('public/js/modules/02-visual/14-stage-lyrics-rendering.js');
const rows = read('public/js/modules/02-visual/12-lyrics-row-layers.js');

test('多行转场把轨道滚动和动效拆分：外层稳定，只有焦点行获得局部效果', () => {
  assert.match(rendering, /function stageLyricUsesTrackLayout\(mesh\)/,
    '渲染器必须明确识别多行轨道，不能把单行 root 动画直接套给多行');
  assert.match(rendering, /var preserveTrackLayout\s*=\s*stageLyricUsesTrackLayout\(mesh\)\s*&&\s*transitionStyle\s*!==\s*'original'/,
    '新增动效的多行轨道必须保持 root 布局稳定');
  assert.match(rendering, /transition:\s*preserveTrackLayout\s*\?\s*\{[\s\S]{0,220}isOutgoing:\s*false[\s\S]{0,220}\}\s*:\s*null/,
    'incoming 多行必须把局部转场上下文交给行图层');
  assert.match(rendering, /transition:\s*trackOutgoingTransition\s*\?\s*\{[\s\S]{0,220}isOutgoing:\s*true[\s\S]{0,220}\}\s*:\s*null/,
    'outgoing 多行必须把局部离场上下文交给行图层');
  assert.match(rows, /function lyricRowTransitionTransform\(transition, isFocus, row\)/,
    '行图层必须只对焦点原文/译文应用多行转场，并允许译文使用独立相位');
  assert.match(rows, /if \(row && row\.isTranslation\) phase = clampRange\(\(phase - 0\.028\) \/ 0\.972, 0, 1\)/,
    '当前译文必须在焦点原文后错峰进入，不能同帧争抢同一条轨道');
  assert.match(rows, /var rowTransition\s*=\s*lyricRowTransitionTransform\(transition, motionAnchor, row\)/,
    '上下文行不能继承焦点行的 transform 或 blur');
  assert.match(rows, /transition\s*&&\s*row\.mat\.uniforms\.uTransitionBlur\)\s*row\.mat\.uniforms\.uTransitionBlur\.value\s*=\s*rowTransition\.transitionBlur/,
    '多行 blur 必须逐行归零，避免整组上下文一起模糊，也不能覆盖单行的既有 blur');
  assert.match(rows, /function primeLyricRowTransitionStart\(mesh, style, direction\)/,
    'incoming 多行必须在可见前预置焦点行的转场起始姿态');
  assert.match(rows, /transitionStart:\s*true/,
    '预置必须显式标记为不可见首帧落位，不能沿用播放帧的缓动系数');
  assert.match(rows, /var transitionStart\s*=\s*!!opts\.transitionStart/,
    '行布局必须识别首帧预置，避免把横向分层拆成两帧补算');
  assert.match(rows, /\*\s*\(transitionStart\s*\?\s*1\s*:\s*\(opts\.glitchPulse\s*\?\s*0\.48\s*:\s*0\.13\)\)/,
    '横向掠过的焦点原文预置必须直接落到起始位置；正常播放帧仍保留原平滑系数');
  assert.match(rows, /if \(transition && data\.usesTrack\) \{[\s\S]{0,520}row\.transitionScrollOffset/,
    '仅多行转场期间允许每行拥有独立的受限轨道跟随，避免与 root 滚动相互抢位');
  const primeIndex = rendering.indexOf('primeLyricRowTransitionStart(mesh, normalizeLyricTransitionStyle(fx && fx.lyricTransitionStyle), mesh.userData.enterDirection)');
  const opacityIndex = rendering.indexOf('primeLyricMeshOpacity(mesh, primeAmount)', Math.max(0, primeIndex));
  assert.ok(primeIndex >= 0 && opacityIndex > primeIndex,
    'incoming 焦点行的起始姿态必须在首个非零 opacity 前写入，不能在第一帧可见后跳变');
});
