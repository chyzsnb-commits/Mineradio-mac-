function fallbackHomeTiles() {
  return [
    { kind: 'login', title: '登录同步歌单', sub: '网易云 / QQ 音乐' },
    { kind: 'search', title: '搜索一首歌', sub: '原唱优先', query: '' },
    { kind: 'local', title: '导入本地音乐', sub: '本地文件也能可视化' },
    { kind: 'podcastSearch', title: '搜索播客', sub: '长内容 / 电台' },
    { kind: 'guide', title: '看看视觉舞台', sub: '粒子 / 歌词 / 封面' },
  ];
}
function homeTileCover(item) {
  if (!item) return '';
  if (item.kind === 'song' || item.kind === 'weatherSong') return songCoverSrc(item.song, 220);
  return item.cover ? coverUrlWithSize(item.cover, 220) : '';
}
function homeToneForItem(item, index) {
  if (!item) return 'daily';
  if (item.kind === 'weatherSong') return 'daily';
  if (item.kind === 'recent') return 'search';
  if (item.kind === 'profile') return 'local';
  if (item.tone) return item.tone;
  if (item.kind === 'song') return index % 2 ? 'search' : 'daily';
  if (item.kind === 'playlist') return 'playlist';
  if (item.kind === 'podcast' || item.kind === 'podcastSearch') return 'podcast';
  if (item.kind === 'local') return 'local';
  if (item.kind === 'guide') return 'guide';
  if (item.kind === 'login') return 'library';
  if (item.kind === 'search') return 'search';
  return ['daily', 'playlist', 'local', 'guide', 'search'][index % 5];
}
// ============================================================
//  Windows v2.1.0 对齐: 每日热评 + 生成封面回退
// ============================================================
var homeDashboardReviewOffset = 0;
var homeDashboardReviewClockTimer = null;
var HOME_DASHBOARD_REVIEW_DEFAULTS = [
  { text: '有些歌不是突然好听，而是终于听懂了。', source: '每日热评' },
  { text: '慢一点没关系，重要的是一直在向喜欢的生活靠近。', source: '每日热评' },
  { text: '错过落日余晖，还会有满天星辰。', source: '每日热评' },
  { text: '保持热爱，奔赴下一场山海。', source: '每日热评' },
  { text: '答案在路上，自由在风里。', source: '每日热评' },
  { text: '让今天的声音，从你喜欢的地方开始。', source: 'Mineradio' },
];
function homeDashboardSvgText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function homeDashboardCoverInitials(text) {
  var raw = String(text || '音乐').replace(/\s+/g, '').trim();
  var chars = Array.from(raw || '音乐');
  return chars.slice(0, Math.min(2, chars.length)).join('');
}
function homeDashboardGeneratedCover(title, label, tone) {
  var palettes = {
    search: ['#9db8cf', '#f8f4ee', '#00f5d4'],
    playlist: ['#9db8cf', '#00f5d4', '#2442ff'],
    library: ['#00f5d4', '#f8f4ee', '#2442ff'],
    mix: ['#f8f4ee', '#00f5d4', '#2442ff'],
    daily: ['#f8f4ee', '#00f5d4', '#2442ff'],
    local: ['#00f5d4', '#9db8cf', '#2442ff'],
    guide: ['#9db8cf', '#2442ff', '#00f5d4'],
    podcast: ['#9db8cf', '#f8f4ee', '#2442ff'],
  };
  var palette = palettes[tone] || palettes.playlist;
  var letters = homeDashboardSvgText(homeDashboardCoverInitials(title || label));
  var sub = homeDashboardSvgText(String(label || 'MINERADIO').toUpperCase().slice(0, 14));
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + palette[0] + '"/><stop offset=".52" stop-color="' + palette[1] + '"/>' +
    '<stop offset="1" stop-color="' + palette[2] + '"/></linearGradient>' +
    '<radialGradient id="r" cx="34%" cy="24%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/>' +
    '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
    '<rect width="320" height="320" rx="54" fill="#080a10"/>' +
    '<rect width="320" height="320" rx="54" fill="url(#g)" opacity=".84"/>' +
    '<circle cx="242" cy="66" r="98" fill="url(#r)"/>' +
    '<circle cx="112" cy="214" r="84" fill="#05060a" opacity=".34"/>' +
    '<circle cx="112" cy="214" r="52" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>' +
    '<circle cx="112" cy="214" r="22" fill="#fff" opacity=".18"/>' +
    '<path d="M222 118v98c0 19-16 34-39 34-20 0-35-11-35-27 0-17 16-29 38-29 7 0 14 1 20 4v-90l72-18v30z" fill="#fff" opacity=".32"/>' +
    '<text x="28" y="72" fill="#fff" opacity=".72" font-size="18" font-family="Arial,Microsoft YaHei,sans-serif" font-weight="800" letter-spacing="2">' + sub + '</text>' +
    '<text x="28" y="148" fill="#fff" font-size="58" font-family="Arial,Microsoft YaHei,sans-serif" font-weight="900">' + letters + '</text>' +
    '<rect x="0" y="0" width="320" height="320" rx="54" fill="none" stroke="#fff" stroke-opacity=".20"/>' +
    '</svg>';
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}
function generatedHomeCover(title, label, tone) {
  return homeDashboardGeneratedCover(title, label, tone);
}
function homeDashboardReadReviews() {
  try {
    var saved = JSON.parse(localStorage.getItem('mineradio-daily-review-quotes-v1') || '[]');
    if (Array.isArray(saved) && saved.length) {
      var normalized = saved.map(function (item) {
        if (typeof item === 'string') return { text: item.trim(), source: '我的热评' };
        return {
          text: String(item && item.text || '').trim(),
          source: String(item && item.source || '我的热评').trim(),
        };
      }).filter(function (item) { return item.text; });
      if (normalized.length) return normalized;
    }
  } catch (_error) { }
  return HOME_DASHBOARD_REVIEW_DEFAULTS.slice();
}
function homeDashboardDayNumber() {
  var now = new Date();
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000);
}
function homeDashboardSelectedReview() {
  var reviews = homeDashboardReadReviews();
  if (!reviews.length) return { text: '让今天的声音，从你喜欢的地方开始。', source: 'Mineradio' };
  var index = ((homeDashboardDayNumber() + homeDashboardReviewOffset) % reviews.length + reviews.length) % reviews.length;
  return reviews[index];
}
function homeDashboardUpdateReviewClock() {
  var time = document.getElementById('home-daily-review-time');
  if (!time) return;
  var now = new Date();
  time.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}
