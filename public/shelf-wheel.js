(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MineradioShelfWheel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

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
    var mode = event && event.deltaMode;
    if (mode === 1) return delta * 18;
    if (mode === 2) return delta * 720;
    return delta;
  }

  function isLikelyTrackpad(event) {
    var delta = Math.abs(wheelDeltaPixels(event));
    var raw = Math.abs(finiteNumber(event && event.deltaY, 0));
    if (!delta) return false;
    if (event && event.deltaMode !== 0) return false;
    if (raw !== Math.round(raw)) return true;
    return delta < 80;
  }

  function createShelfWheelMotionController(options) {
    options = options || {};
    var mouseStep = Math.max(1, Math.round(finiteNumber(options.mouseStep, 1)));
    var mouseStepPixels = Math.max(24, finiteNumber(options.mouseStepPixels, 100));
    var trackpadThreshold = Math.max(24, finiteNumber(options.trackpadThreshold, 150));
    var getDirectionMultiplier = typeof options.getDirectionMultiplier === 'function'
      ? options.getDirectionMultiplier
      : function() { return 1; };
    var accumulator = 0;

    function directionMultiplier() {
      return getDirectionMultiplier() < 0 ? -1 : 1;
    }

    function normalizeSteps(baseSteps) {
      if (!baseSteps) return 0;
      return baseSteps * directionMultiplier();
    }

    function reset() {
      accumulator = 0;
    }

    function isActive() {
      return false;
    }

    function push(event) {
      var delta = wheelDeltaPixels(event);
      if (!delta) return { immediate: 0, animated: false };
      if (!isLikelyTrackpad(event)) {
        reset();
        var mouseSteps = Math.max(mouseStep, Math.round(Math.abs(delta) / mouseStepPixels)) * mouseStep;
        var mouseDirection = delta > 0 ? 1 : -1;
        return { immediate: normalizeSteps(mouseDirection * mouseSteps), animated: false };
      }
      accumulator += delta;
      if (Math.abs(accumulator) < trackpadThreshold) return { immediate: 0, animated: false };
      var steps = Math.floor(Math.abs(accumulator) / trackpadThreshold);
      var direction = accumulator > 0 ? 1 : -1;
      accumulator -= direction * steps * trackpadThreshold;
      return { immediate: normalizeSteps(direction * steps), animated: false };
    }

    function advance(now, currentPosition) {
      finiteNumber(now, Date.now());
      finiteNumber(currentPosition, 0);
      return 0;
    }

    return {
      push: push,
      advance: advance,
      reset: reset,
      isActive: isActive
    };
  }

  function createShelfWheelMotionDriver(options) {
    options = options || {};
    var controller = createShelfWheelMotionController(options);
    var getPosition = typeof options.getPosition === 'function' ? options.getPosition : function() { return 0; };
    var applyDelta = typeof options.applyDelta === 'function' ? options.applyDelta : function() {};
    var requestFrame = options.requestFrame || function(cb) { return requestAnimationFrame(cb); };
    var cancelFrame = options.cancelFrame || function(id) { cancelAnimationFrame(id); };
    var rafId = 0;

    function tick(now) {
      rafId = 0;
      var delta = controller.advance(now, getPosition());
      if (delta) applyDelta(delta);
      if (controller.isActive()) rafId = requestFrame(tick);
    }

    function push(event) {
      var result = controller.push(event);
      if (result.immediate) applyDelta(result.immediate);
      if (result.animated && !rafId && controller.isActive()) rafId = requestFrame(tick);
      return result;
    }

    function reset() {
      controller.reset();
      if (rafId) {
        cancelFrame(rafId);
        rafId = 0;
      }
    }

    return {
      push: push,
      reset: reset,
      isActive: controller.isActive,
      controller: controller
    };
  }

  return {
    clamp: clamp,
    wheelDeltaPixels: wheelDeltaPixels,
    isLikelyTrackpad: isLikelyTrackpad,
    createShelfWheelMotionController: createShelfWheelMotionController,
    createShelfWheelMotionDriver: createShelfWheelMotionDriver
  };
});
