'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function extractFunction(source, name) {
  const match = source.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
  assert.ok(match, '缺少函数 ' + name);
  return match[0];
}

test('QQ 专辑 MID 始终生成官方 T002 封面地址', () => {
  const server = read('server.js');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(server, 'qqAlbumCover'), sandbox);

  assert.equal(
    sandbox.qqAlbumCover('001uqejs3d6EID', 300),
    'https://y.qq.com/music/photo_new/T002R300x300M000001uqejs3d6EID.jpg?max_age=2592000'
  );
});

test('清除单曲自定义封面后立即恢复当前搜索结果里的官方封面', () => {
  const source = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const key = 'qq:002u8ZOM4C7QF4';
  const custom = 'data:image/webp;base64,MR_ICON';
  const official = 'https://y.qq.com/music/photo_new/T002R300x300M000001uqejs3d6EID.jpg?max_age=2592000';
  const activeSong = { provider: 'qq', mid: '002u8ZOM4C7QF4', name: '手写的从前', artist: '周杰伦', cover: official, customCover: custom };
  const searchSong = Object.assign({}, activeSong);
  const calls = { rendered: 0, loaded: [], saved: 0 };
  const sandbox = {
    currentIdx: 0,
    playQueue: [activeSong],
    playlist: [searchSong],
    currentLocalSong: null,
    customCoverMap: { [key]: custom },
    playlistCoverCache: { [custom]: true },
    miniQueueOpen: false,
    currentCoverSong() { return activeSong; },
    getCustomCoverForSong(song) { return song.customCover || sandbox.customCoverMap[key] || ''; },
    songCustomCoverKey() { return key; },
    saveCustomCoverMap() { calls.saved += 1; return true; },
    coverUrlWithSize(url) { return url; },
    loadCoverFromUrl(url) { calls.loaded.push(url); },
    safeRenderQueuePanel() {},
    safeShelfRebuild() {},
    updateCustomCoverButton() {},
    showToast() {},
    renderSongSearchResults() { calls.rendered += 1; },
    isMusicSearchMode() { return true; },
    searchMode: 'qq',
    $results: { classList: { contains(name) { return name === 'show'; } } },
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(source, 'clearCustomCoverForCurrent'), sandbox);
  sandbox.clearCustomCoverForCurrent();

  assert.equal(sandbox.customCoverMap[key], undefined);
  assert.equal(activeSong.customCover, undefined);
  assert.equal(searchSong.customCover, undefined);
  assert.equal(calls.rendered, 1);
  assert.deepEqual(calls.loaded, [official]);
  assert.equal(calls.saved, 1);
});
