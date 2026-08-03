const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Touch Bar IPC 在窗口重建后只保留一个监听并更新标题与状态', () => {
  class FakeItem {
    constructor(options) { Object.assign(this, options || {}); }
  }
  class FakeTouchBar {
    constructor(options) { Object.assign(this, options || {}); }
  }
  FakeTouchBar.TouchBarLabel = FakeItem;
  FakeTouchBar.TouchBarButton = FakeItem;
  FakeTouchBar.TouchBarSpacer = FakeItem;

  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      this.destroyed = false;
      this.touchBar = null;
    }
    isDestroyed() { return this.destroyed; }
    setTouchBar(value) { this.touchBar = value; }
  }

  const sandbox = {
    module: { exports: {} },
    exports: {},
    require(name) {
      if (name === 'electron') return { TouchBar: FakeTouchBar };
      throw new Error(`Unexpected require: ${name}`);
    },
    process: { platform: 'darwin' },
    console,
  };
  vm.runInNewContext(read('desktop/touchbar.js'), sandbox, { filename: 'desktop/touchbar.js' });
  const touchbar = sandbox.module.exports;
  const ipcMain = new EventEmitter();
  const first = new FakeWindow();
  const second = new FakeWindow();

  touchbar.init({ window: first, sendAction() {}, ipcMain });
  touchbar.init({ window: second, sendAction() {}, ipcMain });
  assert.equal(ipcMain.listenerCount('touchbar-update-track'), 1, '窗口重建不能重复监听 IPC');

  ipcMain.emit('touchbar-update-track', null, {
    title: '一首标题非常非常非常非常非常非常非常长的测试歌曲',
    artist: '测试歌手',
    isPlaying: true,
  });
  assert.ok(second.touchBar.items[0].label.length <= 32);
  assert.equal(second.touchBar.items[3].label, '⏸');

  second.emit('closed');
  assert.equal(ipcMain.listenerCount('touchbar-update-track'), 0, '窗口关闭后应移除 IPC 监听');
});

test('渲染进程桥接切歌和播放状态到 Touch Bar', () => {
  const preload = read('desktop/preload.js');
  const trackUi = read('public/js/modules/02-visual/15-ripples-cover-depth.js');
  const playbackState = read('public/js/modules/05-playback/12-playback-switch-core.js');

  assert.match(preload, /updateTouchBarTrack:\s*\(payload\)\s*=>\s*ipcRenderer\.send\(['"]touchbar-update-track['"]/);
  assert.match(trackUi, /function syncTouchBarTrack\(/);
  assert.match(trackUi, /function updateControlTrackInfo\([\s\S]*?syncTouchBarTrack\(song\)/);
  assert.match(playbackState, /syncTouchBarTrack\(null, isPlaying\)/);
});

test('Touch Bar 在主页面加载前初始化，避免错过首个歌曲状态', () => {
  const source = read('desktop/main.js');
  const createStart = source.indexOf('async function createWindow()');
  const loadAt = source.indexOf('await mainWindow.loadURL', createStart);
  const initAt = source.indexOf('touchbar.init(', createStart);

  assert.ok(createStart >= 0 && initAt > createStart && initAt < loadAt);
  assert.equal((source.match(/touchbar\.init\(/g) || []).length, 1, '主进程只保留一个 Touch Bar 初始化入口');
});
