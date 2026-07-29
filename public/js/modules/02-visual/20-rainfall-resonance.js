// 云瀑共振：Rainform 派生的音乐雨景。
//
// Required Notice: Rainform / 数据成雨 © 2026 afterimage — https://rainform.pages.dev/
// Rainform-derived visual rules are used here with the project owner's
// stated permission. Keep this file separately identified from Mineradio's
// own visual modules and preserve the source notice when redistributing.
//
// RAINFORM_DERIVED_SOURCE: afterimage-lab/Rainform, main/src/main.js
// procedural-liquid-metal: multi-frequency pearl bands, mirror response and Fresnel edge.
// Adaptation boundary: Mineradio's existing scene, renderer and audio loop.
// No second canvas and no second animation loop are created here.

var RAIN_RESONANCE_PRESET_INDEX = 11;
var RAIN_RESONANCE_STORE_KEY = 'mineradio-rain-resonance-v1';
var RAINFORM_CURVE_POINTS = 25;
var RAINFORM_WATER_LEVEL = -2.75;
var RAINFORM_CEILING = 5.55;
var RAINFORM_WORLD_LEFT = -5.15;
var RAINFORM_WORLD_RIGHT = 5.15;
var RAINFORM_CHAIN_LIMIT = 4200;
var RAINFORM_BASE_CHAIN_COUNT = 2000;
var RAINFORM_AMBIENT_CHAIN_COUNT = 800;
var RAINFORM_DOWNPOUR_CHAIN_COUNT = 1400;
var RAINFORM_WATERFALL_FILAMENT_COUNT = 1900;
var RAINFORM_RAIN_LUT_SIZE = 256;
var RAINFORM_ZERO_RAIN_SUPPRESSION = 0.012;
var RAINFORM_WATERLINE = -2.58;
var RAINFORM_METAL = Object.freeze({
  pearlBandFrequency: 5.5,
  pearlBandSpeed: -2.55,
  pearlSpecularPower: 30,
  pearlFresnelStrength: 1.56,
  threadBandDensity: 0.081,
  threadBandSpeed: -0.9,
  threadMirrorStrength: 0.93,
  bodyBandDensity: 5.4,
  bodyBandSpeed: -1.1,
  bodyMirrorStrength: 0.78,
  filamentBandDensity: 2.35,
  filamentBandSpeed: 0.84,
  filamentMirrorStrength: 0.58,
  highlightMirrorStrength: 0.9
});
var RAINFORM_SPLASH_LIMIT = 900;
var RAINFORM_RIPPLE_LIMIT = 88;
var RAINFORM_CHAIN_ROLE = Object.freeze({ BASE: 0, AMBIENT: 1, DOWNPOUR: 2 });

var rainResonance = null;
var rainResonanceClock = 0;
var rainformCurve = [];
var rainformCurveLut = new Float32Array(RAINFORM_RAIN_LUT_SIZE);

function rainResonanceClamp(value, min, max, fallback) {
  var n = Number(value);
  if (!isFinite(n)) n = fallback;
  return Math.max(min, Math.min(max, n));
}

function rainResonanceIntensityValue() {
  return rainResonanceClamp(typeof fx !== 'undefined' && fx ? fx.rainResonanceIntensity : 0.90, 0, 1.6, 0.90);
}

function rainResonanceMelodyValue() {
  return rainResonanceClamp(typeof fx !== 'undefined' && fx ? fx.rainResonanceMelody : 0.80, 0, 1.8, 0.80);
}

function rainResonanceBeatValue() {
  return rainResonanceClamp(typeof fx !== 'undefined' && fx ? fx.rainResonanceBeat : 0.75, 0, 1.8, 0.75);
}

function resonanceIntensityValue() { return rainResonanceIntensityValue(); }
function resonanceMelodyValue() { return rainResonanceMelodyValue(); }
function resonanceBeatValue() { return rainResonanceBeatValue(); }

function saveRainResonanceSettings() {
  try {
    if (typeof fx === 'undefined' || !fx || typeof localStorage === 'undefined') return;
    localStorage.setItem(RAIN_RESONANCE_STORE_KEY, JSON.stringify({
      intensity: rainResonanceIntensityValue(),
      melody: rainResonanceMelodyValue(),
      beat: rainResonanceBeatValue()
    }));
  } catch (e) { }
}

function loadRainResonanceSettings() {
  try {
    if (typeof fx === 'undefined' || !fx || typeof localStorage === 'undefined') return;
    var raw = JSON.parse(localStorage.getItem(RAIN_RESONANCE_STORE_KEY) || '{}') || {};
    if (isFinite(raw.intensity)) fx.rainResonanceIntensity = rainResonanceClamp(raw.intensity, 0, 1.6, 0.90);
    if (isFinite(raw.melody)) fx.rainResonanceMelody = rainResonanceClamp(raw.melody, 0, 1.8, 0.80);
    if (isFinite(raw.beat)) fx.rainResonanceBeat = rainResonanceClamp(raw.beat, 0, 1.8, 0.75);
  } catch (e) { }
}

function rainResonanceActive() {
  return !!(typeof fx !== 'undefined' && fx && Number(fx.preset) === RAIN_RESONANCE_PRESET_INDEX);
}

function rainResonanceSetBodyClass(on) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('rain-resonance-on', !!on);
}

function rainResonanceEase(current, target, rise, fall, dt) {
  var rate = target > current ? rise : fall;
  var step = Math.max(0.008, Math.min(0.05, Number(dt) || 0.016));
  return current + (target - current) * Math.min(1, rate * step * 60);
}

