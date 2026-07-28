// ===================== 雨境 (Rhythm Rain) — 音频频段驱动的雨粒子 =====================
// 复用已下架的预设索引 9（原声波走廊）。不是 weather-mood 的气象可视化；
// 只吃主循环已算好的 bass / mid / treble / beatPulse / audioEnergy。
// THREE.Points 对象池，挂主场景，跟随主 rAF / 空闲降帧。
// 幽灵封面：雨幕后的湿玻璃海报，复用主 coverTex；按雨境近机位缩到可读海报。

var RAIN_MOOD_PRESET_INDEX = 9;
var RAIN_MOOD_MAX_DROPS = 900;
var RAIN_MOOD_SPAWN_BASE = 1.2;
var rainMood = null;
var rainMoodClock = 0;
var RAIN_TOGGLE_STORE_KEY = 'mineradio-rain-toggles-v1';

// 雨境机位正视：封面居中略抬、z 落在雨幕中段偏后，雨丝从它前面掠过
var RAIN_COVER_SIZE = 5.6;
var RAIN_COVER_POS = [0, 0.55, -7.2];

function rainAmountValue() {
  var v = (typeof fx !== 'undefined' && fx && isFinite(fx.rainAmount)) ? Number(fx.rainAmount) : 1;
  return Math.max(0.1, Math.min(2.5, v));
}

function rainThunderValue() {
  // 打雷节奏阈值:低=更易闪,高=更稀;默认 0.55 对齐旧 hardcode
  var v = (typeof fx !== 'undefined' && fx && isFinite(fx.rainThunder)) ? Number(fx.rainThunder) : 0.55;
  return Math.max(0.15, Math.min(0.95, v));
}


function saveRainToggles() {
  try {
    if (typeof fx === 'undefined' || !fx) return;
    localStorage.setItem(RAIN_TOGGLE_STORE_KEY, JSON.stringify({
      ghostCover: fx.rainGhostCover !== false,
      amount: rainAmountValue(),
      thunder: rainThunderValue()
    }));
  } catch (e) {}
}

function loadRainToggles() {
  try {
    var raw = JSON.parse(localStorage.getItem(RAIN_TOGGLE_STORE_KEY) || '{}') || {};
    if (typeof fx === 'undefined' || !fx) return;
    if ('ghostCover' in raw) fx.rainGhostCover = !!raw.ghostCover;
    if ('amount' in raw && isFinite(raw.amount)) fx.rainAmount = Math.max(0.1, Math.min(2.5, Number(raw.amount)));
    if ('thunder' in raw && isFinite(raw.thunder)) fx.rainThunder = Math.max(0.15, Math.min(0.95, Number(raw.thunder)));
  } catch (e) {}
}

function rainMoodSetBodyClass(on) {
  if (!document.body) return;
  if (on) {
    if (!document.body.classList.contains('rain-on')) document.body.classList.add('rain-on');
  } else if (document.body.classList.contains('rain-on')) {
    document.body.classList.remove('rain-on');
  }
}

var RAIN_COVER_VERT = [
  'varying vec2 vUv;',
  'void main(){',
  '  vUv = uv;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');

