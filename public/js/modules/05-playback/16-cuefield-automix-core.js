(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CuefieldAutomixCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isUnsupportedSong(song) {
    return !song || song.type === 'podcast' || song.source === 'podcast'
      || song.type === 'local' || song.source === 'local' || !!song.localUrl;
  }

  function bpmForMap(map) {
    var step = Number(map && map.gridStep);
    if (!(step >= 0.30 && step <= 1.20)) return 0;
    return 60 / step;
  }

  function energyForMap(map) {
    var energy = Number(map && map.loudRef);
    return isFinite(energy) && energy > 0 ? energy : 0;
  }

  function directPlan(baseCrossfadeMs, reason) {
    return { mode: 'direct', crossfadeMs: baseCrossfadeMs, reason: reason };
  }

  function buildPlan(input) {
    input = input || {};
    var baseCrossfadeMs = Math.max(0, Math.round(Number(input.baseCrossfadeMs) || 0));
    if (!input.enabled) return directPlan(baseCrossfadeMs, 'disabled');
    if (input.memoryConstrained) return directPlan(baseCrossfadeMs, 'memory-constrained');
    if (isUnsupportedSong(input.currentSong) || isUnsupportedSong(input.nextSong)) return directPlan(baseCrossfadeMs, 'unsupported-track');
    if (!input.currentMap || !input.nextMap) return directPlan(baseCrossfadeMs, 'missing-beatmap');

    var currentBpm = bpmForMap(input.currentMap);
    var nextBpm = bpmForMap(input.nextMap);
    var currentEnergy = energyForMap(input.currentMap);
    var nextEnergy = energyForMap(input.nextMap);
    if (!currentBpm || !nextBpm || !currentEnergy || !nextEnergy) return directPlan(baseCrossfadeMs, 'unreliable-analysis');
    if (Math.abs(currentBpm - nextBpm) > 6 || Math.abs(currentEnergy - nextEnergy) > 0.12) return directPlan(baseCrossfadeMs, 'mismatch');

    return {
      mode: 'crossfade',
      crossfadeMs: Math.round(baseCrossfadeMs * 0.85),
      reason: 'tempo-energy-match'
    };
  }

  return { buildPlan: buildPlan };
});