// 体素自定义(亮)背景下,歌词的黑色可读性背衬要更实才压得住亮底 → 整体乘一个 boost。
// 黑底 / 非体素时返回 1(x*1 逐位不变,原有观感零改动);仅体素城市 + 自定义背景时抬到 ~0.85 档。
var LYRIC_READABILITY_BOOST = 0.85 / 0.38;   // ≈2.24:把 0.38 档提到 ~0.85 档
function lyricReadabilityBoost() {
  if (typeof fx === 'undefined' || !fx) return 1;
  if (!(fx.voxBgColor || fx.voxBgImage)) return 1;
  return (typeof voxelCityActive === 'function' && voxelCityActive()) ? LYRIC_READABILITY_BOOST : 1;
}
function primeLyricMeshOpacity(mesh, amount) {
  if (!mesh || !mesh.userData || !mesh.userData.lyric) return;
  var data = mesh.userData.lyric;
  amount = clampRange(Number(amount) || 0, 0, 0.72);
  data.globalOpacity = amount;
  if (data.textMat && data.textMat.uniforms && data.textMat.uniforms.uOpacity) data.textMat.uniforms.uOpacity.value = amount;
  if (data.rowLayers) {
    data.rowLayers.forEach(function (row) {
      var rowAmount = amount * (row.isActive ? 1 : row.targetAlpha * 0.62);
      if (row.mat && row.mat.uniforms && row.mat.uniforms.uOpacity) row.mat.uniforms.uOpacity.value = rowAmount;
      else if (!row.isActive && row.mat) row.mat.opacity = rowAmount;
      if (row.readabilityMat) {
        var readPrime = Math.min(1, amount * row.targetAlpha * 0.38 * lyricReadabilityBoost());   // 自定义背景加实背衬
        if (typeof setLyricTextureMaterialOpacity === 'function') setLyricTextureMaterialOpacity(row.readabilityMat, readPrime);
        else row.readabilityMat.opacity = readPrime;
      }
    });
  }
}

function stableStageLyricRowMaskLayout() {
  var fontSize = 128;
  var lineHeightFactor = typeof lyricLineHeightFactor === 'function' ? lyricLineHeightFactor() : 1.08;
  return { fontSize: fontSize, lineHeight: fontSize * lineHeightFactor };
}

