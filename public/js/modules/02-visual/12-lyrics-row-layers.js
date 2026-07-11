function lyricLineCenterWorldY(mask, entry, lineIndex, worldH) {
  mask = mask || {};
  entry = entry || {};
  var h = Math.max(1, Number(mask.height) || 384);
  var fontSize = Number(mask.fontSize) || 128;
  var lineHeight = Number(mask.lineHeight) || fontSize;
  var lineFontSize = fontSize * (entry.scale || 1);
  var y0 = isFinite(Number(mask.lineY0)) ? Number(mask.lineY0) : (h / 2 + fontSize * 0.36);
  var baseline = y0 + lineIndex * lineHeight + lyricEntryLineOffset(entry) * lineHeight;
  var centerY = baseline - lineFontSize * 0.36;
  return (0.5 - clampRange(centerY / h, 0, 1)) * worldH;
}

function lyricRowVirtualIndex(entry, fallbackIndex) {
  entry = entry || {};
  if (entry.translationLine && entry.parentIndex != null && isFinite(Number(entry.parentIndex))) return lyricTranslationVirtualIndex(entry.parentIndex);
  if (entry.lineIndex != null && isFinite(Number(entry.lineIndex))) return lyricPrimaryVirtualIndex(entry.lineIndex);
  if (entry.virtualIndex != null && isFinite(Number(entry.virtualIndex))) return Number(entry.virtualIndex);
  return Number(fallbackIndex) || 0;
}

function lyricLayerVirtualIndex(entry, fallbackIndex, activeLine, usesTrack) {
  entry = entry || {};
  if (!usesTrack) {
    var localActive = activeLine != null && isFinite(Number(activeLine)) ? Number(activeLine) : 0;
    if (entry.translationLine && entry.parentRole === 'current') return localActive + lyricTranslationVisualGapValue();
    return Number(fallbackIndex) || 0;
  }
  return lyricRowVirtualIndex(entry, fallbackIndex);
}

function lyricTrackLineStepWorld(mask, worldH) {
  mask = mask || {};
  var h = Math.max(1, Number(mask.height) || 384);
  var lineHeight = Number(mask.lineHeight) || Number(mask.fontSize) || 128;
  var step = worldH * (lineHeight / h);
  step *= clampRange(1 + (lyricContextSpreadValue() - 1) * 0.32, 0.86, 1.45);
  if (lyricTranslationLayoutActive()) step *= 1.06;
  return clampRange(step, 0.22, 0.94);
}

function lyricTranslationLineStepWorld(mask, worldH) {
  mask = mask || {};
  var h = Math.max(1, Number(mask.height) || 384);
  var lineHeight = Number(mask.lineHeight) || Number(mask.fontSize) || 128;
  var step = worldH * (lineHeight / h);
  if (lyricTranslationLayoutActive()) step *= 1.04;
  return clampRange(step, 0.20, 0.78);
}

function lyricTranslationAnchoredY(entry, fallbackIndex, activeLine, lineStepWorld, translationLineStepWorld, scrollOffset, rowDrift, currentTranslation, usesTrack) {
  entry = entry || {};
  if (!usesTrack) {
    var rowVirtualLocal = entry.virtualIndex != null && isFinite(Number(entry.virtualIndex))
      ? Number(entry.virtualIndex)
      : lyricLayerVirtualIndex(entry, fallbackIndex, activeLine, false);
    var localOffset = scrollOffset == null || !isFinite(Number(scrollOffset)) ? activeLine : Number(scrollOffset);
    var localDelta = rowVirtualLocal - localOffset;
    var localSign = localDelta >= 0 ? 1 : -1;
    var parentDeltaLocal = localDelta - localSign * lyricTranslationVisualGapValue();
    var parentAbsLocal = Math.abs(parentDeltaLocal);
    var parentDriftLocal = currentTranslation ? 0 : ((Number(rowDrift) || 0) * clampRange(0.70 + parentAbsLocal * 0.10, 0.65, 1.20));
    return -parentDeltaLocal * lineStepWorld + parentDriftLocal - localSign * lyricTranslationVisualGapValue() * translationLineStepWorld;
  }
  var parentIndex = entry.parentIndex != null && isFinite(Number(entry.parentIndex))
    ? Number(entry.parentIndex)
    : (entry.lineIndex != null && isFinite(Number(entry.lineIndex)) ? Number(entry.lineIndex) : null);
  var parentVirtual = parentIndex != null ? lyricPrimaryVirtualIndex(parentIndex) : activeLine;
  var rowVirtual = entry.virtualIndex != null && isFinite(Number(entry.virtualIndex))
    ? Number(entry.virtualIndex)
    : lyricLayerVirtualIndex(entry, fallbackIndex, activeLine, true);
  var baseOffset = scrollOffset == null || !isFinite(Number(scrollOffset)) ? activeLine : Number(scrollOffset);
  var parentDelta = parentVirtual - baseOffset;
  var parentAbs = Math.abs(parentDelta);
  var parentDrift = currentTranslation ? 0 : ((Number(rowDrift) || 0) * clampRange(0.70 + parentAbs * 0.10, 0.65, 1.20));
  var sign = rowVirtual >= parentVirtual ? 1 : -1;
  return -parentDelta * lineStepWorld + parentDrift - sign * lyricTranslationVisualGapValue() * translationLineStepWorld;
}

