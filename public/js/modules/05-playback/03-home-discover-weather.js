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
function homeRecentPlays() {
  return (listenStatsState.history || []).filter(function (item) { return item && (item.id || item.mid || item.key); }).slice(0, 30);
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
      '<div class="home-recent-thumb" style="' + (cover ? 'background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)' : '') + '"></div>' +
      '<div class="home-recent-meta">' +
        '<div class="home-recent-name">' + escHtml(item.name || '未知歌曲') + '</div>' +
        '<div class="home-recent-artist">' + escHtml(item.artist || item.source || '') + '</div>' +
      '</div>' +
    '</button>';
  }).join('');
  listEl._recentPlays = plays;
}
function playHomeRecentCard(index) {
  var listEl = document.getElementById('home-recent-list');
  var record = listEl && listEl._recentPlays && listEl._recentPlays[index];
  if (!record) return;
  playHomeRecent(record);
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
    setHomeArt('home-weather-art', '', 280);
    setHomeArt('home-daily-art', '', 280);
    setHomeArt('home-private-art', '', 280);
    setHomeArt('home-continue-art', summary.recent && summary.recent.cover, 280);
    setHomeArt('home-profile-art', summary.topSong && summary.topSong.cover || summary.recent && summary.recent.cover, 280);
    setHomeArt('home-library-art', '', 280);
  } else {
    if (dailyTitle) dailyTitle.textContent = daily ? daily.name : '每日推荐';
    if (dailySub) dailySub.textContent = daily ? ((daily.artist || songSourceLabel(daily) || '今日歌曲') + ' · 点击播放今日队列') : '同步你的今日歌曲';
    if (privateTitle) privateTitle.textContent = privateSong ? privateSong.name : '私人雷达';
    if (privateSub) privateSub.textContent = privateSong
      ? ((privateSong.artist || songSourceLabel(privateSong) || '私人 FM') + (fmSong ? ' · 私人雷达 FM' : ' · 推荐歌曲'))
      : (homeDiscoverState.personalFm.length ? (homeDiscoverState.personalFm.length + ' 首 · 网易云私人 FM') : (homeDiscoverState.songs.length + ' 首 · 根据今日推荐与常听偏好'));
    if (libTitle) libTitle.textContent = cardSongC ? cardSongC.name : (summary.topArtist ? summary.topArtist.name : '更多歌曲');
    if (libSub) libSub.textContent = cardSongC ? (cardSongC.artist || songSourceLabel(cardSongC) || '推荐歌曲') : (summary.topArtist ? ('歌手偏好 · ' + summary.topArtist.plays + ' 次') : '播放几首后生成你的偏好');
    setHomeArt('home-weather-art', (userPlaylists[0] && userPlaylists[0].cover) || (playlistItem && playlistItem.cover) || daily && daily.cover, 280);
    setHomeArt('home-daily-art', daily && daily.cover, 280);
    setHomeArt('home-private-art', privateSong && privateSong.cover || daily && daily.cover || summary.recent && summary.recent.cover || playlistItem && playlistItem.cover, 280);
    setHomeArt('home-continue-art', summary.recent && summary.recent.cover || playlistItem && playlistItem.cover, 280);
    setHomeArt('home-profile-art', summary.topSong && summary.topSong.cover || podcastItem && podcastItem.cover, 280);
    setHomeArt('home-library-art', cardSongC && cardSongC.cover || summary.topSong && summary.topSong.cover || summary.recent && summary.recent.cover || podcastItem && podcastItem.cover, 280);
  }
  renderHomeTiles();
  renderHomeRecentBlock();
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
    requests.push(qishuiLoginStatus.loggedIn ? apiJson('/api/qishui/feed?limit=12&t=' + Date.now()).catch(function () { return null; }) : Promise.resolve(null));
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
    homeDiscoverState.qishuiFeed = qishuiLoginStatus.loggedIn ? (results[1] && results[1].songs || []).map(cloneSong) : [];
    homeDiscoverState.kugouGuess = kugouLoginStatus.loggedIn ? (results[2] && results[2].songs || []).map(cloneSong) : [];
    homeDiscoverState.qqDaily = qqLoginStatus.loggedIn ? (results[3] && results[3].songs || []).map(cloneSong) : [];
    homeDiscoverState.qqRadio = qqLoginStatus.loggedIn ? (results[4] && results[4].songs || []).map(cloneSong) : [];
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
