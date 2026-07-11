var playlistPanelDetailState = { key: '', loading: false, playlist: null, tracks: [], token: 0, renderLimit: PLAYLIST_DETAIL_INITIAL_RENDER };
function queuePanelItemKey(song, fallback) {
  try {
    if (typeof queueItemKey === 'function') return queueItemKey(song) || fallback;
  } catch (e) { }
  return song && (song.id || song.mid || song.localKey || song.name) || fallback;
}
function queuePanelListKey() {
  var total = playQueue && playQueue.length || 0;
  if (!total) return '0';
  return [
    total,
    queuePanelItemKey(playQueue[0], 'first'),
    queuePanelItemKey(playQueue[Math.max(0, total - 1)], 'last')
  ].join('|');
}
function resetQueuePanelRenderLimit() {
  queuePanelRenderLimit = QUEUE_PANEL_BATCH_SIZE;
  queuePanelRenderKey = queuePanelListKey();
}
function queuePanelVisibleLimit(total) {
  total = Math.max(0, Number(total) || 0);
  if (!total) {
    queuePanelRenderLimit = QUEUE_PANEL_BATCH_SIZE;
    queuePanelRenderKey = '0';
    return 0;
  }
  var key = queuePanelListKey();
  if (key !== queuePanelRenderKey) {
    queuePanelRenderKey = key;
    queuePanelRenderLimit = QUEUE_PANEL_BATCH_SIZE;
  }
  var base = Math.max(QUEUE_PANEL_BATCH_SIZE, queuePanelRenderLimit || QUEUE_PANEL_BATCH_SIZE);
  if (currentIdx >= 0 && currentIdx < total) {
    base = Math.max(base, Math.ceil((currentIdx + 1) / QUEUE_PANEL_BATCH_SIZE) * QUEUE_PANEL_BATCH_SIZE);
  }
  queuePanelRenderLimit = Math.min(total, base);
  return queuePanelRenderLimit;
}
function growQueuePanelRenderLimit(amount) {
  if (!playQueue.length) return false;
  var total = playQueue.length;
  var current = queuePanelVisibleLimit(total);
  var next = Math.min(total, current + (amount || QUEUE_PANEL_BATCH_SIZE));
  if (next <= current) return false;
  var panel = document.getElementById('playlist-panel');
  var keepTop = panel ? panel.scrollTop : 0;
  var miniList = document.getElementById('mini-queue-list');
  var keepMiniTop = miniList ? miniList.scrollTop : 0;
  queuePanelRenderLimit = next;
  renderQueuePanel({ animate: true, scrollCurrent: false });
  if (panel) panel.scrollTop = keepTop;
  if (miniList) {
    miniList = document.getElementById('mini-queue-list');
    if (miniList) miniList.scrollTop = keepMiniTop;
  }
  return true;
}
function maybeGrowQueuePanelRenderLimit() {
  var panel = document.getElementById('playlist-panel');
  if (!panel || queueViewTab !== 'queue' || !playQueue.length) return;
  if (queuePanelVisibleLimit(playQueue.length) >= playQueue.length) return;
  if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 220) growQueuePanelRenderLimit();
}
function bindMiniQueueLazyRender() {
  var list = document.getElementById('mini-queue-list');
  if (!list || miniQueueLazyBound) return;
  miniQueueLazyBound = true;
  list.addEventListener('scroll', function () {
    if (!miniQueueOpen || queuePanelVisibleLimit(playQueue.length) >= playQueue.length) return;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 180) growQueuePanelRenderLimit();
  }, { passive: true });
}
function playlistProviderNorm(provider) {
  return provider === 'qq' ? 'qq' : (provider === 'kugou' ? 'kugou' : (provider === 'qishui' ? 'qishui' : (provider === 'spotify' ? 'spotify' : 'netease')));
}
function playlistPanelCover(provider, cover, param) {
  if (!cover) return '';
  return provider === 'netease' ? (cover + '?param=' + param) : cover;   // 只有网易云封面吃 ?param 尺寸;qishui/spotify/qq/kugou 原样
}
function playlistPanelKey(provider, id) {
  return playlistProviderNorm(provider) + ':' + String(id || '');
}
function playlistPanelProviderId(provider, id) {
  if (provider === 'qq') return 'qq:' + id;
  if (provider === 'kugou') return 'kugou:' + id;
  if (provider === 'qishui') return 'qishui:' + id;     // loadPlaylistIntoQueueById 靠前缀路由到 /api/qishui/playlist/tracks
  if (provider === 'spotify') return 'spotify:' + id;
  return id;
}
function playlistPanelDetailHtml(pl, provider) {
  var key = playlistPanelKey(provider, pl && pl.id);
  if (playlistPanelDetailState.key !== key) return '';
  var tracks = playlistPanelDetailState.tracks || [];
  var loading = playlistPanelDetailState.loading;
  var cover = playlistPanelCover(provider, pl && pl.cover, '96y96');
  var img = cover ? '<img class="pl-detail-cover" src="' + escHtml(cover) + '" alt="" decoding="async" onerror="this.style.opacity=0.2">' : '<div class="pl-detail-cover"></div>';
  var renderLimit = loading ? 0 : Math.max(PLAYLIST_DETAIL_INITIAL_RENDER, playlistPanelDetailState.renderLimit || PLAYLIST_DETAIL_INITIAL_RENDER);
  renderLimit = Math.min(tracks.length, renderLimit);
  var visibleTracks = loading ? [] : tracks.slice(0, renderLimit);
  var rows = loading
    ? '<div class="pl-detail-row"><div style="width:34px;height:34px;border-radius:7px;background:rgba(255,255,255,.06)"></div><div style="flex:1;min-width:0"><div class="pl-detail-row-title">正在载入歌单</div><div class="pl-detail-row-artist">请稍候</div></div></div>'
    : visibleTracks.map(function (song, i) {
      var thumb = songCoverSrc(song, 60);
      var imgTag = thumb ? '<img src="' + escHtml(thumb) + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:34px;height:34px;border-radius:7px;background:rgba(255,255,255,.06);flex:0 0 auto"></div>';
      return '<div class="pl-detail-row" data-pl-detail-row="' + i + '">' +
        imgTag +
        '<div style="flex:1;min-width:0"><div class="pl-detail-row-title">' + escHtml(song.name || '') + '</div>' +
        '<button type="button" class="pl-detail-row-artist" data-pl-detail-artist="' + i + '">' + escHtml(song.artist || '未知歌手') + '</button></div>' +
        '</div>';
    }).join('');
  if (!loading && !rows) rows = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.30);font-size:11.5px">歌单暂无可播放歌曲</div>';
  if (!loading && tracks.length > renderLimit) {
    rows += '<button type="button" class="fx-mini-btn ghost pl-detail-load-more" data-pl-detail-load-more="1">加载更多 ' + renderLimit + '/' + tracks.length + '</button>';
  } else if (!loading && tracks.length > PLAYLIST_DETAIL_INITIAL_RENDER) {
    rows += '<div class="pl-detail-progress">已显示全部 ' + tracks.length + ' 首</div>';
  }
  return '<div class="pl-inline-detail" data-pl-detail="' + escHtml(key) + '">' +
    '<div class="pl-detail-sticky">' +
    '<div class="pl-detail-head">' + img + '<div style="flex:1;min-width:0"><div class="pl-detail-title">' + escHtml(pl.name || '歌单详情') + '</div><div class="pl-detail-sub">' + escHtml((pl.trackCount || tracks.length || 0) + ' 首 · ' + (pl.creator || (provider === 'qq' ? 'QQ 音乐' : (provider === 'kugou' ? '酷狗音乐' : (provider === 'qishui' ? '汽水音乐' : (provider === 'spotify' ? 'Spotify' : '网易云音乐')))))) + '</div></div><div class="pl-detail-count">' + (loading ? '载入中' : (renderLimit + '/' + tracks.length)) + '</div></div>' +
    '<div class="pl-detail-actions"><button class="pl-detail-play" type="button" data-pl-detail-play="' + escHtml(key) + '"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>播放歌单</button><button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-pl-detail-top="1">回到顶部</button></div>' +
    '</div>' +
    '<div class="pl-detail-list">' + rows + '</div>' +
    '</div>';
}
function renderPlaylistPanelDetailState() {
  renderUserPlaylistsList();
}
function scrollPlaylistPanelToTop() {
  var panel = document.getElementById('playlist-panel');
  if (!panel) return;
  try { panel.scrollTo({ top: 0, behavior: 'smooth' }); }
  catch (e) { panel.scrollTop = 0; }
}
function scrollPlaylistPanelDetailIntoView(key) {
  var panel = document.getElementById('playlist-panel');
  if (!panel || !key) return;
  requestAnimationFrame(function () {
    var detail = null;
    Array.prototype.some.call(panel.querySelectorAll('[data-pl-detail]'), function (node) {
      if (node.getAttribute('data-pl-detail') === key) {
        detail = node;
        return true;
      }
      return false;
    });
    if (!detail) return;
    var anchor = detail.previousElementSibling || detail;
    var top = Math.max(0, anchor.offsetTop - 10);
    try { panel.scrollTo({ top: top, behavior: 'smooth' }); }
    catch (e) { panel.scrollTop = top; }
  });
}
async function openPlaylistPanelDetail(provider, pid, title) {
  if (!pid) return;
  provider = playlistProviderNorm(provider);
  var key = playlistPanelKey(provider, pid);
  var pl = userPlaylists.find(function (item) { return playlistPanelKey(playlistProviderNorm(item.provider), item.id) === key; }) || { id: pid, provider: provider, name: title || '歌单详情' };
  if (playlistPanelDetailState.key === key && !playlistPanelDetailState.loading && playlistPanelDetailState.tracks.length) {
    playlistPanelDetailState.key = '';
    playlistPanelDetailState.tracks = [];
    playlistPanelDetailState.playlist = null;
    playlistPanelDetailState.renderLimit = PLAYLIST_DETAIL_INITIAL_RENDER;
    renderPlaylistPanelDetailState();
    return;
  }
  var token = ++playlistPanelDetailState.token;
  playlistPanelDetailState = { key: key, loading: true, playlist: pl, tracks: [], token: token, renderLimit: PLAYLIST_DETAIL_INITIAL_RENDER };
  renderPlaylistPanelDetailState();
  scrollPlaylistPanelDetailIntoView(key);
  try {
    var r = provider === 'qq'
      ? await apiJson('/api/qq/playlist/tracks?id=' + encodeURIComponent(pid))
      : (provider === 'kugou'
        ? await apiJson('/api/kugou/playlist/tracks?id=' + encodeURIComponent(pid))
        : (provider === 'qishui'
          ? await apiJson('/api/qishui/playlist/tracks?id=' + encodeURIComponent(pid))
          : (provider === 'spotify'
            ? await apiJson('/api/spotify/playlist/tracks?id=' + encodeURIComponent(pid))
            : await apiJson('/api/playlist/tracks?id=' + encodeURIComponent(pid)))));
    if (playlistPanelDetailState.token !== token) return;
    playlistPanelDetailState.loading = false;
    playlistPanelDetailState.tracks = (r && r.tracks || []).map(cloneSong);
    playlistPanelDetailState.renderLimit = Math.min(playlistPanelDetailState.tracks.length, PLAYLIST_DETAIL_INITIAL_RENDER);
    renderPlaylistPanelDetailState();
  } catch (e) {
    console.warn('[PlaylistPanelDetail]', pid, e);
    if (playlistPanelDetailState.token !== token) return;
    playlistPanelDetailState.loading = false;
    playlistPanelDetailState.tracks = [];
    playlistPanelDetailState.renderLimit = PLAYLIST_DETAIL_INITIAL_RENDER;
    renderPlaylistPanelDetailState();
    showToast('歌单详情加载失败');
  }
}
function playPlaylistPanelDetail() {
  var st = playlistPanelDetailState;
  if (!st || !st.key) return;
  var parts = st.key.split(':');
  var provider = playlistProviderNorm(parts[0]);
  var pid = parts.slice(1).join(':');
  loadPlaylistIntoQueueById(playlistPanelProviderId(provider, pid), true, st.playlist && st.playlist.name || '');
}
function playPlaylistPanelDetailTrack(index) {
  var tracks = playlistPanelDetailState.tracks || [];
  if (!tracks[index]) return;
  playQueue = tracks.map(cloneSong);
  currentIdx = index;
  safeRenderQueuePanel('playlist-panel-detail');
  safeSwitchPlaylistTab('queue', 'playlist-panel-detail');
  safeShelfRebuild('playlist-panel-detail', true);
  forcePlaybackControlsInteractive();
  playQueueAt(index).catch(function (e) { console.warn('[PlaylistPanelDetailPlay]', e); });
}
function openPlaylistPanelDetailArtist(index) {
  var song = playlistPanelDetailState.tracks && playlistPanelDetailState.tracks[index];
  if (song) openArtistDetailForSong(song);
}
function growPlaylistPanelDetailRenderLimit(amount) {
  var st = playlistPanelDetailState;
  var total = st && st.tracks ? st.tracks.length : 0;
  if (!st || st.loading || !st.key || !total) return false;
  var current = Math.max(PLAYLIST_DETAIL_INITIAL_RENDER, st.renderLimit || PLAYLIST_DETAIL_INITIAL_RENDER);
  var next = Math.min(total, current + (amount || PLAYLIST_DETAIL_BATCH_SIZE));
  if (next <= current) return false;
  var panel = document.getElementById('playlist-panel');
  var keepTop = panel ? panel.scrollTop : 0;
  st.renderLimit = next;
  renderPlaylistPanelDetailState();
  if (panel) panel.scrollTop = keepTop;
  return true;
}
function maybeGrowPlaylistPanelDetailRenderLimit() {
  var panel = document.getElementById('playlist-panel');
  var st = playlistPanelDetailState;
  if (!panel || !st || st.loading || !st.key || !st.tracks || st.renderLimit >= st.tracks.length) return;
  if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 240) {
    growPlaylistPanelDetailRenderLimit();
  }
}
function resetPlaylistPanelRenderLimit() {
  playlistPanelRenderLimit = PLAYLIST_PANEL_BATCH_SIZE;
}
function growPlaylistPanelRenderLimit() {
  if (!userPlaylists.length) return;
  var next = Math.min(userPlaylists.length, (playlistPanelRenderLimit || PLAYLIST_PANEL_BATCH_SIZE) + PLAYLIST_PANEL_BATCH_SIZE);
  if (next <= playlistPanelRenderLimit) return;
  playlistPanelRenderLimit = next;
  renderUserPlaylistsList({ animate: true });
}
function bindPlaylistPanelLazyRender() {
  var panel = document.getElementById('playlist-panel');
  bindMiniQueueLazyRender();
  if (!panel || playlistPanelLazyBound) return;
  playlistPanelLazyBound = true;
  panel.addEventListener('scroll', function () {
    maybeGrowQueuePanelRenderLimit();
    maybeGrowPlaylistPanelDetailRenderLimit();
    if (queueViewTab !== 'playlists' || playlistPanelRenderLimit >= userPlaylists.length) return;
    if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 180) growPlaylistPanelRenderLimit();
  }, { passive: true });
}
function renderUserPlaylistsList(opts) {
  opts = opts || {};
  var $pl = document.getElementById('pl-list');
  var seq = ++playlistRenderSeq;
  if (!userPlaylists.length) {
    $pl.innerHTML = '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">未找到歌单</div>';
    return;
  }
  function playlistCardHtml(pl) {
    var provider = playlistProviderNorm(pl.provider);
    var providerLabel = provider === 'qq' ? 'QQ' : (provider === 'kugou' ? 'KG' : (provider === 'qishui' ? 'QS' : (provider === 'spotify' ? 'SP' : 'NE')));
    var thumb = playlistPanelCover(provider, pl.cover, '88y88');
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,.06);flex-shrink:0"></div>';
    var key = playlistPanelKey(provider, pl.id);
    var expanded = playlistPanelDetailState.key === key ? ' expanded' : '';
    return '<div class="pl-card' + expanded + '" data-playlist-provider="' + provider + '" data-playlist-id="' + escHtml(String(pl.id || '')) + '" data-playlist-title="' + escHtml(pl.name || '') + '">' +
      imgTag +
      '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(pl.name) + '<span class="tag-source ' + provider + '" style="margin-left:6px;vertical-align:1px">' + providerLabel + '</span></div><div class="pl-sub">' + pl.trackCount + ' 首 · ' + escHtml(pl.creator || '') + '</div></div>' +
      '</div>' + playlistPanelDetailHtml(pl, provider);
  }
  var groups = [
    { key: 'netease', label: '网易云歌单', items: userPlaylists.filter(function (pl) { return pl.provider !== 'qq' && pl.provider !== 'kugou' && pl.provider !== 'qishui' && pl.provider !== 'spotify'; }) },
    { key: 'qq', label: 'QQ 音乐歌单', items: userPlaylists.filter(function (pl) { return pl.provider === 'qq'; }) },
    { key: 'kugou', label: '酷狗音乐歌单', items: userPlaylists.filter(function (pl) { return pl.provider === 'kugou'; }) },
    { key: 'qishui', label: '汽水音乐歌单', items: userPlaylists.filter(function (pl) { return pl.provider === 'qishui'; }) },
    { key: 'spotify', label: 'Spotify 歌单', items: userPlaylists.filter(function (pl) { return pl.provider === 'spotify'; }) }
  ];
  if (opts.reset) resetPlaylistPanelRenderLimit();
  playlistPanelRenderLimit = Math.max(PLAYLIST_PANEL_BATCH_SIZE, Math.min(userPlaylists.length, playlistPanelRenderLimit || PLAYLIST_PANEL_BATCH_SIZE));
  var renderedCount = 0;
  function visibleGroupItems(items) {
    var room = playlistPanelRenderLimit - renderedCount;
    if (room <= 0) return [];
    var visible = items.slice(0, room);
    renderedCount += visible.length;
    return visible;
  }
  $pl.innerHTML = groups.map(function (group) {
    var items = visibleGroupItems(group.items);
    if (!items.length) return '';
    return '<div class="pl-section-label">' + group.label + '</div>' + items.map(playlistCardHtml).join('');
  }).join('') || '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">未找到歌单</div>';
  if (userPlaylists.length > renderedCount) {
    $pl.insertAdjacentHTML('beforeend', '<button type="button" class="fx-mini-btn ghost pl-load-more" data-pl-load-more="1">加载更多 ' + renderedCount + '/' + userPlaylists.length + '</button>');
  }
  if (opts.animate && seq === playlistRenderSeq) animateVisiblePanelList($pl, '.pl-card', document.getElementById('playlist-panel'));
}
function renderMyPodcastCollections(opts) {
  opts = opts || {};
  var $pod = document.getElementById('podcast-list');
  if (!$pod) return;
  if (!loginStatus.loggedIn) {
    $pod.innerHTML = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">登录后显示我的播客</div>';
    return;
  }
  var items = myPodcastCollections || [];
  if (!items.length) {
    $pod.innerHTML = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">暂无播客数据</div>';
    return;
  }
  $pod.innerHTML = items.map(function (pc) {
    var thumb = pc.cover ? coverUrlWithSize(pc.cover, 88) : '';
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(0,245,212,.07);flex-shrink:0"></div>';
    return '<div class="pl-card podcast-card" data-podcast-key="' + escHtml(pc.key || '') + '" data-podcast-title="' + escHtml(pc.title || '') + '">' +
      imgTag +
      '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(pc.title || '') + '</div><div class="pl-sub">' + (pc.count || 0) + ' 项 · ' + escHtml(pc.sub || '') + '</div></div>' +
      '</div>';
  }).join('');
  if (opts.animate) animateVisiblePanelList($pod, '.pl-card', document.getElementById('playlist-panel'));
}
document.getElementById('pl-list').addEventListener('click', function (e) {
  var loadMore = e.target && e.target.closest ? e.target.closest('[data-pl-load-more]') : null;
  if (loadMore) {
    e.preventDefault();
    e.stopPropagation();
    growPlaylistPanelRenderLimit();
    return;
  }
  var detailLoadMore = e.target && e.target.closest ? e.target.closest('[data-pl-detail-load-more]') : null;
  if (detailLoadMore) {
    e.preventDefault();
    e.stopPropagation();
    growPlaylistPanelDetailRenderLimit();
    return;
  }
  var detailTop = e.target && e.target.closest ? e.target.closest('[data-pl-detail-top]') : null;
  if (detailTop) {
    e.preventDefault();
    e.stopPropagation();
    scrollPlaylistPanelToTop();
    return;
  }
  var playDetail = e.target && e.target.closest ? e.target.closest('[data-pl-detail-play]') : null;
  if (playDetail) {
    e.preventDefault();
    e.stopPropagation();
    playPlaylistPanelDetail();
    return;
  }
  var artist = e.target && e.target.closest ? e.target.closest('[data-pl-detail-artist]') : null;
  if (artist) {
    e.preventDefault();
    e.stopPropagation();
    openPlaylistPanelDetailArtist(Number(artist.getAttribute('data-pl-detail-artist')));
    return;
  }
  var row = e.target && e.target.closest ? e.target.closest('[data-pl-detail-row]') : null;
  if (row) {
    e.preventDefault();
    e.stopPropagation();
    playPlaylistPanelDetailTrack(Number(row.getAttribute('data-pl-detail-row')));
    return;
  }
  var card = e.target && e.target.closest ? e.target.closest('.pl-card') : null;
  if (!card) return;
  var provider = card.getAttribute('data-playlist-provider') || 'netease';
  var pid = card.getAttribute('data-playlist-id') || '';
  openPlaylistPanelDetail(provider, pid, card.getAttribute('data-playlist-title') || '');
});

