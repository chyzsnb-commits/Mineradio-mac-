function albumGaplessSongKey(song) {
  if (!song) return '';
  if (song.__albumGaplessKey) return String(song.__albumGaplessKey);
  var provider = normalizePlaybackProvider(songProviderKey(song));
  if (provider === 'qq') {
    var albumMid = song.albumMid || song.albummid || song.album_mid || '';
    return albumMid ? 'qq:' + albumMid : '';
  }
  if (provider === 'spotify') {
    var spotifyAlbumId = song.albumId || song.spotifyAlbumId || '';
    return spotifyAlbumId ? 'spotify:' + spotifyAlbumId : '';
  }
  if (provider === 'netease') {
    var albumId = song.albumId || song.album_id || '';
    return albumId ? 'netease:' + albumId : '';
  }
  if (provider === 'kugou') {
    var kugouAlbumId = song.albumId || song.album_id || '';
    return kugouAlbumId ? 'kugou:' + kugouAlbumId : '';
  }
  return '';
}

function albumGaplessCoverKey(song) {
  if (!song) return '';
  return String(song.customCover || song.cover || song.picUrl || song.albumCover || song.coverUrl || '').trim();
}

function albumGaplessSameAlbumCover(prevSong, nextSong) {
  var prevAlbum = albumGaplessSongKey(prevSong);
  var nextAlbum = albumGaplessSongKey(nextSong);
  if (!prevAlbum || prevAlbum !== nextAlbum) return false;
  var prevCover = albumGaplessCoverKey(prevSong);
  var nextCover = albumGaplessCoverKey(nextSong);
  return !!(prevCover && nextCover && prevCover === nextCover);
}

var ALBUM_GAPLESS_PREROLL_SECONDS = 8.5;
var ALBUM_GAPLESS_MIX_SECONDS = 0.72;
var ALBUM_GAPLESS_NEXT_FADE_PORTION = 0.36;
var ALBUM_GAPLESS_NEXT_ENTRY_FLOOR = 0.90;
var ALBUM_GAPLESS_NEXT_ATTACK_MS = 56;
var ALBUM_GAPLESS_BOUNDARY_RELEASE_SECONDS = ALBUM_GAPLESS_MIX_SECONDS;
var ALBUM_GAPLESS_MUTED_PREROLL_SECONDS = 1.05;
var ALBUM_GAPLESS_MIN_MIX_MS = 360;
var ALBUM_GAPLESS_BIND_AFTER_MIX_MS = 40;
var ALBUM_GAPLESS_SILENCE_HOLD_MS = 180;
var ALBUM_GAPLESS_FAST_SILENCE_HOLD_MS = 48;
var ALBUM_GAPLESS_LONG_SILENCE_SECONDS = 1.05;
var ALBUM_GAPLESS_SILENCE_LEVEL = 0.018;
var ALBUM_GAPLESS_DIRECT_SILENCE_RMS = 0.0065;
var ALBUM_GAPLESS_DEEP_SILENCE_RMS = 0.0032;
var ALBUM_GAPLESS_DIRECT_SILENCE_PEAK = 0.030;
var ALBUM_GAPLESS_DEEP_SILENCE_PEAK = 0.017;
var ALBUM_GAPLESS_RESIDUAL_FREQ_AVG = 0.010;
var ALBUM_GAPLESS_RESIDUAL_FREQ_PEAK = 0.075;
var ALBUM_GAPLESS_DIRECT_SILENCE_HOLD_MS = 112;
var ALBUM_GAPLESS_DEEP_SILENCE_HOLD_MS = 56;
var albumGaplessTailTimeData = null;
var albumGaplessTailFreqData = null;

function clearAlbumGaplessPreload(reason) {
  if (!albumGaplessState) return;
  albumGaplessState.serial++;
  if (albumGaplessState.monitorTimer) {
    clearInterval(albumGaplessState.monitorTimer);
    albumGaplessState.monitorTimer = 0;
  }
  var preload = albumGaplessState.preload;
  albumGaplessState.preload = null;
  if (preload) {
    if (preload.handoffTimer) clearTimeout(preload.handoffTimer);
    if (preload.cleanupTimer) clearTimeout(preload.cleanupTimer);
    if (preload.fadeFrame) cancelAnimationFrame(preload.fadeFrame);
  }
  if (preload && preload.media) {
    try {
      preload.media.pause();
      preload.media.removeAttribute('src');
      preload.media.load();
    } catch (e) { }
  }
}

function albumGaplessDefaultEnabledForContext(context) {
  var albumKey = context && context.albumKey ? String(context.albumKey) : '';
  if (albumGaplessState && albumGaplessState.enabled && albumKey && albumGaplessState.albumKey === albumKey) return true;
  if (albumGaplessState && albumKey && albumGaplessState.disabledAlbumKey === albumKey) return false;
  return !albumGaplessState || albumGaplessState.defaultEnabled !== false;
}

function albumGaplessTailLevel() {
  return Math.max(
    Math.abs(Number(audioEnergy) || 0),
    Math.abs(Number(smoothEnergy) || 0),
    Math.abs(Number(bass) || 0) * 0.55,
    Math.abs(Number(mid) || 0) * 0.42,
    Math.abs(Number(treble) || 0) * 0.32
  );
}

function albumGaplessDirectTailSample() {
  if (!analyser || !audio || audio.paused) return null;
  try {
    var size = Math.max(32, Number(analyser.fftSize) || FFT_SIZE || 2048);
    if (!albumGaplessTailTimeData || albumGaplessTailTimeData.length !== size) {
      albumGaplessTailTimeData = new Uint8Array(size);
    }
    var freqSize = Math.max(16, Number(analyser.frequencyBinCount) || Math.floor(size / 2));
    if (!albumGaplessTailFreqData || albumGaplessTailFreqData.length !== freqSize) {
      albumGaplessTailFreqData = new Uint8Array(freqSize);
    }
    analyser.getByteTimeDomainData(albumGaplessTailTimeData);
    analyser.getByteFrequencyData(albumGaplessTailFreqData);
    var stride = Math.max(1, Math.floor(albumGaplessTailTimeData.length / 384));
    var sum = 0;
    var peak = 0;
    var count = 0;
    for (var i = 0; i < albumGaplessTailTimeData.length; i += stride) {
      var v = Math.abs((albumGaplessTailTimeData[i] - 128) / 128);
      sum += v * v;
      if (v > peak) peak = v;
      count++;
    }
    var freqStride = Math.max(1, Math.floor(albumGaplessTailFreqData.length / 256));
    var freqSum = 0;
    var freqPeak = 0;
    var freqCount = 0;
    for (var j = 0; j < albumGaplessTailFreqData.length; j += freqStride) {
      var f = albumGaplessTailFreqData[j] / 255;
      freqSum += f;
      if (f > freqPeak) freqPeak = f;
      freqCount++;
    }
    return {
      rms: Math.sqrt(sum / Math.max(1, count)),
      peak: peak,
      freqAvg: freqSum / Math.max(1, freqCount),
      freqPeak: freqPeak
    };
  } catch (e) {
    return null;
  }
}

