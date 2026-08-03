// 歌词栅格 LRU 缓存:同文本 + 同「影响像素的样式」→ 复用已画好的 canvas。
// 贵的是 fillText/描边/阴影,不是纹理上传;故缓存 canvas 源,每次命中新建 THREE.CanvasTexture 包裹同一 canvas。
// 多纹理共享同一 canvas 安全:建纹理后无任何代码回画这些 canvas;dispose 只释放 THREE.Texture 的 GPU 侧,不动 canvas 像素。
// 颜色由材质着色(canvas 为白字透明底),故调色板不进键、不触发失效。
var lyricRasterCache = new Map();
var LYRIC_RASTER_CACHE_LIMIT = 80;
var lyricRasterCacheStyleKey = null;
// 只含「影响像素」的全局样式(字体族/字重/字距/行高/上下文铺展/边缘淡出/翻译排版),不含调色板。
function lyricRasterStyleKey() {
  var customSig = '';
  if (typeof customLyricFonts !== 'undefined' && Array.isArray(customLyricFonts)) {
    for (var i = 0; i < customLyricFonts.length; i++) {
      var rec = customLyricFonts[i];
      if (rec) customSig += rec.id + ':' + (rec.loaded ? 1 : 0) + ';';
    }
  }
  return [
    typeof fx !== 'undefined' && fx ? (fx.lyricFont || '') : '',
    typeof lyricFontWeightValue === 'function' ? lyricFontWeightValue() : '',
    typeof fx !== 'undefined' && fx ? (fx.lyricLetterSpacing == null ? '' : fx.lyricLetterSpacing) : '',
    typeof lyricLineHeightFactor === 'function' ? Math.round(lyricLineHeightFactor() * 1000) : '',
    typeof lyricContextSpreadValue === 'function' ? Math.round(lyricContextSpreadValue() * 1000) : '',
    typeof lyricEdgeFadeValue === 'function' ? Math.round(lyricEdgeFadeValue() * 1000) : '',
    typeof lyricTranslationScaleValue === 'function' ? Math.round(lyricTranslationScaleValue() * 1000) : '',
    typeof lyricTranslationGapValue === 'function' ? Math.round(lyricTranslationGapValue() * 1000) : '',
    customSig
  ].join('|');
}
// 样式设置变更后重建的清空钩子;样式键变了就整表清空(存一份上次样式键对比,别每次清)。
function clearLyricRasterCache() {
  if (lyricRasterCache && typeof lyricRasterCache.clear === 'function') lyricRasterCache.clear();
}
function lyricRasterEnsureFresh() {
  var key = lyricRasterStyleKey();
  if (key !== lyricRasterCacheStyleKey) {
    lyricRasterCacheStyleKey = key;
    clearLyricRasterCache();
  }
}
function lyricRasterCacheGet(key) {
  lyricRasterEnsureFresh();
  var hit = lyricRasterCache.get(key);
  if (!hit) return null;
  lyricRasterCache.delete(key); // 刷新热度:删了再放回,成为最新
  lyricRasterCache.set(key, hit);
  return hit;
}
function lyricRasterCacheSet(key, canvas, meta) {
  if (!key || !canvas) return;
  lyricRasterEnsureFresh();
  if (lyricRasterCache.has(key)) lyricRasterCache.delete(key);
  lyricRasterCache.set(key, { canvas: canvas, meta: meta || {} });
  while (lyricRasterCache.size > LYRIC_RASTER_CACHE_LIMIT) {
    var oldest = lyricRasterCache.keys().next().value; // Map 迭代序 = 插入序,首个即最旧
    if (oldest === undefined) break;
    lyricRasterCache.delete(oldest);
  }
}
function lyricCanvasTexture(canvas, withAnisotropy) {
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  if (withAnisotropy && typeof renderer !== 'undefined' && renderer && renderer.capabilities) {
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
  }
  return tex;
}
// 把 entries 里「影响像素」的字段序列化进键(文本/角色/透明度/缩放/字重/行偏移/翻译行/父角色)。
function lyricRasterEntriesKey(entries) {
  if (!entries || !entries.length) return '0';
  var rows = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i] || {};
    rows.push([
      e.text == null ? '' : String(e.text),
      e.role || '',
      Math.round((e.alpha == null ? 1 : Number(e.alpha)) * 1000),
      Math.round((e.scale == null ? 1 : Number(e.scale)) * 1000),
      e.weight == null ? '' : Math.round(Number(e.weight)),
      Math.round((typeof lyricEntryLineOffset === 'function' ? lyricEntryLineOffset(e) : 0) * 1000),
      e.translationLine ? 1 : 0,
      e.parentRole || ''
    ]);
  }
  return JSON.stringify(rows);
}
// 由 mask 形状(尺寸/字号/行高/横缩/激活行/基线/上下文层 + entries + lines)构键,供 readability 复用。
function lyricMaskShapeKey(mask) {
  mask = mask || {};
  return [
    Math.round(Number(mask.width) || 0),
    Math.round(Number(mask.height) || 0),
    Math.round((Number(mask.fontSize) || 0) * 100),
    Math.round((Number(mask.lineHeight) || 0) * 100),
    Math.round((Number(mask.fitScaleX) || 1) * 1000),
    Number(mask.activeLine) || 0,
    isFinite(Number(mask.lineY0)) ? Math.round(Number(mask.lineY0) * 100) : '',
    mask.contextLayer ? 1 : 0,
    lyricRasterEntriesKey(mask.entries),
    Array.isArray(mask.lines) ? JSON.stringify(mask.lines) : ''
  ].join('|');
}

