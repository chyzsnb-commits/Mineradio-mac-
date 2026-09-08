'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('默认歌词视觉参数与 PR #111 一致，且不改写用户总缩放', () => {
  const rows = read('public/js/modules/02-visual/12-lyrics-row-layers.js');
  const rendering = read('public/js/modules/02-visual/14-stage-lyrics-rendering.js');

  assert.match(rendering, /alpha:\s*isCurrent\s*\?\s*clampRange\(lyricTranslationOpacityValue\(\)\s*\+\s*0\.08,\s*0\.48,\s*1\)/,
    '当前译文透明度必须恢复 PR #111 的默认公式');
  assert.match(rendering, /scale:\s*isCurrent\s*\?\s*clampRange\(scale\s*\*\s*1\.08,\s*0\.70,\s*1\.12\)/,
    '当前译文字号必须恢复 PR #111 的默认公式');
  assert.match(rendering, /alpha:\s*clampRange\(lyricContextOpacityValue\(\),\s*0\.18,\s*0\.92\)/,
    '上下文原文透明度必须恢复 PR #111 的默认公式');
  assert.match(rendering, /scale:\s*0\.88/,
    '上下文原文字号必须恢复 PR #111 的默认比例');
  assert.doesNotMatch(rows, /function lyricCurrentTranslationOpacity\(\)/,
    '默认视觉不能叠加本轮新增的译文透明度上限');
  assert.doesNotMatch(rows, /contextPrimaryScale/,
    '默认视觉不能叠加本轮新增的上下文缩放');
  assert.doesNotMatch(rendering, /fx\.lyricScale\s*=\s*(?:0\.\d+|1(?:\.0)?);/,
    '修复层级不能静默重置用户的总歌词缩放');
});
