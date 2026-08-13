'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('registers 词境穿行 as a separate preset without reviving retired visuals', () => {
  const state = read('public/js/modules/00-state/00-core-stores.js');
  const presets = read('public/js/modules/07-fx/00-preset-archive-data.js');
  const controls = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');

  assert.match(state, /MAX_VISUAL_PRESET_INDEX = 11/);
  assert.match(presets, /name: '词境穿行'/);
  assert.match(presets, /desc: '景深歌词 · 封面漫游'/);
  assert.match(presets, /presetDisplayOrder = \[[^\]]*11/);
  assert.doesNotMatch(presets, /水膜共振/);
  assert.match(controls, /p === 11/);
  assert.match(controls, /orbit\.userRadius = 7\.2/);
});

test('uses a bounded camera-space lyric theatre with shared cover and audio state', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');

  assert.match(module, /LYRIC_DEPTH_PRESET_INDEX = 11/);
  assert.match(module, /LYRIC_DEPTH_CARD_COUNT = 5/);
  assert.match(module, /LYRIC_DEPTH_STAR_MAX = 180/);
  assert.match(module, /new THREE\.Points/);
  assert.match(module, /new THREE\.CanvasTexture/);
  assert.match(module, /coverTex/);
  assert.match(module, /lyricsLines/);
  assert.match(module, /runtimePerfBudgetLevel\(\)/);
  assert.match(module, /setDrawRange\(0, starCount\)/);
  assert.match(module, /stageLyrics\.group\.visible = false/);
  assert.match(module, /stageLyrics\.group\.visible = true/);
  assert.doesNotMatch(module, /requestAnimationFrame/);
  assert.doesNotMatch(module, /setInterval/);
  assert.doesNotMatch(module, /getByteFrequencyData/);
  assert.doesNotMatch(module, /createAnalyser/);
  assert.doesNotMatch(module, /fetch\s*\(/);
});

test('loads and updates the lyric theatre inside the existing single render loop', () => {
  const loader = read('public/js/index-loader.js');
  const loop = read('public/js/modules/11-main-loop.js');
  const modulePath = 'js/modules/02-visual/18-lyric-depth-flight.js';

  assert.ok(loader.indexOf(modulePath) > loader.indexOf('js/modules/02-visual/16-voxel-echo.js'));
  assert.ok(loader.indexOf(modulePath) < loader.indexOf('js/modules/11-main-loop.js'));
  assert.match(loop, /var lyricDepthPresetActive = typeof lyricDepthFlightActive === 'function' && lyricDepthFlightActive\(\)/);
  assert.match(loop, /hidePoints = skullPresetActive \|\| voxelActive \|\| lyricDepthPresetActive/);
  assert.match(loop, /updateLyricDepthFlight\(dt\)/);
  assert.equal((loop.match(/renderMainSceneWithGpuSample\(scene, camera\)/g) || []).length, 1);
});

