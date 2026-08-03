'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('雨境水珠流速在整个滑落阶段保持由流速滑条控制', () => {
  const glass = read('public/js/modules/02-visual/19-rain-glass.js');

  assert.match(glass, /function rainGlassSlipDrag\(drop\)/);
  assert.match(glass, /var drag = rainGlassSlipDrag\(drop\);/);
  assert.doesNotMatch(glass, /var drag = 4\.2 \+ progress \* progress \* 12\.5;/);
  assert.match(glass, /rainGlassSlipAcceleration[\s\S]*rainGlassMotionSpeedFactor\(\)/);
  assert.match(glass, /rainGlassSlipMaxSpeed[\s\S]*rainGlassMotionSpeedFactor\(\)/);
});

test('封面背景鼠标视角绑定默认关闭，使用共享画布指针且只影响专辑背景层', () => {
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const html = read('public/index.html');
  const layout = read('public/js/modules/07-fx/09-console-workspace.js');
  const pointer = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
  const cover = read('public/js/modules/03-beat/05-cover-loading-crop.js');
  const css = read('public/css/index.css');

  assert.match(defaults, /albumBackgroundMouseBind:\s*false/);
  assert.match(html, /id="t-albumBackgroundMouseBind"[\s\S]*toggleFx\('albumBackgroundMouseBind'\)/);
  assert.match(layout, /fxConsoleItem\('t-albumBackgroundMouseBind', '封面鼠标视角'/);
  assert.match(pointer, /updateAlbumBackgroundMouseView\(mx, my\)/);
  assert.match(cover, /function updateAlbumBackgroundMouseView\(ndcX, ndcY\)/);
  assert.match(cover, /albumBackgroundMouseBind/);
  assert.match(cover, /getElementById\('album-bg'\)/);
  assert.match(cover, /getElementById\('album-bg-next'\)/);
  assert.doesNotMatch(cover, /getElementById\('custom-bg'\)/);
  assert.match(css, /--album-bg-mouse-x/);
  assert.match(css, /--album-bg-mouse-y/);
});
