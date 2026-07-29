// ============================================================
// 云瀑共振：音乐驱动的分区雨幕。
// 复用主 Three.js scene / renderer / 主循环；不创建第二个 Canvas 或动画循环。
var RAIN_RESONANCE_PRESET_INDEX = 11;
var RAIN_RESONANCE_COLUMN_COUNT = 18;
var RAIN_RESONANCE_ROWS_PER_COLUMN = 64;
var RAIN_RESONANCE_STORE_KEY = 'mineradio-rain-resonance-v1';
var rainResonance = null;
var rainResonanceClock = 0;

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

// Short aliases keep the audio mapping readable at call sites and make the
// three independent controls easy to discover when debugging the preset.
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

var RAIN_RESONANCE_VERT = [
  'attribute float aColumn;',
  'attribute float aSeed;',
  'attribute float aAlpha;',
  'uniform float uTime;',
  'uniform float uMelody;',
  'uniform float uBeat;',
  'uniform float uBass;',
  'uniform float uTreble;',
  'uniform float uIntensity;',
  'uniform float uPixel;',
  'varying float vAlpha;',
  'varying float vGlow;',
  'void main() {',
  '  float columnPhase = aColumn * 6.2831853 + aSeed * 5.17;',
  '  float melodyWave = 0.5 + 0.5 * sin(uTime * (0.85 + uMelody * 1.25) + columnPhase);',
  '  float spreadWave = 0.5 + 0.5 * sin(uTime * 1.12 + aColumn * 5.3 + uMelody * 1.4);',
  '  float flowSpeed = 0.13 + uBass * 0.22 + uIntensity * 0.035 + uBeat * 0.055;',
  '  float travel = fract(aSeed + uTime * flowSpeed);',
  '  float burst = uBeat * (0.25 + spreadWave * 0.75);',
  '  float melodyLift = (melodyWave - 0.5) * (0.55 + uMelody * 2.1);',
  '  float beatLift = burst * (0.35 + melodyWave * 1.35);',
  '  float x = (aColumn - 0.5) * 17.2;',
  '  x += sin(uTime * 0.72 + columnPhase) * (0.08 + uMelody * 0.48);',
  '  x += (spreadWave - 0.5) * uBeat * 0.38;',
  '  float y = 8.2 - travel * 16.6 + melodyLift + beatLift;',
  '  float z = -2.3 + aSeed * 3.6 + (spreadWave - 0.5) * 0.18;',
  '  vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);',
  '  float depth = 24.0 / max(0.7, -mv.z);',
  '  float streakSize = 1.1 + uBass * 1.45 + uIntensity * 0.35;',
  '  float sparkSize = 0.65 + uTreble * 1.1;',
  '  gl_PointSize = clamp((streakSize + sparkSize * aSeed) * depth * uPixel, 1.2, 10.0);',
  '  vAlpha = aAlpha * (0.52 + uIntensity * 0.34) * (0.68 + uBass * 0.52);',
  '  vGlow = clamp(uTreble * 0.72 + uBeat * 0.48 + aSeed * 0.12, 0.0, 1.0);',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

var RAIN_RESONANCE_FRAG = [
  'precision highp float;',
  'uniform vec3 uColor;',
  'varying float vAlpha;',
  'varying float vGlow;',
  'void main() {',
  '  vec2 p = gl_PointCoord * 2.0 - 1.0;',
  '  float ellipse = abs(p.x) * 2.45 + abs(p.y) * 0.62;',
  '  float edge = 1.0 - smoothstep(0.16, 1.0, ellipse);',
  '  float core = 1.0 - smoothstep(0.02, 0.52, abs(p.x) * 2.8 + abs(p.y) * 0.42);',
  '  if (edge < 0.01) discard;',
  '  vec3 color = mix(uColor, vec3(0.92, 0.98, 1.0), vGlow * 0.62);',
  '  color += vec3(0.12, 0.16, 0.20) * core * vGlow;',
  '  gl_FragColor = vec4(color, edge * vAlpha * (0.62 + core * 0.28));',
  '}'
].join('\n');

function ensureRainResonance() {
  if (rainResonance || typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene) return rainResonance;

  var count = RAIN_RESONANCE_COLUMN_COUNT * RAIN_RESONANCE_ROWS_PER_COLUMN;
  var positions = new Float32Array(count * 3);
  var columns = new Float32Array(count);
  var seeds = new Float32Array(count);
  var alphas = new Float32Array(count);
  var index = 0;
  for (var column = 0; column < RAIN_RESONANCE_COLUMN_COUNT; column++) {
    for (var row = 0; row < RAIN_RESONANCE_ROWS_PER_COLUMN; row++) {
      var i3 = index * 3;
      positions[i3] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;
      columns[index] = RAIN_RESONANCE_COLUMN_COUNT <= 1 ? 0.5 : column / (RAIN_RESONANCE_COLUMN_COUNT - 1);
      seeds[index] = (Math.sin(index * 12.9898 + column * 78.233) * 43758.5453) % 1;
      if (seeds[index] < 0) seeds[index] += 1;
      alphas[index] = 0.18 + (row % 7) / 10.0 * 0.42;
      index += 1;
    }
  }

  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColumn', new THREE.BufferAttribute(columns, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

  var pixel = (typeof uniforms !== 'undefined' && uniforms && uniforms.uPixel && uniforms.uPixel.value)
    ? uniforms.uPixel.value : ((typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(2, window.devicePixelRatio) : 1);
  var resonanceUniforms = {
    uTime: { value: 0 },
    uMelody: { value: 0 },
    uBeat: { value: 0 },
    uBass: { value: 0 },
    uTreble: { value: 0 },
    uIntensity: { value: rainResonanceIntensityValue() },
    uPixel: { value: pixel },
    uColor: { value: new THREE.Color(0x9fcfff) }
  };
  var material = new THREE.ShaderMaterial({
    uniforms: resonanceUniforms,
    vertexShader: RAIN_RESONANCE_VERT,
    fragmentShader: RAIN_RESONANCE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  var points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  points.visible = false;
  scene.add(points);

  rainResonance = {
    points: points,
    geometry: geometry,
    material: material,
    uniforms: resonanceUniforms,
    bassS: 0,
    midS: 0,
    trebS: 0,
    beatS: 0
  };
  return rainResonance;
}

function disposeRainResonance() {
  if (!rainResonance) return;
  if (rainResonance.points && typeof scene !== 'undefined' && scene) scene.remove(rainResonance.points);
  if (rainResonance.geometry && rainResonance.geometry.dispose) rainResonance.geometry.dispose();
  if (rainResonance.material && rainResonance.material.dispose) rainResonance.material.dispose();
  rainResonance = null;
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
  rr.points.visible = true;
  var step = Math.max(0.008, Math.min(0.05, Number(dt) || 0.016));
  rainResonanceClock += step;
  var rawBass = rainResonanceClamp(typeof bass !== 'undefined' ? bass : 0, 0, 1, 0);
  var rawMid = rainResonanceClamp(typeof mid !== 'undefined' ? mid : 0, 0, 1, 0);
  var rawTreb = rainResonanceClamp(typeof treble !== 'undefined' ? treble : 0, 0, 1, 0);
  var rawBeat = rainResonanceClamp(typeof beatPulse !== 'undefined' ? beatPulse : 0, 0, 1, 0);
  var playingNow = !!(typeof playing !== 'undefined' && playing && typeof audio !== 'undefined' && audio && !audio.paused);
  var bassTarget = playingNow ? rawBass : rawBass * 0.12;
  var midTarget = playingNow ? rawMid : rawMid * 0.12;
  var trebTarget = playingNow ? rawTreb : rawTreb * 0.10;
  var beatTarget = playingNow ? rawBeat : 0;
  rr.bassS = rainResonanceEase(rr.bassS, bassTarget, 0.24, 0.11, step);
  rr.midS = rainResonanceEase(rr.midS, midTarget, 0.20, 0.10, step);
  rr.trebS = rainResonanceEase(rr.trebS, trebTarget, 0.26, 0.13, step);
  rr.beatS = rainResonanceEase(rr.beatS, beatTarget, 0.72, 0.18, step);

  var intensity = rainResonanceIntensityValue();
  var melody = rainResonanceMelodyValue();
  var beat = rainResonanceBeatValue();
  rr.uniforms.uTime.value = rainResonanceClock;
  rr.uniforms.uIntensity.value = intensity;
  rr.uniforms.uBass.value = Math.min(1.6, rr.bassS * intensity);
  rr.uniforms.uMelody.value = Math.min(1.8, rr.midS * melody * 1.35);
  rr.uniforms.uTreble.value = Math.min(1.4, rr.trebS * (0.7 + intensity * 0.45));
  rr.uniforms.uBeat.value = Math.min(1.8, rr.beatS * beat * 1.35);
  if (rr.uniforms.uPixel && typeof uniforms !== 'undefined' && uniforms && uniforms.uPixel) {
    rr.uniforms.uPixel.value = uniforms.uPixel.value;
  }
  if (rr.uniforms.uColor) {
    if (typeof fx !== 'undefined' && fx && fx.visualTintMode === 'custom' && fx.visualTintColor) {
      try { rr.uniforms.uColor.value.set(fx.visualTintColor); } catch (e) { }
    } else {
      rr.uniforms.uColor.value.set(0x9fcfff);
    }
  }
}
