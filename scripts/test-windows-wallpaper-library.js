'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  init,
  WindowsWallpaperClient,
  normalizeWindowsWallpaperRecord,
  normalizeWindowsWallpaperRecords,
} = require('../desktop/wallpaper-library-bridge');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

function binaryResponse(status, mime, bytes, headers) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        const key = String(name || '').toLowerCase();
        return key === 'content-type' ? mime : String(headers && headers[key] || '');
      },
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

test('壁纸桥初始化后必须暴露可用的 Windows 发现与连接入口', () => {
  const bridge = init({ userDataPath: path.join(root, '.tmp-wallpaper-library-test') });
  assert.equal(typeof bridge.discoverWindowsSources, 'function');
  assert.equal(typeof bridge.connectWindowsSource, 'function');
});

test('Windows 服务必须先通过 ping，之后才读取壁纸列表', async () => {
  const calls = [];
  const client = new WindowsWallpaperClient({
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith('/api/ping')) return jsonResponse(200, { ok: true, host: 'Windows Mineradio' });
      if (url.endsWith('/api/wallpapers')) return jsonResponse(200, {
        ok: true,
        records: [{ id: 'scene-1', title: '实时场景', type: 'scene', scene: 'scene-1', preview: '/thumb.jpg' }],
      });
      throw new Error('unexpected request');
    },
  });

  const result = await client.connect('http://192.168.1.20:8123');
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    'http://192.168.1.20:8123/api/ping',
    'http://192.168.1.20:8123/api/wallpapers',
  ]);
  assert.equal(result.records[0].type, 'scene');
  assert.equal(result.records[0].liveUrl, 'http://192.168.1.20:8123/api/live/scene-1');
});

test('ping 未确认 ok 时不能把广播地址标记为在线', async () => {
  const client = new WindowsWallpaperClient({
    fetchImpl: async () => jsonResponse(200, { ok: false }),
  });
  const result = await client.connect('http://192.168.1.20:8123');
  assert.deepEqual(result, { ok: false, error: 'PING_REJECTED' });
});

test('UDP 广播只发现通过 ping 验证的 Windows 服务', async () => {
  class FakeSocket {
    constructor() { this.handlers = {}; }
    on(name, handler) { this.handlers[name] = handler; }
    bind(port, callback) {
      assert.equal(port, 45678);
      callback();
      queueMicrotask(() => this.handlers.message(Buffer.from('MINERADIO_WALLPAPER 192.168.1.20:8123')));
    }
    close() {}
  }
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new FakeSocket() },
    networkInterfaces: () => ({}),
    fetchImpl: async (url) => url.endsWith('/api/ping')
      ? jsonResponse(200, { ok: true })
      : jsonResponse(200, { ok: true, records: [] }),
  });
  const result = await client.discover(500);
  assert.equal(result.ok, true);
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].baseUrl, 'http://192.168.1.20:8123');
});

test('UDP 被过滤时扫描当前私有子网并找到通过 ping 的 Windows 服务', async () => {
  class SilentSocket {
    on() {}
    bind(_port, callback) { callback(); }
    close() {}
  }
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new SilentSocket() },
    networkInterfaces: () => ({ en0: [{ family: 'IPv4', internal: false, address: '192.168.1.120', netmask: '255.255.255.0' }] }),
    fetchImpl: async (url) => {
      if (url.startsWith('http://192.168.1.121:8123/api/ping')) return jsonResponse(200, { ok: true, name: 'mineradio-wallpaper' });
      if (url.startsWith('http://192.168.1.121:8123/api/wallpapers')) return jsonResponse(200, { ok: true, records: [] });
      return jsonResponse(404, { ok: false });
    },
  });
  const result = await client.discover(500);
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].baseUrl, 'http://192.168.1.121:8123');
});

test('UDP 监听报错时仍回退到私网 ping 探测', async () => {
  class FailingSocket {
    constructor() { this.handlers = {}; }
    on(name, handler) { this.handlers[name] = handler; }
    bind() { queueMicrotask(() => this.handlers.error(new Error('udp unavailable'))); }
    close() {}
  }
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new FailingSocket() },
    networkInterfaces: () => ({ en0: [{ family: 'IPv4', internal: false, address: '10.42.0.8', netmask: '255.255.255.0' }] }),
    fetchImpl: async (url) => {
      if (url.startsWith('http://10.42.0.9:8123/api/ping')) return jsonResponse(200, { ok: true });
      if (url.startsWith('http://10.42.0.9:8123/api/wallpapers')) return jsonResponse(200, { ok: true, records: [] });
      return jsonResponse(404, { ok: false });
    },
  });
  const result = await client.discover(500);
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].baseUrl, 'http://10.42.0.9:8123');
});

