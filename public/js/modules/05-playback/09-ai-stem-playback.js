'use strict';

var aiStemPlaybackOperationSerial = 0;

function aiStemPlaybackActive() {
  return !!(aiStemRuntime && aiStemRuntime.active && aiStemVocalAudio);
}

function aiStemCurrentSong() {
  return Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
}

function aiStemTrackKey(song) {
  song = song || aiStemCurrentSong();
  if (!song) return '';
  var base = typeof queueItemKey === 'function'
    ? queueItemKey(song)
    : String(song.provider || song.source || '') + ':' + String(song.id || song.mid || song.localKey || song.name || '');
  var quality = typeof currentQuality === 'string' ? currentQuality : '';
  return base ? base + (quality ? '|quality:' + quality : '') : '';
}

function aiStemRequestAudioUrl(media) {
  if (!media) return '';
  var candidates = [String(media.src || ''), String(media.currentSrc || '')];
  for (var i = 0; i < candidates.length; i++) {
    if (!candidates[i]) continue;
    try {
      var parsed = new URL(candidates[i], window.location.href);
      if (parsed.pathname === '/api/audio') return parsed.href;
    } catch (e) {}
  }
  return candidates[0] || candidates[1] || '';
}

function beginAiStemPlaybackOperation(trackKey) {
  return {
    serial: ++aiStemPlaybackOperationSerial,
    trackSwitchToken: Number(trackSwitchToken) || 0,
    trackKey: String(trackKey || ''),
  };
}

function aiStemPlaybackOperationCurrent(operation, requireAiMode) {
  if (!operation || operation.serial !== aiStemPlaybackOperationSerial) return false;
  if (operation.trackSwitchToken !== (Number(trackSwitchToken) || 0)) return false;
  if (operation.trackKey && operation.trackKey !== aiStemTrackKey()) return false;
  return !requireAiMode || singingSeparationMode === 'ai';
}

function releaseAiStemMedia(media) {
  if (!media) return;
  try { media.pause(); media.removeAttribute('src'); media.load(); } catch (e) {}
}

function abandonAiStemActivation(operation, vocalMedia) {
  releaseAiStemMedia(vocalMedia);
  if (aiStemVocalAudio === vocalMedia) {
    disposeAiStemSecondaryAudio();
    if (aiStemRuntime && aiStemRuntime.trackKey === operation.trackKey) {
      setAiStemRuntime({ active: false, original: null, status: 'idle', stage: 'idle', percent: 0 });
    }
  }
  return false;
}

function applyAiStemLevels() {
  if (!aiStemAccompanimentGain || !aiStemVocalGain) return false;
  aiStemAccompanimentGain.gain.value = Math.max(0, Math.min(1, Number(singingAccompanimentLevel) || 0));
  aiStemVocalGain.gain.value = Math.max(0, Math.min(1, Number(singingVocalLevel) || 0));
  return true;
}

function syncAiStemSecondaryForEvent(name, mainMedia, secondaryMedia) {
  if (!mainMedia || !secondaryMedia) return false;
  var mainTime = isFinite(mainMedia.currentTime) ? Number(mainMedia.currentTime) : 0;
  var secondaryTime = isFinite(secondaryMedia.currentTime) ? Number(secondaryMedia.currentTime) : 0;
  if (name === 'ratechange' || name === 'play' || name === 'playing') {
    try { secondaryMedia.playbackRate = Number(mainMedia.playbackRate) || 1; } catch (e) {}
  }
  if (name === 'seeking' || name === 'seeked' || name === 'play' || name === 'playing'
      || (name === 'timeupdate' && Math.abs(mainTime - secondaryTime) > 0.12)) {
    if (Math.abs(mainTime - secondaryTime) > 0.035) {
      try { secondaryMedia.currentTime = mainTime; } catch (e) {}
    }
  }
  if (name === 'pause' || name === 'ended' || name === 'emptied' || name === 'abort' || name === 'error') {
    try { secondaryMedia.pause(); } catch (e) {}
    return true;
  }
  if ((name === 'play' || name === 'playing') && !mainMedia.paused && !mainMedia.ended) {
    try {
      var promise = secondaryMedia.play();
      if (promise && typeof promise.catch === 'function') promise.catch(function () {});
    } catch (e) {}
  }
  return true;
}

