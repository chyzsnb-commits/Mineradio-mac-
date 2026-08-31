'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');

const {
  WindowsWallpaperClient,
  normalizeWindowsBaseUrl,
  normalizeWindowsWallpaperRecords,
  parseWindowsDiscoveryAnnouncement,
} = require('../desktop/wallpaper-library-bridge');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function streamResponse(status, chunks, headers = {}) {
  return new Response(Readable.toWeb(Readable.from(chunks)), { status, headers });
}

function jsonResponse(status, body) {
  return streamResponse(status, [Buffer.from(JSON.stringify(body))], {
    'content-type': 'application/json',
  });
}

test('Wallpaper 子系统只暴露正在使用的 Windows 桥接与私有下载协议', () => {
  const bridge = read('desktop/wallpaper-library-bridge.js');
  const main = read('desktop/main.js');
  const preload = read('desktop/preload.js');
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');

  assert.match(bridge, /class WindowsWallpaperClient/);
  assert.match(bridge, /registerWallpaperLibraryScheme/);
  assert.match(main, /registerWallpaperLibraryScheme\(protocol\)/);
  assert.match(main, /function wallpaperLibraryTrustedSender\(event\)/);
  assert.match(main, /UNTRUSTED_SENDER/);

  [
    'mineradio-wallpaper-windows-discover',
    'mineradio-wallpaper-windows-connect',
    'mineradio-wallpaper-windows-live-status',
    'mineradio-wallpaper-windows-export-start',
    'mineradio-wallpaper-windows-export-status',
    'mineradio-wallpaper-windows-exported-videos',
    'mineradio-wallpaper-windows-download-media',
    'mineradio-wallpaper-windows-export-download',
  ].forEach((channel) => assert.ok(main.includes(channel), `main 缺少 ${channel}`));

  [
    'wallpaperWindowsDiscover',
    'wallpaperWindowsConnect',
    'wallpaperWindowsLiveStatus',
    'wallpaperWindowsExportStart',
    'wallpaperWindowsExportStatus',
    'wallpaperWindowsExportedVideos',
    'wallpaperWindowsDownloadMedia',
    'wallpaperWindowsExportDownload',
  ].forEach((name) => assert.match(preload, new RegExp(`${name}:`), `preload 缺少 ${name}`));

  assert.match(panel, /function openWallpaperLibraryPanel\(/);
  assert.match(panel, /function wallpaperLibraryBindLazyMedia\(/);
  assert.match(panel, /function applyWindowsWallpaperToMineradio\(/);
  assert.match(panel, /fetch\(result\.url\)/);
  assert.doesNotMatch(panel, /result\.bytes/);
  assert.doesNotMatch(main, /mineradio-wallpaper-library-(?:scan-dir|scan-http|list|media)/);
  assert.doesNotMatch(preload, /wallpaperLibrary(?:ScanDir|ScanHttp|List|Media)/);
  assert.equal(fs.existsSync(path.join(root, 'desktop', 'wallpaper-engine-library.js')), false);
});

test('Windows 地址只接受显式 HTTP 端口，广播保留动态端口', () => {
  assert.equal(normalizeWindowsBaseUrl('https://192.168.1.20:8123'), '');
  assert.equal(normalizeWindowsBaseUrl('http://192.168.1.20'), '');
  assert.equal(normalizeWindowsBaseUrl('http://192.168.1.20:1023'), '');
  assert.equal(normalizeWindowsBaseUrl('http://192.168.1.20:8128/'), 'http://192.168.1.20:8128');
  assert.deepEqual(parseWindowsDiscoveryAnnouncement('MINERADIO_WALLPAPER 192.168.1.20:8144'), {
    host: '192.168.1.20',
    baseUrl: 'http://192.168.1.20:8144',
  });
});

test('连接必须先验证 ping，再读取壁纸列表', async () => {
  const calls = [];
  const client = new WindowsWallpaperClient({
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith('/api/ping')) return jsonResponse(200, { ok: true, host: 'Windows Mineradio' });
      if (url.endsWith('/api/wallpapers')) return jsonResponse(200, { ok: true, records: [] });
      throw new Error(`unexpected request ${url}`);
    },
  });

  const result = await client.connect('http://192.168.1.20:8128');
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    'http://192.168.1.20:8128/api/ping',
    'http://192.168.1.20:8128/api/wallpapers',
  ]);
});

