'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rendering = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/13-lyrics-mesh-build.js'), 'utf8');
const masks = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/10-lyrics-mask-textures.js'), 'utf8');
const rows = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/12-lyrics-row-layers.js'), 'utf8');

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} 未闭合`);
}

test('新歌轻量歌词维持 PR #111 的可见字体比例，不能有独立的低分辨率栅格预算', () => {
  assert.doesNotMatch(rendering, /function stageLyricRasterWidthForPayload\(/,
    '可见歌词不应保留可被误改为低分辨率的单独栅格预算函数');
  assert.doesNotMatch(masks, /layoutOverride\.rasterWidth/,
    '遮罩工厂必须沿用 PR #111 的统一 2048px 基准，避免长句单轴压缩');
  assert.doesNotMatch(rows, /rasterWidth:\s*baseMask && baseMask\.rasterWidth/,
    '逐行遮罩不能继承低分辨率预算');
});

test('可见歌词维持 PR #111 的长文本扩展规则', () => {
  const sandbox = { Math };
  const legacy = `function lyricMaskMaxCanvasWidth(requestedRasterWidth, baseCanvasW, rendererMaxTexture) {
    if (isFinite(Number(requestedRasterWidth)) && Number(requestedRasterWidth) > 0) return baseCanvasW;
    return Math.max(baseCanvasW, Math.min(6144, rendererMaxTexture || 4096));
  }`;
  assert.doesNotMatch(masks, /function lyricMaskMaxCanvasWidth\(/,
    '可见歌词不能存在低分辨率硬上限分支');
  assert.match(masks, /var maxCanvasW\s*=\s*Math\.max\(baseCanvasW, Math\.min\(6144, rendererMaxTexture \|\| 4096\)\);/,
    '长文本必须沿用 PR #111 的可扩展纹理宽度规则');
  assert.ok(legacy.includes('requestedRasterWidth'), '测试夹具保留已移除低分辨率分支的反例');
});
