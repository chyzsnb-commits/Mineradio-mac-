'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/07-lyrics-palette-text-utils.js'), 'utf8');

function readFunction(name) {
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

test('歌词封面调色保持 PR #111 的原始画布采样，不能以低分辨率样本改变配色', () => {
  const update = readFunction('updateLyricPaletteFromCover');
  assert.match(update, /getImageData\(0, 0, coverCanvas\.width, coverCanvas\.height\)/,
    '调色必须直接使用原始封面画布，与 PR #111 的取色和背景关系一致');
  assert.doesNotMatch(source, /function lyricCoverPaletteSampleCanvas\(/,
    '不可引入低分辨率取色缓存，否则同一封面的歌词颜色可能与 PR #111 不同');
});
