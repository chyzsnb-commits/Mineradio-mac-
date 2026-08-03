function applyLyricVerticalEdgeFade(ctx, W, H, strength, activeLine, lineCount) {
  strength = clampRange(Number(strength) || 0, 0, 1);
  if (!strength || lineCount < 2) return;
  var topBand = clampRange(0.08 + strength * 0.16, 0.06, 0.26);
  var bottomBand = clampRange(0.08 + strength * 0.18, 0.06, 0.28);
  var midBoost = activeLine > 0 && activeLine < lineCount - 1 ? 0.018 * strength : 0;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  var fade = ctx.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(255,255,255,0)');
  fade.addColorStop(topBand * 0.45, 'rgba(255,255,255,' + (0.34 + strength * 0.20).toFixed(3) + ')');
  fade.addColorStop(topBand + midBoost, 'rgba(255,255,255,1)');
  fade.addColorStop(1 - bottomBand - midBoost, 'rgba(255,255,255,1)');
  fade.addColorStop(1 - bottomBand * 0.45, 'rgba(255,255,255,' + (0.34 + strength * 0.20).toFixed(3) + ')');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function lyricMaskResultFromMeta(meta, tex) {
  return {
    texture: tex,
    width: meta.width, height: meta.height, textWidth: meta.textWidth, activeTextWidth: meta.activeTextWidth,
    textHeight: meta.textHeight, fontSize: meta.fontSize, lineHeight: meta.lineHeight, lineY0: meta.lineY0,
    lineCount: meta.lineCount, lines: meta.lines, entries: meta.entries, activeLine: meta.activeLine,
    contextLayer: meta.contextLayer, activeLayer: meta.activeLayer, fitScaleX: meta.fitScaleX,
    textMin: meta.textMin, textMax: meta.textMax
  };
}

function makeLyricMask(input, layoutOverride) {
  layoutOverride = layoutOverride || {};
  var payload = normalizeStageLyricPayload(input);
  if (!payload) payload = { entries: [{ text: '', role: 'current', alpha: 1, scale: 1 }], activeLine: 0, text: '', combinedText: '' };
  var maskRasterKey = 'mask|'
    + (isFinite(Number(layoutOverride.fontSize)) ? Math.round(Number(layoutOverride.fontSize) * 100) : '') + '|'
    + (isFinite(Number(layoutOverride.lineHeight)) ? Math.round(Number(layoutOverride.lineHeight) * 100) : '') + '|'
    + (Number(payload.activeLine) || 0) + '|'
    + (payload.activeLayer ? 1 : 0) + '|'
    + (payload.contextLayer ? 1 : 0) + '|'
    + (typeof lyricRasterEntriesKey === 'function' ? lyricRasterEntriesKey(payload.entries) : '');
  if (typeof lyricRasterCacheGet === 'function') {
    var maskHit = lyricRasterCacheGet(maskRasterKey);
    if (maskHit) return lyricMaskResultFromMeta(maskHit.meta, lyricCanvasTexture(maskHit.canvas, true));
  }
  var canvas = document.createElement('canvas');
  var baseCanvasW = 2048;
  var rendererMaxTexture = renderer && renderer.capabilities && renderer.capabilities.maxTextureSize ? renderer.capabilities.maxTextureSize : 4096;
  var maxCanvasW = Math.max(baseCanvasW, Math.min(6144, rendererMaxTexture || 4096));
  var W = baseCanvasW;
  var entries = payload && payload.entries && payload.entries.length ? payload.entries : [{ text: '', role: 'current', alpha: 1, scale: 1 }];
  var desiredLines = Math.max(1, entries.length);
  var H = desiredLines > 9 ? 1344 : (desiredLines > 8 ? 1216 : (desiredLines > 7 ? 1088 : (desiredLines > 6 ? 960 : (desiredLines > 5 ? 832 : (desiredLines > 4 ? 704 : (desiredLines > 3 ? 608 : (desiredLines > 2 ? 512 : 384)))))));
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  var fitMaxWidth = baseCanvasW - 88;
  var maxWidth = fitMaxWidth;
  var drawMaxWidth = baseCanvasW - 48;
  var maxLines = Math.max(STAGE_LYRIC_MAX_LINES, entries.length);
  var lockedFontSize = Number(layoutOverride.fontSize);
  var fontSize = isFinite(lockedFontSize) && lockedFontSize > 0 ? clampRange(lockedFontSize, 42, 160) : 128;
  var lines = entries.map(function (entry) { return entry.text; });
  var activeLine = Math.max(0, Math.min(lines.length - 1, payload.activeLine || 0));
  var fitMeasureIndexes = [];
  for (var fi = 0; fi < entries.length; fi++) {
    var fitAlpha = entries[fi] && entries[fi].alpha == null ? 1 : Number(entries[fi] && entries[fi].alpha);
    if (payload.activeLayer) {
      if (fi === activeLine) fitMeasureIndexes.push(fi);
    } else if (!isFinite(fitAlpha) || fitAlpha > 0.001) {
      fitMeasureIndexes.push(fi);
    }
  }
  if (!fitMeasureIndexes.length) fitMeasureIndexes.push(activeLine);
  var widest = 1;
  if (!isFinite(lockedFontSize) || lockedFontSize <= 0) {
    var minFont = maxLines > 2 ? 46 : 42;
    for (; fontSize >= 42; fontSize -= 4) {
      ctx.font = lyricFontCss(fontSize);
      widest = 1;
      for (var li = 0; li < fitMeasureIndexes.length; li++) {
        var fitIndex = fitMeasureIndexes[li];
        var lineScale = entries[fitIndex] && entries[fitIndex].scale || 1;
        widest = Math.max(widest, lyricMeasureTextAtSize(ctx, lines[fitIndex], fontSize * lineScale, lyricEntryWeight(entries[fitIndex])));
      }
      var testLineHeight = fontSize * (lines.length > 1 ? 0.98 : 1.0) * lyricLineHeightFactor();
      var testBlockH = fontSize + (lines.length - 1) * testLineHeight;
      var widthOk = widest <= maxWidth;
      if ((widthOk && testBlockH <= H - 76) || fontSize <= minFont) break;
    }
  }
  ctx.font = lyricFontCss(fontSize);
  if (!lines.length) lines = [''];
  widest = 1;
  for (var mi = 0; mi < fitMeasureIndexes.length; mi++) {
    var measureIndex = fitMeasureIndexes[mi];
    widest = Math.max(widest, lyricMeasureTextAtSize(ctx, lines[measureIndex], fontSize * (entries[measureIndex] && entries[measureIndex].scale || 1), lyricEntryWeight(entries[measureIndex])));
  }
  var neededCanvasW = Math.ceil(Math.min(maxCanvasW, Math.max(baseCanvasW, widest + Math.max(220, fontSize * 2.2))));
  if (neededCanvasW !== W) {
    W = neededCanvasW;
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
  }
  drawMaxWidth = W - 48;
  ctx.font = lyricFontCss(fontSize);
  var width = Math.min(drawMaxWidth, widest);
  var fitScaleX = widest > drawMaxWidth ? Math.max(0.01, drawMaxWidth / widest) : 1;
  if (fitScaleX < 1) width = Math.min(drawMaxWidth, widest * fitScaleX);
  var lockedLineHeight = Number(layoutOverride.lineHeight);
  var lineHeight = isFinite(lockedLineHeight) && lockedLineHeight > 0
    ? lockedLineHeight
    : fontSize * (lines.length > 1 ? 0.98 : 1.0) * lyricLineHeightFactor() * (lines.length > 1 ? lyricContextSpreadValue() : 1);
  var activeEntry = entries[activeLine] || {};
  var activeTextWidth = Math.max(1, lyricMeasureTextAtSize(ctx, lines[activeLine] || '', fontSize * (activeEntry.scale || 1), lyricEntryWeight(activeEntry)));
  var activeWidth = Math.min(drawMaxWidth, activeTextWidth * fitScaleX);
  var blockH = fontSize + (lines.length - 1) * lineHeight;
  var activeBaseline = H / 2 + fontSize * 0.36;
  var y0 = activeBaseline - activeLine * lineHeight;
  var blockTop = y0 - fontSize * 0.84;
  var blockBottom = y0 + (lines.length - 1) * lineHeight + fontSize * 0.24;
  var padY = 22;
  if (blockTop < padY) y0 += padY - blockTop;
  if (blockBottom > H - padY) y0 -= blockBottom - (H - padY);
  var x = W / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  for (var di = 0; di < lines.length; di++) {
    var entry = entries[di] || {};
    var lineFontSize = fontSize * (entry.scale || 1);
    ctx.globalAlpha = entry.alpha == null ? 1 : entry.alpha;
    var lineY = y0 + di * lineHeight + lyricEntryLineOffset(entry) * lineHeight;
    ctx.font = lyricFontCss(lineFontSize, lyricEntryWeight(entry));
    if (fitScaleX < 1) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(fitScaleX, 1);
      lyricFillText(ctx, lines[di], 0, lineY, lineFontSize);
      ctx.restore();
    } else {
      lyricFillText(ctx, lines[di], x, lineY, lineFontSize);
    }
  }
  ctx.globalAlpha = 1;
  ctx.font = lyricFontCss(fontSize);
  applyStonePrintTexture(ctx, W, H, fontSize);
  applyLyricVerticalEdgeFade(ctx, W, H, lyricEdgeFadeValue() * (payload.contextLayer ? 1.15 : 0.74), activeLine, lines.length);
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
  var maskMeta = { width: W, height: H, textWidth: width, activeTextWidth: activeWidth, textHeight: blockH, fontSize: fontSize, lineHeight: lineHeight, lineY0: y0, lineCount: lines.length, lines: lines, entries: entries, activeLine: activeLine, contextLayer: payload.contextLayer, activeLayer: payload.activeLayer, fitScaleX: fitScaleX, textMin: (W / 2 - activeWidth / 2) / W, textMax: (W / 2 + activeWidth / 2) / W };
  if (typeof lyricRasterCacheSet === 'function') lyricRasterCacheSet(maskRasterKey, canvas, maskMeta);
  return lyricMaskResultFromMeta(maskMeta, tex);
}

