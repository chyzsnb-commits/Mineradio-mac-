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
  selectedIds: new Set(),
  connectionPromise: null,
  connectionSource: '',
  batchTask: null,
  exportTask: null,
  exportPoller: 0,
  exportPollToken: 0,
  applyTask: null,
  livePreviewToken: 0,
  livePreviewTimer: 0,
  livePreviewAttempts: 0,
  isOpen: false,
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
function wallpaperLibraryRenderDiscoveredIp(baseUrl, host, source) {
  var el = wallpaperLibraryPanelEl('wallpaper-library-discovered-ip');
  if (!el) return;
  if (!baseUrl) { el.textContent = '未读取到在线 Windows 内网地址'; return; }
  var label = source === 'manual' ? '已连接 Windows：' : '自动读取 Windows IP：';
  el.textContent = label + baseUrl.replace(/^https?:\/\//, '') + (host ? ' · ' + host : '');
}
function wallpaperLibraryDiscoveryDiagnosticText(diagnostics) {
  var info = diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
  var udp = info.udp && typeof info.udp === 'object' ? info.udp : {};
  var subnet = info.subnetScan && typeof info.subnetScan === 'object' ? info.subnetScan : {};
  var probes = Array.isArray(info.probes) ? info.probes : [];
  var outcomes = probes.map(function (probe) { return probe && probe.outcome; });
  var networkText = subnet.candidates ? '已扫描 ' + subnet.candidates + ' 个同网段候选。' : '';
  if (info.reason === 'NO_UDP_ANNOUNCEMENT') {
    var probeText = outcomes.indexOf('PING_TIMEOUT') >= 0 ? ' 部分候选 /api/ping 超时。'
      : outcomes.indexOf('PING_REJECTED') >= 0 ? ' 部分候选 /api/ping 未返回 ok: true。'
        : outcomes.indexOf('PING_FAILED') >= 0 ? ' 部分候选 /api/ping 连接失败。' : '';
    return '未收到 UDP 45678 广播。' + networkText + probeText + ' Windows 服务应监听 0.0.0.0:端口，Windows 防火墙需放行 UDP 45678 与 TCP 服务端口；也可输入 http://Windows-IP:端口号立即验证。';
  }
  if (udp.parseError === 'PARSE_FAILED') {
    return '已收到 UDP 45678 数据，但不是有效的 MINERADIO_WALLPAPER IP:端口广播。' + networkText;
  }
  if (outcomes.indexOf('PING_TIMEOUT') >= 0) {
    return '已读取到 Windows 地址，但 /api/ping 超时。' + networkText + ' 请确认 Windows 服务监听 0.0.0.0、TCP 服务端口未被防火墙拦截。';
  }
  if (outcomes.indexOf('PING_REJECTED') >= 0) {
    return '已读取到地址，但 /api/ping 没有返回 ok: true。' + networkText;
  }
  if (outcomes.indexOf('PING_FAILED') >= 0) {
    return '已读取到地址，但 /api/ping 连接失败。' + networkText + ' 请检查 Windows 防火墙的 TCP 服务端口。';
  }
  if (info.reason === 'UDP_LISTEN_FAILED') {
    return 'Mac 无法监听 UDP 45678，已改为扫描 ' + (subnet.candidates || 0) + ' 个同网段候选。请检查本机网络权限。';
  }
  return '正在扫描 ' + (subnet.candidates || 0) + ' 个本机私网候选并验证 /api/ping。';
}
function wallpaperLibraryConnectionErrorText(result) {
  var error = result && result.error;
  if (error === 'HTTP_TIMEOUT') return '连接失败：/api/ping 超时，请检查 Windows 服务监听 0.0.0.0 和 TCP 防火墙规则。';
  if (error === 'PING_REJECTED') return '连接失败：/api/ping 未返回 ok: true。';
  if (error === 'HTTP_FAILED' || error === 'PING_FAILED') return '连接失败：无法访问 Windows 服务，请检查地址和 TCP 服务端口。';
  return '连接失败：服务离线或 /api/ping 未确认。';
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
// 缩略图标签按 previewUrl 的实际媒体类型决定，不能只看 record.type：
// Windows 端会为视频壁纸生成静态图片预览（preview.jpg/gif/png/webp），
// 把图片塞进 <video> 会 readyState=0、videoWidth=0，缩略图黑屏（真实 Electron 已复现）。
// 详情页仍按 record.type 用 record.fileUrl 播放真实视频，不受此影响。
function wallpaperLibraryPreviewUrlIsVideo(previewUrl) {
  return /\.(mp4|webm|ogg|mov|m4v)(?:[?#&]|$)/i.test(String(previewUrl || ''));
}
function wallpaperLibraryThumb(record) {
  var preview = wallpaperLibraryEsc(record.previewUrl || '');
  if (!preview) return '<div class="wallpaper-thumb wallpaper-thumb-empty">无缩略图</div>';
  var previewIsVideo = wallpaperLibraryPreviewUrlIsVideo(record.previewUrl || '');
  if (record.type === 'video' && previewIsVideo) return '<video class="wallpaper-thumb-media" muted playsinline preload="none" data-wallpaper-preview="' + preview + '"></video>';
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
function wallpaperLibraryUpdateCardSelection() {
  var list = wallpaperLibraryPanelEl('wallpaper-library-list');
  if (!list) return;
  Array.prototype.forEach.call(list.querySelectorAll('[data-wallpaper-id]'), function (card) {
    var selected = wallpaperLibraryState.selectedIds.has(card.dataset.wallpaperId);
    card.classList.toggle('is-batch-selected', selected);
    var checkbox = card.querySelector('.wallpaper-library-card-select');
    if (checkbox) checkbox.checked = selected;
    card.classList.toggle('active', card.dataset.wallpaperId === wallpaperLibraryState.selectedId);
  });
  var selectAll = wallpaperLibraryPanelEl('wallpaper-library-select-all');
  var records = wallpaperLibraryVisibleRecords();
  var allSelected = records.length > 0 && records.every(function (record) { return wallpaperLibraryState.selectedIds.has(record.id); });
  if (selectAll) selectAll.textContent = allSelected ? '取消全选' : '全选当前结果';
  var count = wallpaperLibraryPanelEl('wallpaper-library-selected-count');
  if (count) count.textContent = wallpaperLibraryState.selectedIds.size ? '已选 ' + wallpaperLibraryState.selectedIds.size + ' 张' : '未选择壁纸';
}
function toggleWallpaperLibraryRecordSelection(id, checked) {
  if (!id) return;
  if (checked) wallpaperLibraryState.selectedIds.add(id);
  else wallpaperLibraryState.selectedIds.delete(id);
  wallpaperLibraryUpdateCardSelection();
}
function toggleWallpaperLibraryVisibleSelection() {
  var records = wallpaperLibraryVisibleRecords();
  var allSelected = records.length > 0 && records.every(function (record) { return wallpaperLibraryState.selectedIds.has(record.id); });
  records.forEach(function (record) {
    if (allSelected) wallpaperLibraryState.selectedIds.delete(record.id);
    else wallpaperLibraryState.selectedIds.add(record.id);
  });
  wallpaperLibraryUpdateCardSelection();
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
      return '<div class="wallpaper-library-card' + (record.id === wallpaperLibraryState.selectedId ? ' active' : '') + (wallpaperLibraryState.selectedIds.has(record.id) ? ' is-batch-selected' : '') + '" data-wallpaper-id="' + wallpaperLibraryEsc(record.id) + '" role="button" tabindex="0" aria-label="预览 ' + wallpaperLibraryEsc(record.title) + '">' +
      '<label class="wallpaper-library-card-select-wrap" title="选择 ' + wallpaperLibraryEsc(record.title) + '"><input class="wallpaper-library-card-select" type="checkbox"' + (wallpaperLibraryState.selectedIds.has(record.id) ? ' checked' : '') + ' aria-label="选择 ' + wallpaperLibraryEsc(record.title) + '"></label>' +
      wallpaperLibraryThumb(record) +
      '<span class="wallpaper-library-card-meta"><span class="wallpaper-library-card-title">' + wallpaperLibraryEsc(record.title) + '</span><small>' + typeLabel + '</small></span>' +
      '<span class="wallpaper-library-card-type">' + (record.type === 'scene' ? 'Scene' : record.type === 'video' ? 'Video' : 'Image') + '</span></div>';
  }).join('');
  Array.prototype.forEach.call(list.querySelectorAll('[data-wallpaper-id]'), function (button) {
    button.addEventListener('click', function (event) {
      if (event.target && event.target.closest('.wallpaper-library-card-select-wrap')) return;
      selectWallpaperLibraryRecord(button.dataset.wallpaperId);
    });
    button.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectWallpaperLibraryRecord(button.dataset.wallpaperId); }
    });
    var checkbox = button.querySelector('.wallpaper-library-card-select');
    if (checkbox) checkbox.addEventListener('change', function () { toggleWallpaperLibraryRecordSelection(button.dataset.wallpaperId, checkbox.checked); });
  });
  wallpaperLibraryBindLazyMedia(list);
  wallpaperLibraryBindScrollPerformance(list);
  wallpaperLibraryUpdateCardSelection();
}
function wallpaperLibraryReleaseListResources() {
  var list = wallpaperLibraryPanelEl('wallpaper-library-list');
  if (!list) return;
  if (list._wallpaperMediaObserver) list._wallpaperMediaObserver.disconnect();
  list._wallpaperMediaObserver = null;
  if (list._wallpaperScrollStopTimer) clearTimeout(list._wallpaperScrollStopTimer);
  list._wallpaperScrollStopTimer = 0;
  list.classList.remove('is-scrolling');
  Array.prototype.forEach.call(list.querySelectorAll('[data-wallpaper-preview]'), function (media) {
    if (media.tagName === 'VIDEO' && typeof media.pause === 'function') media.pause();
    media.removeAttribute('src');
    if (media.tagName === 'VIDEO' && typeof media.load === 'function') media.load();
  });
  list.innerHTML = '<div class="wallpaper-library-empty">壁纸库已关闭。</div>';
}
function wallpaperLibraryStopLivePreview() {
  wallpaperLibraryState.livePreviewToken += 1;
  if (wallpaperLibraryState.livePreviewTimer) clearTimeout(wallpaperLibraryState.livePreviewTimer);
  wallpaperLibraryState.livePreviewTimer = 0;
  wallpaperLibraryState.livePreviewAttempts = 0;
  var preview = wallpaperLibraryPanelEl('wallpaper-library-preview');
  if (!preview) return wallpaperLibraryState.livePreviewToken;
  Array.prototype.forEach.call(preview.querySelectorAll('img.wallpaper-live-preview'), function (image) {
    image.removeAttribute('src');
    image.remove();
  });
  return wallpaperLibraryState.livePreviewToken;
}

