var podcastListEl = document.getElementById('podcast-list');
if (podcastListEl) {
  podcastListEl.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('[data-podcast-back]')) {
      renderMyPodcastCollections({ animate: true });
      return;
    }
    var radioCard = e.target && e.target.closest ? e.target.closest('[data-podcast-radio-id]') : null;
    if (radioCard) {
      loadPodcastRadioIntoQueue(radioCard.getAttribute('data-podcast-radio-id'), true, radioCard.getAttribute('data-podcast-title') || '');
      return;
    }
    var card = e.target && e.target.closest ? e.target.closest('[data-podcast-key]') : null;
    if (!card) return;
    openMyPodcastCollection(card.getAttribute('data-podcast-key'), card.getAttribute('data-podcast-title') || '');
  });
}
function renderMyPodcastRadioItems(key, title, items) {
  var $pod = document.getElementById('podcast-list');
  if (!$pod) return;
  if (!items.length) {
    $pod.innerHTML = '<div class="podcast-inline-head"><div class="pl-section-label">' + escHtml(title || '我的播客') + '</div><button class="fx-mini-btn ghost" data-podcast-back="1" style="height:24px;padding:0 9px;font-size:10.5px">返回</button></div>' +
      '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">暂无内容</div>';
    return;
  }
  $pod.innerHTML = '<div class="podcast-inline-head"><div class="pl-section-label">' + escHtml(title || '我的播客') + '</div><button class="fx-mini-btn ghost" data-podcast-back="1" style="height:24px;padding:0 9px;font-size:10.5px">返回</button></div>' +
    items.map(function (r) {
      var thumb = r.cover ? coverUrlWithSize(r.cover, 88) : '';
      var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(0,245,212,.07);flex-shrink:0"></div>';
      return '<div class="pl-card podcast-card podcast-child" data-podcast-radio-id="' + escHtml(String(r.id || r.radioId || '')) + '" data-podcast-title="' + escHtml(r.name || '') + '">' +
        imgTag +
        '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(r.name || '') + '</div><div class="pl-sub">' + escHtml((r.djName || r.artist || 'Podcast') + (r.programCount ? (' · ' + r.programCount + ' 集') : '')) + '</div></div>' +
        '</div>';
    }).join('');
  animateVisiblePanelList($pod, '.pl-card', document.getElementById('playlist-panel'));
}
async function openMyPodcastCollection(key, title) {
  if (!key) return;
  showLoading();
  try {
    var r = await apiJson('/api/podcast/my/items?key=' + encodeURIComponent(key) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE);
    if (r && r.loggedIn === false) { showLoginModal(); return; }
    var items = r.items || [];
    myPodcastItems[key] = items;
    if (!items.length) {
      showToast('暂无内容: ' + (title || key));
      renderMyPodcastRadioItems(key, title, []);
      return;
    }
    if (r.itemType === 'voice' || (items[0] && items[0].type === 'podcast')) {
      playQueue = items.map(cloneSong);
      currentIdx = 0;
      safeRenderQueuePanel('podcast-collection-voice');
      safeSwitchPlaylistTab('queue', 'podcast-collection-voice');
      safeShelfRebuild('podcast-collection-voice', true);
      forcePlaybackControlsInteractive();
      await playQueueAt(0);
      showToast('载入: ' + (title || '喜欢的声音'));
      return;
    }
    renderMyPodcastRadioItems(key, title, items);
  } catch (e) {
    console.warn(e);
    showToast('播客加载失败');
  } finally {
    hideLoading();
  }
}
async function loadPodcastRadioIntoQueue(id, autoplay, title) {
  if (!id) return;
  showLoading();
  try {
    var r = await apiJson('/api/podcast/programs?id=' + encodeURIComponent(id) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE);
    if (r.error) { showToast('播客加载失败: ' + r.error); return; }
    if (!r.programs || !r.programs.length) { showToast('播客暂无可播放节目'); return; }
    playQueue = r.programs.map(cloneSong);
    currentIdx = 0;
    safeRenderQueuePanel('podcast-radio');
    safeSwitchPlaylistTab('queue', 'podcast-radio');
    safeShelfRebuild('podcast-radio', true);
    forcePlaybackControlsInteractive();
    if (autoplay) await playQueueAt(0);
    showToast('载入: ' + (title || '播客'));
  } catch (e) {
    console.warn(e);
    showToast('播客加载失败');
  } finally {
    hideLoading();
  }
}
async function loadPlaylistIntoQueueById(id, autoplay, title) {
  if (!id) return;
  homeForcedOpen = false;
  homeSuppressed = false;
  updateEmptyHomeVisibility();
  showLoading();
  var qqPlaylistId = String(id || '').indexOf('qq:') === 0 ? String(id).slice(3) : '';
  var kugouPlaylistId = String(id || '').indexOf('kugou:') === 0 ? String(id).slice(6) : '';
  var qishuiPlaylistId = String(id || '').indexOf('qishui:') === 0 ? String(id).slice(7) : '';
  var spotifyPlaylistId = String(id || '').indexOf('spotify:') === 0 ? String(id).slice(8) : '';
  var r = null;
  try {
    r = qqPlaylistId
      ? await apiJson('/api/qq/playlist/tracks?id=' + encodeURIComponent(qqPlaylistId))
      : (kugouPlaylistId
        ? await apiJson('/api/kugou/playlist/tracks?id=' + encodeURIComponent(kugouPlaylistId))
        : (qishuiPlaylistId
          ? await apiJson('/api/qishui/playlist/tracks?id=' + encodeURIComponent(qishuiPlaylistId))
          : (spotifyPlaylistId
            ? await apiJson('/api/spotify/playlist/tracks?id=' + encodeURIComponent(spotifyPlaylistId))
            : await apiJson('/api/playlist/tracks?id=' + encodeURIComponent(id)))));
  } catch (e) {
    console.warn('[PlaylistLoadApi]', id, e);
    showToast('歌单加载失败');
    hideLoading();
    return;
  }
  try {
    if (r.error) { showToast(r.message || ('歌单加载失败: ' + r.error)); return; }
    if (!r.tracks || !r.tracks.length) { showToast(r.message || '歌单为空'); return; }
    playQueue = r.tracks.map(cloneSong);
    if (!qqPlaylistId && !kugouPlaylistId && !qishuiPlaylistId && !spotifyPlaylistId && isLikedPlaylistContext(id, title, r.playlist)) markSongsLiked(playQueue, true);
    if (!qqPlaylistId && !kugouPlaylistId && !qishuiPlaylistId && !spotifyPlaylistId) syncLikeStatusForSongs(playQueue);
    currentIdx = 0;
    safeRenderQueuePanel('playlist-load');
    safeSwitchPlaylistTab('queue', 'playlist-load');
    safeShelfRebuild('playlist-load', true);
    forcePlaybackControlsInteractive();
    if (autoplay) {
      try {
        await playQueueAt(0);
      } catch (playErr) {
        console.warn('[PlaylistAutoplay]', id, playErr);
        showToast('歌单已载入，播放启动失败');
      }
    }
    forcePlaybackControlsInteractive();
    showToast('载入: ' + (title || ('歌单 ' + id)));
  } catch (e) {
    console.warn('[PlaylistLoadState]', id, e);
    forcePlaybackControlsInteractive();
    showToast('歌单已载入，界面刷新失败');
  } finally {
    hideLoading();
  }
}

// 进度条