function albumGaplessTailSilenceProbe(remaining) {
  if (!isFinite(remaining) || remaining > ALBUM_GAPLESS_PREROLL_SECONDS) {
    return { quiet: false, smoothedQuiet: false, directQuiet: false, deepQuiet: false, level: 1, rms: 1, peak: 1 };
  }
  var level = albumGaplessTailLevel();
  var sample = albumGaplessDirectTailSample();
  var rms = sample ? sample.rms : 1;
  var peak = sample ? sample.peak : 1;
  var freqAvg = sample ? sample.freqAvg : 1;
  var freqPeak = sample ? sample.freqPeak : 1;
  var deepQuiet = !!(sample && rms <= ALBUM_GAPLESS_DEEP_SILENCE_RMS && peak <= ALBUM_GAPLESS_DEEP_SILENCE_PEAK);
  var residualTail = !!(sample && !deepQuiet && (freqAvg > ALBUM_GAPLESS_RESIDUAL_FREQ_AVG || freqPeak > ALBUM_GAPLESS_RESIDUAL_FREQ_PEAK));
  var directQuiet = !!(sample && !residualTail && rms <= ALBUM_GAPLESS_DIRECT_SILENCE_RMS && peak <= ALBUM_GAPLESS_DIRECT_SILENCE_PEAK);
  var smoothedQuiet = level <= ALBUM_GAPLESS_SILENCE_LEVEL;
  return {
    quiet: smoothedQuiet || directQuiet,
    smoothedQuiet: smoothedQuiet,
    directQuiet: directQuiet,
    deepQuiet: deepQuiet,
    residualTail: residualTail,
    level: level,
    rms: rms,
    peak: peak,
    freqAvg: freqAvg,
    freqPeak: freqPeak
  };
}

function albumGaplessCurrentTailQuiet(remaining) {
  return albumGaplessTailSilenceProbe(remaining).quiet;
}

function startAlbumGaplessPreroll(preload) {
  if (!preload || !preload.media || preload.prerollStarted || preload.prerollPending || preload.prerollFailed) return false;
  preload.prerollPending = true;
  preload.prerollStarted = true;
  preload.prerollStartedAt = performance.now();
  preload.prerollStartTime = isFinite(preload.media.currentTime) ? preload.media.currentTime : 0;
  try {
    preload.media.muted = true;
    preload.media.volume = 0;
    preload.media.play().then(function () {
      preload.prerollPending = false;
      preload.prerollPlaying = true;
      preload.prerollLiveAt = performance.now();
    }).catch(function (err) {
      preload.prerollPending = false;
      preload.prerollFailed = true;
      console.warn('[AlbumGapless] preroll play failed:', err);
    });
    return true;
  } catch (err) {
    preload.prerollPending = false;
    preload.prerollFailed = true;
    console.warn('[AlbumGapless] preroll start failed:', err);
    return false;
  }
}

function albumGaplessDirectVolumeTarget() {
  return clampRange(Number(targetVolume) || 0, 0, 1);
}

function albumGaplessNextEntryStartGain(target) {
  target = clampRange(Number(target) || 0, 0, 1);
  if (target <= 0.001) return 0;
  return target * ALBUM_GAPLESS_NEXT_ENTRY_FLOOR;
}

function rampAlbumGaplessPreloadVolume(preload, to, durationMs) {
  if (!preload || !preload.media) return;
  if (preload.fadeFrame) cancelAnimationFrame(preload.fadeFrame);
  var media = preload.media;
  var from = clampRange(Number(media.volume) || 0, 0, 1);
  var target = clampRange(Number(to) || 0, 0, 1);
  durationMs = Math.max(1, Number(durationMs) || 1);
  var started = performance.now();
  function tick(nowMs) {
    if (!preload.mixStarted || albumGaplessState.preload !== preload) return;
    var t = clampRange((nowMs - started) / durationMs, 0, 1);
    var eased = t * t * (3 - 2 * t);
    try {
      media.muted = false;
      media.volume = from + (target - from) * eased;
    } catch (e) { }
    if (t < 1) preload.fadeFrame = requestAnimationFrame(tick);
    else preload.fadeFrame = 0;
  }
  preload.fadeFrame = requestAnimationFrame(tick);
}

function runAlbumGaplessBalancedCrossfade(preload, durationMs) {
  if (!preload || !preload.media) return;
  if (preload.fadeFrame) cancelAnimationFrame(preload.fadeFrame);
  var media = preload.media;
  var serial = ++audioFadeSerial;
  clearAudioFadeTimers();
  var startCurrent = currentAudioOutputGain();
  var target = albumGaplessDirectVolumeTarget();
  var startNext = Math.max(clampRange(Number(media.volume) || 0, 0, 1), albumGaplessNextEntryStartGain(target));
  try {
    media.muted = false;
    media.volume = startNext;
  } catch (e0) { }
  var started = performance.now();
  durationMs = Math.max(1, Number(durationMs) || 1);
  var nextAttackPortion = clampRange(ALBUM_GAPLESS_NEXT_ATTACK_MS / durationMs, 0.025, ALBUM_GAPLESS_NEXT_FADE_PORTION);
  function tick(nowMs) {
    if (serial !== audioFadeSerial || !preload.mixStarted || albumGaplessState.preload !== preload) return;
    var t = clampRange((nowMs - started) / durationMs, 0, 1);
    var eased = t * t * (3 - 2 * t);
    var inT = clampRange(t / nextAttackPortion, 0, 1);
    var inEased = inT * inT * (3 - 2 * inT);
    var outGain = startCurrent * Math.cos(eased * Math.PI * 0.5);
    var inGain = startNext + (target - startNext) * Math.sin(inEased * Math.PI * 0.5);
    writeAudioOutputGain(outGain);
    try {
      media.muted = false;
      media.volume = clampRange(inGain, 0, 1);
    } catch (e) { }
    if (t < 1) preload.fadeFrame = requestAnimationFrame(tick);
    else {
      preload.fadeFrame = 0;
      writeAudioOutputGain(0);
      try { media.volume = target; } catch (e2) { }
    }
  }
  preload.fadeFrame = requestAnimationFrame(tick);
}

