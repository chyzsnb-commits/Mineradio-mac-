'use strict';

// Windows v2.1.0 对齐（缓存设置 · Mac 只读版）
// 只读歌词磁盘缓存占用 + 手动清理；不迁移 Chromium 缓存目录搬迁
// （macOS 上动 sessionData 会破坏登录态/会话，见 AGENTS.md 硬约束）。

function mineradioCacheStorageNode(id) {
  return document.getElementById(id);
}

function formatMineradioCacheBytes(value) {
  var bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return bytes + ' B';
  var units = ['KB', 'MB', 'GB', 'TB'];
  var index = -1;
  do {
    bytes /= 1024;
    index += 1;
  } while (bytes >= 1024 && index < units.length - 1);
  return (bytes >= 100 || index === 0 ? bytes.toFixed(0) : bytes.toFixed(1)) + ' ' + units[index];
}

function setMineradioCacheStorageText(id, value) {
  var node = mineradioCacheStorageNode(id);
  if (node) node.textContent = value == null || value === '' ? '—' : String(value);
}

function applyMineradioCacheSettings(snapshot) {
  if (!snapshot || !snapshot.ok) {
    setMineradioCacheStorageText('cache-storage-total', '读取失败');
    setMineradioCacheStorageText('cache-storage-note', snapshot && snapshot.error ? ('缓存设置不可用：' + snapshot.error) : '缓存设置不可用');
    return;
  }
  setMineradioCacheStorageText('cache-storage-root', snapshot.lyricsPath || snapshot.rootPath || '—');
  var safeBytes = (Number(snapshot.lyricsBytes) || 0) + (Number(snapshot.chromiumBytes) || 0) + (Number(snapshot.beatmapsBytes) || 0) + (Number(snapshot.aiStemsBytes) || 0);
  var safeCount = (Number(snapshot.lyricsCount) || 0) + (Number(snapshot.beatmapsCount) || 0) + (Number(snapshot.aiStemsCount) || 0);
  setMineradioCacheStorageText('cache-storage-total', '安全缓存 ' + formatMineradioCacheBytes(safeBytes) + (safeCount ? ' · ' + safeCount + ' 个文件' : ''));
  setMineradioCacheStorageText('cache-storage-lyrics-path', snapshot.lyricsPath || '—');
  setMineradioCacheStorageText('cache-storage-lyrics-size', formatMineradioCacheBytes(snapshot.lyricsBytes));
  setMineradioCacheStorageText('cache-storage-chromium-path', 'Chromium HTTP Cache（不清 Cookie / 登录态）');
  setMineradioCacheStorageText('cache-storage-chromium-size', formatMineradioCacheBytes(snapshot.chromiumBytes));
  setMineradioCacheStorageText('cache-storage-beatmaps-path', snapshot.beatmapsPath || '—');
  setMineradioCacheStorageText('cache-storage-beatmaps-size', formatMineradioCacheBytes(snapshot.beatmapsBytes));
  setMineradioCacheStorageText('cache-storage-stems-path', snapshot.aiStemsPath || '—');
  setMineradioCacheStorageText('cache-storage-stems-size', formatMineradioCacheBytes(snapshot.aiStemsBytes));
  setMineradioCacheStorageText('cache-storage-wallpaper-path', snapshot.wallpapersPath || '—');
  setMineradioCacheStorageText('cache-storage-wallpaper-size', formatMineradioCacheBytes(snapshot.wallpapersBytes));
  setMineradioCacheStorageText('cache-storage-userdata-path', snapshot.userDataPath || '系统安全数据目录');
  setMineradioCacheStorageText('cache-storage-userdata-size', '—');
  var clearBtn = mineradioCacheStorageNode('cache-storage-clear');
  if (clearBtn) clearBtn.disabled = safeBytes <= 0;
  setMineradioCacheStorageText('cache-storage-note', '安全清理不会移除登录、设置或本地壁纸资料；壁纸仅在自定义清理明确勾选后删除。');
}

function refreshMineradioCacheSettings() {
  if (!window.desktopWindow || typeof window.desktopWindow.getCacheUsage !== 'function') {
    applyMineradioCacheSettings({ ok: false, error: '仅桌面版支持缓存占用查看' });
    return Promise.resolve();
  }
  setMineradioCacheStorageText('cache-storage-total', '正在统计...');
  return window.desktopWindow.getCacheUsage().then(applyMineradioCacheSettings).catch(function (error) {
    applyMineradioCacheSettings({ ok: false, error: error && error.message || '读取失败' });
  });
}