function wallpaperLibraryRenderSceneFallback(record, message, allowRetry) {
  var preview = wallpaperLibraryPanelEl('wallpaper-library-preview');
  if (!preview || !record) return;
  var fallback = record.previewUrl
    ? '<img class="wallpaper-scene-fallback" src="' + wallpaperLibraryEsc(record.previewUrl) + '" alt="' + wallpaperLibraryEsc(record.title) + '">'
    : '<div class="wallpaper-library-preview-empty">此 Scene 没有静态缩略图</div>';
  var retry = allowRetry ? '<button type="button" class="modal-btn small secondary wallpaper-live-retry" onclick="wallpaperLibraryRetryLivePreview()">重试实时预览</button>' : '';
  preview.innerHTML = fallback + '<div class="wallpaper-live-label">' + wallpaperLibraryEsc(message || '正在准备 Windows 实时预览...') + '</div>' + retry;
  var image = preview.querySelector('.wallpaper-scene-fallback');
  if (image) image.addEventListener('error', function () {
    image.replaceWith(Object.assign(document.createElement('div'), { className: 'wallpaper-library-preview-empty', textContent: '静态缩略图暂不可用' }));
  }, { once: true });
}

function wallpaperLibraryScheduleLivePreview(record, token, delay, attempt) {
  if (!record || record.type !== 'scene' || !record.liveUrl) return;
  wallpaperLibraryState.livePreviewTimer = setTimeout(function () {
    wallpaperLibraryState.livePreviewTimer = 0;
    wallpaperLibraryAttachLivePreview(record, token, attempt || 1);
  }, Math.max(0, Number(delay) || 0));
}

