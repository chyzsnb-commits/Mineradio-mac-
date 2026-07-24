'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('keeps the Beat playback storm and QQ CDN fixes', () => {
  const fallback = read('public/js/modules/05-playback/11-provider-fallback.js');
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const server = read('server.js');

  assert.match(playback, /isQQPlayback && !song\.vipRequired && await retryQQPlaybackWithCompatibleQuality/);
  assert.match(fallback, /PLAYBACK_SKIP_CASCADE_MAX = 8/);
  assert.match(fallback, /while \(stack\.children\.length > 4 && stack\.lastElementChild\) stack\.removeChild/);
  assert.match(server, /sawDefinite404/);
  assert.match(server, /probeRes\.status === 404 \|\| probeRes\.status === 403/);
  assert.match(server, /async function refreshQQMusicKey/);
  assert.match(server, /reader\.cancel\(\)/);
});

test('keeps timed equal-power crossfade with memory protection', () => {
  const state = read('public/js/modules/00-state/00-core-stores.js');
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');

  assert.match(state, /AUDIO_CROSSFADE_MS = audioFadePreference\.crossfadeMs/);
  assert.match(playback, /function runCrossfadeEqualPower/);
  assert.match(playback, /Math\.cos\(t \* Math\.PI \* 0\.5\)/);
  assert.match(playback, /Math\.sin\(t \* Math\.PI \* 0\.5\)/);
  assert.match(playback, /reason === 'crossfade-timed'/);
  assert.match(playback, /CROSSFADE_MIN_FREE_MB = 1500/);
});

test('uses two-hand pinch midpoints without changing vertical shelf direction', () => {
  const gesture = read('public/js/modules/10-shell/00-gesture-control.js');

  assert.match(gesture, /pinchPt\.x = \(slot\.lm\[4\]\.x \+ slot\.lm\[8\]\.x\) \/ 2/);
  assert.match(gesture, /pinchPt\.y = \(slot\.lm\[4\]\.y \+ slot\.lm\[8\]\.y\) \/ 2/);
  assert.match(gesture, /present\[1\]\.pinchPt\.x - present\[0\]\.pinchPt\.x/);
  assert.match(gesture, /drawn\[0\]\.pinchPt\.x \* W/);
});

test('keeps custom-background voxel transparency without the deferred water preset', () => {
  const voxel = read('public/js/modules/02-visual/16-voxel-echo.js');
  const loader = read('public/js/index-loader.js');
  const state = read('public/js/modules/00-state/00-core-stores.js');
  const presets = read('public/js/modules/07-fx/00-preset-archive-data.js');

  assert.match(voxel, /uniform float uBgMedia/);
  assert.match(voxel, /material\.transparent !== !!_voxMedia/);
  assert.doesNotMatch(loader, /water-membrane/);
  assert.match(state, /MAX_VISUAL_PRESET_INDEX = 10/);
  assert.doesNotMatch(presets, /水膜共振/);
  assert.doesNotMatch(presets, /presetDisplayOrder = \[[^\]]*11/);
  assert.equal(fs.existsSync(path.join(root, 'public/js/modules/02-visual/18-water-membrane.js')), false);
});

test('does not expose gesture inference diagnostics in the load monitor', () => {
  const performancePanel = read('public/js/modules/07-fx/05-fx-panel-performance.js');

  assert.doesNotMatch(performancePanel, /gestureRow/);
  assert.doesNotMatch(performancePanel, /推理[^'"]*ms\s*@/);
});

test('rapid track switches use assigned src instead of stale currentSrc', () => {
  const controls = read('public/js/modules/05-playback/14-player-controls.js');

  assert.match(controls, /function mediaPlaybackTargetSrc\(media\)/);
  assert.match(controls, /media \? \(media\.src \|\| media\.currentSrc \|\| ''\) : ''/);
  assert.match(controls, /var seekSrc = mediaPlaybackTargetSrc\(seekMedia\)/);
  assert.doesNotMatch(controls, /var seekSrc = seekMedia\.currentSrc \|\| seekMedia\.src/);
});

test('successful playback keeps the visual style that was already selected', () => {
  const homeVisual = read('public/js/modules/05-playback/04-home-empty-wallpaper.js');
  const start = homeVisual.indexOf('function switchPlaybackVisualToEmily()');
  const end = homeVisual.indexOf('\n}', start);
  const fn = homeVisual.slice(start, end + 2);

  assert.match(fn, /deactivateHomeWallpaperPreview\(true\)/);
  assert.match(fn, /syncFxUniforms\(\)/);
  assert.doesNotMatch(fn, /targetPreset/);
  assert.doesNotMatch(fn, /setPreset\(/);
});