function lyricLineAllowedForDisplayMode(lineIndex, targetLineIndex, mode) {
  if (lineIndex == null || !isFinite(Number(lineIndex))) return true;
  var delta = Math.round(Number(lineIndex) - Number(targetLineIndex || 0));
  var offsets = lyricDisplayOffsetsForMode(mode);
  for (var i = 0; i < offsets.length; i++) {
    if (Math.round(Number(offsets[i]) || 0) === delta) return true;
  }
  return false;
}

function lyricRowVisualDelta(entry, index, activeLine) {
  entry = entry || {};
  var raw = index - activeLine;
  if (entry.virtualIndex != null || entry.lineIndex != null || entry.parentIndex != null) {
    var trackIndex = activeLine != null && isFinite(Number(activeLine)) ? Number(activeLine) : 0;
    raw = lyricRowVirtualIndex(entry, index) - trackIndex;
  }
  if (entry.translationLine && entry.parentRole === 'current' && !(entry.virtualIndex != null || entry.lineIndex != null || entry.parentIndex != null)) {
    var gap = lyricTranslationGapValue();
    return raw >= 0 ? gap : -gap;
  }
  return raw;
}

function lyricRowDepthZ(entry, index, activeLine) {
  var delta = lyricRowVisualDelta(entry, index, activeLine);
  var abs = Math.min(5.5, Math.abs(delta));
  return 0.055 - Math.pow(abs, 1.06) * 0.145;
}

function lyricRowDepthScale(entry, index, activeLine) {
  var abs = Math.min(5.5, Math.abs(lyricRowVisualDelta(entry, index, activeLine)));
  return clampRange(1 - abs * 0.026, 0.84, 1.02);
}

function makeLyricBackfaceReadableMaterial(opts) {
  opts = opts || {};
  var color = opts.color && opts.color.isColor ? opts.color.clone() : new THREE.Color(opts.color == null ? 0xffffff : opts.color);
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: opts.map || null },
      uColor: { value: color },
      uOpacity: { value: opts.opacity == null ? 0 : clampRange(Number(opts.opacity) || 0, 0, 1) }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform vec3 uColor;',
      'uniform float uOpacity;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);',
      '  vec4 tex = texture2D(uMap, uv);',
      '  gl_FragColor = vec4(uColor, tex.a * uOpacity);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: opts.blending || THREE.NormalBlending
  });
}
function setLyricTextureMaterialOpacity(mat, value) {
  value = clampRange(Number(value) || 0, 0, 1);
  if (mat && mat.uniforms && mat.uniforms.uOpacity) mat.uniforms.uOpacity.value = value;
  else if (mat) mat.opacity = value;
}
function getLyricTextureMaterialOpacity(mat) {
  if (mat && mat.uniforms && mat.uniforms.uOpacity) return Number(mat.uniforms.uOpacity.value) || 0;
  return mat && isFinite(Number(mat.opacity)) ? Number(mat.opacity) : 0;
}
function setLyricTextureMaterialColor(mat, color) {
  if (!mat || !color) return;
  if (mat.uniforms && mat.uniforms.uColor && mat.uniforms.uColor.value && mat.uniforms.uColor.value.copy) mat.uniforms.uColor.value.copy(color);
  else if (mat.color && mat.color.copy) mat.color.copy(color);
}
var lyricReadabilityLightColor = null;
var lyricReadabilityDarkColor = null;
var lyricReadabilityMixColor = null;
function lyricBackgroundAdaptStrengthValue() {
  var fallback = fxDefaults && isFinite(Number(fxDefaults.lyricBackgroundAdapt)) ? Number(fxDefaults.lyricBackgroundAdapt) : 0;
  var value = fx && fx.lyricBackgroundAdapt != null ? Number(fx.lyricBackgroundAdapt) : fallback;
  return clampRange(value, 0, 1);
}
function lyricSonicBackdropAdaptActive() {
  return lyricBackgroundAdaptStrengthValue() > 0.001;
}
function lyricReadabilityColorForBrightBackdrop(strength) {
  if (typeof THREE === 'undefined') return null;
  if (!lyricReadabilityLightColor) lyricReadabilityLightColor = new THREE.Color(0xffffff);
  if (!lyricReadabilityDarkColor) lyricReadabilityDarkColor = new THREE.Color(0x04070c);
  if (!lyricReadabilityMixColor) lyricReadabilityMixColor = new THREE.Color(0xffffff);
  return lyricReadabilityMixColor.copy(lyricReadabilityLightColor).lerp(lyricReadabilityDarkColor, clampRange(strength * 0.92, 0, 0.92));
}

