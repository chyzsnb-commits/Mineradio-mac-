function pauseCurrentAudioForTrackSwitch() {
  playToggleBusy = false;
  if (!audio) return;
  try {
    markPlaybackTrackTeardown(audio, trackSwitchToken);
    audioFadeSerial++;
    clearAudioFadeTimers();
    audio.onended = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch (e) { }
  playing = false;
  setPlayIcon(false);
  syncPlaybackStateFromAudioEvent('track-switch');
  if (typeof syncAudioOutputMirrors === 'function') syncAudioOutputMirrors('track-switch');
}

function markPlaybackTrackTeardown(media, token) {
  if (!media) return false;
  media._mineradioTrackTeardown = true;
  media._mineradioTrackTeardownToken = Number(token) || 0;
  return true;
}

function isPlaybackTrackTeardownEvent(media, name) {
  if (!media || (name !== 'pause' && name !== 'abort' && name !== 'emptied')) return false;
  return media._mineradioTrackTeardown === true;
}

function clearPlaybackTrackTeardown(media) {
  if (!media) return;
  media._mineradioTrackTeardown = false;
  media._mineradioTrackTeardownToken = -1;
}

function cancelTrackNavigationRequest(reason) {
  if (!trackNavigationState) return false;
  var hadPending = !!(
    trackNavigationState.timer ||
    trackNavigationState.scheduled ||
    trackNavigationState.inProgress ||
    trackNavigationState.promise
  );
  if (!hadPending) return false;
  if (trackNavigationState.timer) clearTimeout(trackNavigationState.timer);
  trackNavigationState.timer = 0;
  trackNavigationState.scheduled = false;
  trackNavigationState.inProgress = false;
  trackNavigationState.desiredIndex = -1;
  trackNavigationState.pendingDelta = 0;
  trackNavigationState.manual = false;
  trackNavigationState.serial += 1;
  cancelPlaybackSourceRequest(reason || 'direct-play');
  var settle = trackNavigationState.settle;
  trackNavigationState.settle = null;
  trackNavigationState.promise = null;
  if (settle) settle(false);
  return true;
}

function clearFailedPlaybackAudioSource(token) {
  if (token !== trackSwitchToken || !audio) return false;
  try {
    markPlaybackTrackTeardown(audio, token);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch (e) { }
  playing = false;
  setPlayIcon(false);
  syncPlaybackStateFromAudioEvent('track-failed');
  if (typeof syncAudioOutputMirrors === 'function') syncAudioOutputMirrors('track-failed');
  return true;
}

function cancelPlaybackSourceRequest(reason) {
  var active = playbackSourceRequestState;
  if (!active) return false;
  if (active.timer) clearTimeout(active.timer);
  active.timer = 0;
  var controller = active.controller;
  var request = active.request;
  active.controller = null;
  active.request = null;
  active.token = 0;
  if (!controller || !controller.abort) return false;
  if (request) request.abortReason = reason || 'superseded';
  try { controller.abort(request && request.abortReason); } catch (e) { try { controller.abort(); } catch (ignored) { } }
  return true;
}

function beginPlaybackSourceRequest(token, timeoutMs) {
  cancelPlaybackSourceRequest();
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var request = {
    token: Number(token) || 0,
    controller: controller,
    signal: controller ? controller.signal : null,
    abortReason: '',
    timer: 0,
  };
  playbackSourceRequestState.token = request.token;
  playbackSourceRequestState.controller = controller;
  playbackSourceRequestState.request = request;
  if (controller && timeoutMs > 0) {
    request.timer = setTimeout(function () {
      if (playbackSourceRequestState.controller !== controller) return;
      playbackSourceRequestState.timer = 0;
      request.abortReason = 'timeout';
      try { controller.abort('timeout'); } catch (e) { try { controller.abort(); } catch (ignored) { } }
    }, timeoutMs);
    playbackSourceRequestState.timer = request.timer;
  }
  return request;
}

function finishPlaybackSourceRequest(request) {
  if (!request) return false;
  if (request.timer) clearTimeout(request.timer);
  request.timer = 0;
  if (playbackSourceRequestState.request !== request || playbackSourceRequestState.controller !== request.controller || playbackSourceRequestState.token !== request.token) return false;
  playbackSourceRequestState.timer = 0;
  playbackSourceRequestState.controller = null;
  playbackSourceRequestState.request = null;
  playbackSourceRequestState.token = 0;
  return true;
}

function playbackSourceRequestWasSuperseded(request, err) {
  return !!(request && request.abortReason === 'superseded' && err && err.name === 'AbortError');
}

function commitPlaybackTrackUi(song, token) {
  if (!song || token !== trackSwitchToken) return false;
  safePlaybackStep('track-ui', function () {
    document.getElementById('hint').classList.add('hidden');
    document.getElementById('thumb-title').textContent = song.name;
    document.getElementById('thumb-artist').textContent = song.artist;
    updateControlTrackInfo(song);
    document.getElementById('thumb-wrap').classList.add('visible');
  });
  return true;
}

function syncPlaybackStateFromAudioEvent(reason) {
  if (typeof updatePlaybackResumePauseMarker === 'function') updatePlaybackResumePauseMarker(reason);
  var isPlaying = !!(audio && audio.src && !audio.paused && !audio.ended);
  playing = isPlaying;
  if (window.desktopWindow && typeof window.desktopWindow.setMemoryPlaybackState === 'function') {
    window.desktopWindow.setMemoryPlaybackState({ playing: isPlaying, reason: reason || '' });
  }
  if (typeof syncTouchBarTrack === 'function') syncTouchBarTrack(null, isPlaying);
  setPlayIcon(isPlaying);
  if (!isPlaying) hideLoading();
  if (reason === 'play' || reason === 'playing') {
    switchPlaybackVisualToEmily();
    if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume(reason);
  }
  if (isPlaying
      && typeof singingVocalProcessingNeeded === 'function'
      && singingVocalProcessingNeeded()
      && typeof prepareSingingVocalProcessor === 'function') prepareSingingVocalProcessor();
  if (typeof syncSingingMicPowerState === 'function') syncSingingMicPowerState({ silent: true, reason: reason });
  if (isPlaying && typeof requestAiStemForCurrentTrack === 'function') requestAiStemForCurrentTrack();
  forcePlaybackControlsInteractive();
}

function isPlaybackRecursionError(err) {
  var msg = String((err && err.message) || err || '');
  return err instanceof RangeError || /maximum call stack size exceeded/i.test(msg);
}

function safePlaybackStep(label, fn) {
  try {
    return fn();
  } catch (err) {
    console.warn('[PlaybackSetupStep]', label, err);
    return null;
  }
}

function playbackFailureNoticeFromError(err) {
  if (typeof playbackRestrictionNotice !== 'function') return null;
  var msg = String(err && err.message ? err.message : (err || '')).trim();
  if (!msg) return null;
  var lower = msg.toLowerCase();
  var category = '';
  if (/vip_required|paid_required|trial_only|need_vip|only_vip|member|vip|会员|付费|购买/.test(lower + msg)) category = 'vip_required';
  else if (/401|403|login_required|auth|cookie|credential|unauthorized|forbidden/.test(lower)) category = 'login_required';
  else if (/copyright|not playable|unavailable/.test(lower)) category = 'copyright_unavailable';
  else if (/url.*empty|no url|no supported source/.test(lower)) category = 'url_unavailable';
  if (!category) return null;
  var song = playQueue && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
  return playbackRestrictionNotice(song, { reason: category, message: msg });
}

function playbackFailureToastText(err) {
  var contextualNotice = playbackFailureNoticeFromError(err);
  if (contextualNotice) return contextualNotice.title + '：' + contextualNotice.body;
  if (isPlaybackRecursionError(err)) return '播放准备异常，已保持播放器可操作';
  var msg = String(err && err.message ? err.message : (err || '')).trim();
  var lower = msg.toLowerCase();
  if (/notallowederror|play\(\) failed|user gesture|autoplay/.test(lower)) return '播放失败：浏览器拦截了自动播放，请点一次播放按钮';
  if (/notsupportederror|no supported source|decode|media_err_decode/.test(lower)) return '播放失败：音频格式或解码失败，建议换源或降低音质';
  if (/notfounderror|setSinkId|sink|output device|audio output/.test(lower)) return '播放失败：当前输出设备不可用，请切回系统默认输出';
  if (/aborterror|aborted|interrupted/.test(lower)) return '播放已被新的切歌操作中断';
  if (/network|failed to fetch|timeout|econnreset|etimedout|err_connection|http 5|502|503|504/.test(lower)) return '播放失败：音频网络请求超时或服务端不可用';
  if (/401|403|login_required|auth|cookie|credential|unauthorized|forbidden/.test(lower)) return '播放失败：平台登录态或播放授权失效，请重新登录对应接口';
  if (/vip_required|paid_required|trial_only|need_vip|only_vip|member/.test(lower)) return '播放失败：歌曲需要 VIP、购买或更高权限';
  if (/copyright|unavailable|not playable|url.*empty|no url/.test(lower)) return '播放失败：平台没有返回可播放地址，建议换源';
  return '播放失败：' + (msg || '未知原因，请尝试换源或重新登录');
}
function scheduleAudioResumePosition(media, seconds, token) {
  seconds = Math.max(0, Number(seconds) || 0);
  if (!media || seconds < 0.35) return;
  var applied = false;
  function applyResume() {
    if (applied || token !== trackSwitchToken || !media) return;
    var duration = Number(media.duration) || 0;
    var target = duration > 0 ? Math.min(seconds, Math.max(0, duration - 0.45)) : seconds;
    try {
      media.currentTime = target;
      applied = true;
      if (typeof syncBeatMapPlaybackCursor === 'function') syncBeatMapPlaybackCursor(target, true);
      if (typeof syncPodcastDjMapCursor === 'function') syncPodcastDjMapCursor(target, true);
      updatePlaybackProgressUi();
    } catch (e) { }
  }
  media.addEventListener('loadedmetadata', applyResume, { once: true });
  media.addEventListener('canplay', applyResume, { once: true });
  setTimeout(applyResume, 520);
  applyResume();
}
