'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

function startMockQishuiService() {
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    calls.push({ method: req.method, path: url.pathname, cookie: req.headers.cookie || '' });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/luna/pc/playlist/detail') {
      res.end(JSON.stringify({
        data: {
          playlist: { playlist_id: 'qs-playlist-1', title: '测试汽水歌单', count_tracks: 1, cover_url: 'https://example.invalid/cover.jpg' },
          media_resources: [{ id: 'qs-track-1', name: '测试歌曲', artist_name: '测试歌手', duration: 180000 }],
          has_more: false,
        },
      }));
      return;
    }
    if (url.pathname === '/luna/pc/track_v2') {
      res.end(JSON.stringify({
        data: {
          track: {
            id: 'qs-track-1',
            duration: 180000,
            audio_info: {
              play_info_list: [{ url: 'https://example.invalid/audio.m4a', bitrate: 128000, format: 'm4a', duration: 180000 }],
            },
          },
        },
      }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'unexpected mock route' }));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    server,
    calls,
    baseUrl: 'http://127.0.0.1:' + server.address().port,
  })));
}

test('已登录汽水会话可把歌单、曲目和音频地址标准化为播放器契约', async () => {
  const mock = await startMockQishuiService();
  const apiPath = path.resolve(__dirname, '..', 'qishui-api.js');
  const previousBase = process.env.QISHUI_WEB_PC_API_BASE;
  const previousBases = process.env.QISHUI_WEB_API_BASES;
  try {
    process.env.QISHUI_WEB_PC_API_BASE = mock.baseUrl;
    process.env.QISHUI_WEB_API_BASES = mock.baseUrl;
    delete require.cache[apiPath];
    const api = require(apiPath);
    const cookie = 'sessionid=integration-test';

    const playlist = await api.handleQishuiPlaylistTracks('qs-playlist-1', { limit: 20 }, cookie);
    assert.equal(playlist.provider, 'qishui');
    assert.equal(playlist.tracks.length, 1);
    assert.deepEqual(playlist.tracks[0] && {
      provider: playlist.tracks[0].provider,
      id: playlist.tracks[0].id,
      name: playlist.tracks[0].name,
      artist: playlist.tracks[0].artist,
      playable: playlist.tracks[0].playable,
    }, { provider: 'qishui', id: 'qs-track-1', name: '测试歌曲', artist: '测试歌手', playable: true });

    const stream = await api.handleQishuiSongUrl({ id: 'qs-track-1', quality: 'standard' }, cookie);
    assert.equal(stream.provider, 'qishui');
    assert.equal(stream.playable, true);
    assert.equal(stream.url, 'https://example.invalid/audio.m4a');
    assert.ok(mock.calls.some(call => call.method === 'GET' && call.path === '/luna/pc/playlist/detail' && call.cookie.includes('sessionid=integration-test')));
    assert.ok(mock.calls.some(call => call.method === 'POST' && call.path === '/luna/pc/track_v2' && call.cookie.includes('sessionid=integration-test')));
  } finally {
    if (previousBase == null) delete process.env.QISHUI_WEB_PC_API_BASE;
    else process.env.QISHUI_WEB_PC_API_BASE = previousBase;
    if (previousBases == null) delete process.env.QISHUI_WEB_API_BASES;
    else process.env.QISHUI_WEB_API_BASES = previousBases;
    delete require.cache[apiPath];
    await new Promise(resolve => mock.server.close(resolve));
  }
});
