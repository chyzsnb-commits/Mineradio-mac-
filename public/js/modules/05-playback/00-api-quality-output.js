// ============================================================
async function apiJson(url, opts) {
  opts = opts || {};
  var timeoutMs = Number(opts.timeoutMs) || 0;
  var fetchOpts = Object.assign({}, opts);
  delete fetchOpts.timeoutMs;
  var timer = null;
  if (timeoutMs && window.AbortController && !fetchOpts.signal) {
    var controller = new AbortController();
    fetchOpts.signal = controller.signal;
    timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  }
  try {
    var res = await fetch(url, fetchOpts);
    return res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function escHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function normalizePlaybackQuality(value) {
  value = String(value || '').toLowerCase();
  if (value === 'jymaster' || value === 'master' || value === 'svip') return 'jymaster';
  if (value === 'hires' || value === 'hi-res' || value === 'highres' || value === 'highest') return 'hires';
  if (value === 'lossless' || value === 'flac' || value === 'sq') return 'lossless';
  if (value === 'exhigh' || value === 'high' || value === '320k' || value === 'hq') return 'exhigh';
  if (value === 'standard' || value === 'normal' || value === 'std') return 'standard';
  return 'hires';
}
function normalizePlaybackProvider(provider) {
  if (provider === 'qq') return 'qq';
  if (provider === 'kugou') return 'kugou';
  if (provider === 'qishui') return 'qishui';
  if (provider === 'spotify') return 'spotify';
  if (provider === 'ytmusic') return 'ytmusic';
  return 'netease';
}
function isPlaybackProviderDisabled(provider) {
  provider = String(provider || '').trim().toLowerCase();
  if (!provider) return false;
  if (typeof MINERADIO_DISABLED_PROVIDERS !== 'undefined' && Array.isArray(MINERADIO_DISABLED_PROVIDERS)) {
    return MINERADIO_DISABLED_PROVIDERS.indexOf(provider) >= 0;
  }
  return provider === 'qishui' && typeof MINERADIO_QISHUI_ENABLED !== 'undefined' && !MINERADIO_QISHUI_ENABLED;
}
function playbackProviderUnavailablePayload(provider) {
  provider = normalizePlaybackProvider(provider);
  var label = provider === 'qishui' ? '汽水音乐' : (provider === 'spotify' ? 'Spotify' : (provider === 'qq' ? 'QQ 音乐' : (provider === 'kugou' ? '酷狗音乐' : '该音源')));
  return {
    url: '',
    playable: false,
    provider: provider,
    error: 'PROVIDER_DISABLED',
    message: label + ' 已在公开版移除，无法播放该曲目',
    category: 'provider_disabled',
  };
}
function normalizePlaybackQualityForProvider(value, provider) {
  provider = normalizePlaybackProvider(provider);
  var q = normalizePlaybackQuality(value);
  if (provider === 'qq' && q === 'jymaster') return 'hires';
  return q;
}
function playbackQualityOptions(provider) {
  provider = normalizePlaybackProvider(provider);
  return PLAYBACK_QUALITY_OPTIONS[provider] || PLAYBACK_QUALITY_OPTIONS.netease;
}
function currentPlaybackQualityProvider() {
  var song = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  return normalizePlaybackProvider(songProviderKey(song));
}
function getProviderPlaybackQuality(provider) {
  provider = normalizePlaybackProvider(provider);
  var prefs = playbackQualityPrefs || {};
  return normalizePlaybackQualityForProvider(prefs[provider] || PLAYBACK_QUALITY_DEFAULTS[provider], provider);
}
function setProviderPlaybackQuality(provider, value) {
  provider = normalizePlaybackProvider(provider);
  if (!playbackQualityPrefs || typeof playbackQualityPrefs !== 'object') playbackQualityPrefs = {};
  playbackQualityPrefs[provider] = normalizePlaybackQualityForProvider(value, provider);
  playbackQuality = playbackQualityPrefs[provider];
  savePlaybackQualityPreference();
}
function getPlaybackQualityForSong(song) {
  var provider = normalizePlaybackProvider(songProviderKey(song));
  return getProviderPlaybackQuality(provider);
}
function playbackQualityLabel(value, provider) {
  provider = normalizePlaybackProvider(provider || currentPlaybackQualityProvider());
  value = normalizePlaybackQualityForProvider(value, provider);
  if (provider === 'spotify') return 'Spotify 匹配源';
  if (provider === 'qishui') return '汽水音质';
  if (provider === 'qq') {
    if (value === 'hires') return 'Hi-Res FLAC';
    if (value === 'lossless') return '无损 FLAC';
    if (value === 'exhigh') return '320k MP3';
    if (value === 'standard') return '128k MP3';
    return '无损 FLAC';
  }
  if (provider === 'kugou') {
    if (value === 'hires') return '酷狗 Hi-Res';
    if (value === 'lossless') return '酷狗无损';
    if (value === 'exhigh') return '酷狗 320k';
    if (value === 'standard') return '酷狗 128k';
    return '酷狗无损';
  }
  if (value === 'jymaster') return '超清母带';
  if (value === 'hires') return '高清臻音';
  if (value === 'lossless') return '无损';
  if (value === 'exhigh') return '极高';
  if (value === 'standard') return '标准';
  return '高清臻音';
}
function playbackQualityShortLabel(value, provider) {
  provider = normalizePlaybackProvider(provider || currentPlaybackQualityProvider());
  value = normalizePlaybackQualityForProvider(value, provider);
  if (provider === 'spotify') return 'SP';
  if (provider === 'qishui') return 'QS';
  if (provider === 'qq') {
    if (value === 'hires') return 'QQ Hires';
    if (value === 'lossless') return 'QQ SQ';
    if (value === 'exhigh') return 'QQ 320';
    if (value === 'standard') return 'QQ 128';
    return 'QQ SQ';
  }
  if (provider === 'kugou') {
    if (value === 'hires') return 'KG Hires';
    if (value === 'lossless') return 'KG SQ';
    if (value === 'exhigh') return 'KG 320';
    if (value === 'standard') return 'KG 128';
    return 'KG SQ';
  }
  if (value === 'jymaster') return '母带';
  if (value === 'hires') return '臻音';
  if (value === 'lossless') return 'SQ';
  if (value === 'exhigh') return 'HQ';
  if (value === 'standard') return 'STD';
  return '臻音';
}
function playbackQualityRank(value, provider) {
  value = normalizePlaybackQualityForProvider(value, provider);
  if (value === 'jymaster') return 5;
  if (value === 'hires') return 4;
  if (value === 'lossless') return 3;
  if (value === 'exhigh') return 2;
  if (value === 'standard') return 1;
  return 4;
}
function playbackQualityWasDowngraded(requested, resolved, provider) {
  return playbackQualityRank(resolved, provider) < playbackQualityRank(requested, provider);
}
function playbackQualityTrackKey(song, provider) {
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  song = song || {};
  var id = song.id || song.mid || song.songmid || song.hash || song.fileHash || song.audioHash || song.providerSongId || '';
  var media = song.mediaMid || song.media_mid || song.albumAudioId || song.album_audio_id || song.mixSongId || '';
  if (!id) id = [song.name || song.title || '', song.artist || '', song.album || ''].join('|');
  return provider + ':' + String(id || '').trim() + ':' + String(media || '').trim();
}
function playbackQualityRuntimeCapForSong(song, provider) {
  if (!song) return null;
  var key = playbackQualityTrackKey(song, provider);
  return key && playbackQualityRuntimeCaps ? playbackQualityRuntimeCaps[key] || null : null;
}
function playbackQualityCapValue(song, provider) {
  var cap = playbackQualityRuntimeCapForSong(song, provider);
  return cap && cap.ceiling ? normalizePlaybackQualityForProvider(cap.ceiling, provider) : '';
}
function playbackQualityAboveCap(value, provider, capValue) {
  if (!capValue) return false;
  capValue = normalizePlaybackQualityForProvider(capValue, provider);
  return playbackQualityRank(value, provider) > playbackQualityRank(capValue, provider);
}
function effectivePlaybackQualityForSong(song, provider, requested) {
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  var q = normalizePlaybackQualityForProvider(requested || getProviderPlaybackQuality(provider), provider);
  var cap = playbackQualityCapValue(song, provider);
  return playbackQualityAboveCap(q, provider, cap) ? cap : q;
}
function markPlaybackQualityRuntimeCap(song, provider, ceiling, reason) {
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  if (!song || !ceiling) return false;
  ceiling = normalizePlaybackQualityForProvider(ceiling, provider);
  var key = playbackQualityTrackKey(song, provider);
  if (!key) return false;
  var prev = playbackQualityRuntimeCaps && playbackQualityRuntimeCaps[key];
  if (prev && playbackQualityRank(prev.ceiling, provider) <= playbackQualityRank(ceiling, provider)) return false;
  playbackQualityRuntimeCaps[key] = {
    provider: provider,
    ceiling: ceiling,
    reason: reason || '',
    at: Date.now()
  };
  updatePlaybackQualityUi();
  return true;
}
function playbackBitrateLabel(br) {
  br = Number(br) || 0;
  if (!br) return '';
  if (br >= 1000000) return (br / 1000000).toFixed(br >= 2000000 ? 1 : 2).replace(/\.0+$/, '') + ' Mbps';
  return Math.round(br / 1000) + ' kbps';
}
function playbackResolvedQualityText(data, provider) {
  data = data || {};
  provider = normalizePlaybackProvider(provider || data.provider || currentPlaybackQualityProvider());
  var label = provider === 'qq' && data.quality
    ? String(data.quality)
    : playbackQualityLabel(data.level || getProviderPlaybackQuality(provider), provider);
  var br = playbackBitrateLabel(data.br);
  return br ? (label + ' · ' + br) : label;
}
function readPlaybackQualityPreference() {
  var fallback = {
    netease: PLAYBACK_QUALITY_DEFAULTS.netease,
    qq: PLAYBACK_QUALITY_DEFAULTS.qq,
    kugou: PLAYBACK_QUALITY_DEFAULTS.kugou,
    qishui: PLAYBACK_QUALITY_DEFAULTS.qishui,
    spotify: PLAYBACK_QUALITY_DEFAULTS.spotify
  };
  try {
    var raw = localStorage.getItem(PLAYBACK_QUALITY_STORE_KEY) || '';
    if (!raw) return fallback;
    if (raw.trim().charAt(0) !== '{') {
      var legacy = normalizePlaybackQuality(raw);
      return {
        netease: normalizePlaybackQualityForProvider(legacy, 'netease'),
        qq: normalizePlaybackQualityForProvider(legacy, 'qq'),
        kugou: normalizePlaybackQualityForProvider(legacy, 'kugou'),
        qishui: normalizePlaybackQualityForProvider(fallback.qishui, 'qishui'),
        spotify: normalizePlaybackQualityForProvider(fallback.spotify, 'spotify')
      };
    }
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      netease: normalizePlaybackQualityForProvider(parsed.netease || fallback.netease, 'netease'),
      qq: normalizePlaybackQualityForProvider(parsed.qq || fallback.qq, 'qq'),
      kugou: normalizePlaybackQualityForProvider(parsed.kugou || fallback.kugou || 'lossless', 'kugou'),
      qishui: normalizePlaybackQualityForProvider(parsed.qishui || fallback.qishui || 'standard', 'qishui'),
      spotify: normalizePlaybackQualityForProvider(parsed.spotify || fallback.spotify || 'standard', 'spotify')
    };
  } catch (e) {
    return fallback;
  }
}
function savePlaybackQualityPreference() {
  try { localStorage.setItem(PLAYBACK_QUALITY_STORE_KEY, JSON.stringify(playbackQualityPrefs || {})); } catch (e) { }
}
function updatePlaybackQualityUi() {
  var provider = currentPlaybackQualityProvider();
  var currentSong = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  var currentQuality = getProviderPlaybackQuality(provider);
  var runtimeCapQuality = playbackQualityCapValue(currentSong, provider);
  var effectiveQuality = effectivePlaybackQualityForSong(currentSong, provider, currentQuality);
  playbackQuality = currentQuality;
  var label = document.getElementById('quality-btn-label');
  var btn = document.getElementById('quality-btn');
  var list = document.getElementById('quality-option-list');
  var wrap = document.getElementById('quality-control');
  var isSwitching = typeof playbackQualitySwitchState !== 'undefined' && !!playbackQualitySwitchState.running;
  var canUseSvip = provider === 'netease' && hasProviderSvip('netease', loginStatus);
  var displayQuality = provider === 'netease' && effectiveQuality === 'jymaster' && !canUseSvip ? 'hires' : effectiveQuality;
  // 胶囊显示"实际下发"的音质:选 Hi-Res 但只给了 320 时不再假装 Hi-Res
  var resolvedLevel = window.__playbackResolvedLevel ? normalizePlaybackQualityForProvider(window.__playbackResolvedLevel, provider) : '';
  var actualQuality = (resolvedLevel && playing && resolvedLevel !== displayQuality) ? resolvedLevel : displayQuality;
  if (label) label.textContent = currentSong ? playbackQualityShortLabel(actualQuality, provider) : '音质';
  if (wrap) {
    wrap.classList.toggle('is-loading', isSwitching);
    wrap.classList.toggle('is-unavailable', !currentSong);
  }
  if (btn) {
    btn.disabled = !currentSong;
    btn.setAttribute('aria-busy', isSwitching ? 'true' : 'false');
    btn.setAttribute('aria-expanded', wrap && wrap.classList.contains('open') ? 'true' : 'false');
  }
  var qualityProviderTitle = provider === 'spotify' ? 'Spotify 匹配源: ' : (provider === 'qishui' ? '汽水音质: ' : (provider === 'qq' ? 'QQ 音质: ' : (provider === 'kugou' ? '酷狗音质: ' : '网易云音质: ')));
  if (btn) btn.title = !currentSong ? '播放歌曲后可选择音质' : qualityProviderTitle + playbackQualityLabel(displayQuality, provider) +
    (actualQuality !== displayQuality ? ' · 实际播放 ' + playbackQualityLabel(actualQuality, provider) : '') +
    (provider === 'netease' && currentQuality === 'jymaster' && !canUseSvip ? ' · 超清母带需网易云 SVIP' : '');
  if (btn && runtimeCapQuality) btn.title += ' | 当前歌曲最高: ' + playbackQualityLabel(runtimeCapQuality, provider);
  if (list) {
    list.innerHTML = !currentSong
      ? '<span class="quality-unavailable-note">播放歌曲后可选择可用音质</span>'
      : playbackQualityOptions(provider).map(function (item) {
      var capLocked = playbackQualityAboveCap(item.key, provider, runtimeCapQuality);
      var locked = !!(item.svip && !canUseSvip) || capLocked;
      var selected = normalizePlaybackQualityForProvider(item.key, provider) === displayQuality;
      return '<button class="quality-option' + (selected ? ' active' : '') + (item.svip ? ' svip-only' : '') + (capLocked ? ' cap-locked' : '') + (locked ? ' locked' : '') + '" data-quality="' + item.key + '" data-svip="' + (item.svip ? '1' : '0') + '" aria-current="' + (selected ? 'true' : 'false') + '" ' + (locked ? 'disabled ' : '') + 'onclick="setPlaybackQuality(\'' + item.key + '\')"><span>' + escHtml(item.title) + '</span><small>' + escHtml(capLocked ? ('当前最高 ' + playbackQualityLabel(runtimeCapQuality, provider)) : item.sub) + '</small></button>';
    }).join('');
  }
  document.querySelectorAll('.quality-option').forEach(function (option) {
    var q = normalizePlaybackQualityForProvider(option.dataset.quality, provider);
    var capLocked = playbackQualityAboveCap(q, provider, runtimeCapQuality);
    var locked = (option.dataset.svip === '1' && !canUseSvip) || capLocked;
    option.classList.toggle('active', q === displayQuality);
    option.classList.toggle('locked', locked);
    option.classList.toggle('cap-locked', capLocked);
    option.setAttribute('aria-current', q === displayQuality ? 'true' : 'false');
    option.disabled = locked;
    // 锁因分开:曲目上限显示真实原因;只有网易云 SVIP 档(jymaster)才提网易云,别的平台不背这口锅
    option.title = capLocked
      ? ('当前歌曲最高: ' + playbackQualityLabel(runtimeCapQuality, provider))
      : (locked ? '需要网易云 SVIP 账号' : playbackQualityLabel(q, provider));
  });
}
function setPlaybackQuality(value) {
  var provider = currentPlaybackQualityProvider();
  var currentSong = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  var next = normalizePlaybackQualityForProvider(value, provider);
  var cap = playbackQualityCapValue(currentSong, provider);
  if (playbackQualityAboveCap(next, provider, cap)) {
    showSourceFallbackNotice('音质已锁定上限', '当前歌曲最高可播 ' + playbackQualityLabel(cap, provider) + '，更高档位已禁用。');
    updatePlaybackQualityUi();
    return;
  }
  if (provider === 'netease' && next === 'jymaster' && !hasProviderSvip('netease', loginStatus)) {
    showToast(hasPlatformLogin('netease') ? '超清母带需要网易云 SVIP' : '登录网易云 SVIP 后可用超清母带');
    if (!hasPlatformLogin('netease')) openProviderLogin('netease');
    return;
  }
  setProviderPlaybackQuality(provider, next);
  updatePlaybackQualityUi();
  var wrap = document.getElementById('quality-control');
  if (wrap) wrap.classList.remove('open');
  applyPlaybackQualityToCurrentTrack(next, provider);
}
function canReloadCurrentTrackForQuality() {
  if (currentIdx < 0 || currentIdx >= playQueue.length) return false;
  if (!audio || !audio.src || audio.paused || audio.ended) return false;
  var song = playQueue[currentIdx];
  if (!song || song.type === 'local' || song.source === 'local') return false;
  return songProviderKey(song) === 'netease' || songProviderKey(song) === 'qq' || songProviderKey(song) === 'kugou' || songProviderKey(song) === 'qishui';
}
var playbackQualitySwitchState = {
  running: false,
  pending: null,
  active: null,
  promise: null,
  serial: 0
};
function playbackQualitySwitchSongKey(song) {
  if (!song) return '';
  if (typeof queueItemKey === 'function') return queueItemKey(song);
  return playbackQualityTrackKey(song, songProviderKey(song));
}
function playbackQualitySwitchTargetsCurrentSong(request) {
  if (!request || request.index !== currentIdx || currentIdx < 0 || currentIdx >= playQueue.length) return false;
  if (request.trackToken !== trackSwitchToken) return false;
  var song = playQueue[currentIdx];
  return !!(song && playbackQualitySwitchSongKey(song) === request.songKey && normalizePlaybackProvider(songProviderKey(song)) === request.provider);
}
function playbackQualityStreamUrl(song, provider, requestedQuality) {
  var qualityParam = '&quality=' + encodeURIComponent(requestedQuality);
  if (provider === 'qq') {
    var evidence = typeof qqPlaybackEvidenceQuery === 'function'
      ? qqPlaybackEvidenceQuery(song)
      : '&vipRequired=' + encodeURIComponent(song && (song.vipRequired || song.needVip || song.onlyVipPlayable) ? '1' : '');
    return '/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') +
      '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') + evidence + qualityParam;
  }
  if (provider === 'kugou') {
    return '/api/kugou/song/url?hash=' + encodeURIComponent(song.hash || song.fileHash || song.audioHash || song.id || '') +
      '&albumId=' + encodeURIComponent(song.albumId || song.album_id || '') +
      '&albumAudioId=' + encodeURIComponent(song.albumAudioId || song.album_audio_id || song.mixSongId || '') +
      '&mixSongId=' + encodeURIComponent(song.mixSongId || '') +
      '&hqHash=' + encodeURIComponent(song.hqHash || song.hq_hash || '') +
      '&sqHash=' + encodeURIComponent(song.sqHash || song.sq_hash || '') +
      '&resHash=' + encodeURIComponent(song.resHash || song.res_hash || '') +
      '&vipRequired=' + encodeURIComponent(song.vipRequired || song.needVip || song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
      '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
      '&fee=' + encodeURIComponent(song.fee || song.Fee || '') + qualityParam;
  }
  if (provider === 'qishui') {
    return '/api/qishui/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || '') + qualityParam;
  }
  return '/api/song/url?id=' + encodeURIComponent(song.id || '') + qualityParam;
}
async function resolvePlaybackQualityStream(request) {
  var song = playQueue[request.index];
  var requestedQuality = normalizePlaybackQualityForProvider(request.quality, request.provider);
  var runtimeCap = playbackQualityCapValue(song, request.provider);
  if (playbackQualityAboveCap(requestedQuality, request.provider, runtimeCap)) requestedQuality = runtimeCap;
  var candidates = [requestedQuality];
  var tried = [];
  var lastData = null;
  while (candidates.length) {
    var candidate = normalizePlaybackQualityForProvider(candidates.shift(), request.provider);
    if (tried.indexOf(candidate) >= 0) continue;
    tried.push(candidate);
    lastData = await apiJson(playbackQualityStreamUrl(song, request.provider, candidate), { timeoutMs: 12000 });
    if (!playbackQualitySwitchTargetsCurrentSong(request) || request.serial !== playbackQualitySwitchState.serial) {
      return { cancelled: true };
    }
    if (lastData && lastData.url) {
      return {
        data: lastData,
        requestedQuality: requestedQuality,
        resolvedRequestQuality: candidate,
        usedCompatibilityFallback: candidate !== requestedQuality
      };
    }
    if (request.provider === 'qq' && !song.vipRequired && typeof qqPlaybackRetryQualities === 'function') {
      qqPlaybackRetryQualities(candidate, lastData && lastData.level).forEach(function (quality) {
        quality = normalizePlaybackQualityForProvider(quality, request.provider);
        if (tried.indexOf(quality) < 0 && candidates.indexOf(quality) < 0) candidates.push(quality);
      });
    }
  }
  return { data: lastData, requestedQuality: requestedQuality };
}
async function restorePlaybackQualityAudio(media, src, resumeAt, wasPlaying) {
  if (!media || !src) return false;
  try {
    media.pause();
    media.src = src;
    bindPlaybackProgressEvents(media);
    applyVolumeToAudio();
    await applyAudioOutputDevice(media);
    scheduleAudioResumePosition(media, resumeAt, trackSwitchToken);
    media.load();
    if (wasPlaying) return !!(await playAudio({ silent: true, trackSwitch: true, fade: false }));
    updatePlaybackProgressUi();
    return true;
  } catch (restoreErr) {
    console.warn('[QualitySwitchRestore]', restoreErr);
    return false;
  }
}
async function switchPlaybackQualityInPlace(request) {
  if (!playbackQualitySwitchTargetsCurrentSong(request) || !audio || !audio.src) return { cancelled: true };
  var media = audio;
  var oldSrc = media.currentSrc || media.src || '';
  var oldTime = isFinite(media.currentTime) ? media.currentTime : Math.max(0, Number(request.resumeAt) || 0);
  var wasPlaying = !media.paused && !media.ended;
  var resolved = await resolvePlaybackQualityStream(request);
  if (resolved.cancelled || !playbackQualitySwitchTargetsCurrentSong(request)) return { cancelled: true };
  if (!resolved.data || !resolved.data.url) {
    return { ok: false, requestedQuality: resolved.requestedQuality, data: resolved.data };
  }
  if (request.serial !== playbackQualitySwitchState.serial) return { cancelled: true };
  var proxyAudioUrl = '/api/audio?url=' + encodeURIComponent(resolved.data.url);
  try {
    oldTime = isFinite(media.currentTime) ? media.currentTime : oldTime;
    media.pause();
    media.autoplay = true;
    media.preload = 'auto';
    if (typeof applyPlaybackSpeedToAudio === 'function') applyPlaybackSpeedToAudio();
    resetPlaybackAudioGraphForSourceSwitch('quality-switch');
    bindPlaybackProgressEvents(media);
    applyVolumeToAudio();
    await applyAudioOutputDevice(media);
    if (!playbackQualitySwitchTargetsCurrentSong(request) || media !== audio) {
      await restorePlaybackQualityAudio(media, oldSrc, oldTime, wasPlaying);
      return { cancelled: true };
    }
    media.src = proxyAudioUrl;
    scheduleAudioResumePosition(media, oldTime, trackSwitchToken);
    media.load();
    var playbackStarted = wasPlaying
      ? await playAudio({ silent: true, trackSwitch: true, fade: false })
      : true;
    if (!playbackStarted) throw new Error('quality stream did not start');
    window.__playbackResolvedLevel = resolved.data.level || resolved.resolvedRequestQuality || '';
    var song = playQueue[request.index];
    song.playbackLevel = resolved.data.level || song.playbackLevel || '';
    song.playbackSource = resolved.data.source || resolved.data.provider || song.playbackSource || '';
    var downgraded = playbackQualityWasDowngraded(resolved.requestedQuality, resolved.data.level || resolved.resolvedRequestQuality, request.provider);
    if (downgraded) {
      markPlaybackQualityRuntimeCap(song, request.provider, resolved.data.level || resolved.resolvedRequestQuality, 'quality-switch-resolved-lower');
    }
    updatePlaybackQualityUi();
    updatePlaybackProgressUi();
    if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume('quality-switch-in-place');
    return {
      ok: true,
      requestedQuality: resolved.requestedQuality,
      data: resolved.data,
      downgraded: downgraded,
      usedCompatibilityFallback: resolved.usedCompatibilityFallback
    };
  } catch (err) {
    console.warn('[QualitySwitchInPlace]', err);
    var restored = await restorePlaybackQualityAudio(media, oldSrc, oldTime, wasPlaying);
    return { ok: false, error: err, restored: restored, requestedQuality: resolved.requestedQuality, data: resolved.data };
  }
}
function showPlaybackQualitySwitchResult(request, result) {
  if (!result || result.cancelled || request.serial !== playbackQualitySwitchState.serial) return;
  if (!result.ok) {
    showSourceFallbackNotice(
      '音质切换失败',
      result.restored === false ? '新音质无法启动，请重新选择当前歌曲。' : '新音质不可用，已继续播放切换前的音频。',
      { kind: 'quality-switch', replace: true }
    );
    return;
  }
  var actual = playbackResolvedQualityText(result.data, request.provider);
  var title = result.downgraded || result.usedCompatibilityFallback
    ? ((request.provider === 'qq' ? 'QQ' : (request.provider === 'kugou' ? '酷狗' : '网易云')) + ' 音质自动兼容')
    : '音质已切换';
  var body = result.downgraded || result.usedCompatibilityFallback
    ? ('请求 ' + playbackQualityLabel(result.requestedQuality, request.provider) + '，实际播放 ' + actual + '。')
    : ('实际播放: ' + actual + '。');
  showSourceFallbackNotice(title, body, { kind: 'quality-switch', replace: true });
}
async function drainPlaybackQualitySwitches() {
  while (playbackQualitySwitchState.pending) {
    var request = playbackQualitySwitchState.pending;
    playbackQualitySwitchState.pending = null;
    playbackQualitySwitchState.active = request;
    var result;
    try {
      result = await switchPlaybackQualityInPlace(request);
    } catch (err) {
      console.warn('[QualitySwitchDrain]', err);
      result = { ok: false, error: err };
    }
    playbackQualitySwitchState.active = null;
    if (!playbackQualitySwitchState.pending) showPlaybackQualitySwitchResult(request, result);
  }
  return true;
}
function applyPlaybackQualityToCurrentTrack(nextQuality, provider) {
  var song = currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  provider = normalizePlaybackProvider(provider || songProviderKey(song));
  var label = playbackQualityLabel(nextQuality || getProviderPlaybackQuality(provider), provider);
  var songKey = playbackQualitySwitchSongKey(song);
  var continuingCurrentSwitch = !!(
    playbackQualitySwitchState.running &&
    songKey &&
    (
      (playbackQualitySwitchState.pending && playbackQualitySwitchState.pending.songKey === songKey) ||
      (playbackQualitySwitchState.active && playbackQualitySwitchState.active.songKey === songKey)
    )
  );
  if (!canReloadCurrentTrackForQuality() && !continuingCurrentSwitch) {
    showToast('音质偏好: ' + label + ' · 下次播放生效');
    return;
  }
  var resumeAt = audio && isFinite(audio.currentTime) ? audio.currentTime : 0;
  showToast('正在切换音质: ' + label);
  playbackQualitySwitchState.pending = {
    serial: ++playbackQualitySwitchState.serial,
    index: currentIdx,
    trackToken: trackSwitchToken,
    songKey: songKey,
    provider: provider,
    quality: nextQuality || getProviderPlaybackQuality(provider),
    resumeAt: resumeAt
  };
  if (playbackQualitySwitchState.running) return playbackQualitySwitchState.promise;
  playbackQualitySwitchState.running = true;
  updatePlaybackQualityUi();
  playbackQualitySwitchState.promise = Promise.resolve(drainPlaybackQualitySwitches()).finally(function () {
    playbackQualitySwitchState.running = false;
    playbackQualitySwitchState.pending = null;
    playbackQualitySwitchState.active = null;
    playbackQualitySwitchState.promise = null;
    updatePlaybackQualityUi();
    forcePlaybackControlsInteractive();
  });
  return playbackQualitySwitchState.promise;
}
function toggleQualityPanel(e) {
  if (e) e.stopPropagation();
  var wrap = document.getElementById('quality-control');
  if (wrap) {
    wrap.classList.toggle('open');
    var btn = document.getElementById('quality-btn');
    if (btn) btn.setAttribute('aria-expanded', wrap.classList.contains('open') ? 'true' : 'false');
  }
}
function bindQualityControl() {
  var wrap = document.getElementById('quality-control');
  if (wrap) {
    wrap.addEventListener('mouseenter', function () { wrap.classList.add('open'); });
    wrap.addEventListener('mouseleave', function () { setTimeout(function () { if (!wrap.matches(':hover')) wrap.classList.remove('open'); }, 260); });
  }
  document.addEventListener('click', function (e) {
    if (wrap && !wrap.contains(e.target)) wrap.classList.remove('open');
  });
  updatePlaybackQualityUi();
}
var audioRouteWorkflowDrag = null;
function audioRoutePointForPort(port, root) {
  if (!port || !root) return null;
  var portRect = port.getBoundingClientRect();
  var rootRect = root.getBoundingClientRect();
  return {
    x: portRect.left + portRect.width / 2 - rootRect.left,
    y: portRect.top + portRect.height / 2 - rootRect.top
  };
}
function audioRoutePointFromEvent(e, root) {
  if (!e || !root) return null;
  var rootRect = root.getBoundingClientRect();
  return { x: e.clientX - rootRect.left, y: e.clientY - rootRect.top };
}
function audioRouteBezierPath(a, b) {
  var dx = Math.max(42, Math.abs(b.x - a.x) * 0.42);
  return 'M ' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) +
    ' C ' + (a.x + dx).toFixed(1) + ' ' + a.y.toFixed(1) +
    ', ' + (b.x - dx).toFixed(1) + ' ' + b.y.toFixed(1) +
    ', ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
}
function appendAudioRoutePath(svg, from, to, className) {
  if (!svg || !from || !to) return;
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', audioRouteBezierPath(from, to));
  path.setAttribute('class', className || 'workflow-link');
  svg.appendChild(path);
}
function audioRoutePortByAttr(root, attr, value) {
  var ports = root ? root.querySelectorAll('.flow-port.in[' + attr + ']') : [];
  value = String(value || '');
  for (var i = 0; i < ports.length; i += 1) {
    if (String(ports[i].getAttribute(attr) || '') === value) return ports[i];
  }
  return null;
}
function renderAudioRouteWorkflowEdgesForRoot(root, tempPoint) {
  if (!root) return;
  var svg = root.querySelector('#audio-route-workflow-svg');
  if (!svg) return;
  svg.setAttribute('viewBox', '0 0 ' + Math.max(1, root.clientWidth || 1) + ' ' + Math.max(1, root.clientHeight || 1));
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  var sourceOut = root.querySelector('[data-audio-route-source="player"]');
  var sourcePoint = audioRoutePointForPort(sourceOut, root);
  var primaryPort = audioRoutePortByAttr(root, 'data-output-primary-target', audioOutputDeviceId || '');
  appendAudioRoutePath(svg, sourcePoint, audioRoutePointForPort(primaryPort, root), 'workflow-link active primary');
  normalizeAudioOutputIdList(audioOutputMirrorDeviceIds).forEach(function (id) {
    if (!id || id === (audioOutputDeviceId || '')) return;
    appendAudioRoutePath(svg, sourcePoint, audioRoutePointForPort(audioRoutePortByAttr(root, 'data-output-mirror-target', id), root), audioOutputMirrorRouteClass(id));
  });
  if (audioInputBridgeState && audioInputBridgeState.enabled && audioInputBridgeState.deviceId) {
    appendAudioRoutePath(svg, sourcePoint, audioRoutePointForPort(audioRoutePortByAttr(root, 'data-input-bridge-target', audioInputBridgeState.deviceId), root), 'workflow-link active bridge');
  }
  if (audioRouteWorkflowDrag && audioRouteWorkflowDrag.root === root && tempPoint) {
    appendAudioRoutePath(svg, audioRoutePointForPort(audioRouteWorkflowDrag.port, root), tempPoint, 'workflow-link temp');
  }
}
function renderAudioRouteWorkflowEdges(tempPoint) {
  var roots = document.querySelectorAll('.audio-route-graph');
  Array.prototype.forEach.call(roots, function (root) {
    renderAudioRouteWorkflowEdgesForRoot(root, tempPoint);
  });
}
function finishAudioRouteWorkflowDrag(e) {
  if (!audioRouteWorkflowDrag) return;
  var root = audioRouteWorkflowDrag.root;
  var target = document.elementFromPoint(e.clientX, e.clientY);
  var port = target && target.closest ? target.closest('.flow-port.in') : null;
  if (root && port && root.contains(port)) {
    if (port.hasAttribute('data-output-primary-target')) {
      setAudioOutputDevice(port.getAttribute('data-output-primary-target') || '', true);
    } else if (port.hasAttribute('data-output-mirror-target')) {
      toggleAudioOutputMirrorDevice(port.getAttribute('data-output-mirror-target') || '');
    } else if (port.hasAttribute('data-input-bridge-target')) {
      setAudioInputBridgeDevice(port.getAttribute('data-input-bridge-target') || '', true);
    }
  }
  if (root) root.classList.remove('dragging-line');
  audioRouteWorkflowDrag = null;
  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { }
  requestAnimationFrame(renderAudioRouteWorkflowEdges);
}
function bindAudioRouteWorkflowPointerEvents(outputList) {
  if (!outputList || outputList._routeWorkflowBound) return;
  outputList._routeWorkflowBound = true;
  outputList.addEventListener('pointerdown', function (e) {
    var port = e.target && e.target.closest ? e.target.closest('.flow-port.out[data-audio-route-source]') : null;
    if (!port || !outputList.contains(port)) return;
    var root = port.closest('.audio-route-graph');
    audioRouteWorkflowDrag = { root: root, port: port };
    if (root) root.classList.add('dragging-line');
    try { outputList.setPointerCapture(e.pointerId); } catch (_) { }
    e.preventDefault();
    e.stopPropagation();
    renderAudioRouteWorkflowEdges(root ? audioRoutePointFromEvent(e, root) : null);
  });
  outputList.addEventListener('pointermove', function (e) {
    if (!audioRouteWorkflowDrag || !audioRouteWorkflowDrag.root) return;
    e.preventDefault();
    renderAudioRouteWorkflowEdges(audioRoutePointFromEvent(e, audioRouteWorkflowDrag.root));
  });
  outputList.addEventListener('pointerup', finishAudioRouteWorkflowDrag);
  outputList.addEventListener('pointercancel', function (e) {
    if (audioRouteWorkflowDrag && audioRouteWorkflowDrag.root) audioRouteWorkflowDrag.root.classList.remove('dragging-line');
    audioRouteWorkflowDrag = null;
    try { outputList.releasePointerCapture(e.pointerId); } catch (_) { }
    renderAudioRouteWorkflowEdges();
  });
  if (!bindAudioRouteWorkflowPointerEvents._resizeBound) {
    bindAudioRouteWorkflowPointerEvents._resizeBound = true;
    window.addEventListener('resize', function () { requestAnimationFrame(renderAudioRouteWorkflowEdges); });
    window.addEventListener('orientationchange', function () { requestAnimationFrame(renderAudioRouteWorkflowEdges); });
  }
}
function bindAudioRouteSelectionEvents(container) {
  if (container && !container._audioRouteSelectBound) {
    container._audioRouteSelectBound = true;
    container.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-output-primary],[data-output-mirror],[data-input-bridge]') : null;
      if (!btn || !container.contains(btn)) return;
      if (btn.hasAttribute('data-output-primary')) {
        setAudioOutputDevice(btn.getAttribute('data-output-primary') || '', true);
        return;
      }
      if (btn.hasAttribute('data-output-mirror')) {
        toggleAudioOutputMirrorDevice(btn.getAttribute('data-output-mirror') || '');
        return;
      }
      if (btn.hasAttribute('data-input-bridge')) {
        setAudioInputBridgeDevice(btn.getAttribute('data-input-bridge') || '', true);
      }
    });
  }
}
function bindAudioOutputControls() {
  var outputList = document.getElementById('audio-output-list');
  var workflowBody = document.getElementById('audio-output-workflow-body');
  bindAudioRouteSelectionEvents(outputList);
  bindAudioRouteSelectionEvents(workflowBody);
  bindAudioRouteWorkflowPointerEvents(outputList);
  bindAudioRouteWorkflowPointerEvents(workflowBody);
  renderAudioOutputDeviceUi();
  refreshAudioOutputDevices(false);
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener && !bindAudioOutputControls._deviceChangeBound) {
    bindAudioOutputControls._deviceChangeBound = true;
    navigator.mediaDevices.addEventListener('devicechange', function () { refreshAudioOutputDevices(false); });
  }
}
function readAudioOutputDevicePreference() {
  try { return localStorage.getItem(AUDIO_OUTPUT_DEVICE_STORE_KEY) || ''; } catch (e) { return ''; }
}
function saveAudioOutputDevicePreference() {
  try { localStorage.setItem(AUDIO_OUTPUT_DEVICE_STORE_KEY, audioOutputDeviceId || ''); } catch (e) { }
}
function normalizeAudioOutputIdList(list) {
  var seen = {};
  return (Array.isArray(list) ? list : []).map(function (id) { return String(id || '').trim(); }).filter(function (id) {
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  }).slice(0, 4);
}
function readAudioOutputMirrorPreference() {
  try {
    return normalizeAudioOutputIdList(JSON.parse(localStorage.getItem(AUDIO_OUTPUT_MIRROR_STORE_KEY) || '[]'));
  } catch (e) { return []; }
}
function saveAudioOutputMirrorPreference() {
  try { localStorage.setItem(AUDIO_OUTPUT_MIRROR_STORE_KEY, JSON.stringify(normalizeAudioOutputIdList(audioOutputMirrorDeviceIds))); } catch (e) { }
}
function audioOutputMirrorSinkSupported() {
  return typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype && typeof HTMLMediaElement.prototype.setSinkId === 'function';
}
function audioOutputMirrorReadableError(e) {
  var name = e && e.name ? String(e.name) : '';
  if (name === 'NotAllowedError') return '没有输出权限';
  if (name === 'NotFoundError') return '设备不可用';
  if (name === 'AbortError') return '切换失败';
  if (name === 'NotSupportedError') return '内核不支持';
  return '播放失败';
}
function markAudioOutputMirrorRuntime(id, state, message) {
  id = String(id || '');
  if (!id) return;
  if (!audioOutputMirrorRuntime) audioOutputMirrorRuntime = {};
  var prev = audioOutputMirrorRuntime[id] || {};
  message = String(message || '');
  if (prev.state === state && prev.message === message) return;
  audioOutputMirrorRuntime[id] = { state: state, message: message, at: Date.now() };
  if (markAudioOutputMirrorRuntime.renderPending) return;
  markAudioOutputMirrorRuntime.renderPending = true;
  var schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (fn) { return setTimeout(fn, 16); };
  schedule(function () {
    markAudioOutputMirrorRuntime.renderPending = false;
    renderAudioOutputDeviceUi();
    renderAudioRouteWorkflowEdges();
  });
}
function audioOutputMirrorRuntimeFor(id) {
  id = String(id || '');
  return audioOutputMirrorRuntime && audioOutputMirrorRuntime[id] || null;
}
function audioOutputMirrorConfirmedCount(ids) {
  return normalizeAudioOutputIdList(ids).filter(function (id) {
    var rt = audioOutputMirrorRuntimeFor(id);
    return rt && rt.state === 'playing';
  }).length;
}
function audioOutputMirrorRouteClass(id) {
  var rt = audioOutputMirrorRuntimeFor(id);
  if (rt && rt.state === 'playing') return 'workflow-link active mirror';
  return 'workflow-link pending mirror';
}
function audioOutputMirrorStatusText(id, active, disabled) {
  if (disabled) return '已作为主输出，不能再镜像';
  if (!active) return '实验：复制播放流，不是系统级路由';
  if (!audioOutputMirrorSinkSupported()) return '当前内核不支持镜像监听';
  var src = audio && (audio.currentSrc || audio.src || '');
  if (!audio || !src) return '待播放时尝试镜像';
  var rt = audioOutputMirrorRuntimeFor(id);
  if (!rt) return '待确认镜像监听';
  if (rt.state === 'playing') return '镜像监听已确认';
  if (rt.state === 'paused') return '随主播放器暂停';
  if (rt.state === 'sink-ready') return '设备已选，等待播放';
  if (rt.state === 'sink-pending' || rt.state === 'play-pending') return '正在尝试镜像监听';
  if (rt.state === 'waiting') return '待播放时尝试镜像';
  if (rt.state === 'sink-error' || rt.state === 'play-error' || rt.state === 'unsupported') return '镜像失败：' + (rt.message || '请换接口');
  return '待确认镜像监听';
}
function readAudioInputBridgePreference() {
  try {
    var parsed = JSON.parse(localStorage.getItem(AUDIO_INPUT_BRIDGE_STORE_KEY) || '{}');
    return { enabled: !!parsed.enabled, deviceId: String(parsed.deviceId || '') };
  } catch (e) {
    return { enabled: false, deviceId: '' };
  }
}
function saveAudioInputBridgePreference() {
  try { localStorage.setItem(AUDIO_INPUT_BRIDGE_STORE_KEY, JSON.stringify(audioInputBridgeState || { enabled: false, deviceId: '' })); } catch (e) { }
}
function audioOutputDeviceById(deviceId) {
  deviceId = String(deviceId || '');
  return (audioOutputDevices || []).filter(function (device) { return device && device.deviceId === deviceId; })[0] || null;
}
function isVirtualMicOutputDevice(device) {
  var label = String(device && device.label || '').toLowerCase();
  return /cable input|vb-audio|voicemeeter|virtual|loopback|blackhole|sonar|stereo mix|立体声混音|虚拟|线缆/.test(label);
}
function recommendedAudioInputBridgeDeviceId() {
  var selected = audioInputBridgeState && audioInputBridgeState.deviceId;
  if (selected && audioOutputDeviceById(selected)) return selected;
  var virtual = (audioOutputDevices || []).filter(isVirtualMicOutputDevice)[0];
  return virtual && virtual.deviceId || '';
}
function audioInputDeviceLabel(device, index) {
  if (!device || !device.deviceId) return '输入设备';
  return device.label || ('输入设备 ' + (index + 1));
}
function audioOutputDeviceStatusText() {
  if (audioOutputRuntime && audioOutputRuntime.state === 'failed') return audioOutputRuntime.message || '输出切换失败';
  if (audioOutputRuntime && audioOutputRuntime.state === 'pending' && audioOutputDeviceId) return audioOutputRuntime.message || '正在连接输出设备';
  if (audioInputBridgeState && audioInputBridgeState.enabled) {
    var bridgeDevice = audioOutputDeviceById(audioInputBridgeState.deviceId);
    return bridgeDevice ? ('已桥接到 ' + audioOutputDeviceLabel(bridgeDevice, 0)) : '输入桥接等待虚拟设备';
  }
  if (audioOutputDeviceId) {
    var primary = audioOutputDeviceById(audioOutputDeviceId);
    return primary ? ('当前输出 ' + audioOutputDeviceLabel(primary, 0)) : '当前输出设备待恢复';
  }
  return '当前输出系统默认';
}
function markAudioOutputRuntime(state, message) {
  audioOutputRuntime = { state: state || 'idle', message: String(message || '') };
}
function audioOutputDeviceLabel(device, index) {
  if (!device || !device.deviceId) return '系统默认';
  return device.label || ('输出设备 ' + (index + 1));
}
function renderAudioOutputDeviceUi() {
  var list = document.getElementById('audio-output-list');
  if (!list) return;
  var outputs = [{ deviceId: '', label: '系统默认' }].concat(audioOutputDevices || []);
  var bridgeId = recommendedAudioInputBridgeDeviceId();
  var bridgeEnabled = !!(audioInputBridgeState && audioInputBridgeState.enabled);
  var mirrorIds = normalizeAudioOutputIdList(audioOutputMirrorDeviceIds);
  var outputItems = outputs.map(function (device, index) {
    return {
      device: device,
      index: index,
      id: device && device.deviceId ? String(device.deviceId) : '',
      label: audioOutputDeviceLabel(device, index)
    };
  });
  function sortedRouteItems(items, rank) {
    return items.slice().sort(function (a, b) {
      var ra = rank(a);
      var rb = rank(b);
      if (ra !== rb) return ra - rb;
      return String(a.label || '').localeCompare(String(b.label || ''), 'zh-Hans-CN');
    });
  }
  var primaryItems = sortedRouteItems(outputItems, function (item) {
    if (item.id === (audioOutputDeviceId || '')) return 0;
    if (!item.id) return 1;
    return 2;
  });
  var mirrorItems = sortedRouteItems(outputItems.filter(function (item) { return !!item.id; }), function (item) {
    if (mirrorIds.indexOf(item.id) >= 0 && item.id !== (audioOutputDeviceId || '')) return 0;
    if (isVirtualMicOutputDevice(item.device)) return 1;
    if (item.id === (audioOutputDeviceId || '')) return 3;
    return 2;
  });
  var primaryHtml = primaryItems.map(function (item) {
    var device = item.device;
    var index = item.index;
    var id = device && device.deviceId ? String(device.deviceId) : '';
    var active = id === (audioOutputDeviceId || '');
    var virtualClass = device && device.deviceId && isVirtualMicOutputDevice(device) ? ' virtual' : '';
    return '<button class="audio-route-node output workflow-node' + virtualClass + (active ? ' active connected' : '') + '" type="button" data-output-primary="' + escHtml(id) + '" title="' + escHtml(audioOutputDeviceLabel(device, index)) + '">' +
      '<span class="flow-port in" data-output-primary-target="' + escHtml(id) + '" title="连接为主输出"></span><span class="route-node-icon">' + (id ? 'OUT' : 'SYS') + '</span><span class="route-node-text"><b>' + escHtml(audioOutputDeviceLabel(device, index)) + '</b><small>' + (active ? '主输出已连接' : '拖线连接主输出') + '</small></span>' +
      '<span class="route-node-pulse"></span></button>';
  }).join('');
  var mirrorHtml = mirrorItems.map(function (item) {
    var device = item.device;
    var index = item.index;
    var id = String(device.deviceId || '');
    var disabled = id === (audioOutputDeviceId || '');
    var active = mirrorIds.indexOf(id) >= 0 && !disabled;
    var rt = audioOutputMirrorRuntimeFor(id);
    var pendingClass = active && (!rt || rt.state !== 'playing') ? ' pending' : '';
    var warningClass = active && rt && (rt.state === 'sink-error' || rt.state === 'play-error' || rt.state === 'unsupported') ? ' warning' : '';
    return '<button class="audio-route-node mirror workflow-node' + (active ? ' active connected' : '') + pendingClass + warningClass + (disabled ? ' disabled' : '') + '" type="button" data-output-mirror="' + escHtml(id) + '" title="' + escHtml(audioOutputDeviceLabel(device, index)) + '">' +
      '<span class="flow-port in" data-output-mirror-target="' + escHtml(id) + '" title="连接为实验镜像监听"></span><span class="route-node-icon">MON</span><span class="route-node-text"><b>' + escHtml(audioOutputDeviceLabel(device, index)) + '</b><small>' + escHtml(audioOutputMirrorStatusText(id, active, disabled)) + '</small></span>' +
      '<span class="route-node-pulse"></span></button>';
  }).join('');
  var bridgeDevice = bridgeId ? audioOutputDeviceById(bridgeId) : null;
  var bridgeLabel = bridgeDevice ? audioOutputDeviceLabel(bridgeDevice, 0) : '未检测到 VB-CABLE / VoiceMeeter';
  var inputHint = (audioInputDevices || []).slice(0, 2).map(function (device, index) { return audioInputDeviceLabel(device, index); }).join(' / ');
  var activePrimary = audioOutputDeviceId ? audioOutputDeviceById(audioOutputDeviceId) : null;
  var summaryText = audioOutputDeviceStatusText();
  var mirrorCount = mirrorIds.filter(function (id) { return id && id !== (audioOutputDeviceId || ''); }).length;
  var mirrorConfirmedCount = audioOutputMirrorConfirmedCount(mirrorIds);
  var mirrorStateLabel = mirrorCount ? (mirrorConfirmedCount ? ('已确认 ' + mirrorConfirmedCount + '/' + mirrorCount) : ('待确认 ' + mirrorCount + ' 路')) : '关闭';
  var workflowHtml =
    '<div class="audio-route-graph' + (bridgeEnabled ? ' bridge-on' : '') + '">' +
      '<svg id="audio-route-workflow-svg" class="workflow-link-layer audio-link-layer" aria-hidden="true"></svg>' +
      '<div class="audio-flow-source workflow-node" data-audio-node="player">' +
        '<span class="route-node-kicker">SOURCE</span><span class="route-node-icon">MR</span><span class="route-node-text"><b>Mineradio Player</b><small>' + escHtml(summaryText) + '</small></span><span class="audio-source-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="flow-port out" data-audio-route-source="player" title="Mineradio 输出"></span>' +
      '</div>' +
      '<div class="audio-route-status"><span class="route-energy-dot"></span><b>Patch Bay</b><small>' + escHtml(audioOutputDeviceId ? '主监听已指定' : '主监听跟随系统默认') + '</small></div>' +
      '<div class="audio-route-board">' +
        '<div class="audio-route-board-head">' +
          '<span class="route-board-title"><b>路由矩阵</b><small>Patch Bay</small></span>' +
          '<span class="route-board-badges"><span class="audio-route-chip active">主监听 ' + escHtml(activePrimary ? audioOutputDeviceLabel(activePrimary, 0) : '系统默认') + '</span>' +
          '<span class="audio-route-chip">镜像监听 ' + escHtml(mirrorStateLabel) + '</span>' +
          '<span class="audio-route-chip' + (bridgeEnabled ? ' active' : '') + '">虚拟麦克风 ' + (bridgeEnabled ? '已接入' : '未接入') + '</span></span>' +
        '</div>' +
        '<div class="audio-route-lanes">' +
          '<div class="route-lane primary"><div class="route-lane-head"><span class="route-lane-index">01</span><span><b>主监听</b><small>播放器默认输出端</small></span><em class="route-lane-state">' + escHtml(activePrimary ? '已指定' : '系统默认') + '</em></div><div class="route-node-grid">' + primaryHtml + '</div></div>' +
          '<div class="route-lane mirror"><div class="route-lane-head"><span class="route-lane-index">02</span><span><b>镜像监听</b><small>实验功能：复制播放流到另一输出</small></span><em class="route-lane-state">' + escHtml(mirrorStateLabel) + '</em></div><div class="route-node-grid mirror-grid">' + (mirrorHtml || '<div class="audio-route-empty">没有可镜像的输出设备</div>') + '</div><div class="audio-route-note">镜像监听不是系统级多输出，可能有轻微延迟或因平台音源失效；直播/语音输入建议走虚拟声卡桥接。</div></div>' +
          '<div class="route-lane bridge"><div class="route-lane-head"><span class="route-lane-index">03</span><span><b>虚拟麦克风</b><small>' + escHtml(inputHint || '游戏 / 语音软件从对应输入端接收') + '</small></span><em class="route-lane-state">' + escHtml(bridgeEnabled ? '已桥接' : '未接入') + '</em></div>' +
            '<div class="route-node-grid bridge-grid"><button class="audio-route-node bridge workflow-node' + (bridgeEnabled ? ' active connected' : '') + (!bridgeId ? ' disabled' : '') + '" type="button" data-input-bridge="' + escHtml(bridgeId) + '">' +
              '<span class="flow-port in" data-input-bridge-target="' + escHtml(bridgeId) + '" title="虚拟麦克风输入"></span><span class="route-node-icon">MIC</span><span class="route-node-text"><b>' + escHtml(bridgeLabel) + '</b><small>' + escHtml(bridgeEnabled ? '已送入虚拟输入链路' : (bridgeId ? '可接入虚拟输入链路' : '需要虚拟声卡线缆')) + '</small></span><span class="route-node-pulse"></span>' +
            '</button></div>' +
            '<div class="audio-route-note">' + escHtml(inputHint ? ('输入端: ' + inputHint) : '真实麦克风不能被直接写入；请在游戏或语音软件里选择虚拟声卡的输入端。') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  var workflowSubtitle = document.getElementById('audio-output-workflow-subtitle');
  if (workflowSubtitle) workflowSubtitle.textContent = summaryText;
  list.innerHTML =
    '<button class="audio-output-summary-card" type="button" onclick="openAudioOutputWorkflowPanel()">' +
      '<span class="route-node-icon">MR</span>' +
      '<span class="audio-output-summary-copy"><b>' + escHtml(summaryText) + '</b><small>' +
        escHtml((activePrimary ? '主输出已指定' : '主输出使用系统默认') + ' / 镜像监听 ' + mirrorStateLabel + ' / 桥接 ' + (bridgeEnabled ? '开启' : '关闭')) +
      '</small></span>' +
      '<span class="audio-output-summary-action">路由</span>' +
    '</button>';
  var workflowBody = document.getElementById('audio-output-workflow-body');
  if (workflowBody) workflowBody.innerHTML = workflowHtml;
  requestAnimationFrame(function () { renderAudioRouteWorkflowEdges(); });
}
function openAudioOutputWorkflowPanel() {
  var modal = document.getElementById('audio-output-workflow-modal');
  if (!modal) return;
  openGsapModal(modal);
  bindAudioOutputControls();
  renderAudioOutputDeviceUi();
  requestAnimationFrame(function () {
    renderAudioRouteWorkflowEdges();
    setTimeout(renderAudioRouteWorkflowEdges, 80);
  });
  refreshAudioOutputDevices(false);
}
function closeAudioOutputWorkflowPanel() {
  closeGsapModal(document.getElementById('audio-output-workflow-modal'));
}
async function refreshAudioOutputDevices(showNotice) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    audioOutputDevices = [];
    audioInputDevices = [];
    renderAudioOutputDeviceUi();
    if (showNotice) showToast('当前环境不支持输出接口选择');
    return;
  }
  try {
    var devices = await navigator.mediaDevices.enumerateDevices();
    audioOutputDevices = devices.filter(function (device) { return device && device.kind === 'audiooutput' && device.deviceId && device.deviceId !== 'default'; });
    audioInputDevices = devices.filter(function (device) { return device && device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default'; });
    if (audioInputBridgeState && audioInputBridgeState.enabled && audioInputBridgeState.deviceId && !audioOutputDeviceById(audioInputBridgeState.deviceId)) {
      audioInputBridgeState.enabled = false;
      saveAudioInputBridgePreference();
    }
    renderAudioOutputDeviceUi();
    if (showNotice) showToast('输出接口已刷新');
  } catch (e) {
    audioOutputDevices = [];
    audioInputDevices = [];
    renderAudioOutputDeviceUi();
    if (showNotice) showToast('输出接口读取失败');
  }
}
function bindAudioOutputMirrorEvents(media) {
  if (!media || media._mineradioAudioMirrorBound) return;
  media._mineradioAudioMirrorBound = true;
  ['play', 'playing', 'pause', 'ended', 'seeking', 'seeked', 'ratechange', 'volumechange', 'emptied'].forEach(function (name) {
    media.addEventListener(name, function () { syncAudioOutputMirrors(name); });
  });
}
function removeAudioOutputMirror(id) {
  var mirror = audioOutputMirrorElements && audioOutputMirrorElements[id];
  if (mirror) {
    try { mirror.pause(); } catch (e) { }
    try { mirror.removeAttribute('src'); mirror.load(); } catch (e) { }
    delete audioOutputMirrorElements[id];
  }
  if (audioOutputMirrorRuntime && id) delete audioOutputMirrorRuntime[id];
}
function clearAudioOutputMirrors() {
  Object.keys(audioOutputMirrorElements || {}).forEach(removeAudioOutputMirror);
  if (audioOutputMirrorSyncTimer) {
    clearInterval(audioOutputMirrorSyncTimer);
    audioOutputMirrorSyncTimer = 0;
  }
}
async function applyAudioOutputMirrorSink(mirror, sinkId) {
  if (!mirror || typeof mirror.setSinkId !== 'function') {
    markAudioOutputMirrorRuntime(sinkId, 'unsupported', '内核不支持');
    return false;
  }
  try {
    markAudioOutputMirrorRuntime(sinkId, 'sink-pending', '正在选择设备');
    await mirror.setSinkId(sinkId);
    markAudioOutputMirrorRuntime(sinkId, 'sink-ready', '设备已选');
    return true;
  } catch (e) {
    markAudioOutputMirrorRuntime(sinkId, 'sink-error', audioOutputMirrorReadableError(e));
    console.warn('[AudioOutputMirror]', e);
    return false;
  }
}
function syncAudioOutputMirrors(reason) {
  var ids = normalizeAudioOutputIdList(audioOutputMirrorDeviceIds).filter(function (id) { return id && id !== (audioOutputDeviceId || ''); });
  var src = audio && (audio.currentSrc || audio.src || '');
  Object.keys(audioOutputMirrorRuntime || {}).forEach(function (id) {
    if (ids.indexOf(id) < 0) delete audioOutputMirrorRuntime[id];
  });
  if (!ids.length) {
    clearAudioOutputMirrors();
    return;
  }
  if (!audioOutputMirrorSinkSupported()) {
    clearAudioOutputMirrors();
    ids.forEach(function (id) { markAudioOutputMirrorRuntime(id, 'unsupported', '内核不支持'); });
    return;
  }
  if (!audio || !src) {
    clearAudioOutputMirrors();
    ids.forEach(function (id) { markAudioOutputMirrorRuntime(id, 'waiting', '待播放时尝试'); });
    return;
  }
  Object.keys(audioOutputMirrorElements || {}).forEach(function (id) {
    if (ids.indexOf(id) < 0) removeAudioOutputMirror(id);
  });
  ids.forEach(function (id) {
    var mirror = audioOutputMirrorElements[id];
    if (!mirror) {
      mirror = new Audio();
      mirror.crossOrigin = 'anonymous';
      mirror.preload = 'auto';
      mirror.muted = !!audio.muted;
      mirror.volume = audio.volume;
      mirror.playbackRate = audio.playbackRate || 1;
      audioOutputMirrorElements[id] = mirror;
    }
    if (mirror._mineradioSinkId !== id || !mirror._mineradioSinkReady) {
      mirror._mineradioSinkId = id;
      if (!mirror._mineradioSinkBusy) {
        mirror._mineradioSinkBusy = true;
        Promise.resolve(applyAudioOutputMirrorSink(mirror, id)).then(function (ok) {
          mirror._mineradioSinkBusy = false;
          mirror._mineradioSinkReady = !!ok;
          if (ok) syncAudioOutputMirrors('mirror-sink-ready');
        });
      }
    }
    if ((mirror.currentSrc || mirror.src || '') !== src) {
      try { mirror.src = src; mirror.load(); } catch (e) { }
    }
    try { mirror.muted = !!audio.muted; mirror.volume = audio.volume; mirror.playbackRate = audio.playbackRate || 1; } catch (e) { }
    try {
      if (isFinite(audio.currentTime) && Math.abs((mirror.currentTime || 0) - audio.currentTime) > 0.22) {
        mirror.currentTime = audio.currentTime;
      }
    } catch (e) { }
    if (!mirror._mineradioSinkReady) return;
    if (audio.paused || audio.ended) {
      try { mirror.pause(); } catch (e) { }
      markAudioOutputMirrorRuntime(id, 'paused', '随主播放器暂停');
    } else {
      var rt = audioOutputMirrorRuntimeFor(id);
      if (!rt || rt.state !== 'playing') markAudioOutputMirrorRuntime(id, 'play-pending', '正在播放');
      var p = mirror.play();
      if (p && p.then) {
        p.then(function () {
          markAudioOutputMirrorRuntime(id, 'playing', '已确认');
        }).catch(function (e) {
          markAudioOutputMirrorRuntime(id, 'play-error', audioOutputMirrorReadableError(e));
          console.warn('[AudioOutputMirror] play failed:', e);
        });
      } else {
        markAudioOutputMirrorRuntime(id, 'playing', '已确认');
      }
    }
  });
  if (!audioOutputMirrorSyncTimer) {
    audioOutputMirrorSyncTimer = setInterval(function () { syncAudioOutputMirrors('clock'); }, 2200);
  }
}
async function applyAudioOutputDevice(media) {
  var sinkId = audioOutputDeviceId || '';
  var hasTarget = !!(media || audioCtx || uiSfxCtx);
  var mediaResult = null;
  var contextResult = null;
  var sfxResult = null;
  var errors = [];
  async function applySink(target, label) {
    if (!target) return null;
    if (typeof target.setSinkId !== 'function') return false;
    try {
      await target.setSinkId(sinkId);
      return true;
    } catch (e) {
      errors.push({ label: label, error: e });
      return false;
    }
  }
  bindAudioOutputMirrorEvents(media);
  mediaResult = await applySink(media, 'audio');
  contextResult = await applySink(audioCtx, 'audio-context');
  sfxResult = await applySink(uiSfxCtx, 'ui-sfx');
  var webAudioRouteActive = !!(audioReady && audioCtx && gainNode);
  var ok = webAudioRouteActive ? contextResult === true : (mediaResult === true || contextResult === true);
  if (sfxResult === true && !webAudioRouteActive && !media) ok = true;
  syncAudioOutputMirrors('apply-device');
  if (ok) {
    markAudioOutputRuntime('connected', '输出已连接');
    renderAudioOutputDeviceUi();
    return true;
  }
  if (!hasTarget) {
    markAudioOutputRuntime('pending', sinkId ? '将在播放时连接输出设备' : '系统默认输出');
    renderAudioOutputDeviceUi();
    return null;
  }
  var failureMessage = '当前输出接口暂不可用';
  if (errors.length) {
    console.warn('[AudioOutput]', errors);
    failureMessage += '：' + audioOutputMirrorReadableError(errors[0].error);
    if (errors.some(function (item) { return item.error && item.error.name === 'NotFoundError'; })) {
      audioOutputDeviceId = '';
      saveAudioOutputDevicePreference();
      failureMessage += '，已恢复系统默认输出';
    }
  }
  markAudioOutputRuntime('failed', failureMessage);
  renderAudioOutputDeviceUi();
  return false;
}
function setAudioOutputDevice(deviceId, showNotice) {
  var previousOutputDeviceId = audioOutputDeviceId || '';
  var previousBridgeState = {
    enabled: !!(audioInputBridgeState && audioInputBridgeState.enabled),
    deviceId: String(audioInputBridgeState && audioInputBridgeState.deviceId || '')
  };
  var previousMirrorDeviceIds = normalizeAudioOutputIdList(audioOutputMirrorDeviceIds);
  audioOutputDeviceId = String(deviceId || '');
  var requestedDeviceId = audioOutputDeviceId;
  if (!requestedDeviceId || requestedDeviceId !== (audioInputBridgeState && audioInputBridgeState.deviceId || '')) {
    if (audioInputBridgeState && audioInputBridgeState.enabled) {
      audioInputBridgeState.enabled = false;
      saveAudioInputBridgePreference();
    }
  }
  audioOutputMirrorDeviceIds = normalizeAudioOutputIdList(audioOutputMirrorDeviceIds).filter(function (id) { return id !== requestedDeviceId; });
  saveAudioOutputMirrorPreference();
  saveAudioOutputDevicePreference();
  markAudioOutputRuntime(requestedDeviceId ? 'pending' : 'connected', requestedDeviceId ? '正在切换输出设备' : '系统默认输出');
  renderAudioOutputDeviceUi();
  Promise.resolve(applyAudioOutputDevice(audio)).then(function (ok) {
    if (ok === false) {
      audioOutputDeviceId = previousOutputDeviceId;
      audioInputBridgeState = previousBridgeState;
      audioOutputMirrorDeviceIds = previousMirrorDeviceIds;
      saveAudioInputBridgePreference();
      saveAudioOutputMirrorPreference();
      saveAudioOutputDevicePreference();
      markAudioOutputRuntime('failed', '输出接口切换失败，已恢复原输出');
      renderAudioOutputDeviceUi();
      Promise.resolve(applyAudioOutputDevice(audio));
      if (showNotice) showToast('输出接口切换失败，已恢复原输出');
      return;
    }
    if (!showNotice) return;
    if (!requestedDeviceId) showToast('已切回系统默认输出');
    else if (ok === true) showToast('输出接口已切换');
    else if (ok === null) showToast('输出接口已保存，播放时自动启用');
    else if (audioReady && audioCtx && typeof audioCtx.setSinkId !== 'function') showToast('当前内核不支持频谱输出实时切换，未切换成功');
    else showToast('当前输出接口暂不可用，未切换成功');
  });
}
function toggleAudioOutputMirrorDevice(deviceId) {
  deviceId = String(deviceId || '');
  if (!deviceId) return;
  if (!audioOutputMirrorSinkSupported()) {
    markAudioOutputMirrorRuntime(deviceId, 'unsupported', '内核不支持');
    showToast('当前内核不支持实验镜像监听');
    return;
  }
  if (deviceId === (audioOutputDeviceId || '')) {
    showToast('这个接口已经是主输出');
    return;
  }
  var ids = normalizeAudioOutputIdList(audioOutputMirrorDeviceIds);
  var pos = ids.indexOf(deviceId);
  if (pos >= 0) {
    ids.splice(pos, 1);
    removeAudioOutputMirror(deviceId);
    showToast('已关闭实验镜像监听');
  } else {
    ids.push(deviceId);
    markAudioOutputMirrorRuntime(deviceId, audio && (audio.currentSrc || audio.src || '') ? 'sink-pending' : 'waiting', audio && (audio.currentSrc || audio.src || '') ? '正在尝试' : '待播放时尝试');
    showToast(audio && (audio.currentSrc || audio.src || '') ? '正在尝试实验镜像监听' : '已保存实验镜像监听，播放时尝试启用');
  }
  audioOutputMirrorDeviceIds = normalizeAudioOutputIdList(ids);
  saveAudioOutputMirrorPreference();
  renderAudioOutputDeviceUi();
  syncAudioOutputMirrors('mirror-toggle');
}
function setAudioInputBridgeDevice(deviceId, showNotice) {
  deviceId = String(deviceId || '');
  if (!deviceId) {
    if (showNotice) showToast('未检测到虚拟麦克风线缆输出端');
    renderAudioOutputDeviceUi();
    return;
  }
  var previousOutputDeviceId = audioOutputDeviceId || '';
  var previousBridgeState = { enabled: !!(audioInputBridgeState && audioInputBridgeState.enabled), deviceId: String(audioInputBridgeState && audioInputBridgeState.deviceId || '') };
  var wasEnabled = !!(audioInputBridgeState && audioInputBridgeState.enabled && audioInputBridgeState.deviceId === deviceId);
  audioInputBridgeState = { enabled: !wasEnabled, deviceId: deviceId };
  saveAudioInputBridgePreference();
  if (audioInputBridgeState.enabled) {
    audioOutputDeviceId = deviceId;
    audioOutputMirrorDeviceIds = normalizeAudioOutputIdList(audioOutputMirrorDeviceIds).filter(function (id) { return id !== deviceId; });
    saveAudioOutputMirrorPreference();
    saveAudioOutputDevicePreference();
    markAudioOutputRuntime('pending', '正在连接虚拟麦克风桥接');
    Promise.resolve(applyAudioOutputDevice(audio)).then(function (ok) {
      if (ok === true) {
        if (showNotice) showToast('已连接到虚拟麦克风桥接');
        return;
      }
      if (ok === null) {
        markAudioOutputRuntime('pending', '将在播放时连接虚拟麦克风桥接');
        renderAudioOutputDeviceUi();
        if (showNotice) showToast('虚拟麦克风桥接已保存，播放时连接');
        return;
      }
      audioInputBridgeState = previousBridgeState;
      audioOutputDeviceId = previousOutputDeviceId;
      saveAudioInputBridgePreference();
      saveAudioOutputDevicePreference();
      markAudioOutputRuntime('failed', '连接虚拟麦克风桥接失败，已恢复原输出');
      renderAudioOutputDeviceUi();
      Promise.resolve(applyAudioOutputDevice(audio));
      if (showNotice) showToast('连接虚拟麦克风桥接失败，已恢复原输出');
    });
  } else {
    if (audioOutputDeviceId === deviceId) {
      audioOutputDeviceId = '';
      saveAudioOutputDevicePreference();
      Promise.resolve(applyAudioOutputDevice(audio));
    }
    if (showNotice) showToast('已关闭虚拟麦克风桥接');
  }
  renderAudioOutputDeviceUi();
}
