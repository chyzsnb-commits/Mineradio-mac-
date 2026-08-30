'use strict';

const assert = require('node:assert/strict');

const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9223';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function send(method, params) {
  return withPage((socket) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP ' + method + ' 超时')), 20000);
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
  }));
}

async function evaluate(expression) {
  return withPage((socket) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP evaluate 超时')), 20000);
    const onMessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id !== 1) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      resolve(payload);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  }).then((response) => {
    if (response.result && response.result.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text || 'Electron evaluate 失败');
    }
    return response.result.result.value;
  }));
}

const installExpression = `(() => {
  if (window.__mineradioPerfProbe?.cleanup) window.__mineradioPerfProbe.cleanup();
  const probe = {
    starts: performance.now(),
    longTasks: [],
    events: [],
    frames: [],
    errors: [],
    scrollEvents: 0,
  };
  window.__mineradioPerfProbe = probe;
  if (window.PerformanceObserver) {
    try {
      const longObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => probe.longTasks.push({ name: entry.name, start: entry.startTime, duration: entry.duration }));
      });
      longObserver.observe({ type: 'longtask', buffered: true });
      probe.longObserver = longObserver;
    } catch (_) {}
    try {
      const eventObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (/^(wheel|scroll|click|pointerdown|pointerup|keydown)$/.test(entry.name)) {
            probe.events.push({ name: entry.name, start: entry.startTime, duration: entry.duration, processing: entry.processingStart - entry.startTime, inputDelay: entry.processingStart - entry.startTime, presentation: entry.presentationTime ? entry.presentationTime - entry.startTime : null });
          }
        });
      });
      eventObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });
      probe.eventObserver = eventObserver;
    } catch (_) {}
  }
  window.addEventListener('error', (event) => probe.errors.push(String(event.message || 'error')), true);
  window.addEventListener('unhandledrejection', (event) => probe.errors.push(String(event.reason || 'unhandled rejection')), true);
  const onScroll = () => { probe.scrollEvents += 1; };
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  probe.cleanup = () => {
    document.removeEventListener('scroll', onScroll, { capture: true });
    if (probe.longObserver) probe.longObserver.disconnect();
    if (probe.eventObserver) probe.eventObserver.disconnect();
  };
  return { ok: true, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio } };
})()`;

const snapshotExpression = `(() => {
  const media = [...document.querySelectorAll('img,video,audio,canvas')];
  const scrollables = [...document.querySelectorAll('*')].filter((node) => {
    const style = getComputedStyle(node);
    return (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
  });
  const probe = window.__mineradioPerfProbe || {};
  return {
    url: location.href,
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    visibility: document.visibilityState,
    focus: document.hasFocus(),
    state: {
      home: typeof isHomePage === 'function' ? isHomePage() : null,
      playing: !!(typeof audio !== 'undefined' && audio && !audio.paused && !audio.ended),
      audioSrc: typeof audio !== 'undefined' && audio ? String(audio.currentSrc || audio.src || '').replace(/([?&](?:token|sign|signature|key)=[^&]+)/ig, '$1=REDACTED') : '',
      preset: typeof fx !== 'undefined' && fx ? fx.preset : null,
    },
    dom: { media: media.length, images: document.images.length, videos: document.querySelectorAll('video').length, audio: document.querySelectorAll('audio').length, canvas: document.querySelectorAll('canvas').length, scrollables: scrollables.length },
    scrollables: scrollables.slice(0, 20).map((node) => ({ id: node.id, className: String(node.className || '').slice(0, 100), client: node.clientHeight, scroll: node.scrollHeight })),
    probe: { longTasks: probe.longTasks?.slice(-100) || [], events: probe.events?.slice(-100) || [], scrollEvents: probe.scrollEvents || 0, errors: probe.errors?.slice(-20) || [] },
    memory: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null,
  };
})()`;

