(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MineradioParticleZoom = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var MIN_FOV = 26;
  var MAX_FOV = 72;
  var WHEEL_SENSITIVITY = 0.074;
  var MAX_STEP = 7.5;
  var LERP_RESPONSE = 16;

  function finiteNumber(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max) {
    value = finiteNumber(value, min);
    return Math.max(min, Math.min(max, value));
  }

  function wheelDeltaPixels(event) {
    var delta = finiteNumber(event && event.deltaY, 0);
    var mode = Number(event && event.deltaMode) || 0;
    if (mode === 1) return delta * 16;
    if (mode === 2) return delta * 360;
    return delta;
  }

  function nextParticleFovTarget(currentFov, event, options) {
    options = options || {};
    var sensitivity = finiteNumber(options.sensitivity, WHEEL_SENSITIVITY);
    var minFov = finiteNumber(options.minFov, MIN_FOV);
    var maxFov = finiteNumber(options.maxFov, MAX_FOV);
    var maxStep = finiteNumber(options.maxStep, MAX_STEP);
    var delta = wheelDeltaPixels(event);
    if (!delta) return clamp(currentFov, minFov, maxFov);
    var step = clamp(delta * sensitivity, -maxStep, maxStep);
    return clamp(finiteNumber(currentFov, 45) + step, minFov, maxFov);
  }

  function lerpParticleZoomValue(current, target, dt, options) {
    options = options || {};
    current = finiteNumber(current, finiteNumber(target, 45));
    target = finiteNumber(target, current);
    dt = clamp(finiteNumber(dt, 1 / 60), 0, 0.08);
    var response = Math.max(1, finiteNumber(options.response, LERP_RESPONSE));
    var alpha = 1 - Math.exp(-response * dt);
    return current + (target - current) * clamp(alpha, 0, 1);
  }

  return {
    MIN_FOV: MIN_FOV,
    MAX_FOV: MAX_FOV,
    WHEEL_SENSITIVITY: WHEEL_SENSITIVITY,
    MAX_STEP: MAX_STEP,
    LERP_RESPONSE: LERP_RESPONSE,
    wheelDeltaPixels: wheelDeltaPixels,
    nextParticleFovTarget: nextParticleFovTarget,
    lerpParticleZoomValue: lerpParticleZoomValue
  };
});
