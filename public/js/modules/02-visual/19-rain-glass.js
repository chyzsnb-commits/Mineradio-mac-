// ============================================================
// 雨境前景挂壁水珠：复用主 renderer 与主循环，不创建第二个 Canvas / RAF。
var RAIN_GLASS_PRESET_INDEX = 9;
var RAIN_GLASS_FIELD_SCALE = 1.0;
var RAIN_GLASS_BLUR_SCALE = 0.55;
var RAIN_GLASS_FIELD_MAX_WIDTH = 2048;
var RAIN_GLASS_FIELD_MAX_HEIGHT = 1280;
var RAIN_GLASS_MAX_DROPS = 180;
var RAIN_GLASS_MAX_LOBES = RAIN_GLASS_MAX_DROPS * 3;
var RAIN_GLASS_PINNED_SHARE = 0.84;
var RAIN_GLASS_DROP_STATE = Object.freeze({
  PINNED: 'pinned',
  GROWING: 'growing',
  BREAKING: 'breaking',
  SLIPPING: 'slipping',
  SETTLING: 'settling',
  IMPACTING: 'impacting'
});

var rainGlassState = null;
var rainGlassDrops = [];
var rainGlassSpawnCarry = 0;
var rainGlassBufferWidth = 1;
var rainGlassBufferHeight = 1;
var rainGlassSessionDisabled = false;
var rainGlassFailureLogged = false;
var RAIN_GLASS_MOTION_REFERENCE_RADIUS = 14;

// 主 renderer 发生上下文恢复时，后处理纹理必须随之重建。
if (typeof window !== 'undefined') {
  window.addEventListener('webglcontextrestored', function () {
    resetRainGlassAfterContextRestore();
  });
}

var RAIN_GLASS_QUAD_VERT = [
  'varying vec2 vUv;',
  'void main() {',
  '  vUv = uv;',
  '  gl_Position = vec4(position.xy, 0.0, 1.0);',
  '}'
].join('\n');

var RAIN_GLASS_BLUR_FRAG = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform sampler2D uTex;',
  'uniform vec2 uDirection;',
  'uniform float uRadius;',
  'void main() {',
  '  vec4 color = vec4(0.0);',
  '  float weightSum = 0.0;',
  '  for (int i = -8; i <= 8; i++) {',
  '    float p = float(i) / 8.0;',
  '    float weight = exp(-p * p * 4.5);',
  '    color += texture2D(uTex, vUv + uDirection * float(i) * uRadius) * weight;',
  '    weightSum += weight;',
  '  }',
  '  gl_FragColor = color / weightSum;',
  '}'
].join('\n');

var RAIN_GLASS_FIELD_VERT = [
  'attribute vec2 aCenter;',
  'attribute vec2 aRadius;',
  'attribute float aStrength;',
  'attribute float aOpticalClass;',
  'attribute float aContactAngle;',
  'uniform vec2 uResolution;',
  'varying vec2 vLocal;',
  'varying float vStrength;',
  'varying float vOpticalClass;',
  'varying float vContactAngle;',
  'void main() {',
  '  vec2 positionPx = aCenter + position.xy * aRadius * 1.65;',
  '  vec2 clip = positionPx / uResolution * 2.0 - 1.0;',
  '  clip.y = -clip.y;',
  '  vLocal = position.xy;',
  '  vStrength = aStrength;',
  '  vOpticalClass = aOpticalClass;',
  '  vContactAngle = aContactAngle;',
  '  gl_Position = vec4(clip, 0.0, 1.0);',
  '}'
].join('\n');

var RAIN_GLASS_FIELD_FRAG = [
  'precision highp float;',
  'varying vec2 vLocal;',
  'varying float vStrength;',
  'varying float vOpticalClass;',
  'varying float vContactAngle;',
  'void main() {',
  '  float radialDistance = length(vLocal);',
  '  float localAngle = atan(vLocal.y, vLocal.x);',
  '  float contactAngle = sin(localAngle * 3.0 + vContactAngle) * 0.042 + sin(localAngle * 5.0 - vContactAngle * 1.7) * 0.020;',
  '  float contactRadius = 1.0 + contactAngle;',
  '  if (radialDistance > contactRadius) discard;',
  '  float normalizedDistance = radialDistance / contactRadius;',
  '  float falloff = 1.0 - normalizedDistance * normalizedDistance;',
  '  float energy = falloff * falloff * falloff * vStrength;',
  '  gl_FragColor = vec4(energy, energy * vOpticalClass, 0.0, 1.0);',
  '}'
].join('\n');