function startAlbumGaplessMix(preload, reason, remaining) {
  if (!preload || !preload.media || preload.mixStarted || albumGaplessState.handoff) return false;
  if (!albumGaplessQueueCanAdvance(currentIdx)) return false;
  preload.mixStarted = true;
  preload.releaseReason = reason || 'crossmix';
  preload.mixStartedAt = performance.now();
  preload.previousAudio = audio || null;
  if (preload.previousAudio) preload.previousAudio.onended = null;
  if ((reason === 'boundary-crossmix-reset' || reason === 'tail-silence-fast-crossmix' || reason === 'tail-direct-silence-crossmix') && preload.prerollStarted) {
    try {
      preload.media.pause();
      preload.media.currentTime = 0;
    } catch (e) { }
    preload.prerollPlaying = false;
  }
  try {
    preload.media.muted = false;
    preload.media.volume = 0;
    var playResult = preload.media.play();
    if (playResult && playResult.catch) {
      playResult.catch(function (err) {
        preload.prerollFailed = true;
        console.warn('[AlbumGapless] crossmix play failed:', err);
      });
    }
  } catch (err) {
    preload.prerollFailed = true;
    console.warn('[AlbumGapless] crossmix start failed:', err);
  }
  var mixMs = Math.round(ALBUM_GAPLESS_MIX_SECONDS * 1000);
  if (isFinite(remaining) && remaining > 0) {
    mixMs = Math.min(mixMs, Math.max(ALBUM_GAPLESS_MIN_MIX_MS, Math.round(remaining * 1000 + 80)));
  }
  preload.mixDurationMs = mixMs;
  runAlbumGaplessBalancedCrossfade(preload, mixMs);
  var bindDelay = Math.max(120, mixMs + ALBUM_GAPLESS_BIND_AFTER_MIX_MS);
  preload.handoffTimer = setTimeout(function () {
    preload.handoffTimer = 0;
    startAlbumGaplessHandoff(preload, preload.releaseReason || reason || 'crossmix');
  }, bindDelay);
  return true;
}

function setAlbumGaplessPlaybackContext(enabled, context, opts) {
  opts = opts || {};
  var albumKey = context ? String(context.albumKey || '') : '';
  if (opts.userToggle && albumKey) {
    albumGaplessState.disabledAlbumKey = enabled ? '' : albumKey;
  }
  albumGaplessState.enabled = !!enabled;
  albumGaplessState.context = context || null;
  albumGaplessState.albumKey = enabled && context ? albumKey : '';
  if (!albumGaplessState.enabled || !albumGaplessState.albumKey) {
    albumGaplessState.enabled = false;
    clearAlbumGaplessPreload('album-gapless-disabled');
    return false;
  }
  scheduleAlbumGaplessPreloadForCurrent(trackSwitchToken, 'context-enabled');
  return true;
}

function albumGaplessQueueCanAdvance(idx) {
  if (!albumGaplessState || !albumGaplessState.enabled || !albumGaplessState.albumKey) return false;
  if (playMode === 'single') return false;
  if (idx < 0 || idx + 1 >= playQueue.length) return false;
  var currentKey = albumGaplessSongKey(playQueue[idx]);
  var nextKey = albumGaplessSongKey(playQueue[idx + 1]);
  return currentKey === albumGaplessState.albumKey && nextKey === albumGaplessState.albumKey;
}

function qqPlaybackEvidenceQuery(song) {
  song = song || {};
  var vipRequired = !!(song.vipRequired || song.needVip || song.need_vip || song.onlyVipPlayable || song.only_vip_playable);
  if (!vipRequired && typeof songRequiresVip === 'function') {
    try { vipRequired = songRequiresVip(song); } catch (e) { vipRequired = false; }
  }
  return '&vipRequired=' + encodeURIComponent(vipRequired ? '1' : '') +
    '&needVip=' + encodeURIComponent(song.needVip || song.need_vip ? '1' : '') +
    '&onlyVipPlayable=' + encodeURIComponent(song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
    '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
    '&fee=' + encodeURIComponent(song.fee || song.Fee || '');
}

async function resolveAlbumGaplessPlaybackData(song) {
  if (!song || song.type === 'local' || song.source === 'local' || song.localUrl) return null;
  var playbackProvider = normalizePlaybackProvider(songProviderKey(song));
  var requestedQuality = normalizePlaybackQualityForProvider(getProviderPlaybackQuality(playbackProvider), playbackProvider);
  if (playbackProvider === 'netease' && requestedQuality === 'jymaster' && !hasProviderSvip('netease', loginStatus)) requestedQuality = 'hires';
  var runtimeQualityCap = playbackQualityCapValue(song, playbackProvider);
  if (playbackQualityAboveCap(requestedQuality, playbackProvider, runtimeQualityCap)) requestedQuality = runtimeQualityCap;
  var qualityParam = '&quality=' + encodeURIComponent(requestedQuality);
  if (playbackProvider === 'qq') {
    return apiJson('/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') + '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') + qqPlaybackEvidenceQuery(song) + qualityParam, { timeoutMs: 9000 });
  }
  if (playbackProvider === 'kugou') {
    return apiJson('/api/kugou/song/url?hash=' + encodeURIComponent(song.hash || song.fileHash || song.audioHash || song.id || '') +
      '&albumId=' + encodeURIComponent(song.albumId || song.album_id || '') +
      '&albumAudioId=' + encodeURIComponent(song.albumAudioId || song.album_audio_id || song.mixSongId || '') +
      '&mixSongId=' + encodeURIComponent(song.mixSongId || '') +
      '&hqHash=' + encodeURIComponent(song.hqHash || song.hq_hash || '') +
      '&sqHash=' + encodeURIComponent(song.sqHash || song.sq_hash || '') +
      '&resHash=' + encodeURIComponent(song.resHash || song.res_hash || '') +
      '&vipRequired=' + encodeURIComponent(song.vipRequired || song.needVip || song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
      '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
      '&fee=' + encodeURIComponent(song.fee || song.Fee || '') +
      qualityParam, { timeoutMs: 9000 });
  }
  if (playbackProvider === 'qishui') {
    return apiJson('/api/qishui/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || '') + qualityParam, { timeoutMs: 9000 });
  }
  if (playbackProvider === 'spotify') {
    return apiJson('/api/spotify/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || song.spotifyId || '') +
      '&spotifyId=' + encodeURIComponent(song.spotifyId || '') +
      '&uri=' + encodeURIComponent(song.spotifyUri || song.uri || '') +
      qualityParam, { timeoutMs: 9000 });
  }
  return apiJson('/api/song/url?id=' + encodeURIComponent(song.id || '') + qualityParam, { timeoutMs: 9000 });
}

function consumeAlbumGaplessPreload(preload) {
  if (albumGaplessState.monitorTimer) {
    clearInterval(albumGaplessState.monitorTimer);
    albumGaplessState.monitorTimer = 0;
  }
  if (albumGaplessState.preload === preload) albumGaplessState.preload = null;
}

function startAlbumGaplessHandoff(preload, reason) {
  if (!preload || albumGaplessState.handoff) return false;
  if (!albumGaplessQueueCanAdvance(currentIdx)) return false;
  if (preload.index !== currentIdx + 1) return false;
  preload.releaseReason = reason || 'boundary';
  albumGaplessState.handoff = true;
  consumeAlbumGaplessPreload(preload);
  if (preload.song) {
    preload.song.__albumGaplessKey = albumGaplessState.albumKey;
    playQueue[preload.index] = hydrateCustomCover(preload.song);
  }
  Promise.resolve(playQueueAt(preload.index, {
    skipShuffleOrder: true,
    suppressPlayFailureNotice: true,
    preserveHomeState: true,
    albumGaplessHandoff: true,
    albumGaplessMixed: !!preload.mixStarted,
    albumGaplessReleaseReason: preload.releaseReason || reason || '',
    preloadedAudio: preload.media,
    preloadedData: preload.data,
    preloadedProxyAudioUrl: preload.proxyAudioUrl,
  })).catch(function (err) {
    console.warn('[AlbumGapless] handoff failed:', err);
    try { playQueueAt(preload.index, { skipShuffleOrder: true, suppressPlayFailureNotice: true, preserveHomeState: true }); } catch (e) { }
  }).finally(function () {
    albumGaplessState.handoff = false;
  });
  return true;
}

function armAlbumGaplessMonitor(token) {
  if (albumGaplessState.monitorTimer) clearInterval(albumGaplessState.monitorTimer);
  albumGaplessState.monitorTimer = setInterval(function () {
    var preload = albumGaplessState.preload;
    if (!preload || token !== trackSwitchToken || !albumGaplessQueueCanAdvance(currentIdx)) {
      clearAlbumGaplessPreload('album-gapless-monitor-invalid');
      return;
    }
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0 || !isFinite(audio.currentTime)) return;
    var remaining = audio.duration - audio.currentTime;
    if (remaining <= ALBUM_GAPLESS_MUTED_PREROLL_SECONDS) startAlbumGaplessPreroll(preload);
    if (!preload.media || preload.media.readyState < 2) return;
    var nowMs = performance.now();
    var tailProbe = albumGaplessTailSilenceProbe(remaining);
    var longTailSilence = remaining > ALBUM_GAPLESS_LONG_SILENCE_SECONDS;
    if (tailProbe.smoothedQuiet && (!longTailSilence || !tailProbe.residualTail)) {
      if (!preload.quietSince) preload.quietSince = nowMs;
    } else {
      preload.quietSince = 0;
    }
    if (tailProbe.directQuiet) {
      if (!preload.directQuietSince) preload.directQuietSince = nowMs;
    } else {
      preload.directQuietSince = 0;
    }
    var silenceHoldMs = longTailSilence ? ALBUM_GAPLESS_FAST_SILENCE_HOLD_MS : ALBUM_GAPLESS_SILENCE_HOLD_MS;
    var smoothedSilenceReady = !!(preload.quietSince && nowMs - preload.quietSince >= silenceHoldMs);
    var directHoldMs = tailProbe.deepQuiet ? ALBUM_GAPLESS_DEEP_SILENCE_HOLD_MS : ALBUM_GAPLESS_DIRECT_SILENCE_HOLD_MS;
    var directSilenceReady = !!(longTailSilence && preload.directQuietSince && nowMs - preload.directQuietSince >= directHoldMs);
    var silenceReady = smoothedSilenceReady || directSilenceReady;
    var boundaryReady = remaining <= ALBUM_GAPLESS_BOUNDARY_RELEASE_SECONDS;
    if (!silenceReady && !boundaryReady) return;
    startAlbumGaplessMix(preload, silenceReady ? (directSilenceReady ? 'tail-direct-silence-crossmix' : (longTailSilence ? 'tail-silence-fast-crossmix' : 'tail-silence-preroll-mix')) : 'boundary-crossmix-reset', remaining);
  }, 70);
}

