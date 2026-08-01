// Windows v2.1.0 对齐: 本地每日收听聚合(rollup v2)——纯本地,不上报服务端(平台同步为上游 experimental 能力,Mac 不迁移)
var HOME_LISTEN_ROLLUP_V2_KEY = 'mineradio-listen-rollup-v2';
function emptyListenRollupV2() {
  return { version: 2, totalListenMs: 0, sessions: 0, daily: {}, updatedAt: 0 };
}
function loadListenRollupV2() {
  try {
    var raw = localStorage.getItem(HOME_LISTEN_ROLLUP_V2_KEY);
    if (!raw) return emptyListenRollupV2();
    var data = JSON.parse(raw);
    return {
      version: 2,
      totalListenMs: Math.max(0, Number(data.totalListenMs) || 0),
      sessions: Math.max(0, Number(data.sessions) || 0),
      daily: data.daily && typeof data.daily === 'object' ? data.daily : {},
      updatedAt: Number(data.updatedAt) || 0,
    };
  } catch (e) {
    return emptyListenRollupV2();
  }
}
function listenDayKey(timestamp) {
  var date = new Date(timestamp || Date.now());
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
function recordListenRollupV2(record) {
  try {
    var state = loadListenRollupV2();
    var listenMs = Math.max(0, Math.round(Number(record && record.listenMs) || 0));
    var dayKey = listenDayKey(record && record.playedAt);
    var day = state.daily[dayKey] && typeof state.daily[dayKey] === 'object'
      ? state.daily[dayKey]
      : { listenMs: 0, sessions: 0, completed: 0 };
    state.totalListenMs += listenMs;
    state.sessions += 1;
    day.listenMs = Math.max(0, Number(day.listenMs) || 0) + listenMs;
    day.sessions = Math.max(0, Number(day.sessions) || 0) + 1;
    day.completed = Math.max(0, Number(day.completed) || 0) + (record && record.completed ? 1 : 0);
    state.daily[dayKey] = day;
    state.updatedAt = Date.now();
    localStorage.setItem(HOME_LISTEN_ROLLUP_V2_KEY, JSON.stringify(state));
  } catch (e) { }
}
function loadListenStatsState() {
  try {
    var raw = localStorage.getItem(HOME_LISTEN_STATS_KEY);
    if (!raw) return { history: [], songs: {}, artists: {}, updatedAt: 0 };
    var data = JSON.parse(raw);
    return {
      history: Array.isArray(data.history) ? data.history.slice(0, 180) : [],
      songs: data.songs && typeof data.songs === 'object' ? data.songs : {},
      artists: data.artists && typeof data.artists === 'object' ? data.artists : {},
      updatedAt: Number(data.updatedAt) || 0,
    };
  } catch (e) {
    return { history: [], songs: {}, artists: {}, updatedAt: 0 };
  }
}
function saveListenStatsState() {
  try {
    listenStatsState.updatedAt = Date.now();
    localStorage.setItem(HOME_LISTEN_STATS_KEY, JSON.stringify(listenStatsState));
  } catch (e) { }
}
function listenSongSnapshot(song) {
  song = song || {};
  return {
    key: queueItemKey(song),
    id: song.id || '',
    mid: song.mid || song.songmid || '',
    mediaMid: song.mediaMid || song.media_mid || '',
    type: song.type || 'song',
    sourceKey: song.source || song.provider || '',
    name: song.name || song.title || '未知歌曲',
    artist: song.artist || '',
    cover: songCoverSrc(song, 220) || song.cover || '',
    source: songSourceLabel(song),
    provider: song.provider || song.source || song.type || '',
    duration: Number(song.duration) || 0,
  };
}
function beginListenSession(song, context) {
  if (!song) return;
  var snap = listenSongSnapshot(song);
  if (!snap.key) return;
  if (listenSession && listenSession.key !== snap.key) finalizeListenSession(false);
  listenSession = {
    key: snap.key,
    song: snap,
    context: context || activeRadioContext || null,
    startedAt: Date.now(),
    lastWallAt: Date.now(),
    lastAudioTime: audio && isFinite(audio.currentTime) ? audio.currentTime : 0,
    listenMs: 0,
    maxProgress: 0,
  };
}
function tickListenSessionSnapshot(session, force) {
  if (!session || !audio || !audio.duration || audio.paused) return;
  var now = Date.now();
  var audioTime = isFinite(audio.currentTime) ? audio.currentTime : 0;
  var deltaByAudio = Math.max(0, audioTime - (session.lastAudioTime || 0)) * 1000;
  var deltaByWall = Math.max(0, now - (session.lastWallAt || now));
  var delta = deltaByAudio > 0 ? Math.min(deltaByAudio, deltaByWall || deltaByAudio, 4200) : 0;
  if (force && delta <= 0) delta = Math.min(deltaByWall, 1500);
  if (delta > 0 && delta < 8000) session.listenMs += delta;
  session.lastWallAt = now;
  session.lastAudioTime = audioTime;
  session.maxProgress = Math.max(session.maxProgress || 0, audio.duration ? audioTime / audio.duration : 0);
}
function updateListenStatsTick(force) {
  if (!audio || !audio.duration || audio.paused) return;
  var song = currentCoverSong();
  if (!song) return;
  var key = queueItemKey(song);
  if (!listenSession || listenSession.key !== key) beginListenSession(song, activeRadioContext);
  if (!listenSession) return;
  tickListenSessionSnapshot(listenSession, force);
}
function finalizeListenSession(completed) {
  if (!listenSession) return;
  var session = listenSession;
  tickListenSessionSnapshot(session, true);
  listenSession = null;
  var effective = completed || session.listenMs >= 45000 || session.maxProgress >= 0.5 || (!audio || !audio.duration ? session.listenMs >= 30000 : false);
  if (!effective) return;
  var now = Date.now();
  var snap = session.song || {};
  var record = {
    key: session.key,
    id: snap.id || '',
    mid: snap.mid || '',
    mediaMid: snap.mediaMid || '',
    type: snap.type || 'song',
    sourceKey: snap.sourceKey || '',
    name: snap.name || '未知歌曲',
    artist: snap.artist || '',
    cover: snap.cover || '',
    source: snap.source || '',
    playedAt: now,
    listenMs: Math.round(session.listenMs),
    completed: !!completed,
    context: session.context || null,
  };
  listenStatsState.history = [record].concat((listenStatsState.history || []).filter(function (item) { return item && item.key !== record.key; })).slice(0, 180);
  var songStat = listenStatsState.songs[record.key] || { key: record.key, name: record.name, artist: record.artist, cover: record.cover, source: record.source, plays: 0, listenMs: 0, completed: 0, lastPlayedAt: 0 };
  songStat.name = record.name;
  songStat.artist = record.artist;
  songStat.cover = record.cover || songStat.cover || '';
  songStat.source = record.source || songStat.source || '';
  songStat.plays += 1;
  songStat.listenMs += record.listenMs;
  songStat.completed += completed ? 1 : 0;
  songStat.lastPlayedAt = now;
  listenStatsState.songs[record.key] = songStat;
  String(record.artist || '').split(/\s*\/\s*|\s*,\s*|、|&/).forEach(function (name) {
    name = name.trim();
    if (!name) return;
    var artistStat = listenStatsState.artists[name] || { name: name, plays: 0, listenMs: 0, lastPlayedAt: 0 };
    artistStat.plays += 1;
    artistStat.listenMs += record.listenMs;
    artistStat.lastPlayedAt = now;
    listenStatsState.artists[name] = artistStat;
  });
  saveListenStatsState();
  recordListenRollupV2(record);   // Windows v2.1.0: 本地每日聚合(纯本地,不上报服务端)
  if (emptyHomeActive) renderHomeDiscover();
}
function mostPlayedSong() {
  var list = Object.keys(listenStatsState.songs || {}).map(function (key) { return listenStatsState.songs[key]; });
  list.sort(function (a, b) { return (b.plays - a.plays) || (b.listenMs - a.listenMs) || (b.lastPlayedAt - a.lastPlayedAt); });
  return list[0] || null;
}
function topListenArtist() {
  var list = Object.keys(listenStatsState.artists || {}).map(function (key) { return listenStatsState.artists[key]; });
  list.sort(function (a, b) { return (b.plays - a.plays) || (b.listenMs - a.listenMs) || (b.lastPlayedAt - a.lastPlayedAt); });
  return list[0] || null;
}
function homeListenSummary() {
  var recent = (listenStatsState.history || [])[0] || null;
  var topSong = mostPlayedSong();
  var topArtist = topListenArtist();
  var totalPlays = Object.keys(listenStatsState.songs || {}).reduce(function (sum, key) { return sum + ((listenStatsState.songs[key] && listenStatsState.songs[key].plays) || 0); }, 0);
  return { recent: recent, topSong: topSong, topArtist: topArtist, totalPlays: totalPlays };
}