function wallpaperLibraryAttachLivePreview(record, token, attempt) {
  var preview = wallpaperLibraryPanelEl('wallpaper-library-preview');
  if (!preview || token !== wallpaperLibraryState.livePreviewToken || wallpaperLibraryState.selectedId !== record.id) return;
  var image = document.createElement('img');
  image.className = 'wallpaper-live-preview';
  image.alt = 'Windows 实时预览';
  image.onload = function () {
    if (token !== wallpaperLibraryState.livePreviewToken || wallpaperLibraryState.selectedId !== record.id) {
      image.removeAttribute('src');
      image.remove();
      return;
    }
    var label = preview.querySelector('.wallpaper-live-label');
    if (label) label.textContent = 'Windows 实时预览';
    var retry = preview.querySelector('.wallpaper-live-retry');
    if (retry) retry.remove();
    var fallback = preview.querySelector('.wallpaper-scene-fallback');
    if (fallback) fallback.remove();
  };
  image.onerror = function () {
    image.removeAttribute('src');
    image.remove();
    if (token !== wallpaperLibraryState.livePreviewToken || wallpaperLibraryState.selectedId !== record.id) return;
    wallpaperLibraryState.livePreviewAttempts = attempt;
    if (attempt < 2) {
      wallpaperLibraryRenderSceneFallback(record, '实时预览被占用，正在稍后重试...', false);
      wallpaperLibraryScheduleLivePreview(record, token, 420, attempt + 1);
    } else {
      wallpaperLibraryRenderSceneFallback(record, '实时预览被占用或暂不可用', true);
    }
  };
  preview.appendChild(image);
  image.src = record.liveUrl;
}