test('壁纸记录兼容 image、video 和 scene 字段，并保留无缩略图状态', () => {
  const image = normalizeWindowsWallpaperRecord({ id: 'img', title: '图片', image: true }, 'http://10.0.0.2:8123');
  const video = normalizeWindowsWallpaperRecord({ id: 'vid', title: '视频', video: '/preview.mp4' }, 'http://10.0.0.2:8123');
  const scene = normalizeWindowsWallpaperRecord({ id: 'scn', title: '场景', scene: 'demo' }, 'http://10.0.0.2:8123');

  assert.equal(image.type, 'image');
  assert.equal(image.previewUrl, '');
  assert.equal(image.fileUrl, 'http://10.0.0.2:8123/api/wallpaper-file?id=img');
  assert.equal(video.type, 'video');
  assert.equal(video.previewUrl, 'http://10.0.0.2:8123/preview.mp4');
  assert.equal(scene.type, 'scene');
  assert.equal(scene.liveUrl, 'http://10.0.0.2:8123/api/live/demo');
});

test('Windows 的 Scene 预览图必须复用现有录制导出链，不能作为低清图片下载', () => {
  const records = normalizeWindowsWallpaperRecords([
    { id: '3339375188/preview.jpg', title: 'Kazemi Flowers', type: 'image', previewUrl: '/api/wallpaper-file?id=3339375188%2Fpreview.jpg', projectType: 'Scene', sceneNeedsEngine: true },
    { id: '3434913151/preview.jpg', title: '海绵宝宝', type: 'image', projectType: 'Video' },
    { id: '3434913151/Conch-Street-4K.mp4', title: '海绵宝宝', type: 'video', url: '/api/wallpaper-file?id=3434913151%2FConch-Street-4K.mp4', projectType: 'Video' },
  ], 'http://10.0.0.2:8123');

  assert.equal(records.length, 2);
  assert.deepEqual(records[0], {
    id: '3339375188/preview.jpg',
    title: 'Kazemi Flowers',
    type: 'scene',
    previewUrl: 'http://10.0.0.2:8123/api/wallpaper-file?id=3339375188%2Fpreview.jpg',
    fileUrl: '',
    sceneId: '3339375188',
    liveUrl: 'http://10.0.0.2:8123/api/live/3339375188',
    sourceHost: 'http://10.0.0.2:8123',
  });
  assert.equal(records[1].id, '3434913151/Conch-Street-4K.mp4');
  assert.equal(records[1].type, 'video');
});

test('Scene 导出只接受 202 任务，完成后才允许下载', async () => {
  const client = new WindowsWallpaperClient({
    fetchImpl: async (url, options) => {
      if (url.includes('/api/export-scene?')) {
        assert.equal(options.method, 'POST');
        return jsonResponse(202, { ok: true, id: 'job-7', scene: 'demo', seconds: 30, state: 'queued', statusUrl: '/api/export-jobs?id=job-7' });
      }
      if (url.endsWith('/api/export-jobs?id=job-7')) return jsonResponse(200, { ok: true, id: 'job-7', state: 'completed', output: 'demo.mp4' });
      throw new Error('unexpected request ' + url);
    },
  });

  const started = await client.startSceneExport('http://192.168.1.20:8123', 'demo', 30);
  assert.equal(started.state, 'queued');
  const status = await client.getExportJob('http://192.168.1.20:8123', 'job-7');
  assert.equal(status.state, 'completed');
  assert.equal(status.downloadUrl, 'http://192.168.1.20:8123/api/exported-file?name=demo.mp4');
});