test('Scene 预览归并为导出任务，不会误当低清图片下载', () => {
  const records = normalizeWindowsWallpaperRecords([
    { id: '3339375188/preview.jpg', title: 'Scene', type: 'image', previewUrl: '/api/wallpaper-file?id=3339375188%2Fpreview.jpg', projectType: 'Scene', sceneNeedsEngine: true },
    { id: '3434913151/preview.jpg', title: 'Video', type: 'image', projectType: 'Video' },
    { id: '3434913151/main.mp4', title: 'Video', type: 'video', url: '/api/wallpaper-file?id=3434913151%2Fmain.mp4', projectType: 'Video' },
  ], 'http://10.0.0.2:8123');

  assert.equal(records.length, 2);
  assert.equal(records[0].type, 'scene');
  assert.equal(records[0].sceneId, '3339375188');
  assert.equal(records[0].fileUrl, '');
  assert.equal(records[1].id, '3434913151/main.mp4');
  assert.equal(records[1].type, 'video');
});

test('媒体下载拒绝未经验证的 Windows 来源', async () => {
  const client = new WindowsWallpaperClient({
    fetchImpl: async () => { throw new Error('不应请求未验证来源'); },
  });
  assert.deepEqual(
    await client.downloadWallpaperMedia('http://192.168.1.20:8123', 'poster', 'image'),
    { ok: false, error: 'UNVERIFIED_SOURCE' },
  );
});

test('JSON 响应在流式读取阶段超过上限立即拒绝', async () => {
  const oversized = Buffer.alloc(40, 0x61);
  const client = new WindowsWallpaperClient({
    maxListBytes: 32,
    fetchImpl: async () => streamResponse(200, [Buffer.from('{"ok":true,"x":"'), oversized, Buffer.from('"}')], {
      'content-type': 'application/json',
    }),
  });

  const result = await client.requestJson('http://192.168.1.20:8123/api/wallpapers');
  assert.deepEqual(result, { ok: false, error: 'HTTP_RESPONSE_TOO_LARGE' });
});

test('媒体通过限额流写入临时文件并由私有协议读取，不跨 IPC 返回 Buffer', async (t) => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mineradio-wallpaper-test-'));
  t.after(() => fs.promises.rm(tempRoot, { recursive: true, force: true }));
  const media = Buffer.from('safe-streamed-image');
  let protocolHandler = null;
  let arrayBufferCalled = false;
  const client = new WindowsWallpaperClient({
    tempRoot,
    maxMediaBytes: 64,
    fetchImpl: async (url) => {
      if (url.endsWith('/api/ping')) return jsonResponse(200, { ok: true, host: 'Windows Mineradio' });
      if (url.endsWith('/api/wallpapers')) return jsonResponse(200, { ok: true, records: [] });
      const response = streamResponse(200, [media.subarray(0, 5), media.subarray(5)], {
        'content-type': 'image/png',
      });
      response.arrayBuffer = async () => { arrayBufferCalled = true; throw new Error('arrayBuffer must not be used'); };
      return response;
    },
  });
  await client.installProtocol({
    handle(scheme, handler) {
      assert.equal(scheme, 'mineradio-wallpaper');
      protocolHandler = handler;
    },
  });
  assert.equal((await client.connect('http://192.168.1.20:8123')).ok, true);

  const result = await client.downloadWallpaperMedia('http://192.168.1.20:8123', 'poster', 'image');
  assert.equal(result.ok, true);
  assert.match(result.url, /^mineradio-wallpaper:\/\/download\/[a-f0-9]{48}$/);
  assert.equal('bytes' in result, false);
  assert.equal(arrayBufferCalled, false);

  const local = await protocolHandler(new Request(result.url));
  assert.equal(local.status, 200);
  assert.equal(local.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await local.arrayBuffer()), media);
});