function wallpaperLibraryRetryLivePreview() {
  var record = wallpaperLibrarySelectedRecord();
  if (!record || record.type !== 'scene') return;
  var token = wallpaperLibraryStopLivePreview();
  wallpaperLibraryRenderSceneFallback(record, '正在重新连接 Windows 实时预览...', false);
  wallpaperLibraryScheduleLivePreview(record, token, 180, 1);
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
  var applyState = state && state.state === 'completed' ? wallpaperLibraryApplyTaskFor(record, state.output || '') : null;
  var applyBusy = applyState && applyState.state === 'downloading';
  var applyLabel = applyBusy ? '正在应用...' : applyState && applyState.state === 'completed' ? '再次应用' : '应用 MP4 到 Mineradio';
  var applyAction = '<button type="button" class="modal-btn small"' + (applyBusy ? ' disabled' : '') + ' onclick="applyWindowsWallpaperToMineradio()">' + applyLabel + '</button>';
  var action = !state || state.state === 'failed' || state.state === 'stopped'
    ? '<button type="button" class="modal-btn small" onclick="startWindowsSceneExport()">' + (state ? '重试导出 MP4' : '导出 MP4') + '</button>'
    : state.state === 'completed'
      ? '<button type="button" class="modal-btn small secondary" onclick="downloadWindowsSceneExport()">保存 MP4 到文件夹</button>' + applyAction
      : '<button type="button" class="modal-btn small secondary" onclick="stopWindowsSceneExportPolling()">停止等待</button>';
  var applyDetail = applyBusy ? '<div class="wallpaper-export-state" data-state="running">正在下载并保存到 Mineradio 本地背景库...</div>' : applyState && applyState.state === 'completed' ? '<div class="wallpaper-export-state" data-state="completed">已保存到 Mineradio 本地背景库并应用，之后无需重新下载。</div>' : applyState && applyState.state === 'failed' ? '<div class="wallpaper-export-state" data-state="failed">' + wallpaperLibraryEsc(applyState.message || '应用失败，可重试。') + '</div>' : '';
  exportEl.innerHTML = '<div class="wallpaper-export-controls"><label>时长 <input id="wallpaper-library-export-seconds" type="number" min="1" max="300" value="' + (state && state.seconds || 30) + '"> 秒</label>' + action + '</div><div class="wallpaper-export-state" data-state="' + wallpaperLibraryEsc(state && state.state || 'ready') + '">' + wallpaperLibraryEsc(detail) + '</div>' + applyDetail;
}
function wallpaperLibraryRenderDetail() {
  var preview = wallpaperLibraryPanelEl('wallpaper-library-preview');
  var meta = wallpaperLibraryPanelEl('wallpaper-library-preview-meta');
  var drawer = wallpaperLibraryPanelEl('wallpaper-library-details-drawer');
  if (!preview || !meta || !drawer) return;
  var livePreviewToken = wallpaperLibraryStopLivePreview();
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
    wallpaperLibraryRenderSceneFallback(record, '正在准备 Windows 实时预览...', false);
    wallpaperLibraryScheduleLivePreview(record, livePreviewToken, 220, 1);
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
  var selectedId = wallpaperLibraryState.selectedId;
  var livePreviewToken = wallpaperLibraryState.livePreviewToken;
  var result = await getStatus(wallpaperLibraryState.baseUrl).catch(function () { return null; });
  if (selectedId !== wallpaperLibraryState.selectedId || livePreviewToken !== wallpaperLibraryState.livePreviewToken) return;
  if (!result || !result.ok) wallpaperLibraryRenderStatus('实时预览服务暂不可用，正在尝试连接。', 'warning');
}
function wallpaperLibraryUseConnection(result, sourceLabel, source) {
  if (!result || !result.ok) return false;
  source = source || result.source || 'manual';
  wallpaperLibraryState.baseUrl = result.baseUrl;
  wallpaperLibraryState.host = result.host || result.baseUrl;
  wallpaperLibraryState.connectionSource = source;
  wallpaperLibraryState.records = Array.isArray(result.records) ? result.records : [];
  wallpaperLibraryState.selectedId = '';
  wallpaperLibraryState.selectedIds.clear();
  try { localStorage.setItem('mineradio.windows-wallpaper.base-url', result.baseUrl); } catch (_) {}
  var input = wallpaperLibraryPanelEl('wallpaper-library-http-input');
  if (input) input.value = result.baseUrl;
  if (!wallpaperLibraryState.isOpen) return true;
  wallpaperLibraryRenderDiscoveredIp(result.baseUrl, wallpaperLibraryState.host, source);
  wallpaperLibraryRenderRecords();
  wallpaperLibraryRenderDetail();
  wallpaperLibraryRenderStatus(sourceLabel + '：' + result.baseUrl + (wallpaperLibraryState.host ? ' · ' + wallpaperLibraryState.host : '') + ' · ' + wallpaperLibraryState.records.length + ' 个壁纸', 'ok');
  return true;
}
async function connectWindowsWallpaperSource(options) {
  var opts = options || {};
  var input = wallpaperLibraryPanelEl('wallpaper-library-http-input');
  var connect = wallpaperLibraryApi('wallpaperWindowsConnect');
  var baseUrl = opts.baseUrl || (input && input.value.trim());
  if (!baseUrl) { wallpaperLibraryRenderStatus('请输入 Windows 地址，例如 http://Windows-IP:端口号（1024-65535）', 'warning'); return; }
  if (!connect) { wallpaperLibraryRenderStatus('仅桌面版支持 Windows 壁纸库', 'error'); return; }
  wallpaperLibraryRenderStatus(opts.source === 'cache' ? '正在验证保存的 Windows 地址...' : '正在验证 Windows Mineradio 服务...', 'loading');
  var result = await connect(baseUrl).catch(function () { return null; });
  var connected = wallpaperLibraryUseConnection(result, opts.source === 'cache' ? '已自动连接' : '已连接', opts.source || 'manual');
  if (!connected && !opts.silentFailure) wallpaperLibraryRenderStatus(wallpaperLibraryConnectionErrorText(result), 'error');
  return connected;
}
async function wallpaperLibraryRunDiscovery() {
  var discover = wallpaperLibraryApi('wallpaperWindowsDiscover');
  if (!discover) return;
  wallpaperLibraryRenderStatus('正在等待 UDP 广播并扫描同网段候选...', 'loading');
  var result = await discover().catch(function () { return null; });
  var service = result && result.ok && Array.isArray(result.services) ? result.services[0] : null;
  var source = service && service.source || (result && result.diagnostics && result.diagnostics.udp && result.diagnostics.udp.received ? 'udp' : 'subnet');
  if (service && wallpaperLibraryUseConnection(service, '自动发现', source)) return true;
  if (!wallpaperLibraryState.isOpen) return false;
  wallpaperLibraryRenderDiscoveredIp('', '');
  wallpaperLibraryRenderStatus(wallpaperLibraryDiscoveryDiagnosticText(result && result.diagnostics), 'warning');
  return false;
}
function wallpaperLibrarySavedBaseUrl() {
  var input = wallpaperLibraryPanelEl('wallpaper-library-http-input');
  var saved = input && input.value.trim();
  if (!saved) {
    try { saved = localStorage.getItem('mineradio.windows-wallpaper.base-url') || ''; } catch (_) {}
    if (input && saved) input.value = saved;
  }
  return saved;
}
function wallpaperLibraryDiscoverAndConnect(options) {
  if (wallpaperLibraryState.connectionPromise) return wallpaperLibraryState.connectionPromise;
  var opts = options || {};
  wallpaperLibraryState.connectionPromise = (async function () {
    var connected = false;
    if (!opts.forceDiscovery) {
      var saved = wallpaperLibrarySavedBaseUrl();
      if (saved) connected = await connectWindowsWallpaperSource({ baseUrl: saved, source: 'cache', silentFailure: true });
    }
    if (!connected) connected = await wallpaperLibraryRunDiscovery();
    return connected;
  })().finally(function () { wallpaperLibraryState.connectionPromise = null; });
  return wallpaperLibraryState.connectionPromise;
}
function discoverWindowsWallpaperSources() {
  return wallpaperLibraryDiscoverAndConnect({ forceDiscovery: true });
}
function selectWallpaperLibraryRecord(id) {
  if (!id || id === wallpaperLibraryState.selectedId) return;
  wallpaperLibraryState.selectedId = id;
  wallpaperLibraryUpdateCardSelection();
  wallpaperLibraryRenderDetail();
}
function closeWallpaperLibraryDetail() {
  wallpaperLibraryState.selectedId = '';
  wallpaperLibraryStopLivePreview();
  wallpaperLibraryUpdateCardSelection();
  wallpaperLibraryRenderDetail();
}
function wallpaperLibraryClearExportPoller() {
  wallpaperLibraryState.exportPollToken += 1;
  if (wallpaperLibraryState.exportPoller) clearTimeout(wallpaperLibraryState.exportPoller);
  wallpaperLibraryState.exportPoller = 0;
}
async function pollWindowsSceneExport() {
  var task = wallpaperLibraryState.exportTask;
  var getStatus = wallpaperLibraryApi('wallpaperWindowsExportStatus');
  if (!task || task.stopped || !getStatus) return;
  var pollToken = wallpaperLibraryState.exportPollToken;
  var selectedId = wallpaperLibraryState.selectedId;
  var baseUrl = wallpaperLibraryState.baseUrl;
  var result = await getStatus(baseUrl, task.id).catch(function () { return null; });
  if (pollToken !== wallpaperLibraryState.exportPollToken || task !== wallpaperLibraryState.exportTask
    || task.stopped || selectedId !== wallpaperLibraryState.selectedId) return;
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
  wallpaperLibraryState.exportPollToken += 1;
  var task = wallpaperLibraryState.exportTask = { sceneId: record.sceneId, state: 'starting', seconds: seconds, message: '正在提交 Windows 导出任务...' };
  var exportToken = wallpaperLibraryState.exportPollToken;
  var selectedId = wallpaperLibraryState.selectedId;
  var baseUrl = wallpaperLibraryState.baseUrl;
  wallpaperLibraryRenderExport(record);
  var result = await start(baseUrl, record.sceneId, seconds).catch(function () { return null; });
  if (exportToken !== wallpaperLibraryState.exportPollToken || task !== wallpaperLibraryState.exportTask
    || selectedId !== wallpaperLibraryState.selectedId || task.stopped) return;
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
async function wallpaperLibraryBlobFromResult(result) {
  if (!result || !result.url) return null;
  var parsed;
  try { parsed = new URL(result.url); } catch (error) { return null; }
  if (parsed.protocol !== 'mineradio-wallpaper:' || parsed.hostname !== 'download') return null;
  var response = await fetch(result.url);
  if (!response || !response.ok) return null;
  var mime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!mime || mime !== String(result.mime || '').toLowerCase()) return null;
  var blob = await response.blob();
  return blob && blob.size > 0 && (!result.size || blob.size === Number(result.size)) ? blob : null;
}
async function wallpaperLibraryImportRecord(record) {
  var download = wallpaperLibraryApi('wallpaperWindowsDownloadMedia');
  if (!record || !download || !wallpaperLibraryState.baseUrl || typeof putCustomBackgroundBlob !== 'function') throw new Error('IMPORT_UNAVAILABLE');
  var exportTask = wallpaperLibraryState.exportTask;
  var output = record.type === 'scene' && exportTask && exportTask.sceneId === record.sceneId && exportTask.state === 'completed' ? exportTask.output : '';
  if (record.type === 'scene' && !output) throw new Error('SCENE_EXPORT_REQUIRED');
  var key = wallpaperLibrarySavedMediaKey(record, output);
  var saved = wallpaperLibraryReadSavedMedia(key);
  if (saved && saved.id && typeof getCustomBackgroundBlob === 'function' && await getCustomBackgroundBlob(saved.id)) return { reused: true, media: saved };
  var request = record.type === 'scene'
    ? { kind: 'scene-export', fileName: output }
    : { kind: 'wallpaper', recordId: record.id, type: record.type };
  var result = await download(wallpaperLibraryState.baseUrl, request);
  var blob = result && result.ok ? await wallpaperLibraryBlobFromResult(result) : null;
  if (!blob || !blob.size) throw new Error(result && result.error || 'MEDIA_DOWNLOAD_FAILED');
  var type = /^image\//i.test(result.mime || '') ? 'image' : 'video';
  var id = 'windows-bg-' + type + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  var media = { type: type, id: id, name: String(result.name || record.title || '').slice(0, 120), mime: String(result.mime || '').slice(0, 80), size: blob.size };
  await putCustomBackgroundBlob(id, blob, media);
  if (typeof mirrorCustomBackgroundBlob === 'function') await mirrorCustomBackgroundBlob(blob, media);
  wallpaperLibraryWriteSavedMedia(key, media);
  return { reused: false, media: media, blob: blob };
}
function wallpaperLibraryRenderBatchState() {
  var state = wallpaperLibraryPanelEl('wallpaper-library-batch-state');
  var task = wallpaperLibraryState.batchTask;
  if (!state) return;
  if (!task) { state.textContent = ''; state.dataset.state = ''; return; }
  state.dataset.state = task.state || '';
  state.textContent = task.message || '';
}
async function importSelectedWindowsWallpapers() {
  if (wallpaperLibraryState.batchTask && wallpaperLibraryState.batchTask.state === 'running') return;
  var records = (wallpaperLibraryState.records || []).filter(function (record) { return wallpaperLibraryState.selectedIds.has(record.id); });
  if (!records.length) { wallpaperLibraryRenderStatus('请先勾选要导入的图片或视频壁纸。', 'warning'); return; }
  var task = wallpaperLibraryState.batchTask = { state: 'running', completed: 0, reused: 0, failed: [], skipped: 0, message: '准备导入 ' + records.length + ' 张壁纸...' };
  wallpaperLibraryRenderBatchState();
  for (var index = 0; index < records.length; index += 1) {
    var record = records[index];
    task.message = '正在导入 ' + (index + 1) + '/' + records.length + '：' + record.title;
    wallpaperLibraryRenderBatchState();
    try {
      var imported = await wallpaperLibraryImportRecord(record);
      if (imported.reused) task.reused += 1;
      else task.completed += 1;
    } catch (error) {
      if (error && error.message === 'SCENE_EXPORT_REQUIRED') task.skipped += 1;
      else task.failed.push(record.title);
    }
  }
  task.state = task.failed.length ? 'failed' : 'completed';
  task.message = '导入完成：新增 ' + task.completed + ' 张，复用本地 ' + task.reused + ' 张' + (task.skipped ? '，Scene 待导出 ' + task.skipped + ' 张' : '') + (task.failed.length ? '，失败 ' + task.failed.length + ' 张。' : '。');
  if (typeof renderVideoBgGrid === 'function') renderVideoBgGrid();
  wallpaperLibraryRenderBatchState();
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
    var result;
    if (record.type === 'scene') {
      result = await wallpaperLibraryImportRecord(record);
      setCustomBackgroundMedia(result.media);
    } else {
      result = await wallpaperLibraryImportRecord(record);
      setCustomBackgroundMedia(result.media);
    }
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
  var selectAll = wallpaperLibraryPanelEl('wallpaper-library-select-all');
  var batchImport = wallpaperLibraryPanelEl('wallpaper-library-batch-import');
  if (search) search.addEventListener('input', function () { wallpaperLibraryState.search = search.value || ''; wallpaperLibraryRenderRecords(); });
  if (type) type.addEventListener('change', function () { wallpaperLibraryState.type = type.value || 'all'; wallpaperLibraryRenderRecords(); });
  if (sort) sort.addEventListener('change', function () { wallpaperLibraryState.sort = sort.value || 'title'; wallpaperLibraryRenderRecords(); });
  if (selectAll) selectAll.addEventListener('click', toggleWallpaperLibraryVisibleSelection);
  if (batchImport) batchImport.addEventListener('click', importSelectedWindowsWallpapers);
}
async function wallpaperLibraryOpenSavedOrDiscover() {
  return wallpaperLibraryDiscoverAndConnect();
}
function openWallpaperLibraryPanel() {
  var mask = wallpaperLibraryPanelEl('wallpaper-library-modal');
  if (!mask) return;
  wallpaperLibraryState.isOpen = true;
  mask.classList.add('show'); mask.setAttribute('aria-hidden', 'false');
  if (wallpaperLibraryState.baseUrl && wallpaperLibraryState.records.length) wallpaperLibraryRenderRecords();
  wallpaperLibraryDiscoverAndConnect();
}
function closeWallpaperLibraryPanel() {
  var mask = wallpaperLibraryPanelEl('wallpaper-library-modal');
  wallpaperLibraryState.isOpen = false;
  wallpaperLibraryClearExportPoller();
  closeWallpaperLibraryDetail();
  wallpaperLibraryReleaseListResources();
  if (!mask) return;
  mask.classList.remove('show'); mask.setAttribute('aria-hidden', 'true');
}
var wallpaperLibraryMask = wallpaperLibraryPanelEl('wallpaper-library-modal');
if (wallpaperLibraryMask) {
  wallpaperLibraryBindControls();
  wallpaperLibraryMask.addEventListener('click', function (event) { if (event.target === wallpaperLibraryMask) closeWallpaperLibraryPanel(); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && wallpaperLibraryMask.classList.contains('show')) closeWallpaperLibraryPanel(); });
}
