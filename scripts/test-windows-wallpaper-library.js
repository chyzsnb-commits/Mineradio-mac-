'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  WindowsWallpaperClient,
  normalizeWindowsWallpaperRecord,
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
    fetchImpl: async (url) => url.endsWith('/api/ping')
      ? jsonResponse(200, { ok: true })
      : jsonResponse(200, { ok: true, records: [] }),
  });
  const result = await client.discover(500);
  assert.equal(result.ok, true);
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].baseUrl, 'http://192.168.1.20:8123');
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
  assert.match(main, /mineradio-wallpaper-windows-discover/);
  assert.match(main, /dialog\.showSaveDialog/);
  assert.match(panel, /function discoverWindowsWallpaperSources\(/);
  assert.match(panel, /wallpaperWindowsLiveStatus/);
  assert.match(panel, /wallpaperWindowsExportStart/);
  assert.match(panel, /wallpaperWindowsExportStatus/);
  assert.match(panel, /wallpaperWindowsExportDownload/);
  assert.match(panel, /function wallpaperLibraryStopLivePreview\(/);
  assert.doesNotMatch(panel, /getDisplayMedia/);
  assert.ok(html.includes('Windows 壁纸库'));
  assert.ok(html.includes('onclick="openWallpaperLibraryPanel()">Windows 壁纸库</button>'));
  assert.ok(html.includes('id="wallpaper-library-search"'));
  assert.ok(html.includes('id="wallpaper-library-export"'));
  assert.match(css, /\.wallpaper-live-preview/);
  assert.match(css, /\.wallpaper-export-state/);
});
