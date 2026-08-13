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
  assert.match(module, /transitionProgress/);
  assert.match(module, /transitionDuration: 0\.82/);
  assert.match(module, /旧句继续越过焦平面朝镜头滑行/);
  assert.match(module, /新句整组从封面后方\/深处推到焦面/);
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
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');
  const modulePath = 'js/modules/02-visual/18-lyric-depth-flight.js';

  assert.ok(loader.indexOf(modulePath) > loader.indexOf('js/modules/02-visual/16-voxel-echo.js'));
  assert.ok(loader.indexOf(modulePath) < loader.indexOf('js/modules/11-main-loop.js'));
  assert.match(loop, /var lyricDepthPresetActive = typeof lyricDepthFlightActive === 'function' && lyricDepthFlightActive\(\)/);
  assert.match(loop, /hidePoints = skullPresetActive \|\| voxelActive \|\| lyricDepthPresetActive/);
  assert.match(loop, /updateLyricDepthFlight\(dt\)/);
  assert.doesNotMatch(module, /renderMainSceneWithGpuSample|renderer\.render/);
});

test('matches 音域回响 playlist behaviour instead of drawing a second 3D shelf', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');
  const voxel = read('public/js/modules/02-visual/16-voxel-echo.js');
  const manager = read('public/js/modules/04-shelf/01-manager-core.js');
  const interactions = read('public/js/modules/04-shelf/05-card-interactions.js');
  const controls = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
  const css = read('public/css/index.css');

  assert.match(module, /function lyricDepthSuppressesThreeDimensionalShelf\(\)/);
  assert.match(module, /safeShelfCloseContent\('lyric-depth-preset'\)/);
  assert.doesNotMatch(module, /setShelfPinnedOpen\(/);
  assert.match(module, /lyricDepthDockPlaylist\(true\)/);
  assert.match(module, /lyricDepthDockPlaylist\(false\)/);
  assert.match(voxel, /var _visualPlaylistDockState = \{ owner: '', home: null \}/);
  assert.match(voxel, /function _dockVisualPlaylist\(owner, host, dock\)/);
  assert.match(voxel, /_visualPlaylistDockState\.owner !== owner/);
  assert.match(voxel, /function _visualPlaylistDesiredOwner\(\)/);
  assert.match(voxel, /pendingOwner && pendingOwner !== owner/);
  assert.match(voxel, /_dockVisualPlaylist\('voxel', host, true\)/);
  assert.match(voxel, /_dockVisualPlaylist\('voxel', null, false\)/);
  assert.match(module, /_dockVisualPlaylist\('lyric-depth', host, true\)/);
  assert.match(module, /_dockVisualPlaylist\('lyric-depth', null, false\)/);
  assert.doesNotMatch(voxel, /_voxPlaylistHome/);
  assert.doesNotMatch(module, /lyricDepthPlaylistHome/);
  assert.match(manager, /lyricDepthSuppressesThreeDimensionalShelf/);
  assert.match(interactions, /lyricDepthSuppressesThreeDimensionalShelf/);
  assert.match(controls, /lyricDepthSuppressesThreeDimensionalShelf/);
  assert.match(css, /lyric-depth-playlist-host/);
  assert.match(css, /body:not\(\.vox-on\):not\(\.lyric-depth-on\)/);
  assert.doesNotMatch(css, /body\.lyric-depth-on \[data-fx-page="playlist"\][^{]*\{display:block/);
});

test('obeys the lyric toggle and does not reuse a stale cover', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');
  const coverLoader = read('public/js/modules/03-beat/05-cover-loading-crop.js');
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');

  assert.match(module, /fx\.particleLyrics !== false/);
  assert.match(module, /lyricsVisible \? shelfFactor \* trackLyricFactor : 0/);
  assert.match(module, /uniforms\.uHasCover\.value > 0\.5/);
  assert.match(module, /hasCover \? 0\.58 \* shelfFactor \* trackOpacity : 0/);
  assert.match(playback, /clearWhenMissing: !\(customCover \|\| song\.cover\)/);
  assert.match(coverLoader, /if \(opts\.clearWhenMissing\) preserveOnSwitch = false/);
});

test('moves the outgoing lyric continuously through the focal plane', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');

  assert.match(module, /card\.exitOriginZ = null;[\s\S]*card\.texture = lyricDepthCreateTextTexture/);
  assert.match(module, /card\.exitOriginZ = card\.mesh\.position\.z/);
  assert.match(module, /Number\.isFinite\(card\.exitOriginZ\)/);
  assert.match(module, /z = exitOriginZ \+ exitEase \* 2\.48/);
  assert.doesNotMatch(module, /z = -\d+(?:\.\d+)? \+ exitEase \* 2\.48/);
});