test('chunked 媒体超过限额时中止并清理临时文件', async (t) => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mineradio-wallpaper-limit-'));
  t.after(() => fs.promises.rm(tempRoot, { recursive: true, force: true }));
  const client = new WindowsWallpaperClient({
    tempRoot,
    maxMediaBytes: 5,
    fetchImpl: async (url) => {
      if (url.endsWith('/api/ping')) return jsonResponse(200, { ok: true });
      if (url.endsWith('/api/wallpapers')) return jsonResponse(200, { ok: true, records: [] });
      return streamResponse(200, [Buffer.from('1234'), Buffer.from('5678')], { 'content-type': 'video/mp4' });
    },
  });
  await client.installProtocol({ handle() {} });
  assert.equal((await client.connect('http://192.168.1.20:8123')).ok, true);

  assert.deepEqual(
    await client.downloadWallpaperMedia('http://192.168.1.20:8123', 'clip', 'video'),
    { ok: false, error: 'MEDIA_TOO_LARGE' },
  );
  assert.deepEqual(await fs.promises.readdir(tempRoot), []);
});

test('导出保存必须来自已验证来源，并校验 MIME/扩展与流式大小上限', async (t) => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mineradio-wallpaper-export-'));
  t.after(() => fs.promises.rm(tempRoot, { recursive: true, force: true }));
  const destination = path.join(tempRoot, 'scene.mp4');
  let mode = 'valid';
  let exportFetches = 0;
  const client = new WindowsWallpaperClient({
    tempRoot: path.join(tempRoot, 'cache'),
    maxMediaBytes: 8,
    fetchImpl: async (url) => {
      if (url.endsWith('/api/ping')) return jsonResponse(200, { ok: true });
      if (url.endsWith('/api/wallpapers')) return jsonResponse(200, { ok: true, records: [] });
      exportFetches += 1;
      if (mode === 'mime') return streamResponse(200, [Buffer.from('1234')], { 'content-type': 'video/webm' });
      if (mode === 'large') return streamResponse(200, [Buffer.from('123456'), Buffer.from('7890')], { 'content-type': 'video/mp4' });
      return streamResponse(200, [Buffer.from('12345678')], { 'content-type': 'video/mp4' });
    },
  });

  assert.deepEqual(
    await client.downloadExportedFile('http://192.168.1.20:8123', 'scene.mp4', destination),
    { ok: false, error: 'UNVERIFIED_SOURCE' },
  );
  assert.equal(exportFetches, 0);
  assert.equal((await client.connect('http://192.168.1.20:8123')).ok, true);

  mode = 'mime';
  assert.deepEqual(
    await client.downloadExportedFile('http://192.168.1.20:8123', 'scene.mp4', destination),
    { ok: false, error: 'MEDIA_TYPE_REJECTED' },
  );
  mode = 'large';
  assert.deepEqual(
    await client.downloadExportedFile('http://192.168.1.20:8123', 'scene.mp4', destination),
    { ok: false, error: 'MEDIA_TOO_LARGE' },
  );
  assert.equal(fs.existsSync(destination), false);
  assert.equal((await fs.promises.readdir(tempRoot)).some((name) => name.includes('.mineradio-part')), false);

  mode = 'valid';
  assert.deepEqual(
    await client.downloadExportedFile('http://192.168.1.20:8123', 'scene.mp4', destination),
    { ok: true, filePath: destination },
  );
  assert.equal(await fs.promises.readFile(destination, 'utf8'), '12345678');
});
