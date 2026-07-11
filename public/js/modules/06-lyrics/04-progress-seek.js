var progressDragState = {
  active: false,
  lastParticleAt: 0,
  previewTime: 0,
  previewDuration: 0,
  resumeAfterSeek: false,
  media: null,
  mediaSrc: '',
  commitSerial: 0,
  previewHoldUntil: 0,
  previewHoldSerial: 0,
  previewClockBase: 0,
  previewClockStartedAt: 0,
  previewClockRunning: false,
  resumePlaySerial: 0
};
var progressVisualState = {
  bar: null,
  fill: null,
  thumb: null,
  ratio: -1,
  x: -1,
  width: 0,
  resizeBound: false,
  observer: null
};
var progressLyricPreviewRaf = 0;
function ensureProgressVisualElements() {
  if (!progressVisualState.bar) progressVisualState.bar = document.getElementById('progress-bar');
  if (!progressVisualState.fill) progressVisualState.fill = document.getElementById('progress-fill');
  if (!progressVisualState.thumb) progressVisualState.thumb = document.getElementById('progress-thumb');
  if (!progressVisualState.resizeBound) {
    progressVisualState.resizeBound = true;
    if (typeof ResizeObserver === 'function') {
      progressVisualState.observer = new ResizeObserver(function () {
        progressVisualState.width = 0;
        updatePlaybackProgressUi();
      });
      if (progressVisualState.bar) progressVisualState.observer.observe(progressVisualState.bar);
    } else {
      window.addEventListener('resize', function () {
        progressVisualState.width = 0;
        updatePlaybackProgressUi();
      });
    }
  } else if (progressVisualState.observer && progressVisualState.bar && !progressVisualState.bar._mineradioProgressObserved) {
    progressVisualState.observer.observe(progressVisualState.bar);
  }
  if (progressVisualState.bar) progressVisualState.bar._mineradioProgressObserved = true;
}
function progressBarVisualWidth() {
  ensureProgressVisualElements();
  if (!progressVisualState.bar) return 0;
  var width = progressVisualState.width;
  if (!(width > 0)) {
    width = progressVisualState.bar.clientWidth || progressVisualState.bar.getBoundingClientRect().width || 0;
    progressVisualState.width = width > 0 ? width : 0;
  }
  return progressVisualState.width;
}
function isProgressDragPreviewActive() {
  if (!progressDragState || progressDragState.previewDuration <= 0) return false;
  if (progressDragState.active) return true;
  if (progressDragState.previewHoldUntil > performance.now()) return true;
  progressDragState.previewClockRunning = false;
  return false;
}
function getProgressPreviewClockSeconds() {
  var t = Number(progressDragState.previewTime) || 0;
  if (!progressDragState.active && progressDragState.previewClockRunning && progressDragState.previewHoldUntil > performance.now()) {
    var elapsed = Math.max(0, (performance.now() - (Number(progressDragState.previewClockStartedAt) || performance.now())) / 1000);
    t = (Number(progressDragState.previewClockBase) || 0) + elapsed;
    if (progressDragState.previewDuration > 0) t = Math.min(t, progressDragState.previewDuration);
    progressDragState.previewTime = t;
  }
  return t;
}
function getProgressDragPreviewSeconds() {
  return isProgressDragPreviewActive() ? getProgressPreviewClockSeconds() : null;
}
function beginProgressPreviewHold(serial, holdMs, runClock) {
  progressDragState.previewHoldSerial = serial || progressDragState.previewHoldSerial || 0;
  progressDragState.previewClockRunning = !!runClock;
  progressDragState.previewClockBase = Number(progressDragState.previewTime) || 0;
  progressDragState.previewClockStartedAt = performance.now();
  progressDragState.previewHoldUntil = performance.now() + Math.max(120, Number(holdMs) || 720);
  scheduleProgressLyricPreviewTick();
}
function finishProgressPreviewHold(serial, settleMs) {
  if (serial && progressDragState.previewHoldSerial && serial !== progressDragState.previewHoldSerial) return;
  if (progressDragState.previewClockRunning) {
    progressDragState.previewTime = getProgressPreviewClockSeconds();
    progressDragState.previewClockBase = Number(progressDragState.previewTime) || 0;
    progressDragState.previewClockStartedAt = performance.now();
  }
  progressDragState.previewHoldUntil = performance.now() + Math.max(34, Number(settleMs) || 96);
  scheduleProgressLyricPreviewTick();
}
function scheduleProgressLyricPreviewTick() {
  if (typeof markRenderInteraction === 'function') markRenderInteraction('progress-drag', 420);
  if (typeof wakeMainLoopFromBackground === 'function') wakeMainLoopFromBackground();
  if (progressLyricPreviewRaf) return;
  var raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (fn) { return setTimeout(fn, 16); };
  progressLyricPreviewRaf = raf(function () {
    progressLyricPreviewRaf = 0;
    if (!isProgressDragPreviewActive()) return;
    if (typeof tickLyricsParticles === 'function') tickLyricsParticles();
    if (isProgressDragPreviewActive()) scheduleProgressLyricPreviewTick();
  });
}
function normalizePlaybackDurationSeconds(value) {
  var raw = Number(value);
  if (!isFinite(raw) || raw <= 0) return 0;
  return raw > 1000 ? raw / 1000 : raw;
}
function playbackDurationFromSong(song) {
  if (!song) return 0;
  return normalizePlaybackDurationSeconds(song.duration || song.durationMs || song.dt || 0);
}
function getPlaybackDurationSeconds() {
  if (audio && isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  return playbackDurationFromSong(currentCoverSong());
}
function getPlaybackCurrentSeconds() {
  return audio && isFinite(audio.currentTime) && audio.currentTime > 0 ? audio.currentTime : 0;
}
function setProgressVisual(percent) {
  percent = clampRange(percent || 0, 0, 100);
  ensureProgressVisualElements();
  var bar = progressVisualState.bar;
  if (!bar) return;
  var ratio = percent / 100;
  var x = progressBarVisualWidth() * ratio;
  var qRatio = Math.round(ratio * 10000) / 10000;
  var qX = Math.round(x * 10) / 10;
  if (qRatio !== progressVisualState.ratio) {
    bar.style.setProperty('--progress-ratio', String(qRatio));
    progressVisualState.ratio = qRatio;
  }
  if (qX !== progressVisualState.x) {
    bar.style.setProperty('--progress-x', qX + 'px');
    progressVisualState.x = qX;
  }
}
function updatePlaybackProgressUi() {
  if (isProgressDragPreviewActive() && progressDragState.previewDuration > 0) {
    renderProgressPreview(getProgressPreviewClockSeconds(), progressDragState.previewDuration);
    return;
  }
  var durationSec = getPlaybackDurationSeconds();
  var currentSec = getPlaybackCurrentSeconds();
  if (durationSec > 0 && currentSec > durationSec) currentSec = durationSec;
  setProgressVisual(durationSec > 0 ? (currentSec / durationSec * 100) : 0);
  var timeDisplay = document.getElementById('time-display');
  if (timeDisplay) timeDisplay.textContent = formatProgramTime(currentSec) + ' / ' + (durationSec > 0 ? formatProgramTime(durationSec) : '0:00');
}
function bindPlaybackProgressEvents(audioEl) {
  if (!audioEl || audioEl._mineradioProgressBound) return;
  audioEl._mineradioProgressBound = true;
  ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'play', 'pause', 'emptied'].forEach(function (name) {
    audioEl.addEventListener(name, updatePlaybackProgressUi);
  });
  ['play', 'playing', 'pause', 'ended', 'emptied', 'abort', 'error'].forEach(function (name) {
    audioEl.addEventListener(name, function () {
      syncPlaybackStateFromAudioEvent(name);
      saveLastPlaybackSnapshot(name === 'pause' || name === 'ended', name);
    });
  });
}
function emitProgressDragParticles(x, y) {
  var now = performance.now();
  if (now - progressDragState.lastParticleAt < 46) return;
  progressDragState.lastParticleAt = now;
  for (var i = 0; i < 3; i++) {
    var dot = document.createElement('span');
    dot.className = 'progress-drag-particle';
    var dx = (Math.random() - 0.5) * 34;
    var dy = -10 - Math.random() * 28;
    dot.style.setProperty('--px', x + 'px');
    dot.style.setProperty('--py', y + 'px');
    dot.style.setProperty('--dx', dx + 'px');
    dot.style.setProperty('--dy', dy + 'px');
    document.body.appendChild(dot);
    setTimeout((function (el) { return function () { if (el && el.parentNode) el.parentNode.removeChild(el); }; })(dot), 700);
  }
}
function renderProgressPreview(currentSec, durationSec) {
  currentSec = Math.max(0, Number(currentSec) || 0);
  durationSec = Math.max(0, Number(durationSec) || 0);
  if (durationSec > 0 && currentSec > durationSec) currentSec = durationSec;
  setProgressVisual(durationSec > 0 ? (currentSec / durationSec * 100) : 0);
  var timeDisplay = document.getElementById('time-display');
  if (timeDisplay) timeDisplay.textContent = formatProgramTime(currentSec) + ' / ' + (durationSec > 0 ? formatProgramTime(durationSec) : '0:00');
}
function progressPointerPreviewFromEvent(e) {
  var durationSec = getPlaybackDurationSeconds();
  if (!audio || !durationSec) return null;
  var bar = document.getElementById('progress-bar');
  if (!bar) return null;
  var rect = bar.getBoundingClientRect();
  var width = Math.max(1, rect.width || 1);
  var ratio = clampRange((e.clientX - rect.left) / width, 0, 1);
  return { ratio: ratio, time: ratio * durationSec, duration: durationSec, rect: rect };
}
function previewProgressPointer(e, emitParticles) {
  var preview = progressPointerPreviewFromEvent(e);
  if (!preview) return false;
  progressDragState.previewTime = preview.time;
  progressDragState.previewDuration = preview.duration;
  progressDragState.previewClockRunning = false;
  renderProgressPreview(preview.time, preview.duration);
  syncBeatMapPlaybackCursor(preview.time, true);
  scheduleProgressLyricPreviewTick();
  if (emitParticles) emitProgressDragParticles(e.clientX, preview.rect.top + preview.rect.height / 2);
  return true;
}
function waitForProgressSeekReady(media, timeoutMs) {
  if (!media) return Promise.resolve(false);
  if (media.readyState >= 2 && !media.seeking) return Promise.resolve(true);
  return new Promise(function (resolve) {
    var done = false;
    var timer = null;
    function cleanup() {
      if (timer) clearTimeout(timer);
      media.removeEventListener('seeked', onReady);
      media.removeEventListener('canplay', onReady);
      media.removeEventListener('loadeddata', onReady);
      media.removeEventListener('error', onError);
    }
    function finish(ok) {
      if (done) return;
      done = true;
      cleanup();
      resolve(!!ok);
    }
    function onReady() { finish(true); }
    function onError() { finish(false); }
    media.addEventListener('seeked', onReady, { once: true });
    media.addEventListener('canplay', onReady, { once: true });
    media.addEventListener('loadeddata', onReady, { once: true });
    media.addEventListener('error', onError, { once: true });
    timer = setTimeout(function () { finish(media.readyState >= 2); }, timeoutMs || 620);
  });
}
function invalidateActiveProgressSeek(reason) {
  progressDragState.active = false;
  progressDragState.media = null;
  progressDragState.mediaSrc = '';
  progressDragState.resumeAfterSeek = false;
  progressDragState.resumePlaySerial = 0;
  progressDragState.previewClockRunning = false;
  progressDragState.previewHoldUntil = 0;
  progressDragState.commitSerial++;
  var bar = document.getElementById('progress-bar');
  if (bar) bar.classList.remove('is-dragging');
}
function getActiveProgressSeekMedia() {
  var media = progressDragState.media || audio;
  if (!media || !audio || media !== audio) return null;
  var mediaSrc = progressDragState.mediaSrc || (media.currentSrc || media.src || '');
  var audioSrc = audio.currentSrc || audio.src || '';
  if (mediaSrc && audioSrc !== mediaSrc) return null;
  return media;
}
function restoreProgressSeekAudio(media, mediaSrc, resumeAfterSeek, serial) {
  if (serial !== progressDragState.commitSerial) return;
  if (!audio || audio !== media || (audio.currentSrc || audio.src || '') !== mediaSrc) {
    finishProgressPreviewHold(serial, 48);
    if (typeof restorePlaybackGain === 'function') restorePlaybackGain();
    return;
  }
  if (!resumeAfterSeek) {
    progressDragState.resumePlaySerial = 0;
    finishProgressPreviewHold(serial, 96);
    try { if (media && !media.paused) media.pause(); } catch (pauseErr) { }
    if (typeof restorePlaybackGain === 'function') restorePlaybackGain();
    return;
  }
  if (progressDragState.resumePlaySerial !== serial || (media && media.paused)) {
    primeProgressSeekPlayback(media, mediaSrc, serial);
  }
  finishProgressPreviewHold(serial, 96);
}
function primeProgressSeekPlayback(media, mediaSrc, serial) {
  if (serial !== progressDragState.commitSerial) return false;
  if (!audio || audio !== media || (audio.currentSrc || audio.src || '') !== mediaSrc) return false;
  progressDragState.resumePlaySerial = serial;
  if (typeof attemptAudioPlay === 'function') {
    attemptAudioPlay({ manual: true, silent: true, fade: true });
    return true;
  }
  try {
    var playResult = media.play();
    if (playResult && playResult.then) {
      playResult.then(function () {
        if (serial !== progressDragState.commitSerial) return;
        if (typeof startPlaybackFadeIn === 'function') startPlaybackFadeIn();
        else if (typeof restorePlaybackGain === 'function') restorePlaybackGain();
      }).catch(function () {
        if (serial !== progressDragState.commitSerial) return;
        if (typeof restorePlaybackGain === 'function') restorePlaybackGain();
      });
    }
    return true;
  } catch (e) {
    finishProgressPreviewHold(serial, 48);
    if (typeof restorePlaybackGain === 'function') restorePlaybackGain();
    return false;
  }
}
function commitProgressSeek(targetTime, resumeAfterSeek) {
  var media = getActiveProgressSeekMedia();
  if (!media) {
    invalidateActiveProgressSeek('stale-media');
    if (typeof restorePlaybackGain === 'function') restorePlaybackGain();
    return;
  }
  var durationSec = progressDragState.previewDuration || getPlaybackDurationSeconds();
  if (!durationSec) return;
  targetTime = clampRange(Number(targetTime) || 0, 0, durationSec);
  var mediaSrc = progressDragState.mediaSrc || (media.currentSrc || media.src || '');
  var serial = ++progressDragState.commitSerial;
  progressDragState.previewTime = targetTime;
  progressDragState.previewDuration = durationSec;
  beginProgressPreviewHold(serial, 900, !!resumeAfterSeek);
  if (typeof setAudioOutputGainImmediate === 'function') setAudioOutputGainImmediate(0);
  try {
    media.currentTime = targetTime;
  } catch (err) {
    console.warn('[ProgressSeek] commit failed:', err && (err.message || err));
    progressDragState.previewClockRunning = false;
    finishProgressPreviewHold(serial, 48);
    restoreProgressSeekAudio(media, mediaSrc, false, serial);
    return;
  }
  if (resumeAfterSeek) primeProgressSeekPlayback(media, mediaSrc, serial);
  renderProgressPreview(targetTime, durationSec);
  syncBeatMapPlaybackCursor(targetTime, true);
  saveLastPlaybackSnapshot(true, 'seek');
  waitForProgressSeekReady(media, 680).then(function () {
    restoreProgressSeekAudio(media, mediaSrc, !!resumeAfterSeek, serial);
  });
}
var progressBar = document.getElementById('progress-bar');
progressBar.addEventListener('pointerdown', function (e) {
  if (!audio || !getPlaybackDurationSeconds()) return;
  progressDragState.active = true;
  progressDragState.media = audio;
  progressDragState.mediaSrc = audio.currentSrc || audio.src || '';
  progressDragState.resumeAfterSeek = !!(audio && !audio.paused && !audio.ended && playing);
  progressDragState.previewTime = getPlaybackCurrentSeconds();
  progressDragState.previewDuration = getPlaybackDurationSeconds();
  progressBar.classList.add('is-dragging');
  if (progressDragState.resumeAfterSeek) {
    if (typeof setAudioOutputGainImmediate === 'function') setAudioOutputGainImmediate(0);
    try { audio.pause(); } catch (pauseErr) { }
  }
  try { progressBar.setPointerCapture(e.pointerId); } catch (err) { }
  previewProgressPointer(e, true);
  scheduleProgressLyricPreviewTick();
});
progressBar.addEventListener('pointermove', function (e) {
  if (!progressDragState.active) return;
  previewProgressPointer(e, true);
});
function endProgressDrag(e, commit) {
  if (!progressDragState.active) return;
  var targetTime = progressDragState.previewTime;
  var resumeAfterSeek = progressDragState.resumeAfterSeek;
  progressDragState.active = false;
  progressBar.classList.remove('is-dragging');
  try { if (e && e.pointerId != null) progressBar.releasePointerCapture(e.pointerId); } catch (err) { }
  if (commit !== false) commitProgressSeek(targetTime, resumeAfterSeek);
  else {
    progressDragState.previewHoldUntil = 0;
    progressDragState.previewClockRunning = false;
    progressDragState.resumePlaySerial = 0;
    if (typeof restorePlaybackGain === 'function') restorePlaybackGain();
  }
  progressDragState.media = null;
  progressDragState.mediaSrc = '';
  progressDragState.resumeAfterSeek = false;
}
progressBar.addEventListener('pointerup', function (e) { endProgressDrag(e, true); });
progressBar.addEventListener('pointercancel', function (e) { endProgressDrag(e, false); });
progressBar.addEventListener('lostpointercapture', function (e) { endProgressDrag(e, true); });
setInterval(function () {
  if (!audio) {
    if (restoredLastPlaybackSnapshot && pendingPlaybackResumeAt > 0) applyRestoredPlaybackProgressUi(restoredLastPlaybackSnapshot);
    else updatePlaybackProgressUi();
    return;
  }
  if (progressDragState.active) {
    updatePlaybackProgressUi();
    return;
  }
  updateListenStatsTick(false);
  updatePlaybackProgressUi();
  saveLastPlaybackSnapshot(false, 'tick');
  if (audio.currentTime) updateLyricsHighlight();
}, 200);

// ============================================================
//  文件拖放
