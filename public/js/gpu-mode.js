'use strict';

(function exposeMineradioGpuMode(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MineradioGpuMode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMineradioGpuMode() {
  var STORAGE_KEY = 'mineradio-gpu-mode-v1';

  function normalizeMode(value) {
    value = String(value || '').trim().toLowerCase();
    if (value === 'low-power' || value === 'high-performance') return value;
    return 'auto';
  }

  function powerPreferenceForMode(value) {
    var mode = normalizeMode(value);
    return mode === 'auto' ? 'default' : mode;
  }

  function readMode(storage) {
    try {
      return normalizeMode(storage && storage.getItem(STORAGE_KEY));
    } catch (e) {
      return 'auto';
    }
  }

  function saveMode(storage, value) {
    var mode = normalizeMode(value);
    try {
      if (storage && typeof storage.setItem === 'function') storage.setItem(STORAGE_KEY, mode);
    } catch (e) { }
    return mode;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    normalizeMode: normalizeMode,
    powerPreferenceForMode: powerPreferenceForMode,
    readMode: readMode,
    saveMode: saveMode
  };
});