var RAIN_GLASS_COMPOSITE_FRAG = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform sampler2D uSharp;',
  'uniform sampler2D uBlur;',
  'uniform sampler2D uField;',
  'uniform vec2 uFieldResolution;',
  'uniform float uTime;',
  'vec2 fieldOpticsAt(vec2 uv) { return texture2D(uField, clamp(uv, 0.0, 1.0)).rg; }',
  'float fieldAt(vec2 uv) { return fieldOpticsAt(uv).r; }',
  'float edgeHash(vec2 cell) {',
  '  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);',
  '}',
  'float edgeNoise(vec2 uv) {',
  '  vec2 position = uv * uFieldResolution * 0.028;',
  '  vec2 cell = floor(position);',
  '  vec2 fraction = smoothstep(0.0, 1.0, fract(position));',
  '  float top = mix(',
  '    edgeHash(cell),',
  '    edgeHash(cell + vec2(1.0, 0.0)),',
  '    fraction.x',
  '  );',
  '  float bottom = mix(',
  '    edgeHash(cell + vec2(0.0, 1.0)),',
  '    edgeHash(cell + vec2(1.0, 1.0)),',
  '    fraction.x',
  '  );',
  '  return mix(top, bottom, fraction.y);',
  '}',
  'void main() {',
  '  vec4 sharpSample = texture2D(uSharp, vUv);',
  '  vec3 frosted = texture2D(uBlur, vUv).rgb;',
  '  vec2 texel = 1.0 / uFieldResolution;',
  '  vec2 fieldOptics = fieldOpticsAt(vUv);',
  '  float field = fieldOptics.r;',
  '  float opticalWeight = clamp(fieldOptics.g / max(field, 0.0001), 0.0, 1.0);',
  '  float right = fieldAt(vUv + vec2(texel.x, 0.0));',
  '  float left = fieldAt(vUv - vec2(texel.x, 0.0));',
  '  float up = fieldAt(vUv + vec2(0.0, texel.y));',
  '  float down = fieldAt(vUv - vec2(0.0, texel.y));',
  '  float dropletSharpness = smoothstep(0.04, 0.18, field);',
  '  float body = dropletSharpness;',
  '  float shadowField = fieldAt(vUv + vec2(-texel.x * 3.2, texel.y * 4.2));',
  '  float softShadow = smoothstep(0.045, 0.18, shadowField) * (1.0 - smoothstep(0.035, 0.14, field));',
  '  float waterTrace = smoothstep(0.018, 0.10, fieldAt(vUv + vec2(texel.x * 1.5, texel.y * 8.0))) * (1.0 - smoothstep(0.035, 0.13, field));',
  '  float contactShadow = softShadow + waterTrace * 0.30;',
  // 水滴外的玻璃保持锐利；模糊只用于水滴内部的柔化/折射层。
  '  vec3 glassBase = sharpSample.rgb * (1.0 - contactShadow * (0.06 + opticalWeight * 0.10));',
  '  if (body < 0.004) {',
  '    gl_FragColor = vec4(glassBase, sharpSample.a);',
  '    return;',
  '  }',
  '  vec2 gradient = vec2(right - left, up - down);',
  '  float height = smoothstep(0.10, 0.88, field);',
  '  float edgeBand = smoothstep(0.055, 0.16, field) * (1.0 - smoothstep(0.32, 0.72, field));',
  '  float edgeNoiseValue = edgeNoise(vUv) - 0.5;',
  '  float microSurface = edgeNoise(vUv * 0.62 + vec2(0.13, 0.41)) - 0.5;',
  '  gradient += vec2(edgeNoiseValue, -edgeNoiseValue) * edgeBand * 0.002;',
  '  gradient += vec2(microSurface, -microSurface) * edgeBand * 0.0015;',
  '  vec3 normal = normalize(vec3(-gradient.x * 40.0, gradient.y * 40.0, 1.10 + height * 0.72));',
  '  float rimDirection = smoothstep(-0.25, 0.72, dot(normal.xy, normalize(vec2(-0.55, -0.84))));',
  '  float rimBreakup = clamp(0.50 + rimDirection * 0.38 + edgeNoiseValue * 0.16, 0.32, 1.0);',
  '  float lowerReservoir = smoothstep(0.22, 0.78, height) * smoothstep(-0.16, 0.62, dot(normal.xy, normalize(vec2(0.18, 0.98)))) * opticalWeight;',
  '  vec3 view = vec3(0.0, 0.0, 1.0);',
  '  vec3 refracted = refract(-view, normal, 1.0 / 1.333);',
  '  if (dot(refracted, refracted) < 0.00001) refracted = reflect(-view, normal);',
  '  vec2 offset = refracted.xy * (0.005 + height * 0.052 + lowerReservoir * 0.014);',
  '  float neutralDispersion = edgeBand * 0.012 * (1.0 - lowerReservoir * 0.45);',
  '  vec2 redUv = clamp(vUv + offset * (1.0 + neutralDispersion), 0.0, 1.0);',
  '  vec2 greenUv = clamp(vUv + offset, 0.0, 1.0);',
  '  vec2 blueUv = clamp(vUv + offset * (1.0 - neutralDispersion), 0.0, 1.0);',
  '  vec3 refractedColor = vec3(texture2D(uSharp, redUv).r, texture2D(uSharp, greenUv).g, texture2D(uSharp, blueUv).b);',
  '  vec3 softened = texture2D(uBlur, clamp(vUv + offset * 0.28, 0.0, 1.0)).rgb;',
  '  vec3 localBackground = sharpSample.rgb;',
  '  float backgroundLuma = dot(localBackground, vec3(0.2126, 0.7152, 0.0722));',
  '  float darkBackground = 1.0 - smoothstep(0.18, 0.72, backgroundLuma);',
  '  float lightBackground = smoothstep(0.38, 0.88, backgroundLuma);',
  '  float contactLip = edgeBand * (0.64 + edgeNoiseValue * 0.18) * mix(0.018, 0.105, lightBackground) * (0.45 + opticalWeight * 0.55);',
  '  float fresnel = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 4.8);',
  '  float centerTransmission = smoothstep(0.28, 0.76, field) * opticalWeight;',
  '  float clearTransmission = clamp(0.72 + centerTransmission * 0.22 - fresnel * 0.09, 0.0, 1.0);',
  '  vec3 clearColor = mix(refractedColor, sharpSample.rgb, 0.22 + centerTransmission * 0.18);',
  '  vec3 color = mix(softened, clearColor, clearTransmission);',
  '  float lensLift = centerTransmission * darkBackground * (0.035 + opticalWeight * 0.045);',
  '  color += (vec3(1.0) - color) * lensLift;',
  '  float upperLeft = smoothstep(-0.30, 0.78, dot(normal.xy, normalize(vec2(-0.62, -0.78))));',
  '  float lowerRight = smoothstep(-0.20, 0.74, dot(normal.xy, normalize(vec2(0.64, 0.77))));',
  '  float rimPatch = smoothstep(-0.18, 0.36, microSurface);',
  '  float adaptiveRim = edgeBand * rimBreakup * upperLeft * mix(0.015, 0.12, darkBackground) * mix(0.42, 1.0, opticalWeight) * (1.0 - lowerReservoir * 0.72) * (1.0 - contactLip * 2.6) * rimPatch;',
  '  float lowerRimMask = 1.0 - lowerReservoir * 0.84;',
  '  float innerShade = edgeBand * lowerRight * mix(0.02, 0.64, lightBackground) * mix(0.48, 1.0, opticalWeight) * lowerRimMask + lowerReservoir * (0.035 + lightBackground * 0.055);',
  '  color += vec3(0.94, 0.96, 0.98) * adaptiveRim;',
  '  color *= 1.0 - contactLip;',
  '  color *= 1.0 - innerShade * 0.24;',
  '  color *= 1.005 + height * (0.025 + opticalWeight * 0.025);',
  '  vec3 lightA = normalize(vec3(-0.46, -0.60, 0.92));',
  '  vec3 lightB = normalize(vec3(-0.34, -0.44, 1.0));',
  '  float microHighlight = smoothstep(0.18, 0.52, field) * (1.0 - smoothstep(1.0, 1.8, field) * 0.28);',
  '  float highlightWeight = mix(0.24, 1.0, opticalWeight);',
  '  float localGlintMask = smoothstep(-0.26, 0.24, microSurface) * (0.44 + rimBreakup * 0.56) * (1.0 - lowerReservoir * 0.62);',
  '  float glintResponse = max(dot(normal, normalize(lightA + view)), 0.0);',
  '  float glintCore = pow(glintResponse, 180.0) * microHighlight * highlightWeight * localGlintMask;',
  '  float hardGlint = pow(glintResponse, 68.0) * microHighlight * highlightWeight * localGlintMask;',
  '  float softGlint = pow(max(dot(normal, normalize(lightB + view)), 0.0), 18.0) * microHighlight * highlightWeight * localGlintMask;',
  '  color += vec3(1.0) * glintCore * (0.64 + darkBackground * 0.36);',
  '  color += vec3(1.0) * hardGlint * (0.24 + darkBackground * 0.26);',
  '  color += vec3(0.96, 0.97, 0.98) * softGlint * (0.045 + darkBackground * 0.075);',
  '  float alpha = dropletSharpness * mix(0.72 + rimBreakup * 0.18, 1.0, height);',
  '  gl_FragColor = vec4(mix(glassBase, color, alpha), sharpSample.a);',
  '}'
].join('\n');