async function scheduleAlbumGaplessPreloadForCurrent(token, reason) {
  if (!albumGaplessQueueCanAdvance(currentIdx) || token !== trackSwitchToken) {
    if (!albumGaplessState.handoff) clearAlbumGaplessPreload(reason || 'album-gapless-not-eligible');
    return false;
  }
  var nextIdx = currentIdx + 1;
  var nextSong = playQueue[nextIdx];
  var nextKey = queueItemKey(nextSong);
  if (albumGaplessState.preload && albumGaplessState.preload.index === nextIdx && albumGaplessState.preload.key === nextKey) return true;
  clearAlbumGaplessPreload(reason || 'album-gapless-new-preload');
  var serial = ++albumGaplessState.serial;
  try {
    var resolvedSong = nextSong;
    var data = await resolveAlbumGaplessPlaybackData(nextSong);
    if ((!data || !data.url) && typeof searchAlternatePlatformSong === 'function') {
      var alternate = await searchAlternatePlatformSong(nextSong);
      if (alternate) {
        alternate.__albumGaplessKey = albumGaplessState.albumKey;
        alternate.__albumTrackIndex = nextSong && nextSong.__albumTrackIndex;
        var alternateData = await resolveAlbumGaplessPlaybackData(alternate);
        if (alternateData && alternateData.url) {
          resolvedSong = alternate;
          data = alternateData;
        }
      }
    }
    if (serial !== albumGaplessState.serial || token !== trackSwitchToken || !albumGaplessQueueCanAdvance(currentIdx)) return false;
    if (!data || !data.url) return false;
    var proxyAudioUrl = '/api/audio?url=' + encodeURIComponent(data.url);
    var media = new Audio();
    media.crossOrigin = 'anonymous';
    media.preload = 'auto';
    media.volume = 0;
    media.src = proxyAudioUrl;
    await applyAudioOutputDevice(media);
    media.load();
    albumGaplessState.preload = {
      index: nextIdx,
      key: nextKey,
      token: token,
      serial: serial,
      media: media,
      data: data,
      song: resolvedSong,
      proxyAudioUrl: proxyAudioUrl,
    };
    armAlbumGaplessMonitor(token);
    return true;
  } catch (err) {
    if (serial === albumGaplessState.serial) console.warn('[AlbumGapless] preload failed:', err);
    return false;
  }
}

function playAlbumGaplessNextOnEnded(token) {
  if (!albumGaplessQueueCanAdvance(currentIdx)) return false;
  var nextIdx = currentIdx + 1;
  setTimeout(function () {
    if (token !== trackSwitchToken) return;
    playQueueAt(nextIdx, { skipShuffleOrder: true, suppressPlayFailureNotice: true, preserveHomeState: true });
  }, 0);
  return true;
}

