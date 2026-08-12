'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const lyrics = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '06-lyrics', '00-lyrics-fetch-parse.js'), 'utf8');
const bindings = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '07-fx', '07-bindings-shelf-immersive.js'), 'utf8');
const startup = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '10-shell', '05-startup-bindings.js'), 'utf8');

function block(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, endNeedle);
  return source.slice(start, end);
}

test('歌词按钮准确显示当前开启状态', () => {
  assert.match(lyrics, /function syncLyricsToggleButton\(\)/);
  assert.match(lyrics, /lyrics-toggle-btn[\s\S]*classList\.toggle\('active',\s*!!fx\.particleLyrics\)/);
  assert.match(lyrics, /setAttribute\('aria-pressed',\s*fx\.particleLyrics\s*\?\s*'true'\s*:\s*'false'\)/);
});

test('用户点击歌词按钮后立即持久化并同步按钮', () => {
  const toggle = block(lyrics, 'function toggleLyricsPanel(force)', 'function updateLyricsHighlight');
  assert.match(toggle, /syncLyricsToggleButton\(\)/);
  assert.match(toggle, /saveLyricLayout\(\{\s*user:\s*true,\s*reason:\s*'particleLyrics'\s*\}\)/);
});

test('沉浸模式临时切换和启动恢复都会同步歌词按钮', () => {
  const silent = block(bindings, 'function setParticleLyricsSilently(on)', 'function updateImmersiveButton');
  assert.match(silent, /syncLyricsToggleButton\(\)/);
  assert.match(startup, /if \(fx\.particleLyrics\) createLyricsParticles\(\);\s*if \(typeof syncLyricsToggleButton === 'function'\) syncLyricsToggleButton\(\);/);
});

test('音域回响不会遮住舞台歌词', () => {
  const mesh = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '02-visual', '13-lyrics-mesh-build.js'), 'utf8');
  const shader = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '02-visual', '11-lyrics-shaders.js'), 'utf8');
  assert.match(mesh, /renderOrder\s*=\s*4[23](?:\.4)?/);
  assert.match(shader, /depthTest:\s*false/);
  assert.match(shader, /depthWrite:\s*false/);
});