function clearMineradioLyricCache() {
  if (!window.desktopWindow || typeof window.desktopWindow.clearLyricCache !== 'function') return;
  var btn = mineradioCacheStorageNode('cache-storage-clear');
  if (btn) btn.disabled = true;
  setMineradioCacheStorageText('cache-storage-total', '清理中...');
  window.desktopWindow.clearLyricCache().then(function (snapshot) {
    applyMineradioCacheSettings(snapshot);
    if (typeof showToast === 'function') showToast('歌词缓存已清理');
  }).catch(function (error) {
    applyMineradioCacheSettings({ ok: false, error: error && error.message || '清理失败' });
  });
}

function openMineradioWallpaperFolder() {
  if (!window.desktopWindow || typeof window.desktopWindow.openLocalWallpaperFolder !== 'function') {
    if (typeof showToast === 'function') showToast('仅桌面版支持打开壁纸文件夹');
    return Promise.resolve();
  }
  var sync = typeof syncCustomBackgroundLibraryToFolder === 'function'
    ? syncCustomBackgroundLibraryToFolder()
    : Promise.resolve();
  return sync.then(function () {
    return window.desktopWindow.openLocalWallpaperFolder();
  }).then(function (result) {
    if (!result || !result.ok) throw new Error(result && result.error || '打开失败');
    if (typeof showToast === 'function') showToast('已打开 Mineradio 壁纸文件夹');
  }).catch(function (error) {
    if (typeof showToast === 'function') showToast('壁纸文件夹打开失败：' + (error && error.message || '未知错误'));
  });
}

function clearMineradioSafeCaches() {
  return clearMineradioCacheCategories(['lyrics', 'network', 'beatmaps', 'aiStems'], false);
}

function openMineradioCacheCleanupDialog() {
  var panel = mineradioCacheStorageNode('cache-storage-custom');
  if (!panel) return;
  panel.hidden = !panel.hidden;
}

function selectedMineradioCacheCategories() {
  var panel = mineradioCacheStorageNode('cache-storage-custom');
  if (!panel) return [];
  return Array.prototype.map.call(panel.querySelectorAll('input[type="checkbox"]:checked'), function (input) { return input.value; });
}

function confirmMineradioCustomCacheCleanup() {
  var categories = selectedMineradioCacheCategories();
  if (!categories.length) {
    if (typeof showToast === 'function') showToast('请至少选择一类缓存');
    return;
  }
  if (categories.indexOf('wallpapers') >= 0 && !window.confirm('将删除 Mineradio 本地壁纸资料，且无法恢复。确定继续吗？')) return;
  clearMineradioCacheCategories(categories, categories.indexOf('wallpapers') >= 0);
}

function clearMineradioCacheCategories(categories, includesWallpapers) {
  if (!window.desktopWindow || typeof window.desktopWindow.clearCacheCategories !== 'function') return Promise.resolve();
  var button = mineradioCacheStorageNode('cache-storage-clear');
  if (button) button.disabled = true;
  setMineradioCacheStorageText('cache-storage-total', '清理中...');
  return window.desktopWindow.clearCacheCategories(categories).then(function (snapshot) {
    if (!snapshot || !snapshot.ok) throw new Error(snapshot && snapshot.error || '清理失败');
    if (includesWallpapers && typeof clearCustomBackgroundMediaLibrary === 'function') {
      return clearCustomBackgroundMediaLibrary().then(function () {
        if (typeof setCustomBackgroundMedia === 'function') setCustomBackgroundMedia(null, true);
        if (typeof renderVideoBgGrid === 'function') renderVideoBgGrid();
        return snapshot;
      });
    }
    return snapshot;
  }).then(function (snapshot) {
    applyMineradioCacheSettings(snapshot);
    if (typeof showToast === 'function') showToast('已清理所选缓存');
  }).catch(function (error) {
    applyMineradioCacheSettings({ ok: false, error: error && error.message || '清理失败' });
  });
}

setTimeout(refreshMineradioCacheSettings, 450);