function rainformHash(index, salt) {
  var value = Math.sin((index + 1) * 12.9898 + (salt || 0) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function rainformLerp(a, b, t) { return a + (b - a) * t; }

function rainformSmoothstep(a, b, x) {
  var t = Math.max(0, Math.min(1, (x - a) / Math.max(0.0001, b - a)));
  return t * t * (3 - 2 * t);
}

function rainformCurveAt(x) {
  if (!rainformCurve.length) return 0.25;
  var position = Math.max(0, Math.min(RAINFORM_CURVE_POINTS - 1, Number(x) || 0));
  var left = Math.floor(position);
  var right = Math.min(RAINFORM_CURVE_POINTS - 1, left + 1);
  return rainformLerp(rainformCurve[left], rainformCurve[right], position - left);
}

function rainformRainfallResponse(normalizedX) {
  if (rainResonanceIntensityValue() <= RAINFORM_ZERO_RAIN_SUPPRESSION) return 0;
  if (!rainformCurve.length) return 0.25;
  var x = Math.max(0, Math.min(1, Number(normalizedX) || 0));
  var index = x * (RAINFORM_RAIN_LUT_SIZE - 1);
  var left = Math.floor(index);
  var right = Math.min(RAINFORM_RAIN_LUT_SIZE - 1, left + 1);
  return rainformLerp(rainformCurveLut[left], rainformCurveLut[right], index - left);
}

function rainformDataDrivenCeiling(normalizedX) {
  var rainfall = rainformRainfallResponse(normalizedX);
  return RAINFORM_WATER_LEVEL + 0.55 + Math.pow(Math.min(1.85, rainfall), 0.72) * (RAINFORM_CEILING - RAINFORM_WATER_LEVEL - 0.65);
}

function buildRainformCurveLut() {
  for (var i = 0; i < RAINFORM_RAIN_LUT_SIZE; i++) {
    var x = i / Math.max(1, RAINFORM_RAIN_LUT_SIZE - 1);
    var source = x * (RAINFORM_CURVE_POINTS - 1);
    var left = Math.floor(source);
    var right = Math.min(RAINFORM_CURVE_POINTS - 1, left + 1);
    var value = rainformLerp(rainformCurve[left] || 0, rainformCurve[right] || 0, source - left);
    var previous = i ? rainformCurveLut[i - 1] : value;
    rainformCurveLut[i] = rainformLerp(previous, value, i ? 0.58 : 1);
  }
  return rainformCurveLut;
}

function buildRainformAudioCurve(time) {
  var rawBass = rainResonanceClamp(typeof bass !== 'undefined' ? bass : 0, 0, 1.4, 0);
  var rawMid = rainResonanceClamp(typeof mid !== 'undefined' ? mid : 0, 0, 1.4, 0);
  var rawTreble = rainResonanceClamp(typeof treble !== 'undefined' ? treble : 0, 0, 1.4, 0);
  var rawBeat = rainResonanceClamp(typeof beatPulse !== 'undefined' ? beatPulse : 0, 0, 1.4, 0);
  var intensity = rainResonanceIntensityValue();
  var melody = rainResonanceMelodyValue();
  var beatGain = rainResonanceBeatValue();
  rainformCurve.length = RAINFORM_CURVE_POINTS;

  for (var point = 0; point < RAINFORM_CURVE_POINTS; point++) {
    var normalized = point / (RAINFORM_CURVE_POINTS - 1);
    var broad = 0.5 + 0.5 * Math.sin(normalized * Math.PI * 2.0 + time * (0.34 + melody * 0.32));
    var detail = 0.5 + 0.5 * Math.sin(normalized * Math.PI * 7.0 - time * 0.82 + point * 1.91);
    var beatAccent = rawBeat * beatGain * Math.pow(Math.max(0, Math.sin(normalized * Math.PI * 4.0 + time * 1.7)), 8);
    var value = intensity <= RAINFORM_ZERO_RAIN_SUPPRESSION ? 0
      : 0.015
      + rawBass * intensity * (0.34 + broad * 0.42)
      + rawMid * melody * (0.16 + broad * 0.28 + detail * 0.10)
      + rawTreble * (0.045 + detail * 0.10)
      + beatAccent * (0.22 + rawBass * 0.28);
    rainformCurve[point] = rainResonanceClamp(value, 0.015, 2.0, 0.06);
  }
  buildRainformCurveLut();
  return rainformCurve;
}

var RAINFORM_PEARL_VERT = [
  'uniform float uPixelRatio;',
  'uniform float uBeadScale;',
  'uniform float uWaterfall;',
  'attribute vec3 aColor;',
  'attribute float aAlpha;',
  'attribute float aSize;',
  'attribute float aAspect;',
  'attribute float aHighlight;',
  'attribute float aStorm;',
  'varying vec3 vColor;',
  'varying float vAlpha;',
  'varying float vAspect;',
  'varying float vHighlight;',
  'varying float vStorm;',
  'varying float vWaterfall;',
  'void main() {',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  float depthScale = clamp(20.0 / max(4.6, -mv.z), 0.84, 2.6);',
  '  vColor = aColor;',
  '  vAlpha = aAlpha;',
  '  vAspect = aAspect;',
  '  vHighlight = aHighlight;',
  '  vStorm = aStorm;',
  '  vWaterfall = uWaterfall;',
  '  gl_PointSize = clamp(aSize * aAspect * uBeadScale * uPixelRatio * depthScale, 1.1, 17.0);',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

var RAINFORM_PEARL_FRAG = [
  'precision highp float;',
  'uniform float uTime;',
  'uniform float uPearlBandFrequency;',
  'uniform float uPearlBandSpeed;',
  'uniform float uPearlSpecularPower;',
  'uniform float uPearlFresnelStrength;',
  'uniform float uBodyBandDensity;',
  'uniform float uBodyBandSpeed;',
  'uniform float uBodyMirrorStrength;',
  'uniform float uHighlightMirrorStrength;',
  'varying vec3 vColor;',
  'varying float vAlpha;',
  'varying float vAspect;',
  'varying float vHighlight;',
  'varying float vStorm;',
  'varying float vWaterfall;',
  'void main() {',
  '  vec2 p = gl_PointCoord - vec2(0.5);',
  '  vec2 spherePoint = vec2(p.x * vAspect, p.y);',
  '  float d = length(spherePoint);',
  '  float edge = 1.0 - smoothstep(0.44, 0.51, d);',
  '  if (edge < 0.01) discard;',
  '  vec2 normalXY = clamp(spherePoint / 0.5, vec2(-1.0), vec2(1.0));',
  '  float normalZ = sqrt(max(0.0, 1.0 - dot(normalXY, normalXY)));',
  '  vec3 n = normalize(vec3(normalXY, normalZ));',
  '  vec3 key = normalize(vec3(-0.44, 0.62, 1.0));',
  '  float spec = pow(max(0.0, dot(n, key)), uPearlSpecularPower);',
  '  float fresnel = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.35) * uPearlFresnelStrength;',
  '  float bodyBand = 0.5 + 0.5 * sin((n.y + n.x * 0.42) * uBodyBandDensity + uTime * uBodyBandSpeed + vStorm * 2.2);',
  '  float pearlBand = 0.5 + 0.5 * sin((n.x * 1.4 + n.y * 0.7) * uPearlBandFrequency + uTime * uPearlBandSpeed);',
  '  float reflectionWave = mix(bodyBand, pearlBand, 0.68);',
  '  float mirror = smoothstep(0.26, 0.82, reflectionWave) * uBodyMirrorStrength;',
  '  float shadow = smoothstep(0.72, 0.98, 1.0 - reflectionWave);',
  '  float core = exp(-dot(spherePoint, spherePoint) * 5.5);',
  '  vec3 color = mix(vec3(0.08, 0.12, 0.17), vColor, mirror * 0.82 + core * 0.12);',
  '  color = mix(color, vec3(0.93, 0.98, 1.0), clamp(spec * 1.25 + fresnel * 0.96, 0.0, 1.0));',
  '  color = mix(color, vec3(0.02, 0.035, 0.055), shadow * 0.46);',
  '  color += vec3(1.0) * vHighlight * spec * uHighlightMirrorStrength;',
  '  float alpha = edge * vAlpha * (0.72 + core * 0.32 + spec * 0.22);',
  '  gl_FragColor = vec4(color, min(0.96, alpha));',
  '}'
].join('\n');

var RAINFORM_LINE_VERT = [
  'attribute vec3 aColor;',
  'attribute float aAlpha;',
  'attribute float aPhase;',
  'varying vec3 vColor;',
  'varying float vAlpha;',
  'varying float vPhase;',
  'void main() {',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  vColor = aColor;',
  '  vAlpha = aAlpha;',
  '  vPhase = aPhase;',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

var RAINFORM_LINE_FRAG = [
  'precision highp float;',
  'uniform float uTime;',
  'varying vec3 vColor;',
  'varying float vAlpha;',
  'varying float vPhase;',
  'void main() {',
  '  float shimmer = 0.76 + 0.24 * sin(uTime * 2.1 + vPhase);',
  '  gl_FragColor = vec4(vColor * shimmer, vAlpha * shimmer);',
  '}'
].join('\n');

var RAINFORM_WATERFALL_VERT = [
  'uniform float uTime;',
  'uniform float uWaterfall;',
  'attribute float aSize;',
  'attribute float aAlpha;',
  'attribute float aAspect;',
  'attribute float aSeed;',
  'varying float vAlpha;',
  'varying float vAspect;',
  'varying float vSeed;',
  'void main() {',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  vAlpha = aAlpha * uWaterfall;',
  '  vAspect = aAspect;',
  '  vSeed = aSeed;',
  '  gl_PointSize = clamp(aSize * (19.0 / max(4.5, -mv.z)), 1.0, 21.0);',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

var RAINFORM_WATERFALL_FRAG = [
  'precision highp float;',
  'uniform float uTime;',
  'varying float vAlpha;',
  'varying float vAspect;',
  'varying float vSeed;',
  'void main() {',
  '  vec2 p = gl_PointCoord - vec2(0.5);',
  '  vec2 q = vec2(p.x * vAspect, p.y);',
  '  float d = length(q);',
  '  float edge = 1.0 - smoothstep(0.34, 0.52, d);',
  '  if (edge < 0.01) discard;',
  '  float band = 0.5 + 0.5 * sin((p.x + vSeed) * 22.0 - uTime * 1.7);',
  '  float highlight = smoothstep(0.62, 0.95, band) * (1.0 - abs(p.x) * 1.6);',
  '  vec3 color = mix(vec3(0.12, 0.17, 0.23), vec3(0.74, 0.84, 0.92), band);',
  '  color += vec3(0.92, 0.98, 1.0) * highlight * 0.42;',
  '  gl_FragColor = vec4(color, edge * vAlpha * (0.42 + band * 0.34));',
  '}'
].join('\n');

var RAINFORM_SPLASH_VERT = [
  'attribute vec3 aColor;',
  'attribute float aSize;',
  'attribute float aAspect;',
  'attribute float aAlpha;',
  'varying vec3 vColor;',
  'varying float vSize;',
  'varying float vAspect;',
  'varying float vAlpha;',
  'void main() {',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  vColor = aColor;',
  '  vSize = aSize;',
  '  vAspect = aAspect;',
  '  vAlpha = aAlpha;',
  '  gl_PointSize = clamp(aSize * (18.0 / max(4.3, -mv.z)), 1.0, 24.0);',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

var RAINFORM_SPLASH_FRAG = [
  'precision highp float;',
  'varying vec3 vColor;',
  'varying float vSize;',
  'varying float vAspect;',
  'varying float vAlpha;',
  'void main() {',
  '  vec2 p = gl_PointCoord - vec2(0.5);',
  '  float d = length(vec2(p.x * vAspect, p.y));',
  '  float edge = 1.0 - smoothstep(0.34, 0.5, d);',
  '  if (edge < 0.01) discard;',
  '  float core = exp(-d * d * 7.5);',
  '  gl_FragColor = vec4(vColor * (0.7 + core * 0.45), edge * vAlpha);',
  '}'
].join('\n');

function createRainformPearlMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(2, window.devicePixelRatio) : 1 },
      uBeadScale: { value: 1 },
      uWaterfall: { value: 0 },
      uPearlBandFrequency: { value: RAINFORM_METAL.pearlBandFrequency },
      uPearlBandSpeed: { value: RAINFORM_METAL.pearlBandSpeed },
      uPearlSpecularPower: { value: RAINFORM_METAL.pearlSpecularPower },
      uPearlFresnelStrength: { value: RAINFORM_METAL.pearlFresnelStrength },
      uBodyBandDensity: { value: RAINFORM_METAL.bodyBandDensity },
      uBodyBandSpeed: { value: RAINFORM_METAL.bodyBandSpeed },
      uBodyMirrorStrength: { value: RAINFORM_METAL.bodyMirrorStrength },
      uHighlightMirrorStrength: { value: RAINFORM_METAL.highlightMirrorStrength }
    },
    vertexShader: RAINFORM_PEARL_VERT,
    fragmentShader: RAINFORM_PEARL_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending
  });
}

function createRainformChainSystem() {
  var baseCount = RAINFORM_BASE_CHAIN_COUNT;
  var ambientCount = RAINFORM_AMBIENT_CHAIN_COUNT;
  var downpourCount = RAINFORM_DOWNPOUR_CHAIN_COUNT;
  var count = Math.min(RAINFORM_CHAIN_LIMIT, baseCount + ambientCount + downpourCount);
  var chain = {
    count: count,
    role: new Uint8Array(count),
    baseX: new Float32Array(count),
    baseZ: new Float32Array(count),
    headY: new Float32Array(count),
    length: new Float32Array(count),
    speed: new Float32Array(count),
    phase: new Float32Array(count),
    drift: new Float32Array(count),
    near: new Float32Array(count),
    beadStart: new Uint32Array(count),
    beadCount: new Uint8Array(count),
    lineStart: new Uint32Array(count),
    lineCount: new Uint8Array(count),
    previousTail: new Float32Array(count),
    impactCooldown: new Float32Array(count),
    pearlChain: [],
    pearlFraction: [],
    pearlSize: [],
    pearlAspect: [],
    pearlAlpha: [],
    pearlBaseAlpha: [],
    pearlHighlight: [],
    pearlColor: [],
    linePearlA: [],
    linePearlB: [],
    lineAlpha: [],
    linePhase: []
  };
  var pearlTotal = 0;
  var lineTotal = 0;

  for (var i = 0; i < count; i++) {
    var role = i < baseCount ? RAINFORM_CHAIN_ROLE.BASE
      : i < baseCount + ambientCount ? RAINFORM_CHAIN_ROLE.AMBIENT : RAINFORM_CHAIN_ROLE.DOWNPOUR;
    var seed = rainformHash(i, 13.7);
    var seed2 = rainformHash(i, 41.2);
    var x = RAINFORM_WORLD_LEFT + seed * (RAINFORM_WORLD_RIGHT - RAINFORM_WORLD_LEFT);
    var depth = role === RAINFORM_CHAIN_ROLE.AMBIENT ? -1.9 : -0.9 + seed2 * 1.8;
    var beads = role === RAINFORM_CHAIN_ROLE.AMBIENT ? 18 + Math.floor(seed * 10)
      : role === RAINFORM_CHAIN_ROLE.DOWNPOUR ? 10 + Math.floor(seed * 8) : 14 + Math.floor(seed * 12);
    var length = role === RAINFORM_CHAIN_ROLE.AMBIENT ? 6.4 + seed2 * 1.6
      : 0.78 + seed2 * 1.45 + (role === RAINFORM_CHAIN_ROLE.DOWNPOUR ? 0.46 : 0);
    chain.role[i] = role;
    chain.baseX[i] = x;
    chain.baseZ[i] = depth;
    chain.headY[i] = RAINFORM_WATER_LEVEL + length + 0.4 + rainformHash(i, 91) * (role === RAINFORM_CHAIN_ROLE.AMBIENT ? 1.2 : 5.8);
    chain.length[i] = length;
    chain.speed[i] = role === RAINFORM_CHAIN_ROLE.AMBIENT ? 0 : 1.35 + seed2 * 1.9 + (role === RAINFORM_CHAIN_ROLE.DOWNPOUR ? 0.9 : 0);
    chain.phase[i] = seed * Math.PI * 2;
    chain.drift[i] = 0.025 + seed2 * 0.16;
    chain.near[i] = 0.25 + seed * 0.75;
    chain.beadStart[i] = pearlTotal;
    chain.beadCount[i] = beads;
    chain.lineStart[i] = lineTotal;
    chain.lineCount[i] = beads - 1;
    chain.previousTail[i] = chain.headY[i] - length;
    chain.impactCooldown[i] = 0;

    var baseSize = role === RAINFORM_CHAIN_ROLE.AMBIENT ? 0.45 + seed2 * 0.35
      : 0.78 + seed2 * 0.55 + chain.near[i] * 0.24;
    for (var bead = 0; bead < beads; bead++) {
      var fraction = beads <= 1 ? 0 : bead / (beads - 1);
      var pSeed = rainformHash(pearlTotal + bead, 7.2);
      chain.pearlChain.push(i);
      chain.pearlFraction.push(fraction);
      chain.pearlSize.push(baseSize * (0.91 + pSeed * 0.16));
      chain.pearlAspect.push(role === RAINFORM_CHAIN_ROLE.DOWNPOUR ? 1.1 + pSeed * 0.34 : 1.08 + pSeed * 0.26);
      chain.pearlBaseAlpha.push((role === RAINFORM_CHAIN_ROLE.AMBIENT ? 0.11 : 0.26 + chain.near[i] * 0.18) * (0.72 + pSeed * 0.38));
      chain.pearlAlpha.push(0);
      chain.pearlHighlight.push(role === RAINFORM_CHAIN_ROLE.DOWNPOUR ? 0.16 + pSeed * 0.24 : 0.06 + pSeed * 0.22);
      chain.pearlColor.push(role === RAINFORM_CHAIN_ROLE.AMBIENT ? [0.42, 0.52, 0.64] : [0.57, 0.68, 0.79]);
      pearlTotal++;
    }
    for (var segment = 0; segment < beads - 1; segment++) {
      var lineSeed = rainformHash(lineTotal + segment, 17.4);
      chain.linePearlA.push(chain.beadStart[i] + segment);
      chain.linePearlB.push(chain.beadStart[i] + segment + 1);
      chain.lineAlpha.push((role === RAINFORM_CHAIN_ROLE.AMBIENT ? 0.004 : 0.012 + chain.near[i] * 0.012) * (0.7 + lineSeed * 0.3));
      chain.linePhase.push(lineSeed * Math.PI * 2);
      lineTotal++;
    }
  }

  var pearlPositions = new Float32Array(pearlTotal * 3);
  var pearlColors = new Float32Array(pearlTotal * 3);
  var pearlAlphas = new Float32Array(pearlTotal);
  var pearlSizes = new Float32Array(pearlTotal);
  var pearlAspects = new Float32Array(pearlTotal);
  var pearlHighlights = new Float32Array(pearlTotal);
  for (var p = 0; p < pearlTotal; p++) {
    var pc = chain.pearlColor[p];
    pearlColors[p * 3] = pc[0];
    pearlColors[p * 3 + 1] = pc[1];
    pearlColors[p * 3 + 2] = pc[2];
    pearlSizes[p] = chain.pearlSize[p];
    pearlAspects[p] = chain.pearlAspect[p];
    pearlHighlights[p] = chain.pearlHighlight[p];
  }
  var linePositions = new Float32Array(lineTotal * 2 * 3);
  var lineColors = new Float32Array(lineTotal * 2 * 3);
  var lineAlphas = new Float32Array(lineTotal * 2);
  var linePhases = new Float32Array(lineTotal * 2);
  for (var l = 0; l < lineTotal; l++) {
    lineColors[l * 6] = 0.29;
    lineColors[l * 6 + 1] = 0.38;
    lineColors[l * 6 + 2] = 0.48;
    lineColors[l * 6 + 3] = 0.42;
    lineColors[l * 6 + 4] = 0.51;
    lineColors[l * 6 + 5] = 0.60;
    linePhases[l * 2] = chain.linePhase[l];
    linePhases[l * 2 + 1] = chain.linePhase[l];
  }

  var pearlGeometry = new THREE.BufferGeometry();
  pearlGeometry.setAttribute('position', new THREE.BufferAttribute(pearlPositions, 3).setUsage(THREE.DynamicDrawUsage));
  pearlGeometry.setAttribute('aColor', new THREE.BufferAttribute(pearlColors, 3));
  pearlGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(pearlAlphas, 1).setUsage(THREE.DynamicDrawUsage));
  pearlGeometry.setAttribute('aSize', new THREE.BufferAttribute(pearlSizes, 1));
  pearlGeometry.setAttribute('aAspect', new THREE.BufferAttribute(pearlAspects, 1));
  pearlGeometry.setAttribute('aHighlight', new THREE.BufferAttribute(pearlHighlights, 1));
  pearlGeometry.setAttribute('aStorm', new THREE.BufferAttribute(new Float32Array(pearlTotal), 1));
  var pearlMaterial = createRainformPearlMaterial();
  var points = new THREE.Points(pearlGeometry, pearlMaterial);
  points.frustumCulled = false;
  points.renderOrder = 4;

  var lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeometry.setAttribute('aColor', new THREE.BufferAttribute(lineColors, 3));
  lineGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(lineAlphas, 1).setUsage(THREE.DynamicDrawUsage));
  lineGeometry.setAttribute('aPhase', new THREE.BufferAttribute(linePhases, 1));
  var lineMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: RAINFORM_LINE_VERT,
    fragmentShader: RAINFORM_LINE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending
  });
  var lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  lines.frustumCulled = false;
  lines.renderOrder = 3;

  chain.pearlPositions = pearlPositions;
  chain.pearlAlphas = pearlAlphas;
  chain.pearlSizes = pearlSizes;
  chain.pearlAspects = pearlAspects;
  chain.linePositions = linePositions;
  chain.lineAlphas = lineAlphas;
  chain.pearlStorm = pearlGeometry.getAttribute('aStorm').array;
  chain.pearlCount = pearlTotal;
  chain.lineTotal = lineTotal;
  return { points: points, lines: lines, data: chain };
}

