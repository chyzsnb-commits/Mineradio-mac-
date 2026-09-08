'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const displayModes = read('public/js/modules/02-visual/08-lyrics-display-modes.js');
const rendering = read('public/js/modules/02-visual/14-stage-lyrics-rendering.js');
const html = read('public/index.html');

test('歌词切换保留 PR #111 原始模式及四种新增动效，旧硬切和重复缩放安全迁移', () => {
  assert.match(displayModes, /STAGE_LYRIC_TRANSITION_STYLES\s*=\s*\{\s*original:\s*1,\s*crossfade:\s*1,\s*rise:\s*1,\s*slide:\s*1,\s*focus:\s*1\s*\}/,
    '切换库应保留原始切换，并仅提供经典叠化、上浮淡入、分层掠过和镜头推进');
  assert.match(displayModes, /if\s*\(style\s*===\s*'quick'\)\s*style\s*=\s*'crossfade'/,
    '旧快速切换保存值必须回到经典叠化，不能留下硬切');
  assert.match(displayModes, /if\s*\(style\s*===\s*'scale'\)\s*style\s*=\s*'focus'/,
    '旧柔和缩放保存值必须迁移为镜头推进');
  assert.doesNotMatch(html, /data-transition="quick"/, '控制台不能继续展示快速切换');
  assert.doesNotMatch(html, /data-transition="scale"/, '控制台不能继续展示柔和缩放');
});

test('单行和多行歌词共用同一条转场轨道，且不在换句时重建纹理', () => {
  assert.match(rendering, /function lyricTransitionTransform\(style, phase, direction, isOutgoing\)/,
    '所有转场都必须由可测试的统一轨道函数给出 transform');
  assert.match(rendering, /lyricTransitionTransform\(transitionStyle, a, enterDir, false\)/,
    '单行与多行 entering mesh 都必须接入转场轨道');
  assert.match(rendering, /lyricTransitionTransform\(exitTransition\.style, a, exitDir, true\)/,
    'outgoing mesh 必须接入同一转场轨道');
  assert.match(rendering, /transitionBlur/, '转场轨道必须给现有材质提供轻度失焦参数');
  const updateStart = rendering.indexOf('function updateStageLyrics3D(dt)');
  const updateEnd = rendering.indexOf('function lyricMeshTrackWindow', updateStart);
  const updateBody = rendering.slice(updateStart, updateEnd);
  assert.doesNotMatch(updateBody, /buildLyricMesh\(/,
    '逐帧转场不能重新栅格化或重建歌词 mesh');
});
