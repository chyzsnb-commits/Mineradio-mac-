'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  init,
  WindowsWallpaperClient,
  parseNeighborHosts,
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

function createWallpaperPanelPortHarness(savedBaseUrl, options) {
  const opts = options || {};
  const calls = [];
  const storage = new Map();
  if (savedBaseUrl) storage.set('mineradio.windows-wallpaper.base-url', savedBaseUrl);
  const input = { value: '', dataset: {}, addEventListener() {} };
  const status = { textContent: '', dataset: {} };
  const discovered = { textContent: '', dataset: {} };
  const modal = { classList: { add() {}, remove() {}, contains() { return false; } }, setAttribute() {}, addEventListener() {} };
  const elements = {
    'wallpaper-library-http-input': input,
    'wallpaper-library-status': status,
    'wallpaper-library-discovered-ip': discovered,
    'wallpaper-library-modal': modal,
  };
  const service = opts.service || { ok: true, baseUrl: 'http://192.168.1.107:8130', host: 'Windows Mineradio', records: [] };
  const context = {
    console,
    Promise,
    Set,
    Map,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    document: {
      getElementById(id) { return elements[id] || null; },
      addEventListener() {},
    },
    window: {
      desktopWindow: {
        wallpaperWindowsConnect: async (baseUrl) => {
          calls.push({ kind: 'connect', baseUrl });
          return opts.connect ? opts.connect(baseUrl) : service;
        },
        wallpaperWindowsDiscover: async () => {
          calls.push({ kind: 'discover' });
          return opts.discover ? opts.discover() : { ok: true, services: [service] };
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(read('public/js/modules/07-fx/10-wallpaper-library-panel.js'), context, { filename: '10-wallpaper-library-panel.js' });
  context.wallpaperLibraryState.isOpen = true;
  context.wallpaperLibraryRenderRecords = function () {};
  context.wallpaperLibraryRenderDetail = function () {};
  return { context, calls, input, status, discovered, storage, service };
}

test('壁纸桥初始化后必须暴露可用的 Windows 发现与连接入口', () => {
  const bridge = init({ userDataPath: path.join(root, '.tmp-wallpaper-library-test') });
  assert.equal(typeof bridge.discoverWindowsSources, 'function');
  assert.equal(typeof bridge.connectWindowsSource, 'function');
});

test('macOS ARP 解析只保留真实邻居，不能把 incomplete 条目扩大为全网段候选', () => {
  const hosts = parseNeighborHosts([
    '? (192.168.1.107) at 30:c5:99:84:f0:9b on en0 ifscope [ethernet]',
    '? (192.168.1.108) at (incomplete) on en0 ifscope [ethernet]',
    '192.168.1.109 dev en0 FAILED',
  ].join('\n'));
  assert.deepEqual(hosts, ['192.168.1.107']);
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

test('UDP 广播携带的动态端口优先通过 ping 验证', async () => {
  class FakeSocket {
    constructor() { this.handlers = {}; }
    on(name, handler) { this.handlers[name] = handler; }
    bind(port, callback) {
      assert.equal(port, 45678);
      callback();
      queueMicrotask(() => this.handlers.message(Buffer.from('MINERADIO_WALLPAPER 192.168.1.20:8144')));
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
  assert.equal(result.services[0].baseUrl, 'http://192.168.1.20:8144');
});

test('动态端口发现和缓存连接在界面中回填完整实际地址', async () => {
  const html = read('public/index.html');
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  assert.doesNotMatch(html, /placeholder="[^"]*:8123"/, '输入框不得把 8123 伪装为固定连接地址');
  assert.match(html, /http:\/\/Windows-IP:端口号.*1024-65535/, '手动连接提示必须要求用户输入实际端口');
  assert.doesNotMatch(panel, /Windows-IP:8123/, '未发现状态不得推荐固定端口');

  const discovered = createWallpaperPanelPortHarness();
  await discovered.context.discoverWindowsWallpaperSources();
  assert.equal(discovered.input.value, 'http://192.168.1.107:8130');
  assert.match(discovered.discovered.textContent, /192\.168\.1\.107:8130/);
  assert.match(discovered.status.textContent, /Windows Mineradio/);
  assert.equal(discovered.storage.get('mineradio.windows-wallpaper.base-url'), 'http://192.168.1.107:8130');

  const cached = createWallpaperPanelPortHarness('http://192.168.1.107:8130');
  await cached.context.wallpaperLibraryOpenSavedOrDiscover();
  assert.equal(cached.input.value, 'http://192.168.1.107:8130');
  assert.deepEqual(cached.calls, [{ kind: 'connect', baseUrl: 'http://192.168.1.107:8130' }], '缓存地址必须原样优先请求，不能回落为 8123');
});

test('打开壁纸库与读取按钮必须共用单飞发现流程，并自动连接扫描到的动态端口 8128', async () => {
  const service = { ok: true, source: 'subnet', baseUrl: 'http://192.168.1.107:8128', host: 'mineradio-wallpaper', records: [] };
  const harness = createWallpaperPanelPortHarness('', { service, discover: async () => ({
    ok: true,
    services: [service],
    diagnostics: { jobId: 'scan-8128', udp: { received: 0 }, subnetScan: { candidates: 254, completed: true }, probes: [{ baseUrl: 'http://192.168.1.107:8128', outcome: 'PING_OK' }] },
  }) });
  harness.context.openWallpaperLibraryPanel();
  await harness.context.wallpaperLibraryState.connectionPromise;
  assert.equal(harness.input.value, 'http://192.168.1.107:8128');
  assert.match(harness.discovered.textContent, /192\.168\.1\.107:8128/);
  assert.equal(harness.calls.filter((call) => call.kind === 'discover').length, 1, '打开页面必须自动调用发现');

  const before = harness.calls.length;
  await harness.context.discoverWindowsWallpaperSources();
  assert.equal(harness.calls.length, before + 1, '读取按钮必须复用同一发现入口，不维护第二套流程');
  assert.equal(harness.calls.at(-1).kind, 'discover');

  const html = read('public/index.html');
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  assert.match(html, /onclick="wallpaperLibraryDiscoverAndConnect\(\{ forceDiscovery: true \}\)"/, '读取按钮必须直接走统一单飞函数');
  assert.match(panel, /function wallpaperLibraryDiscoverAndConnect\([\s\S]*?connectionPromise/, '统一函数必须管理单飞状态');
  assert.match(panel, /openWallpaperLibraryPanel\(\)[\s\S]*?wallpaperLibraryDiscoverAndConnect\(\)/, '打开弹窗必须自动触发同一函数');
});

test('手动连接成功不能伪装成自动读取 Windows IP', async () => {
  const service = { ok: true, baseUrl: 'http://192.168.1.107:8128', host: 'mineradio-wallpaper', records: [] };
  const harness = createWallpaperPanelPortHarness('', { service });
  harness.input.value = service.baseUrl;
  await harness.context.connectWindowsWallpaperSource();
  assert.doesNotMatch(harness.discovered.textContent, /自动读取 Windows IP/, '手动成功只能显示手动来源');
  assert.match(harness.status.textContent, /已连接/);
});

test('广播端口失效时只扫描已发现 IP 的 8123 到 8155，且并发不超过 4', async () => {
  class FakeSocket {
    constructor() { this.handlers = {}; }
    on(name, handler) { this.handlers[name] = handler; }
    bind(_port, callback) {
      callback();
      queueMicrotask(() => this.handlers.message(Buffer.from('MINERADIO_WALLPAPER 192.168.1.20:8143')));
    }
    close() {}
  }
  const calls = [];
  let active = 0;
  let peak = 0;
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new FakeSocket() },
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith('/api/ping')) {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return url.startsWith('http://192.168.1.20:8144/') ? jsonResponse(200, { ok: true }) : jsonResponse(404, { ok: false });
      }
      if (url.startsWith('http://192.168.1.20:8144/api/wallpapers')) return jsonResponse(200, { ok: true, records: [] });
      return jsonResponse(404, { ok: false });
    },
  });
  const result = await client.discover(500);
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].baseUrl, 'http://192.168.1.20:8144');
  assert.ok(peak <= 4, '端口探测并发必须受限');
  const pingUrls = calls.filter((url) => url.endsWith('/api/ping'));
  assert.ok(pingUrls.every((url) => /^http:\/\/192\.168\.1\.20:(?:812[3-9]|813\d|814\d|815[0-5])\/api\/ping$/.test(url)));
});

test('广播只有 Windows IP 时只在该主机的受限端口范围内回退', async () => {
  class FakeSocket {
    constructor() { this.handlers = {}; }
    on(name, handler) { this.handlers[name] = handler; }
    bind(_port, callback) {
      callback();
      queueMicrotask(() => this.handlers.message(Buffer.from('MINERADIO_WALLPAPER 10.0.0.9')));
    }
    close() {}
  }
  const calls = [];
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new FakeSocket() },
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.startsWith('http://10.0.0.9:8123/api/ping')) return jsonResponse(200, { ok: true });
      if (url.startsWith('http://10.0.0.9:8123/api/wallpapers')) return jsonResponse(200, { ok: true, records: [] });
      return jsonResponse(404, { ok: false });
    },
  });
  const result = await client.discover(500);
  assert.equal(result.services[0].baseUrl, 'http://10.0.0.9:8123');
  assert.ok(calls.every((url) => url.startsWith('http://10.0.0.9:')));
});