function createRainformWaterfallSystem() {
  var columnCount = 44;
  var beadsPerColumn = 12;
  var count = columnCount * beadsPerColumn;
  var positions = new Float32Array(count * 3);
  var sizes = new Float32Array(count);
  var alphas = new Float32Array(count);
  var aspects = new Float32Array(count);
  var seeds = new Float32Array(count);
  var columns = new Float32Array(columnCount);
  for (var c = 0; c < columnCount; c++) {
    columns[c] = c / Math.max(1, columnCount - 1);
    for (var b = 0; b < beadsPerColumn; b++) {
      var index = c * beadsPerColumn + b;
      sizes[index] = 0.65 + rainformHash(index, 81) * 0.62;
      alphas[index] = 0;
      aspects[index] = 1.2 + rainformHash(index, 19) * 1.4;
      seeds[index] = rainformHash(index, 33);
    }
  }
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAspect', new THREE.BufferAttribute(aspects, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  var material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uWaterfall: { value: 0 } },
    vertexShader: RAINFORM_WATERFALL_VERT,
    fragmentShader: RAINFORM_WATERFALL_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending
  });
  var points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return { points: points, geometry: geometry, material: material, positions: positions, alphas: alphas, columns: columns, beadsPerColumn: beadsPerColumn };
}

