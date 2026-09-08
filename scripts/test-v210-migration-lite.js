'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('本地曲库持久化模块与主进程接线存在', () => {
  const moduleFile = read('desktop/local-music-library.js');
  const main = read('desktop/main.js');
  const preload = read('desktop/preload.js');
  const pkg = read('package.json');

  assert.match(moduleFile, /class LocalMusicLibrary/);
  assert.match(moduleFile, /registerLocalMusicScheme/);
  assert.match(moduleFile, /LOCAL_LIBRARY_VERSION/);
  assert.match(main, /require\('\.\/local-music-library'\)/);
  assert.match(main, /registerLocalMusicScheme\(protocol\)/);
  assert.match(main, /mineradio-local-library-list/);
  assert.match(main, /mineradio-local-library-import/);
  assert.match(preload, /importLocalMusicFiles/);
  assert.match(preload, /readLocalMusicLyric/);
  assert.match(preload, /listLocalMusicLibrary/);
  assert.match(pkg, /local-music-library\.js/);
});

test('渲染层接入持久化本地曲库：拖拽、启动恢复与内嵌歌词', () => {
  const upload = read('public/js/modules/06-lyrics/05-upload-dragdrop.js');
  const startup = read('public/js/modules/10-shell/05-startup-bindings.js');
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const stores = read('public/js/modules/00-state/00-core-stores.js');

  assert.match(upload, /canUsePersistentLocalMusicLibrary/);
  assert.match(upload, /importPersistentLocalAudioFiles/);
  assert.match(upload, /persistentLocalLibraryTracks/);
  assert.match(startup, /restorePersistedLocalLibrary/);
  assert.match(playback, /readLocalMusicLyric/);
  assert.match(stores, /persistentLocalLibraryTracks/);
});

test('首页包含 Windows 风格每日热评与生成封面回退', () => {
  const html = read('public/index.html');
  const home = read('public/js/modules/05-playback/03-home-discover-weather.js');

  assert.match(html, /home-daily-quote/);
  assert.match(html, /home-daily-review/);
  assert.match(home, /function renderHomeDailyReview\(/);
  assert.match(home, /homeDashboardGeneratedCover|generatedHomeCover/);
});

test('QQ 与酷狗会员状态兼容 v2.1.0 字段', () => {
  const status = read('public/js/modules/08-account/02-login-status.js');
  assert.match(status, /qqMembershipNeedsSync/);
  assert.match(status, /playbackReady \|\| info\.playbackKeyReady/);
});

test('本地曲库浏览/管理面板与移除 IPC 接线存在', () => {
  const html = read('public/index.html');
  const loader = read('public/js/index-loader.js');
  const panel = read('public/js/modules/06-lyrics/07-local-library-panel.js');
  const main = read('desktop/main.js');
  const preload = read('desktop/preload.js');

  assert.match(html, /local-library-modal/);
  assert.match(html, /local-library-search/);
  assert.match(html, /local-library-list/);
  assert.match(html, /openLocalLibraryPanel\(\)/);
  assert.match(loader, /07-local-library-panel\.js/);
  assert.match(panel, /function openLocalLibraryPanel\(/);
  assert.match(panel, /function renderLocalLibraryRows\(/);
  assert.match(panel, /function playAllLocalLibraryTracks\(/);
  assert.match(panel, /function removeLocalLibraryTrack\(/);
  assert.match(main, /mineradio-local-library-remove/);
  assert.match(preload, /removeLocalMusicLibraryTracks/);
});

test('窗口恢复与歌词磁盘缓存接线存在', () => {
  const main = read('desktop/main.js');
  const preload = read('desktop/preload.js');
  const lyrics = read('public/js/modules/06-lyrics/00-lyrics-fetch-parse.js');

  assert.match(main, /desktop-window-restore/);
  assert.match(main, /mineradio-cache-read-lyric/);
  assert.match(main, /mineradio-cache-write-lyric/);
  assert.match(main, /LYRIC_CACHE_MAX_BYTES/);
  assert.match(preload, /readLyricCache/);
  assert.match(preload, /writeLyricCache/);
  assert.match(lyrics, /readCachedLyricResponse/);
  assert.match(lyrics, /writeCachedLyricResponse/);
});
