// 软件内更新提示 UI（渲染层）。
// 主进程 update-checker 发现新版本后经 IPC 'mineradio-update-event' 推送；
// 本模块显示右下角更新卡（版本号 + 说明 + 一键下载 + 进度），不改动任何既有布局。
'use strict';

var updateCardState = { checking: false, lastResult: null, downloading: false };

// 右上角 update-entry 按钮徽标（效仿 Windows 版：有新版亮起呼吸光点，下载转进度环）
function updateEntryBadge(mode) {
  var entry = document.getElementById('update-entry');
  if (!entry) return;
  if (mode === 'available') { entry.classList.add('available'); entry.classList.remove('downloading', 'ready'); }
  else if (mode === 'downloading') { entry.classList.add('available', 'downloading'); entry.classList.remove('ready'); }
  else if (mode === 'clear') { entry.classList.remove('downloading', 'ready'); }
}

function updateCardEnsure() {
  var el = document.getElementById('mineradio-update-card');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'mineradio-update-card';
  el.className = 'mineradio-update-card';
  document.body.appendChild(el);
  return el;
}

function updateCardRender(payload) {
  var el = updateCardEnsure();
  if (!payload || payload.type === 'auto-check' && !payload.hasUpdate) { el.classList.remove('show'); return; }
  if (payload.type === 'manual-check' && (!payload.ok || !payload.hasUpdate)) {
    el.innerHTML = '<div class="mineradio-update-title">软件更新</div><div class="mineradio-update-body">当前已是最新版本。</div>';
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 4000);
    return;
  }
  if (!payload.hasUpdate) { el.classList.remove('show'); return; }
  var html = '<div class="mineradio-update-title">发现新版本 v' + updateCardEsc(payload.latestVersion) + '</div>';
  html += '<div class="mineradio-update-body">' + updateCardEsc(payload.notes || '点击下载更新。') + '</div>';
  if (updateCardState.downloading) {
    html += '<div class="mineradio-update-progress"><div class="mineradio-update-progress-bar" style="width:' + updateCardState.progress + '%"></div></div><div class="mineradio-update-body">正在下载 ' + updateCardState.progress + '%（完成后自动打开安装器）</div>';
  } else {
    html += '<button type="button" class="mineradio-update-btn" onclick="mineradioUpdateDownload()">下载更新</button>';
    html += '<button type="button" class="mineradio-update-btn mineradio-update-btn-secondary" onclick="this.parentNode.classList.remove(\'show\')">稍后</button>';
  }
  el.innerHTML = html;
  el.classList.add('show');
  updateEntryBadge('available');
}

function updateCardEsc(text) {
  return String(text || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function mineradioUpdateDownload() {
  var result = updateCardState.lastResult;
  if (!result || !result.downloadUrl || updateCardState.downloading) return;
  updateCardState.downloading = true;
  updateCardState.progress = 0;
  updateEntryBadge('downloading');
  updateCardRender({ hasUpdate: true, latestVersion: result.latestVersion, notes: result.notes });
  try {
    var download = window.desktopWindow && window.desktopWindow.updateDownload
      ? await window.desktopWindow.updateDownload(result.downloadUrl)
      : { ok: false, reason: 'no-bridge' };
    updateCardState.downloading = false;
    updateEntryBadge('clear');
    var el = updateCardEnsure();
    if (download && download.ok) {
      el.innerHTML = '<div class="mineradio-update-title">下载完成</div><div class="mineradio-update-body">已打开安装器，按提示拖入 Applications 完成安装。</div>';
      setTimeout(function () { el.classList.remove('show'); }, 8000);
    } else {
      el.innerHTML = '<div class="mineradio-update-title">下载失败</div><div class="mineradio-update-body">' + updateCardEsc((download && (download.reason || download.error)) || '未知原因') + '，可稍后重试。</div>';
      setTimeout(function () { el.classList.remove('show'); }, 6000);
    }
  } catch (e) {
    updateCardState.downloading = false;
    updateEntryBadge('clear');
  }
}

function updateCardBindEvents() {
  if (!window.desktopWindow || typeof window.desktopWindow.onUpdateEvent !== 'function') return;
  window.desktopWindow.onUpdateEvent(function (payload) {
    if (!payload) return;
    if (payload.type === 'download-progress') {
      var total = Number(payload.total) || 0;
      updateCardState.progress = total > 0 ? Math.min(99, Math.round((Number(payload.loaded) / total) * 100)) : 0;
      updateCardRender({ hasUpdate: true, latestVersion: updateCardState.lastResult && updateCardState.lastResult.latestVersion, notes: updateCardState.lastResult && updateCardState.lastResult.notes });
      return;
    }
    if (payload.hasUpdate) updateCardState.lastResult = payload;
    updateCardRender(payload);
  });
}

updateCardBindEvents();

// 右上角更新按钮入口：手动触发检查（走主进程真实清单）。
// 检查中/无更新/有更新分别反馈；有新版复用提示卡（含下载按钮）。
async function mineradioUpdateCheckManually() {
  if (updateCardState.checking) return;
  updateCardState.checking = true;
  var el = updateCardEnsure();
  el.innerHTML = '<div class="mineradio-update-title">软件更新</div><div class="mineradio-update-body">正在检查更新...</div>';
  el.classList.add('show');
  try {
    var result = window.desktopWindow && window.desktopWindow.updateCheckNow
      ? await window.desktopWindow.updateCheckNow()
      : { ok: false, reason: 'no-bridge' };
    updateCardState.checking = false;
    if (result && result.ok && result.hasUpdate) {
      updateCardState.lastResult = result;
      updateEntryBadge('available');
      updateCardRender({ hasUpdate: true, latestVersion: result.latestVersion, notes: result.notes });
      return;
    }
    if (result && result.ok && !result.hasUpdate) {
      el.innerHTML = '<div class="mineradio-update-title">软件更新</div><div class="mineradio-update-body">当前已是最新版本' + (result.latestVersion ? '（清单版本 v' + updateCardEsc(result.latestVersion) + '）' : '') + '。</div>';
      setTimeout(function () { el.classList.remove('show'); }, 4000);
      return;
    }
    el.innerHTML = '<div class="mineradio-update-title">检查失败</div><div class="mineradio-update-body">' + updateCardEsc((result && (result.reason || result.error)) || '网络异常，稍后重试') + '。</div>';
    setTimeout(function () { el.classList.remove('show'); }, 5000);
  } catch (e) {
    updateCardState.checking = false;
    el.innerHTML = '<div class="mineradio-update-title">检查失败</div><div class="mineradio-update-body">网络异常，稍后重试。</div>';
    setTimeout(function () { el.classList.remove('show'); }, 5000);
  }
}