function createRainformFilamentSystem() {
  var count = RAINFORM_WATERFALL_FILAMENT_COUNT;
  var sourceGeometry = new THREE.PlaneGeometry(1, 1);
  var geometry = new THREE.InstancedBufferGeometry();
  geometry.copy(sourceGeometry);
  sourceGeometry.dispose();
  geometry.instanceCount = count;
  var material = new THREE.MeshBasicMaterial({
    color: 0x8eaec7,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  var mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'rainform-waterfall-filaments';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  var normX = new Float32Array(count);
  var depth = new Float32Array(count);
  var phase = new Float32Array(count);
  var width = new Float32Array(count);
  var alpha = new Float32Array(count);
  var heightBias = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    normX[i] = rainformHash(i, 101);
    depth[i] = -1.34 + rainformHash(i, 103) * 0.75;
    phase[i] = rainformHash(i, 107) * Math.PI * 2;
    width[i] = 0.006 + rainformHash(i, 109) * 0.018;
    alpha[i] = 0.2 + rainformHash(i, 113) * 0.8;
    heightBias[i] = rainformHash(i, 127);
  }
  return { mesh: mesh, geometry: geometry, material: material, count: count, normX: normX, depth: depth, phase: phase, width: width, alpha: alpha, heightBias: heightBias };
}

function createRainformWaterSurface() {
  var geometry = new THREE.PlaneGeometry(12, 1.35, 48, 6);
  var material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRainfall: { value: 0 } },
    vertexShader: [
      'uniform float uTime;',
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  vec3 p = position;',
      '  p.y += sin(p.x * 3.2 + uTime * 0.8) * 0.018;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
      '}'
    ].join('\\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform float uTime;',
      'uniform float uRainfall;',
      'varying vec2 vUv;',
      'void main() {',
      '  float edge = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.58, 1.0, vUv.y));',
      '  float line = pow(0.5 + 0.5 * sin(vUv.x * 76.0 - uTime * 1.8), 12.0);',
      '  vec3 color = mix(vec3(0.13, 0.25, 0.36), vec3(0.74, 0.9, 1.0), line);',
      '  gl_FragColor = vec4(color, edge * (0.025 + uRainfall * 0.11));',
      '}'
    ].join('\\n'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  var mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'rainform-water-surface';
  mesh.position.set(0, RAINFORM_WATERLINE, -1.05);
  mesh.renderOrder = 2;
  return { mesh: mesh, geometry: geometry, material: material };
}

function createRainformMistBand() {
  var geometry = new THREE.PlaneGeometry(12, 1.8, 32, 4);
  var material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRainfall: { value: 0 } },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform float uTime;',
      'uniform float uRainfall;',
      'varying vec2 vUv;',
      'void main() {',
      '  float band = smoothstep(0.06, 0.45, vUv.y) * (1.0 - smoothstep(0.56, 0.98, vUv.y));',
      '  float drift = 0.5 + 0.5 * sin(vUv.x * 9.0 + uTime * 0.16);',
      '  vec3 color = mix(vec3(0.16, 0.25, 0.33), vec3(0.42, 0.62, 0.74), drift);',
      '  gl_FragColor = vec4(color, band * (0.008 + uRainfall * 0.035));',
      '}'
    ].join('\\n'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  var mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'rainform-mist-band';
  mesh.position.set(0, RAINFORM_WATER_LEVEL + 0.38, -1.22);
  mesh.renderOrder = 0;
  return { mesh: mesh, geometry: geometry, material: material };
}

