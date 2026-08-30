'use strict';

const assert = require('node:assert/strict');
const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9223';

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function withPage(callback) {
  const targets = await (await fetch(cdpBase + '/json/list')).json();
  const page = targets.find((target) => target.type === 'page' && /Mineradio/.test(target.title || ''));
  assert.ok(page && page.webSocketDebuggerUrl, '未找到 Mineradio Electron 页面');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return callback(socket).finally(() => socket.close());
}

function command(socket, method, params) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(method + ' 超时')), 30000);
    const onMessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id !== 1) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      if (payload.error) reject(new Error(payload.error.message || method + ' 失败'));
      else resolve(payload.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id: 1, method, params: params || {} }));
  });
}

(async () => {
  const profile = await withPage(async (socket) => {
    await command(socket, 'Profiler.enable');
    await command(socket, 'Profiler.start', { samplingInterval: 1000 });
    await command(socket, 'Page.reload', { ignoreCache: false });
    await wait(Number(process.env.STARTUP_PROFILE_MS) || 5000);
    const result = await command(socket, 'Profiler.stop');
    await command(socket, 'Profiler.disable');
    return result.profile;
  });
  const nodes = new Map((profile.nodes || []).map((node) => [node.id, node]));
  const samples = profile.samples || [];
  const counts = new Map();
  for (const id of samples) counts.set(id, (counts.get(id) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, count]) => {
    const node = nodes.get(id) || {};
    const call = node.callFrame || {};
    return { samples: count, function: call.functionName || '(anonymous)', url: call.url || '', line: call.lineNumber, column: call.columnNumber };
  });
  console.log(JSON.stringify({ durationMs: profile.endTime - profile.startTime, sampleCount: samples.length, top }, null, 2));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
