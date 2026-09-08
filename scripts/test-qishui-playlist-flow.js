'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('汽水登录后把个人歌单接入歌单面板，而不是清空该来源', () => {
  const shell = read('public/js/modules/06-lyrics/01-playlist-panel-shell.js');

  assert.match(shell, /qishuiLoginStatus\.loggedIn \? apiJson\('\/api\/qishui\/user\/playlists'\) : Promise\.resolve\(\{ playlists: \[\] \}\)/);
  assert.match(shell, /qishuiPlaylists\s*=\s*\(result\[4\]\.playlists \|\| \[\]\)\.map\(function \(pl\) \{ pl\.provider = 'qishui'; pl\.source = 'qishui'; return pl; \}\);/);
  assert.match(shell, /userPlaylists\s*=\s*neteaseLists\.concat\(qqPlaylists\)\.concat\(kugouPlaylists\)\.concat\(qishuiPlaylists\)\.concat\(spotifyPlaylists\);/);
  assert.doesNotMatch(shell, /qishuiPlaylists\s*=\s*\[\];/);
});

test('汽水歌单详情和播放队列都请求汽水曲目接口', () => {
  const loaders = read('public/js/modules/06-lyrics/03-podcast-playlist-loaders.js');
  const detail = read('public/js/modules/06-lyrics/02-playlist-detail.js');

  assert.match(loaders, /var qishuiPlaylistId\s*=\s*String\(id \|\| ''\)\.indexOf\('qishui:'\) === 0 \? String\(id\)\.slice\(7\) : '';/);
  assert.match(loaders, /qishuiPlaylistId\s*\? await apiJson\('\/api\/qishui\/playlist\/tracks\?id=' \+ encodeURIComponent\(qishuiPlaylistId\)\)/);
  assert.match(detail, /provider === 'qishui' \? 'qishui' :/);
  assert.match(detail, /if \(provider === 'qishui'\) return 'qishui:' \+ id;/);
  assert.match(detail, /provider === 'qishui'\s*\? await apiJson\('\/api\/qishui\/playlist\/tracks\?id=' \+ encodeURIComponent\(pid\)\)/);
});

test('汽水曲目接口的不可播放结果会保留错误，而非静默切换网易云', () => {
  const server = read('server.js');
  const qishuiApi = read('qishui-api.js');

  assert.match(server, /pn === '\/api\/qishui\/song\/url'/);
  assert.match(qishuiApi, /playable:\s*false/);
  assert.match(qishuiApi, /'source_unavailable'/);
});

test('汽水歌单曲目在首次播放、无缝预取和换音质时都走汽水音频接口', () => {
  const start = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const quality = read('public/js/modules/05-playback/00-api-quality-output.js');

  assert.match(start, /if \(playbackProvider === 'qishui'\) \{[\s\S]{0,240}\/api\/qishui\/song\/url\?id=/);
  assert.match(start, /var isQishuiPlayback\s*=\s*playbackProvider === 'qishui';/);
  assert.match(start, /else if \(isQishuiPlayback\) \{[\s\S]{0,240}\/api\/qishui\/song\/url\?id=/);
  assert.match(quality, /songProviderKey\(song\) === 'netease' \|\| songProviderKey\(song\) === 'qq' \|\| songProviderKey\(song\) === 'kugou' \|\| songProviderKey\(song\) === 'qishui';/);
  assert.match(quality, /if \(provider === 'qishui'\) \{[\s\S]{0,180}\/api\/qishui\/song\/url\?id=/);
});
