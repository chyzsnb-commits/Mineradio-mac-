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
      let bodyText = '';
      let requestBody = {};
      req.on('data', chunk => { bodyText += chunk; });
      req.on('end', () => {
        try { requestBody = JSON.parse(bodyText || '{}'); } catch (_) { requestBody = {}; }
        if (requestBody.track_id === 'qs-track-non-json') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><title>login required</title>');
          return;
        }
        const empty = requestBody.track_id === 'qs-track-empty';
        res.end(JSON.stringify({
          data: {
            track: {
              id: requestBody.track_id || 'qs-track-1',
              duration: 180000,
              audio_info: { play_info_list: empty ? [] : [{ url: 'https://example.invalid/audio.m4a', bitrate: 128000, format: 'm4a', duration: 180000 }] },
            },
          },
        }));
      });
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

test('汽水接口返回 200 但未提供流时，结果必须标记为不可播放并保留诊断', async () => {
  const mock = await startMockQishuiService();
  const apiPath = path.resolve(__dirname, '..', 'qishui-api.js');
  const previousBase = process.env.QISHUI_WEB_PC_API_BASE;
  const previousBases = process.env.QISHUI_WEB_API_BASES;
  try {
    process.env.QISHUI_WEB_PC_API_BASE = mock.baseUrl;
    process.env.QISHUI_WEB_API_BASES = mock.baseUrl;
    delete require.cache[apiPath];
    const api = require(apiPath);
    const stream = await api.handleQishuiSongUrl({ id: 'qs-track-empty', quality: 'standard' }, 'sessionid=integration-test-empty');

    assert.equal(stream.provider, 'qishui');
    assert.equal(stream.playable, false);
    assert.equal(stream.reason, 'source_unavailable');
    assert.equal(stream.diagnostic && stream.diagnostic.sourceId, 'qs-track-empty');
    assert.equal(stream.diagnostic && stream.diagnostic.statusCode, 200);
    assert.equal(stream.diagnostic && stream.diagnostic.requestHost, '127.0.0.1');
    assert.match(String(stream.diagnostic && stream.diagnostic.reason), /没有提供可播放流/);
  } finally {
    if (previousBase == null) delete process.env.QISHUI_WEB_PC_API_BASE;
    else process.env.QISHUI_WEB_PC_API_BASE = previousBase;
    if (previousBases == null) delete process.env.QISHUI_WEB_API_BASES;
    else process.env.QISHUI_WEB_API_BASES = previousBases;
    delete require.cache[apiPath];
    await new Promise(resolve => mock.server.close(resolve));
  }
});

test('汽水 track_v2 返回 2xx 非 JSON 时保留 HTTP 和响应类型诊断', async () => {
  const mock = await startMockQishuiService();
  const apiPath = path.resolve(__dirname, '..', 'qishui-api.js');
  const previousBase = process.env.QISHUI_WEB_PC_API_BASE;
  const previousBases = process.env.QISHUI_WEB_API_BASES;
  try {
    process.env.QISHUI_WEB_PC_API_BASE = mock.baseUrl;
    process.env.QISHUI_WEB_API_BASES = mock.baseUrl;
    delete require.cache[apiPath];
    const api = require(apiPath);
    const stream = await api.handleQishuiSongUrl({ id: 'qs-track-non-json' }, 'sessionid=integration-test-non-json');

    assert.equal(stream.playable, false);
    assert.equal(stream.diagnostic && stream.diagnostic.stage, 'track_v2');
    assert.equal(stream.diagnostic && stream.diagnostic.statusCode, 200);
    assert.match(String(stream.diagnostic && stream.diagnostic.responseType), /^text\/html/);
    assert.equal(stream.diagnostic && stream.diagnostic.code, 'QISHUI_INVALID_JSON');
  } finally {
    if (previousBase == null) delete process.env.QISHUI_WEB_PC_API_BASE;
    else process.env.QISHUI_WEB_PC_API_BASE = previousBase;
    if (previousBases == null) delete process.env.QISHUI_WEB_API_BASES;
    else process.env.QISHUI_WEB_API_BASES = previousBases;
    delete require.cache[apiPath];
    await new Promise(resolve => mock.server.close(resolve));
  }
});