test('已验证 Windows 服务的图片视频与已完成 Scene 可下载为本地背景媒体', async () => {
  const calls = [];
  const client = new WindowsWallpaperClient({
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith('/api/ping')) return jsonResponse(200, { ok: true });
      if (url.endsWith('/api/wallpapers')) return jsonResponse(200, { ok: true, records: [] });
      if (url.endsWith('/api/wallpaper-file?id=poster')) return binaryResponse(200, 'image/png', Buffer.from([137, 80, 78, 71]));
      if (url.endsWith('/api/exported-file?name=scene.mp4')) return binaryResponse(200, 'video/mp4', Buffer.from([0, 0, 0, 24]));
      throw new Error('unexpected request ' + url);
    },
  });

  await client.connect('http://192.168.1.20:8123');
  const image = await client.downloadWallpaperMedia('http://192.168.1.20:8123', 'poster', 'image');
  const scene = await client.downloadExportedMedia('http://192.168.1.20:8123', 'scene.mp4');

  assert.deepEqual(image, { ok: true, mime: 'image/png', name: 'wallpaper-poster.png', bytes: Buffer.from([137, 80, 78, 71]) });
  assert.deepEqual(scene, { ok: true, mime: 'video/mp4', name: 'scene.mp4', bytes: Buffer.from([0, 0, 0, 24]) });
  assert.deepEqual(calls, [
    'http://192.168.1.20:8123/api/ping',
    'http://192.168.1.20:8123/api/wallpapers',
    'http://192.168.1.20:8123/api/wallpaper-file?id=poster',
    'http://192.168.1.20:8123/api/exported-file?name=scene.mp4',
  ]);
});

test('背景下载拒绝未验证来源和错误媒体类型', async () => {
  const client = new WindowsWallpaperClient({
    fetchImpl: async () => binaryResponse(200, 'text/html', Buffer.from('not media')),
  });
  assert.deepEqual(await client.downloadWallpaperMedia('http://192.168.1.20:8123', 'poster', 'image'), { ok: false, error: 'UNVERIFIED_SOURCE' });
  client.trustedBases.add('http://192.168.1.20:8123');
  assert.deepEqual(await client.downloadWallpaperMedia('http://192.168.1.20:8123', 'poster', 'image'), { ok: false, error: 'MEDIA_TYPE_REJECTED' });
});

test('背景下载拒绝超过本地库安全上限的响应并允许调用者重试', async () => {
  const client = new WindowsWallpaperClient({
    fetchImpl: async () => binaryResponse(200, 'video/mp4', Buffer.from([0, 0, 0, 24]), { 'content-length': String(256 * 1024 * 1024 + 1) }),
  });
  client.trustedBases.add('http://192.168.1.20:8123');
  assert.deepEqual(await client.downloadWallpaperMedia('http://192.168.1.20:8123', 'clip', 'video'), { ok: false, error: 'MEDIA_TOO_LARGE' });
});

test('壁纸库滚动时延迟挂载媒体并停用重绘成本高的卡片效果', () => {
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  const css = read('public/css/index.css');

  assert.match(panel, /loading="lazy" decoding="async" data-wallpaper-preview=/, '图片缩略图应延迟加载并异步解码');
  assert.match(panel, /preload="none" data-wallpaper-preview=/, '视频缩略图不应在首屏一次性预读');
  assert.match(panel, /function wallpaperLibraryBindLazyMedia\(/, '缩略图应由可视区观察器按需挂载');
  assert.match(panel, /new IntersectionObserver\(/, '按需挂载必须以壁纸网格为观察根节点');
  assert.match(panel, /function wallpaperLibraryMarkScrollActivity\(/, '滚动期间应切换低开销状态');
  assert.match(panel, /addEventListener\('scroll',\s*function \(\) \{ wallpaperLibraryMarkScrollActivity\(list\); \},\s*\{ passive: true \}\)/, '滚动监听必须为被动监听');
  assert.match(css, /\.wallpaper-library-list\{[^}]*overscroll-behavior:contain[^}]*contain:layout paint[^}]*will-change:scroll-position[^}]*transform:translateZ\(0\)/, '滚动网格应独立合成，限制布局与绘制影响范围');
  assert.match(css, /\.wallpaper-library-list\.is-scrolling \.wallpaper-library-card:hover\{[^}]*transform:none[^}]*box-shadow:/, '滚动中不能触发卡片位移和重阴影');
});