function rainGlassActive() {
  return !!(typeof fx !== 'undefined' && fx && Number(fx.preset) === RAIN_GLASS_PRESET_INDEX
    && (typeof rainGlassEnabledValue !== 'function' || rainGlassEnabledValue()));
}

function rainGlassRandom(min, max) {
  return min + Math.random() * (max - min);
}

function rainGlassClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rainGlassDensity() {
  var amount = (typeof rainGlassAmountValue === 'function') ? rainGlassAmountValue() : 0.70;
  return rainGlassClamp(amount, 0.15, 2.5);
}

function rainGlassSpeed() {
  var speed = (typeof rainGlassSpeedValue === 'function') ? rainGlassSpeedValue() : 1;
  var energy = (typeof rainMood !== 'undefined' && rainMood && isFinite(rainMood.energyS)) ? rainMood.energyS : 0;
  return rainGlassClamp(Math.sqrt(speed) * (0.90 + energy * 0.10), 0.45, 4.00);
}

function rainGlassMotionSpeedFactor() {
  var speed = (typeof rainGlassSpeedValue === 'function') ? rainGlassSpeedValue() : 1;
  return rainGlassClamp(Math.sqrt(speed), 0.45, 4.00);
}

function rainGlassPhaseRate() {
  return rainGlassClamp(0.86 + rainGlassMotionSpeedFactor() * 0.14, 0.92, 1.45);
}

function rainGlassSizeMotionFactor(drop) {
  return rainGlassClamp(Math.sqrt(Math.max(drop.r, 1) / RAIN_GLASS_MOTION_REFERENCE_RADIUS), 0.72, 1.28);
}

function rainGlassAdhesionResistance(drop) {
  if (!Number.isFinite(drop.adhesionThreshold)) return 1;
  return rainGlassClamp(drop.adhesionThreshold / Math.max(drop.r * drop.r, 1), 0.82, 1.18);
}

function rainGlassSlipAcceleration(drop) {
  return 420 * rainGlassMotionSpeedFactor() * rainGlassSizeMotionFactor(drop) / rainGlassAdhesionResistance(drop);
}

function rainGlassSlipMaxSpeed(drop) {
  return rainGlassClamp(
    (72 + drop.r * 2.8) * rainGlassMotionSpeedFactor() * rainGlassSizeMotionFactor(drop) / rainGlassAdhesionResistance(drop),
    30,
    448
  );
}

function rainGlassSlipDrag(drop) {
  // 阻力只由水珠尺寸决定，不能随滑落进度增加，否则同一个流速设置会在后半程失效。
  var sizeFactor = rainGlassSizeMotionFactor(drop);
  return rainGlassClamp(4.8 / Math.max(0.82, sizeFactor), 3.6, 5.8);
}

function rainGlassSlipDistance(drop) {
  var speedFactor = rainGlassMotionSpeedFactor();
  var sizeFactor = rainGlassClamp(drop.r / RAIN_GLASS_MOTION_REFERENCE_RADIUS, 0.78, 1.42);
  return rainGlassRandom(28, 96) * (0.70 + speedFactor * 0.58) * sizeFactor;
}

function rainGlassRestartAdhesionThreshold(drop) {
  var speedFactor = rainGlassMotionSpeedFactor();
  var adhesionScale = rainGlassClamp(1.16 - speedFactor * 0.12, 0.60, 1.08);
  return Math.max(62, drop.r * drop.r * rainGlassRandom(0.80, 1.04) * adhesionScale);
}

function rainGlassTargetDropCount() {
  return Math.min(RAIN_GLASS_MAX_DROPS, Math.round(22 + rainGlassDensity() * 58));
}

function rainGlassChannelOffsetAt(drop, y) {
  var distance = y - drop.channelOriginY;
  var broadCurve = Math.sin(distance * drop.channelFrequency + drop.channelPhase);
  var glassDefect = Math.sin(distance * drop.channelFrequency * 0.37 + drop.channelSeed * 0.013);
  return (broadCurve + glassDefect * 0.34) * drop.channelAmplitude;
}

function rainGlassMakeDrop(x, y, radius, isHero) {
  var drop = {
    x: x,
    y: y,
    r: radius,
    radiusTarget: radius,
    vx: 0,
    vy: 0,
    alpha: 1,
    age: 0,
    lifetime: isHero ? Infinity : rainGlassRandom(26, 72),
    isHero: Boolean(isHero),
    state: RAIN_GLASS_DROP_STATE.PINNED,
    stateTime: 0,
    holdTime: isHero ? rainGlassRandom(1, 5) : Infinity,
    adhesionThreshold: isHero ? rainGlassRandom(92, 168) : Infinity,
    deformation: isHero ? rainGlassRandom(0.12, 0.18) : 0,
    breakDuration: rainGlassRandom(0.18, 0.34),
    settleDuration: rainGlassRandom(0.35, 0.9),
    slipDistance: 0,
    slipRemaining: 0,
    trailDistance: 0,
    nextRemnantDistance: rainGlassRandom(18, 34),
    channelOriginY: y,
    channelBaseX: x,
    channelAmplitude: isHero ? rainGlassRandom(3.5, 11) : rainGlassRandom(1, 3),
    channelFrequency: rainGlassRandom(0.008, 0.017),
    channelPhase: rainGlassRandom(0, Math.PI * 2),
    channelSeed: rainGlassRandom(0, 1000),
    contactAngle: rainGlassRandom(0, Math.PI * 2),
    growthTargetX: x,
    growthTargetY: y,
    growthDuration: rainGlassRandom(0.18, 0.32),
    growthResumeState: RAIN_GLASS_DROP_STATE.PINNED
  };
  drop.channelBaseX = x - rainGlassChannelOffsetAt(drop, y);
  return drop;
}