// 湿玻璃海报：冷调、软边、竖向雨痕 UV 扭曲、鼓点轻微脉动；不做硬方框
var RAIN_COVER_FRAG = [
  'precision mediump float;',
  'uniform sampler2D uTexture;',
  'uniform float uTime;',
  'uniform float uPulse;',
  'uniform float uEnergy;',
  'uniform float uFlash;',
  'uniform float uDim;',
  'uniform vec3 uTint;',
  'varying vec2 vUv;',
  'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float noise(vec2 p){',
  '  vec2 i = floor(p); vec2 f = fract(p);',
  '  float a = hash(i), b = hash(i + vec2(1.0, 0.0));',
  '  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));',
  '  vec2 u = f * f * (3.0 - 2.0 * f);',
  '  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
  '}',
  'void main(){',
  '  vec2 uv = vUv - 0.5;',
  // 鼓点轻微呼吸，不抢雨丝
  '  uv *= (1.0 - uPulse * 0.028);',
  '  uv += 0.5;',
  // 湿玻璃竖向雨痕：低频慢移 + 高频细丝
  '  float streak = noise(vec2(uv.x * 18.0, uv.y * 3.2 + uTime * 0.55));',
  '  float drip = noise(vec2(uv.x * 42.0, uv.y * 1.4 - uTime * 0.85));',
  '  vec2 warp = vec2((streak - 0.5) * 0.018 + (drip - 0.5) * 0.01, (drip - 0.5) * 0.012);',
  '  vec2 suv = clamp(uv + warp * (0.55 + uEnergy * 0.45), 0.0, 1.0);',
  '  vec4 tex = texture2D(uTexture, suv);',
  '  float gray = dot(tex.rgb, vec3(0.299, 0.587, 0.114));',
  // 雨夜冷调：保留主体色彩，略压饱和 + 掺冷青
  '  vec3 cool = mix(tex.rgb, vec3(gray), 0.22);',
  '  cool = mix(cool, cool * uTint, 0.34);',
  '  cool = mix(cool, vec3(0.78, 0.88, 1.0), 0.08 + uFlash * 0.18);',
  '  cool *= (0.82 + uEnergy * 0.22 + uPulse * 0.35);',
  // 软边海报：圆角矩形 + 径向淡出，避免硬相框
  '  vec2 p = abs(vUv - 0.5);',
  '  float box = 1.0 - smoothstep(0.42, 0.50, max(p.x, p.y));',
  '  float roundSoft = 1.0 - smoothstep(0.46, 0.56, length(p * vec2(1.05, 1.0)));',
  '  float edge = box * mix(0.55, 1.0, roundSoft);',
  // 底部溶进舞台黑，像雨雾里的海报
  '  float floorFade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y) * 0.35);',
  '  float glass = 0.55 + noise(vUv * 6.0 + uTime * 0.12) * 0.18;',
  '  float alpha = edge * floorFade * glass * uDim * (0.42 + uEnergy * 0.22 + uPulse * 0.12);',
  '  alpha = clamp(alpha, 0.0, 0.78);',
  '  if (alpha < 0.01) discard;',
  '  gl_FragColor = vec4(cool, alpha);',
  '}'
].join('\n');

function rainMoodActive() {
  return !!(fx && Number(fx.preset) === RAIN_MOOD_PRESET_INDEX);
}

function rainMoodEase(current, target, rise, fall, dt) {
  var rate = target > current ? rise : fall;
  return current + (target - current) * Math.min(1, rate * Math.max(0.016, dt || 0.016) * 60);
}

function rainMoodHasCover() {
  return !!(typeof uniforms !== 'undefined' && uniforms && uniforms.uHasCover && uniforms.uHasCover.value > 0.5
    && typeof coverTex !== 'undefined' && coverTex && coverTex.image);
}

