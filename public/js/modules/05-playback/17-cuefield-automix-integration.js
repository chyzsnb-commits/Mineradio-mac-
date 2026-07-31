var CUEFIELD_AUTOMIX_STORE_KEY = 'mineradio-cuefield-automix-lite-v1';
var cuefieldAutomixEnabled = readBooleanPreference(CUEFIELD_AUTOMIX_STORE_KEY, false);

function cuefieldNextBeatMap() {
  var nextSong = Array.isArray(playQueue) ? playQueue[currentIdx + 1] : null;
  if (!nextSong || typeof beatMapSongKey !== 'function' || !beatMapCache) return null;
  var key = beatMapSongKey(nextSong);
  return key ? beatMapCache[key] || null : null;
}

function cuefieldEffectiveCrossfadeMs() {
  var baseCrossfadeMs = Math.max(0, Number(AUDIO_CROSSFADE_MS) || 0);
  if (!cuefieldAutomixEnabled || !window.CuefieldAutomixCore || !Array.isArray(playQueue)) return baseCrossfadeMs;
  var currentSong = playQueue[currentIdx] || null;
  var nextSong = playQueue[currentIdx + 1] || null;
  var plan = window.CuefieldAutomixCore.buildPlan({
    enabled: true,
    baseCrossfadeMs: baseCrossfadeMs,
    currentSong: currentSong,
    nextSong: nextSong,
    currentMap: currentBeatMap,
    nextMap: cuefieldNextBeatMap(),
    memoryConstrained: typeof _crossfadeFreeMemMB !== 'undefined' && _crossfadeFreeMemMB < CROSSFADE_MIN_FREE_MB
  });
  return plan.mode === 'crossfade' ? Math.min(baseCrossfadeMs, plan.crossfadeMs) : baseCrossfadeMs;
}

function syncCuefieldAutomixUi() {
  var toggle = document.getElementById('cuefield-automix-toggle');
  var state = document.getElementById('cuefield-automix-state');
  if (toggle) {
    toggle.classList.toggle('on', cuefieldAutomixEnabled);
    toggle.setAttribute('aria-pressed', cuefieldAutomixEnabled ? 'true' : 'false');
  }
  if (state) state.textContent = cuefieldAutomixEnabled ? '开' : '关';
}

function setCuefieldAutomixEnabled(enabled, silent) {
  cuefieldAutomixEnabled = !!enabled;
  saveBooleanPreference(CUEFIELD_AUTOMIX_STORE_KEY, cuefieldAutomixEnabled);
  syncCuefieldAutomixUi();
  if (!silent && typeof showToast === 'function') showToast(cuefieldAutomixEnabled ? '智能混音已开启' : '智能混音已关闭');
}

function toggleCuefieldAutomix() {
  setCuefieldAutomixEnabled(!cuefieldAutomixEnabled, false);
}