function createRainformSplashSystem() {
  var count = RAINFORM_SPLASH_LIMIT;
  var positions = new Float32Array(count * 3);
  var colors = new Float32Array(count * 3);
  var sizes = new Float32Array(count);
  var aspects = new Float32Array(count);
  var alphas = new Float32Array(count);
  var active = new Uint8Array(count);
  var life = new Float32Array(count);
  var age = new Float32Array(count);
  var vx = new Float32Array(count);
  var vy = new Float32Array(count);
  var vz = new Float32Array(count);
  var cursor = 0;
  for (var i = 0; i < count; i++) {
    positions[i * 3 + 1] = -30;
    colors[i * 3] = 0.58;
    colors[i * 3 + 1] = 0.72;
    colors[i * 3 + 2] = 0.84;
    sizes[i] = 0.8;
    aspects[i] = 1;
  }
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAspect', new THREE.BufferAttribute(aspects, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  var material = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: RAINFORM_SPLASH_VERT,
    fragmentShader: RAINFORM_SPLASH_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  var points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return { points: points, geometry: geometry, positions: positions, sizes: sizes, aspects: aspects, alphas: alphas, active: active, life: life, age: age, vx: vx, vy: vy, vz: vz, cursor: cursor, count: count };
}

function createRainformRippleSystem() {
  var count = RAINFORM_RIPPLE_LIMIT;
  var positions = new Float32Array(count * 2 * 3);
  var alphas = new Float32Array(count * 2);
  var active = new Uint8Array(count);
  var age = new Float32Array(count);
  var life = new Float32Array(count);
  var originX = new Float32Array(count);
  var originZ = new Float32Array(count);
  var radius = new Float32Array(count);
  var cursor = 0;
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 2 * 3).fill(0.78), 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(count * 2), 1));
  var material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: RAINFORM_LINE_VERT,
    fragmentShader: RAINFORM_LINE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  var lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  return { lines: lines, geometry: geometry, positions: positions, alphas: alphas, active: active, age: age, life: life, originX: originX, originZ: originZ, radius: radius, cursor: cursor, count: count };
}

function createRainformBackdrop() {
  var geometry = new THREE.PlaneGeometry(22, 15);
  var material = new THREE.MeshBasicMaterial({ color: 0x05080e, transparent: true, opacity: 0.56, depthWrite: false, depthTest: false });
  var mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0.5, -5.2);
  mesh.renderOrder = -3;
  return mesh;
}

function createRainformFloor() {
  var geometry = new THREE.PlaneGeometry(12, 3.2);
  var material = new THREE.MeshBasicMaterial({ color: 0x15202b, transparent: true, opacity: 0.3, depthWrite: false, depthTest: false });
  var mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.position.set(0, RAINFORM_WATER_LEVEL, -0.9);
  mesh.renderOrder = 1;
  return mesh;
}