function buildLyricMesh(input) {
  var buildPerfProbe = (typeof window !== 'undefined' && window.__mineradioPerf) ? window.__mineradioPerf : null;
  var buildPerfStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  var payload = normalizeStageLyricPayload(input);
  if (!payload) payload = normalizeStageLyricPayload('');
  var text = payload ? payload.combinedText : '';
  var mask = makeLyricMask(payload || text);
  var maskLayout = { fontSize: mask.fontSize, lineHeight: mask.lineHeight };
  var rowBaseLayout = stableStageLyricRowMaskLayout();
  var activePayload = activeStageLyricPayload(payload || text);
  var activeMask = makeLyricMask(activePayload || payload || text, maskLayout);
  var rowBasePayload = rowBaseStageLyricPayload(payload || text);
  var rowBaseMask = makeLyricMask(rowBasePayload || activePayload || payload || text, rowBaseLayout);
  var contextMask = null;
  var pal = stageLyrics.palette;
  var worldW = 6.10;
  var worldH = worldW * (mask.height / mask.width);
  var rowWorldH = worldW * ((rowBaseMask && rowBaseMask.height || mask.height) / Math.max(1, rowBaseMask && rowBaseMask.width || mask.width));
  var textWorldW = worldW * ((activeMask.activeTextWidth || activeMask.textWidth) / activeMask.width);
  var textWorldH = worldH * ((activeMask.textHeight || activeMask.fontSize) / activeMask.height);
  var group = new THREE.Group();
  group.renderOrder = 42;
  var lineStep = clampRange(Number(stageLyrics.transitionLineStep) || 0, -2, 2);
  var singleLineSwap = payload && normalizeLyricDisplayMode(payload.mode) === 'single';
  var enterDir = singleLineSwap ? 0 : (lineStep > 0 ? -1 : (lineStep < 0 ? 1 : 0));
  var motionProfile = lyricMotionProfile();
  var singleLineStartX = singleLineSwap ? 0 : (Math.random() - 0.5) * 0.045;
  group.position.set(singleLineStartX, 0.20, 1.46 - Math.abs(enterDir) * 0.055);
  group.scale.setScalar(0.96);
  group.userData.age = 0;
  group.userData.state = 'in';
  group.userData.lastLyricProgress = -1;
  group.userData.targetLyricProgress = 0;
  group.userData.shownLyricProgress = 0;
  group.userData.enterDirection = enterDir;
  group.userData.exitDirection = 0;
  group.userData.motionStyle = motionProfile.style;
  group.userData.floatSeed = Math.random() * 100;
  group.userData.glitchSeed = Math.random() * 997;
  group.userData.glitchBurst = 0;
  group.userData.glitchHold = 0;
  group.userData.glitchNextAt = 0;
  group.userData.glitchLastBeatAt = -10;

  var context = null;
  var contextMat = null;
  var readability = null;
  var readabilityMat = null;
  var rowLayerBundle = makeLyricRowLayerGroup(payload || text, rowBaseMask || mask, worldW, rowWorldH || worldH, pal, motionProfile);
  var rowLayerGroup = rowLayerBundle && rowLayerBundle.group;
  var textMat = rowLayerBundle && rowLayerBundle.activeMat;
  var textMesh = rowLayerBundle && rowLayerBundle.activeMesh;
  if (!textMat || !textMesh) {
    textMat = makeLyricShaderMaterial(activeMask, pal, motionProfile);
    textMesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH, 1, 1), textMat);
    textMesh.renderOrder = 43.4;
    if (!rowLayerGroup) rowLayerGroup = new THREE.Group();
    rowLayerGroup.add(textMesh);
  }
  if (rowLayerBundle && rowLayerBundle.activeWorldH) {
    textWorldH = rowLayerBundle.activeWorldH;
  }
  if (rowLayerGroup) group.add(rowLayerGroup);
  var rowLayersActive = !!(rowLayerBundle && rowLayerBundle.rows && rowLayerBundle.rows.length);
  var sun = null;
  var sunMat = null;
  var glow = null;
  var glowMat = null;
  var glowMeta = { matchMask: false };
  if (!rowLayersActive) {
    sunMat = new THREE.MeshBasicMaterial({
      map: getLyricSunBloomTexture(), transparent: true, opacity: 0,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, color: lyricBeatGlowThreeColor(pal, '#ffe7a6', 0.50)
    });
    var sunWorldW = Math.max(textWorldW + worldH * 1.10, textWorldW * 1.18);
    sunWorldW = Math.min(worldW * 1.16, Math.max(worldH * 1.35, sunWorldW));
    var sunWorldH = Math.max(worldH * 1.02, Math.min(worldH * 1.54, worldH + textWorldW * 0.070));
    sun = new THREE.Mesh(new THREE.PlaneGeometry(sunWorldW, sunWorldH, 1, 1), sunMat);
    sun.renderOrder = 40;
    sun.position.set(0, 0.02, -0.030);
    sun.scale.set(0.78, 0.58, 1);
    group.add(sun);

    var glowTex = makeLyricGlowTexture(payload ? payload.text : text, activeMask.fontSize, activeMask.activeTextWidth || activeMask.textWidth, activeMask.lines, activeMask.lineHeight, activeMask.fitScaleX, activeMask.entries, activeMask.activeLine, null);
    glowMat = new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, color: lyricStageGlowThreeColor(pal, '#9cffdf', 0.36)
    });
    glowMeta = glowTex.userData || {};
    var glowWorldW = textWorldW * ((glowMeta.width || activeMask.width) / Math.max(1, glowMeta.textWidth || activeMask.activeTextWidth || activeMask.textWidth));
    if (!glowMeta.matchMask) glowWorldW = Math.min(worldW * 1.10, Math.max(textWorldW + worldH * 0.38, glowWorldW));
    var glowWorldH = worldH * ((glowMeta.height || activeMask.height) / activeMask.height);
    if (!glowMeta.matchMask) glowWorldH = Math.min(worldH * 1.42, Math.max(worldH * 0.92, glowWorldH));
    var glowGeo = new THREE.PlaneGeometry(glowWorldW, glowWorldH, 1, 1);
    glow = new THREE.Mesh(glowGeo, glowMat);
    glow.renderOrder = 41;
    glow.scale.set(1.0, 1.06, 1);
    group.add(glow);
  }

  var sparkCount = 132;
  var pgeo = new THREE.BufferGeometry();
  var ppos = new Float32Array(sparkCount * 3);
  var pseed = new Float32Array(sparkCount);
  for (var i = 0; i < sparkCount; i++) {
    var angle = Math.random() * Math.PI * 2;
    var ring = 0.78 + Math.pow(Math.random(), 1.45) * 0.58;
    var rx = textWorldW * (0.50 + Math.random() * 0.22) + 0.10;
    var ry = worldH * (0.42 + Math.random() * 0.22) + 0.08;
    ppos[i * 3] = Math.cos(angle) * rx * ring + (Math.random() - 0.5) * textWorldW * 0.12;
    ppos[i * 3 + 1] = Math.sin(angle) * ry * ring + (Math.random() - 0.5) * worldH * 0.14;
    ppos[i * 3 + 2] = (Math.random() - 0.5) * 0.24;
    pseed[i] = Math.random() * 1000;
  }
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  pgeo.setAttribute('seed', new THREE.BufferAttribute(pseed, 1));
  var pmat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: dotTexture },
      uSize: { value: 0.052 },
      uOpacity: { value: 0 },
      uColor: { value: lyricBeatGlowThreeColor(pal, '#fff7d2', 0.30) },
      uPixel: uniforms.uPixel
    },
    vertexShader: [
      'attribute float seed;',
      'uniform float uSize;',
      'uniform float uPixel;',
      'varying float vSeed;',
      'void main(){',
      '  vSeed = seed;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  float jitter = 0.58 + fract(sin(seed * 19.17) * 43758.5453) * 1.18;',
      '  float depth = clamp(2.2 / max(0.35, -mv.z), 0.54, 1.55);',
      '  gl_PointSize = uSize * jitter * depth * uPixel * 120.0;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform vec3 uColor;',
      'uniform float uOpacity;',
      'varying float vSeed;',
      'void main(){',
      '  vec4 tex = texture2D(uMap, gl_PointCoord);',
      '  float twinkle = 0.72 + fract(sin(vSeed * 7.31) * 91.7) * 0.28;',
      '  gl_FragColor = vec4(uColor * twinkle, tex.a * uOpacity);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
  });
  var sparks = new THREE.Points(pgeo, pmat);
  sparks.renderOrder = 44;
  sparks.visible = !!fx.lyricGlowParticles;
  group.add(sparks);

  var lineWorldStep = rowLayerBundle && rowLayerBundle.lineStepWorld ? rowLayerBundle.lineStepWorld : worldH * ((mask.lineHeight || mask.fontSize || 1) / Math.max(1, mask.height || 1));
  lineWorldStep = clampRange(lineWorldStep, 0.20, 0.94);
  var translationLineStepWorld = rowLayerBundle && rowLayerBundle.translationLineStepWorld ? rowLayerBundle.translationLineStepWorld : lineWorldStep;
  translationLineStepWorld = clampRange(translationLineStepWorld, 0.20, 0.78);
  if (!singleLineSwap) group.position.y += enterDir * lineWorldStep;
  group.userData.lyric = {
    mask: mask, activeMask: activeMask, contextMask: contextMask, textMesh: null, context: context, readability: readability, glow: glow, sparks: sparks, sun: sun,
    textMat: textMat, contextMat: contextMat, readabilityMat: readabilityMat, glowMat: glowMat, sparkMat: pmat, sunMat: sunMat,
    rowLayerGroup: rowLayerGroup,
    rowLayers: rowLayerBundle ? rowLayerBundle.rows : null,
    activeRowMesh: textMesh,
    contextGroup: rowLayerBundle ? rowLayerBundle.contextGroup : null,
    readabilityGroup: rowLayerBundle ? rowLayerBundle.readabilityGroup : null,
    usesTrack: !!(rowLayerBundle && rowLayerBundle.usesTrack),
    displayMode: rowLayerBundle ? rowLayerBundle.displayMode : (payload && payload.mode),
    trackKey: rowLayerBundle ? rowLayerBundle.trackKey : '',
    trackStart: rowLayerBundle ? rowLayerBundle.trackStart : null,
    trackEnd: rowLayerBundle ? rowLayerBundle.trackEnd : null,
    trackLightweight: !!(rowLayerBundle && rowLayerBundle.trackLightweight),
    trackTargetIndex: rowLayerBundle ? rowLayerBundle.trackTargetIndex : (payload && payload.trackIndex),
    trackTargetLineIndex: rowLayerBundle ? rowLayerBundle.trackTargetLineIndex : (payload && payload.trackIndex),
    trackTargetVirtualIndex: rowLayerBundle ? rowLayerBundle.trackTargetVirtualIndex : (payload && payload.trackIndex),
    trackVisibleRadius: rowLayerBundle ? rowLayerBundle.trackVisibleRadius : lyricDisplayLineCountForMode(payload && payload.mode) * 0.50,
    trackScrollOffset: rowLayerBundle ? rowLayerBundle.trackTargetIndex : (payload && payload.trackIndex),
    basePositions: ppos.slice ? ppos.slice(0) : new Float32Array(ppos),
    textWorldW: textWorldW, textWorldH: textWorldH, worldW: worldW, worldH: worldH, lineWorldStep: lineWorldStep, translationLineStepWorld: translationLineStepWorld, singleLineSwap: singleLineSwap, glowFrameLocked: !!(glowMeta && glowMeta.matchMask), suppressStaticGlow: rowLayersActive
  };
  group.userData.displayKey = payload ? payload.key : text;
  group.userData.payload = payload;
  updateLyricMeshProgress(group, 0);
  if (buildPerfProbe && typeof buildPerfProbe.markSince === 'function') buildPerfProbe.markSince('lyrics.mesh-build', buildPerfStart);
  return group;
}

