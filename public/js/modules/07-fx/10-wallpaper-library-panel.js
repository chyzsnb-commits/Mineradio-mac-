'use strict';

// 壁纸库面板（macOS）：从另一台 Windows 电脑（Win 版 Mineradio + Wallpaper Engine 库）读取壁纸。
// 两种来源：① 目录扫描（SMB 挂载路径 /Volumes/... 或本地拷贝的 WE 库目录）
//            ② HTTP 源（Win 端可选共享脚本提供 /api/wallpapers 列表）
// 图片/视频壁纸可点选播放；Scene 场景壁纸（PKGV）需 WE 引擎，Mac 不可播，标注不可用。

var wallpaperLibraryState = {
  records: [],
  selectedId: null,
  sourceKind: '',       // 'dir' | 'http'
  sourceValue: '',
  playing: false,
};

function wallpaperLibraryPanelEl(id) {
  return document.getElementById(id);
}

function wallpaperLibraryRenderStatus(text) {
  var el = wallpaperLibraryPanelEl('wallpaper-library-status');
  if (el) el.textContent = text || '';
}

function wallpaperLibraryRenderRecords() {
  var list = wallpaperLibraryPanelEl('wallpaper-library-list');
  if (!list) return;
  var records = wallpaperLibraryState.records || [];
  if (!records.length) {
    list.innerHTML = '<div class="wallpaper-library-empty">还没有壁纸。选择壁纸库目录（SMB 挂载或拷贝的 WE 库）或输入 Win 电脑的 HTTP 壁纸源地址。</div>';
    return;
  }
  list.innerHTML = records.map(function (r, i) {
    var typeLabel = r.type === 'video' ? '视频' : '图片';
    var sceneNote = r.enginePlayable ? '' : (r.projectType === 'scene' ? '<span class="wallpaper-scene-note">需 WE 软件</span>' : '');
    var preview = r.httpPreviewUrl || r.httpUrl || (r.mediaFile ? 'mineradio-wallpaper://' + encodeURIComponent(r.mediaFile) : '');
    var thumb = preview
      ? '<div class="wallpaper-thumb" style="background-image:url(\'' + preview.replace(/'/g, "\\'") + '\')"></div>'
      : '<div class="wallpaper-thumb wallpaper-thumb-empty"></div>';
    return '<button type="button" class="wallpaper-record' + (r.id === wallpaperLibraryState.selectedId ? ' active' : '') +
      '" data-wallpaper-index="' + i + '" onclick="selectWallpaperLibraryRecord(' + i + ')">' +
      thumb +
      '<span class="wallpaper-record-copy"><span class="wallpaper-record-title">' + escHtml(r.title || '壁纸') + '</span>' +
      '<span class="wallpaper-record-meta">' + typeLabel + sceneNote + '</span></span>' +
      (r.enginePlayable ? '<span class="wallpaper-badge">Scene</span>' : '') +
      '</button>';
  }).join('');
}

function wallpaperLibraryRenderDetail() {
  var el = wallpaperLibraryPanelEl('wallpaper-library-preview');
  var metaEl = wallpaperLibraryPanelEl('wallpaper-library-preview-meta');
  if (!el || !metaEl) return;
  var r = null;
  (wallpaperLibraryState.records || []).forEach(function (rec) {
    if (rec.id === wallpaperLibraryState.selectedId) r = rec;
  });
  if (!r) {
    el.innerHTML = '<div class="wallpaper-library-preview-empty">选择一张壁纸预览</div>';
    metaEl.textContent = '';
    return;
  }
  if (r.enginePlayable) {
    el.innerHTML = '<div class="wallpaper-library-preview-empty">Scene 场景壁纸需 Wallpaper Engine 软件运行，Mac 无法播放。</div>';
    metaEl.textContent = r.title || '';
    return;
  }
  var src = r.httpUrl || r.httpPreviewUrl || (r.mediaFile ? 'mineradio-wallpaper://' + encodeURIComponent(r.mediaFile) : '');
  if (!src) {
    el.innerHTML = '<div class="wallpaper-library-preview-empty">无法定位壁纸文件</div>';
    metaEl.textContent = r.title || '';
    return;
  }
  if (r.type === 'video') {
    el.innerHTML = '<video controls autoplay muted loop playsinline src="' + src.replace(/"/g, '&quot;') + '"></video>';
  } else {
    el.innerHTML = '<img src="' + src.replace(/"/g, '&quot;') + '" alt="">';
  }
  metaEl.textContent = r.title || '';
}

async function refreshWallpaperLibraryList() {
  if (!window.desktopWindow || typeof window.desktopWindow.wallpaperLibraryList !== 'function') {
    wallpaperLibraryRenderStatus('仅桌面版支持壁纸库');
    return;
  }
  wallpaperLibraryRenderStatus('正在读取壁纸库...');
  var result = await window.desktopWindow.wallpaperLibraryList().catch(function () { return null; });
  if (!result || !result.ok) {
    wallpaperLibraryRenderStatus(result && result.error ? ('读取失败：' + result.error) : '读取失败');
    return;
  }
  wallpaperLibraryState.records = (result.records || []).map(function (rec) {
    return {
      id: String(rec.id || rec.projectRoot || ''),
      title: rec.title || '',
      type: rec.playable ? (rec.mediaType === 'video' ? 'video' : 'image') : 'image',
      enginePlayable: rec.enginePlayable === true,
      projectType: rec.projectType || '',
      mediaFile: rec.mediaFile || '',
    };
  });
  wallpaperLibraryRenderRecords();
  if (!wallpaperLibraryState.selectedId && wallpaperLibraryState.records.length) {
    wallpaperLibraryState.selectedId = wallpaperLibraryState.records[0].id;
  }
  wallpaperLibraryRenderDetail();
  wallpaperLibraryRenderStatus('共 ' + wallpaperLibraryState.records.length + ' 个壁纸');
}

async function scanWallpaperLibraryDir() {
  var input = wallpaperLibraryPanelEl('wallpaper-library-dir-input');
  var dir = input && input.value.trim();
  if (!dir) { wallpaperLibraryRenderStatus('请输入壁纸库目录路径（如 /Volumes/共享盘/.../431960 或本地 WE 库目录）'); return; }
  if (!window.desktopWindow || typeof window.desktopWindow.wallpaperLibraryScanDir !== 'function') return;
  wallpaperLibraryRenderStatus('正在扫描目录...');
  var result = await window.desktopWindow.wallpaperLibraryScanDir(dir).catch(function () { return null; });
  if (!result || !result.ok) {
    wallpaperLibraryRenderStatus(result && result.error ? ('扫描失败：' + result.error) : '扫描失败');
    return;
  }
  wallpaperLibraryState.sourceKind = 'dir';
  wallpaperLibraryState.sourceValue = dir;
  await refreshWallpaperLibraryList();
}

async function scanWallpaperLibraryHttp() {
  var input = wallpaperLibraryPanelEl('wallpaper-library-http-input');
  var url = input && input.value.trim();
  if (!url) { wallpaperLibraryRenderStatus('请输入 Win 电脑的 HTTP 壁纸源地址（如 http://192.168.1.10:8123）'); return; }
  if (!window.desktopWindow || typeof window.desktopWindow.wallpaperLibraryScanHttp !== 'function') return;
  wallpaperLibraryRenderStatus('正在连接壁纸源...');
  var result = await window.desktopWindow.wallpaperLibraryScanHttp(url).catch(function () { return null; });
  if (!result || !result.ok) {
    wallpaperLibraryRenderStatus(result && result.error ? ('连接失败：' + result.error) : '连接失败');
    return;
  }
  wallpaperLibraryState.sourceKind = 'http';
  wallpaperLibraryState.sourceValue = url;
  wallpaperLibraryState.records = (result.records || []).map(function (r, i) {
    return {
      id: String(r.id || 'http-' + i),
      title: r.title || '',
      type: r.type === 'video' ? 'video' : 'image',
      httpUrl: r.httpUrl || '',
      httpPreviewUrl: r.httpPreviewUrl || r.httpUrl || '',
    };
  });
  wallpaperLibraryRenderRecords();
  if (wallpaperLibraryState.records.length) wallpaperLibraryState.selectedId = wallpaperLibraryState.records[0].id;
  wallpaperLibraryRenderDetail();
  wallpaperLibraryRenderStatus('共 ' + wallpaperLibraryState.records.length + ' 个壁纸（HTTP 源）');
}

function selectWallpaperLibraryRecord(index) {
  var records = wallpaperLibraryState.records || [];
  var r = records[index];
  if (!r) return;
  wallpaperLibraryState.selectedId = r.id;
  wallpaperLibraryRenderRecords();
  wallpaperLibraryRenderDetail();
}

function openWallpaperLibraryPanel() {
  var mask = wallpaperLibraryPanelEl('wallpaper-library-modal');
  if (!mask) return;
  mask.classList.add('show');
  mask.setAttribute('aria-hidden', 'false');
  refreshWallpaperLibraryList();
}

function closeWallpaperLibraryPanel() {
  var mask = wallpaperLibraryPanelEl('wallpaper-library-modal');
  if (!mask) return;
  mask.classList.remove('show');
  mask.setAttribute('aria-hidden', 'true');
}

var wallpaperLibraryMask = wallpaperLibraryPanelEl('wallpaper-library-modal');
if (wallpaperLibraryMask) {
  wallpaperLibraryMask.addEventListener('click', function (e) {
    if (e.target === wallpaperLibraryMask) closeWallpaperLibraryPanel();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && wallpaperLibraryMask && wallpaperLibraryMask.classList.contains('show')) {
      closeWallpaperLibraryPanel();
    }
  });
}