function rainGlassSpawnDrop(forceHero, nearBreaking) {
  if (rainGlassDrops.length >= RAIN_GLASS_MAX_DROPS || rainGlassBufferWidth < 16 || rainGlassBufferHeight < 16) return;
  var isHero = !!forceHero || Math.random() > RAIN_GLASS_PINNED_SHARE;
  var size = (typeof rainGlassSizeValue === 'function') ? rainGlassSizeValue() : 1;
  var radius = (isHero ? rainGlassRandom(10.5, 19.5) : rainGlassRandom(1.5, 5.0)) * size;
  var x = rainGlassRandom(radius + 8, Math.max(radius + 9, rainGlassBufferWidth - radius - 8));
  var y = rainGlassRandom(rainGlassBufferHeight * 0.05, rainGlassBufferHeight * 0.90);
  var drop = rainGlassMakeDrop(x, y, radius, isHero);
  if (nearBreaking) {
    drop.adhesionThreshold = drop.r * drop.r * rainGlassRandom(0.82, 0.96);
    drop.holdTime = rainGlassRandom(0.35, 1.1);
  }
  rainGlassDrops.push(drop);
}

function rainGlassMakeImpactRoom(targetCount) {
  if (rainGlassDrops.length < targetCount) return true;
  var candidateIndex = -1;
  var candidateScore = Infinity;
  for (var i = 0; i < rainGlassDrops.length; i++) {
    var candidate = rainGlassDrops[i];
    if (candidate.isHero || candidate.state === RAIN_GLASS_DROP_STATE.IMPACTING) continue;
    var score = candidate.r + candidate.age * 0.008 + (candidate.state === RAIN_GLASS_DROP_STATE.PINNED ? 0 : 10);
    if (score < candidateScore) {
      candidateIndex = i;
      candidateScore = score;
    }
  }
  if (candidateIndex < 0) return false;
  rainGlassDrops.splice(candidateIndex, 1);
  return true;
}

function rainGlassSpawnImpactDrop(targetCount) {
  if (rainGlassDrops.length >= RAIN_GLASS_MAX_DROPS || rainGlassBufferWidth < 16 || rainGlassBufferHeight < 16) return;
  if (!rainGlassMakeImpactRoom(targetCount || rainGlassTargetDropCount())) return;
  var size = (typeof rainGlassSizeValue === 'function') ? rainGlassSizeValue() : 1;
  var isHero = Math.random() > 0.78;
  var targetRadius = (isHero ? rainGlassRandom(7.5, 14.5) : rainGlassRandom(2.0, 5.6)) * size;
  var x = rainGlassRandom(targetRadius + 8, Math.max(targetRadius + 9, rainGlassBufferWidth - targetRadius - 8));
  var y = rainGlassRandom(rainGlassBufferHeight * 0.04, rainGlassBufferHeight * 0.82);
  var drop = rainGlassMakeDrop(x, y, Math.max(0.8, targetRadius * rainGlassRandom(0.20, 0.34)), isHero);
  drop.state = RAIN_GLASS_DROP_STATE.IMPACTING;
  drop.stateTime = 0;
  drop.impactDuration = rainGlassRandom(0.12, 0.28);
  drop.impactRadius = drop.r;
  drop.radiusTarget = targetRadius;
  drop.impactSpread = rainGlassRandom(0.10, 0.24);
  drop.deformation = 0.82;
  drop.alpha = 0.16;
  drop.holdTime = isHero ? rainGlassRandom(0.6, 2.4) : Infinity;
  drop.adhesionThreshold = isHero ? drop.radiusTarget * drop.radiusTarget * rainGlassRandom(0.94, 1.20) : Infinity;
  rainGlassDrops.push(drop);
}

function rainGlassSpawnRemnant(parent) {
  if (rainGlassDrops.length >= RAIN_GLASS_MAX_DROPS || Math.random() > 0.42) return;
  var radius = rainGlassRandom(1.0, Math.min(2.8, parent.r * 0.24));
  var remnant = rainGlassMakeDrop(
    parent.x + rainGlassRandom(-parent.r * 0.42, parent.r * 0.42),
    parent.y - rainGlassRandom(parent.r * 0.15, parent.r * 0.72),
    radius,
    false
  );
  remnant.alpha = rainGlassRandom(0.42, 0.72);
  remnant.lifetime = rainGlassRandom(16, 38);
  rainGlassDrops.push(remnant);
}

function rainGlassBeginBreaking(drop) {
  drop.state = RAIN_GLASS_DROP_STATE.BREAKING;
  drop.stateTime = 0;
  drop.breakDuration = rainGlassRandom(0.18, 0.34) / Math.sqrt(rainGlassSpeed());
  drop.breakAnchorY = drop.y;
  drop.vx = 0;
  drop.vy = 0;
}

function rainGlassBeginSlipping(drop) {
  drop.state = RAIN_GLASS_DROP_STATE.SLIPPING;
  drop.stateTime = 0;
  drop.slipDistance = rainGlassSlipDistance(drop);
  drop.slipRemaining = drop.slipDistance;
  drop.trailDistance = 0;
  drop.nextRemnantDistance = rainGlassRandom(18, 34);
  drop.channelBaseX = drop.x - rainGlassChannelOffsetAt(drop, drop.y);
  drop.vy = (48 + drop.r * 3.5) * rainGlassMotionSpeedFactor();
  drop.deformation = Math.max(0.78, drop.deformation);
}

function rainGlassBeginSettling(drop) {
  drop.state = RAIN_GLASS_DROP_STATE.SETTLING;
  drop.stateTime = 0;
  drop.settleDuration = rainGlassRandom(0.35, 0.9) / Math.sqrt(rainGlassSpeed());
  drop.channelBaseX = drop.x - rainGlassChannelOffsetAt(drop, drop.y);
  drop.vx *= 0.22;
  drop.vy = 0;
}

