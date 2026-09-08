'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('自动质量不因已失效的像素缩放状态把前台动画降到 45 或 30 FPS', () => {
  const power = read('public/js/modules/00-state/08-desktop-render-power.js');
  const mainLoop = read('public/js/modules/11-main-loop.js');

  assert.doesNotMatch(power, /scaleMul/, '用户禁止自动缩放后，治理器不应再维护无效 scaleMul 状态');
  assert.doesNotMatch(power, /fgFps/, '自动档不得维护 60\/45\/30 的隐藏前景降帧状态');
  assert.doesNotMatch(mainLoop, /autoGovForegroundFps/, '主循环不能向自动治理器索取隐藏的前景帧率上限');
  assert.match(mainLoop, /if \(quality === 'eco'\) return 30;/, '用户显式 eco 档仍可主动选择 30 FPS 节能');
  assert.match(mainLoop, /if \(quality !== 'auto'\) return 0;/, '非 eco 档不得被自动治理器限帧');
  assert.match(mainLoop, /if \(quality !== 'auto'\) return 0;\s*return 0;\s*}/, 'auto 档必须保持显示器 VSync，不产生 45\/30 FPS 的隐式卡顿');
});