function makeLyricLineMask(entry, baseMask, asActive) {
  entry = entry || {};
  var primaryLine = !entry.translationLine;
  var drawEntry = cloneStageLyricEntryForLayer(entry, {
    role: asActive ? 'current' : (entry.role || 'context'),
    alpha: 1,
    scale: primaryLine ? 1 : (entry.scale || lyricTranslationScaleValue())
  });
  return makeLyricMask({
    mode: 'single',
    key: 'line|' + (drawEntry.role || '') + '|' + Math.round((drawEntry.scale || 1) * 1000) + '|' + drawEntry.text,
    activeLine: 0,
    entries: [drawEntry]
  }, {
    fontSize: baseMask && baseMask.fontSize,
    lineHeight: baseMask && baseMask.lineHeight
  });
}

function lyricTranslationMeshScale(entry) {
  if (!entry || !entry.translationLine) return 1;
  var scale = isFinite(Number(entry.scale)) ? Number(entry.scale) : lyricTranslationScaleValue();
  var defaultScale = fxDefaults && isFinite(Number(fxDefaults.lyricTranslationScale)) ? Number(fxDefaults.lyricTranslationScale) : 0.78;
  var roleBoost = entry.parentRole === 'current' ? 1.08 : 0.92;
  var defaultEntryScale = clampRange(defaultScale * roleBoost, entry.parentRole === 'current' ? 0.70 : 0.50, entry.parentRole === 'current' ? 1.12 : 0.96);
  return clampRange(scale / Math.max(0.01, defaultEntryScale), 0.72, 1.34);
}

function makeLyricRowGlowMesh(row, pal, worldW) {
  if (!row || !row.lineMask) return null;
  pal = pal || {};
  worldW = Math.max(0.1, Number(worldW) || 6.10);
  var lineMask = row.lineMask;
  var lineWorldH = Math.max(0.05, Number(row.lineWorldH) || worldW * ((lineMask.height || 1) / Math.max(1, lineMask.width || 1)));
  var lineTextWorldW = worldW * ((lineMask.activeTextWidth || lineMask.textWidth || lineMask.width) / Math.max(1, lineMask.width || 1));
  lineTextWorldW = clampRange(lineTextWorldW, worldW * 0.10, worldW * 1.00);
  var rowGlowTex = makeLyricGlowTexture(row.text || '', lineMask.fontSize, lineMask.activeTextWidth || lineMask.textWidth, lineMask.lines, lineMask.lineHeight, lineMask.fitScaleX, lineMask.entries, lineMask.activeLine, null);
  var rowGlowMeta = rowGlowTex.userData || {};
  var rowGlowTextPx = Math.max(1, rowGlowMeta.textWidth || lineMask.activeTextWidth || lineMask.textWidth || lineMask.width || 1);
  var rowGlowTextureRatio = Math.max(1, (rowGlowMeta.width || rowGlowTextPx) / rowGlowTextPx);
  var rowGlowPad = lineWorldH * (row.isTranslation ? 0.42 : 0.62);
  var rowGlowWorldW = clampRange(
    Math.max(
      lineTextWorldW + rowGlowPad,
      lineTextWorldW * Math.max(rowGlowTextureRatio, row.isTranslation ? 1.04 : 1.08)
    ),
    lineTextWorldW + rowGlowPad * 0.62,
    worldW * (row.isTranslation ? 1.00 : 1.08)
  );
  var rowGlowAspect = Math.max(0.12, (rowGlowMeta.height || lineMask.height || 1) / Math.max(1, rowGlowMeta.width || lineMask.width || 1));
  var rowGlowWorldH = clampRange(rowGlowWorldW * rowGlowAspect, lineWorldH * (row.isTranslation ? 0.56 : 0.66), lineWorldH * (row.isTranslation ? 1.12 : 1.36));
  var glowMat = makeLyricBackfaceReadableMaterial({
    map: rowGlowTex,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    color: lyricRowGlowThreeColor(pal, !!row.isTranslation)
  });
  var glowGeo = new THREE.PlaneGeometry(rowGlowWorldW, rowGlowWorldH, 1, 1);
  var glow = new THREE.Mesh(glowGeo, glowMat);
  glow.renderOrder = row.isTranslation ? 42.98 : 42.48;
  glow.position.set(row.baseX || 0, row.baseY || 0, (row.baseZ || 0) - 0.030);
  glow.scale.setScalar(row.baseScale || 1);
  return { glow: glow, glowMat: glowMat };
}