function bindAiStemMasterEvents(media) {
  if (!media || media._mineradioAiStemBound) return;
  media._mineradioAiStemBound = true;
  ['play', 'playing', 'pause', 'ended', 'emptied', 'abort', 'error', 'seeking', 'seeked', 'ratechange', 'timeupdate'].forEach(function (name) {
    media.addEventListener(name, function () {
      if (!aiStemPlaybackActive()) return;
      syncAiStemSecondaryForEvent(name, media, aiStemVocalAudio);
    });
  });
}

function cloneAiStemVocalAudioForContext() {
  if (!aiStemVocalAudio) return null;
  var old = aiStemVocalAudio;
  var replacement = new Audio();
  replacement.crossOrigin = 'anonymous';
  replacement.preload = 'auto';
  replacement.src = old.currentSrc || old.src || '';
  replacement.playbackRate = Number(old.playbackRate) || 1;
  try { replacement.currentTime = Number(old.currentTime) || 0; } catch (e) {}
  try { old.pause(); old.src = ''; } catch (e) {}
  aiStemVocalAudio = replacement;
  return replacement;
}

function ensureAiStemVocalSource(ctx) {
  if (!ctx || !aiStemVocalAudio || !ctx.createMediaElementSource) return null;
  if (aiStemVocalSource && aiStemVocalSource.context === ctx) return aiStemVocalSource;
  if (aiStemVocalSource && aiStemVocalSource.context !== ctx) {
    try { aiStemVocalSource.disconnect(); } catch (e) {}
    aiStemVocalSource = null;
    cloneAiStemVocalAudioForContext();
  }
  try { aiStemVocalSource = ctx.createMediaElementSource(aiStemVocalAudio); }
  catch (e) { aiStemVocalSource = null; }
  return aiStemVocalSource;
}

function connectAiStemPlaybackGraph(ctx, accompanimentSource, analyserNode, beatNode) {
  if (!aiStemPlaybackActive() || !ctx || !accompanimentSource || !analyserNode || !beatNode) return false;
  var vocalSource = ensureAiStemVocalSource(ctx);
  if (!vocalSource) return false;
  aiStemAccompanimentGain = ctx.createGain();
  aiStemVocalGain = ctx.createGain();
  aiStemMixNode = ctx.createGain();
  accompanimentSource.connect(aiStemAccompanimentGain);
  vocalSource.connect(aiStemVocalGain);
  aiStemAccompanimentGain.connect(aiStemMixNode);
  aiStemVocalGain.connect(aiStemMixNode);
  connectSingingKeyShiftOutput(ctx, aiStemMixNode, [analyserNode, beatNode]);
  applyAiStemLevels();
  return true;
}

function disposeAiStemSecondaryAudio() {
  if (aiStemVocalSource) { try { aiStemVocalSource.disconnect(); } catch (e) {} }
  aiStemVocalSource = null;
  if (aiStemVocalAudio) {
    try { aiStemVocalAudio.pause(); aiStemVocalAudio.removeAttribute('src'); aiStemVocalAudio.load(); } catch (e) {}
  }
  aiStemVocalAudio = null;
  aiStemMixNode = null;
  aiStemAccompanimentGain = null;
  aiStemVocalGain = null;
}

function aiStemProviderLabel(state) {
  var provider = state && state.runtime && state.runtime.provider;
  if (provider === 'coreml-mlprogram' || provider === 'coreml-default') return 'CoreML';
  if (provider === 'cpu') return 'CPU';
  return '';
}