async function playLocalQueueSong(song, idx, token, firstVisualPlay, opts, resumeAt) {
  opts = opts || {};
  if (!song || !song.localUrl) {
    showToast('本地文件已失效，请重新导入后继续');
    forcePlaybackControlsInteractive();
    return false;
  }
  currentLocalSong = song;
  playQueue[idx] = song;
  updateCustomCoverButton();
  document.getElementById('trial-banner').classList.remove('show');
  if (!audio) { audio = new Audio(); audio.crossOrigin = 'anonymous'; }
  else {
    audioFadeSerial++;
    clearAudioFadeTimers();
    audio.pause();
  }
  audio.autoplay = true;
  audio.preload = 'auto';
  resetPlaybackAudioGraphForSourceSwitch('local-track-switch');
  bindPlaybackProgressEvents(audio);
  applyVolumeToAudio();
  await applyAudioOutputDevice(audio);
  if (token !== trackSwitchToken) return false;
  audio.src = song.localUrl;
  updatePlaybackProgressUi();
  lyricSunEnergy = 0; lyricSunTarget = 0; lyricSunHold = 0; lyricSunAvg = 0; lyricSunPeak = 0.55;
  audio.onended = function () {
    if (token !== trackSwitchToken) return;
    finalizeListenSession(true);
    if (playAlbumGaplessNextOnEnded(token)) return;
    if (playMode === 'single') setTimeout(function () { playQueueAt(currentIdx, { autoRepeat: true, suppressPlayFailureNotice: true }); }, 0);
    else setTimeout(nextTrack, 0);
  };
  audio.onloadedmetadata = function () {
    if (token !== trackSwitchToken || !currentLocalSong || currentLocalSong.localKey !== song.localKey) return;
    var duration = audio && isFinite(audio.duration) ? audio.duration : 0;
    currentLocalSong.duration = duration;
    if (playQueue[idx]) playQueue[idx].duration = duration;
    if (lyricSourceMode === 'custom') applyCustomLyricState(currentLocalSong, true);
    safeRenderQueuePanel('local-metadata', { scrollCurrent: miniQueueOpen });
  };
  scheduleAudioResumePosition(audio, opts.resumeAt != null ? opts.resumeAt : resumeAt, token);
  if (resumeAt > 0) pendingPlaybackResumeAt = 0;
  audio.load();
  currentBeatMap = null;
  beatMapNextIdx = 0;
  resetAudioVisualState();
  resetBeatCameraSync(0);
  cancelBeatAnalysisTimer();
  cancelDjBeatAnalysisTimer();
  beatMapToken++;
  djBeatMapToken++;
  resetDjBeatMapState();
  setDjModeActive(false);
  var playbackStarted = await playAudio({ manual: !!opts.manual, silent: !!opts.startupAutoplay || !opts.manual, startupAutoplay: !!opts.startupAutoplay, trackSwitch: true, resumeRecovery: !!opts.resumeRecovery });
  if (token !== trackSwitchToken) return false;
  if (!playbackStarted) {
    forcePlaybackControlsInteractive();
    if (opts.startupAutoplay) {
      return false;
    }
    if (!opts.suppressPlayFailureNotice) {
      if (opts.manual) showToast('播放启动失败，请重新选择本地音乐');
      else showSourceFallbackNotice('本地音乐已载入', '点击播放器中间的播放按钮继续播放。');
    }
    return false;
  }
  forcePlaybackControlsInteractive();
  beginListenSession(song, null);
  if (typeof cancelPendingTrackFallbackLyrics === 'function') cancelPendingTrackFallbackLyrics();
  setOriginalLyricsState(withLyricFallback([]), false, 'fallback');
  applyPreferredLyricsForCurrent(true);
  safeRenderQueuePanel('play-local-queue', { scrollCurrent: miniQueueOpen });
  scheduleShelfRebuild('play-local-queue', true);
  scheduleAlbumGaplessPreloadForCurrent(token, 'local-started');
  setTimeout(function () {
    if (token === trackSwitchToken && currentLocalSong && currentLocalSong.localKey === song.localKey) {
      prepareLocalBeatAnalysis(currentLocalSong, song.localUrl);
    }
  }, firstVisualPlay ? 680 : 520);
  return true;
}