function makeLyricRowLayerGroup(payload, mask, worldW, worldH, pal, motionProfile) {
  payload = normalizeStageLyricPayload(payload);
  var root = new THREE.Group();
  root.renderOrder = 43;
  var contextGroup = new THREE.Group();
  var readabilityGroup = new THREE.Group();
  var rows = [];
  var usesTrack = !!(payload && payload.mode !== 'single' && Array.isArray(payload.trackEntries) && payload.trackEntries.length && payload.trackIndex != null && isFinite(Number(payload.trackIndex)));
  var activeLineIndex = usesTrack ? Number(payload.trackIndex) : (payload ? payload.activeLine : 0);
  var activeLine = usesTrack ? lyricPrimaryVirtualIndex(activeLineIndex) : activeLineIndex;
  var entries = usesTrack ? payload.trackEntries : (payload && payload.entries || []);
  var lineStepWorld = lyricTrackLineStepWorld(mask, worldH);
  var translationLineStepWorld = lyricTranslationLineStepWorld(mask, worldH);
  var displayLineCount = lyricDisplayLineCountForMode(payload && payload.mode);
  var visibleRadius = Math.max(0.85, displayLineCount * 0.50 * lyricPrimarySlotStepValue());
  var activeMesh = null;
  var activeMat = null;
  var activeWorldH = 0.72;
  var activeTargetLineIndex = activeLineIndex;
  root.add(contextGroup);
  root.add(readabilityGroup);
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i] || {};
    var virtualIndex = lyricLayerVirtualIndex(entry, i, activeLine, usesTrack);
    var delta = virtualIndex - activeLine;
    var entryLineIndex = entry.lineIndex != null && isFinite(Number(entry.lineIndex)) ? Number(entry.lineIndex) : null;
    var isActive = !entry.translationLine && (usesTrack ? entryLineIndex === activeLineIndex : Math.abs(delta) < 0.001);
    var lineMask = makeLyricLineMask(entry, mask, isActive);
    var lineWorldH = worldW * (lineMask.height / lineMask.width);
    var lineY = -delta * lineStepWorld;
    if (entry.translationLine) {
      var translationLayoutEntry = !usesTrack
        ? cloneStageLyricEntryForLayer(entry, { virtualIndex: virtualIndex })
        : entry;
      lineY = lyricTranslationAnchoredY(translationLayoutEntry, i, activeLine, lineStepWorld, translationLineStepWorld, activeLine, 0, Math.abs(delta) < 0.001, usesTrack);
    }
    var lineAbs = Math.min(5.5, Math.abs(delta));
    var lineZ = 0.055 - Math.pow(lineAbs, 1.06) * 0.145;
    var lineScale = clampRange(1 - lineAbs * 0.026, 0.84, 1.02);
    var fontScale = lyricTranslationMeshScale(entry);
    if (entry.translationLine) lineScale *= fontScale;
    var lineGeo = new THREE.PlaneGeometry(worldW, lineWorldH, 1, 1);
    var material;
    if (!entry.translationLine) {
      material = makeLyricShaderMaterial(lineMask, pal, motionProfile);
      material.uniforms.uOpacity.value = 0;
      if (material.uniforms.uActiveMix) material.uniforms.uActiveMix.value = isActive ? 1 : 0;
    } else {
      material = makeLyricBackfaceReadableMaterial({
        map: lineMask.texture,
        opacity: 0,
        color: entry.translationLine
          ? lyricThreeColor(pal.highlight || pal.primary, '#eaf6ff', 0.42)
          : lyricThreeColor(pal.primary || pal.secondary, '#d6f8ff', 0.34)
      });
    }
    var mesh = new THREE.Mesh(lineGeo, material);
    mesh.renderOrder = isActive ? 43.4 : (42.6 - lineAbs * 0.015);
    mesh.position.set(0, lineY, lineZ);
    mesh.scale.setScalar(lineScale);
    if (isActive) root.add(mesh);
    else contextGroup.add(mesh);

    var readabilityTex = makeLyricReadabilityTexture(lineMask);
    var readabilityMat = makeLyricBackfaceReadableMaterial({
      map: readabilityTex,
      opacity: 0,
      color: 0xffffff
    });
    var readability = new THREE.Mesh(new THREE.PlaneGeometry(worldW, lineWorldH, 1, 1), readabilityMat);
    readability.renderOrder = mesh.renderOrder - 0.05;
    readability.position.set(0, lineY, lineZ - 0.012);
    readability.scale.setScalar(lineScale);
    readabilityGroup.add(readability);

    var glow = null;
    var glowMat = null;
    var shouldCreateRowGlow = !entry.translationLine || entry.parentRole === 'current';
    if (shouldCreateRowGlow) {
      var rowGlow = makeLyricRowGlowMesh({
        text: entry.text,
        lineMask: lineMask,
        lineWorldH: lineWorldH,
        isTranslation: !!entry.translationLine,
        baseY: lineY,
        baseZ: lineZ,
        baseScale: lineScale
      }, pal, worldW);
      if (rowGlow) {
        glow = rowGlow.glow;
        glowMat = rowGlow.glowMat;
        readabilityGroup.add(glow);
      }
    }

    var targetAlpha = entry.alpha == null ? 1 : clampRange(Number(entry.alpha), 0, 1);
    if (isActive) targetAlpha = 1;
    rows.push({
      mesh: mesh,
      mat: material,
      readability: readability,
      readabilityMat: readabilityMat,
      glow: glow,
      glowMat: glowMat,
      lineMask: lineMask,
      lineWorldH: lineWorldH,
      text: entry.text || '',
      isActive: isActive,
      isPrimary: !entry.translationLine,
      isTranslation: !!entry.translationLine,
      targetAlpha: targetAlpha,
      baseY: lineY,
      baseZ: lineZ,
      baseScale: lineScale,
      fontScale: fontScale,
      virtualIndex: virtualIndex,
      lineIndex: entryLineIndex,
      parentIndex: entry.parentIndex != null && isFinite(Number(entry.parentIndex)) ? Number(entry.parentIndex) : undefined,
      parentRole: entry.parentRole || '',
      delta: delta
    });
    if (isActive) {
      activeMesh = mesh;
      activeMat = material;
      activeWorldH = lineWorldH;
      if (entryLineIndex != null) activeTargetLineIndex = entryLineIndex;
    }
  }
  return {
    group: root,
    contextGroup: contextGroup,
    readabilityGroup: readabilityGroup,
    rows: rows,
    activeMesh: activeMesh,
    activeMat: activeMat,
    activeWorldH: activeWorldH,
    usesTrack: usesTrack,
    displayMode: payload && payload.mode,
    trackKey: payload && payload.trackKey || '',
    trackStart: payload && payload.trackStart,
    trackEnd: payload && payload.trackEnd,
    trackLightweight: !!(payload && payload.trackLightweight),
    trackTargetIndex: activeLine,
    trackTargetLineIndex: activeTargetLineIndex,
    trackTargetVirtualIndex: activeLine,
    trackVisibleRadius: visibleRadius,
    lineStepWorld: lineStepWorld,
    translationLineStepWorld: translationLineStepWorld
  };
}

