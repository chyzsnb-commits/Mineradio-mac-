'use strict';

const assert = require('node:assert/strict');

const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9223';
const rounds = Math.max(1, Math.min(50, Number(process.env.WALLPAPER_PROBE_ROUNDS) || 20));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluate(expression) {
  const targets = await (await fetch(cdpBase + '/json/list')).json();
  const page = targets.find((target) => target.type === 'page' && target.title === 'Mineradio');
  assert.ok(page && page.webSocketDebuggerUrl, '未找到带 CDP 的 Mineradio Electron 页面');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const response = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP Runtime.evaluate 超时')), 20000);
    socket.addEventListener('message', function onMessage(event) {
      const payload = JSON.parse(event.data);
      if (payload.id !== 1) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      resolve(payload);
    });
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });
  socket.close();
  if (response.result && response.result.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text || 'Electron 页面执行失败');
  }
  return response.result.result.value;
}

const snapshotExpression = `(() => {
  const state = window.wallpaperLibraryState || {};
  const list = document.getElementById('wallpaper-library-list');
  const preview = document.getElementById('wallpaper-library-preview');
  const modal = document.getElementById('wallpaper-library-modal');
  const longTasks = performance.getEntriesByType('longtask') || [];
  return {
    open: !!state.isOpen,
    modal: !!(modal && modal.classList.contains('show')),
    records: (state.records || []).length,
    selectedId: state.selectedId || '',
    cards: list ? list.querySelectorAll('[data-wallpaper-id]').length : 0,
    listMedia: list ? list.querySelectorAll('[data-wallpaper-preview]').length : 0,
    detailMedia: preview ? preview.querySelectorAll('img,video').length : 0,
    livePreview: preview ? preview.querySelectorAll('img.wallpaper-live-preview').length : 0,
    observer: !!(list && list._wallpaperMediaObserver),
    scrollTimer: !!(list && list._wallpaperScrollStopTimer),
    exportPoller: !!state.exportPoller,
    exportTask: state.exportTask ? state.exportTask.state : '',
    listScrollHeight: list ? list.scrollHeight : 0,
    heap: performance.memory ? performance.memory.usedJSHeapSize : null,
    longTasks: longTasks.length,
  };
})()`;

const stressExpression = `(() => {
  const list = document.getElementById('wallpaper-library-list');
  if (!list) return { scrollEvents: 0 };
  let scrollEvents = 0;
  const onScroll = () => { scrollEvents += 1; };
  list.addEventListener('scroll', onScroll, { passive: true });
  const max = Math.max(0, list.scrollHeight - list.clientHeight);
  for (let i = 0; i < 32; i += 1) {
    list.scrollTop = max * (i / 31);
    list.dispatchEvent(new Event('scroll'));
  }
  list.scrollTop = 0;
  list.removeEventListener('scroll', onScroll);
  return { scrollEvents, maxScrollTop: max };
})()`;

const selectSceneExpression = `(() => {
  const state = window.wallpaperLibraryState || {};
  const scene = (state.records || []).find((record) => record.type === 'scene');
  if (!scene) return null;
  selectWallpaperLibraryRecord(scene.id);
  return { id: scene.id, liveUrl: !!scene.liveUrl };
})()`;

const probeExpression = `(() => ({
  close: () => closeWallpaperLibraryPanel(),
  open: () => openWallpaperLibraryPanel(),
  closeDetail: () => closeWallpaperLibraryDetail(),
  snapshot: () => (${snapshotExpression}),
  stress: () => (${stressExpression}),
  selectScene: () => (${selectSceneExpression}),
}))()`;

(async () => {
  const before = await evaluate(snapshotExpression);
  const results = [];
  for (let index = 0; index < rounds; index += 1) {
    const startedAt = Date.now();
    await evaluate('openWallpaperLibraryPanel()');
    await wait(120);
    const opened = await evaluate(snapshotExpression);
    const stress = await evaluate(stressExpression);
    const scene = await evaluate(selectSceneExpression);
    await wait(scene && scene.liveUrl ? 260 : 20);
    const detail = await evaluate(snapshotExpression);
    await evaluate('closeWallpaperLibraryDetail()');
    await evaluate('closeWallpaperLibraryPanel()');
    await wait(30);
    const closed = await evaluate(snapshotExpression);
    assert.equal(closed.open, false, `第 ${index + 1} 轮关闭后 state.isOpen 未归零`);
    assert.equal(closed.modal, false, `第 ${index + 1} 轮关闭后 modal 仍可见`);
    assert.equal(closed.cards, 0, `第 ${index + 1} 轮关闭后卡片节点残留`);
    assert.equal(closed.listMedia, 0, `第 ${index + 1} 轮关闭后列表媒体残留`);
    assert.equal(closed.detailMedia, 0, `第 ${index + 1} 轮关闭后详情媒体残留`);
    assert.equal(closed.livePreview, 0, `第 ${index + 1} 轮关闭后 Scene 流节点残留`);
    assert.equal(closed.observer, false, `第 ${index + 1} 轮关闭后 IntersectionObserver 残留`);
    assert.equal(closed.scrollTimer, false, `第 ${index + 1} 轮关闭后滚动定时器残留`);
    assert.equal(closed.exportPoller, false, `第 ${index + 1} 轮关闭后导出轮询残留`);
    results.push({ index: index + 1, elapsedMs: Date.now() - startedAt, opened, stress, scene, detail, closed });
  }
  const after = await evaluate(snapshotExpression);
  const elapsed = results.map((result) => result.elapsedMs);
  const heaps = results.map((result) => result.closed.heap).filter((value) => Number.isFinite(value));
  console.log(JSON.stringify({
    rounds,
    before,
    after,
    elapsedMs: { min: Math.min(...elapsed), max: Math.max(...elapsed) },
    heapBytes: heaps.length ? { first: heaps[0], last: heaps[heaps.length - 1], max: Math.max(...heaps) } : null,
    opened: results.map((result) => ({
      index: result.index,
      cards: result.opened.cards,
      listMedia: result.opened.listMedia,
      scene: result.scene,
      scrollEvents: result.stress.scrollEvents,
      maxScrollTop: result.stress.maxScrollTop,
      detailMedia: result.detail.detailMedia,
      closed: result.closed,
    })),
  }, null, 2));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
