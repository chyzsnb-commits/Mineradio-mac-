'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('雨境复用预设索引 9，挂主循环频段，不另起 Canvas / 不引入水膜', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  const loader = read('public/js/index-loader.js');
  const mainLoop = read('public/js/modules/11-main-loop.js');
  const presets = read('public/js/modules/07-fx/00-preset-archive-data.js');
  const grid = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');
  const starRiver = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
  const persist = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
  const layout = read('public/js/modules/00-state/06-fx-runtime-layout.js');

  assert.match(rain, /RAIN_MOOD_PRESET_INDEX = 9/);
  assert.match(rain, /function rainMoodActive\(/);
  assert.match(rain, /function updateRainMood\(/);
  assert.match(rain, /function ensureRainMood\(/);
  assert.match(rain, /RAIN_MOOD_MAX_DROPS/);
  assert.match(rain, /freeList/);
  assert.match(rain, /typeof bass === 'number' \? bass/);
  assert.match(rain, /typeof mid === 'number' \? mid/);
  assert.match(rain, /typeof treble === 'number' \? treble/);
  assert.match(rain, /beatPulse/);
  assert.doesNotMatch(rain, /document\.createElement\(['"]canvas['"]\)/);
  assert.doesNotMatch(rain, /getContext\(['"]2d['"]\)/);
  assert.doesNotMatch(rain, /water-membrane|水膜/);

  assert.match(loader, /02-visual\/18-rain-mood\.js/);
  assert.doesNotMatch(loader, /water-membrane/);

  assert.match(mainLoop, /rainMoodActive/);
  assert.match(mainLoop, /updateRainMood\(dt\)/);
  assert.match(mainLoop, /hidePoints = skullPresetActive \|\| voxelActive \|\| rainActive/);

  assert.match(presets, /name: '雨境'/);
  assert.match(presets, /节奏雨丝/);
  assert.doesNotMatch(presets, /name: '声波走廊'/);
  assert.match(presets, /presetDisplayOrder = \[[^\]]*9/);
  assert.doesNotMatch(presets, /if \(savedPreset === 9\) savedPreset = 0/);

  assert.doesNotMatch(grid, /seen = \{ 9: true \}/);
  assert.match(grid, /p === 9\) \{ orbit\.userRadius = 7\.2/);

  assert.match(starRiver, /Number\(fx\.preset\) === 9\) return 0/);
  assert.match(starRiver, /rainMoodActive\(\)\) return 0/);

  assert.doesNotMatch(persist, /if \(savedPreset === 9\) savedPreset = 0/);
  assert.doesNotMatch(layout, /if \(savedPreset === 9\) savedPreset = 0/);
});

test('雨境不强制切换用户视觉，切走时清空雨滴', () => {
  const rain = read('public/js/modules/02-visual/18-rain-mood.js');
  assert.match(rain, /function setRainMoodVisible\(on\)/);
  assert.match(rain, /if \(!on\) rainMoodClearDrops\(rm\)/);
  assert.match(rain, /if \(rainMood && rainMood\.points && rainMood\.points\.visible\) setRainMoodVisible\(false\)/);
});