function makeLyricReadabilityTexture(mask) {
  var readabilityRasterKey = 'readability|' + (typeof lyricMaskShapeKey === 'function' ? lyricMaskShapeKey(mask) : '');
  if (typeof lyricRasterCacheGet === 'function') {
    var readabilityHit = lyricRasterCacheGet(readabilityRasterKey);
    if (readabilityHit) return lyricCanvasTexture(readabilityHit.canvas, true);
  }
  var canvas = document.createElement('canvas');
  var W = mask && mask.width || 2048;
  var H = mask && mask.height || 384;
  var fontSize = mask && mask.fontSize || 128;
  var lines = mask && Array.isArray(mask.lines) && mask.lines.length ? mask.lines : [''];
  var entries = mask && Array.isArray(mask.entries) ? mask.entries : [];
  var lineHeight = mask && mask.lineHeight || fontSize * lyricLineHeightFactor();
  var fitScaleX = mask && mask.fitScaleX || 1;
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.font = lyricFontCss(fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 2;
  var activeLine = Math.max(0, Math.min(lines.length - 1, Number(mask && mask.activeLine) || 0));
  var blockH = fontSize + (lines.length - 1) * lineHeight;
  var hasLineY0 = mask && isFinite(Number(mask.lineY0));
  var y0 = hasLineY0 ? Number(mask.lineY0) : (H / 2 + fontSize * 0.36 - activeLine * lineHeight);
  function strokeLines(dx, dy) {
    for (var i = 0; i < lines.length; i++) {
      var entry = entries[i] || {};
      var lineFontSize = fontSize * (entry.scale || 1);
      var y = y0 + i * lineHeight + lyricEntryLineOffset(entry) * lineHeight + (dy || 0);
      var prevAlpha = ctx.globalAlpha;
      var prevLineWidth = ctx.lineWidth;
      var alpha = entry.alpha == null ? 1 : clampRange(Number(entry.alpha), entry.translationLine ? 0.10 : 0.22, 1);
      ctx.font = lyricFontCss(lineFontSize, lyricEntryWeight(entry));
      ctx.globalAlpha = prevAlpha * alpha * (entry.translationLine ? 0.62 : 1);
      if (entry.translationLine) ctx.lineWidth = Math.max(1.8, prevLineWidth * 0.52);
      if (fitScaleX < 1) {
        ctx.save();
        ctx.translate(W / 2 + (dx || 0), 0);
        ctx.scale(fitScaleX, 1);
        lyricStrokeText(ctx, lines[i], 0, y, lineFontSize);
        ctx.restore();
      } else {
        lyricStrokeText(ctx, lines[i], W / 2 + (dx || 0), y, lineFontSize);
      }
      ctx.lineWidth = prevLineWidth;
      ctx.globalAlpha = prevAlpha;
    }
  }

  // Black/white readability layer: text-shaped only, no rectangular backing.
  ctx.save();
  ctx.filter = 'blur(14px)';
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = Math.max(18, fontSize * 0.16);
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  strokeLines(0, fontSize * 0.018);
  ctx.restore();

  ctx.save();
  ctx.filter = 'blur(5px)';
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = Math.max(9, fontSize * 0.075);
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  strokeLines(0, fontSize * 0.012);
  ctx.restore();

  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = Math.max(9, fontSize * 0.070);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  strokeLines(0, 0);
  ctx.restore();

  ctx.save();
  ctx.filter = 'blur(1.2px)';
  ctx.globalAlpha = 0.26;
  ctx.lineWidth = Math.max(3.2, fontSize * 0.030);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  strokeLines(0, 0);
  ctx.restore();

  applyLyricVerticalEdgeFade(ctx, W, H, lyricEdgeFadeValue() * (mask && mask.contextLayer ? 1.08 : 0.62), activeLine, lines.length);

  if (typeof lyricRasterCacheSet === 'function') lyricRasterCacheSet(readabilityRasterKey, canvas, {});
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
  return tex;
}

function makeLyricGlowTexture(text, fontSize, textWidth, lines, lineHeight, fitScaleX, entries, activeLine, sourceMask) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  var drawLines = Array.isArray(lines) && lines.length ? lines : [text];
  entries = Array.isArray(entries) ? entries : [];
  var useMaskFrame = !!(sourceMask && isFinite(Number(sourceMask.width)) && isFinite(Number(sourceMask.height)));
  var glowRasterKey = 'glow|'
    + Math.round((Number(fontSize) || 0) * 100) + '|'
    + Math.round((Number(textWidth) || 0) * 100) + '|'
    + Math.round((Number(lineHeight) || 0) * 100) + '|'
    + Math.round((Number(fitScaleX) || 1) * 1000) + '|'
    + (Number(activeLine) || 0) + '|'
    + JSON.stringify(drawLines) + '|'
    + (typeof lyricRasterEntriesKey === 'function' ? lyricRasterEntriesKey(entries) : '') + '|'
    + (useMaskFrame
        ? ('M' + Math.round(Number(sourceMask.width)) + 'x' + Math.round(Number(sourceMask.height))
           + 'y' + (isFinite(Number(sourceMask.lineY0)) ? Math.round(Number(sourceMask.lineY0) * 100) : '')
           + 'w' + Math.round(Number(sourceMask.activeTextWidth || sourceMask.textWidth || 0) * 100))
        : 'nomask');
  if (typeof lyricRasterCacheGet === 'function') {
    var glowHit = lyricRasterCacheGet(glowRasterKey);
    if (glowHit) {
      var glowHitTex = lyricCanvasTexture(glowHit.canvas, false);
      glowHitTex.userData = { width: glowHit.meta.width, height: glowHit.meta.height, textWidth: glowHit.meta.textWidth, matchMask: glowHit.meta.matchMask, lineY0: glowHit.meta.lineY0 };
      return glowHitTex;
    }
  }
  var canvas = document.createElement('canvas');
  var measureCanvas = document.createElement('canvas');
  var measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = lyricFontCss(fontSize);
  fitScaleX = fitScaleX || 1;
  var measuredWidth = Math.max(1, textWidth || lyricMeasureTextAtSize(measureCtx, text, fontSize) * fitScaleX);
  for (var li = 0; li < drawLines.length; li++) {
    var lineFontSize = fontSize * ((entries[li] && entries[li].scale) || 1);
    measuredWidth = Math.max(measuredWidth, lyricMeasureTextAtSize(measureCtx, drawLines[li], lineFontSize, lyricEntryWeight(entries[li])) * fitScaleX);
  }
  var padX = Math.max(160, fontSize * 1.45);
  var padY = Math.max(86, fontSize * 0.78);
  var lh = lineHeight || fontSize * 1.04;
  var blockH = fontSize + (drawLines.length - 1) * lh;
  activeLine = Math.max(0, Math.min(drawLines.length - 1, Number(activeLine) || 0));
  var W = useMaskFrame ? Math.round(sourceMask.width) : Math.ceil(measuredWidth + padX * 2);
  var H = useMaskFrame ? Math.round(sourceMask.height) : Math.ceil(blockH + padY * 2);
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = lyricFontCss(fontSize);
  var y0 = useMaskFrame && isFinite(Number(sourceMask.lineY0)) ? Number(sourceMask.lineY0) : (H / 2 + fontSize * 0.36 - activeLine * lh);
  function drawGlowText(dx, dy) {
    for (var i = 0; i < drawLines.length; i++) {
      var entry = entries[i] || {};
      var lineFontSize = fontSize * (entry.scale || 1);
      var alpha = entry.alpha == null ? 1 : clampRange(Number(entry.alpha), entry.translationLine ? 0.08 : 0.22, 1);
      var y = y0 + i * lh + lyricEntryLineOffset(entry) * lh + (dy || 0);
      var prevAlpha = ctx.globalAlpha;
      var prevLineWidth = ctx.lineWidth;
      var glowFactor = entry.translationLine ? 0.34 : 1;
      ctx.font = lyricFontCss(lineFontSize, lyricEntryWeight(entry));
      ctx.globalAlpha = prevAlpha * alpha * glowFactor;
      if (entry.translationLine) ctx.lineWidth = Math.max(1.8, prevLineWidth * 0.48);
      if (fitScaleX < 1) {
        ctx.save();
        ctx.translate(W / 2 + (dx || 0), 0);
        ctx.scale(fitScaleX, 1);
        if (ctx.lineWidth > 0) lyricStrokeText(ctx, drawLines[i], 0, y, lineFontSize);
        lyricFillText(ctx, drawLines[i], 0, y, lineFontSize);
        ctx.restore();
      } else {
        if (ctx.lineWidth > 0) lyricStrokeText(ctx, drawLines[i], W / 2 + (dx || 0), y, lineFontSize);
        lyricFillText(ctx, drawLines[i], W / 2 + (dx || 0), y, lineFontSize);
      }
      ctx.lineWidth = prevLineWidth;
      ctx.globalAlpha = prevAlpha;
    }
  }
  ctx.save();
  ctx.filter = 'blur(14px)';
  ctx.globalAlpha = 0.46;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(10, fontSize * 0.10);
  ctx.strokeStyle = '#fff';
  drawGlowText(0, 0);
  ctx.restore();
  ctx.save();
  ctx.filter = 'blur(34px)';
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(18, fontSize * 0.18);
  ctx.strokeStyle = '#fff';
  drawGlowText(0, 0);
  ctx.restore();
  ctx.save();
  ctx.filter = 'blur(78px)';
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(28, fontSize * 0.26);
  ctx.strokeStyle = '#fff';
  drawGlowText(0, 0);
  ctx.restore();
  ctx.save();
  ctx.filter = 'blur(116px)';
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(42, fontSize * 0.40);
  ctx.strokeStyle = '#fff';
  drawGlowText(0, 0);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(8px)';
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = '#fff';
  for (var ri = 0; ri < 8; ri++) {
    var ang = ri / 8 * Math.PI * 2;
    drawGlowText(Math.cos(ang) * 7, Math.sin(ang) * 4);
  }
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  var xMask = ctx.createLinearGradient(0, 0, W, 0);
  xMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  xMask.addColorStop(0.10, 'rgba(255,255,255,1)');
  xMask.addColorStop(0.90, 'rgba(255,255,255,1)');
  xMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = xMask;
  ctx.fillRect(0, 0, W, H);
  var yMask = ctx.createLinearGradient(0, 0, 0, H);
  yMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  yMask.addColorStop(0.16, 'rgba(255,255,255,1)');
  yMask.addColorStop(0.84, 'rgba(255,255,255,1)');
  yMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = yMask;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.userData = { width: W, height: H, textWidth: useMaskFrame ? (sourceMask.activeTextWidth || sourceMask.textWidth || measuredWidth) : measuredWidth, matchMask: useMaskFrame, lineY0: y0 };
  if (typeof lyricRasterCacheSet === 'function') lyricRasterCacheSet(glowRasterKey, canvas, { width: tex.userData.width, height: tex.userData.height, textWidth: tex.userData.textWidth, matchMask: tex.userData.matchMask, lineY0: tex.userData.lineY0 });
  return tex;
}