async function playQueueAt(idx, opts) {
  opts = opts || {};
  if (idx < 0 || idx >= playQueue.length) return;
  var albumGaplessHandoff = !!(opts.albumGaplessHandoff && opts.preloadedAudio && opts.preloadedData);
  var albumGaplessMixed = !!(albumGaplessHandoff && opts.albumGaplessMixed);
  var albumGaplessPreviousAudio = albumGaplessHandoff ? audio : null;
  var previousSongForTransition = currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  if (
    playMode === 'shuffle'
    && !opts.skipShuffleOrder
    && !opts.autoRepeat
    && !opts.qualitySwitch
    && !opts.resumeRecovery
    && !opts.fallbackDepth
    && typeof reorderQueueForShufflePlaybackOrder === 'function'
  ) {
    idx = reorderQueueForShufflePlaybackOrder(idx, { reason: 'shuffle-play-queue-at', renderPanel: false, rebuildShelf: false, persistSnapshot: false });
  }
  var qualitySwitch = !!opts.qualitySwitch;
  startupRestoreHomePending = false;
  markRenderInteraction(qualitySwitch ? 'quality-switch' : 'track-switch', qualitySwitch ? 520 : 1500);
  var playPhase = 'start';
  function markPlayPhase(name) { playPhase = name; }
  try {
    markPlayPhase('session-finalize');
    safePlaybackStep('session-finalize', function () { finalizeListenSession(false); });
    homeForcedOpen = false;
    if (!opts.preserveHomeState) homeSuppressed = false;
    currentIdx = idx;
    trackSwitchToken++;
    markPlayPhase('cancel-previous-track');
    cancelBeatAnalysisTimer();
    cancelBeatPrefetchTimer();
    if (!albumGaplessHandoff) clearAlbumGaplessPreload('track-switch');
    if (localBeatAnalysis.active) cancelLocalBeatAnalysis();
    closeGsapModal(document.getElementById('local-beat-modal'));
    beatMapToken++;
    var token = trackSwitchToken;
    var firstVisualPlay = !firstPlayDone;
    markPlayPhase('track-setup');
    var song = safePlaybackStep('hydrate-song', function () { return hydrateCustomCover(playQueue[idx]); }) || playQueue[idx];
    playQueue[idx] = song;
    var sameAlbumCoverSwitch = albumGaplessSameAlbumCover(previousSongForTransition, song);
    var earlyLyricFetchStarted = false;
    function startTrackLyricFetch() {
      if (earlyLyricFetchStarted) return false;
      if (!song || song.type === 'podcast' || song.type === 'local' || song.source === 'local' || song.localUrl) return false;
      if (typeof fetchLyric !== 'function') return false;
      earlyLyricFetchStarted = true;
      setTimeout(function () {
        if (token === trackSwitchToken) fetchLyric(song, token);
      }, 0);
      return true;
    }
    var restoreResumeAt = 0;
    if (
      opts.resumeAt == null
      && pendingPlaybackResumeAt > 0
      && restoredLastPlaybackSnapshot
      && restoredLastPlaybackSnapshot.current
      && queueItemKey(song) === queueItemKey(restoredLastPlaybackSnapshot.current)
      && !opts.autoRepeat
      && !opts.qualitySwitch
    ) {
      restoreResumeAt = pendingPlaybackResumeAt;
    }
    if (restoreResumeAt > 0 && typeof requestStageLyricRestoreWarmup === 'function') {
      requestStageLyricRestoreWarmup(restoreResumeAt, token, 'startup-restore');
    }
    var playbackContext = opts.context || (song && song.radioContext) || null;
    activeRadioContext = playbackContext || null;
    safeRenderQueuePanel('play-queue-at-switch', { scrollCurrent: miniQueueOpen });
    safePlaybackStep('shelf-preview-suppress', suppressShelfPreviewForPlaybackSwitch);
    if (!albumGaplessHandoff) pauseCurrentAudioForTrackSwitch();
    else {
      playToggleBusy = false;
      forcePlaybackControlsInteractive();
    }
    var bmKey = safePlaybackStep('beatmap-key', function () { return beatMapSongKey(song); }) || '';
    var podcastDjMode = !!safePlaybackStep('podcast-mode', function () { return isPodcastSong(song); });
    safePlaybackStep('dj-mode', function () { setDjModeActive(podcastDjMode, song); });
    safePlaybackStep('visual-switch', switchPlaybackVisualToEmily);
    currentLocalSong = null;
    safePlaybackStep('cover-button', updateCustomCoverButton);
    safePlaybackStep('like-buttons', function () { updateLikeButtons(song); });
    safePlaybackStep('like-status', function () { syncLikeStatusForSong(song); });
    safePlaybackStep('cinema-track-profile', function () { if (!qualitySwitch) resetCinemaTrackProfile(song); });
    safePlaybackStep('empty-home', function () { if (!opts.preserveHomeState) updateEmptyHomeVisibility(); });
    safePlaybackStep('track-ui', function () {
      document.getElementById('hint').classList.add('hidden');
      document.getElementById('thumb-title').textContent = song.name;
      document.getElementById('thumb-artist').textContent = song.artist;
      updateControlTrackInfo(song);
      document.getElementById('thumb-wrap').classList.add('visible');
    });
    markPlayPhase('lyric-prep');
    safePlaybackStep('lyric-prep', function () {
      if (qualitySwitch) {
        if (typeof cancelPendingTrackFallbackLyrics === 'function') cancelPendingTrackFallbackLyrics();
        if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume('quality-switch-preserve-lyrics');
        applyPreferredLyricsForCurrent(true);
      } else {
        if (typeof resetLyricsForTrackSwitch === 'function') resetLyricsForTrackSwitch(song, token);
        else {
          var initialLyricLines = withLyricFallback([]);
          setOriginalLyricsState(initialLyricLines, false, 'fallback');
          applyPreferredLyricsForCurrent(true);
        }
        startTrackLyricFetch();
        if (typeof scheduleTrackSwitchFallbackLyrics === 'function') scheduleTrackSwitchFallbackLyrics(song, token, 1500);
      }
    });

    markPlayPhase('cover-load');
    safePlaybackStep('cover-load', function () {
      if (qualitySwitch) return;
      var customCover = getCustomCoverForSong(song);
      var coverOpts = {
        trackToken: token,
        deferHeavy: true,
        delay: firstVisualPlay ? 320 : (sameAlbumCoverSwitch ? 80 : 520),
        timeout: firstVisualPlay ? 1300 : 1700,
        seamlessTrackSwitch: !firstVisualPlay,
        noCoverTransition: sameAlbumCoverSwitch,
        colorMixDuration: sameAlbumCoverSwitch ? 1 : undefined
      };
      if (customCover) applyCoverDataUrl(customCover, coverOpts);
      else loadCoverFromUrl(song.cover ? coverUrlWithSize(song.cover, 400) : '', coverOpts);
    });
    safePlaybackStep('trial-banner-reset', function () { document.getElementById('trial-banner').classList.remove('show'); });
    if (song.type === 'local' || song.source === 'local' || song.localUrl) {
      markPlayPhase('local-audio');
      await playLocalQueueSong(song, idx, token, firstVisualPlay, opts, restoreResumeAt);
      return;
    }
    safePlaybackStep('show-loading', function () { showLoading({ trackSwitch: true, seamlessCover: true }); });
    if (!qualitySwitch) lyricSunEnergy = 0; lyricSunTarget = 0; lyricSunHold = 0; lyricSunAvg = 0; lyricSunPeak = 0.55;

    // 首次播放: 粒子从暗处浮出 (Apple 风格)
    if (firstVisualPlay) {
      safePlaybackStep('first-visual-alpha', function () {
        firstPlayDone = true;
        tweenParticleAlpha(uniforms.uAlpha.value || 0, 1.0, 220);
      });
    }

    try {
      markPlayPhase('source-url');
      var providerKey = songProviderKey(song);
      var isYtmusicPlayback = providerKey === 'ytmusic';
      var playbackProvider = normalizePlaybackProvider(providerKey);
      var isQQPlayback = playbackProvider === 'qq';
      var isKugouPlayback = playbackProvider === 'kugou';
      var isQishuiPlayback = playbackProvider === 'qishui';
      var isSpotifyPlayback = playbackProvider === 'spotify';
      var requestedQuality = normalizePlaybackQualityForProvider(opts.qualityOverride || getProviderPlaybackQuality(playbackProvider), playbackProvider);
      if (playbackProvider === 'netease' && requestedQuality === 'jymaster' && !hasProviderSvip('netease', loginStatus)) requestedQuality = 'hires';
      // 天花板只限本首歌的降级重试(带 qualityOverride);换新歌就清零重试用户选的音质——
      // 否则一首歌 Hi-Res 启动失败会把整个会话所有歌都静默压到低档(用户实测"选 Hi-Res 一直只给 320")
      if (isQQPlayback && !opts.qualityOverride) qqPlaybackQualityCeiling = '';
      if (isQQPlayback && qqPlaybackQualityCeiling && (requestedQuality === 'jymaster' || requestedQuality === 'hires' || requestedQuality === 'lossless')) {
        requestedQuality = qqPlaybackQualityCeiling;
      }
      var runtimeQualityCap = playbackQualityCapValue(song, playbackProvider);
      if (playbackQualityAboveCap(requestedQuality, playbackProvider, runtimeQualityCap)) {
        requestedQuality = runtimeQualityCap;
      }
      var qualityParam = '&quality=' + encodeURIComponent(requestedQuality);
      var data;
      if (albumGaplessHandoff) {
        data = opts.preloadedData;
      } else if (isYtmusicPlayback) {
        data = await apiJson('/api/ytmusic/song/url?id=' + encodeURIComponent(song.videoId || song.id || ''));
      } else if (isQQPlayback) {
        data = await apiJson('/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') + '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') + qqPlaybackEvidenceQuery(song) + qualityParam);
      } else if (isKugouPlayback) {
        data = await apiJson('/api/kugou/song/url?hash=' + encodeURIComponent(song.hash || song.fileHash || song.audioHash || song.id || '') +
          '&albumId=' + encodeURIComponent(song.albumId || song.album_id || '') +
          '&albumAudioId=' + encodeURIComponent(song.albumAudioId || song.album_audio_id || song.mixSongId || '') +
          '&mixSongId=' + encodeURIComponent(song.mixSongId || '') +
          '&hqHash=' + encodeURIComponent(song.hqHash || song.hq_hash || '') +
          '&sqHash=' + encodeURIComponent(song.sqHash || song.sq_hash || '') +
          '&resHash=' + encodeURIComponent(song.resHash || song.res_hash || '') +
          '&vipRequired=' + encodeURIComponent(song.vipRequired || song.needVip || song.onlyVipPlayable || song.only_vip_playable ? '1' : '') +
          '&privilege=' + encodeURIComponent(song.privilege || song.Privilege || song.mediaPrivilege || song.media_privilege || '') +
          '&fee=' + encodeURIComponent(song.fee || song.Fee || '') +
          qualityParam);
      } else if (isQishuiPlayback) {
        data = await apiJson('/api/qishui/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || '') + qualityParam);
      } else if (isSpotifyPlayback) {
        data = await apiJson('/api/spotify/song/url?id=' + encodeURIComponent(song.id || song.providerSongId || song.spotifyId || '') +
          '&spotifyId=' + encodeURIComponent(song.spotifyId || '') +
          '&uri=' + encodeURIComponent(song.spotifyUri || song.uri || '') +
          qualityParam);
      } else {
        data = await apiJson('/api/song/url?id=' + song.id + qualityParam);
      }
      if (token !== trackSwitchToken) return;
      if (data) {
        song.resolvedPlaybackProvider = isYtmusicPlayback ? 'ytmusic' : playbackProvider;
        song.playbackLevel = data.level || song.playbackLevel || '';
        song.playbackSource = data.source || data.provider || song.playbackSource || '';
        song.trial = !!(song.trial || data.trial);
        song.vipRequired = !!(
          song.vipRequired ||
          data.trial ||
          data.needVip ||
          data.need_vip ||
          data.vipRequired ||
          data.onlyVipPlayable ||
          data.only_vip_playable ||
          (data.restriction && /vip_required|paid_required|trial_only|need_vip|only_vip/i.test(String(data.restriction.category || data.restriction.reason || data.restriction.message || ''))) ||
          /vip_required|paid_required|trial_only|need_vip|only_vip/i.test(String(data.category || data.reason || data.error || data.message || '')) ||
          (typeof songRequiresVip === 'function' && songRequiresVip(Object.assign({}, song, data)))
        );
        if (typeof updateControlTrackInfo === 'function') updateControlTrackInfo(song);
        if (isKugouPlayback && typeof applyKugouPlaybackStatusEvidence === 'function') applyKugouPlaybackStatusEvidence(data);
        if (isQQPlayback && typeof applyQQPlaybackStatusEvidence === 'function') applyQQPlaybackStatusEvidence(data, song);
      }
      var retryPlaybackOpts = Object.assign({}, opts, { resumeAt: opts.resumeAt != null ? opts.resumeAt : restoreResumeAt });
      if (!data.url) {
        if (isQQPlayback && await retryQQPlaybackWithCompatibleQuality(song, idx, token, retryPlaybackOpts, data, requestedQuality)) return;
        if (await tryAutoPlaybackFallback(song, data, idx, token, retryPlaybackOpts)) return;
        if (opts.startupAutoplay) {
          markQueueItemPlaybackFailed(idx);
          return false;
        }
        handlePlaybackUnavailable(song, data);
        return;
      }
      var resolvedQualityText = playbackResolvedQualityText(data, playbackProvider);
      // 记录本次实际下发的音质档位,音质胶囊按实际显示(用户反馈:选 Hi-Res 实际只给 320 却不提示)
      window.__playbackResolvedLevel = data.level || '';
      if (typeof updatePlaybackQualityUi === 'function') updatePlaybackQualityUi();
      var qualityDowngraded = !!(data && data.level && playbackQualityWasDowngraded(requestedQuality, data.level, playbackProvider));
      if (qualityDowngraded) markPlaybackQualityRuntimeCap(song, playbackProvider, data.level, 'resolved-lower');
      if (!opts.startupAutoplay && qualityDowngraded) {
        showSourceFallbackNotice((isQQPlayback ? 'QQ' : (isKugouPlayback ? '酷狗' : (isQishuiPlayback ? '汽水' : '网易云'))) + ' 音质自动降级', '请求 ' + playbackQualityLabel(requestedQuality, playbackProvider) + '，实际播放 ' + resolvedQualityText + '。' + (isQQPlayback ? '通常是该曲目无更高音质版权或需更高会员。' : ''));
      } else if (!opts.startupAutoplay && opts.qualitySwitch) {
        showSourceFallbackNotice('音质已切换', '实际播放: ' + resolvedQualityText + '。');
      }
      if (data.trial) {
        var txt;
        if (data.loggedIn && data.vipLevel === 'svip') txt = '此歌曲需要单曲、专辑购买或更高权限';
        else if (data.loggedIn && data.vipLevel === 'vip') txt = '此歌曲需要 SVIP 或购买 · 当前仅播放试听片段';
        else if (data.loggedIn) txt = '此歌曲需 VIP · 当前仅播放试听片段';
        else txt = '当前未登录 · 仅播放试听片段';
        document.getElementById('trial-text').textContent = txt;
        var trialLoginBtn = document.getElementById('trial-login-btn');
        if (trialLoginBtn) {
          trialLoginBtn.style.display = data.loggedIn ? 'none' : '';
          trialLoginBtn.onclick = function () { openProviderLogin(playbackProvider); };
        }
        document.getElementById('trial-banner').classList.add('show');
      }
      markPlayPhase('audio-element');
      var proxyAudioUrl = opts.preloadedProxyAudioUrl || '/api/audio?url=' + encodeURIComponent(data.url);
      if (albumGaplessHandoff) {
        audioFadeSerial++;
        clearAudioFadeTimers();
        if (albumGaplessPreviousAudio) albumGaplessPreviousAudio.onended = null;
        audio = opts.preloadedAudio;
        audio.crossOrigin = 'anonymous';
        audio.autoplay = true;
        audio.preload = 'auto';
        if (!audio.src) audio.src = proxyAudioUrl;
        if (!albumGaplessMixed) audio.volume = 0;
        else audio.muted = false;
      } else if (!audio) {
        audio = new Audio();
        audio.crossOrigin = 'anonymous';
      } else {
        audioFadeSerial++;
        clearAudioFadeTimers();
        audio.pause();
      }
      audio.autoplay = true;
      audio.preload = 'auto';
      resetPlaybackAudioGraphForSourceSwitch(albumGaplessHandoff ? 'album-gapless-handoff' : 'track-switch');
      bindPlaybackProgressEvents(audio);
      if (albumGaplessHandoff) setAudioOutputGainImmediate(albumGaplessMixed ? targetVolume : audioSilentFloor());
      else applyVolumeToAudio();
      await applyAudioOutputDevice(audio);
      if (token !== trackSwitchToken) return false;
      if (!albumGaplessHandoff) audio.src = proxyAudioUrl;
      updatePlaybackProgressUi();
      audio.onended = function () {
        if (token !== trackSwitchToken) return;
        finalizeListenSession(true);
        if (playAlbumGaplessNextOnEnded(token)) return;
        if (playMode === 'single') setTimeout(function () { playQueueAt(currentIdx, { autoRepeat: true, suppressPlayFailureNotice: true }); }, 0);
        else setTimeout(nextTrack, 0);
      };
      scheduleAudioResumePosition(audio, opts.resumeAt != null ? opts.resumeAt : restoreResumeAt, token);
      if (restoreResumeAt > 0) pendingPlaybackResumeAt = 0;
      if (!albumGaplessHandoff) audio.load();
      markPlayPhase(qualitySwitch ? 'visual-prep-skip' : 'visual-prep');
      if (qualitySwitch) {
        if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume('quality-switch-audio-ready');
      } else try {
        // 重置 beatmap 状态
        currentBeatMap = null;
        beatMapNextIdx = 0;
        resetAudioVisualState();
        resetBeatCameraSync(0);
        cancelBeatAnalysisTimer();
        beatMapToken++;
        var bmTok = beatMapToken;
        if (podcastDjMode) {
          // 播客走独立 DJ 离线锁拍系统, 不写入普通歌曲 beatMap.
          djBeatMapToken++;
          cancelDjBeatAnalysisTimer();
          resetDjBeatMapState();
          currentBeatMap = null;
          beatMapNextIdx = 0;
          var djTok = djBeatMapToken;
          var djKey = djSongKey(song);
          if (djBeatMapCache[djKey]) {
            currentDjBeatMap = djBeatMapCache[djKey];
            applyPodcastDjProfileFromMap(currentDjBeatMap);
            syncPodcastDjMapCursor(audio ? audio.currentTime : 0, true);
            hideBeatChip();
            notifyDesktopLyricsBeatMapReady();
            console.log('podcast DJ beatmap 缓存命中:', currentDjBeatMap.cameraBeats.length, '个主拍');
          } else {
            showBeatChip('DJ 离线锁拍准备中…');
            var djDurationSec = Math.max(0, Number(song.duration) || 0);
            if (djDurationSec > 10000) djDurationSec /= 1000;
            schedulePodcastDjAnalysis(djKey, data.url, djTok, djDurationSec);
          }
          maybeAnnounceDjMode();
        } else if (bmKey && beatMapCache[bmKey]) {
          // 如果缓存有, 直接用
          currentBeatMap = beatMapCache[bmKey];
          applyCinemaProfileFromBeatMap(currentBeatMap);
          syncBeatMapPlaybackCursor(audio ? audio.currentTime : 0);
          notifyDesktopLyricsBeatMapReady();
          console.log('beatmap 缓存命中:', currentBeatMap.kicks.length, '个鼓点');
          scheduleQueueBeatPrefetch(idx, 2600);
        } else {
          var diskBeatMap = bmKey ? await readBeatDiskCache(bmKey) : null;
          if (diskBeatMap) {
            currentBeatMap = diskBeatMap;
            applyCinemaProfileFromBeatMap(currentBeatMap);
            syncBeatMapPlaybackCursor(audio ? audio.currentTime : 0);
            notifyDesktopLyricsBeatMapReady();
            console.log('beatmap D盘缓存命中:', currentBeatMap.kicks.length, '个鼓点');
            scheduleQueueBeatPrefetch(idx, 2600);
          } else {
            // 后台延迟分析, 避免新歌刚开始播放时抢占解码和渲染资源;
            // Hi-Res/无损 FLAC 标记 heavyLossless: 分析层换 320k 流, 消除边播边全量解码大文件的爆音
            scheduleBeatAnalysis(bmKey || song.id, proxyAudioUrl, bmTok, song, {
              heavyLossless: /\.flac([?#]|$)/i.test(String(data.url || '')) || data.level === 'hires' || data.level === 'lossless' || data.level === 'jymaster'
            });
          }
        }
      } catch (visualErr) {
        console.warn('[PlaybackVisualPrep]', song && song.name, visualErr);
        currentBeatMap = null;
        beatMapNextIdx = 0;
        safePlaybackStep('visual-prep-hide-chip', hideBeatChip);
      }
      if (token !== trackSwitchToken) return false;
      markPlayPhase('audio-start');
      var playbackStarted = await playAudio({ manual: !!opts.manual, silent: isQQPlayback || !!opts.startupAutoplay || !opts.manual, startupAutoplay: !!opts.startupAutoplay, trackSwitch: true, resumeRecovery: !!opts.resumeRecovery, fade: albumGaplessHandoff ? false : opts.fade });
      if (token !== trackSwitchToken) return false;
      if (!playbackStarted) {
        if (isQQPlayback && await retryQQPlaybackWithCompatibleQuality(song, idx, token, retryPlaybackOpts, data, requestedQuality)) return;
        forcePlaybackControlsInteractive();
        if (opts.startupAutoplay) {
          return false;
        }
        if (!opts.suppressPlayFailureNotice) {
          if (opts.manual) {
            showToast('播放启动失败，请重新选择歌曲');
          } else {
            showSourceFallbackNotice('歌曲已载入', '点击播放器中间的播放按钮继续播放。');
          }
        }
        return;
      }
      forcePlaybackControlsInteractive();
      if (albumGaplessHandoff && albumGaplessPreviousAudio && albumGaplessPreviousAudio !== audio) {
        setTimeout(function () {
          try {
            albumGaplessPreviousAudio.pause();
            albumGaplessPreviousAudio.removeAttribute('src');
            albumGaplessPreviousAudio.load();
          } catch (e) { }
        }, 220);
      }
      markPlayPhase('session-begin');
      safePlaybackStep('listen-session-begin', function () { beginListenSession(song, playbackContext); });
      markPlayPhase('lyrics-fetch');
      if (song.type === 'podcast') {
        if (typeof cancelPendingTrackFallbackLyrics === 'function') cancelPendingTrackFallbackLyrics();
        safePlaybackStep('podcast-lyrics', function () {
          var podcastLyricLines = withLyricFallback([]);
          setOriginalLyricsState(podcastLyricLines, false, 'fallback');
          applyPreferredLyricsForCurrent(true);
        });
      } else if (!qualitySwitch) {
        if (!earlyLyricFetchStarted) fetchLyric(song, token);
      } else {
        if (typeof cancelPendingTrackFallbackLyrics === 'function') cancelPendingTrackFallbackLyrics();
        if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume('quality-switch-lyrics-kept');
      }
      if (!qualitySwitch) {
        safeRenderQueuePanel('play-queue-at');
        scheduleShelfRebuild('play-queue-at', true);
      }
      scheduleAlbumGaplessPreloadForCurrent(token, albumGaplessHandoff ? 'album-gapless-handoff-started' : 'track-started');
      safePlaybackStep('shelf-preview-suppress-end', suppressShelfPreviewForPlaybackSwitch);
    } catch (err) {
      console.error('Play failed:', { phase: playPhase, error: err }, err);
      hideLoading();
      forcePlaybackControlsInteractive();
      if (opts.startupAutoplay) {
        return false;
      }
      if (!isPlaybackRecursionError(err) && token === trackSwitchToken && !opts.manual && playQueue.length > 1) {
        skipFailedQueueItem(idx, token, '当前歌曲加载失败，正在尝试队列里的下一首。');
        return;
      }
      if (opts.suppressPlayFailureNotice) return false;
      var failText = playbackFailureToastText(err);
      showToast(failText);
      if (typeof showSourceFallbackNotice === 'function') showSourceFallbackNotice('播放失败', failText);
    }
  } catch (setupErr) {
    console.error('Play setup failed:', { phase: playPhase, error: setupErr }, setupErr);
    hideLoading();
    forcePlaybackControlsInteractive();
    if (opts.startupAutoplay) {
      return false;
    }
    if (!isPlaybackRecursionError(setupErr) && typeof token !== 'undefined' && token === trackSwitchToken && !opts.manual && playQueue.length > 1) {
      skipFailedQueueItem(idx, token, '当前歌曲切换失败，正在尝试队列里的下一首。');
      return;
    }
    if (opts.suppressPlayFailureNotice) return false;
    var setupFailText = playbackFailureToastText(setupErr);
    showToast(setupFailText);
    if (typeof showSourceFallbackNotice === 'function') showSourceFallbackNotice('播放失败', setupFailText);
  }
}