function scheduleLyricTrackBoundaryPrewarm(data, targetLineIndex) {
  if (!data || typeof scheduleStageLyricPrewarmForIndex !== 'function') return;
  var start = Number(data.trackStart);
  var end = Number(data.trackEnd);
  if (!isFinite(start) || !isFinite(end)) return;
  var total = lyricsLines && lyricsLines.length ? lyricsLines.length : 0;
  if (!total) return;
  var windowSize = Math.max(1, end - start + 1);
  var margin = Math.max(4, Math.min(18, Math.ceil(windowSize * 0.18)));
  var reasonNext = data.trackLightweight ? 'track-demand-light' : 'track-boundary-next';
  var reasonPrev = data.trackLightweight ? 'track-demand-light' : 'track-boundary-prev';
  if (targetLineIndex >= end - margin && end < total - 1) {
    scheduleStageLyricPrewarmForIndex(end + 1, reasonNext, 24);
  } else if (targetLineIndex <= start + margin && start > 0) {
    scheduleStageLyricPrewarmForIndex(start - 1, reasonPrev, 24);
  }
  if (data.trackLightweight && typeof scheduleStageLyricFullTrackWarmup === 'function') {
    scheduleStageLyricFullTrackWarmup('lightweight-upgrade', 120);
  }
}