function builtinLyricFontKeyPattern() {
  return /^(sans|hei|song|bold-song|stone-song|kai-song|serif-en|gothic|editorial|humanist|round|mono|display)$/;
}
function customLyricFontKey(id) {
  id = String(id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  return id ? ('custom:' + id) : '';
}
function customLyricFontIdFromKey(key) {
  var match = /^custom:([a-z0-9_-]{1,32})$/i.exec(String(key || ''));
  return match ? match[1] : '';
}
function customLyricFontRecordForKey(key) {
  var id = customLyricFontIdFromKey(key);
  if (!id || !Array.isArray(customLyricFonts)) return null;
  for (var i = 0; i < customLyricFonts.length; i++) {
    if (customLyricFonts[i] && customLyricFonts[i].id === id) return customLyricFonts[i];
  }
  return null;
}
function normalizeCustomLyricFontName(name) {
  name = String(name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (name || '自定义字体').slice(0, 18);
}
function normalizeCustomLyricFontRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var id = String(raw.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  var dataUrl = String(raw.dataUrl || '');
  if (!id || !/^data:(font\/(ttf|otf|woff2?|sfnt)|application\/(font-woff|x-font-ttf|x-font-otf|octet-stream)|application\/vnd\.ms-fontobject);base64,/i.test(dataUrl)) return null;
  return {
    id: id,
    name: normalizeCustomLyricFontName(raw.name),
    family: String(raw.family || ('MineradioCustomLyricFont-' + id)).replace(/["\\]/g, '').slice(0, 72) || ('MineradioCustomLyricFont-' + id),
    dataUrl: dataUrl,
    size: Math.max(0, Number(raw.size) || 0),
    savedAt: Math.max(0, Number(raw.savedAt) || Date.now())
  };
}
function readCustomLyricFonts() {
  try {
    var raw = JSON.parse(localStorage.getItem(CUSTOM_LYRIC_FONT_STORE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeCustomLyricFontRecord).filter(Boolean).slice(0, CUSTOM_LYRIC_FONT_MAX_COUNT);
  } catch (e) {
    return [];
  }
}
function saveCustomLyricFonts() {
  try {
    localStorage.setItem(CUSTOM_LYRIC_FONT_STORE_KEY, JSON.stringify(customLyricFonts || []));
    return true;
  } catch (e) {
    console.warn('[LyricFont] save failed', e);
    return false;
  }
}
function quotedCssFontFamily(name) {
  return '"' + String(name || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
function registerCustomLyricFont(record) {
  var source = record;
  record = normalizeCustomLyricFontRecord(record);
  if (!record || typeof FontFace !== 'function' || !document.fonts) return Promise.resolve(false);
  if (source && source.loaded && source.id === record.id) return Promise.resolve(true);
  try {
    var face = new FontFace(record.family, 'url("' + record.dataUrl + '")');
    return face.load().then(function (loadedFace) {
      document.fonts.add(loadedFace);
      record.loaded = true;
      if (source && source.id === record.id) source.loaded = true;
      return true;
    }).catch(function (err) {
      console.warn('[LyricFont] load failed', err);
      return false;
    });
  } catch (e) {
    console.warn('[LyricFont] register failed', e);
    return Promise.resolve(false);
  }
}
function registerSavedCustomLyricFonts() {
  if (!Array.isArray(customLyricFonts) || !customLyricFonts.length) return;
  customLyricFonts.forEach(function (record) { registerCustomLyricFont(record); });
}
function normalizeLyricFontKey(value) {
  value = String(value || 'sans');
  if (builtinLyricFontKeyPattern().test(value)) return value;
  if (customLyricFontRecordForKey(value)) return value;
  return 'sans';
}
function lyricFontStackForKey(key) {
  key = normalizeLyricFontKey(key);
  var customFont = customLyricFontRecordForKey(key);
  if (customFont) return quotedCssFontFamily(customFont.family) + ',"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
  if (key === 'hei') return '"Noto Sans SC","Microsoft YaHei",SimHei,"PingFang SC",sans-serif';
  if (key === 'song') return '"Noto Serif SC","Source Han Serif SC",SimSun,"Songti SC",serif';
  if (key === 'bold-song') return '"Source Han Serif SC Heavy","Source Han Serif SC","Noto Serif SC Black","Noto Serif SC","STZhongsong","SimSun",serif';
  if (key === 'stone-song') return '"FZYaSongS-B-GB","FZCuSong-B09S","Source Han Serif SC Heavy","Noto Serif SC Black","STZhongsong","SimSun",serif';
  if (key === 'kai-song') return '"Kaiti SC","STKaiti","KaiTi","Source Han Serif SC","Noto Serif SC",serif';
  if (key === 'serif-en') return 'Georgia,"Times New Roman","Noto Serif SC","Source Han Serif SC",serif';
  if (key === 'gothic') return '"UnifrakturCook","UnifrakturMaguntia","Old English Text MT","Blackletter","Cinzel Decorative","Noto Serif SC",serif';
  if (key === 'editorial') return '"Didot","Bodoni 72","Libre Baskerville",Georgia,"Noto Serif SC",serif';
  if (key === 'humanist') return '"Avenir Next","Segoe UI","Inter","Noto Sans SC","PingFang SC",sans-serif';
  if (key === 'round') return '"HarmonyOS Sans SC","Microsoft YaHei UI","PingFang SC","Noto Sans SC",sans-serif';
  if (key === 'mono') return '"JetBrains Mono",Consolas,"Noto Sans SC","Microsoft YaHei",monospace';
  if (key === 'display') return '"Alibaba PuHuiTi","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
  return 'Inter,"Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif';
}
function lyricFontWeightValue() {
  if (normalizeLyricFontKey(fx && fx.lyricFont) === 'stone-song') return 900;
  return Math.round(clampRange(Number(fx && fx.lyricWeight) || 900, 500, 900) / 50) * 50;
}
function lyricFontCss(fontSize, weight) {
  var w = weight == null ? lyricFontWeightValue() : Math.round(clampRange(Number(weight) || lyricFontWeightValue(), 500, 900) / 50) * 50;
  return w + ' ' + fontSize + 'px ' + lyricFontStackForKey(fx && fx.lyricFont);
}
function lyricLetterSpacingPx(fontSize) {
  return clampRange(Number(fx && fx.lyricLetterSpacing) || 0, -0.04, 0.18) * Math.max(1, fontSize || 1);
}
function lyricLineHeightFactor() {
  return clampRange(Number(fx && fx.lyricLineHeight) || 1, 0.72, 1.80);
}
function measureTextWithLetterSpacing(ctx, text, spacing) {
  text = String(text || '');
  spacing = Number(spacing) || 0;
  if (!spacing || text.length < 2) return ctx.measureText(text).width;
  var chars = Array.from(text);
  var w = 0;
  for (var i = 0; i < chars.length; i++) {
    w += ctx.measureText(chars[i]).width;
    if (i < chars.length - 1) w += spacing;
  }
  return Math.max(1, w);
}
function lyricMeasureText(ctx, text, fontSize) {
  return measureTextWithLetterSpacing(ctx, text, lyricLetterSpacingPx(fontSize));
}
function lyricMeasureTextAtSize(ctx, text, fontSize, weight) {
  var prevFont = ctx.font;
  ctx.font = lyricFontCss(fontSize, weight);
  var width = lyricMeasureText(ctx, text, fontSize);
  ctx.font = prevFont;
  return width;
}
function drawTextWithLetterSpacing(ctx, text, x, y, spacing, stroke) {
  text = String(text || '');
  spacing = Number(spacing) || 0;
  if (!spacing || text.length < 2) {
    if (stroke) ctx.strokeText(text, x, y);
    else ctx.fillText(text, x, y);
    return;
  }
  var chars = Array.from(text);
  var align = ctx.textAlign || 'left';
  var width = measureTextWithLetterSpacing(ctx, text, spacing);
  var start = x;
  if (align === 'center') start = x - width / 2;
  else if (align === 'right' || align === 'end') start = x - width;
  ctx.textAlign = 'left';
  var cursor = start;
  for (var i = 0; i < chars.length; i++) {
    if (stroke) ctx.strokeText(chars[i], cursor, y);
    else ctx.fillText(chars[i], cursor, y);
    cursor += ctx.measureText(chars[i]).width + (i < chars.length - 1 ? spacing : 0);
  }
  ctx.textAlign = align;
}
function lyricFillText(ctx, text, x, y, fontSize) {
  drawTextWithLetterSpacing(ctx, text, x, y, lyricLetterSpacingPx(fontSize), false);
}
function lyricStrokeText(ctx, text, x, y, fontSize) {
  drawTextWithLetterSpacing(ctx, text, x, y, lyricLetterSpacingPx(fontSize), true);
}
function applyStonePrintTexture(ctx, W, H, fontSize) {
  if (normalizeLyricFontKey(fx && fx.lyricFont) !== 'stone-song') return;
  var size = clampRange(fontSize || 128, 42, 180);
  var bandTop = H * 0.10;
  var bandH = H * 0.80;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  var noiseW = 300, noiseH = 110;
  var noise = document.createElement('canvas');
  noise.width = noiseW; noise.height = noiseH;
  var nctx = noise.getContext('2d');
  var img = nctx.createImageData(noiseW, noiseH);
  for (var p = 0; p < noiseW * noiseH; p++) {
    var x0 = p % noiseW;
    var y0 = Math.floor(p / noiseW);
    var vein = Math.sin(x0 * 0.19 + y0 * 0.043) * 0.10 + Math.sin(y0 * 0.31) * 0.06;
    var r = Math.random() + vein;
    var a = 0;
    if (r > 0.82) a = 78 + Math.random() * 92;
    else if (r > 0.62) a = 22 + Math.random() * 54;
    else if (r > 0.48) a = 4 + Math.random() * 24;
    img.data[p * 4] = 255;
    img.data[p * 4 + 1] = 255;
    img.data[p * 4 + 2] = 255;
    img.data[p * 4 + 3] = a;
  }
  nctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.34;
  ctx.drawImage(noise, 0, bandTop, W, bandH);

  var chips = Math.round(size * 7.2);
  for (var i = 0; i < chips; i++) {
    var x = Math.random() * W;
    var y = bandTop + Math.random() * bandH;
    var w = 0.7 + Math.random() * (size * 0.052);
    var h = 0.45 + Math.random() * (size * 0.026);
    ctx.globalAlpha = 0.16 + Math.random() * 0.36;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.38);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  ctx.lineCap = 'round';
  for (var s = 0; s < 44; s++) {
    var sx = Math.random() * W;
    var sy = bandTop + Math.random() * bandH;
    ctx.globalAlpha = 0.09 + Math.random() * 0.16;
    ctx.lineWidth = 0.45 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 10 + Math.random() * 86, sy + (Math.random() - 0.5) * 4.8);
    ctx.stroke();
  }

  for (var c = 0; c < 26; c++) {
    var cx = Math.random() * W;
    var cy = bandTop + Math.random() * bandH;
    var radius = 1.8 + Math.random() * (size * 0.060);
    ctx.globalAlpha = 0.08 + Math.random() * 0.18;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * (0.7 + Math.random() * 1.4), radius * (0.25 + Math.random() * 0.55), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function hexToRgb(hex) {
  hex = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}