function updateLyricRowLayers(data, opts) {
  if (!data || !data.rowLayers || !data.rowLayers.length) return;
  opts = opts || {};
  var opacity = clampRange(Number(opts.opacity) || 0, 0, 1);
  var readability = clampRange(Number(opts.readability) || 0.58, 0, 1);
  var contextIntro = opts.contextIntro == null ? 1 : clampRange(Number(opts.contextIntro) || 0, 0, 1);
  var shownProgress = clampRange(Number(opts.shownProgress) || 0, 0, 1);
  var contextDrift = Number(opts.contextDrift) || 0;
  var style = opts.style || 'glass';
  var t = Number(opts.time) || 0;
  var seed = Number(opts.seed) || 0;
  var renderBase = opts.renderBase == null ? 43 : Number(opts.renderBase);
  if (!isFinite(renderBase)) renderBase = 43;
  var translationMode = normalizeLyricTranslationMode(fx && fx.lyricTranslationMode);
  var displayMode = normalizeLyricDisplayMode(data.displayMode || (fx && fx.lyricDisplayMode));
  var singleLineStaticSwap = displayMode === 'single' && !data.usesTrack;
  var currentTranslationOpacity = lyricTranslationOpacityValue();
  var jitterX = Number(opts.jitterX) || 0;
  var jitterY = Number(opts.jitterY) || 0;
  var verticalFloatOn = typeof lyricVerticalFloatEnabled === 'function' ? lyricVerticalFloatEnabled() : true;
  var ease = opts.ease == null ? 0.16 : clampRange(Number(opts.ease) || 0.16, 0.04, 1);
  var targetLineIndex = opts.targetLineIndex != null && isFinite(Number(opts.targetLineIndex))
    ? Number(opts.targetLineIndex)
    : (isFinite(Number(data.trackTargetLineIndex)) ? Number(data.trackTargetLineIndex) : 0);
  var targetIndex = opts.targetVirtualIndex != null && isFinite(Number(opts.targetVirtualIndex))
    ? Number(opts.targetVirtualIndex)
    : (isFinite(Number(data.trackTargetVirtualIndex)) ? Number(data.trackTargetVirtualIndex) : lyricPrimaryVirtualIndex(targetLineIndex));
  var trackEase = opts.trackEase == null ? clampRange(ease * 1.16, 0.08, 0.34) : clampRange(Number(opts.trackEase) || 0.18, 0.04, 0.60);
  var nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var visibleRadiusForSnap = Math.max(1.2, Number(data.trackVisibleRadius) || 3);
  var currentScrollOffset = Number(data.trackScrollOffset);
  var needsScrollSnap = !isFinite(currentScrollOffset) ||
    (isFinite(Number(data.trackScrollSnapUntil)) && nowMs <= Number(data.trackScrollSnapUntil)) ||
    Math.abs(targetIndex - currentScrollOffset) > Math.max(3.2, visibleRadiusForSnap * 1.85);
  if (needsScrollSnap) {
    data.trackScrollOffset = targetIndex;
    data.trackScrollPrimed = true;
  } else {
    data.trackScrollOffset += (targetIndex - data.trackScrollOffset) * trackEase;
  }
  var scrollOffset = data.trackScrollOffset;
  var lineStepWorld = clampRange(Number(data.lineWorldStep) || 0.38, 0.20, 0.94);
  var translationLineStepWorld = clampRange(Number(data.translationLineStepWorld) || lineStepWorld, 0.20, 0.78);
  var rowDrift = (0.5 - shownProgress) * contextDrift;
  var rowGlow = clampRange(Number(opts.rowGlow) || 0, 0, 1);
  var rowGlowBeat = clampRange(Number(opts.rowGlowBeat) || 0, 0, 1.5);
  var backdropAdapt = lyricSonicBackdropAdaptActive() ? lyricBackgroundAdaptStrengthValue() : 0;
  var readabilityBackdropColor = backdropAdapt > 0.001 ? lyricReadabilityColorForBrightBackdrop(backdropAdapt) : null;
  var activeRow = null;
  for (var i = 0; i < data.rowLayers.length; i++) {
    var row = data.rowLayers[i];
    var liveDelta = (row.virtualIndex != null && isFinite(Number(row.virtualIndex)) ? Number(row.virtualIndex) : i) - scrollOffset;
    var targetDelta = (row.virtualIndex != null && isFinite(Number(row.virtualIndex)) ? Number(row.virtualIndex) : i) - targetIndex;
    var abs = Math.abs(liveDelta);
    var targetAbs = Math.abs(targetDelta);
    var visibilityAbs = abs;
    var rowLineIndex = row.lineIndex != null && isFinite(Number(row.lineIndex)) ? Number(row.lineIndex) : null;
    var isActive = !!row.isPrimary && (rowLineIndex != null ? rowLineIndex === targetLineIndex : targetAbs < 0.015);
    row.delta = liveDelta;
    row.isActive = isActive;
    if (isActive) activeRow = row;
    var translationFocus = 0;
    var contextAlpha = row.isTranslation
      ? clampRange(row.targetAlpha * (1 - Math.max(0, targetAbs - 0.65) * 0.12), 0.08, 0.62)
      : clampRange(row.targetAlpha * (1 - Math.max(0, targetAbs - 0.25) * 0.070), 0.16, 0.92);
    var parentIndex = null;
    var parentDistance = Infinity;
    var currentTranslation = false;
    var singleLineTranslationSwap = false;
    var rowWindowLineIndex = rowLineIndex;
    if (row.isTranslation) {
      parentIndex = row.parentIndex != null && isFinite(Number(row.parentIndex))
        ? Number(row.parentIndex)
        : (row.virtualIndex != null ? Number(row.virtualIndex) - lyricTranslationVisualGapValue() : targetLineIndex);
      rowWindowLineIndex = parentIndex;
      parentDistance = Math.abs(parentIndex - targetLineIndex);
      currentTranslation = parentDistance < 0.001;
      var parentFade = clampRange((0.82 - parentDistance) / 0.34, 0, 1);
      parentFade = parentFade * parentFade * (3 - 2 * parentFade);
      if (translationMode === 'dual') {
        var currentParent = Math.abs(parentIndex - targetLineIndex) < 0.001;
        var nextParent = Math.abs(parentIndex - (targetLineIndex + 1)) < 0.001;
        parentFade = currentParent ? 1 : (nextParent ? 0.56 : 0);
      }
      if (translationMode !== 'multi') {
        translationFocus = parentFade;
        contextAlpha = clampRange(currentTranslationOpacity * parentFade, 0, currentTranslationOpacity);
      } else {
        translationFocus = parentFade;
        var contextTranslationAlpha = clampRange(row.targetAlpha * (1 - Math.max(0, parentDistance - 0.35) * 0.16), 0.08, 0.58);
        contextAlpha = clampRange(
          contextTranslationAlpha * (1 - parentFade) + currentTranslationOpacity * parentFade,
          0.08,
          Math.max(0.58, currentTranslationOpacity)
        );
      }
      if (data.usesTrack && parentIndex != null && isFinite(Number(parentIndex))) {
        var parentVirtualForVisibility = lyricPrimaryVirtualIndex(parentIndex);
        visibilityAbs = Math.abs(parentVirtualForVisibility - scrollOffset);
      } else if (currentTranslation || row.parentRole === 'current') {
        visibilityAbs = 0;
      }
      singleLineTranslationSwap = singleLineStaticSwap && (currentTranslation || row.parentRole === 'current');
    }
    var lineWindowAllowed = lyricLineAllowedForDisplayMode(rowWindowLineIndex, targetLineIndex, displayMode);
    if (!lineWindowAllowed) {
      contextAlpha = 0;
      translationFocus = 0;
    }
    var motionAnchor = isActive || currentTranslation;
    var rowIntro = motionAnchor ? 1 : contextIntro;
    var visibleRadius = Math.max(0.85, Number(data.trackVisibleRadius) || 3);
    var visibleFade = lineWindowAllowed ? (motionAnchor ? 1 : clampRange((visibleRadius + 1.10 - visibilityAbs) / 1.10, 0, 1)) : 0;
    visibleFade = visibleFade * visibleFade * (3 - 2 * visibleFade);
    var target = opacity * (isActive ? 1 : contextAlpha) * rowIntro * visibleFade;
    var depthFade = motionAnchor ? 1 : clampRange(1 - visibilityAbs * 0.055, 0.54, 1) * visibleFade;
    var yTarget = -liveDelta * lineStepWorld + (motionAnchor ? 0 : rowDrift * clampRange(0.70 + abs * 0.10, 0.65, 1.20));
    if (row.isTranslation) {
      yTarget = singleLineTranslationSwap && isFinite(Number(row.baseY))
        ? Number(row.baseY)
        : lyricTranslationAnchoredY(row, i, targetIndex, lineStepWorld, translationLineStepWorld, scrollOffset, rowDrift, currentTranslation, !!data.usesTrack);
    }
    var zBase = 0.055 - Math.pow(Math.min(5.5, visibilityAbs), 1.06) * 0.145;
    var zTarget = zBase - (motionAnchor ? 0 : Math.abs(rowDrift) * 0.18) + (row.isTranslation ? translationFocus * 0.065 : 0);
    var baseScale = clampRange(1 - Math.min(5.5, visibilityAbs) * 0.026, 0.84, 1.02);
    if (row.isTranslation) baseScale *= clampRange(Number(row.fontScale) || 1, 0.72, 1.34);
    if (singleLineTranslationSwap) {
      if (isFinite(Number(row.baseZ))) zTarget = Number(row.baseZ);
      if (isFinite(Number(row.baseScale))) baseScale = Number(row.baseScale);
    } else if (row.isTranslation) {
      baseScale *= 1.00 + translationFocus * 0.16;
    }
    var scaleTarget = baseScale * (motionAnchor || !verticalFloatOn ? 1 : (1 + Math.sin(t * 0.68 + seed + i * 0.71) * (style === 'float' ? 0.012 : 0.004)));
    var translationGlowFocus = row.isTranslation ? translationFocus : 0;
    if (row.mesh) {
      row.mesh.position.x += ((isActive ? jitterX : (currentTranslation ? jitterX * 0.82 : jitterX * 0.28)) - row.mesh.position.x) * (opts.glitchPulse ? 0.48 : 0.13);
      row.mesh.position.y += (yTarget + (verticalFloatOn ? (isActive ? jitterY : (currentTranslation ? jitterY * 0.78 : jitterY * 0.24)) : 0) - row.mesh.position.y) * ease;
      row.mesh.position.z += (zTarget - row.mesh.position.z) * ease;
      row.mesh.scale.setScalar(row.mesh.scale.x + (scaleTarget - row.mesh.scale.x) * ease);
      row.mesh.renderOrder = isActive ? (renderBase + 0.40) : (row.isTranslation ? (renderBase + 0.05 + (currentTranslation ? 0.34 : translationFocus * 0.30)) : (renderBase - 0.40 - Math.min(5.5, abs) * 0.015));
    }
    if (row.mat && row.mat.uniforms) {
      if (row.mat.uniforms.uOpacity) row.mat.uniforms.uOpacity.value += (target * depthFade - row.mat.uniforms.uOpacity.value) * ease;
      if (row.mat.uniforms.uProgress) row.mat.uniforms.uProgress.value = isActive ? shownProgress : 0;
      if (row.mat.uniforms.uActiveMix) {
        var activeMixTarget = isActive ? 1 : 0;
        row.mat.uniforms.uActiveMix.value += (activeMixTarget - row.mat.uniforms.uActiveMix.value) * (isActive ? 0.34 : 0.62);
        if (!isActive && row.mat.uniforms.uActiveMix.value < 0.015) row.mat.uniforms.uActiveMix.value = 0;
      }
      if (row.mat.uniforms.uSolar && !isActive) {
        row.mat.uniforms.uSolar.value += (0 - row.mat.uniforms.uSolar.value) * 0.48;
        if (row.mat.uniforms.uSolar.value < 0.003) row.mat.uniforms.uSolar.value = 0;
      }
      if (row.mat.uniforms.uGlitchBurst && opts.glitchPulse) row.mat.uniforms.uGlitchBurst.value = isActive ? opts.glitchPulse : opts.glitchPulse * 0.35;
    } else if (row.mat) {
      row.mat.opacity += (target * depthFade - row.mat.opacity) * ease;
    }
    if (row.readability) {
      row.readability.position.x += ((isActive ? jitterX * 0.46 : (currentTranslation ? jitterX * 0.40 : jitterX * 0.16)) - row.readability.position.x) * (opts.glitchPulse ? 0.42 : 0.12);
      row.readability.position.y += (yTarget + (verticalFloatOn ? (isActive ? jitterY * 0.40 : (currentTranslation ? jitterY * 0.34 : jitterY * 0.12)) : 0) - row.readability.position.y) * ease;
      row.readability.position.z += (zTarget - 0.012 - row.readability.position.z) * ease;
      row.readability.scale.setScalar(row.readability.scale.x + (scaleTarget - row.readability.scale.x) * ease);
      row.readability.renderOrder = row.mesh ? row.mesh.renderOrder - 0.04 : (row.isTranslation ? renderBase : renderBase - 0.45);
    }
    if (row.readabilityMat) {
      var readabilityMix = row.isTranslation ? (0.46 + translationFocus * 0.18) : (isActive ? 0.74 : 0.52);
      if (readabilityBackdropColor) setLyricTextureMaterialColor(row.readabilityMat, readabilityBackdropColor);
      else if (lyricReadabilityLightColor) setLyricTextureMaterialColor(row.readabilityMat, lyricReadabilityLightColor);
      var readabilityBoost = 1 + backdropAdapt * (motionAnchor ? (row.isTranslation ? 0.62 : 0.86) : 0.46);
      var readabilityOpacity = getLyricTextureMaterialOpacity(row.readabilityMat);
      var readabilityGoal = Math.min(1, target * readability * readabilityMix * readabilityBoost * depthFade * lyricReadabilityBoost());   // 自定义背景加实背衬
      setLyricTextureMaterialOpacity(row.readabilityMat, readabilityOpacity + (readabilityGoal - readabilityOpacity) * ease);
    }
    if (row.glow) {
      var glowJitterX = isActive ? jitterX : (currentTranslation ? jitterX * 0.72 : (translationGlowFocus > 0.001 ? jitterX * 0.34 * translationGlowFocus : 0));
      var glowJitterY = verticalFloatOn ? (isActive ? jitterY * 0.92 : (currentTranslation ? jitterY * 0.64 : (translationGlowFocus > 0.001 ? jitterY * 0.30 * translationGlowFocus : 0))) : 0;
      var glowEase = motionAnchor ? Math.max(ease, 0.46) : Math.max(ease, 0.22);
      var glowTargetX = row.mesh ? row.mesh.position.x : glowJitterX;
      var glowTargetY = row.mesh ? row.mesh.position.y : (yTarget + glowJitterY);
      var glowTargetZ = row.mesh ? (row.mesh.position.z - 0.030) : (zTarget - 0.030);
      var glowTargetScale = row.mesh ? row.mesh.scale.x : scaleTarget;
      var glowLockedToText = !!row.mesh && (isActive || currentTranslation || translationGlowFocus > 0.001);
      if (glowLockedToText) {
        row.glow.position.set(glowTargetX, glowTargetY, glowTargetZ);
        row.glow.scale.setScalar(glowTargetScale);
      } else {
        row.glow.position.x += (glowTargetX - row.glow.position.x) * (opts.glitchPulse ? 0.52 : Math.max(glowEase, 0.26));
        row.glow.position.y += (glowTargetY - row.glow.position.y) * glowEase;
        row.glow.position.z += (glowTargetZ - row.glow.position.z) * glowEase;
        row.glow.scale.setScalar(row.glow.scale.x + (glowTargetScale - row.glow.scale.x) * glowEase);
      }
      row.glow.renderOrder = row.isTranslation ? (renderBase - 0.02) : (renderBase - 0.52);
    }
    if (row.glowMat) {
      var glowOpacityTarget = isActive
        ? target * rowGlow * (1 + rowGlowBeat * 0.46) * depthFade
        : (row.isTranslation ? target * rowGlow * (currentTranslation ? (0.46 + rowGlowBeat * 0.08) : (0.30 + rowGlowBeat * 0.06) * translationGlowFocus) * depthFade : 0);
      if (backdropAdapt > 0.001) glowOpacityTarget *= (1 - backdropAdapt * 0.30);
      var glowOpacity = getLyricTextureMaterialOpacity(row.glowMat);
      var nextGlowOpacity = glowOpacity + (glowOpacityTarget - glowOpacity) * (glowOpacityTarget > glowOpacity ? 0.20 : 0.34);
      if (!isActive && nextGlowOpacity < 0.004) nextGlowOpacity = 0;
      setLyricTextureMaterialOpacity(row.glowMat, nextGlowOpacity);
    }
  }
  if (activeRow && activeRow.mat && activeRow.mat.uniforms) {
    data.textMat = activeRow.mat;
    data.activeRowMesh = activeRow.mesh;
  }
}
