'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/index.css'), 'utf8');
const controls = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/15-control-glass-animations.js'), 'utf8');
const shelf = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/05-card-interactions.js'), 'utf8');

test('底部控制条的每一个控制按钮都有即时功能说明', () => {
  const bottomBar = index.slice(index.indexOf('<div id="bottom-bar">'), index.indexOf('<input type="file" id="file-input"'));
  const buttons = bottomBar.match(/<button\b[^>]*class="[^"]*\bctrl-btn\b[^"]*"[^>]*>/g) || [];
  assert.equal(buttons.length, 15);
  buttons.forEach((button) => assert.match(button, /\bdata-control-tip="[^"]+"/, button));
  assert.match(controls, /function bindControlHelpTooltips\(\)/);
  assert.match(controls, /queueControlHelpTooltip\(btn,\s*260\)/);
  assert.match(controls, /btn\.removeAttribute\('title'\)/);
  assert.match(controls, /btn\.hasAttribute\('title'\)[\s\S]*btn\.removeAttribute\('title'\)/);
  assert.match(controls, /bindPlayerControlAnimations\(\)\s*\{\s*bindControlHelpTooltips\(\)/);
  assert.match(css, /\.control-help-tooltip\.visible/);
});

test('3D 歌单架采用中间档灵敏度并锁定原有上下方向', () => {
  assert.match(shelf, /SHELF_WHEEL_STEP\s*=\s*140/);
  assert.doesNotMatch(shelf, /SHELF_WHEEL_STEP\s*=\s*190/);
  const block = shelf.match(/var _shelfWheelAccum = 0;[\s\S]*?function shelfWheelDir\(e\) \{[\s\S]*?\n\}/);
  assert.ok(block, 'shelfWheelDir block');
  const context = {};
  vm.runInNewContext(`${block[0]}; this.shelfWheelDir = shelfWheelDir;`, context);
  assert.equal(context.shelfWheelDir({ deltaY: 70, deltaMode: 0 }), 0);
  assert.equal(context.shelfWheelDir({ deltaY: 70, deltaMode: 0 }), 1, '向下滑仍为 +1');
  assert.equal(context.shelfWheelDir({ deltaY: -140, deltaMode: 0 }), -1, '向上滑仍为 -1');
});