test('limits progress scrubbing to one current lyric texture', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');

  assert.match(module, /progressDragState && progressDragState\.active/);
  assert.match(module, /lyricDepthState\.deferredCenterIndex = centerIndex/);
  assert.match(module, /now - lyricDepthState\.lastSeekTextureAt < 90/);
  assert.match(module, /seekPreviewIndex/);
  assert.match(module, /lyricDepthSetCardRelative\(current, 0\)/);
  assert.match(module, /if \(!dragging\)[\s\S]*lyricDepthSyncCards\(centerIndex\)/);
});

test('reproduces the reference cover-only pointer tilt without moving lyrics', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');
  const pointer = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
  const css = read('public/css/index.css');

  assert.match(module, /function lyricDepthHandlePointerMove\(event\)/);
  assert.match(module, /raycaster\.intersectObject\(cover, false\)/);
  assert.match(module, /hover\.targetScale = 1\.08/);
  assert.match(module, /hover\.targetRotX/);
  assert.match(module, /hover\.targetRotY/);
  assert.match(pointer, /lyricDepthHandlePointerMove/);
  assert.match(pointer, /lyricDepthHandlePointerLeave/);
  assert.match(css, /body\.lyric-depth-on/);
  assert.doesNotMatch(module, /lyricHover|lyricPointerRepel/);
});

test('consumes live lyric font size translation and karaoke controls', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');
  const controls = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');

  assert.match(module, /lyricFontCss\(/);
  assert.match(module, /lyricMeasureText\(/);
  assert.match(module, /lyricFillText\(/);
  assert.match(module, /lyricRasterStyleKey\(\)/);
  assert.match(module, /lyricTranslationScaleValue\(\)/);
  assert.match(module, /lyricTranslationOpacityValue\(\)/);
  assert.match(module, /fx\.lyricScale/);
  assert.match(module, /uProgress/);
  assert.match(module, /uKaraokeEnabled/);
  assert.match(module, /primaryMask/);
  assert.match(module, /rgba\(255,0,0,/);
  assert.match(module, /rgba\(0,255,0,/);
  assert.match(module, /fx\.lyricDepthKaraokeHighlight !== false/);
  assert.match(controls, /词境穿行固定使用五层景深/);
  assert.match(panel, /button\.disabled = locked/);
  assert.match(panel, /lineInput\.disabled = locked/);
});

test('provides twelve choreography layouts and a non-blank cross-track bridge', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');
  const layoutEntries = module.match(/motion:\s*'(?:side|rise|diagonal|orbit|depth|burst|sweep|float)'/g) || [];

  assert.ok(layoutEntries.length >= 12, `expected at least 12 layouts, received ${layoutEntries.length}`);
  assert.match(module, /function beginLyricDepthTrackTransition\(/);
  assert.match(module, /state\.phase = 'bridge'/);
  assert.match(module, /markLyricDepthAudioReady/);
  assert.match(module, /markLyricDepthLyricsReady/);
  assert.match(module, /uPrevMap: \{ value: prevCoverTex \}/);
  assert.match(module, /uMix: uniforms\.uColorMixT/);
  assert.doesNotMatch(module, /transitionProgress = lyricDepthState\.active && !lyricsChanged \? 0 : 1/);
});

test('uses one Emily-derived 360 transform for mouse and two-hand scaling', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');
  const gesture = read('public/js/modules/10-shell/00-gesture-control.js');
  const html = read('public/index.html');

  assert.match(module, /interactionPivot/);
  assert.match(module, /gestureRotation\.x/);
  assert.match(module, /gestureRotation\.y/);
  assert.match(module, /gestureRotation\.z/);
  assert.match(module, /gestureZoom\.value/);
  assert.match(module, /THREE\.DoubleSide/);
  assert.match(gesture, /return 'lyric-depth'/);
  assert.match(html, /360° 词境漫游/);
  assert.match(html, /跟唱明暗/);
});

test('keeps cover and lyrics readable after the 360 stage turns to its back face', () => {
  const module = read('public/js/modules/02-visual/18-lyric-depth-flight.js');
  const faceUvDeclarations = module.match(/vec2 faceUv = gl_FrontFacing \? vUv : vec2\(1\.0 - vUv\.x, vUv\.y\);/g) || [];

  assert.equal(faceUvDeclarations.length, 2, 'both the lyric and cover shaders must correct back-face UVs');
  assert.match(module, /texture2D\(uMap, faceUv\)/);
  assert.match(module, /texture2D\(uPrevMap, faceUv\)/);
  assert.match(module, /float textX = clamp\(\(faceUv\.x - uTextMin\)/);
});