function ensureRainMood() {
  if (rainMood || typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene) return rainMood;

  var count = RAIN_MOOD_MAX_DROPS;
  var positions = new Float32Array(count * 3);
  var velocities = new Float32Array(count * 3);
  var lengths = new Float32Array(count);
  var alphas = new Float32Array(count);
  var lives = new Float32Array(count);
  var active = new Uint8Array(count);
  var freeList = new Int16Array(count);
  var freeCount = count;

  for (var i = 0; i < count; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = -40;
    positions[i * 3 + 2] = 0;
    velocities[i * 3] = 0;
    velocities[i * 3 + 1] = 0;
    velocities[i * 3 + 2] = 0;
    lengths[i] = 0.35;
    alphas[i] = 0;
    lives[i] = 0;
    active[i] = 0;
    freeList[i] = i;
  }

  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aLen', new THREE.BufferAttribute(lengths, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  // 线段感：用点 + 拉长 gl_PointSize 的竖向拉伸不够，改用两点连线需要 LineSegments。
  // 为控开销，这里用 Points + 竖向椭圆点，视觉上接近雨丝。

  var uniformsRain = {
    uPixel: { value: (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(2, window.devicePixelRatio) : 1 },
    uPointScale: { value: 1 },
    uTint: { value: new THREE.Color(0xb8d4ff) },
    uFlash: { value: 0 },
    uDim: { value: 1 }
  };

  var vs = [
    'attribute float aLen;',
    'attribute float aAlpha;',
    'uniform float uPixel;',
    'uniform float uPointScale;',
    'varying float vAlpha;',
    'void main(){',
    '  vAlpha = aAlpha;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  float depth = 28.0 / max(0.55, -mv.z);',
    '  float size = (1.15 + aLen * 3.4) * depth * uPixel * uPointScale;',
    '  gl_PointSize = clamp(size, 0.8, 7.5);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var fs = [
    'precision mediump float;',
    'uniform vec3 uTint;',
    'uniform float uFlash;',
    'uniform float uDim;',
    'varying float vAlpha;',
    'void main(){',
    '  vec2 p = gl_PointCoord * 2.0 - 1.0;',
    // 竖向雨丝：x 窄、y 拉长
    '  float soft = 1.0 - smoothstep(0.12, 0.95, abs(p.x) * 4.2 + abs(p.y) * 0.55);',
    '  if (soft < 0.02) discard;',
    '  vec3 col = mix(uTint, vec3(0.92, 0.96, 1.0), uFlash * 0.55);',
    '  gl_FragColor = vec4(col, soft * vAlpha * uDim * (0.55 + uFlash * 0.35));',
    '}'
  ].join('\n');

  var mat = new THREE.ShaderMaterial({
    uniforms: uniformsRain,
    vertexShader: vs,
    fragmentShader: fs,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });

  var points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 0;   // 雨丝在封面之上（湿玻璃外）
  points.visible = false;
  scene.add(points);

  // 全屏暗底，压住默认封面粒子残影，强化舞台黑玻璃感
  var backdropGeo = new THREE.PlaneGeometry(120, 80);
  var backdropMat = new THREE.MeshBasicMaterial({
    color: 0x07090f,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    depthTest: false
  });
  var backdrop = new THREE.Mesh(backdropGeo, backdropMat);
  backdrop.position.set(0, 0, -18);
  backdrop.renderOrder = -3;
  backdrop.visible = false;
  scene.add(backdrop);

  // 雷电闪白平面
  var flashGeo = new THREE.PlaneGeometry(130, 90);
  var flashMat = new THREE.MeshBasicMaterial({
    color: 0xdfeaff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  var flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(0, 0, -16);
  flash.renderOrder = 1;   // 闪白盖过雨丝与封面
  flash.visible = false;
  scene.add(flash);

  // 湿玻璃幽灵封面：复用主 coverTex，不另载图；无封面时隐藏
  var coverUniforms = {
    uTexture: { value: (typeof coverTex !== 'undefined' && coverTex) ? coverTex : null },
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uEnergy: { value: 0 },
    uFlash: { value: 0 },
    uDim: { value: 1 },
    uTint: { value: new THREE.Color(0xb8d4ff) }
  };
  var coverMat = new THREE.ShaderMaterial({
    uniforms: coverUniforms,
    vertexShader: RAIN_COVER_VERT,
    fragmentShader: RAIN_COVER_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending
  });
  var coverPlane = new THREE.Mesh(new THREE.PlaneGeometry(RAIN_COVER_SIZE, RAIN_COVER_SIZE), coverMat);
  coverPlane.position.set(RAIN_COVER_POS[0], RAIN_COVER_POS[1], RAIN_COVER_POS[2]);
  coverPlane.frustumCulled = false;
  coverPlane.renderOrder = -2;   // 暗底之上、雨丝之下
  coverPlane.visible = false;
  scene.add(coverPlane);

  rainMood = {
    points: points,
    geo: geo,
    mat: mat,
    uniforms: uniformsRain,
    backdrop: backdrop,
    flash: flash,
    coverPlane: coverPlane,
    coverUniforms: coverUniforms,
    positions: positions,
    velocities: velocities,
    lengths: lengths,
    alphas: alphas,
    lives: lives,
    active: active,
    freeList: freeList,
    freeCount: freeCount,
    count: count,
    spawnCarry: 0,
    bassS: 0,
    midS: 0,
    trebS: 0,
    energyS: 0,
    flashAmt: 0,
    wind: 0,
    alive: 0,
    coverPulse: 0
  };
  return rainMood;
}

function rainMoodReleaseDrop(rm, idx) {
  if (!rm || !rm.active[idx]) return;
  rm.active[idx] = 0;
  rm.alphas[idx] = 0;
  rm.lives[idx] = 0;
  rm.positions[idx * 3 + 1] = -40;
  if (rm.freeCount < rm.count) {
    rm.freeList[rm.freeCount++] = idx;
  }
  if (rm.alive > 0) rm.alive -= 1;
}

function rainMoodSpawnOne(rm, bassN, midN, energyN) {
  if (!rm || rm.freeCount <= 0) return false;
  var idx = rm.freeList[--rm.freeCount];
  var i3 = idx * 3;
  // 相机前方一片雨幕：x 宽、y 从顶落、z 分层
  // 约 55% 雨丝落在封面前(z > -7.2)，保证湿玻璃外有雨掠过；其余铺远景
  rm.positions[i3] = (Math.random() - 0.5) * 22;
  rm.positions[i3 + 1] = 8.5 + Math.random() * 4.5;
  if (Math.random() < 0.55) {
    rm.positions[i3 + 2] = -6.8 + Math.random() * 8.5;   // 封面前 / 贴近
  } else {
    rm.positions[i3 + 2] = -14 + Math.random() * 6.5;     // 封面后远景
  }
  var fall = 7.5 + Math.random() * 6.5 + bassN * 10 + energyN * 3.5;
  var wind = rm.wind + (Math.random() - 0.5) * (0.4 + midN * 1.2);
  rm.velocities[i3] = wind;
  rm.velocities[i3 + 1] = -fall;
  rm.velocities[i3 + 2] = (Math.random() - 0.5) * 0.35;
  rm.lengths[idx] = 0.28 + Math.random() * 0.45 + bassN * 0.55;
  rm.alphas[idx] = 0.22 + Math.random() * 0.45 + energyN * 0.18;
  rm.lives[idx] = 1.6 + Math.random() * 1.4;
  rm.active[idx] = 1;
  rm.alive += 1;
  return true;
}

function rainMoodClearDrops(rm) {
  if (!rm) return;
  for (var i = 0; i < rm.count; i++) {
    if (rm.active[i]) rainMoodReleaseDrop(rm, i);
  }
  rm.spawnCarry = 0;
  rm.flashAmt = 0;
  rm.coverPulse = 0;
  if (rm.flash && rm.flash.material) rm.flash.material.opacity = 0;
}

function setRainMoodVisible(on) {
  var rm = ensureRainMood();
  if (!rm) return;
  rm.points.visible = !!on;
  rm.backdrop.visible = !!on;
  rm.flash.visible = !!on;
  if (rm.coverPlane) rm.coverPlane.visible = false;
  if (!on) rainMoodClearDrops(rm);
}

function updateRainMoodCover(rm, step, rawBeat) {
  if (!rm || !rm.coverPlane || !rm.coverUniforms) return;
  // 有封面 + 「封面图」开关开着才显示（与音域回响 voxGhostCover 同口径）
  var show = rainMoodHasCover() && !(typeof fx !== 'undefined' && fx && fx.rainGhostCover === false);
  rm.coverPlane.visible = show;
  if (!show) {
    rm.coverPulse = 0;
    return;
  }
  var cu = rm.coverUniforms;
  if (typeof coverTex !== 'undefined' && coverTex) cu.uTexture.value = coverTex;
  rainMoodClock += step;
  cu.uTime.value = rainMoodClock;
  // 鼓点呼吸：快升慢落，别跟雨丝抢节奏
  var pulseTarget = Math.max(0, Math.min(1, rawBeat * 0.85 + rm.bassS * 0.35));
  rm.coverPulse = rainMoodEase(rm.coverPulse, pulseTarget, 0.45, 0.12, step);
  cu.uPulse.value = rm.coverPulse;
  cu.uEnergy.value = rm.energyS;
  cu.uFlash.value = rm.flashAmt;
  cu.uDim.value = 0.88 + rm.energyS * 0.18;
  if (rm.uniforms && rm.uniforms.uTint) {
    cu.uTint.value.copy(rm.uniforms.uTint.value);
  } else {
    cu.uTint.value.setRGB(0.72, 0.83, 1.0);
  }
  // 轻微随风偏斜，像雨幕里海报被风吹
  rm.coverPlane.rotation.z = rm.wind * 0.012;
  rm.coverPlane.position.x = RAIN_COVER_POS[0] + rm.wind * 0.04;
  rm.coverPlane.position.y = RAIN_COVER_POS[1] + Math.sin(rainMoodClock * 0.35) * 0.04;
}

function updateRainMood(dt) {
  var active = rainMoodActive();
  if (!active) {
    if (rainMood && rainMood.points && rainMood.points.visible) setRainMoodVisible(false);
    rainMoodSetBodyClass(false);
    return;
  }

  var rm = ensureRainMood();
  if (!rm) return;
  rainMoodSetBodyClass(true);
  if (!rm.points.visible) setRainMoodVisible(true);

  var step = Math.max(0.008, Math.min(0.05, Number(dt) || 0.016));
  var rawBass = Math.max(0, Math.min(1, (typeof bass === 'number' ? bass : 0)));
  var rawMid = Math.max(0, Math.min(1, (typeof mid === 'number' ? mid : 0)));
  var rawTreb = Math.max(0, Math.min(1, (typeof treble === 'number' ? treble : 0)));
  var rawEnergy = Math.max(0, Math.min(1, (typeof audioEnergy === 'number' ? audioEnergy : 0)));
  var rawBeat = Math.max(0, Math.min(1, (typeof beatPulse === 'number' ? beatPulse : 0)));
  var intensity = (typeof fx !== 'undefined' && fx && isFinite(fx.intensity)) ? Math.max(0.35, fx.intensity) : 1;
  var playingNow = !!(typeof playing !== 'undefined' && playing && typeof audio !== 'undefined' && audio && !audio.paused);

  // 静音/暂停：保留毛毛雨，但大幅降生成量；跟随空闲降帧自然变稀
  rm.bassS = rainMoodEase(rm.bassS, playingNow ? rawBass : rawBass * 0.15, 0.22, 0.10, step);
  rm.midS = rainMoodEase(rm.midS, playingNow ? rawMid : rawMid * 0.12, 0.18, 0.10, step);
  rm.trebS = rainMoodEase(rm.trebS, playingNow ? rawTreb : rawTreb * 0.10, 0.20, 0.12, step);
  rm.energyS = rainMoodEase(rm.energyS, playingNow ? rawEnergy : rawEnergy * 0.12, 0.16, 0.09, step);
  rm.wind = rainMoodEase(rm.wind, (rm.midS - 0.22) * 3.4 * intensity, 0.12, 0.08, step);

  // 高频 + 强拍：偶发雷闪；阈值由 rainThunder 控制(低=更易闪)
  var thunderGate = rainThunderValue();
  var flashTarget = 0;
  var trebGate = Math.max(0.35, Math.min(0.85, thunderGate + 0.07));
  var energyGate = Math.max(0.40, Math.min(0.92, thunderGate + 0.17));
  // 阈值越低,随机通过率越高(0.15→≈0.55 通过;0.95→≈0.08 通过)
  var flashChance = Math.max(0.06, Math.min(0.72, 0.78 - thunderGate * 0.74));
  if (playingNow && rm.trebS > trebGate && (rawBeat > thunderGate || rm.energyS > energyGate) && Math.random() < flashChance) {
    flashTarget = Math.min(1, 0.35 + rm.trebS * 0.55 + rawBeat * 0.25);
  }
  rm.flashAmt = rainMoodEase(rm.flashAmt, flashTarget, 0.55, 0.16, step);
  if (rm.flash && rm.flash.material) {
    rm.flash.material.opacity = rm.flashAmt * 0.22;
    rm.flash.visible = rm.flashAmt > 0.02;
  }
  rm.uniforms.uFlash.value = rm.flashAmt;
  rm.uniforms.uDim.value = 0.85 + rm.energyS * 0.25;
  rm.uniforms.uPointScale.value = (typeof fx !== 'undefined' && fx && isFinite(fx.point)) ? Math.max(0.7, fx.point) : 1;
  if (typeof uniforms !== 'undefined' && uniforms && uniforms.uPixel) {
    rm.uniforms.uPixel.value = uniforms.uPixel.value;
  }
  if (typeof fx !== 'undefined' && fx && fx.visualTintMode === 'custom' && fx.visualTintColor && rm.uniforms.uTint) {
    try { rm.uniforms.uTint.value.set(fx.visualTintColor); } catch (_) {}
  } else if (rm.uniforms.uTint) {
    rm.uniforms.uTint.value.setRGB(0.72, 0.83, 1.0);
  }

  // 湿玻璃幽灵封面（有封面才亮；不另起开关，随雨境一起开）
  updateRainMoodCover(rm, step, rawBeat);

  // 生成：基础毛毛雨 + 低频鼓点爆发；再乘雨量倍率
  var amount = rainAmountValue();
  var spawnRate = (RAIN_MOOD_SPAWN_BASE
    + rm.bassS * 14 * intensity
    + rawBeat * 8
    + rm.energyS * 3) * amount;
  if (!playingNow) spawnRate = Math.min(spawnRate, 2.2 * Math.max(0.35, amount));
  rm.spawnCarry += spawnRate * step * 60 * 0.35;
  var toSpawn = Math.floor(rm.spawnCarry);
  var posDirty = false;
  var attrDirty = false;
  if (toSpawn > 0) {
    rm.spawnCarry -= toSpawn;
    // 暴雨时单帧上限略抬,避免积压;毛毛雨压低突发
    var spawnCap = Math.max(6, Math.min(48, Math.round(28 * amount)));
    toSpawn = Math.min(toSpawn, spawnCap);
    for (var s = 0; s < toSpawn; s++) {
      if (!rainMoodSpawnOne(rm, rm.bassS, rm.midS, rm.energyS)) break;
      posDirty = true;
      attrDirty = true;
    }
  }
  for (var i = 0; i < rm.count; i++) {
    if (!rm.active[i]) continue;
    var i3 = i * 3;
    rm.velocities[i3] += (rm.wind - rm.velocities[i3]) * Math.min(1, 0.08 * step * 60);
    rm.positions[i3] += rm.velocities[i3] * step;
    rm.positions[i3 + 1] += rm.velocities[i3 + 1] * step;
    rm.positions[i3 + 2] += rm.velocities[i3 + 2] * step;
    rm.lives[i] -= step;
    if (rm.lives[i] <= 0 || rm.positions[i3 + 1] < -9.5) {
      rainMoodReleaseDrop(rm, i);
      attrDirty = true;
      posDirty = true;
      continue;
    }
    // 近地淡出
    if (rm.positions[i3 + 1] < -6.5) {
      rm.alphas[i] *= Math.pow(0.86, step * 60);
      attrDirty = true;
    }
    posDirty = true;
  }

  if (posDirty && rm.geo.attributes.position) rm.geo.attributes.position.needsUpdate = true;
  if (attrDirty) {
    if (rm.geo.attributes.aLen) rm.geo.attributes.aLen.needsUpdate = true;
    if (rm.geo.attributes.aAlpha) rm.geo.attributes.aAlpha.needsUpdate = true;
  } else if (posDirty && rm.geo.attributes.aAlpha) {
    // 长度/透明度在 spawn 时写入，保证至少刷一次
    rm.geo.attributes.aLen.needsUpdate = true;
    rm.geo.attributes.aAlpha.needsUpdate = true;
  }

  if (rm.backdrop && rm.backdrop.material) {
    rm.backdrop.material.opacity = 0.72 + rm.energyS * 0.12;
  }

}