test('没有广播时不会扫描公网或完整端口空间', async () => {
  class SilentSocket {
    on() {}
    bind(_port, callback) { callback(); }
    close() {}
  }
  const calls = [];
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new SilentSocket() },
    networkInterfaces: () => ({ en0: [{ address: '203.0.113.4', netmask: '255.255.255.0', family: 'IPv4', internal: false }] }),
    neighborHosts: async () => ['203.0.113.9'],
    fetchImpl: async (url) => {
      calls.push(url);
      return jsonResponse(404, { ok: false });
    },
  });
  const result = await client.discover(500);
  assert.deepEqual(result.services, []);
  assert.deepEqual(calls, []);
});

test('无 UDP 时会从同网段邻居表发现 8130，且只回填已验证的完整地址', async () => {
  class SilentSocket {
    on() {}
    bind(_port, callback) { callback(); }
    close() {}
  }
  const calls = [];
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new SilentSocket() },
    networkInterfaces: () => ({ en0: [{ address: '192.168.1.120', netmask: '255.255.255.0', family: 'IPv4', internal: false }] }),
    neighborHosts: async () => ['192.168.1.107'],
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === 'http://192.168.1.107:8130/api/ping') return jsonResponse(200, { ok: true, host: 'Windows Mineradio' });
      if (url === 'http://192.168.1.107:8130/api/wallpapers') return jsonResponse(200, { ok: true, records: [] });
      return jsonResponse(404, { ok: false });
    },
  });
  const result = await client.discover(500);
  assert.equal(result.services[0].baseUrl, 'http://192.168.1.107:8130');
  assert.deepEqual(result.diagnostics.subnetScan.neighborHosts, ['192.168.1.107']);
  assert.ok(result.diagnostics.probes.some((probe) => probe.baseUrl === 'http://192.168.1.107:8130' && probe.outcome === 'PING_OK'));
  assert.ok(calls.includes('http://192.168.1.107:8130/api/ping'));
});

