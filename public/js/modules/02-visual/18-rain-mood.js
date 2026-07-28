// ===================== 雨境 (Rhythm Rain) — 音频频段驱动的雨粒子 =====================
// 复用已下架的预设索引 9（原声波走廊）。不是 weather-mood 的气象可视化；
// 只吃主循环已算好的 bass / mid / treble / beatPulse / audioEnergy。
// THREE.Points 对象池，挂主场景，跟随主 rAF / 空闲降帧，不另起 Canvas。

var RAIN_MOOD_PRESET_INDEX = 9;
var RAIN_MOOD_MAX_DROPS = 900;
var RAIN_MOOD_SPAWN_BASE = 1.2;
var rainMood = null;

function rainMoodActive() {
  return !!(fx && Number(fx.preset) === RAIN_MOOD_PRESET_INDEX);
}

function rainMoodEase(current, target, rise, fall, dt) {
  var rate = target > current ? rise : fall;
  return current + (target - current) * Math.min(1, rate * Math.max(0.016, dt || 0.016) * 60);
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

  var uniforms = {
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
    uniforms: uniforms,
    vertexShader: vs,
    fragmentShader: fs,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });

  var points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -1;
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
  flash.renderOrder = -2;
  flash.visible = false;
  scene.add(flash);

  rainMood = {
    points: points,
    geo: geo,
    mat: mat,
    uniforms: uniforms,
    backdrop: backdrop,
    flash: flash,
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
    alive: 0
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
  rm.positions[i3] = (Math.random() - 0.5) * 22;
  rm.positions[i3 + 1] = 8.5 + Math.random() * 4.5;
  rm.positions[i3 + 2] = -14 + Math.random() * 18;
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
  if (rm.flash && rm.flash.material) rm.flash.material.opacity = 0;
}

function setRainMoodVisible(on) {
  var rm = ensureRainMood();
  if (!rm) return;
  rm.points.visible = !!on;
  rm.backdrop.visible = !!on;
  rm.flash.visible = !!on;
  if (!on) rainMoodClearDrops(rm);
}

function updateRainMood(dt) {
  var active = rainMoodActive();
  if (!active) {
    if (rainMood && rainMood.points && rainMood.points.visible) setRainMoodVisible(false);
    return;
  }

  var rm = ensureRainMood();
  if (!rm) return;
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

  // 高频 + 强拍：偶发雷闪
  var flashTarget = 0;
  if (playingNow && rm.trebS > 0.62 && (rawBeat > 0.55 || rm.energyS > 0.72) && Math.random() > 0.82) {
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

  // 生成：基础毛毛雨 + 低频鼓点爆发
  var spawnRate = RAIN_MOOD_SPAWN_BASE
    + rm.bassS * 14 * intensity
    + rawBeat * 8
    + rm.energyS * 3;
  if (!playingNow) spawnRate = Math.min(spawnRate, 2.2);
  rm.spawnCarry += spawnRate * step * 60 * 0.35;
  var toSpawn = Math.floor(rm.spawnCarry);
  var posDirty = false;
  var attrDirty = false;
  if (toSpawn > 0) {
    rm.spawnCarry -= toSpawn;
    toSpawn = Math.min(toSpawn, 28);
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
