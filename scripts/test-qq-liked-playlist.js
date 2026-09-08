'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function readFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`${name} is not closed`);
}

test('QQ 我喜欢接口的对象键会被解析为歌曲 ID 和 MID', () => {
  const sandbox = {};
  vm.runInNewContext(`${readFunction('qqListFromMapValue')};`, sandbox);

  assert.deepEqual(
    Array.from(sandbox.qqListFromMapValue({ '001abcMID': 1, '002defMID': 1 })),
    ['001abcMID', '002defMID'],
  );
  assert.deepEqual(Array.from(sandbox.qqListFromMapValue(['1', '2'])), ['1', '2']);
  assert.deepEqual(Array.from(sandbox.qqListFromMapValue('1,2|3')), ['1', '2', '3']);
});

test('QQ 我喜欢详情不按无序数字 ID 键和 MID 键的位置强行配对', () => {
  const handler = readFunction('handleQQLikedPlaylistTracks');
  assert.doesNotMatch(handler, /batchIds|slicedIds/);
  assert.match(handler, /qqSongDetail\(mid,\s*\{\s*mid,/);
  assert.match(source, /const total = Math\.max\(mids\.length, ids\.length\)/);
});