function renderHomeDailyReview() {
  var el = document.getElementById('home-daily-review');
  if (!el) return;
  var review = homeDashboardSelectedReview();
  var quote = document.getElementById('home-daily-quote');
  var source = document.getElementById('home-daily-source');
  if (quote) quote.textContent = '“' + review.text + '”';
  if (source) source.textContent = '— ' + (review.source || '每日热评');
  homeDashboardUpdateReviewClock();
  if (!homeDashboardReviewClockTimer) {
    homeDashboardReviewClockTimer = setInterval(homeDashboardUpdateReviewClock, 30000);
  }
}
function homeDashboardNextReview() {
  homeDashboardReviewOffset += 1;
  renderHomeDailyReview();
}
function homeProviderRecommendationGroups() {
  var groups = [];
  // 独立音源入口不能再借网易登录态显隐，否则网易已登录时 QQ/汽水/酷狗推荐会被吞掉。
  if (qishuiLoginStatus.loggedIn && homeDiscoverState.qishuiFeed.length) groups.push({ key: 'qishui', title: '汽水推荐', songs: homeDiscoverState.qishuiFeed, tone: 'daily' });
  if (kugouLoginStatus.loggedIn && homeDiscoverState.kugouGuess.length) groups.push({ key: 'kugou', title: '猜你喜欢 FM', songs: homeDiscoverState.kugouGuess, tone: 'playlist' });
  if (qqLoginStatus.loggedIn && homeDiscoverState.qqDaily.length) groups.push({ key: 'qqDaily', title: 'QQ 每日 30 首', songs: homeDiscoverState.qqDaily, tone: 'search' });
  if (qqLoginStatus.loggedIn && homeDiscoverState.qqRadio.length) groups.push({ key: 'qqRadio', title: 'QQ 猜你喜欢电台', songs: homeDiscoverState.qqRadio, tone: 'podcast' });
  return groups;
}
function renderHomeMosaic(items) {
  var cells = document.querySelectorAll('#home-mosaic .home-mosaic-cell');
  if (!cells.length) return;
  var covers = [];
  (items || []).forEach(function (item) {
    var cover = homeTileCover(item);
    if (cover) covers.push(cover);
  });
  for (var i = 0; i < cells.length; i++) {
    var src = covers[i] || covers[(i + 1) % Math.max(1, covers.length)] || '';
    cells[i].style.backgroundImage = src ? 'url("' + cssImageUrl(src) + '")' : '';
    cells[i].classList.toggle('has-cover', !!src);
    cells[i].classList.toggle('home-skeleton', !src && homeDiscoverState.loading);
  }
}
function renderHomeTiles() {
  var row = document.getElementById('home-tile-row');
  var title = document.getElementById('home-rail-title');
  var note = document.getElementById('home-rail-note');
  if (!row) return;
  var tiles = [];
  var loggedOutHome = !homeDiscoverState.loggedIn && !hasAnyPlatformLogin();
  var weatherSongs = homeWeatherRadioState.radio && homeWeatherRadioState.radio.songs || [];
  var summary = homeListenSummary();
  if (summary.recent && tiles.length < 5) {
    tiles.push({ kind: 'recent', title: summary.recent.name || '继续听', sub: summary.recent.artist || summary.recent.source || '', cover: summary.recent.cover, record: summary.recent });
  }
  if (summary.topArtist && tiles.length < 5) {
    tiles.push({ kind: 'profile', title: summary.topArtist.name, sub: '常听歌手 · ' + summary.topArtist.plays + ' 次', query: summary.topArtist.name });
  }
  if (!loggedOutHome) {
    homeProviderRecommendationGroups().forEach(function (group) {
      var song = group.songs[0];
      tiles.push({ kind: 'providerRecommendation', groupKey: group.key, title: group.title, sub: (song.name || '点击播放') + (song.artist ? ' · ' + song.artist : ''), song: song, tone: group.tone });
    });
    homeDiscoverState.songs.slice(0, Math.max(0, 4 - tiles.length)).forEach(function (song, i) {
      tiles.push({ kind: 'song', index: i, song: song, title: song.name || '今日歌曲', sub: song.artist || songSourceLabel(song) });
    });
    homeDiscoverState.playlists.slice(0, Math.max(0, 5 - tiles.length)).forEach(function (pl, i) {
      tiles.push({ kind: 'playlist', index: i, title: pl.name || '推荐歌单', sub: (pl.trackCount ? pl.trackCount + ' 首' : 'Playlist') + (pl.playCount ? ' · ' + compactHomeCount(pl.playCount) + ' 播放' : ''), cover: pl.cover });
    });
    if (tiles.length < 5) {
      homeDiscoverState.podcasts.slice(0, 5 - tiles.length).forEach(function (p, i) {
        tiles.push({ kind: 'podcast', index: i, title: p.name || '热门播客', sub: p.djName || p.category || 'Podcast', cover: p.cover });
      });
    }
  }
  if (tiles.length < 5) {
    weatherSongs.slice(0, 5 - tiles.length).forEach(function (song, i) {
      tiles.push({ kind: 'weatherSong', index: i, song: song, title: song.name || '天气电台歌曲', sub: song.artist || songSourceLabel(song) });
    });
  }
  if (!tiles.length) tiles = fallbackHomeTiles();
  // 音源推荐入口允许横向扩展，不能用旧的五卡截断把已登录音源藏起来。
  if (title) title.textContent = summary.recent ? '接着听' : (loggedOutHome ? '先从这里开始' : '你的歌单与推荐');
  if (note) {
    var liveNote = homeDiscoverState.updatedAt ? '刚刚更新 · 点击即可播放' : '点击即可播放';
    note.textContent = homeDiscoverState.loading ? '正在整理推荐' : (loggedOutHome && !weatherSongs.length ? '不会自动拉取外部推荐' : (homeDiscoverState.error ? '离线精选' : liveNote));
  }
  row.innerHTML = tiles.map(function (item, i) {
    var cover = homeTileCover(item);
    var tone = homeToneForItem(item, i);
    var coverClass = 'home-tile-cover' + (cover ? ' has-cover' : '');
    return '<button class="home-tile' + (!cover && homeDiscoverState.loading ? ' home-skeleton' : '') + '" data-home-tone="' + escHtml(tone) + '" type="button" onclick="handleHomeTileClick(' + i + ')">' +
      '<div class="' + coverClass + '" style="' + (cover ? 'background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)' : '') + '"></div>' +
      '<div class="home-tile-title">' + escHtml(item.title || '') + '</div>' +
      '<div class="home-tile-sub">' + escHtml(item.sub || '') + '</div>' +
      '</button>';
  }).join('');
  row._homeTiles = tiles;
  renderHomeMosaic(tiles);
}
// 最近播放(Recently Played)hero —— 移植自主线 Mineradio,数据源与 homeListenSummary 同为 listenStatsState.history
var homeRecentScrollActiveUntil = 0;
var homeRecentScrollEndTimer = 0;
function isHomeRecentScrollActive(now) {
  return (Number(now) || performance.now()) < homeRecentScrollActiveUntil;
}
function markHomeRecentScrollActivity() {
  homeRecentScrollActiveUntil = performance.now() + 240;
  var listEl = document.getElementById('home-recent-list');
  if (listEl) listEl.classList.add('is-scrolling');
  if (homeRecentScrollEndTimer) clearTimeout(homeRecentScrollEndTimer);
  homeRecentScrollEndTimer = setTimeout(function () {
    homeRecentScrollEndTimer = 0;
    if (performance.now() < homeRecentScrollActiveUntil) return;
    var currentList = document.getElementById('home-recent-list');
    if (currentList) currentList.classList.remove('is-scrolling');
  }, 250);
}
function homeRecentPlays() {
  return (listenStatsState.history || []).filter(function (item) { return item && (item.id || item.mid || item.key); }).slice(0, 30);
}
var homeRecentCoverObserver = null;
function bindHomeRecentCoverLazyLoading(listEl) {
  if (!listEl) return;
  if (homeRecentCoverObserver) {
    homeRecentCoverObserver.disconnect();
    homeRecentCoverObserver = null;
  }
  var nodes = listEl.querySelectorAll('[data-home-recent-cover]');
  if (!nodes.length) return;
  function hydrate(node) {
    if (!node || node.dataset.homeRecentCoverLoaded === '1') return;
    var src = node.getAttribute('data-home-recent-cover') || '';
    if (!src) return;
    node.style.backgroundImage = 'url("' + cssImageUrl(src) + '")';
    node.dataset.homeRecentCoverLoaded = '1';
    node.removeAttribute('data-home-recent-cover');
  }
  if (typeof IntersectionObserver !== 'function') {
    Array.prototype.slice.call(nodes, 0, 8).forEach(hydrate);
    return;
  }
  homeRecentCoverObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      hydrate(entry.target);
      homeRecentCoverObserver.unobserve(entry.target);
    });
  }, { root: listEl, rootMargin: '180px 0px' });
  Array.prototype.forEach.call(nodes, function (node) { homeRecentCoverObserver.observe(node); });
}
function renderHomeRecentBlock() {
  var statsEl = document.getElementById('home-recent-stats');
  var listEl = document.getElementById('home-recent-list');
  if (!statsEl && !listEl) return;
  var plays = homeRecentPlays();
  var summary = homeListenSummary();
  var dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  var dayStartMs = dayStart.getTime();
  var todayCount = plays.filter(function (item) { return Number(item.playedAt) >= dayStartMs; }).length;
  if (statsEl) {
    var stats = [];
    stats.push({ k: '今日播放', v: todayCount + ' 首' });
    stats.push({ k: '累计有效', v: (summary.totalPlays || 0) + ' 首' });
    if (summary.topArtist && summary.topArtist.name) stats.push({ k: '最常听', v: summary.topArtist.name });
    statsEl.innerHTML = stats.map(function (s) {
      return '<div class="home-recent-stat"><div class="home-recent-stat-k">' + escHtml(s.k) + '</div><div class="home-recent-stat-v">' + escHtml(String(s.v)) + '</div></div>';
    }).join('');
  }
  if (!listEl) return;
  if (!listEl._recentScrollPerformanceBound) {
    listEl._recentScrollPerformanceBound = true;
    listEl.addEventListener('wheel', markHomeRecentScrollActivity, { passive: true });
    listEl.addEventListener('scroll', markHomeRecentScrollActivity, { passive: true });
  }
  if (!plays.length) {
    listEl.className = 'home-recent-empty';
    listEl.innerHTML = '<div class="home-recent-empty-title">还没有最近收听</div>' +
      '<div class="home-recent-empty-sub">开始播放后，这里会出现你的最近收听，点一下即可重新播放。</div>';
    listEl._recentPlays = [];
    return;
  }
  listEl.className = 'home-recent-list';
  listEl.innerHTML = plays.map(function (item, i) {
    var cover = item.cover ? coverUrlWithSize(item.cover, 120) : '';
    return '<button class="home-recent-card" type="button" onclick="playHomeRecentCard(' + i + ')">' +
      '<div class="home-recent-thumb"' + (cover ? ' data-home-recent-cover="' + escHtml(cover) + '"' : '') + '></div>' +
      '<div class="home-recent-meta">' +
        '<div class="home-recent-name">' + escHtml(item.name || '未知歌曲') + '</div>' +
        '<div class="home-recent-artist">' + escHtml(item.artist || item.source || '') + '</div>' +
      '</div>' +
    '</button>';
  }).join('');
  listEl._recentPlays = plays;
  bindHomeRecentCoverLazyLoading(listEl);
}
function playHomeRecentCard(index) {
  var listEl = document.getElementById('home-recent-list');
  var record = listEl && listEl._recentPlays && listEl._recentPlays[index];
  if (!record) return;
  playHomeRecent(record);
}
function renderHomeDailyBrief() {
  var el = document.getElementById('home-daily-brief');
  if (!el) return;
  var daily = homeDiscoverState.songs[0];
  var label = daily ? (daily.name || '每日推荐') : '每日内容';
  var sub = daily ? (daily.artist || songSourceLabel(daily) || '今日推荐') : '登录后同步你的今日歌曲';
  el.innerHTML = '<button class="home-brief-card" type="button" onclick="playHomeSong(0)">' +
    '<span class="home-brief-label">Today</span>' +
    '<span class="home-brief-title">' + escHtml(label) + '</span>' +
    '<span class="home-brief-sub">' + escHtml(sub) + '</span>' +
    '</button>';
}
function renderHomeNextUp() {
  var el = document.getElementById('home-next-up');
  if (!el) return;
  var start = Math.max(0, Number(currentIdx) + 1 || 0);
  var queued = Array.isArray(playQueue) ? playQueue.slice(start, start + 2).map(function (song, offset) {
    return { song: song, queueIndex: start + offset };
  }) : [];
  var items = queued.length ? queued : (homeDiscoverState.songs || []).slice(0, 2).map(function (song, index) {
    return { song: song, homeIndex: index };
  });
  if (!items.length) {
    el.innerHTML = '<div class="home-next-heading">Next Up</div><div class="home-next-empty">播放歌曲后，下一首会显示在这里</div>';
    el._homeNextUp = [];
    return;
  }
  el.innerHTML = '<div class="home-next-heading">Next Up</div>' + items.map(function (item, index) {
    var song = item.song || {};
    var cover = songCoverSrc(song, 80);
    return '<button class="home-next-item" type="button" onclick="playHomeNextUp(' + index + ')" data-home-next="' + index + '">' +
      '<span class="home-next-cover" style="' + (cover ? 'background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)' : '') + '"></span>' +
      '<span class="home-next-copy"><span class="home-next-title">' + escHtml(song.name || '下一首') + '</span><span class="home-next-sub">' + escHtml(song.artist || songSourceLabel(song) || '') + '</span></span>' +
      '</button>';
  }).join('');
  el._homeNextUp = items;
}
async function playHomeNextUp(index) {
  var el = document.getElementById('home-next-up');
  var item = el && el._homeNextUp && el._homeNextUp[index];
  if (!item) return;
  if (typeof item.queueIndex === 'number') {
    forcePlaybackControlsInteractive();
    return playQueueAt(item.queueIndex);
  }
  return playHomeSong(item.homeIndex || 0);
}
function renderHomeDiscover() {
  var sub = document.getElementById('home-subtitle');
  var loggedOutHome = !homeDiscoverState.loggedIn && !hasAnyPlatformLogin();
  var weather = homeWeatherRadioState.weather;
  var radio = homeWeatherRadioState.radio;
  var weatherLocation = weather && weather.location && weather.location.name || homeWeatherRadioState.city || '上海';
  var weatherTitle = document.getElementById('home-weather-title');
  var weatherKicker = document.getElementById('home-weather-kicker');
  var weatherMeta = document.getElementById('home-weather-meta');
  if (weatherTitle) weatherTitle.textContent = '我的音乐库';
  if (weatherKicker) weatherKicker.textContent = 'Mineradio · Your Library';
  if (sub) {
    if (loggedOutHome) sub.textContent = '登录后会把你的歌单、常听歌手和最近播放放在这里；也可以直接搜索或导入本地音乐。';
    else sub.textContent = '从你的歌单、最近播放和常听歌手开始，天气电台放在需要氛围的时候再开。';
  }
  if (weatherMeta) {
    var meta = [];
    if (weather) {
      meta.push(weatherLocation);
      meta.push(weather.label + ' · ' + Math.round(weather.temperature || 0) + '°');
      meta.push('体感 ' + Math.round(weather.apparentTemperature || weather.temperature || 0) + '°');
      if (isFinite(weather.humidity)) meta.push('湿度 ' + Math.round(weather.humidity) + '%');
    } else {
      meta.push(weatherLocation);
      meta.push(homeWeatherRadioState.error ? '天气暂不可用' : '正在整理天气');
    }
    weatherMeta.innerHTML = meta.map(function (text) { return '<span class="home-weather-pill">' + escHtml(text) + '</span>'; }).join('');
  }
  var daily = homeDiscoverState.songs[0] || null;
  var cardSongB = homeDiscoverState.songs[1] || null;
  var cardSongC = homeDiscoverState.songs[2] || null;
  var fmSong = homeDiscoverState.personalFm[0] || null;   // 私人雷达 = 网易云私人 FM(真实),缺省再退回每日推荐
  var privateSong = fmSong || cardSongB;
  var playlistItem = homeDiscoverState.playlists[0] || null;
  var podcastItem = homeDiscoverState.podcasts[0] || null;
  var summary = homeListenSummary();
  var weatherCardTitle = document.getElementById('home-weather-card-title');
  var weatherCardSub = document.getElementById('home-weather-card-sub');
  var dailyTitle = document.getElementById('home-daily-title');
  var dailySub = document.getElementById('home-daily-sub');
  var privateTitle = document.getElementById('home-private-title');
  var privateSub = document.getElementById('home-private-sub');
  var continueTitle = document.getElementById('home-continue-title');
  var continueSub = document.getElementById('home-continue-sub');
  var profileTitle = document.getElementById('home-profile-title');
  var profileSub = document.getElementById('home-profile-sub');
  var libTitle = document.getElementById('home-library-title');
  var libSub = document.getElementById('home-library-sub');
  if (weatherCardTitle) weatherCardTitle.textContent = '我的歌单';
  if (weatherCardSub) {
    weatherCardSub.textContent = playlistItem ? (((playlistItem.trackCount || 0) ? playlistItem.trackCount + ' 首 · ' : '') + (playlistItem.creator || '打开左侧歌单库')) : '打开左侧歌单库';
  }
  if (continueTitle) continueTitle.textContent = summary.recent ? summary.recent.name : '继续听';
  if (continueSub) continueSub.textContent = summary.recent ? (summary.recent.artist || summary.recent.source || '最近播放') : '最近播放会出现在这里';
  if (profileTitle) profileTitle.textContent = summary.topArtist ? summary.topArtist.name : (summary.topSong ? summary.topSong.name : '听歌画像');
  if (profileSub) profileSub.textContent = summary.topArtist ? ('常听歌手 · ' + summary.topArtist.plays + ' 次') : (summary.totalPlays ? summary.totalPlays + ' 次有效播放' : '播放几首后生成偏好');
  if (loggedOutHome) {
    if (dailyTitle) dailyTitle.textContent = '每日推荐';
    if (dailySub) dailySub.textContent = '登录后同步你的今日歌曲';
    if (privateTitle) privateTitle.textContent = '推荐歌曲';
    if (privateSub) privateSub.textContent = '登录后同步更多歌曲';
    if (libTitle) libTitle.textContent = '更多歌曲';
    if (libSub) libSub.textContent = '播放后会继续补全推荐';
    setHomeArt('home-weather-art', homeDashboardGeneratedCover('我的歌单', 'Library', 'library'), 280);
    setHomeArt('home-daily-art', homeDashboardGeneratedCover('每日推荐', 'Daily', 'daily'), 280);
    setHomeArt('home-private-art', homeDashboardGeneratedCover('推荐歌曲', 'FM', 'playlist'), 280);
    setHomeArt('home-continue-art', summary.recent && summary.recent.cover || homeDashboardGeneratedCover('继续听', 'Continue', 'mix'), 280);
    setHomeArt('home-profile-art', summary.topSong && summary.topSong.cover || summary.recent && summary.recent.cover || homeDashboardGeneratedCover('听歌画像', 'Profile', 'local'), 280);
    setHomeArt('home-library-art', homeDashboardGeneratedCover('更多歌曲', 'Song', 'local'), 280);
  } else {
    if (dailyTitle) dailyTitle.textContent = daily ? daily.name : '每日推荐';
    if (dailySub) dailySub.textContent = daily ? ((daily.artist || songSourceLabel(daily) || '今日歌曲') + ' · 点击播放今日队列') : '同步你的今日歌曲';
    if (privateTitle) privateTitle.textContent = privateSong ? privateSong.name : '私人雷达';
    if (privateSub) privateSub.textContent = privateSong
      ? ((privateSong.artist || songSourceLabel(privateSong) || '私人 FM') + (fmSong ? ' · 私人雷达 FM' : ' · 推荐歌曲'))
      : (homeDiscoverState.personalFm.length ? (homeDiscoverState.personalFm.length + ' 首 · 网易云私人 FM') : (homeDiscoverState.songs.length + ' 首 · 根据今日推荐与常听偏好'));
    if (libTitle) libTitle.textContent = cardSongC ? cardSongC.name : (summary.topArtist ? summary.topArtist.name : '更多歌曲');
    if (libSub) libSub.textContent = cardSongC ? (cardSongC.artist || songSourceLabel(cardSongC) || '推荐歌曲') : (summary.topArtist ? ('歌手偏好 · ' + summary.topArtist.plays + ' 次') : '播放几首后生成你的偏好');
    setHomeArt('home-weather-art', (userPlaylists[0] && userPlaylists[0].cover) || (playlistItem && playlistItem.cover) || daily && daily.cover || homeDashboardGeneratedCover('我的歌单', 'Library', 'library'), 280);
    setHomeArt('home-daily-art', daily && daily.cover || homeDashboardGeneratedCover(daily && daily.name || '每日推荐', 'Daily', 'daily'), 280);
    setHomeArt('home-private-art', privateSong && privateSong.cover || daily && daily.cover || summary.recent && summary.recent.cover || playlistItem && playlistItem.cover || homeDashboardGeneratedCover(privateSong && privateSong.name || '私人雷达', 'FM', 'playlist'), 280);
    setHomeArt('home-continue-art', summary.recent && summary.recent.cover || playlistItem && playlistItem.cover || homeDashboardGeneratedCover('继续听', 'Continue', 'mix'), 280);
    setHomeArt('home-profile-art', summary.topSong && summary.topSong.cover || podcastItem && podcastItem.cover || homeDashboardGeneratedCover('听歌画像', 'Profile', 'local'), 280);
    setHomeArt('home-library-art', cardSongC && cardSongC.cover || summary.topSong && summary.topSong.cover || summary.recent && summary.recent.cover || podcastItem && podcastItem.cover || homeDashboardGeneratedCover(cardSongC && cardSongC.name || '更多歌曲', 'Song', 'local'), 280);
  }
  renderHomeTiles();
  renderHomeRecentBlock();
  renderHomeDailyBrief();
  renderHomeNextUp();
  renderHomeDailyReview();
}
async function loadHomeDiscover(force) {
  if (homeDiscoverState.loading) return;
  if (homeDiscoverState.loaded && !force) return;
  var token = ++homeDiscoverToken;
  homeDiscoverState.loading = true;
  homeDiscoverState.error = '';
  renderHomeDiscover();
  try {
    var requests = [apiJson('/api/discover/home?t=' + Date.now())];
    requests.push(kugouLoginStatus.loggedIn ? apiJson('/api/kugou/recommend/guess?limit=12&t=' + Date.now()).catch(function () { return null; }) : Promise.resolve(null));
    requests.push(qqLoginStatus.loggedIn ? apiJson('/api/qq/recommend/daily?t=' + Date.now()).catch(function () { return null; }) : Promise.resolve(null));
    requests.push(qqLoginStatus.loggedIn ? apiJson('/api/qq/recommend/radio?count=12&t=' + Date.now()).catch(function () { return null; }) : Promise.resolve(null));
    var results = await Promise.all(requests);
    var data = results[0];
    if (token !== homeDiscoverToken) return;
    homeDiscoverState.loggedIn = !!(data && data.loggedIn);
    homeDiscoverState.mode = data && data.mode || (homeDiscoverState.loggedIn ? 'member' : 'starter');
    homeDiscoverState.songs = homeDiscoverState.loggedIn ? (data && data.dailySongs || []).map(cloneSong) : [];
    homeDiscoverState.personalFm = homeDiscoverState.loggedIn ? (data && data.personalFm || []).map(cloneSong) : [];
    homeDiscoverState.playlists = homeDiscoverState.loggedIn ? (data && data.playlists || []) : [];
    homeDiscoverState.podcasts = homeDiscoverState.loggedIn ? (data && data.podcasts || []) : [];
    homeDiscoverState.qishuiFeed = [];
    homeDiscoverState.kugouGuess = kugouLoginStatus.loggedIn ? (results[1] && results[1].songs || []).map(cloneSong) : [];
    homeDiscoverState.qqDaily = qqLoginStatus.loggedIn ? (results[2] && results[2].songs || []).map(cloneSong) : [];
    homeDiscoverState.qqRadio = qqLoginStatus.loggedIn ? (results[3] && results[3].songs || []).map(cloneSong) : [];
    homeDiscoverState.updatedAt = Number(data && data.updatedAt) || Date.now();
    homeDiscoverState.loaded = true;
  } catch (e) {
    console.warn('home discover failed:', e);
    if (token === homeDiscoverToken) homeDiscoverState.error = 'DISCOVER_FAILED';
  } finally {
    if (token === homeDiscoverToken) {
      homeDiscoverState.loading = false;
      renderHomeDiscover();
    }
  }
}
function homeWeatherRadioUrl(opts) {
  opts = opts || {};
  var params = [];
  if (opts.lat != null && opts.lon != null) {
    params.push('lat=' + encodeURIComponent(opts.lat));
    params.push('lon=' + encodeURIComponent(opts.lon));
    params.push('city=' + encodeURIComponent(opts.city || '当前位置'));
  } else {
    params.push('city=' + encodeURIComponent(opts.city || homeWeatherRadioState.city || '上海'));
  }
  params.push('timezone=' + encodeURIComponent(opts.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto'));
  params.push('t=' + Date.now());
  return '/api/weather/radio?' + params.join('&');
}
async function loadHomeWeatherRadio(force, opts) {
  opts = opts || {};
  if (homeWeatherRadioState.loading && homeWeatherLoadPromise && opts.lat == null && opts.lon == null && !opts.city) {
    return homeWeatherLoadPromise;
  }
  if (homeWeatherRadioState.loading && !force) return homeWeatherRadioState;
  if (homeWeatherRadioState.loaded && !force && !opts.lat) return homeWeatherRadioState;
  var token = ++homeWeatherToken;
  homeWeatherRadioState.loading = true;
  homeWeatherRadioState.error = '';
  renderHomeDiscover();
  var loadPromise = (async function () {
    try {
      var data = await apiJson(homeWeatherRadioUrl(opts), { timeoutMs: 14000 });
      if (token !== homeWeatherToken) return homeWeatherRadioState;
      homeWeatherRadioState.weather = data && data.weather || null;
      homeWeatherRadioState.radio = data && data.radio || null;
      homeWeatherRadioState.loaded = true;
      homeWeatherRadioState.updatedAt = Date.now();
      if (homeWeatherRadioState.weather && homeWeatherRadioState.weather.location && homeWeatherRadioState.weather.location.name) {
        homeWeatherRadioState.city = homeWeatherRadioState.weather.location.name;
        localStorage.setItem(HOME_WEATHER_CITY_KEY, homeWeatherRadioState.city);
      } else if (opts.city) {
        homeWeatherRadioState.city = opts.city;
        localStorage.setItem(HOME_WEATHER_CITY_KEY, homeWeatherRadioState.city);
      }
    } catch (e) {
      console.warn('weather radio failed:', e);
      if (token === homeWeatherToken) homeWeatherRadioState.error = 'WEATHER_FAILED';
    } finally {
      if (token === homeWeatherToken) {
        homeWeatherRadioState.loading = false;
        renderHomeDiscover();
      }
    }
    return homeWeatherRadioState;
  })();
  homeWeatherLoadPromise = loadPromise;
  try {
    return await loadPromise;
  } finally {
    if (homeWeatherLoadPromise === loadPromise) homeWeatherLoadPromise = null;
  }
}
function scheduleHomeWeatherLoad(delay) {
  if (homeWeatherLoadTimer) return;
  homeWeatherLoadTimer = setTimeout(function () {
    homeWeatherLoadTimer = null;
    if (!emptyHomeActive) return;
    loadHomeWeatherRadio(false);
  }, delay || 760);
}
function weatherRadioContext() {
  var weather = homeWeatherRadioState.weather || {};
  var radio = homeWeatherRadioState.radio || {};
  return {
    type: 'weather-radio',
    provider: 'open-meteo',
    title: radio.title || '天气电台',
    location: weather.location && weather.location.name || homeWeatherRadioState.city || '',
    weather: weather.label || '',
    temperature: weather.temperature,
    mood: weather.mood && weather.mood.key || '',
  };
}
async function startWeatherRadio(opts) {
  opts = opts || {};
  if (weatherRadioStartBusy) return;
  weatherRadioStartBusy = true;
  try {
    if (!homeWeatherRadioState.loaded || !(homeWeatherRadioState.radio && homeWeatherRadioState.radio.songs && homeWeatherRadioState.radio.songs.length)) {
      showToast('正在生成天气电台');
      await loadHomeWeatherRadio(true);
    }
    var radio = homeWeatherRadioState.radio;
    if (!radio || !radio.songs || !radio.songs.length) {
      var seed = radio && radio.seedQueries && radio.seedQueries[0] || '雨天 R&B';
      showToast('天气队列暂时为空，先打开搜索');
      runHomeSearch(seed);
      return;
    }
    activeRadioContext = weatherRadioContext();
    playQueue = radio.songs.map(function (song) {
      var cloned = cloneSong(song);
      cloned.radioContext = activeRadioContext;
      return cloned;
    });
    currentIdx = 0;
    homeForcedOpen = false;
    if (!opts.preserveHomeState) homeSuppressed = false;
    setHomeControlsLocked(false);
    safeRenderQueuePanel('weather-radio-start');
    safeShelfRebuild('weather-radio-start', true);
    forcePlaybackControlsInteractive();
    try {
      await playQueueAt(0, { context: activeRadioContext });
    } catch (e) {
      console.warn('[WeatherRadioStartPlay]', e);
      showToast('天气电台已载入，播放启动失败');
    }
    forcePlaybackControlsInteractive();
    showToast((radio.title || '天气电台') + ' · ' + playQueue.length + ' 首');
  } finally {
    weatherRadioStartBusy = false;
  }
}
