'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function startCatalogMock() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (url.pathname === '/search') {
      res.end(JSON.stringify({
        data: {
          list: [{
            item_id: 'catalog-song-1',
            title: '目录测试歌曲',
            author_info: { id: 'artist-1', name: '目录歌手' },
            album_info: { name: '目录专辑', cover_url: 'https://example.invalid/cover.jpg' },
            duration: 183000,
            qishui_label_info: { only_vip_playable: true },
          }],
        },
      }));
      return;
    }
    if (url.pathname === '/contents') {
      res.end(JSON.stringify({
        data: {
          list: [{
            item_id: 'catalog-song-1',
            lyric_info: { lyric_text: '[00:00.00]目录歌词', translated_lyric: '[00:00.00]Catalog lyric' },
          }],
        },
      }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'unexpected route' }));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    server,
    baseUrl: 'http://127.0.0.1:' + server.address().port,
  })));
}

test('catalog 模块不包含账户读取、受保护媒体处理或直播能力', () => {
  const source = read('qishui-catalog-api.js');
  assert.doesNotMatch(source, /sessionid|safeStorage|decrypt|track_v2|qishui-audio|QISHUI_ACCESS|client_secret|\/login\//i);
  assert.match(source, /catalogOnly:\s*true/);
  assert.match(source, /playable:\s*false/);
  assert.match(source, /playbackMode:\s*'recommend-match'/);
  assert.match(source, /directPlayback:\s*false/);
});

test('未登录可搜索汽水目录、读取歌词，但播放结果只能交给自动换源', async () => {
  const mock = await startCatalogMock();
  const previousSearch = process.env.QISHUI_CATALOG_SEARCH_URL;
  const previousContents = process.env.QISHUI_CATALOG_CONTENTS_URL;
  const modulePath = path.join(root, 'qishui-catalog-api.js');
  try {
    process.env.QISHUI_CATALOG_SEARCH_URL = mock.baseUrl + '/search';
    process.env.QISHUI_CATALOG_CONTENTS_URL = mock.baseUrl + '/contents';
    delete require.cache[require.resolve(modulePath)];
    const catalog = require(modulePath);

    const status = catalog.handleQishuiCatalogStatus();
    assert.equal(status.loggedIn, false);
    assert.equal(status.publicCatalog, true);
    assert.equal(status.searchReady, true);
    assert.equal(status.capabilities.directPlayback, false);

    const result = await catalog.handleQishuiCatalogSearch('目录测试', 8);
    assert.equal(result.songs.length, 1);
    assert.deepEqual({
      provider: result.songs[0].provider,
      id: result.songs[0].id,
      name: result.songs[0].name,
      artist: result.songs[0].artist,
      playable: result.songs[0].playable,
      playbackMode: result.songs[0].playbackMode,
      fee: result.songs[0].fee,
    }, {
      provider: 'qishui',
      id: 'catalog-song-1',
      name: '目录测试歌曲',
      artist: '目录歌手',
      playable: false,
      playbackMode: 'recommend-match',
      fee: 1,
    });

    const lyric = await catalog.handleQishuiCatalogLyric('catalog-song-1');
    assert.match(lyric.lyric, /目录歌词/);
    assert.match(lyric.tlyric, /Catalog lyric/);

    const playback = catalog.handleQishuiCatalogPlayback('catalog-song-1');
    assert.equal(playback.url, '');
    assert.equal(playback.playable, false);
    assert.equal(playback.reason, 'provider_limited');
    assert.equal(playback.restriction.action, 'switch_source');
  } finally {
    if (previousSearch == null) delete process.env.QISHUI_CATALOG_SEARCH_URL;
    else process.env.QISHUI_CATALOG_SEARCH_URL = previousSearch;
    if (previousContents == null) delete process.env.QISHUI_CATALOG_CONTENTS_URL;
    else process.env.QISHUI_CATALOG_CONTENTS_URL = previousContents;
    delete require.cache[require.resolve(modulePath)];
    await new Promise(resolve => mock.server.close(resolve));
  }
});

test('服务端仅暴露目录状态、搜索、歌词和不可直播端点', () => {
  const server = read('server.js');
  assert.match(server, /require\('\.\/qishui-catalog-api'\)/);
  assert.match(server, /pn === '\/api\/qishui\/status'/);
  assert.match(server, /pn === '\/api\/qishui\/search'/);
  assert.match(server, /pn === '\/api\/qishui\/lyric'/);
  assert.match(server, /pn === '\/api\/qishui\/song\/url'/);
  assert.doesNotMatch(server, /pn === '\/api\/qishui\/login\//);
  assert.doesNotMatch(server, /pn === '\/api\/qishui\/user\/playlists'/);
});

test('汽水目录能力仅保留后端兼容与自动换源保护，前端不再主动搜索', () => {
  const state = read('public/js/modules/00-state/00-core-stores.js');
  const search = read('public/js/modules/05-playback/07-search.js');
  const playback = read('public/js/modules/05-playback/00-api-quality-output.js');
  const start = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const lyrics = read('public/js/modules/06-lyrics/00-lyrics-fetch-parse.js');

  assert.match(state, /MINERADIO_QISHUI_CATALOG_ENABLED/);
  assert.match(search, /function searchProviderCanSearch\(provider\)/);
  assert.doesNotMatch(search, /provider === 'qishui'\) return '\/api\/qishui\/search/);
  assert.match(playback, /QISHUI_CATALOG_ONLY/);
  assert.match(playback, /MINERADIO_DISABLED_PROVIDERS\.indexOf\(provider\) >= 0/);
  assert.match(start, /catalogOnlyFallback[\s\S]{0,180}opts\.startupAutoplay && !catalogOnlyFallback/);
  assert.match(start, /isQishuiPlayback[\s\S]{0,2200}\/api\/qishui\/song\/url/);
  assert.match(lyrics, /provider === 'qishui'[\s\S]{0,180}\/api\/qishui\/lyric/);
});
