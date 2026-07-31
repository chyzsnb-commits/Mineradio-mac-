'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const corePath = path.join(root, 'public/js/modules/05-playback/16-cuefield-automix-core.js');

test('智能混音默认关闭，不改变用户设定的交叉淡入', () => {
  const core = require(corePath);
  const plan = core.buildPlan({
    enabled: false,
    baseCrossfadeMs: 6000,
    currentSong: { id: 'a' },
    nextSong: { id: 'b' },
    currentMap: { gridStep: 0.5, loudRef: 0.5 },
    nextMap: { gridStep: 0.49, loudRef: 0.52 },
  });
  assert.deepEqual(plan, { mode: 'direct', crossfadeMs: 6000, reason: 'disabled' });
});

test('智能混音只为节拍和能量接近的普通歌曲缩短现有交叉淡入', () => {
  const core = require(corePath);
  const plan = core.buildPlan({
    enabled: true,
    baseCrossfadeMs: 6000,
    currentSong: { id: 'a', type: 'song' },
    nextSong: { id: 'b', type: 'song' },
    currentMap: { gridStep: 0.5, loudRef: 0.50 },
    nextMap: { gridStep: 0.49, loudRef: 0.54 },
  });
  assert.equal(plan.mode, 'crossfade');
  assert.equal(plan.crossfadeMs, 5100);
  assert.equal(plan.reason, 'tempo-energy-match');
});

test('智能混音在缺少缓存、播客、本地歌曲或内存紧张时严格回退', () => {
  const core = require(corePath);
  const shared = {
    enabled: true,
    baseCrossfadeMs: 6000,
    currentSong: { id: 'a', type: 'song' },
    nextSong: { id: 'b', type: 'song' },
    currentMap: { gridStep: 0.5, loudRef: 0.5 },
    nextMap: { gridStep: 0.5, loudRef: 0.5 },
  };
  assert.equal(core.buildPlan(Object.assign({}, shared, { nextMap: null })).reason, 'missing-beatmap');
  assert.equal(core.buildPlan(Object.assign({}, shared, { nextSong: { id: 'pod', type: 'podcast' } })).reason, 'unsupported-track');
  assert.equal(core.buildPlan(Object.assign({}, shared, { nextSong: { id: 'local', localUrl: 'file:///song.mp3' } })).reason, 'unsupported-track');
  assert.equal(core.buildPlan(Object.assign({}, shared, { memoryConstrained: true })).reason, 'memory-constrained');
});

test('播放接线只用有效淡入时长，并保留原始内存和随机模式保护', () => {
  const playback = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/13-playback-start-audio.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public/js/index-loader.js'), 'utf8');
  assert.match(loader, /16-cuefield-automix-core\.js/);
  assert.match(loader, /17-cuefield-automix-integration\.js/);
  assert.match(playback, /cuefieldEffectiveCrossfadeMs\(\)/);
  assert.match(playback, /_crossfadeFreeMemMB < CROSSFADE_MIN_FREE_MB/);
  assert.match(playback, /if \(playMode === 'shuffle'\) return false/);
});

test('智能混音开关默认关闭、可持久化且放在交叉淡入控制旁', () => {
  const integration = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/17-cuefield-automix-integration.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.match(integration, /CUEFIELD_AUTOMIX_STORE_KEY/);
  assert.match(integration, /readBooleanPreference\(CUEFIELD_AUTOMIX_STORE_KEY, false\)/);
  assert.match(integration, /saveBooleanPreference\(CUEFIELD_AUTOMIX_STORE_KEY/);
  assert.match(html, /id="cuefield-automix-toggle"/);
});