function rainGlassMergeDrops(large, small) {
  var pendingArea = Math.max(0, large.radiusTarget * large.radiusTarget - large.r * large.r);
  var largeArea = large.r * large.r + pendingArea;
  var smallArea = small.r * small.r;
  var totalArea = largeArea + smallArea;
  var radiusTarget = Math.sqrt(large.r * large.r + small.r * small.r);
  var previousState = large.state === RAIN_GLASS_DROP_STATE.GROWING ? large.growthResumeState : large.state;
  large.radiusTarget = Math.min(30, Math.sqrt(radiusTarget * radiusTarget + pendingArea));
  large.growthTargetX = (large.x * largeArea + small.x * smallArea) / totalArea;
  large.growthTargetY = (large.y * largeArea + small.y * smallArea) / totalArea;
  large.vx = (large.vx * largeArea + small.vx * smallArea) / totalArea;
  large.vy = (large.vy * largeArea + small.vy * smallArea) / totalArea;
  large.growthResumeState = previousState === RAIN_GLASS_DROP_STATE.SLIPPING || previousState === RAIN_GLASS_DROP_STATE.BREAKING
    ? previousState
    : RAIN_GLASS_DROP_STATE.PINNED;
  large.growthDuration = rainGlassRandom(0.18, 0.34);
  large.state = RAIN_GLASS_DROP_STATE.GROWING;
  large.stateTime = 0;
  large.holdTime = Math.min(large.holdTime, rainGlassRandom(0.18, 0.72));
  large.isHero = large.isHero || small.isHero || large.radiusTarget >= 6.5;
  small.alpha = 0;
}

function rainGlassUpdatePinned(drop, dt) {
  drop.vx = 0;
  drop.vy = 0;
  var gravitySag = drop.isHero ? rainGlassClamp(0.18 + (drop.r - 7) * 0.020, 0.18, 0.40) : 0;
  drop.deformation += (gravitySag - drop.deformation) * Math.min(1, dt * 5);
  if (!drop.isHero) {
    if (drop.age > drop.lifetime) drop.alpha -= dt * 0.08;
    return;
  }
  if (drop.stateTime * rainGlassMotionSpeedFactor() >= drop.holdTime && drop.r * drop.r >= drop.adhesionThreshold) rainGlassBeginBreaking(drop);
}

function rainGlassUpdateGrowing(drop, dt) {
  var response = 1 - Math.exp(-dt * 13);
  drop.r += (drop.radiusTarget - drop.r) * response;
  drop.x += (drop.growthTargetX - drop.x) * response * 0.42;
  drop.y += (drop.growthTargetY - drop.y) * response * 0.42;
  drop.deformation = Math.min(0.42, drop.deformation + dt * 1.2);
  if (drop.stateTime < drop.growthDuration && Math.abs(drop.radiusTarget - drop.r) > 0.04) return;
  drop.r = drop.radiusTarget;
  drop.state = drop.growthResumeState;
  drop.stateTime = 0;
  if (drop.state === RAIN_GLASS_DROP_STATE.BREAKING) rainGlassBeginBreaking(drop);
  else if (drop.state === RAIN_GLASS_DROP_STATE.SLIPPING) drop.channelBaseX = drop.x - rainGlassChannelOffsetAt(drop, drop.y);
  else {
    drop.state = RAIN_GLASS_DROP_STATE.PINNED;
    drop.holdTime = drop.r * drop.r >= drop.adhesionThreshold ? rainGlassRandom(0.18, 0.72) : rainGlassRandom(1.4, 4.8);
  }
}

function rainGlassUpdateImpacting(drop) {
  var progress = rainGlassClamp(drop.stateTime / drop.impactDuration, 0, 1);
  var eased = 1 - Math.pow(1 - progress, 3);
  drop.r = drop.impactRadius + (drop.radiusTarget - drop.impactRadius) * eased;
  drop.alpha = rainGlassClamp(0.16 + eased * 0.84, 0, 1);
  drop.deformation = (1 - eased) * (0.72 + drop.impactSpread) + eased * (drop.isHero ? 0.16 : 0.02);
  if (progress < 1) return;
  drop.r = drop.radiusTarget;
  drop.alpha = 1;
  drop.state = RAIN_GLASS_DROP_STATE.PINNED;
  drop.stateTime = 0;
  drop.holdTime = drop.isHero ? rainGlassRandom(0.6, 2.8) : Infinity;
}

function rainGlassUpdateBreaking(drop) {
  var progress = rainGlassClamp(drop.stateTime * rainGlassPhaseRate() / drop.breakDuration, 0, 1);
  var eased = progress * progress * (3 - 2 * progress);
  drop.deformation = 0.08 + eased * 0.92;
  drop.y = drop.breakAnchorY + eased * Math.min(4.5, drop.r * 0.34);
  var targetX = drop.channelBaseX + rainGlassChannelOffsetAt(drop, drop.y);
  drop.x += (targetX - drop.x) * 0.16;
  if (progress >= 1) rainGlassBeginSlipping(drop);
}

function rainGlassUpdateSlipping(drop, dt) {
  var progress = rainGlassClamp(1 - drop.slipRemaining / drop.slipDistance, 0, 1);
  var drag = rainGlassSlipDrag(drop);
  drop.vy += (rainGlassSlipAcceleration(drop) - drop.vy * drag) * dt;
  drop.vy = rainGlassClamp(drop.vy, 0, rainGlassSlipMaxSpeed(drop));
  var travel = Math.min(drop.slipRemaining, drop.vy * dt);
  var oldX = drop.x;
  drop.y += travel;
  drop.slipRemaining -= travel;
  var targetX = drop.channelBaseX + rainGlassChannelOffsetAt(drop, drop.y);
  drop.x += (targetX - drop.x) * Math.min(1, dt * 10);
  drop.vx = (drop.x - oldX) / Math.max(dt, 0.001);
  drop.deformation += ((0.94 - progress * 0.36) - drop.deformation) * Math.min(1, dt * 8);
  drop.trailDistance += travel;
  if (drop.trailDistance >= drop.nextRemnantDistance && drop.r > 7) {
    drop.trailDistance = 0;
    drop.nextRemnantDistance = rainGlassRandom(18, 34);
    rainGlassSpawnRemnant(drop);
  }
  if (drop.slipRemaining <= 0.25) rainGlassBeginSettling(drop);
}

function rainGlassUpdateSettling(drop, dt) {
  var progress = rainGlassClamp(drop.stateTime * rainGlassPhaseRate() / drop.settleDuration, 0, 1);
  var targetX = drop.channelBaseX + rainGlassChannelOffsetAt(drop, drop.y);
  drop.x += (targetX - drop.x) * Math.min(1, dt * 12);
  drop.vx *= Math.max(0, 1 - dt * 12);
  drop.deformation += ((0.055 + (1 - progress) * 0.18) - drop.deformation) * Math.min(1, dt * 9);
  if (progress < 1) return;
  drop.state = RAIN_GLASS_DROP_STATE.PINNED;
  drop.stateTime = 0;
  drop.holdTime = rainGlassRandom(1, 5);
  drop.adhesionThreshold = rainGlassRestartAdhesionThreshold(drop);
  drop.vx = 0;
  drop.vy = 0;
}

