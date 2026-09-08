'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} 函数未闭合`);
}

test('自动歌词无词时回退到已保存本地歌词，手动选择自动也不强制丢词', () => {
  const source = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const sandbox = {
    customLyricMap: { 'ne:cloud-1': { text: '[00:01.00] 本地歌词' } },
    customLyricPrefs: { 'ne:cloud-1': 'original' },
    originalLyricsState: { timingSource: 'fallback' },
    songCustomLyricKey(song) { return song.key; },
    hasCustomLyricForSong(song) { return !!sandbox.customLyricMap[song.key]; },
  };
  vm.runInNewContext(readFunction(source, 'preferredLyricSourceForSong'), sandbox);
  assert.equal(sandbox.preferredLyricSourceForSong({ key: 'ne:cloud-1' }), 'custom');

  sandbox.originalLyricsState = { timingSource: 'lrc-line' };
  assert.equal(sandbox.preferredLyricSourceForSong({ key: 'ne:cloud-1' }), 'original');
});

test('严格云盘候选拒绝不同歌手、时长不符与分差不足的同名歌曲', () => {
  const source = read('public/js/modules/06-lyrics/00-lyrics-fetch-parse.js');
  const sandbox = {
    simpleSearchNorm(value) {
      return String(value || '').toLowerCase()
        .replace(/[（(【\[].*?[）)】\]]/g, '')
        .replace(/[\s·・,，。.!！?？'"“”‘’|\-_/]+/g, '');
    },
    sourceSwitchArtistParts(song) { return String(song.artist || '').toLowerCase().split(/\s*\/\s*/).filter(Boolean); },
    sourceSwitchPartsOverlap(a, b) { return a.some((left) => b.some((right) => left === right)); },
    searchLooksLikeDerivative(value) { return /cover|remix/i.test(String(value || '')); },
  };
  vm.runInNewContext([
    readFunction(source, 'lyricDurationMsForMatch'),
    readFunction(source, 'strictLyricCandidateScore'),
    readFunction(source, 'selectStrictLyricCandidate'),
  ].join(';'), sandbox);
  const song = { name: '同名歌', artist: '歌手甲', duration: 200000 };

  assert.equal(sandbox.strictLyricCandidateScore(song, { name: '同名歌', artist: '歌手乙', duration: 200000 }), -1);
  assert.equal(sandbox.strictLyricCandidateScore(song, { name: '同名歌', artist: '歌手甲', duration: 205000 }), -1);
  assert.equal(sandbox.strictLyricCandidateScore(
    { name: '同名歌 (Remix)', artist: '歌手甲', duration: 200000 },
    { name: '同名歌', artist: '歌手甲', duration: 200000 },
  ), -1, '当前曲目本身为 Remix 时不能借用普通版歌词');
  assert.equal(sandbox.selectStrictLyricCandidate(song, [
    { id: 'a', name: '同名歌', artist: '歌手甲', duration: 200000 },
    { id: 'b', name: '同名歌', artist: '歌手甲', duration: 200000 },
  ]), null);

  assert.deepEqual(sandbox.selectStrictLyricCandidate(song, [
    { id: 'winner', name: '同名歌', artist: '歌手甲', duration: 200000 },
    { id: 'wrong', name: '同名歌', artist: '歌手乙', duration: 200000 },
  ]), { id: 'winner', name: '同名歌', artist: '歌手甲', duration: 200000 });
});

test('歌词导入入口与自动/本地歌词按钮均在实际界面中可见', () => {
  const html = read('public/index.html');
  const actions = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  assert.match(html, /id="custom-lyric-file-input"/);
  assert.match(html, /导入 LRC/);
  assert.match(html, /onclick="setLyricSourceMode\('original'\)"[^>]*>自动</);
  assert.match(html, /onclick="setLyricSourceMode\('custom'\)"[^>]*>本地歌词</);
  assert.match(actions, /function importCustomLyricFile\(/);
});
