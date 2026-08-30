'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/modules/02-visual/03-lyrics-star-river.js'), 'utf8');

test('歌词网格销毁保留掩膜纹理的资源所有权引用', () => {
  const start = source.indexOf('function disposeLyricMesh(');
  const end = source.indexOf('\n}', start) + 2;
  const dispose = source.slice(start, end);
  assert.match(dispose, /var lyricData\s*=\s*mesh\.userData\s*&&\s*mesh\.userData\.lyric;/,
    '销毁时必须保留 lyricData，以释放 mask、activeMask 和 contextMask 的纹理');
  assert.match(dispose, /\[lyricData\.mask, lyricData\.activeMask, lyricData\.contextMask\]/,
    '必须显式处理三类歌词遮罩，避免切歌后遗留 GPU 纹理');
});