function rainGlassSeedDrops() {
  if (rainGlassDrops.length || rainGlassBufferWidth < 16 || rainGlassBufferHeight < 16) return;
  for (var i = 0; i < 34; i++) rainGlassSpawnDrop(false, false);
  for (var h = 0; h < 4; h++) rainGlassSpawnDrop(true, true);
}

function updateRainGlass(dt) {
  if (!rainGlassActive() || (typeof rainGlassEnabledValue === 'function' && !rainGlassEnabledValue())) {
    if (rainGlassState) disposeRainGlass();
    rainGlassDrops.length = 0;
    rainGlassSpawnCarry = 0;
    return;
  }
  if (rainGlassSessionDisabled || rainGlassBufferWidth < 16 || rainGlassBufferHeight < 16) return;
  rainGlassSeedDrops();
  var step = Math.max(0.008, Math.min(0.05, Number(dt) || 0.016));
  var density = rainGlassDensity();
  var targetCount = rainGlassTargetDropCount();
  rainGlassSpawnCarry += density * (1.1 + density * 1.8) * step;
  while (rainGlassSpawnCarry >= 1 && rainGlassDrops.length < targetCount) {
    rainGlassSpawnCarry -= 1;
    rainGlassSpawnImpactDrop(targetCount);
  }
  for (var i = 0; i < rainGlassDrops.length; i++) {
    var drop = rainGlassDrops[i];
    drop.age += step;
    drop.stateTime += step;
    if (drop.state === RAIN_GLASS_DROP_STATE.PINNED) rainGlassUpdatePinned(drop, step);
    else if (drop.state === RAIN_GLASS_DROP_STATE.IMPACTING) rainGlassUpdateImpacting(drop);
    else if (drop.state === RAIN_GLASS_DROP_STATE.GROWING) rainGlassUpdateGrowing(drop, step);
    else if (drop.state === RAIN_GLASS_DROP_STATE.BREAKING) rainGlassUpdateBreaking(drop);
    else if (drop.state === RAIN_GLASS_DROP_STATE.SLIPPING) rainGlassUpdateSlipping(drop, step);
    else if (drop.state === RAIN_GLASS_DROP_STATE.SETTLING) rainGlassUpdateSettling(drop, step);
    drop.x = rainGlassClamp(drop.x, drop.r, Math.max(drop.r, rainGlassBufferWidth - drop.r));
    if (drop.y - drop.r > rainGlassBufferHeight + 36) drop.alpha = 0;
  }
  for (var aIndex = 0; aIndex < rainGlassDrops.length; aIndex++) {
    var a = rainGlassDrops[aIndex];
    if (a.alpha <= 0) continue;
    for (var bIndex = aIndex + 1; bIndex < rainGlassDrops.length; bIndex++) {
      var b = rainGlassDrops[bIndex];
      if (b.alpha <= 0 || (!a.isHero && !b.isHero)) continue;
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var limit = (a.r + b.r) * 0.82;
      if (dx * dx + dy * dy > limit * limit) continue;
      if (a.r >= b.r) rainGlassMergeDrops(a, b);
      else rainGlassMergeDrops(b, a);
    }
  }
  for (var removeIndex = rainGlassDrops.length - 1; removeIndex >= 0; removeIndex--) {
    if (rainGlassDrops[removeIndex].alpha <= 0.04) rainGlassDrops.splice(removeIndex, 1);
  }
}

function rainGlassMakeTarget(width, height, withDepth) {
  var target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: !!withDepth,
    stencilBuffer: false
  });
  target.texture.generateMipmaps = false;
  return target;
}

function rainGlassBuildFieldGeometry() {
  var vertexCount = RAIN_GLASS_MAX_LOBES * 6;
  var positions = new Float32Array(vertexCount * 3);
  var centers = new Float32Array(vertexCount * 2);
  var radii = new Float32Array(vertexCount * 2);
  var strengths = new Float32Array(vertexCount);
  var opticalClasses = new Float32Array(vertexCount);
  var contactAngles = new Float32Array(vertexCount);
  var corners = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
  for (var lobe = 0; lobe < RAIN_GLASS_MAX_LOBES; lobe++) {
    for (var corner = 0; corner < 6; corner++) {
      var vertex = lobe * 6 + corner;
      positions[vertex * 3] = corners[corner * 2];
      positions[vertex * 3 + 1] = corners[corner * 2 + 1];
    }
  }
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aCenter', new THREE.BufferAttribute(centers, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aStrength', new THREE.BufferAttribute(strengths, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aOpticalClass', new THREE.BufferAttribute(opticalClasses, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aContactAngle', new THREE.BufferAttribute(contactAngles, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  return geometry;
}

function rainGlassCreateResources(rendererRef) {
  var quadGeometry = new THREE.PlaneBufferGeometry(2, 2);
  var blurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: null },
      uDirection: { value: new THREE.Vector2(1, 0) },
      uRadius: { value: 2.2 }
    },
    vertexShader: RAIN_GLASS_QUAD_VERT,
    fragmentShader: RAIN_GLASS_BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
  var compositeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSharp: { value: null },
      uBlur: { value: null },
      uField: { value: null },
      uFieldResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 }
    },
    vertexShader: RAIN_GLASS_QUAD_VERT,
    fragmentShader: RAIN_GLASS_COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.NoBlending
  });
  var fieldGeometry = rainGlassBuildFieldGeometry();
  var fieldMaterial = new THREE.ShaderMaterial({
    uniforms: { uResolution: { value: new THREE.Vector2(1, 1) } },
    vertexShader: RAIN_GLASS_FIELD_VERT,
    fragmentShader: RAIN_GLASS_FIELD_FRAG,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    transparent: true,
    blending: THREE.AdditiveBlending
  });
  var postScene = new THREE.Scene();
  var postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var quad = new THREE.Mesh(quadGeometry, blurMaterial);
  quad.frustumCulled = false;
  postScene.add(quad);
  var fieldScene = new THREE.Scene();
  var fieldMesh = new THREE.Mesh(fieldGeometry, fieldMaterial);
  fieldMesh.frustumCulled = false;
  fieldScene.add(fieldMesh);
  rainGlassState = {
    renderer: rendererRef,
    width: 0,
    height: 0,
    blurWidth: 0,
    blurHeight: 0,
    fieldWidth: 0,
    fieldHeight: 0,
    sharpTarget: null,
    blurATarget: null,
    blurBTarget: null,
    fieldTarget: null,
    quadGeometry: quadGeometry,
    blurMaterial: blurMaterial,
    compositeMaterial: compositeMaterial,
    fieldGeometry: fieldGeometry,
    fieldMaterial: fieldMaterial,
    postScene: postScene,
    postCamera: postCamera,
    quad: quad,
    fieldScene: fieldScene,
    fieldMesh: fieldMesh
  };
}

