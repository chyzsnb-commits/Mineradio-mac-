'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function makeClassList() {
  return {
    _values: new Set(),
    add(name) { this._values.add(name); },
    remove(name) { this._values.delete(name); },
    contains(name) { return this._values.has(name); },
    toggle(name, force) { if (force === true || (force !== false && !this._values.has(name))) this._values.add(name); else this._values.delete(name); },
  };
}

function createWallpaperHarness() {
  const elements = {};
  ['wallpaper-library-status', 'wallpaper-library-preview', 'wallpaper-library-preview-meta',
    'wallpaper-library-details-drawer', 'wallpaper-library-export', 'wallpaper-library-modal',
    'wallpaper-library-list', 'wallpaper-library-http-input', 'wallpaper-library-select-all',
    'wallpaper-library-selected-count'].forEach((id) => {
    elements[id] = {
      textContent: '',
      innerHTML: '',
      dataset: {},
      classList: makeClassList(),
      setAttribute(name, value) { this[name] = value; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      addEventListener() {},
    };
  });
  elements['wallpaper-library-preview'].querySelectorAll = () => [];
  elements['wallpaper-library-list'].querySelectorAll = () => [];
  const context = {
    console,
    Promise,
    playlistRefreshToken: 0,
    localStorage: { getItem() { return null; }, setItem() {} },
    Set,
    Map,
    setTimeout,
    clearTimeout,
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement() { return { className: '', textContent: '', remove() {} }; },
      addEventListener() {},
    },
    window: {
      desktopWindow: {
        wallpaperWindowsLiveStatus: async () => ({ ok: true }),
        wallpaperWindowsExportStatus: async () => ({ ok: true, state: 'running' }),
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(read('public/js/modules/07-fx/10-wallpaper-library-panel.js'), context, {
    filename: '10-wallpaper-library-panel.js',
  });
  return { context, elements };
}

test('详情关闭后，过期实时预览响应不能回写全局状态', async () => {
  const { context, elements } = createWallpaperHarness();
  let resolveStatus;
  context.window.desktopWindow.wallpaperWindowsLiveStatus = () => new Promise((resolve) => {
    resolveStatus = resolve;
  });
  context.wallpaperLibraryState.baseUrl = 'http://192.168.1.107:8130';
  context.wallpaperLibraryState.selectedId = 'scene-a';
  elements['wallpaper-library-status'].textContent = '基线状态';

  const pending = context.wallpaperLibraryCheckLiveStatus();
  context.wallpaperLibraryState.selectedId = '';
  resolveStatus({ ok: false });
  await pending;

  assert.equal(elements['wallpaper-library-status'].textContent, '基线状态');
});

test('停止或关闭详情后，过期 Scene 导出响应不能重启轮询或改写任务', async () => {
  const { context } = createWallpaperHarness();
  let resolveStatus;
  context.window.desktopWindow.wallpaperWindowsExportStatus = () => new Promise((resolve) => {
    resolveStatus = resolve;
  });
  context.wallpaperLibraryRenderExport = () => {};
  context.wallpaperLibraryState.baseUrl = 'http://192.168.1.107:8130';
  context.wallpaperLibraryState.exportTask = {
    sceneId: 'scene-a', id: 'job-a', state: 'running', stopped: false,
  };

  const task = context.wallpaperLibraryState.exportTask;
  const pending = context.pollWindowsSceneExport();
  task.stopped = true;
  task.state = 'stopped';
  resolveStatus({ ok: true, state: 'running' });
  await pending;

  assert.equal(task.state, 'stopped');
  assert.equal(context.wallpaperLibraryState.exportPoller, 0);
});

test('关闭壁纸库后释放列表媒体观察器、滚动定时器和卡片节点', () => {
  const { context, elements } = createWallpaperHarness();
  let disconnected = 0;
  let cleared = 0;
  const media = [
    { tagName: 'IMG', removeAttribute(name) { this.removed = name; } },
    { tagName: 'VIDEO', pause() { this.paused = true; }, removeAttribute(name) { this.removed = name; }, load() { this.loaded = true; } },
  ];
  const list = elements['wallpaper-library-list'];
  list._wallpaperMediaObserver = { disconnect() { disconnected += 1; } };
  list._wallpaperScrollStopTimer = setTimeout(() => {}, 10000);
  list.querySelectorAll = (selector) => selector === '[data-wallpaper-preview]' ? media : [];
  list.innerHTML = '<div data-wallpaper-id="a"><img data-wallpaper-preview="a"></div>';
  context.wallpaperLibraryState.baseUrl = 'http://192.168.1.107:8130';
  context.closeWallpaperLibraryPanel();
  cleared += list._wallpaperScrollStopTimer === 0 ? 1 : 0;

  assert.equal(disconnected, 1);
  assert.equal(cleared, 1);
  assert.equal(list._wallpaperMediaObserver, null);
  assert.equal(media[0].removed, 'src');
  assert.equal(media[1].paused, true);
  assert.equal(media[1].loaded, true);
  assert.equal(list.innerHTML, '<div class="wallpaper-library-empty">壁纸库已关闭。</div>');
});

test('关闭壁纸库后，迟到的连接结果不能重绘隐藏列表', async () => {
  const { context, elements } = createWallpaperHarness();
  let resolveConnect;
  context.window.desktopWindow.wallpaperWindowsConnect = () => new Promise((resolve) => { resolveConnect = resolve; });
  context.wallpaperLibraryState.search = '';
  context.wallpaperLibraryState.type = 'all';
  context.wallpaperLibraryState.sort = 'title';
  elements['wallpaper-library-modal'].classList.add('show');
  const pending = context.connectWindowsWallpaperSource({ baseUrl: 'http://192.168.1.107:8130' });
  context.closeWallpaperLibraryPanel();
  resolveConnect({ ok: true, baseUrl: 'http://192.168.1.107:8130', records: [{ id: 'late', title: 'late', type: 'image' }] });
  await pending;

  assert.equal(elements['wallpaper-library-list'].innerHTML, '<div class="wallpaper-library-empty">壁纸库已关闭。</div>');
});

function createPlaylistHarness() {
  const elements = {
    'pl-list': { innerHTML: '' },
    'podcast-list': { innerHTML: '' },
  };
  const context = {
    console,
    Promise,
    playlistRefreshToken: 0,
    loginStatus: { loggedIn: true },
    qqLoginStatus: { loggedIn: false },
    kugouLoginStatus: { loggedIn: false },
    qishuiLoginStatus: { loggedIn: false },
    spotifyLoginStatus: { loggedIn: false },
    userPlaylists: [],
    qqPlaylists: [],
    kugouPlaylists: [],
    qishuiPlaylists: [],
    spotifyPlaylists: [],
    myPodcastCollections: [],
    emptyHomeActive: false,
    window: { gsap: null },
    document: {
      getElementById(id) { return elements[id] || null; },
    },
    resetPlaylistPanelRenderLimit() {},
    miniQueueSkeleton() { return 'loading'; },
    isPlaylistPanelVisibleForRender() { return false; },
    renderUserPlaylistsList() {},
    renderMyPodcastCollections() {},
    renderHomeDiscover() {},
    scheduleShelfRebuild() {},
  };
  const shell = read('public/js/modules/06-lyrics/01-playlist-panel-shell.js');
  const start = shell.indexOf('async function refreshUserPlaylists(force)');
  const end = shell.indexOf('\n// ============================================================', start);
  vm.createContext(context);
  vm.runInContext(shell.slice(start, end), context, { filename: '01-playlist-panel-shell.js' });
  return { context };
}

test('并发刷新歌单时，旧响应不能覆盖后发请求的新结果', async () => {
  const { context } = createPlaylistHarness();
  const pending = [];
  context.apiJson = (url) => {
    if (url === '/api/user/playlists') {
      return new Promise((resolve) => pending.push(resolve));
    }
    return Promise.resolve({ collections: [] });
  };

  const first = context.refreshUserPlaylists(true);
  const second = context.refreshUserPlaylists(true);
  pending[1]({ playlists: [{ id: 'newest' }] });
  pending[0]({ playlists: [{ id: 'stale' }] });
  await Promise.all([first, second]);

  assert.equal(context.userPlaylists[0].id, 'newest');
});
