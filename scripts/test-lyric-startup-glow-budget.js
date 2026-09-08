'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('可见歌词首帧立即建立 PR #111 的光晕和可读性层，性能保护不得降级可见层', () => {
  const rows = read('public/js/modules/02-visual/12-lyrics-row-layers.js');
  const mesh = read('public/js/modules/02-visual/13-lyrics-mesh-build.js');
  const disposal = read('public/js/modules/02-visual/03-lyrics-star-river.js');

  assert.match(rows, /var readabilityTex\s*=\s*makeLyricReadabilityTexture\(lineMask\)/,
    '所有可见行必须在网格建立时就创建可读性层');
  assert.match(rows, /if \(shouldCreateRowGlow\)\s*\{[\s\S]*makeLyricRowGlowMesh\(/,
    '当前原文与当前译文的光晕必须在首帧创建');
  assert.doesNotMatch(rows, /(?:glowDeferred|readabilityDeferred)/,
    '不能延后可见层，否则播放首段会丢失 PR #111 的视觉层级');
  assert.doesNotMatch(mesh, /(?:stageLyricLightweightGlowWarmupReady|scheduleStageLyricLightweightGlowWarmup|glowWarmup)/,
    '不可保留无调用的延后光晕调度器');
  assert.doesNotMatch(disposal, /glowWarmup/,
    '销毁流程不应保留已移除调度器的清理分支');
});