function rainGlassDisposeTarget(target) {
  if (target && typeof target.dispose === 'function') target.dispose();
}

function rainGlassResizeTargets(width, height) {
  if (!rainGlassState) return;
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  if (width === rainGlassState.width && height === rainGlassState.height) return;
  var previousWidth = rainGlassBufferWidth;
  var previousHeight = rainGlassBufferHeight;
  rainGlassBufferWidth = width;
  rainGlassBufferHeight = height;
  if (previousWidth > 1 && previousHeight > 1 && rainGlassDrops.length) {
    var scaleX = width / previousWidth;
    var scaleY = height / previousHeight;
    for (var i = 0; i < rainGlassDrops.length; i++) {
      var drop = rainGlassDrops[i];
      drop.x *= scaleX;
      drop.y *= scaleY;
      drop.channelBaseX *= scaleX;
      drop.channelOriginY *= scaleY;
      drop.growthTargetX *= scaleX;
      drop.growthTargetY *= scaleY;
    }
  }
  rainGlassDisposeTarget(rainGlassState.sharpTarget);
  rainGlassDisposeTarget(rainGlassState.blurATarget);
  rainGlassDisposeTarget(rainGlassState.blurBTarget);
  rainGlassDisposeTarget(rainGlassState.fieldTarget);
  var blurWidth = Math.max(1, Math.round(width * RAIN_GLASS_BLUR_SCALE));
  var blurHeight = Math.max(1, Math.round(height * RAIN_GLASS_BLUR_SCALE));
  var fieldWidth = Math.max(1, Math.min(RAIN_GLASS_FIELD_MAX_WIDTH, Math.round(width * RAIN_GLASS_FIELD_SCALE)));
  var fieldHeight = Math.max(1, Math.min(RAIN_GLASS_FIELD_MAX_HEIGHT, Math.round(height * RAIN_GLASS_FIELD_SCALE)));
  rainGlassState.width = width;
  rainGlassState.height = height;
  rainGlassState.blurWidth = blurWidth;
  rainGlassState.blurHeight = blurHeight;
  rainGlassState.fieldWidth = fieldWidth;
  rainGlassState.fieldHeight = fieldHeight;
  rainGlassState.sharpTarget = rainGlassMakeTarget(width, height, true);
  rainGlassState.blurATarget = rainGlassMakeTarget(blurWidth, blurHeight, false);
  rainGlassState.blurBTarget = rainGlassMakeTarget(blurWidth, blurHeight, false);
  rainGlassState.fieldTarget = rainGlassMakeTarget(fieldWidth, fieldHeight, false);
  rainGlassState.fieldMaterial.uniforms.uResolution.value.set(fieldWidth, fieldHeight);
  rainGlassState.compositeMaterial.uniforms.uFieldResolution.value.set(fieldWidth, fieldHeight);
}

function resizeRainGlass(width, height, pixelRatio) {
  if (!rainGlassState) return;
  var rendererRef = rainGlassState.renderer;
  if (rendererRef && typeof rendererRef.getDrawingBufferSize === 'function') {
    var drawingSize = rendererRef.getDrawingBufferSize(new THREE.Vector2());
    rainGlassResizeTargets(drawingSize.x, drawingSize.y);
    return;
  }
  var ratio = Math.max(0.1, Number(pixelRatio) || 1);
  rainGlassResizeTargets(Math.max(1, Number(width) || 1) * ratio, Math.max(1, Number(height) || 1) * ratio);
}

function rainGlassEnsureResources(rendererRef) {
  if (!rainGlassState || rainGlassState.renderer !== rendererRef) {
    if (rainGlassState) disposeRainGlass();
    rainGlassCreateResources(rendererRef);
  }
  var drawingSize = rendererRef.getDrawingBufferSize(new THREE.Vector2());
  rainGlassResizeTargets(drawingSize.x, drawingSize.y);
  rainGlassSeedDrops();
  return rainGlassState;
}

function rainGlassWriteLobe(state, lobeIndex, x, y, radiusX, radiusY, strength, opticalClass, contactAngle) {
  if (lobeIndex >= RAIN_GLASS_MAX_LOBES) return lobeIndex;
  var scaleX = state.fieldWidth / state.width;
  var scaleY = state.fieldHeight / state.height;
  var centerArray = state.fieldGeometry.attributes.aCenter.array;
  var radiusArray = state.fieldGeometry.attributes.aRadius.array;
  var strengthArray = state.fieldGeometry.attributes.aStrength.array;
  var opticalArray = state.fieldGeometry.attributes.aOpticalClass.array;
  var contactAngleArray = state.fieldGeometry.attributes.aContactAngle.array;
  for (var corner = 0; corner < 6; corner++) {
    var vertex = lobeIndex * 6 + corner;
    centerArray[vertex * 2] = x * scaleX;
    centerArray[vertex * 2 + 1] = y * scaleY;
    radiusArray[vertex * 2] = Math.max(0.9, radiusX * scaleX);
    radiusArray[vertex * 2 + 1] = Math.max(0.9, radiusY * scaleY);
    strengthArray[vertex] = strength;
    opticalArray[vertex] = opticalClass;
    contactAngleArray[vertex] = contactAngle;
  }
  return lobeIndex + 1;
}

