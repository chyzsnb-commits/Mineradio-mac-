'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const spotifyApi = require(path.join(root, 'spotify-api.js'));

test('Spotify OAuth 默认申请歌曲收藏和歌单写入权限', () => {
  const api = read('spotify-api.js');
  ['user-library-modify', 'playlist-modify-private', 'playlist-modify-public'].forEach(scope => {
    assert.match(api, new RegExp("'" + scope + "'"), '缺少 Spotify OAuth scope: ' + scope);
  });
});

test('自定义 Spotify scope 仍会保留官方写入权限', () => {
  const previousScopes = process.env.SPOTIFY_SCOPES;
  const previousClientId = process.env.SPOTIFY_CLIENT_ID;
  process.env.SPOTIFY_SCOPES = 'user-top-read';
  process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
  try {
    const scopes = spotifyApi.getSpotifyOAuthConfig().scopes;
    ['user-top-read', 'user-library-modify', 'playlist-modify-private', 'playlist-modify-public'].forEach(scope => {
      assert.ok(scopes.includes(scope), '自定义 scope 不得覆盖默认写权限: ' + scope);
    });
  } finally {
    if (previousScopes == null) delete process.env.SPOTIFY_SCOPES;
    else process.env.SPOTIFY_SCOPES = previousScopes;
    if (previousClientId == null) delete process.env.SPOTIFY_CLIENT_ID;
    else process.env.SPOTIFY_CLIENT_ID = previousClientId;
  }
});

test('Spotify 官方 API 封装收藏状态、收藏切换与加歌操作', () => {
  const api = read('spotify-api.js');
  assert.match(api, /async function handleSpotifyLikeCheck\s*\(/);
  assert.match(api, /async function handleSpotifyLikeToggle\s*\(/);
  assert.match(api, /async function handleSpotifyPlaylistAddSong\s*\(/);
  assert.match(api, /\/me\/tracks\/contains/);
  assert.match(api, /\/me\/tracks/);
  assert.match(api, /\/playlists\/.*\/tracks/);
  assert.match(api, /handleSpotifyLikeCheck,/);
  assert.match(api, /handleSpotifyLikeToggle,/);
  assert.match(api, /handleSpotifyPlaylistAddSong,/);
});

test('本地服务只通过 Spotify 官方写接口暴露收藏和加歌', () => {
  const server = read('server.js');
  assert.match(server, /handleSpotifyLikeCheck,/);
  assert.match(server, /handleSpotifyLikeToggle,/);
  assert.match(server, /handleSpotifyPlaylistAddSong,/);
  assert.match(server, /\/api\/spotify\/song\/like\/check/);
  assert.match(server, /\/api\/spotify\/song\/like/);
  assert.match(server, /\/api\/spotify\/playlist\/add-song/);
});

test('前端将 Spotify 收藏和加歌限定在 Spotify 账号与歌单', () => {
  const actions = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  assert.match(actions, /function isSpotifyWritableSong\s*\(/);
  assert.match(actions, /\/api\/spotify\/song\/like\/check/);
  assert.match(actions, /\/api\/spotify\/song\/like/);
  assert.match(actions, /\/api\/spotify\/playlist\/add-song/);
  assert.match(actions, /targetProvider === 'spotify'/);
  assert.match(actions, /spotifyLoginStatus\.loggedIn/);
});