function shouldSnapLyricTrackScroll(data, targetIndex, targetLineIndex, payload) {
  if (!data) return false;
  var currentOffset = Number(data.trackScrollOffset);
  if (!isFinite(currentOffset)) return true;
  var visibleRadius = Math.max(1.2, Number(data.trackVisibleRadius) || 3);
  var jump = Math.abs(targetIndex - currentOffset);
  if (!data.trackScrollPrimed) return true;
  var payloadWindowKey = lyricTrackScrollWindowKey(payload);
  if (payloadWindowKey && data.trackScrollWindowKey && data.trackScrollWindowKey !== payloadWindowKey) return true;
  if (jump > Math.max(2.75, visibleRadius * 1.55)) return true;
  var prevLine = Number(data.trackTargetLineIndex);
  if (isFinite(prevLine) && Math.abs(targetLineIndex - prevLine) > Math.max(6, visibleRadius * 2.7)) return true;
  return false;
}

function lyricTrackScrollWindowKey(payload) {
  if (!payload || !payload.trackKey) return '';
  return [
    payload.trackKey,
    payload.trackStart == null ? '' : payload.trackStart,
    payload.trackEnd == null ? '' : payload.trackEnd,
    payload.trackLightweight ? 'light' : 'full'
  ].join('|');
}