function rainGlassWriteDropLobes(state, drop, lobeIndex) {
  var dropRadius = drop.r;
  var isMainDrop = drop.isHero || drop.r >= 6.2;
  var sizeRatio = rainGlassClamp(dropRadius / RAIN_GLASS_MOTION_REFERENCE_RADIUS, 0.60, 1.80);
  var widthBias = rainGlassClamp(1 + (sizeRatio - 1) * 0.08, 0.95, 1.06);
  var heightBias = rainGlassClamp(1 - (sizeRatio - 1) * 0.045, 0.93, 1.04);
  if (!isMainDrop) {
    return rainGlassWriteLobe(state, lobeIndex, drop.x, drop.y, dropRadius, dropRadius * 1.03, drop.alpha * 0.62, 0.30, drop.contactAngle);
  }
  var speed = Math.hypot(drop.vx, drop.vy);
  var directionX = speed > 4 ? drop.vx / speed : 0;
  var directionY = speed > 4 ? Math.max(0.82, drop.vy / speed) : 1;
  var deformation = rainGlassClamp(drop.deformation, 0.04, 1);
  var frontOffset = dropRadius * (0.08 + deformation * 0.48);
  var rearOffset = dropRadius * (0.08 + deformation * 0.38);
  var headCenterX = drop.x + directionX * frontOffset;
  var headCenterY = drop.y + directionY * frontOffset;
  var middleCenterX = drop.x - directionX * dropRadius * deformation * 0.04;
  var middleCenterY = drop.y - directionY * dropRadius * deformation * 0.02;
  var neckCenterX = drop.x - directionX * rearOffset;
  var neckCenterY = drop.y - directionY * rearOffset;
  lobeIndex = rainGlassWriteLobe(
    state, lobeIndex, headCenterX, headCenterY,
    dropRadius * (0.74 - deformation * 0.10) * widthBias,
    dropRadius * (0.84 + deformation * 0.30) * heightBias,
    drop.alpha * 0.78, 0.90, drop.contactAngle
  );
  lobeIndex = rainGlassWriteLobe(
    state, lobeIndex, middleCenterX, middleCenterY,
    dropRadius * (0.68 - deformation * 0.08) * widthBias,
    dropRadius * (0.82 + deformation * 0.28) * heightBias,
    drop.alpha * 0.67, 0.90, drop.contactAngle + 0.91
  );
  return rainGlassWriteLobe(
    state, lobeIndex, neckCenterX, neckCenterY,
    dropRadius * (0.52 - deformation * 0.14) * widthBias,
    dropRadius * (0.72 + deformation * 0.28) * heightBias,
    drop.alpha * (0.58 - deformation * 0.10), 0.90, drop.contactAngle + 1.83
  );
}

function rainGlassSyncFieldGeometry(state) {
  var lobeCount = 0;
  for (var i = 0; i < rainGlassDrops.length && lobeCount < RAIN_GLASS_MAX_LOBES; i++) {
    if (rainGlassDrops[i].alpha <= 0.04) continue;
    lobeCount = rainGlassWriteDropLobes(state, rainGlassDrops[i], lobeCount);
  }
  state.fieldGeometry.setDrawRange(0, lobeCount * 6);
  state.fieldGeometry.attributes.aCenter.needsUpdate = true;
  state.fieldGeometry.attributes.aRadius.needsUpdate = true;
  state.fieldGeometry.attributes.aStrength.needsUpdate = true;
  state.fieldGeometry.attributes.aOpticalClass.needsUpdate = true;
  state.fieldGeometry.attributes.aContactAngle.needsUpdate = true;
}

function rainGlassRestoreRenderer(rendererRef, previousTarget, previousAutoClear, previousColor, previousAlpha) {
  rendererRef.setRenderTarget(previousTarget || null);
  rendererRef.autoClear = previousAutoClear;
  rendererRef.setClearColor(previousColor, previousAlpha);
}

function renderRainGlassScene(rendererRef, sceneRef, cameraRef) {
  if (!rainGlassActive() || rainGlassSessionDisabled) return false;
  var previousTarget = rendererRef.getRenderTarget();
  var previousAutoClear = rendererRef.autoClear;
  var previousColor = rendererRef.getClearColor(new THREE.Color()).clone();
  var previousAlpha = rendererRef.getClearAlpha();
  var renderError = null;
  try {
    var state = rainGlassEnsureResources(rendererRef);
    rainGlassSyncFieldGeometry(state);
    rendererRef.autoClear = false;

    rendererRef.setRenderTarget(state.sharpTarget);
    rendererRef.setClearColor(previousColor, previousAlpha);
    rendererRef.clear(true, true, true);
    rendererRef.render(sceneRef, cameraRef);

    state.quad.material = state.blurMaterial;
    state.blurMaterial.uniforms.uTex.value = state.sharpTarget.texture;
    state.blurMaterial.uniforms.uDirection.value.set(1 / state.width, 0);
    rendererRef.setRenderTarget(state.blurATarget);
    rendererRef.setClearColor(0x000000, 0);
    rendererRef.clear(true, false, false);
    rendererRef.render(state.postScene, state.postCamera);

    state.blurMaterial.uniforms.uTex.value = state.blurATarget.texture;
    state.blurMaterial.uniforms.uDirection.value.set(0, 1 / state.blurHeight);
    rendererRef.setRenderTarget(state.blurBTarget);
    rendererRef.clear(true, false, false);
    rendererRef.render(state.postScene, state.postCamera);

    rendererRef.setRenderTarget(state.fieldTarget);
    rendererRef.setClearColor(0x000000, 0);
    rendererRef.clear(true, false, false);
    rendererRef.render(state.fieldScene, state.postCamera);

    state.compositeMaterial.uniforms.uSharp.value = state.sharpTarget.texture;
    state.compositeMaterial.uniforms.uBlur.value = state.blurBTarget.texture;
    state.compositeMaterial.uniforms.uField.value = state.fieldTarget.texture;
    state.compositeMaterial.uniforms.uTime.value = performance.now() * 0.001;
    state.quad.material = state.compositeMaterial;
    rendererRef.setRenderTarget(previousTarget || null);
    rendererRef.render(state.postScene, state.postCamera);
  } catch (error) {
    renderError = error;
  } finally {
    rainGlassRestoreRenderer(rendererRef, previousTarget, previousAutoClear, previousColor, previousAlpha);
  }
  if (renderError) {
    if (!rainGlassFailureLogged) {
      rainGlassFailureLogged = true;
      console.error('[RainGlass] 后处理失败，已降级为原始场景渲染。', renderError);
    }
    rainGlassSessionDisabled = true;
    disposeRainGlass();
    return false;
  }
  return true;
}

function disposeRainGlass() {
  if (!rainGlassState) return;
  rainGlassDisposeTarget(rainGlassState.sharpTarget);
  rainGlassDisposeTarget(rainGlassState.blurATarget);
  rainGlassDisposeTarget(rainGlassState.blurBTarget);
  rainGlassDisposeTarget(rainGlassState.fieldTarget);
  rainGlassState.quadGeometry.dispose();
  rainGlassState.blurMaterial.dispose();
  rainGlassState.compositeMaterial.dispose();
  rainGlassState.fieldGeometry.dispose();
  rainGlassState.fieldMaterial.dispose();
  rainGlassState = null;
}

function resetRainGlassAfterContextRestore() {
  disposeRainGlass();
  rainGlassSessionDisabled = false;
  rainGlassFailureLogged = false;
}