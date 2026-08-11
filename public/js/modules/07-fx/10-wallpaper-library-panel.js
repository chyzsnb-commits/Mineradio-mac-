'use strict';

// Windows Wallpaper Engine 服务只经由主进程验证和提交任务；渲染层只消费已验证的 URL。
var wallpaperLibraryState = {
  records: [],
  selectedId: '',
  baseUrl: '',
  host: '',
  search: '',
  type: 'all',
  sort: 'title',
  exportTask: null,
  exportPoller: 0,
  applyTask: null,
};

function wallpaperLibraryPanelEl(id) { return document.getElementById(id); }
function wallpaperLibraryEsc(value) {
  return String(value || '').replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}
function wallpaperLibraryApi(name) {
  return window.desktopWindow && typeof window.desktopWindow[name] === 'function' ? window.desktopWindow[name] : null;
}
function wallpaperLibraryRenderStatus(text, kind) {
  var el = wallpaperLibraryPanelEl('wallpaper-library-status');
  if (!el) return;
  el.textContent = text || '';
  el.dataset.kind = kind || '';
}
function wallpaperLibraryRenderDiscoveredIp(baseUrl, host) {
  var el = wallpaperLibraryPanelEl('wallpaper-library-discovered-ip');
  if (!el) return;
  if (!baseUrl) { el.textContent = '未读取到在线 Windows 内网地址'; return; }
  el.textContent = '自动读取 Windows IP：' + baseUrl.replace(/^https?:\/\//, '') + (host ? ' · ' + host : '');
}
function wallpaperLibrarySelectedRecord() {
  return (wallpaperLibraryState.records || []).find(function (record) { return record.id === wallpaperLibraryState.selectedId; }) || null;
}
function wallpaperLibraryVisibleRecords() {
  var query = wallpaperLibraryState.search.trim().toLowerCase();
  return (wallpaperLibraryState.records || []).filter(function (record) {
    return (wallpaperLibraryState.type === 'all' || record.type === wallpaperLibraryState.type)
      && (!query || (record.title + ' ' + record.type).toLowerCase().indexOf(query) >= 0);
  }).sort(function (left, right) {
    if (wallpaperLibraryState.sort === 'type') return left.type.localeCompare(right.type) || left.title.localeCompare(right.title);
    return left.title.localeCompare(right.title);
  });
}
function wallpaperLibraryThumb(record) {
  var preview = wallpaperLibraryEsc(record.previewUrl || '');
  if (!preview) return '<div class="wallpaper-thumb wallpaper-thumb-empty">无缩略图</div>';
  if (record.type === 'video') return '<video class="wallpaper-thumb-media" muted playsinline preload="none" data-wallpaper-preview="' + preview + '"></video>';
  return '<img class="wallpaper-thumb-media" loading="lazy" decoding="async" data-wallpaper-preview="' + preview + '" alt="" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'wallpaper-thumb wallpaper-thumb-empty\',textContent:\'无缩略图\'}))">';
}
function wallpaperLibraryLoadLazyMedia(media) {
  if (!media || media.dataset.previewLoaded === 'true' || !media.dataset.wallpaperPreview) return;
  media.dataset.previewLoaded = 'true';
  media.setAttribute('src', media.dataset.wallpaperPreview);
  if (media.tagName === 'VIDEO') {
    media.preload = 'metadata';
    media.load();
  }
}
function wallpaperLibraryBindLazyMedia(list) {
  if (!list) return;
  if (list._wallpaperMediaObserver) list._wallpaperMediaObserver.disconnect();
  var mediaItems = list.querySelectorAll('[data-wallpaper-preview]');
  if (!mediaItems.length) return;
  if (!window.IntersectionObserver) {
    Array.prototype.forEach.call(mediaItems, wallpaperLibraryLoadLazyMedia);
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      wallpaperLibraryLoadLazyMedia(entry.target);
      observer.unobserve(entry.target);
    });
  }, { root: list, rootMargin: '280px 0px' });
  list._wallpaperMediaObserver = observer;
  Array.prototype.forEach.call(mediaItems, function (media) { observer.observe(media); });
}
function wallpaperLibraryMarkScrollActivity(list) {
  if (!list) return;
  list.classList.add('is-scrolling');
  clearTimeout(list._wallpaperScrollStopTimer);
  list._wallpaperScrollStopTimer = setTimeout(function () {
    list.classList.remove('is-scrolling');
  }, 180);
}
function wallpaperLibraryBindScrollPerformance(list) {
  if (!list || list._wallpaperScrollPerformanceBound) return;
  list._wallpaperScrollPerformanceBound = true;
  list.addEventListener('wheel', function () { wallpaperLibraryMarkScrollActivity(list); }, { passive: true });
  list.addEventListener('scroll', function () { wallpaperLibraryMarkScrollActivity(list); }, { passive: true });
}
function wallpaperLibraryRenderRecords() {
  var list = wallpaperLibraryPanelEl('wallpaper-library-list');
  if (!list) return;
  var records = wallpaperLibraryVisibleRecords();
  if (!wallpaperLibraryState.baseUrl) {
    list.innerHTML = '<div class="wallpaper-library-empty">正在扫描局域网 Windows Mineradio 服务，也可输入地址手动连接。</div>';
    return;
  }
  if (!records.length) {
    list.innerHTML = '<div class="wallpaper-library-empty">' + ((wallpaperLibraryState.records || []).length ? '没有匹配的壁纸。' : '该 Windows 壁纸库为空。') + '</div>';
    return;
  }
  list.innerHTML = records.map(function (record) {
    var typeLabel = record.type === 'scene' ? 'Scene 实时预览' : (record.type === 'video' ? '视频' : '图片');
    return '<button type="button" class="wallpaper-library-card' + (record.id === wallpaperLibraryState.selectedId ? ' active' : '') + '" data-wallpaper-id="' + wallpaperLibraryEsc(record.id) + '" aria-label="预览 ' + wallpaperLibraryEsc(record.title) + '">' +
      wallpaperLibraryThumb(record) +
      '<span class="wallpaper-library-card-meta"><span class="wallpaper-library-card-title">' + wallpaperLibraryEsc(record.title) + '</span><small>' + typeLabel + '</small></span>' +
      '<span class="wallpaper-library-card-type">' + (record.type === 'scene' ? 'Scene' : record.type === 'video' ? 'Video' : 'Image') + '</span></button>';
  }).join('');
  Array.prototype.forEach.call(list.querySelectorAll('[data-wallpaper-id]'), function (button) {
    button.addEventListener('click', function () { selectWallpaperLibraryRecord(button.dataset.wallpaperId); });
  });
  wallpaperLibraryBindLazyMedia(list);
  wallpaperLibraryBindScrollPerformance(list);
}
function wallpaperLibraryStopLivePreview() {
  var preview = wallpaperLibraryPanelEl('wallpaper-library-preview');
  if (!preview) return;
  Array.prototype.forEach.call(preview.querySelectorAll('img.wallpaper-live-preview'), function (image) {
    image.removeAttribute('src');
    image.remove();
  });
}
function wallpaperLibrarySavedMediaKey(record, output) {
  if (!record) return '';
  return 'mineradio.windows-wallpaper.saved-media:' + [wallpaperLibraryState.baseUrl, record.type, record.type === 'scene' ? record.sceneId : record.id, output || ''].join('|');
}
function wallpaperLibraryReadSavedMedia(key) {
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
}
function wallpaperLibraryWriteSavedMedia(key, media) {
  if (!key || !media) return;
  try { localStorage.setItem(key, JSON.stringify(media)); } catch (_) {}
}
function wallpaperLibraryApplyTaskFor(record, output) {
  var task = wallpaperLibraryState.applyTask;
  var key = wallpaperLibrarySavedMediaKey(record, output);
  return task && task.key === key ? task : null;
}
function wallpaperLibraryRenderApply(record, output) {
  if (!record) return '';
  var task = wallpaperLibraryApplyTaskFor(record, output);
  var isScene = record.type === 'scene';
  var label = isScene ? '应用 MP4 到 Mineradio' : '下载并应用到 Mineradio';
  if (task && task.state === 'downloading') return '<div class="wallpaper-export-state" data-state="running">正在下载并保存到 Mineradio 本地背景库...</div>';
  if (task && task.state === 'completed') return '<div class="wallpaper-export-state" data-state="completed">已保存到 Mineradio 本地背景库并应用，之后无需重新下载。</div><button type="button" class="modal-btn small secondary" onclick="applyWindowsWallpaperToMineradio()">再次应用</button>';
  var detail = task && task.state === 'failed' ? '<div class="wallpaper-export-state" data-state="failed">' + wallpaperLibraryEsc(task.message || '下载失败，可重试。') + '</div>' : '<div class="wallpaper-export-state">保存到 Mineradio 本地背景库后可离线使用。</div>';
  return '<div class="wallpaper-export-controls"><button type="button" class="modal-btn small" onclick="applyWindowsWallpaperToMineradio()">' + label + '</button></div>' + detail;
}
function wallpaperLibraryRenderExport(record) {
  var exportEl = wallpaperLibraryPanelEl('wallpaper-library-export');
  if (!exportEl) return;
  var task = wallpaperLibraryState.exportTask;
  if (!record) { exportEl.innerHTML = ''; return; }
  if (record.type !== 'scene') { exportEl.innerHTML = wallpaperLibraryRenderApply(record, ''); return; }
  var state = task && task.sceneId === record.sceneId ? task : null;
  var detail = !state ? 'Windows 将离屏渲染并生成 MP4。' : state.message;
  var action = !state || state.state === 'failed' || state.state === 'stopped'
    ? '<button type="button" class="modal-btn small" onclick="startWindowsSceneExport()">' + (state ? '重试导出 MP4' : '导出 MP4') + '</button>'
    : state.state === 'completed'
      ? '<button type="button" class="modal-btn small secondary" onclick="downloadWindowsSceneExport()">保存 MP4 到文件夹</button>'
      : '<button type="button" class="modal-btn small secondary" onclick="stopWindowsSceneExportPolling()">停止等待</button>';
  exportEl.innerHTML = '<div class="wallpaper-export-controls"><label>时长 <input id="wallpaper-library-export-seconds" type="number" min="1" max="300" value="' + (state && state.seconds || 30) + '"> 秒</label>' + action + '</div><div class="wallpaper-export-state" data-state="' + wallpaperLibraryEsc(state && state.state || 'ready') + '">' + wallpaperLibraryEsc(detail) + '</div>' + (state && state.state === 'completed' ? wallpaperLibraryRenderApply(record, state.output || '') : '');
}
function wallpaperLibraryRenderDetail() {
  var preview = wallpaperLibraryPanelEl('wallpaper-library-preview');
  var meta = wallpaperLibraryPanelEl('wallpaper-library-preview-meta');
  var drawer = wallpaperLibraryPanelEl('wallpaper-library-details-drawer');
  if (!preview || !meta || !drawer) return;
  wallpaperLibraryStopLivePreview();
  var record = wallpaperLibrarySelectedRecord();
  if (!record) {
    drawer.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
    preview.innerHTML = '<div class="wallpaper-library-preview-empty">选择一张壁纸预览</div>';
    meta.textContent = '';
    wallpaperLibraryRenderExport(null);
    return;
  }
  drawer.classList.add('show');
  drawer.setAttribute('aria-hidden', 'false');
  meta.textContent = record.title + ' · ' + (record.type === 'scene' ? 'Scene · ' + wallpaperLibraryState.host : record.type === 'video' ? '视频' : '图片');
  if (record.type === 'scene') {
    preview.innerHTML = '<img class="wallpaper-live-preview" src="' + wallpaperLibraryEsc(record.liveUrl) + '" alt="Windows 实时预览"><div class="wallpaper-live-label">Windows 实时预览</div>';
    wallpaperLibraryCheckLiveStatus();
  } else if (!record.fileUrl) {
    preview.innerHTML = '<div class="wallpaper-library-preview-empty">此壁纸没有可用预览文件</div>';
  } else if (record.type === 'video') {
    preview.innerHTML = '<video controls muted playsinline preload="metadata" src="' + wallpaperLibraryEsc(record.fileUrl) + '"></video>';
  } else {
    preview.innerHTML = '<img src="' + wallpaperLibraryEsc(record.fileUrl) + '" alt="' + wallpaperLibraryEsc(record.title) + '">';
  }
  wallpaperLibraryRenderExport(record);
}
async function wallpaperLibraryCheckLiveStatus() {
  var getStatus = wallpaperLibraryApi('wallpaperWindowsLiveStatus');
  if (!getStatus || !wallpaperLibraryState.baseUrl) return;
  var result = await getStatus(wallpaperLibraryState.baseUrl).catch(function () { return null; });
  if (!result || !result.ok) wallpaperLibraryRenderStatus('实时预览服务暂不可用，正在尝试连接。', 'warning');
}
function wallpaperLibraryUseConnection(result, sourceLabel) {
  if (!result || !result.ok) return false;
  wallpaperLibraryState.baseUrl = result.baseUrl;
  wallpaperLibraryState.host = result.host || result.baseUrl;
  wallpaperLibraryState.records = Array.isArray(result.records) ? result.records : [];
  wallpaperLibraryState.selectedId = '';
  try { localStorage.setItem('mineradio.windows-wallpaper.base-url', result.baseUrl); } catch (_) {}
  var input = wallpaperLibraryPanelEl('wallpaper-library-http-input');
  if (input) input.value = result.baseUrl;
  wallpaperLibraryRenderDiscoveredIp(result.baseUrl, wallpaperLibraryState.host);
  wallpaperLibraryRenderRecords();
  wallpaperLibraryRenderDetail();
  wallpaperLibraryRenderStatus(sourceLabel + '：' + wallpaperLibraryState.host + ' · ' + wallpaperLibraryState.records.length + ' 个壁纸', 'ok');
  return true;
}
async function connectWindowsWallpaperSource() {
  var input = wallpaperLibraryPanelEl('wallpaper-library-http-input');
  var connect = wallpaperLibraryApi('wallpaperWindowsConnect');
  var baseUrl = input && input.value.trim();
  if (!baseUrl) { wallpaperLibraryRenderStatus('请输入 Windows 地址，例如 http://192.168.1.20:8123', 'warning'); return; }
  if (!connect) { wallpaperLibraryRenderStatus('仅桌面版支持 Windows 壁纸库', 'error'); return; }
  wallpaperLibraryRenderStatus('正在验证 Windows Mineradio 服务...', 'loading');
  var result = await connect(baseUrl).catch(function () { return null; });
  if (!wallpaperLibraryUseConnection(result, '已连接')) wallpaperLibraryRenderStatus('连接失败：服务离线或 /api/ping 未确认。', 'error');
}
async function discoverWindowsWallpaperSources() {
  var discover = wallpaperLibraryApi('wallpaperWindowsDiscover');
  if (!discover) return;
  wallpaperLibraryRenderStatus('正在扫描局域网 Windows Mineradio 服务...', 'loading');
  var result = await discover().catch(function () { return null; });
  var service = result && result.ok && Array.isArray(result.services) ? result.services[0] : null;
  if (service && wallpaperLibraryUseConnection(service, '自动发现')) return;
  wallpaperLibraryRenderDiscoveredIp('', '');
  if (!wallpaperLibraryState.baseUrl) wallpaperLibraryRenderStatus('未发现在线 Windows 服务。可输入 http://Windows-IP:8123 手动连接。', 'warning');
}
function selectWallpaperLibraryRecord(id) {
  if (!id || id === wallpaperLibraryState.selectedId) return;
  wallpaperLibraryState.selectedId = id;
  wallpaperLibraryRenderRecords();
  wallpaperLibraryRenderDetail();
}
function closeWallpaperLibraryDetail() {
  wallpaperLibraryState.selectedId = '';
  wallpaperLibraryStopLivePreview();
  wallpaperLibraryRenderRecords();
  wallpaperLibraryRenderDetail();
}
function wallpaperLibraryClearExportPoller() {
  if (wallpaperLibraryState.exportPoller) clearTimeout(wallpaperLibraryState.exportPoller);
  wallpaperLibraryState.exportPoller = 0;
}
async function pollWindowsSceneExport() {
  var task = wallpaperLibraryState.exportTask;
  var getStatus = wallpaperLibraryApi('wallpaperWindowsExportStatus');
  if (!task || task.stopped || !getStatus) return;
  var result = await getStatus(wallpaperLibraryState.baseUrl, task.id).catch(function () { return null; });
  if (!result || !result.ok) {
    task.state = 'failed'; task.message = '无法读取导出状态，可重试。';
  } else if (result.state === 'completed') {
    task.state = 'completed'; task.output = result.output; task.message = 'Windows 已完成导出，可以保存 MP4。';
  } else if (result.state === 'failed') {
    task.state = 'failed'; task.message = 'Windows 导出失败，可重试。';
  } else {
    task.state = result.state === 'running' ? 'running' : 'queued';
    task.message = task.state === 'running' ? 'Windows 正在离屏渲染并编码 MP4...' : 'Windows 已收到导出任务，正在排队...';
  }
  wallpaperLibraryRenderExport(wallpaperLibrarySelectedRecord());
  if (task.state === 'queued' || task.state === 'running') wallpaperLibraryState.exportPoller = setTimeout(pollWindowsSceneExport, 1500);
}
async function startWindowsSceneExport() {
  var record = wallpaperLibrarySelectedRecord();
  var start = wallpaperLibraryApi('wallpaperWindowsExportStart');
  var input = wallpaperLibraryPanelEl('wallpaper-library-export-seconds');
  if (!record || record.type !== 'scene' || !start || wallpaperLibraryState.exportPoller) return;
  var seconds = Math.max(1, Math.min(300, Math.round(Number(input && input.value) || 30)));
  wallpaperLibraryState.exportTask = { sceneId: record.sceneId, state: 'starting', seconds: seconds, message: '正在提交 Windows 导出任务...' };
  wallpaperLibraryRenderExport(record);
  var result = await start(wallpaperLibraryState.baseUrl, record.sceneId, seconds).catch(function () { return null; });
  if (!result || !result.ok) {
    wallpaperLibraryState.exportTask.state = 'failed'; wallpaperLibraryState.exportTask.message = '导出任务未被 Windows 接受，可重试。';
    wallpaperLibraryRenderExport(record); return;
  }
  wallpaperLibraryState.exportTask.id = result.id;
  wallpaperLibraryState.exportTask.state = result.state || 'queued';
  wallpaperLibraryState.exportTask.message = 'Windows 已收到导出任务，正在排队...';
  wallpaperLibraryRenderExport(record);
  pollWindowsSceneExport();
}
function stopWindowsSceneExportPolling() {
  var task = wallpaperLibraryState.exportTask;
  if (!task) return;
  wallpaperLibraryClearExportPoller();
  task.stopped = true; task.state = 'stopped'; task.message = '已停止等待；Windows 上的任务可能仍在继续。';
  wallpaperLibraryRenderExport(wallpaperLibrarySelectedRecord());
}
async function downloadWindowsSceneExport() {
  var task = wallpaperLibraryState.exportTask;
  var download = wallpaperLibraryApi('wallpaperWindowsExportDownload');
  if (!task || task.state !== 'completed' || !task.output || !download) return;
  task.message = '请选择保存位置...';
  wallpaperLibraryRenderExport(wallpaperLibrarySelectedRecord());
  var result = await download(wallpaperLibraryState.baseUrl, task.output).catch(function () { return null; });
  task.message = result && result.ok ? '已保存 MP4。' : (result && result.error === 'DOWNLOAD_CANCELLED' ? '已取消保存。' : '保存失败，可重试。');
  wallpaperLibraryRenderExport(wallpaperLibrarySelectedRecord());
}
function wallpaperLibraryBlobFromResult(result) {
  var bytes = result && result.bytes;
  if (bytes instanceof ArrayBuffer) return new Blob([bytes], { type: result.mime || '' });
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(bytes)) {
    return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], { type: result.mime || '' });
  }
  return null;
}
async function applyWindowsWallpaperToMineradio() {
  var record = wallpaperLibrarySelectedRecord();
  var download = wallpaperLibraryApi('wallpaperWindowsDownloadMedia');
  if (!record || !download || !wallpaperLibraryState.baseUrl || typeof putCustomBackgroundBlob !== 'function' || typeof setCustomBackgroundMedia !== 'function') return;
  var exportTask = wallpaperLibraryState.exportTask;
  var output = record.type === 'scene' && exportTask && exportTask.sceneId === record.sceneId && exportTask.state === 'completed' ? exportTask.output : '';
  if (record.type === 'scene' && !output) return;
  var key = wallpaperLibrarySavedMediaKey(record, output);
  var task = wallpaperLibraryApplyTaskFor(record, output);
  if (task && task.state === 'downloading') return;
  wallpaperLibraryState.applyTask = { key: key, state: 'downloading', message: '' };
  wallpaperLibraryRenderExport(record);
  try {
    var saved = wallpaperLibraryReadSavedMedia(key);
    if (saved && saved.id && typeof getCustomBackgroundBlob === 'function' && await getCustomBackgroundBlob(saved.id)) {
      setCustomBackgroundMedia(saved);
      if (typeof renderVideoBgGrid === 'function') renderVideoBgGrid();
      wallpaperLibraryState.applyTask = { key: key, state: 'completed' };
      wallpaperLibraryRenderExport(record);
      return;
    }
    var request = record.type === 'scene'
      ? { kind: 'scene-export', fileName: output }
      : { kind: 'wallpaper', recordId: record.id, type: record.type };
    var result = await download(wallpaperLibraryState.baseUrl, request);
    var blob = result && result.ok ? wallpaperLibraryBlobFromResult(result) : null;
    if (!blob || !blob.size) throw new Error(result && result.error || 'MEDIA_DOWNLOAD_FAILED');
    var type = /^image\//i.test(result.mime || '') ? 'image' : 'video';
    var id = 'windows-bg-' + type + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    var media = { type: type, id: id, name: String(result.name || record.title || '').slice(0, 120), mime: String(result.mime || '').slice(0, 80), size: blob.size };
    await putCustomBackgroundBlob(id, blob, media);
    wallpaperLibraryWriteSavedMedia(key, media);
    setCustomBackgroundMedia(media);
    if (typeof renderVideoBgGrid === 'function') renderVideoBgGrid();
    wallpaperLibraryState.applyTask = { key: key, state: 'completed' };
  } catch (error) {
    wallpaperLibraryState.applyTask = { key: key, state: 'failed', message: error && error.message || '下载失败，可重试。' };
  }
  wallpaperLibraryRenderExport(record);
}
function wallpaperLibraryBindControls() {
  var search = wallpaperLibraryPanelEl('wallpaper-library-search');
  var type = wallpaperLibraryPanelEl('wallpaper-library-type');
  var sort = wallpaperLibraryPanelEl('wallpaper-library-sort');
  if (search) search.addEventListener('input', function () { wallpaperLibraryState.search = search.value || ''; wallpaperLibraryRenderRecords(); });
  if (type) type.addEventListener('change', function () { wallpaperLibraryState.type = type.value || 'all'; wallpaperLibraryRenderRecords(); });
  if (sort) sort.addEventListener('change', function () { wallpaperLibraryState.sort = sort.value || 'title'; wallpaperLibraryRenderRecords(); });
}
function openWallpaperLibraryPanel() {
  var mask = wallpaperLibraryPanelEl('wallpaper-library-modal');
  if (!mask) return;
  mask.classList.add('show'); mask.setAttribute('aria-hidden', 'false');
  var input = wallpaperLibraryPanelEl('wallpaper-library-http-input');
  if (input && !input.value) { try { input.value = localStorage.getItem('mineradio.windows-wallpaper.base-url') || ''; } catch (_) {} }
  if (input && input.value) connectWindowsWallpaperSource();
  discoverWindowsWallpaperSources();
}
function closeWallpaperLibraryPanel() {
  var mask = wallpaperLibraryPanelEl('wallpaper-library-modal');
  wallpaperLibraryClearExportPoller();
  closeWallpaperLibraryDetail();
  if (!mask) return;
  mask.classList.remove('show'); mask.setAttribute('aria-hidden', 'true');
}
var wallpaperLibraryMask = wallpaperLibraryPanelEl('wallpaper-library-modal');
if (wallpaperLibraryMask) {
  wallpaperLibraryBindControls();
  wallpaperLibraryMask.addEventListener('click', function (event) { if (event.target === wallpaperLibraryMask) closeWallpaperLibraryPanel(); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && wallpaperLibraryMask.classList.contains('show')) closeWallpaperLibraryPanel(); });
}