function snapLyricTrackScroll(data, targetIndex, payload) {
  if (!data || !isFinite(Number(targetIndex))) return;
  data.trackScrollOffset = Number(targetIndex);
  data.trackScrollPrimed = true;
  data.trackScrollWindowKey = lyricTrackScrollWindowKey(payload) || data.trackScrollWindowKey || '';
  data.trackScrollSnapUntil = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) + 120;
}

function updateLyricMeshProgress(mesh, progress, opts) {
  if (!mesh || !mesh.userData || !mesh.userData.lyric) return;
  opts = opts || {};
  progress = Math.max(0, Math.min(1, progress || 0));
  var d = mesh.userData.lyric;
  mesh.userData.targetLyricProgress = progress;
  mesh.userData.nativeKaraokeProgress = !!opts.nativeKaraoke;
  if (d.textMat && d.textMat.uniforms && d.textMat.uniforms.uProgress && !isFinite(d.textMat.uniforms.uProgress.value)) {
    d.textMat.uniforms.uProgress.value = progress;
  }
  mesh.userData.lastLyricProgress = progress;
}

function setLyricTrackTarget(mesh, payload) {
  if (!mesh || !mesh.userData || !mesh.userData.lyric || !payload) return false;
  var data = mesh.userData.lyric;
  if (!data.usesTrack || !data.rowLayers || !data.rowLayers.length) return false;
  if (!payload.trackLightweight && data.trackLightweight) return false;
  if (!payload.trackKey || data.trackKey !== payload.trackKey) return false;
  if (payload.trackIndex == null || !isFinite(Number(payload.trackIndex))) return false;
  var targetLineIndex = Number(payload.trackIndex);
  if (data.trackStart != null && isFinite(Number(data.trackStart)) && targetLineIndex < Number(data.trackStart)) return false;
  if (data.trackEnd != null && isFinite(Number(data.trackEnd)) && targetLineIndex > Number(data.trackEnd)) return false;
  var targetIndex = lyricPrimaryVirtualIndex(targetLineIndex);
  var snapTrackScroll = shouldSnapLyricTrackScroll(data, targetIndex, targetLineIndex, payload);
  var activeRow = null;
  for (var i = 0; i < data.rowLayers.length; i++) {
    var row = data.rowLayers[i];
    var rowLineIndex = row && row.lineIndex != null && isFinite(Number(row.lineIndex)) ? Number(row.lineIndex) : null;
    if (row && row.isPrimary && (rowLineIndex != null ? rowLineIndex === targetLineIndex : Math.abs((Number(row.virtualIndex) || 0) - targetIndex) < 0.015)) {
      activeRow = row;
      break;
    }
  }
  if (!activeRow || !activeRow.mat || !activeRow.mat.uniforms) return false;
  data.trackTargetIndex = targetIndex;
  data.trackTargetLineIndex = targetLineIndex;
  data.trackTargetVirtualIndex = targetIndex;
  if (snapTrackScroll) snapLyricTrackScroll(data, targetIndex, payload);
  else {
    data.trackScrollPrimed = true;
    data.trackScrollWindowKey = lyricTrackScrollWindowKey(payload) || data.trackScrollWindowKey || '';
  }
  data.textMat = activeRow.mat;
  data.activeRowMesh = activeRow.mesh;
  mesh.userData.payload = payload;
  mesh.userData.targetLyricProgress = 0;
  mesh.userData.shownLyricProgress = 0;
  if (data.textMat.uniforms.uProgress) data.textMat.uniforms.uProgress.value = 0;
  scheduleLyricTrackBoundaryPrewarm(data, targetLineIndex);
  return true;
}
