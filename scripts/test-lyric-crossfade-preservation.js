'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const rendering = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js'), 'utf8');

test('仅用户选择的新增转场在跨句时保留 outgoing 与 incoming，原始模式复用 PR #111 轨道', () => {
  assert.match(rendering, /function stageLyricShouldCrossfadeBoundary\(/,
    '需要明确区分同句进度刷新和跨句边界，不能把跨句当成原地滚动');
  assert.match(rendering, /var crossfadeBoundary\s*=\s*!redrawOnly\s*&&\s*stageLyrics\.current\s*&&\s*!stageLyricUsesOriginalTransition\(\)\s*&&\s*stageLyricShouldCrossfadeBoundary\(stageLyrics\.current,\s*payload\);/,
    '原始模式必须保留 #111 的轨道复用；仅新增转场计算跨句边界');
  assert.match(rendering, /if\s*\(\s*!crossfadeBoundary\s*&&\s*!redrawOnly\s*&&\s*stageLyrics\.current\s*&&\s*setLyricTrackTarget\(stageLyrics\.current,\s*payload\)\s*\)/,
    '原始模式与同句刷新允许复用当前 mesh；新增转场跨句才创建 incoming mesh');
  assert.match(rendering, /stageLyrics\.current\.userData\.state\s*=\s*'out';[\s\S]{0,260}stageLyrics\.outgoing\.push\(stageLyrics\.current\)/,
    '跨句时前一句必须进入 outgoing 队列，交给既有 opacity 曲线逐帧淡出');
  assert.match(rendering, /if\s*\(crossfadeBoundary\s*&&\s*options\.noSyncBuild\)[\s\S]{0,160}requestStageLyricDemandPrewarm\(payload\)[\s\S]{0,100}return false/,
    '跨句未命中预热时必须等待 incoming mesh，不能在播放热路径同步栅格化');
  assert.match(rendering, /scheduleStageLyricPrewarmForIndex\(nextIndex,\s*'track-demand-light',\s*stageLyricCrossfadePrewarmDelay\(\)\)/,
    '显示当前句后必须主动预热相邻句，且不能挤进正在进行的交叉动画');
});
