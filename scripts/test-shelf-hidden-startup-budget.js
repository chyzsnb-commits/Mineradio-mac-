'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/modules/04-shelf/01-manager-core.js'), 'utf8');

test('隐藏的右侧歌单架不会在切歌首帧重建卡片，唤起后才渐进刷新', () => {
  assert.match(source, /var pendingCoverRefresh\s*=\s*false/,
    '需要保存隐藏期间的封面变更，而不是丢失刷新');
  assert.match(source, /function shelfCardRefreshAllowed\(/,
    '歌单架重建需要统一的可见性条件');
  assert.match(source, /if \(!shelfCardRefreshAllowed\(\)\) \{\s*pendingCoverRefresh\s*=\s*true;\s*return;\s*\}/,
    '切歌封面变更在隐藏歌架时必须只标记待刷新');
  assert.match(source, /pendingCoverRefresh\s*&&\s*shelfCardRefreshAllowed\(\)/,
    '右键或边缘唤起后应消费待刷新状态');
  assert.match(source, /syncQueueCurrent\(currentIdx, true\)/,
    '唤起后的刷新必须保留现有渐进构建路径');
});