function ensureRainResonance() {
  if (rainResonance || typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene) return rainResonance;
  var group = new THREE.Group();
  group.name = 'rainform-derived-rainfall';
  var chains = createRainformChainSystem();
  var waterfall = createRainformWaterfallSystem();
  var filaments = createRainformFilamentSystem();
  var waterSurface = createRainformWaterSurface();
  var mistBand = createRainformMistBand();
  var splash = createRainformSplashSystem();
  var ripple = createRainformRippleSystem();
  var backdrop = null;
  var floor = null;
  waterfall.points.visible = false;
  group.add(waterSurface.mesh, mistBand.mesh, chains.lines, filaments.mesh, chains.points, ripple.lines, splash.points);
  scene.add(group);
  group.visible = false;
  rainResonance = {
    group: group,
    chains: chains,
    waterfall: waterfall,
    filaments: filaments,
    filamentDummy: new THREE.Object3D(),
    waterSurface: waterSurface,
    mistBand: mistBand,
    splash: splash,
    ripple: ripple,
    backdrop: backdrop,
    floor: floor,
    bassS: 0,
    midS: 0,
    trebS: 0,
    beatS: 0,
    splashCredit: 0,
    rippleCredit: 0,
    aliveSplash: 0,
    activeRipples: 0
  };
  return rainResonance;
}

function disposeRainResonance() {
  if (!rainResonance) return;
  var rr = rainResonance;
  if (rr.group && typeof scene !== 'undefined' && scene) scene.remove(rr.group);
  var objects = [rr.chains && rr.chains.points, rr.chains && rr.chains.lines, rr.waterfall && rr.waterfall.points, rr.filaments && rr.filaments.mesh, rr.splash && rr.splash.points, rr.ripple && rr.ripple.lines];
  for (var i = 0; i < objects.length; i++) {
    var object = objects[i];
    if (!object) continue;
    if (object.geometry && object.geometry.dispose) object.geometry.dispose();
    if (object.material && object.material.dispose) object.material.dispose();
  }
  var surfaces = [rr.waterSurface, rr.mistBand];
  for (var s = 0; s < surfaces.length; s++) {
    if (!surfaces[s]) continue;
    if (surfaces[s].geometry && surfaces[s].geometry.dispose) surfaces[s].geometry.dispose();
    if (surfaces[s].material && surfaces[s].material.dispose) surfaces[s].material.dispose();
  }
  if (rr.backdrop) { if (rr.backdrop.geometry) rr.backdrop.geometry.dispose(); if (rr.backdrop.material) rr.backdrop.material.dispose(); }
  if (rr.floor) { if (rr.floor.geometry) rr.floor.geometry.dispose(); if (rr.floor.material) rr.floor.material.dispose(); }
  rainResonance = null;
}

function rainformEmitSplash(rr, x, z, strength, near, time) {
  var splash = rr.splash;
  var spawn = Math.max(3, Math.min(11, Math.round(4 + strength * 4 + near * 2)));
  for (var s = 0; s < spawn; s++) {
    var i = splash.cursor++ % splash.count;
    var angle = rainformHash(i + Math.floor(time * 10), 71) * Math.PI * 2;
    var radial = 0.08 + rainformHash(i, 23) * (0.24 + strength * 0.26);
    var index = i * 3;
    splash.active[i] = 1;
    splash.age[i] = 0;
    splash.life[i] = 0.42 + rainformHash(i, 29) * 0.74;
    splash.positions[index] = x + Math.cos(angle) * radial;
    splash.positions[index + 1] = RAINFORM_WATER_LEVEL + 0.04;
    splash.positions[index + 2] = z + Math.sin(angle) * radial * 0.48;
    splash.vx[i] = Math.cos(angle) * (0.25 + strength * 0.48);
    splash.vy[i] = 0.26 + rainformHash(i, 37) * (0.42 + near * 0.3);
    splash.vz[i] = Math.sin(angle) * (0.16 + strength * 0.22);
    splash.sizes[i] = 0.68 + rainformHash(i, 43) * (1.2 + near * 1.4);
    splash.aspects[i] = 1.3 + rainformHash(i, 47) * 2.6;
    splash.alphas[i] = 0.72 + strength * 0.18;
  }
  rr.splash.geometry.attributes.position.needsUpdate = true;
  rr.splash.geometry.attributes.aSize.needsUpdate = true;
  rr.splash.geometry.attributes.aAspect.needsUpdate = true;
  rr.splash.geometry.attributes.aAlpha.needsUpdate = true;
  rr.aliveSplash = Math.min(splash.count, rr.aliveSplash + spawn);
}

function rainformEmitRipple(rr, x, z, strength, time) {
  var ripple = rr.ripple;
  var i = ripple.cursor++ % ripple.count;
  ripple.active[i] = 1;
  ripple.age[i] = 0;
  ripple.life[i] = 0.8 + strength * 0.55;
  ripple.originX[i] = x;
  ripple.originZ[i] = z;
  ripple.radius[i] = 0.08 + strength * 0.12;
  rr.activeRipples = Math.min(ripple.count, rr.activeRipples + 1);
  ripple.geometry.attributes.aPhase.array[i * 2] = time;
  ripple.geometry.attributes.aPhase.array[i * 2 + 1] = time;
}

function emitRainformSplash(rr, x, z, strength, near, time) {
  rainformEmitSplash(rr, x, z, strength, near, time);
  if (rr.rippleCredit >= 1) {
    rr.rippleCredit -= 1;
    rainformEmitRipple(rr, x, z, strength, time);
  }
}