test('无 UDP 自动发现必须实际探测 8128 并把其作为 subnet 来源返回', async () => {
  class SilentSocket {
    on() {}
    bind(_port, callback) { callback(); }
    close() {}
  }
  const calls = [];
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new SilentSocket() },
    networkInterfaces: () => ({ en0: [{ address: '192.168.1.120', netmask: '255.255.255.0', family: 'IPv4', internal: false }] }),
    neighborHosts: async () => ['192.168.1.107'],
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === 'http://192.168.1.107:8128/api/ping') return jsonResponse(200, { ok: true, host: 'mineradio-wallpaper' });
      if (url === 'http://192.168.1.107:8128/api/wallpapers') return jsonResponse(200, { ok: true, records: [] });
      return jsonResponse(404, { ok: false });
    },
  });
  const result = await client.discover(500);
  assert.equal(result.services[0].baseUrl, 'http://192.168.1.107:8128');
  assert.equal(result.services[0].source, 'subnet');
  assert.match(result.diagnostics.jobId, /^wallpaper-discovery-\d+$/);
  assert.ok(calls.includes('http://192.168.1.107:8128/api/ping'), '必须留下 8128 /api/ping 的实际请求证据');
  assert.ok(result.diagnostics.probes.some((probe) => probe.baseUrl === 'http://192.168.1.107:8128' && probe.outcome === 'PING_OK'));
});