function aiStemStatusLabel(state) {
  state = state || aiStemRuntime || {};
  var providerLabel = aiStemProviderLabel(state);
  var providerSuffix = providerLabel ? ' · ' + providerLabel : '';
  if (singingSeparationMode !== 'ai') return '实时处理';
  if (state.status === 'ready' || state.active) return 'AI 双轨已就绪' + providerSuffix;
  if (state.status === 'error') {
    if (state.error === 'AI_STEM_HELPER_MISSING') return 'AI 组件不可用';
    if (state.error === 'AI_STEM_MODEL_MISSING') return '未找到 UVR 模型';
    if (state.error === 'AI_STEM_AUDIO_URL_NOT_LOCAL') return '当前音频暂不支持';
    return 'AI 分轨失败';
  }
  if (state.status === 'running' || state.status === 'cancelling') {
    var names = { preparing: '准备 AI', downloading: '读取音频', model: '准备模型', separating: 'AI 分轨', saving: '保存双轨', cancelling: '正在取消' };
    return (names[state.stage] || 'AI 分轨') + (state.percent > 0 ? ' ' + Math.round(state.percent) + '%' : '') + providerSuffix;
  }
  return '等待当前歌曲';
}

function syncAiStemUi() {
  var wrap = document.getElementById('singing-control');
  var status = document.getElementById('ai-stem-status');
  var fill = document.getElementById('ai-stem-progress-fill');
  var progress = document.getElementById('ai-stem-progress');
  var running = aiStemRuntime.status === 'running' || aiStemRuntime.status === 'cancelling';
  if (wrap) {
    wrap.classList.toggle('ai-stem-running', running);
    wrap.classList.toggle('ai-stem-active', aiStemPlaybackActive());
  }
  document.querySelectorAll('[data-singing-separation]').forEach(function (button) {
    var active = button.getAttribute('data-singing-separation') === singingSeparationMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (status) status.textContent = aiStemStatusLabel(aiStemRuntime);
  if (fill) fill.style.width = Math.max(0, Math.min(100, Number(aiStemRuntime.percent) || 0)) + '%';
  if (progress) progress.setAttribute('aria-hidden', running ? 'false' : 'true');
}

function setAiStemRuntime(patch) {
  aiStemRuntime = Object.assign({}, aiStemRuntime || {}, patch || {});
  syncAiStemUi();
  return aiStemRuntime;
}

function waitAiStemMediaReady(media, timeoutMs) {
  if (!media) return Promise.reject(new Error('AI_STEM_MEDIA_MISSING'));
  if (media.readyState >= 2) return Promise.resolve(true);
  return new Promise(function (resolve, reject) {
    var done = false;
    var timer = setTimeout(function () { finish(new Error('AI_STEM_MEDIA_TIMEOUT')); }, Math.max(800, Number(timeoutMs) || 7000));
    function cleanup() {
      clearTimeout(timer);
      media.removeEventListener('canplay', onReady);
      media.removeEventListener('loadedmetadata', onReady);
      media.removeEventListener('error', onError);
    }
    function finish(error) {
      if (done) return;
      done = true;
      cleanup();
      if (error) reject(error); else resolve(true);
    }
    function onReady() { if (media.readyState >= 1) finish(); }
    function onError() { finish(new Error('AI_STEM_MEDIA_LOAD_FAILED')); }
    media.addEventListener('canplay', onReady);
    media.addEventListener('loadedmetadata', onReady);
    media.addEventListener('error', onError);
  });
}

async function activateAiStemPlayback(result) {
  var expectedKey = aiStemTrackKey();
  if (!result || result.status !== 'ready' || !audio || !expectedKey || result.trackKey !== expectedKey) return false;
  if (aiStemPlaybackActive() && aiStemRuntime.id === result.id) return true;
  if (aiStemPlaybackActive()) await deactivateAiStemPlayback({ restoreOriginal: true, reason: 'replace-ai-stem' });
  var operation = beginAiStemPlaybackOperation(expectedKey);
  var originalSrc = audio.currentSrc || audio.src || '';
  var resumeAt = isFinite(audio.currentTime) ? Number(audio.currentTime) : 0;
  var wasPlaying = !audio.paused && !audio.ended;
  var original = { src: originalSrc, currentTime: resumeAt, wasPlaying: wasPlaying };
  var vocalMedia = new Audio();
  vocalMedia.crossOrigin = 'anonymous';
  vocalMedia.preload = 'auto';
  vocalMedia.src = result.vocalsUrl;
  vocalMedia.playbackRate = Number(playbackSpeed) || 1;
  aiStemVocalAudio = vocalMedia;
  setAiStemRuntime({ status: 'ready', stage: 'ready', percent: 100, id: result.id, trackKey: result.trackKey, active: true, original: original, error: '' });
  try {
    if (typeof rampAudioOutputGain === 'function') rampAudioOutputGain(0, 70);
    await new Promise(function (resolve) { setTimeout(resolve, 85); });
    if (!aiStemPlaybackOperationCurrent(operation, true)) return abandonAiStemActivation(operation, vocalMedia);
    try { audio.pause(); } catch (e) {}
    resetPlaybackAudioGraphForSourceSwitch('ai-stem-activate');
    audio.src = result.instrumentalUrl;
    audio.preload = 'auto';
    audio.playbackRate = Number(playbackSpeed) || 1;
    bindAiStemMasterEvents(audio);
    audio.load();
    vocalMedia.load();
    await Promise.all([waitAiStemMediaReady(audio, 8000), waitAiStemMediaReady(vocalMedia, 8000)]);
    if (!aiStemPlaybackOperationCurrent(operation, true)) return abandonAiStemActivation(operation, vocalMedia);
    try { audio.currentTime = resumeAt; vocalMedia.currentTime = resumeAt; } catch (e) {}
    audioReady = false;
    initAudio();
    applyAiStemLevels();
    if (wasPlaying) {
      await audio.play();
      if (!aiStemPlaybackOperationCurrent(operation, true)) return abandonAiStemActivation(operation, vocalMedia);
      syncAiStemSecondaryForEvent('play', audio, vocalMedia);
    }
    if (typeof rampAudioOutputGain === 'function') rampAudioOutputGain(targetVolume, 100);
    else applyVolumeToAudio({ restoreEnvelope: true });
    syncAiStemUi();
    showToast('AI 人声伴奏已就绪');
    return true;
  } catch (error) {
    console.warn('[AIStem] activate failed:', error && (error.message || error));
    if (!aiStemPlaybackOperationCurrent(operation, true)) return abandonAiStemActivation(operation, vocalMedia);
    await deactivateAiStemPlayback({ restoreOriginal: true, reason: 'activation-failed' });
    if (singingSeparationMode === 'ai' && expectedKey === aiStemTrackKey() && aiStemRuntime.status !== 'running') {
      setAiStemRuntime({ status: 'error', stage: 'error', active: false, error: 'AI_STEM_PLAYBACK_FAILED' });
    }
    return false;
  }
}

async function deactivateAiStemPlayback(options) {
  options = options || {};
  var active = aiStemPlaybackActive() || (aiStemRuntime && aiStemRuntime.active);
  var original = aiStemRuntime && aiStemRuntime.original;
  if (!active) { disposeAiStemSecondaryAudio(); return false; }
  var operation = beginAiStemPlaybackOperation(aiStemTrackKey());
  var resumeAt = audio && isFinite(audio.currentTime) ? Number(audio.currentTime) : Number(original && original.currentTime) || 0;
  var wasPlaying = !!(audio && !audio.paused && !audio.ended);
  setAiStemRuntime({ active: false, original: null, stage: 'idle', percent: 0, status: singingSeparationMode === 'ai' ? 'idle' : 'idle' });
  try { if (audio) audio.pause(); } catch (e) {}
  disconnectAudioGraphNodes(true);
  disposeAiStemSecondaryAudio();
  if (!options.restoreOriginal || !audio || !original || !original.src) return true;
  try {
    audio.src = original.src;
    audio.preload = 'auto';
    audio.playbackRate = Number(playbackSpeed) || 1;
    audio.load();
    await waitAiStemMediaReady(audio, 8000);
    if (!aiStemPlaybackOperationCurrent(operation, false)) return false;
    try { audio.currentTime = resumeAt; } catch (e) {}
    audioReady = false;
    initAudio();
    if (wasPlaying || original.wasPlaying) await audio.play();
    if (!aiStemPlaybackOperationCurrent(operation, false)) return false;
    if (typeof rampAudioOutputGain === 'function') rampAudioOutputGain(targetVolume, 90);
    else applyVolumeToAudio({ restoreEnvelope: true });
    return true;
  } catch (error) {
    console.warn('[AIStem] restore original failed:', error && (error.message || error));
    return false;
  }
}

function handleAiStemProgress(payload) {
  if (!payload || !payload.trackKey || payload.trackKey !== aiStemTrackKey()) return;
  setAiStemRuntime(payload);
}

async function requestAiStemForCurrentTrack() {
  if (singingSeparationMode !== 'ai' || !singingModeEnabled || !audio) return false;
  var trackKey = aiStemTrackKey();
  var audioUrl = aiStemRequestAudioUrl(audio);
  if (!trackKey || !audioUrl || aiStemPlaybackActive()) return false;
  if (!window.desktopWindow || typeof window.desktopWindow.startAiStemSeparation !== 'function') {
    setAiStemRuntime({ status: 'error', stage: 'error', error: 'AI_STEM_HELPER_MISSING' });
    return false;
  }
  if (aiStemRuntime.status === 'running' && aiStemRuntime.trackKey === trackKey) return true;
  setAiStemRuntime({ status: 'running', stage: 'preparing', percent: 0, trackKey: trackKey, id: '', jobId: 0, cached: false, active: false, original: null, error: '' });
  var result = await window.desktopWindow.startAiStemSeparation({ trackKey: trackKey, audioUrl: audioUrl });
  if (singingSeparationMode !== 'ai' || trackKey !== aiStemTrackKey()) return false;
  if (result && result.status === 'ready') {
    setAiStemRuntime(result);
    return activateAiStemPlayback(result);
  }
  if (result && result.status === 'cancelled') {
    setAiStemRuntime({ status: 'idle', stage: 'idle', percent: 0, jobId: 0 });
    return false;
  }
  setAiStemRuntime({ status: 'error', stage: 'error', percent: 0, error: String(result && result.error || 'AI_STEM_FAILED') });
  return false;
}

function cancelAiStemForCurrentTrack() {
  var jobId = Number(aiStemRuntime && aiStemRuntime.jobId) || 0;
  if (jobId && window.desktopWindow && typeof window.desktopWindow.cancelAiStemSeparation === 'function') {
    window.desktopWindow.cancelAiStemSeparation(jobId).catch(function () {});
  }
  setAiStemMode('realtime', { silent: true });
}

function setAiStemMode(mode, options) {
  options = options || {};
  mode = mode === 'ai' ? 'ai' : 'realtime';
  if (mode === singingSeparationMode) {
    syncAiStemUi();
    if (mode === 'ai') requestAiStemForCurrentTrack();
    return;
  }
  singingSeparationMode = mode;
  if (mode === 'realtime') {
    var jobId = Number(aiStemRuntime && aiStemRuntime.jobId) || 0;
    if (jobId && window.desktopWindow && typeof window.desktopWindow.cancelAiStemSeparation === 'function') {
      window.desktopWindow.cancelAiStemSeparation(jobId).catch(function () {});
    }
    deactivateAiStemPlayback({ restoreOriginal: true, reason: 'realtime-mode' });
    setAiStemRuntime({ status: 'idle', stage: 'idle', percent: 0, jobId: 0, error: '' });
    if (!options.silent) showToast('已切换实时分离');
  } else {
    if (!singingModeEnabled && typeof setSingingMode === 'function') setSingingMode(true);
    setAiStemRuntime({ status: 'idle', stage: 'idle', percent: 0, error: '' });
    requestAiStemForCurrentTrack();
    if (!options.silent) showToast('AI 分轨准备中，原曲继续播放');
  }
  syncAiStemUi();
}

function bindAiStemControls() {
  document.querySelectorAll('[data-singing-separation]').forEach(function (button) {
    if (button._aiStemBound) return;
    button._aiStemBound = true;
    button.addEventListener('click', function () { setAiStemMode(button.getAttribute('data-singing-separation')); });
  });
  var cancelButton = document.getElementById('ai-stem-cancel-btn');
  if (cancelButton && !cancelButton._aiStemBound) {
    cancelButton._aiStemBound = true;
    cancelButton.addEventListener('click', cancelAiStemForCurrentTrack);
  }
  if (window.desktopWindow && typeof window.desktopWindow.onAiStemProgress === 'function' && !window._mineradioAiStemProgressBound) {
    window._mineradioAiStemProgressBound = true;
    window.desktopWindow.onAiStemProgress(handleAiStemProgress);
  }
  syncAiStemUi();
}