const scrollExpression = `(() => {
  const candidates = [...document.querySelectorAll('*')].filter((node) => node.scrollHeight > node.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(node).overflowY));
  const target = candidates.find((node) => /recent|home|wallpaper|library/i.test(String(node.id || '') + ' ' + String(node.className || ''))) || candidates[0];
  if (!target) return { ok: false, reason: 'no-scrollable' };
  const max = Math.max(0, target.scrollHeight - target.clientHeight);
  for (let i = 0; i < 80; i += 1) target.scrollTop = max * ((i % 40) / 39);
  target.scrollTop = 0;
  const rect = target.getBoundingClientRect();
  return { ok: true, target: { id: target.id, className: String(target.className || '').slice(0, 100), max, client: target.clientHeight, scroll: target.scrollHeight, x: rect.left + rect.width / 2, y: rect.top + Math.min(120, rect.height / 2) } };
})()`;

const uiScenarioExpression = `async () => {
  const result = [];
  const input = document.getElementById('search-input');
  const snap = (name) => {
    const p = window.__mineradioPerfProbe || {};
    const fxPanel = document.getElementById('fx-panel');
    const mask = document.getElementById('wallpaper-library-modal');
    const rect = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    result.push({ name, longTasks: p.longTasks?.length || 0, errors: p.errors?.length || 0, fx: { className: fxPanel?.className || '', rect: rect(fxPanel), scroll: fxPanel ? { client: fxPanel.clientHeight, height: fxPanel.scrollHeight } : null }, wallpaper: { className: mask?.className || '', ariaHidden: mask?.getAttribute('aria-hidden') || '', rect: rect(mask) }, search: { value: input?.value || '', rect: rect(input) }, dom: { media: document.querySelectorAll('img,video,audio,canvas').length } });
  };
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  snap('start');
  if (typeof toggleFxPanel === 'function') { toggleFxPanel(true); await pause(650); snap('fx-open'); toggleFxPanel(false); await pause(350); snap('fx-close'); }
  if (typeof openWallpaperLibraryPanel === 'function') { openWallpaperLibraryPanel(); await pause(900); snap('wallpaper-open'); if (typeof closeWallpaperLibraryPanel === 'function') closeWallpaperLibraryPanel(); await pause(450); snap('wallpaper-close'); }
  if (typeof openPlaylistPanel === 'function') { openPlaylistPanel(); await pause(300); snap('playlist-open'); if (typeof closePlaylistPanel === 'function') closePlaylistPanel(); await pause(300); snap('playlist-close'); }
  if (input) { input.value = '蝴蝶'; input.dispatchEvent(new Event('input', { bubbles: true })); await pause(1000); snap('search-input'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); await pause(500); snap('search-clear'); }
  return result;
}`;

const layoutExpression = `(() => {
  const selectors = ['#empty-home', '.empty-home-shell', '.home-hero', '.home-grid', '.home-insight-rail', '#home-recent-list', '#home-insight-dock', '#bottom-bar', '#fx-panel'];
  const read = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return { rect: { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), w: +rect.width.toFixed(1), h: +rect.height.toFixed(1) }, client: node.clientHeight, scroll: node.scrollHeight, overflowY: style.overflowY, display: style.display };
  };
  return { viewport: { w: innerWidth, h: innerHeight }, nodes: Object.fromEntries(selectors.map((selector) => [selector, read(selector)])) };
})()`;

(async () => {
  const install = await evaluate(installExpression);
  await wait(150);
  const before = await evaluate(snapshotExpression);
  const stress = await evaluate(scrollExpression);
  const point = stress.target || { x: 420, y: 360 };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none' });
  for (let i = 0; i < 40; i += 1) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY: 42 });
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY: -1680 });
  await wait(700);
  const after = await evaluate(snapshotExpression);
  const ui = await evaluate('(' + uiScenarioExpression + ')()');
  const layouts = [];
  for (const size of [{ w: 1366, h: 838 }, { w: 1247, h: 702 }, { w: 1000, h: 700 }]) {
    await send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
    await wait(120);
    layouts.push(await evaluate(layoutExpression));
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await wait(120);
  const probe = after.probe;
  console.log(JSON.stringify({ install, before, stress, after, ui, layouts, delta: {
    longTasks: probe.longTasks.length - before.probe.longTasks.length,
    events: probe.events.length - before.probe.events.length,
    scrollEvents: probe.scrollEvents - before.probe.scrollEvents,
    errors: probe.errors.slice(before.probe.errors.length),
  } }, null, 2));
  await evaluate('window.__mineradioPerfProbe?.cleanup?.(); true');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