// ==================== 排行榜(五源共同缺口)====================
// 网易榜单公开(无需登录),QQ / 酷狗按各自登录态门控;点榜 → /toplist/tracks → 复用队列播放。
// 复用歌单面板的 .pl-card / .pl-inline-detail 样式,但卡片/行用内联 onclick + event.stopPropagation(),
// 避免触发上面按 .pl-card / [data-pl-detail-row] 委派到普通歌单详情的处理器。
var toplistState = { loading: false, loaded: false, error: '', token: 0, groups: [], detailKey: '', detailLoading: false, detailToken: 0, tracks: [], playlist: null };
function toplistProviderLabel(provider) {
  return provider === 'qq' ? 'QQ' : (provider === 'kugou' ? 'KG' : 'NE');
}
function toplistGroupLabel(provider) {
  return provider === 'qq' ? 'QQ 音乐榜单' : (provider === 'kugou' ? '酷狗榜单' : '网易云榜单');
}
function normalizeToplistResp(provider, resp) {
  var arr = (resp && resp.toplists) || [];
  return arr.map(function (t) {
    return { provider: provider, id: String(t.id || ''), name: t.name || '', cover: t.cover || '', trackCount: Number(t.trackCount || 0) || 0, group: t.group || '' };
  }).filter(function (t) { return t.id && t.name; });
}
async function loadToplists(force) {
  var st = toplistState;
  if (st.loading) return;
  if (st.loaded && !force) { renderToplistPane(); return; }
  var token = ++st.token;
  st.loading = true;
  st.error = '';
  renderToplistPane();
  try {
    var qqOn = typeof qqLoginStatus !== 'undefined' && qqLoginStatus.loggedIn;
    var kugouOn = typeof kugouLoginStatus !== 'undefined' && kugouLoginStatus.loggedIn;
    var reqs = [
      apiJson('/api/toplist').catch(function () { return null; }),   // 网易公开
      qqOn ? apiJson('/api/qq/toplist').catch(function () { return null; }) : Promise.resolve(null),
      kugouOn ? apiJson('/api/kugou/toplist').catch(function () { return null; }) : Promise.resolve(null)
    ];
    var res = await Promise.all(reqs);
    if (token !== st.token) return;
    var groups = [];
    [['netease', res[0]], ['qq', res[1]], ['kugou', res[2]]].forEach(function (pair) {
      var list = normalizeToplistResp(pair[0], pair[1]);
      if (list.length) groups.push({ key: pair[0], label: toplistGroupLabel(pair[0]), toplists: list });
    });
    st.groups = groups;
    st.loaded = true;
  } catch (e) {
    if (token === st.token) st.error = 'TOPLIST_FAILED';
  } finally {
    if (token === st.token) { st.loading = false; renderToplistPane(); }
  }
}
function toplistDetailHtml(t, key) {
  if (toplistState.detailKey !== key) return '';
  var loading = toplistState.detailLoading;
  var tracks = toplistState.tracks || [];
  var rows = loading
    ? '<div class="pl-detail-row"><div style="width:34px;height:34px;border-radius:7px;background:rgba(255,255,255,.06)"></div><div style="flex:1;min-width:0"><div class="pl-detail-row-title">正在载入榜单</div><div class="pl-detail-row-artist">请稍候</div></div></div>'
    : tracks.map(function (song, i) {
      var thumb = songCoverSrc(song, 60);
      var imgTag = thumb ? '<img src="' + escHtml(thumb) + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:34px;height:34px;border-radius:7px;background:rgba(255,255,255,.06);flex:0 0 auto"></div>';
      return '<div class="pl-detail-row" onclick="event.stopPropagation();playToplistDetailTrack(' + i + ')">' +
        imgTag +
        '<div style="flex:1;min-width:0"><div class="pl-detail-row-title">' + escHtml(song.name || '') + '</div>' +
        '<div class="pl-detail-row-artist">' + escHtml(song.artist || '未知歌手') + '</div></div>' +
        '</div>';
    }).join('');
  if (!loading && !rows) rows = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.30);font-size:11.5px">该榜单暂无可播放歌曲</div>';
  return '<div class="pl-inline-detail">' +
    '<div class="pl-detail-sticky"><div class="pl-detail-actions">' +
    '<button class="pl-detail-play" type="button" onclick="event.stopPropagation();playToplistDetail()"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>播放榜单</button>' +
    '</div></div>' +
    '<div class="pl-detail-list">' + rows + '</div>' +
    '</div>';
}
function toplistCardHtml(t) {
  var key = t.provider + ':' + t.id;
  var expanded = toplistState.detailKey === key ? ' expanded' : '';
  var thumb = playlistPanelCover(t.provider, t.cover, '88y88');
  var imgTag = thumb ? '<img src="' + escHtml(thumb) + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,.06);flex-shrink:0"></div>';
  var sub = (t.trackCount ? t.trackCount + ' 首' : '榜单') + (t.group ? ' · ' + t.group : '');
  return '<div class="pl-card' + expanded + '" onclick="event.stopPropagation();openToplistDetail(\'' + t.provider + '\',\'' + String(t.id) + '\')">' +
    imgTag +
    '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(t.name) + '<span class="tag-source ' + t.provider + '" style="margin-left:6px;vertical-align:1px">' + toplistProviderLabel(t.provider) + '</span></div><div class="pl-sub">' + escHtml(sub) + '</div></div>' +
    '</div>' + toplistDetailHtml(t, key);
}
function renderToplistPane() {
  var el = document.getElementById('toplist-list');
  if (!el) return;
  var st = toplistState;
  if (st.loading && !st.groups.length) { el.innerHTML = miniQueueSkeleton(); return; }
  if (st.error && !st.groups.length) { el.innerHTML = '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">榜单加载失败，点上方刷新重试</div>'; return; }
  if (!st.groups.length) { el.innerHTML = '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">暂无可用榜单，登录 QQ / 酷狗后可显示更多</div>'; return; }
  el.innerHTML = st.groups.map(function (group) {
    return '<div class="pl-section-label">' + escHtml(group.label) + '</div>' + group.toplists.map(toplistCardHtml).join('');
  }).join('');
}
function findToplistItem(provider, id) {
  var groups = toplistState.groups || [];
  for (var i = 0; i < groups.length; i++) {
    var list = groups[i].toplists || [];
    for (var j = 0; j < list.length; j++) {
      if (list[j].provider === provider && String(list[j].id) === String(id)) return list[j];
    }
  }
  return { provider: provider, id: String(id), name: '榜单', cover: '' };
}
function toplistTracksUrl(provider, id) {
  var q = '?id=' + encodeURIComponent(id) + '&limit=100';
  if (provider === 'qq') return '/api/qq/toplist/tracks' + q;
  if (provider === 'kugou') return '/api/kugou/toplist/tracks' + q;
  return '/api/toplist/tracks' + q;
}
async function openToplistDetail(provider, id) {
  if (!id) return;
  var key = provider + ':' + id;
  var st = toplistState;
  if (st.detailKey === key && !st.detailLoading && st.tracks.length) {
    st.detailKey = '';
    st.tracks = [];
    st.playlist = null;
    renderToplistPane();
    return;
  }
  var token = ++st.detailToken;
  st.detailKey = key;
  st.detailLoading = true;
  st.tracks = [];
  st.playlist = findToplistItem(provider, id);
  renderToplistPane();
  try {
    var r = await apiJson(toplistTracksUrl(provider, id));
    if (st.detailToken !== token) return;
    st.detailLoading = false;
    st.tracks = ((r && r.tracks) || []).map(cloneSong);
    if (r && r.playlist) st.playlist = r.playlist;
    renderToplistPane();
  } catch (e) {
    console.warn('[ToplistDetail]', provider, id, e);
    if (st.detailToken !== token) return;
    st.detailLoading = false;
    st.tracks = [];
    renderToplistPane();
    showToast('榜单加载失败');
  }
}
function playToplistDetailTrack(index) {
  var tracks = toplistState.tracks || [];
  if (!tracks[index]) return;
  playQueue = tracks.map(cloneSong);
  currentIdx = index;
  safeRenderQueuePanel('toplist-detail');
  safeSwitchPlaylistTab('queue', 'toplist-detail');
  safeShelfRebuild('toplist-detail', true);
  forcePlaybackControlsInteractive();
  playQueueAt(index).catch(function (e) { console.warn('[ToplistPlay]', e); });
}
function playToplistDetail() {
  if (!toplistState.tracks || !toplistState.tracks.length) return;
  playToplistDetailTrack(0);
}