test('无 ARP 且慢失败探测时，8128 不能被 8130 的全网段轮询饿死', async () => {
  class SilentSocket {
    on() {}
    bind(_port, callback) { callback(); }
    close() {}
  }
  const calls = [];
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new SilentSocket() },
    networkInterfaces: () => ({
      en0: [{ address: '192.168.1.104', netmask: '255.255.255.248', family: 'IPv4', internal: false }],
    }),
    neighborHosts: async () => [],
    fetchImpl: async (url) => {
      calls.push(url);
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (url === 'http://192.168.1.107:8128/api/ping') return jsonResponse(200, { ok: true, host: 'mineradio-wallpaper' });
      if (url === 'http://192.168.1.107:8128/api/wallpapers') return jsonResponse(200, { ok: true, records: [] });
      return jsonResponse(404, { ok: false });
    },
  });
  const result = await client.discover(1000);
  assert.equal(result.services[0].baseUrl, 'http://192.168.1.107:8128');
  assert.ok(calls.includes('http://192.168.1.107:8128/api/ping'));
});

test('无 UDP 的主动扫描只枚举活跃私网网段并受全局并发限制', async () => {
  class SilentSocket {
    on() {}
    bind(_port, callback) { callback(); }
    close() {}
  }
  let active = 0;
  let peak = 0;
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new SilentSocket() },
    networkInterfaces: () => ({
      en0: [{ address: '192.168.1.120', netmask: '255.255.255.0', family: 'IPv4', internal: false }],
      en1: [{ address: '10.0.0.8', netmask: '255.0.0.0', family: 'IPv4', internal: false }],
      lo0: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true }],
    }),
    neighborHosts: async () => ['192.168.1.107', '10.0.0.9', '8.8.8.8'],
    fetchImpl: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return jsonResponse(404, { ok: false });
    },
  });
  const result = await client.discover(500);
  assert.deepEqual(result.diagnostics.subnetScan.neighborHosts, ['192.168.1.107', '10.0.0.9']);
  assert.ok(result.diagnostics.subnetScan.networks.every((network) => /^(?:10|192\.168)\./.test(network.address)));
  assert.ok(peak <= 48, '主动扫描的全局并发必须受限');
});

test('未收到 UDP 广播时返回主进程监听诊断和 Windows 网络修复提示', async () => {
  class SilentSocket {
    on() {}
    bind(_port, callback) { callback(); }
    close() {}
  }
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new SilentSocket() },
    networkInterfaces: () => ({}),
    fetchImpl: async () => jsonResponse(404, { ok: false }),
  });
  const result = await client.discover(500);
  assert.equal(result.diagnostics.udp.port, 45678);
  assert.equal(result.diagnostics.udp.received, 0);
  assert.equal(result.diagnostics.reason, 'NO_UDP_ANNOUNCEMENT');
  assert.match(result.diagnostics.userHint, /0\.0\.0\.0.*UDP 45678.*TCP/, '诊断必须说明 Windows 监听地址和防火墙端口');
});

test('8130 广播必须记录候选 /api/ping 探测，并把完整 baseUrl 返回给 UI', async () => {
  class FakeSocket {
    constructor() { this.handlers = {}; }
    on(name, handler) { this.handlers[name] = handler; }
    bind(_port, callback) {
      callback();
      queueMicrotask(() => this.handlers.message(Buffer.from('MINERADIO_WALLPAPER 192.168.1.107:8130')));
    }
    close() {}
  }
  const client = new WindowsWallpaperClient({
    dgramImpl: { createSocket: () => new FakeSocket() },
    fetchImpl: async (url) => url.endsWith('/api/ping')
      ? jsonResponse(200, { ok: true, host: 'Windows Mineradio' })
      : jsonResponse(200, { ok: true, records: [] }),
  });
  const result = await client.discover(500);
  assert.equal(result.services[0].baseUrl, 'http://192.168.1.107:8130');
  assert.deepEqual(result.diagnostics.announcements, [{ host: '192.168.1.107', baseUrl: 'http://192.168.1.107:8130' }]);
  assert.deepEqual(result.diagnostics.probes, [{ baseUrl: 'http://192.168.1.107:8130', outcome: 'PING_OK' }]);
});

test('壁纸库 UI 将无广播和 ping 失败显示为可操作的网络诊断', () => {
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  assert.match(panel, /NO_UDP_ANNOUNCEMENT/, '渲染层必须读取主进程无广播诊断');
  assert.match(panel, /0\.0\.0\.0/, 'UI 必须说明 Windows 服务不能只监听 localhost');
  assert.match(panel, /UDP 45678.*TCP/, 'UI 必须说明 Windows 防火墙需要放行的端口');
  assert.match(panel, /PING_TIMEOUT|PING_FAILED|PING_REJECTED/, 'UI 必须区分 ping 失败，不得只显示未发现');
});