function updateRainformChains(rr, dt, time) {
  var data = rr.chains.data;
  var curve = rainformCurve;
  var intensity = rainResonanceIntensityValue();
  var beat = rr.beatS * rainResonanceBeatValue();
  var pearlStorm = data.pearlStorm;
  for (var c = 0; c < data.count; c++) {
    var role = data.role[c];
    var xNorm = (data.baseX[c] - RAINFORM_WORLD_LEFT) / (RAINFORM_WORLD_RIGHT - RAINFORM_WORLD_LEFT);
    var curveValue = rainformRainfallResponse(xNorm);
    var localCeiling = rainformDataDrivenCeiling(xNorm);
    var rainAlpha = curveValue <= RAINFORM_ZERO_RAIN_SUPPRESSION ? 0 : Math.min(1, curveValue * 1.35);
    var storm = rainformSmoothstep(0.64, 1.18, curveValue);
    var previousTail = data.headY[c] - data.length[c];
    data.previousTail[c] = previousTail;
    if (role !== RAINFORM_CHAIN_ROLE.AMBIENT) {
      data.headY[c] -= data.speed[c] * dt * (0.72 + curveValue * 0.38 + rr.bassS * 0.18) * (0.72 + intensity * 0.2);
    } else {
      data.headY[c] = localCeiling + 0.2;
    }
    var tail = data.headY[c] - data.length[c];
    var wind = Math.sin(time * (0.34 + rr.midS * 0.28) + data.phase[c]) * data.drift[c] * (0.7 + rr.midS * 0.55);
    var pathX = data.baseX[c] + wind + Math.sin(time * 0.17 + data.phase[c] * 1.7) * rr.midS * 0.08;
    var pathZ = data.baseZ[c] + Math.cos(time * 0.27 + data.phase[c]) * 0.06;
    if (role !== RAINFORM_CHAIN_ROLE.AMBIENT && previousTail >= RAINFORM_WATER_LEVEL && tail < RAINFORM_WATER_LEVEL && data.impactCooldown[c] <= 0) {
      var near = data.near[c];
      emitRainformSplash(rr, pathX, pathZ, curveValue, near, time);
      data.impactCooldown[c] = 0.24;
    }
    data.impactCooldown[c] = Math.max(0, data.impactCooldown[c] - dt);
    if (role !== RAINFORM_CHAIN_ROLE.AMBIENT && tail < RAINFORM_WATER_LEVEL) {
      data.headY[c] = RAINFORM_WATER_LEVEL + data.length[c] + 0.28
        + rainformHash(c + Math.floor(time * 4), 61) * Math.max(0.55, localCeiling - RAINFORM_WATER_LEVEL - 0.35);
    }

    var start = data.beadStart[c];
    var beads = data.beadCount[c];
    for (var b = 0; b < beads; b++) {
      var pearl = start + b;
      var fraction = data.pearlFraction[pearl];
      var y = data.headY[c] - fraction * data.length[c];
      var p3 = pearl * 3;
      data.pearlPositions[p3] = pathX;
      data.pearlPositions[p3 + 1] = Math.min(localCeiling + 0.25, y);
      data.pearlPositions[p3 + 2] = pathZ + (fraction - 0.5) * 0.035;
      var topFade = 1 - rainformSmoothstep(RAINFORM_CEILING - 0.35, RAINFORM_CEILING + 0.25, y);
      var floorFade = rainformSmoothstep(RAINFORM_WATER_LEVEL, RAINFORM_WATER_LEVEL + 0.18, y);
      var topNoise = role === RAINFORM_CHAIN_ROLE.AMBIENT ? 0.7 : 0.85 + 0.15 * rainformHash(pearl, 11);
      data.pearlAlphas[pearl] = Math.max(0, Math.min(0.96,
        data.pearlBaseAlpha[pearl] * topFade * floorFade * topNoise * rainAlpha * (0.34 + curveValue * 0.78) * (1 + beat * 0.18)
      ));
      pearlStorm[pearl] = storm;
    }
    var lineStart = data.lineStart[c];
    for (var segment = 0; segment < data.lineCount[c]; segment++) {
      var line = lineStart + segment;
      var a = data.linePearlA[line] * 3;
      var bIndex = data.linePearlB[line] * 3;
      var l6 = line * 6;
      data.linePositions[l6] = data.pearlPositions[a];
      data.linePositions[l6 + 1] = data.pearlPositions[a + 1];
      data.linePositions[l6 + 2] = data.pearlPositions[a + 2];
      data.linePositions[l6 + 3] = data.pearlPositions[bIndex];
      data.linePositions[l6 + 4] = data.pearlPositions[bIndex + 1];
      data.linePositions[l6 + 5] = data.pearlPositions[bIndex + 2];
      data.lineAlphas[line * 2] = data.lineAlpha[line] * rainAlpha * (0.32 + curveValue * 0.68);
      data.lineAlphas[line * 2 + 1] = data.lineAlphas[line * 2];
    }
  }
  data.pearlPositions && data.pearlPositions.length && (rr.chains.points.geometry.attributes.position.needsUpdate = true);
  rr.chains.points.geometry.attributes.aAlpha.needsUpdate = true;
  rr.chains.points.geometry.attributes.aStorm.needsUpdate = true;
  rr.chains.lines.geometry.attributes.position.needsUpdate = true;
  rr.chains.lines.geometry.attributes.aAlpha.needsUpdate = true;
  rr.chains.points.material.uniforms.uTime.value = time;
  rr.chains.points.material.uniforms.uBeadScale.value = 0.92 + intensity * 0.12;
  rr.chains.points.material.uniforms.uWaterfall.value = Math.min(1, rr.bassS * intensity);
  rr.chains.lines.material.uniforms.uTime.value = time;
  return curve;
}

function updateRainformWaterfall(rr, dt, time) {
  var waterfall = rr.waterfall;
  var curve = rainformCurve;
  var count = waterfall.columns.length;
  var active = 0;
  for (var c = 0; c < count; c++) {
    var x = rainformLerp(RAINFORM_WORLD_LEFT, RAINFORM_WORLD_RIGHT, waterfall.columns[c]);
    var value = rainformRainfallResponse(waterfall.columns[c]);
    var height = 0.55 + Math.pow(Math.min(1.4, value), 0.72) * 4.9;
    var columnAlpha = rainformSmoothstep(0.56, 0.9, value) * (0.24 + rr.bassS * 0.66);
    if (columnAlpha > 0.02) active++;
    for (var b = 0; b < waterfall.beadsPerColumn; b++) {
      var index = c * waterfall.beadsPerColumn + b;
      var progress = b / Math.max(1, waterfall.beadsPerColumn - 1);
      var p3 = index * 3;
      var sway = Math.sin(time * (0.52 + rr.midS * 0.35) + c * 0.73 + b * 0.11) * (0.025 + rr.midS * 0.14);
      waterfall.positions[p3] = x + sway;
      waterfall.positions[p3 + 1] = RAINFORM_WATER_LEVEL + progress * height;
      waterfall.positions[p3 + 2] = -1.02 + Math.sin(c * 1.7 + time * 0.22) * 0.04;
      waterfall.alphas[index] = columnAlpha * (0.34 + 0.66 * (1 - progress)) * (0.72 + rr.beatS * 0.35);
    }
  }
  waterfall.geometry.attributes.position.needsUpdate = true;
  waterfall.geometry.attributes.aAlpha.needsUpdate = true;
  waterfall.material.uniforms.uTime.value = time;
  waterfall.material.uniforms.uWaterfall.value = Math.min(1, rr.bassS * rainResonanceIntensityValue() * 1.18 + rr.beatS * 0.22);
  rr.waterfall.activeCount = active;
  return curve;
}

function updateRainformFilaments(rr, dt, time) {
  var filament = rr.filaments;
  var dummy = rr.filamentDummy;
  var rainfallTotal = 0;
  var intensity = rainResonanceIntensityValue();
  for (var i = 0; i < filament.count; i++) {
    var rainfall = rainformRainfallResponse(filament.normX[i]);
    rainfallTotal += rainfall;
    var height = Math.max(0.001, (rainformDataDrivenCeiling(filament.normX[i]) - RAINFORM_WATER_LEVEL - 0.42)
      * (0.38 + filament.heightBias[i] * 0.62));
    var x = rainformLerp(RAINFORM_WORLD_LEFT, RAINFORM_WORLD_RIGHT, filament.normX[i]);
    var sway = Math.sin(time * (0.42 + rr.midS * 0.22) + filament.phase[i]) * (0.018 + rr.midS * 0.07);
    dummy.position.set(x + sway, RAINFORM_WATER_LEVEL + 0.2 + height * 0.5, filament.depth[i]);
    dummy.rotation.set(0, 0, Math.sin(time * 0.24 + filament.phase[i]) * 0.045);
    dummy.scale.set(filament.width[i] * (0.72 + rainfall * 0.8), height, 1);
    dummy.updateMatrix();
    filament.mesh.setMatrixAt(i, dummy.matrix);
  }
  filament.mesh.instanceMatrix.needsUpdate = true;
  filament.mesh.visible = intensity > RAINFORM_ZERO_RAIN_SUPPRESSION;
  filament.material.opacity = 0.055 + Math.min(0.14, (rainfallTotal / filament.count) * 0.14 + rr.trebS * 0.035);
  rr.filamentRainfall = rainfallTotal / Math.max(1, filament.count);
  return rr.filamentRainfall;
}

