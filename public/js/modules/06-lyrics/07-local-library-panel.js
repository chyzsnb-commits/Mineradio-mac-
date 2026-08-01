// ============================================================
//  本地曲库面板 (Windows v2.1.0 对齐): 浏览 / 搜索 / 播放 / 移除
//  依赖 05-upload-dragdrop.js 的持久化曲库接线与状态。
// ============================================================
var localLibraryPanelState = { open: false, loading: false, promise: null };

function localLibrarySearchQuery() {
  var el = document.getElementById('local-library-search');
  return el ? String(el.value || '').trim().toLowerCase() : '';
}
function localLibraryTrackMatches(track, query) {
  if (!query) return true;
  var haystack = String([track && track.name, track && track.title, track && track.artist, track && track.album, track && track.localPath].join(' | ')).toLowerCase();
  return haystack.indexOf(query) >= 0;
}
function localLibraryFormatDuration(sec) {
  sec = Math.max(0, Number(sec) || 0);
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
function localLibraryCoverSrc(track) {
  return track && track.cover || '';
}
function renderLocalLibraryRows() {
  var list = document.getElementById('local-library-list');
  var empty = document.getElementById('local-library-empty');
  var countEl = document.getElementById('local-library-count');
  if (!list) return;
  var query = localLibrarySearchQuery();
  var tracks = (Array.isArray(persistentLocalLibraryTracks) ? persistentLocalLibraryTracks : [])
    .filter(function (t) { return localLibraryTrackMatches(t, query); });
  if (countEl) countEl.textContent = (persistentLocalLibraryTracks.length || 0) + ' 首';
  if (empty) empty.hidden = (persistentLocalLibraryTracks.length || 0) > 0;
  if (!tracks.length) {
    list.innerHTML = '<div class="local-library-row-note">' + escHtml(query ? '没有匹配的本地歌曲' : '还没有导入本地歌曲') + '</div>';
    list._localLibraryFilteredTracks = [];
    return;
  }
  list.innerHTML = tracks.map(function (track, index) {
    var cover = localLibraryCoverSrc(track);
    var duration = localLibraryFormatDuration(track.duration);
    var badge = track.hasLyric ? '<span class="local-library-lyric-badge" title="含内嵌/侧车歌词">词</span>' : '';
    return '<div class="local-library-row">' +
      '<div class="local-library-thumb" style="' + (cover ? 'background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)' : '') + '"></div>' +
      '<div class="local-library-meta">' +
        '<div class="local-library-name">' + escHtml(track.name || track.title || '未知歌曲') + '</div>' +
        '<div class="local-library-sub">' + escHtml((track.artist || '本地文件') + (track.album ? ' · ' + track.album : '')) + '</div>' +
      '</div>' +
      '<div class="local-library-duration">' + escHtml(duration) + badge + '</div>' +
      '<div class="local-library-row-actions">' +
        '<button class="local-library-play" type="button" onclick="playLocalLibraryTrack(' + index + ')" title="播放">▶</button>' +
        '<button class="local-library-remove" type="button" onclick="removeLocalLibraryTrack(' + index + ')" title="从曲库移除">×</button>' +
      '</div>' +
    '</div>';
  }).join('');
  list._localLibraryFilteredTracks = tracks;
}
function refreshLocalLibraryPanel(force) {
  if (localLibraryPanelState.loading && !force) return localLibraryPanelState.promise;
  localLibraryPanelState.loading = true;
  localLibraryPanelState.promise = (async function () {
    try {
      if (!canUsePersistentLocalMusicLibrary()) {
        renderLocalLibraryRows();
        return { ok: false, count: 0, tracks: [], error: 'LOCAL_LIBRARY_UNAVAILABLE' };
      }
      var result = await window.desktopWindow.listLocalMusicLibrary();
      if (result && result.ok === true && Array.isArray(result.tracks)) {
        persistentLocalLibraryTracks = result.tracks.map(function (song) { return hydrateCustomCover(cloneSong(song)); });
      }
      renderLocalLibraryRows();
      return result;
    } catch (e) {
      console.warn('[LocalLibraryPanel] 刷新失败', e);
      return { ok: false, count: 0, tracks: [], error: 'LOCAL_LIBRARY_REFRESH_FAILED' };
    } finally {
      localLibraryPanelState.loading = false;
    }
  })();
  return localLibraryPanelState.promise;
}
function openLocalLibraryPanel() {
  var mask = document.getElementById('local-library-modal');
  if (!mask) return;
  openGsapModal(mask);
  localLibraryPanelState.open = true;
  var search = document.getElementById('local-library-search');
  if (search) search.value = '';
  refreshLocalLibraryPanel(true);
  setTimeout(function () { if (search) search.focus(); }, 340);
}
function closeLocalLibraryPanel() {
  localLibraryPanelState.open = false;
  closeGsapModal(document.getElementById('local-library-modal'));
}
function refreshLocalLibraryPanelIfOpen() {
  if (!localLibraryPanelState.open) return false;
  refreshLocalLibraryPanel(true);
  return true;
}
function localLibraryQueueTracks() {
  return (Array.isArray(persistentLocalLibraryTracks) ? persistentLocalLibraryTracks : []).map(cloneSong);
}
function playLocalLibraryTrack(index) {
  var tracks = localLibraryQueueTracks();
  if (!tracks.length) {
    showToast('本地曲库是空的');
    return;
  }
  var idx = Math.max(0, Math.min(tracks.length - 1, Number(index) || 0));
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  playQueue = tracks;
  currentIdx = idx;
  currentLocalSong = null;
  activeRadioContext = null;
  safeRenderQueuePanel('local-library-play', { scrollCurrent: miniQueueOpen });
  safeShelfRebuild('local-library-play', true);
  forcePlaybackControlsInteractive();
  updateEmptyHomeVisibility({ forceLoad: false });
  Promise.resolve(playQueueAt(idx, { manual: true })).catch(function (e) { console.warn('[LocalLibraryPanel]', e); });
}
function playAllLocalLibraryTracks() {
  playLocalLibraryTrack(0);
}
function removeLocalLibraryTrackFromQueue(localFileId) {
  if (!Array.isArray(playQueue) || !playQueue.length) return;
  var targetId = normalizedLocalLibraryFileId(localFileId);
  var qIdx = -1;
  for (var i = 0; i < playQueue.length; i++) {
    if (playQueue[i] && normalizedLocalLibraryFileId(playQueue[i].localFileId) === targetId) { qIdx = i; break; }
  }
  if (qIdx < 0) return;
  var wasCurrent = qIdx === currentIdx;
  playQueue.splice(qIdx, 1);
  if (currentIdx >= playQueue.length) currentIdx = playQueue.length - 1;
  else if (qIdx < currentIdx) currentIdx -= 1;
  safeRenderQueuePanel('local-library-remove', { scrollCurrent: miniQueueOpen });
  safeShelfRebuild('local-library-remove', true);
  if (wasCurrent && playQueue.length) {
    var nextIdx = Math.max(0, Math.min(qIdx, playQueue.length - 1));
    currentIdx = nextIdx;
    Promise.resolve(playQueueAt(nextIdx, { manual: true })).catch(function (e) { console.warn('[LocalLibraryPanel] 切歌失败', e); });
  }
}
async function removeLocalLibraryTrack(index) {
  var listEl = document.getElementById('local-library-list');
  var filtered = listEl && listEl._localLibraryFilteredTracks;
  var track = Array.isArray(filtered) ? filtered[Number(index) || 0] : null;
  if (!track || !track.localFileId) return;
  if (!(window.desktopWindow && typeof window.desktopWindow.removeLocalMusicLibraryTracks === 'function')) {
    showToast('当前环境不支持移除曲库条目');
    return;
  }
  var name = track.name || track.title || '本地歌曲';
  if (!window.confirm('从本地曲库移除《' + name + '》？\n只会删除曲库索引，不会删除源文件。')) return;
  try {
    var result = await window.desktopWindow.removeLocalMusicLibraryTracks([track.localFileId]);
    if (!result || result.ok !== true) {
      showToast((result && result.error) || '移除失败');
      return;
    }
    removeLocalLibraryTrackFromQueue(track.localFileId);
    refreshLocalLibraryPanel(true);
    showToast('已从曲库移除 ' + (Number(result.removed) || 1) + ' 首');
  } catch (e) {
    console.warn('[LocalLibraryPanel] 移除失败', e);
    showToast('移除失败');
  }
}
var localLibrarySearchInput = document.getElementById('local-library-search');
if (localLibrarySearchInput) {
  localLibrarySearchInput.addEventListener('input', function () { renderLocalLibraryRows(); });
  localLibrarySearchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); renderLocalLibraryRows(); }
  });
}
var localLibraryMask = document.getElementById('local-library-modal');
if (localLibraryMask && !localLibraryMask.__localLibraryBackdropBound) {
  localLibraryMask.__localLibraryBackdropBound = true;
  localLibraryMask.addEventListener('click', function (e) {
    if (e.target === localLibraryMask) closeLocalLibraryPanel();
  });
}