test('手动地址只接受明确的 1024 到 65535 端口', async () => {
  const calls = [];
  const client = new WindowsWallpaperClient({
    fetchImpl: async (url) => {
      calls.push(url);
      return jsonResponse(200, { ok: true, records: [] });
    },
  });
  assert.deepEqual(await client.connect('http://192.168.1.20'), { ok: false, error: 'INVALID_URL' });
  assert.deepEqual(await client.connect('http://192.168.1.20:1023'), { ok: false, error: 'INVALID_URL' });
  const accepted = await client.connect('http://192.168.1.20:65535');
  assert.equal(accepted.ok, true);
  assert.equal(accepted.baseUrl, 'http://192.168.1.20:65535');
  assert.deepEqual(calls, [
    'http://192.168.1.20:65535/api/ping',
    'http://192.168.1.20:65535/api/wallpapers',
  ]);
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

test('同一项目的原始媒体与 preview 文件必须分工：播放用原始文件，缩略图用 preview 文件', () => {
  const records = normalizeWindowsWallpaperRecords([
    { id: '3182046198/ling_4k_地面.mp4', title: '风起弹剑', type: 'video', url: '/api/wallpaper-file?id=3182046198%2Fling_4k_%E5%9C%B0%E9%9D%A2.mp4' },
    { id: '3182046198/preview.gif', title: '风起弹剑', type: 'image', url: '/api/wallpaper-file?id=3182046198%2Fpreview.gif' },
  ], 'http://192.168.1.124:8137');

  assert.equal(records.length, 1);
  assert.equal(records[0].id, '3182046198/ling_4k_地面.mp4');
  assert.equal(records[0].type, 'video');
  assert.match(records[0].fileUrl, /ling_4k_/);
  assert.match(records[0].previewUrl, /preview\.gif/);
  assert.doesNotMatch(records[0].previewUrl, /ling_4k_/);
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

test('壁纸媒体使用有界流读取，未知 Content-Length 超限时中止', async () => {
  const client = new WindowsWallpaperClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'image/png' : '' },
      body: {
        getReader() {
          let index = 0;
          return {
            async read() {
              if (index++ < 257) return { done: false, value: new Uint8Array(1024 * 1024) };
              return { done: true, value: undefined };
            },
            async cancel() {},
          };
        },
      },
    }),
  });
  client.trustedBases.add('http://192.168.1.20:8123');
  assert.deepEqual(await client.downloadWallpaperMedia('http://192.168.1.20:8123', 'huge', 'image'), { ok: false, error: 'MEDIA_TOO_LARGE' });
});