function updateRainformSurface(rr, time) {
  var rainfall = rainformRainfallResponse(0.5);
  if (rr.waterSurface && rr.waterSurface.material) {
    rr.waterSurface.material.uniforms.uTime.value = time;
    rr.waterSurface.material.uniforms.uRainfall.value = rainfall;
    rr.waterSurface.mesh.visible = rainfall > RAINFORM_ZERO_RAIN_SUPPRESSION;
  }
  if (rr.mistBand && rr.mistBand.material) {
    rr.mistBand.material.uniforms.uTime.value = time;
    rr.mistBand.material.uniforms.uRainfall.value = rainfall;
    rr.mistBand.mesh.visible = rainfall > RAINFORM_ZERO_RAIN_SUPPRESSION;
  }
}

function updateRainformSplashes(rr, dt) {
  var splash = rr.splash;
  var active = 0;
  for (var i = 0; i < splash.count; i++) {
    if (!splash.active[i]) continue;
    splash.age[i] += dt;
    var progress = splash.age[i] / Math.max(0.001, splash.life[i]);
    var p3 = i * 3;
    if (progress >= 1) {
      splash.active[i] = 0;
      splash.alphas[i] = 0;
      splash.positions[p3 + 1] = -30;
      continue;
    }
    splash.positions[p3] += splash.vx[i] * dt;
    splash.positions[p3 + 1] += splash.vy[i] * dt;
    splash.positions[p3 + 2] += splash.vz[i] * dt;
    splash.vy[i] -= 1.8 * dt;
    splash.sizes[i] *= 1 + dt * 0.38;
    splash.alphas[i] = (1 - rainformSmoothstep(0.62, 1, progress)) * (0.8 + Math.sin(progress * Math.PI) * 0.2);
    active++;
  }
  splash.geometry.attributes.position.needsUpdate = true;
  splash.geometry.attributes.aSize.needsUpdate = true;
  splash.geometry.attributes.aAlpha.needsUpdate = true;
  rr.aliveSplash = active;
  return active;
}

function updateRainformRipples(rr, dt, time) {
  var ripple = rr.ripple;
  var active = 0;
  for (var i = 0; i < ripple.count; i++) {
    if (!ripple.active[i]) continue;
    ripple.age[i] += dt;
    var progress = ripple.age[i] / Math.max(0.001, ripple.life[i]);
    var p6 = i * 6;
    if (progress >= 1) {
      ripple.active[i] = 0;
      ripple.alphas[i * 2] = 0;
      ripple.alphas[i * 2 + 1] = 0;
      ripple.positions[p6 + 1] = -30;
      ripple.positions[p6 + 4] = -30;
      continue;
    }
    var r = ripple.radius[i] + progress * (0.36 + rr.bassS * 0.46);
    ripple.positions[p6] = ripple.originX[i] - r;
    ripple.positions[p6 + 1] = RAINFORM_WATER_LEVEL + 0.015;
    ripple.positions[p6 + 2] = ripple.originZ[i];
    ripple.positions[p6 + 3] = ripple.originX[i] + r;
    ripple.positions[p6 + 4] = RAINFORM_WATER_LEVEL + 0.015;
    ripple.positions[p6 + 5] = ripple.originZ[i];
    var alpha = (1 - progress) * (0.22 + rr.beatS * 0.46);
    ripple.alphas[i * 2] = alpha;
    ripple.alphas[i * 2 + 1] = alpha;
    active++;
  }
  ripple.geometry.attributes.position.needsUpdate = true;
  ripple.geometry.attributes.aAlpha.needsUpdate = true;
  ripple.lines.material.uniforms.uTime.value = time;
  rr.activeRipples = active;
  return active;
}

function updateRainResonance(dt) {
  if (!rainResonanceActive()) {
    disposeRainResonance();
    rainResonanceSetBodyClass(false);
    return;
  }
  var rr = ensureRainResonance();
  if (!rr) return;
  rainResonanceSetBodyClass(true);
  rr.group.visible = true;
  var step = Math.max(0.008, Math.min(0.05, Number(dt) || 0.016));
  rainResonanceClock += step;
  var playingNow = !!(typeof playing !== 'undefined' && playing && typeof audio !== 'undefined' && audio && !audio.paused);
  var rawBass = rainResonanceClamp(typeof bass !== 'undefined' ? bass : 0, 0, 1, 0);
  var rawMid = rainResonanceClamp(typeof mid !== 'undefined' ? mid : 0, 0, 1, 0);
  var rawTreble = rainResonanceClamp(typeof treble !== 'undefined' ? treble : 0, 0, 1, 0);
  var rawBeat = rainResonanceClamp(typeof beatPulse !== 'undefined' ? beatPulse : 0, 0, 1, 0);
  rr.bassS = rainResonanceEase(rr.bassS, playingNow ? rawBass : rawBass * 0.12, 0.24, 0.11, step);
  rr.midS = rainResonanceEase(rr.midS, playingNow ? rawMid : rawMid * 0.12, 0.20, 0.10, step);
  rr.trebS = rainResonanceEase(rr.trebS, playingNow ? rawTreble : rawTreble * 0.10, 0.26, 0.13, step);
  rr.beatS = rainResonanceEase(rr.beatS, playingNow ? rawBeat : 0, 0.72, 0.18, step);
  buildRainformAudioCurve(rainResonanceClock);
  rr.splashCredit = Math.min(26, rr.splashCredit + (5 + rr.bassS * 24 + rr.beatS * 12) * step);
  rr.rippleCredit = Math.min(9, rr.rippleCredit + (1.6 + rr.bassS * 5 + rr.beatS * 3) * step);
  updateRainformChains(rr, step, rainResonanceClock);
  updateRainformWaterfall(rr, step, rainResonanceClock);
  updateRainformFilaments(rr, step, rainResonanceClock);
  updateRainformSurface(rr, rainResonanceClock);
  if (rr.splashCredit >= 1 && rr.bassS > 0.08 && rainformRainfallResponse(0.5) > 0.42) {
    rr.splashCredit -= 1;
    var impactX = rainformLerp(RAINFORM_WORLD_LEFT, RAINFORM_WORLD_RIGHT, rainformHash(Math.floor(rainResonanceClock * 12), 91));
    rainformEmitSplash(rr, impactX, -0.94, rr.bassS, 0.6, rainResonanceClock);
  }
  updateRainformSplashes(rr, step);
  updateRainformRipples(rr, step, rainResonanceClock);
  if (rr.backdrop && rr.backdrop.material) rr.backdrop.material.opacity = 0.48 + rr.bassS * 0.10;
  if (rr.floor && rr.floor.material) rr.floor.material.opacity = 0.22 + rr.bassS * 0.16;
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.rainformCurvePoints = String(RAINFORM_CURVE_POINTS);
    document.body.dataset.rainformChainCount = String(rr.chains.data.count);
    document.body.dataset.rainformWaterfallCount = String(rr.waterfall.activeCount || 0);
    document.body.dataset.rainformSplashCount = String(rr.aliveSplash || 0);
    document.body.dataset.rainformRippleCount = String(rr.activeRipples || 0);
  }
}
