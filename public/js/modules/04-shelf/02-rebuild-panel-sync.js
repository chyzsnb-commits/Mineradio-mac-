function safeShelfRebuild(reason, asyncCards) {
  if (!shelfManager || typeof shelfManager.rebuild !== 'function') return false;
  try {
    shelfManager.rebuild(asyncCards);
    return true;
  } catch (e) {
    console.warn('[ShelfRebuild]', reason || 'unknown', e);
    return false;
  }
}
function isShelfQueueCurrentSyncReason(reason) {
  return reason === 'play-queue-at' || reason === 'play-local-queue';
}
function safeSyncShelfQueueCurrent(reason, asyncCards) {
  if (!shelfManager || typeof shelfManager.syncQueueCurrent !== 'function') return false;
  try {
    return shelfManager.syncQueueCurrent(currentIdx, asyncCards) !== false;
  } catch (e) {
    console.warn('[ShelfQueueCurrentSync]', reason || 'unknown', e);
    return false;
  }
}
var deferredShelfRebuild = { raf: 0, reason: '', asyncCards: true, token: 0 };
function scheduleShelfRebuild(reason, asyncCards) {
  if (isShelfQueueCurrentSyncReason(reason) && safeSyncShelfQueueCurrent(reason, asyncCards)) {
    if (isShelfQueueCurrentSyncReason(deferredShelfRebuild.reason)) {
      deferredShelfRebuild.token += 1;
      if (deferredShelfRebuild.raf) cancelAnimationFrame(deferredShelfRebuild.raf);
      deferredShelfRebuild.raf = 0;
      deferredShelfRebuild.reason = '';
    }
    return true;
  }
  deferredShelfRebuild.reason = reason || deferredShelfRebuild.reason || 'deferred';
  deferredShelfRebuild.asyncCards = asyncCards !== false;
  deferredShelfRebuild.token += 1;
  var token = deferredShelfRebuild.token;
  if (deferredShelfRebuild.raf) cancelAnimationFrame(deferredShelfRebuild.raf);
  deferredShelfRebuild.raf = requestAnimationFrame(function () {
    deferredShelfRebuild.raf = 0;
    scheduleUiWarmTask(function () {
      if (token !== deferredShelfRebuild.token) return;
      safeShelfRebuild(deferredShelfRebuild.reason, deferredShelfRebuild.asyncCards);
    }, 260);
  });
}
function safeShelfCloseContent(reason) {
  if (!shelfManager || typeof shelfManager.closeContent !== 'function') return false;
  try {
    shelfManager.closeContent();
    if (!shelfPinnedOpen && typeof restoreBottomControlsAfterShelfExit === 'function') {
      requestAnimationFrame(function () { restoreBottomControlsAfterShelfExit(reason || 'shelf-content-close'); });
    }
    return true;
  } catch (e) {
    console.warn('[ShelfCloseContent]', reason || 'unknown', e);
    return false;
  }
}
function isPlaylistPanelVisibleForRender() {
  var panel = document.getElementById('playlist-panel');
  var panelOpen = panel && (panel.classList.contains('show') || panel.classList.contains('peek') || panel.classList.contains('pinned'));
  return !!(panelOpen || miniQueueOpen);
}
function patchRenderedQueueCurrentMarker(list, selector, index) {
  if (!list) return false;
  var previous = list.querySelector(selector + '.now');
  var current = list.querySelector(selector + '[data-queue-index="' + index + '"]');
  if (!current) return false;
  if (previous && previous !== current) previous.classList.remove('now');
  current.classList.add('now');
  return true;
}
function patchRenderedQueueCurrentIndex(opts) {
  opts = opts || {};
  var panel = document.getElementById('playlist-panel');
  var panelOpen = panel && (panel.classList.contains('show') || panel.classList.contains('peek') || panel.classList.contains('pinned'));
  var queuePanelActive = !!(panelOpen && queueViewTab === 'queue');
  var miniActive = !!miniQueueOpen;
  if (!queuePanelActive && !miniActive) return false;
  if (queuePanelDirty) return false;
  if (typeof queuePanelListKey === 'function' && typeof queuePanelRenderKey !== 'undefined') {
    if (queuePanelRenderKey !== queuePanelListKey()) return false;
  }
  var currentRow = null;
  var queueList = document.getElementById('queue-list');
  var queueListRendered = !!(queueList && queueList.querySelector('.queue-item'));
  if (queuePanelActive || queueListRendered) {
    if (!patchRenderedQueueCurrentMarker(queueList, '.queue-item', currentIdx)) {
      if (queuePanelActive) return false;
      if (queueList && queueList.dataset) queueList.dataset.currentMarkerDirty = '1';
    } else if (queueList && queueList.dataset) {
      delete queueList.dataset.currentMarkerDirty;
    }
  }
  if (miniActive) {
    var miniList = document.getElementById('mini-queue-list');
    if (!patchRenderedQueueCurrentMarker(miniList, '.mini-queue-item', currentIdx)) return false;
    var count = document.getElementById('mini-queue-count');
    if (count) count.textContent = playQueue.length ? (playQueue.length + ' 首 · 正在播放 ' + (currentIdx + 1)) : '0 首';
    currentRow = miniList.querySelector('.mini-queue-item.now');
    if (opts.scrollCurrent !== false && currentRow) {
      requestAnimationFrame(function () {
        if (miniQueueOpen && currentRow.isConnected) smoothScrollToItem(miniList, currentRow, { duration: 0.22, align: 0.42 });
      });
    }
  }
  return true;
}
function safeSyncQueuePanelCurrent(reason, opts) {
  if (!isPlaylistPanelVisibleForRender()) {
    queuePanelDirty = true;
    return true;
  }
  try {
    if (patchRenderedQueueCurrentIndex(opts)) return true;
  } catch (e) {
    console.warn('[QueuePanelCurrentPatch]', reason || 'unknown', e);
  }
  return safeRenderQueuePanel(reason || 'queue-current-fallback', Object.assign({ animate: false }, opts || {}));
}
function safeRenderQueuePanel(reason, opts) {
  opts = opts || {};
  if (!isPlaylistPanelVisibleForRender() && opts.deferWhenHidden !== false) {
    queuePanelDirty = true;
    return true;
  }
  try {
    renderQueuePanel(opts);
    queuePanelDirty = false;
    return true;
  } catch (e) {
    console.warn('[QueuePanelRender]', reason || 'unknown', e);
    return false;
  }
}
function flushDeferredQueuePanel(reason) {
  if (!queuePanelDirty) return;
  safeRenderQueuePanel(reason || 'flush-deferred-queue', { animate: false, scrollCurrent: miniQueueOpen, deferWhenHidden: false });
}
function safeSwitchPlaylistTab(tab, reason) {
  try {
    switchPlaylistTab(tab);
    return true;
  } catch (e) {
    console.warn('[PlaylistTabSwitch]', reason || tab || 'unknown', e);
    return false;
  }
}
window.addEventListener('blur', clearShelfPreviewOnPointerExit);
document.addEventListener('mouseleave', clearShelfPreviewOnPointerExit);
document.addEventListener('mouseout', function (e) {
  if (!e.relatedTarget && !e.toElement) clearShelfPreviewOnPointerExit();
});

// ============================================================
//  二级内容框 (歌单内的歌曲列表) — 同样 PSP 风格滚动
