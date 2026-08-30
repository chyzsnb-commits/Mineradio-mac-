'use strict';
// Mineradio 本地用量监视器 · 服务端
//
// 在自己电脑上跑:  node tools/usage-monitor/server.js
// 然后浏览器打开:  http://127.0.0.1:8787
//
// 默认只监听 127.0.0.1(回环),外网访问不到,因此不设密钥。要让分发出去的
// app 直接上报,必须显式 --host 0.0.0.0 并设 MINERADIO_MONITOR_KEY,那时
// 每个请求都要带 key(见 checkKey)。
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const store = require('./store');

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const FLUSH_INTERVAL_MS = 5000;
const MAX_BODY_BYTES = 4096;

function parseArgs(argv) {
  const out = { port: 8787, host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port') out.port = Number(argv[++i]);
    else if (arg === '--host') out.host = String(argv[++i]);
  }
  if (!Number.isFinite(out.port) || out.port <= 0) out.port = 8787;
  return out;
}

// 非回环监听 = 暴露到网络,必须有密钥,否则直接拒绝启动。
function requireKeyFor(host) {
  return !LOOPBACK.has(host);
}

function checkKey(req, url, needKey) {
  if (!needKey) return true;
  const expected = process.env.MINERADIO_MONITOR_KEY || '';
  const given = req.headers['x-monitor-key'] || url.searchParams.get('key') || '';
  return expected.length > 0 && given === expected;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function createMonitorServer(options) {
  const opts = options || {};
  const needKey = requireKeyFor(opts.host || '127.0.0.1');
  const state = store.loadState();
  let dirty = false;

  const flushTimer = setInterval(() => {
    if (!dirty) return;
    try { store.saveState(state); dirty = false; } catch (_) {}
  }, FLUSH_INTERVAL_MS);
  if (flushTimer.unref) flushTimer.unref();

  const indexPath = path.join(__dirname, 'dashboard.html');

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch (_) { sendJson(res, 400, { ok: false }); return; }

    if (!checkKey(req, url, needKey)) { sendJson(res, 401, { ok: false, error: 'unauthorized' }); return; }

    // 客户端心跳:{ id, v, ms }
    if (req.method === 'POST' && url.pathname === '/api/ping') {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (_) { sendJson(res, 400, { ok: false, error: 'bad_body' }); return; }
      const result = store.recordPing(state, body, new Date());
      if (result.ok) dirty = true;
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/summary') {
      sendJson(res, 200, store.buildSummary(state, new Date()));
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      let html;
      try { html = fs.readFileSync(indexPath); } catch (_) { sendJson(res, 500, { ok: false }); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not_found' });
  });

  server.on('close', () => {
    clearInterval(flushTimer);
    if (dirty) { try { store.saveState(state); dirty = false; } catch (_) {} }
  });

  return server;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (requireKeyFor(opts.host) && !process.env.MINERADIO_MONITOR_KEY) {
    console.error('拒绝启动:--host ' + opts.host + ' 会把监视器暴露到网络,必须先设 MINERADIO_MONITOR_KEY。');
    process.exit(1);
  }
  const server = createMonitorServer(opts);
  server.listen(opts.port, opts.host, () => {
    console.log('Mineradio 用量监视器');
    console.log('  面板   http://' + opts.host + ':' + opts.port);
    console.log('  数据   ' + store.STATE_FILE);
    if (requireKeyFor(opts.host)) console.log('  已启用密钥(X-Monitor-Key)');
  });
  const shutdown = () => { server.close(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { createMonitorServer, parseArgs, requireKeyFor, checkKey };