test('Windows 壁纸库入口接通发现、实时预览、导出与用户选定目录下载', () => {
  const preload = read('desktop/preload.js');
  const main = read('desktop/main.js');
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  const html = read('public/index.html');
  const css = read('public/css/index.css');

  assert.match(preload, /wallpaperWindowsDiscover:/);
  assert.match(preload, /wallpaperWindowsConnect:/);
  assert.match(preload, /wallpaperWindowsLiveStatus:/);
  assert.match(preload, /wallpaperWindowsExportStart:/);
  assert.match(preload, /wallpaperWindowsExportStatus:/);
  assert.match(preload, /wallpaperWindowsExportDownload:/);
  assert.match(preload, /wallpaperWindowsDownloadMedia:/);
  assert.match(main, /mineradio-wallpaper-windows-discover/);
  assert.match(main, /dialog\.showSaveDialog/);
  assert.match(panel, /function discoverWindowsWallpaperSources\(/);
  assert.match(panel, /wallpaperWindowsLiveStatus/);
  assert.match(panel, /wallpaperWindowsExportStart/);
  assert.match(panel, /wallpaperWindowsExportStatus/);
  assert.match(panel, /wallpaperWindowsExportDownload/);
  assert.match(panel, /function applyWindowsWallpaperToMineradio\(/);
  assert.match(panel, /下载并应用到 Mineradio/);
  assert.match(panel, /应用 MP4 到 Mineradio/);
  assert.match(panel, /putCustomBackgroundBlob/);
  assert.match(panel, /setCustomBackgroundMedia/);
  assert.match(panel, /function wallpaperLibraryStopLivePreview\(/);
  assert.doesNotMatch(panel, /getDisplayMedia/);
  assert.ok(html.includes('Windows 壁纸库'));
  assert.ok(html.includes('onclick="openWallpaperLibraryPanel()">Windows 壁纸库</button>'));
  assert.ok(html.includes('id="wallpaper-library-read-ip"'), '应提供明确的自动读取 Windows IP 操作');
  assert.ok(html.includes('id="wallpaper-library-discovered-ip"'), '应显示已读取的 Windows 内网地址');
  assert.match(panel, /function wallpaperLibraryRenderDiscoveredIp\(/);
  assert.match(panel, /自动读取 Windows IP/);
  assert.ok(html.includes('id="wallpaper-library-search"'));
  assert.ok(html.includes('id="wallpaper-library-export"'));
  assert.match(css, /\.wallpaper-live-preview/);
  assert.match(css, /\.wallpaper-export-state/);
  assert.match(html, /class="wallpaper-library-kicker"/);
  assert.match(html, /class="wallpaper-library-toolbar"/);
  assert.match(html, /class="wallpaper-library-search-row"/, '搜索应独立为 Windows 同款的主工具栏行');
  assert.match(html, /class="wallpaper-library-source-row"/, 'Mac 专属连接控件应置于次行，不能挤占搜索主行');
  assert.match(html, /id="wallpaper-library-details-drawer"/);
  assert.match(panel, /function closeWallpaperLibraryDetail\(/);
  assert.match(css, /\.wallpaper-library-search-row\{[^}]*grid-template-columns:.*minmax\(0,1fr\)/, '主工具栏应让搜索输入占据主要宽度');
  assert.match(css, /\.wallpaper-library-source-row\{[^}]*grid-template-columns:/, '连接控件必须有独立的响应式布局');
  assert.match(css, /\.wallpaper-library-list\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, '桌面端应保持 Windows 风格的四列网格');
  assert.match(css, /\.wallpaper-library-card\{[^}]*aspect-ratio:16\/9/);
  assert.match(css, /\.wallpaper-library-card\{[^}]*width:100%[^}]*min-height:128px[^}]*box-sizing:border-box/, '网格卡片必须有独立的尺寸兜底，不能因媒体绝对定位而折叠为文字行高');
  assert.match(css, /\.wallpaper-library-detail\{[^}]*height:100%[^}]*min-height:0[^}]*box-sizing:border-box[^}]*overflow-y:auto/, '详情抽屉应在自身内部滚动，不能被外层弹窗裁掉导出操作');
  assert.match(css, /\.wallpaper-library-body:has\(\.wallpaper-library-details-drawer\.show\)\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(360px,42%\)/, '桌面端打开详情时必须为右侧详情预留独立列，不能覆盖并挤压网格');
  assert.match(css, /@media \(max-width:920px\)\{[\s\S]*?\.wallpaper-library-body:has\(\.wallpaper-library-details-drawer\.show\) \.wallpaper-library-list\{display:none\}/, '窗口空间不足时详情必须完整全宽显示，不能保留被裁切的侧栏');
});