test('Scene 导出下载有超时，永不结束的响应不能让界面永久停在下载中', async () => {
  const client = new WindowsWallpaperClient({
    exportDownloadTimeoutMs: 60,
    fetchImpl: async () => ({
      ok: true,
      body: new ReadableStream({ start() {} }),
    }),
  });
  client.trustedBases.add('http://192.168.1.20:8123');
  const result = await client.downloadExportedFile('http://192.168.1.20:8123', 'scene.mp4', path.join(root, 'output', 'never-ending.mp4'));
  assert.deepEqual(result, { ok: false, error: 'DOWNLOAD_TIMEOUT' });
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

test('已保存 Windows 地址优先直连，详情选中不应重建整个远程网格', () => {
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');

  assert.match(panel, /function wallpaperLibraryDiscoverAndConnect\(options\)[\s\S]*?connectWindowsWallpaperSource\([\s\S]*?wallpaperLibraryRunDiscovery\(/, '已有地址必须先直连，失败后进入同一个发现事务');
  assert.match(panel, /function wallpaperLibraryUpdateCardSelection\([\s\S]*?classList\.toggle\('active'/, '选择变化应局部更新已有卡片');
  assert.match(panel, /function selectWallpaperLibraryRecord\(id\) \{[\s\S]*?wallpaperLibraryUpdateCardSelection\(\)[\s\S]*?wallpaperLibraryRenderDetail\(\)/, '点击卡片不能重建整个网格');
  const selectBody = panel.match(/function selectWallpaperLibraryRecord\(id\) \{([\s\S]*?)\n\}/);
  const closeBody = panel.match(/function closeWallpaperLibraryDetail\(\) \{([\s\S]*?)\n\}/);
  assert.ok(selectBody && closeBody, '选择和关闭函数必须存在');
  assert.doesNotMatch(selectBody[1], /wallpaperLibraryRenderRecords\(/, '点击卡片不能重建整个网格');
  assert.doesNotMatch(closeBody[1], /wallpaperLibraryRenderRecords\(/, '关闭详情不能重建整个网格');
});

test('壁纸库提供多选、当前结果全选和顺序导入本地库的入口', () => {
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  const html = read('public/index.html');
  const css = read('public/css/index.css');

  assert.ok(html.includes('id="wallpaper-library-select-all"'), '工具栏应提供全选当前结果按钮');
  assert.ok(html.includes('id="wallpaper-library-batch-import"'), '工具栏应提供批量导入按钮');
  assert.match(panel, /selectedIds:\s*new Set\(\)/, '多选状态必须独立保存，不能复用详情选中态');
  assert.match(panel, /function toggleWallpaperLibraryRecordSelection\(/, '卡片应可独立勾选');
  assert.match(panel, /function toggleWallpaperLibraryVisibleSelection\(/, '全选只作用于当前搜索筛选结果');
  assert.match(panel, /async function importSelectedWindowsWallpapers\(/, '批量导入必须有独立队列');
  assert.match(panel, /for \(var index = 0; index < records\.length; index \+= 1\)/, '批量导入必须顺序执行，不能压垮 Windows 服务');
  assert.match(panel, /if \(record\.type === 'scene'\)[\s\S]*?SCENE_EXPORT_REQUIRED/, '未导出的 Scene 必须明确跳过，不能伪装已导入');
  assert.match(panel, /record\.type === 'scene'[\s\S]*?scene-export/, '已完成导出的 Scene 应复用已导出 MP4 进入批量本地库');
  assert.match(css, /\.wallpaper-library-card-select-wrap\{[^}]*position:absolute/, '多选框必须位于卡片上层，不能与预览点击冲突');
  assert.match(css, /\.wallpaper-library-batch-row\{[^}]*display:flex/, '批量工具栏需要独立排列，避免挤占连接控件');
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

test('本地壁纸鼠标视差有独立的可见开关并进入设置持久化与 DIY 存档', () => {
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const persistence = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
  const archive = read('public/js/modules/07-fx/00-preset-archive-data.js');
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
  const controls = read('public/js/modules/07-fx/02-accent-background-controls.js');
  const pointer = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
  const html = read('public/index.html');
  const workspace = read('public/js/modules/07-fx/09-console-workspace.js');
  const css = read('public/css/index.css');

  assert.match(defaults, /wallpaperMouseParallax:\s*false/, '壁纸视差默认必须关闭');
  assert.match(persistence, /wallpaperMouseParallax:\s*raw\.wallpaperMouseParallax === true/, '重启加载必须读取壁纸视差');
  assert.match(persistence, /wallpaperMouseParallax:\s*fx\.wallpaperMouseParallax === true/, '设置保存必须写入壁纸视差');
  assert.match(archive, /'wallpaperMouseParallax'/, 'DIY 存档字段必须包含壁纸视差');
  assert.match(archive, /wallpaperMouseParallax:\s*raw\.wallpaperMouseParallax === true/, 'DIY 导入必须恢复壁纸视差');
  assert.ok(html.includes('id="t-wallpaperMouseParallax"'), '用户必须能找到壁纸鼠标视差开关');
  assert.match(html, /t-wallpaperMouseParallax[\s\S]*?壁纸鼠标视差/, '开关文案必须明确告诉用户改的是壁纸视差');
  assert.match(workspace, /t-wallpaperMouseParallax.*壁纸鼠标视差/, '视觉控制台搜索必须能找到壁纸视差');
  assert.match(bindings, /key === 'wallpaperMouseParallax'/, '开关必须走统一设置绑定');
  assert.match(controls, /function updateCustomBackgroundMouseParallax\(/, '背景控制必须提供独立的壁纸视差更新函数');
  assert.match(controls, /requestAnimationFrame\(/, '壁纸视差必须采用临时帧循环平滑跟随');
  assert.match(controls, /function updateCustomBackgroundControls\(\) \{[\s\S]*?updateCustomBackgroundMouseParallax\(\)/, '切换或清除背景媒体时必须立即复位壁纸视差');
  assert.match(pointer, /updateCustomBackgroundMouseParallax\(/, '全局指针必须驱动本地壁纸视差');
  assert.match(css, /--wallpaper-bg-parallax-x/, '图片和视频必须使用独立的壁纸视差变量');
  assert.match(css, /#custom-bg-video\s*\{[\s\S]*?--wallpaper-bg-parallax-x/, '视频背景也必须参与壁纸视差');
  assert.match(css, /body\.custom-background-parallax #custom-bg::before/, '启用时必须取消图片变换的额外过渡拖滞');
  const parallaxBody = controls.match(/function updateCustomBackgroundMouseParallax\([^)]*\) \{([\s\S]*?)\n\}/);
  assert.ok(parallaxBody, '壁纸视差更新函数必须存在');
  assert.doesNotMatch(parallaxBody[1], /albumBackgroundMouseBind/, '本地壁纸视差不能复用或关闭封面鼠标视角');
});

test('Scene 详情先保留真实静态缩略图，再延迟挂载有限重试的 MJPEG', () => {
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  const css = read('public/css/index.css');

  assert.match(panel, /livePreviewToken/, 'Scene 预览必须有选择令牌，防止旧请求覆盖新选择');
  assert.match(panel, /function wallpaperLibraryRenderSceneFallback\(/, 'Scene 必须有静态缩略图兜底渲染');
  assert.match(panel, /record\.previewUrl/, 'Scene 兜底必须使用真实 previewUrl');
  assert.match(panel, /setTimeout\([\s\S]*?wallpaperLibraryAttachLivePreview/, '旧流释放后才能延迟接入新实时流');
  assert.match(panel, /MAX_LIVE_PREVIEW_ATTEMPTS|livePreviewAttempts/, '实时预览失败必须有有限重试上限');
  assert.match(panel, /重试实时预览/, '实时流被占用时必须给用户手动重试入口');
  assert.match(panel, /onerror\s*=\s*function/, 'MJPEG 失败时必须保留静态图而不是显示破图');
  assert.match(panel, /removeAttribute\('src'\)/, '切换详情前必须先释放旧 MJPEG 连接');
  assert.match(panel, /wallpaperLibraryRetryLivePreview\(/, '手动重试必须启动新的一轮连接');
  assert.match(css, /\.wallpaper-live-preview\{[^}]*position:absolute[^}]*inset:0/, '实时流加载时必须覆盖静态图，不能在 flex 容器里把缩略图挤成半宽');
});

test('Scene 实时预览每次调度只建立一个 MJPEG 连接', async () => {
  const harness = createWallpaperPanelPortHarness('', { service: { ok: true, baseUrl: 'http://192.168.1.107:8130', records: [] } });
  let attachCount = 0;
  harness.context.wallpaperLibraryAttachLivePreview = function () { attachCount += 1; };
  const record = { id: 'scene-1', sceneId: 'scene-1', type: 'scene', liveUrl: 'http://192.168.1.107:8130/api/live/scene-1' };
  harness.context.wallpaperLibraryState.selectedId = record.id;
  harness.context.wallpaperLibraryScheduleLivePreview(record, 0, 0, 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(attachCount, 1);
});

test('Scene 导出完成态把保存和应用 MP4 放在同一操作行', () => {
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  const renderExport = panel.match(/function wallpaperLibraryRenderExport\(record\) \{([\s\S]*?)\n\}/);
  assert.ok(renderExport, '导出渲染函数必须存在');
  assert.match(renderExport[1], /保存 MP4 到文件夹/, '完成态必须有保存 MP4 按钮');
  assert.match(renderExport[1], /应用 MP4 到 Mineradio/, '完成态必须有应用 MP4 按钮');
  assert.match(renderExport[1], /state\.state === 'completed'[\s\S]*?应用 MP4 到 Mineradio/, '应用按钮必须属于完成态操作行');
  assert.match(renderExport[1], /applyState\.state === 'downloading'[\s\S]*?正在应用/, '应用中必须在同一操作行显示禁用态，不能只靠底层静默拦截重复点击');
  assert.match(renderExport[1], /正在下载并保存到 Mineradio 本地背景库/, '应用中状态必须继续显示在操作行下方');
  assert.doesNotMatch(renderExport[1], /\+\s*wallpaperLibraryRenderApply\(record, state\.output/, '完成态不能把应用动作拆到第二个操作行');
});
