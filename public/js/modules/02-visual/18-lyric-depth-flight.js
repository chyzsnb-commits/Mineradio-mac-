// ============================================================
//  词境穿行：相机空间里的景深歌词、封面锚点与低密度星尘
//  - 不创建自己的 RAF / analyser；只消费主循环已有的歌词、封面和音频包络
//  - 五张歌词纹理平面 + 封面 + 星尘 + 暗底，共约八个 draw call
//  - 景深用单材质九采样柔化模拟，避免昂贵的全屏 DOF 后处理
// ============================================================
var LYRIC_DEPTH_PRESET_INDEX = 11;
var LYRIC_DEPTH_CARD_COUNT = 5;
var LYRIC_DEPTH_STAR_MAX = 180;
var LYRIC_DEPTH_TEXT_WIDTH = 1536;
var LYRIC_DEPTH_TEXT_HEIGHT = 384;
var LYRIC_DEPTH_INTERACTION_PIVOT_Z = -6.0;

var LYRIC_DEPTH_LAYOUTS = [
  { motion: 'side', current: [0.82, 0.20, -4.92, 1.02, -0.02, -0.055, 0.010], cover: [-2.05, 0.02, -6.35, 2.56, 0.025, 0.105, -0.018] },
  { motion: 'side', current: [-0.88, 0.25, -5.05, 1.00, 0.018, 0.060, -0.012], cover: [2.08, -0.08, -6.55, 2.45, -0.030, -0.115, 0.016] },
  { motion: 'depth', current: [0.02, -0.16, -4.72, 1.08, -0.010, 0.000, 0.000], cover: [-0.08, 0.22, -7.72, 2.58, 0.018, 0.055, -0.010] },
  { motion: 'rise', current: [-0.28, 0.38, -5.18, 0.98, 0.022, 0.038, -0.015], cover: [2.18, 0.18, -7.15, 2.20, -0.022, -0.105, 0.022] },
  { motion: 'diagonal', current: [0.68, -0.18, -5.00, 1.04, -0.018, -0.045, 0.014], cover: [-2.46, 0.42, -8.10, 1.92, 0.032, 0.125, -0.024] },
  { motion: 'orbit', current: [-0.62, -0.22, -4.82, 1.06, 0.012, 0.052, -0.010], cover: [1.84, 0.48, -5.96, 2.66, -0.036, -0.102, 0.018] },
  { motion: 'sweep', current: [1.18, 0.36, -5.34, 0.92, -0.010, -0.082, 0.026], cover: [-1.62, -0.42, -6.92, 2.34, 0.044, 0.086, -0.034] },
  { motion: 'float', current: [-1.22, -0.36, -5.22, 0.96, 0.028, 0.088, -0.024], cover: [1.50, 0.54, -7.54, 2.16, -0.038, -0.074, 0.032] },
  { motion: 'diagonal', current: [0.38, 0.56, -4.86, 1.02, 0.034, -0.034, -0.026], cover: [-2.18, -0.38, -6.10, 2.72, 0.018, 0.132, 0.018] },
  { motion: 'orbit', current: [-0.38, 0.52, -5.00, 1.00, -0.030, 0.038, 0.024], cover: [2.24, -0.32, -7.92, 1.96, -0.018, -0.138, -0.020] },
  { motion: 'burst', current: [0.04, -0.08, -4.64, 1.10, 0.000, -0.012, 0.000], cover: [-0.12, 0.10, -6.02, 2.82, 0.008, 0.028, -0.006] },
  { motion: 'rise', current: [-0.94, 0.08, -5.12, 1.04, 0.016, 0.068, -0.018], cover: [1.92, 0.26, -6.74, 2.38, -0.026, -0.092, 0.014] }
];

var lyricDepthState = {
  root: null,
  interactionPivot: null,
  contentGroup: null,
  backdrop: null,
  stars: null,
  cover: null,
  cards: [],
  cardGeometry: null,
  active: false,
  stageHidden: false,
  currentIndex: -999,
  patternIndex: 0,
  lyricsRef: null,
  coverReady: false,
  lastLineChangeAt: 0,
  starCount: 0,
  deferredCenterIndex: null,
  seekPreviewIndex: null,
  seekPreviewKey: '',
  lastSeekTextureAt: 0,
  transitionProgress: 1,
  transitionDuration: 0.82,
  pointerRaycaster: null,
  pointerNdc: null,
  hover: {
    active: false,
    targetScale: 1,
    targetRotX: 0,
    targetRotY: 0,
    scale: 1,
    rotX: 0,
    rotY: 0,
    scaleVelocity: 0,
    rotXVelocity: 0,
    rotYVelocity: 0
  },
  trackTransition: {
    phase: 'idle',
    token: 0,
    elapsed: 0,
    audioReady: false,
    coverReady: false,
    lyricsReady: false,
    hadCover: false,
    pendingAdopt: false,
    variant: 0,
    frozenProgress: 1
  }
};

function lyricDepthFlightActive() {
  return !!(fx && Number(fx.preset) === LYRIC_DEPTH_PRESET_INDEX);
}

function lyricDepthFlightLyricsVisible() {
  return lyricDepthFlightActive() && !!(fx && fx.particleLyrics !== false);
}

// 词境穿行和音域回响一样，视觉舞台不叠加右侧 3D 歌单卡；
// 底栏歌单按钮继续沿用控制台「歌单」页，不改变用户的歌单数据与排序。
function lyricDepthSuppressesThreeDimensionalShelf() {
  return lyricDepthFlightActive();
}

function lyricDepthDockPlaylist(dock) {
  var fxPanel = document.getElementById('fx-panel');
  if (!fxPanel || typeof _dockVisualPlaylist !== 'function') return;
  if (dock) {
    if (typeof organizeFxPanel === 'function') organizeFxPanel();
    var host = document.getElementById('lyric-depth-playlist-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lyric-depth-playlist-host';
      var page = fxPanel.querySelector('[data-fx-page="playlist"]');
      if (page) page.appendChild(host); else fxPanel.appendChild(host);
    }
    _dockVisualPlaylist('lyric-depth', host, true);
  } else _dockVisualPlaylist('lyric-depth', null, false);
}

function lyricDepthSyncPresetShell(active) {
  if (!document.body) return;
  var interactionActive = !!(active && fx && fx.lyricDepthInteraction === true);
  if (document.body.classList.contains('lyric-depth-interaction-on') !== interactionActive) {
    document.body.classList.toggle('lyric-depth-interaction-on', interactionActive);
  }
  var classActive = document.body.classList.contains('lyric-depth-on');
  if (active && !classActive) {
    document.body.classList.add('lyric-depth-on');
    if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent() && typeof safeShelfCloseContent === 'function') {
      safeShelfCloseContent('lyric-depth-preset');
    }
    if (shelfManager && shelfManager.clearSelected) shelfManager.clearSelected();
    if (typeof setFocusZone === 'function') setFocusZone(null, true);
    lyricDepthDockPlaylist(true);
  } else if (!active && classActive) {
    document.body.classList.remove('lyric-depth-on');
    document.body.classList.remove('lyric-depth-cover-hover');
    document.body.classList.remove('lyric-depth-interaction-on');
    lyricDepthDockPlaylist(false);
  }
}

function lyricDepthHandlePointerLeave() {
  var hover = lyricDepthState.hover;
  hover.active = false;
  hover.targetScale = 1;
  hover.targetRotX = 0;
  hover.targetRotY = 0;
  if (document.body) document.body.classList.remove('lyric-depth-cover-hover');
}

function lyricDepthHandlePointerMove(event) {
  var cover = lyricDepthState.cover;
  if (!event || !lyricDepthFlightActive() || !cover || !cover.visible || !camera || !cover.material || cover.material.uniforms.uOpacity.value < 0.04) {
    lyricDepthHandlePointerLeave();
    return false;
  }
  if (typeof isPointerOverUi === 'function' && isPointerOverUi(event)) {
    lyricDepthHandlePointerLeave();
    return false;
  }
  if (!lyricDepthState.pointerRaycaster) lyricDepthState.pointerRaycaster = new THREE.Raycaster();
  if (!lyricDepthState.pointerNdc) lyricDepthState.pointerNdc = new THREE.Vector2();
  lyricDepthState.pointerNdc.set((event.clientX / Math.max(1, innerWidth)) * 2 - 1, -(event.clientY / Math.max(1, innerHeight)) * 2 + 1);
  var raycaster = lyricDepthState.pointerRaycaster;
  raycaster.setFromCamera(lyricDepthState.pointerNdc, camera);
  cover.updateMatrixWorld(true);
  var hit = raycaster.intersectObject(cover, false)[0];
  if (!hit || !hit.uv) {
    lyricDepthHandlePointerLeave();
    return false;
  }
  var hover = lyricDepthState.hover;
  var nx = (hit.uv.x - 0.5) * 2;
  var ny = (hit.uv.y - 0.5) * 2;
  hover.active = true;
  hover.targetScale = 1.08;
  hover.targetRotX = -ny * 0.145;
  hover.targetRotY = nx * 0.165;
  if (document.body) document.body.classList.add('lyric-depth-cover-hover');
  if (typeof markRenderInteraction === 'function') markRenderInteraction('lyric-depth-cover-hover', 420);
  return true;
}

function lyricDepthSpringStep(value, velocity, target, frequency, damping, dt) {
  dt = Math.max(0, Math.min(0.034, Number(dt) || 0));
  var omega = Math.max(1, frequency || 8);
  var accel = (target - value) * omega * omega - 2 * Math.max(0.1, damping || 0.7) * omega * velocity;
  velocity += accel * dt;
  value += velocity * dt;
  return { value: value, velocity: velocity };
}

function lyricDepthUpdateHover(dt) {
  var hover = lyricDepthState.hover;
  var frequency = hover.active ? 12.0 : 7.2;
  var damping = hover.active ? 0.78 : 0.67;
  var scaleStep = lyricDepthSpringStep(hover.scale, hover.scaleVelocity, hover.targetScale, frequency, damping, dt);
  hover.scale = scaleStep.value; hover.scaleVelocity = scaleStep.velocity;
  var xStep = lyricDepthSpringStep(hover.rotX, hover.rotXVelocity, hover.targetRotX, frequency, damping, dt);
  hover.rotX = xStep.value; hover.rotXVelocity = xStep.velocity;
  var yStep = lyricDepthSpringStep(hover.rotY, hover.rotYVelocity, hover.targetRotY, frequency, damping, dt);
  hover.rotY = yStep.value; hover.rotYVelocity = yStep.velocity;
}

function lyricDepthTrackTransitionState() {
  return lyricDepthState.trackTransition;
}

function beginLyricDepthTrackTransition(song, token, meta) {
  if (!lyricDepthFlightActive()) return false;
  var state = lyricDepthTrackTransitionState();
  state.phase = 'outgoing';
  state.token = Number(token) || 0;
  state.elapsed = 0;
  state.audioReady = false;
  state.coverReady = !!(meta && meta.sameAlbumCover);
  state.lyricsReady = false;
  state.hadCover = !!(uniforms && uniforms.uHasCover && uniforms.uHasCover.value > 0.5);
  state.pendingAdopt = true;
  state.variant = lyricDepthHashString([song && song.title, song && song.artist, state.token].join('|')) % 4;
  state.frozenProgress = lyricDepthState.currentIndex >= 0 ? lyricDepthLineProgress(lyricDepthState.currentIndex) : 1;
  return true;
}

function continueLyricDepthTrackTransition(token) {
  var state = lyricDepthTrackTransitionState();
  if (state.phase === 'idle') return false;
  state.token = Number(token) || state.token;
  state.audioReady = false;
  state.coverReady = false;
  state.lyricsReady = false;
  state.pendingAdopt = true;
  return true;
}

function cancelLyricDepthTrackTransition(token) {
  var state = lyricDepthTrackTransitionState();
  if (token != null && Number(token) !== state.token) return false;
  state.phase = 'idle';
  state.elapsed = 0;
  state.audioReady = false;
  state.pendingAdopt = false;
  return true;
}

function markLyricDepthCoverReady(token) {
  var state = lyricDepthTrackTransitionState();
  if (Number(token) !== state.token) return false;
  state.coverReady = true;
  return true;
}

function markLyricDepthLyricsReady(token) {
  var state = lyricDepthTrackTransitionState();
  if (Number(token) !== state.token) return false;
  state.lyricsReady = true;
  return true;
}

function markLyricDepthAudioReady(token) {
  var state = lyricDepthTrackTransitionState();
  if (Number(token) !== state.token) return false;
  state.audioReady = true;
  return true;
}

function lyricDepthUpdateTrackTransition(dt) {
  var state = lyricDepthTrackTransitionState();
  if (state.phase === 'idle') return state;
  state.elapsed += Math.max(0, Number(dt) || 0);
  if (state.phase === 'outgoing' && state.elapsed >= 0.52) {
    state.phase = 'bridge';
    state.elapsed = 0;
  } else if (state.phase === 'bridge' && state.audioReady) {
    state.phase = 'incoming';
    state.elapsed = 0;
  } else if (state.phase === 'incoming' && state.elapsed >= 0.78) {
    state.phase = state.lyricsReady ? 'settle' : 'await-lyrics';
    state.elapsed = 0;
  } else if (state.phase === 'await-lyrics' && state.lyricsReady) {
    state.phase = 'settle';
    state.elapsed = 0;
  } else if (state.phase === 'settle' && state.elapsed >= 0.34) {
    state.phase = 'idle';
    state.elapsed = 0;
  }
  return state;
}

function lyricDepthHashString(text) {
  text = String(text || '');
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function lyricDepthRandom(seed) {
  var x = Math.sin((Number(seed) || 0) * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function lyricDepthDamp(current, target, rate, dt) {
  var ease = 1 - Math.exp(-Math.max(0.001, Number(rate) || 1) * Math.max(0, Number(dt) || 0));
  return current + (target - current) * ease;
}

function lyricDepthCleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function lyricDepthTranslationMode() {
  return typeof normalizeLyricTranslationMode === 'function'
    ? normalizeLyricTranslationMode(fx && fx.lyricTranslationMode)
    : String(fx && fx.lyricTranslationMode || 'off');
}

function lyricDepthTranslationAllowed(relative) {
  var mode = lyricDepthTranslationMode();
  if (mode === 'off') return false;
  if (mode === 'current') return relative === 0;
  if (mode === 'dual') return relative === 0 || relative === 1;
  return true;
}

function lyricDepthLineTranslation(index, relative) {
  if (index < 0 || !lyricDepthTranslationAllowed(relative)) return '';
  var line = lyricsLines && lyricsLines[index];
  var text = line && line.translation;
  if (typeof normalizeLyricTranslationText === 'function') text = normalizeLyricTranslationText(text);
  return lyricDepthCleanText(text);
}

function lyricDepthLineText(index) {
  if (index === -2) {
    return typeof currentLyricFallbackText === 'function' ? lyricDepthCleanText(currentLyricFallbackText()) : '';
  }
  var line = lyricsLines && lyricsLines[index];
  var text = line && line.text;
  if (typeof normalizeStageLyricText === 'function') text = normalizeStageLyricText(text);
  text = lyricDepthCleanText(text);
  if (text && typeof isNoLyricText === 'function' && isNoLyricText(text)) {
    var fallback = typeof currentLyricFallbackText === 'function' ? lyricDepthCleanText(currentLyricFallbackText()) : '';
    if (fallback) return fallback;
  }
  return text;
}

function lyricDepthLinePayload(index, relative) {
  var text = lyricDepthLineText(index);
  return {
    text: text,
    translation: lyricDepthLineTranslation(index, relative),
    relative: relative
  };
}

function lyricDepthPlaybackIndex() {
  if (!lyricsLines || !lyricsLines.length || typeof findStageLyricIndexAtTime !== 'function') return -2;
  var seconds = typeof stageLyricPlaybackSeconds === 'function'
    ? stageLyricPlaybackSeconds()
    : (audio && isFinite(audio.currentTime) ? audio.currentTime : 0);
  if (typeof getAdjustedLyricPlaybackTime === 'function') seconds = getAdjustedLyricPlaybackTime(seconds);
  var index = findStageLyricIndexAtTime(seconds);
  return index >= 0 ? index : -2;
}

function lyricDepthLineProgress(index) {
  if (index < 0 || !lyricsLines || !lyricsLines[index]) return 0.28;
  var seconds = typeof stageLyricPlaybackSeconds === 'function'
    ? stageLyricPlaybackSeconds()
    : (audio && isFinite(audio.currentTime) ? audio.currentTime : 0);
  if (typeof getAdjustedLyricPlaybackTime === 'function') seconds = getAdjustedLyricPlaybackTime(seconds);
  if (typeof getLyricLineProgress === 'function') return getLyricLineProgress(lyricsLines[index], lyricsLines[index + 1], seconds);
  var start = Number(lyricsLines[index].t) || 0;
  var end = lyricsLines[index + 1] && Number(lyricsLines[index + 1].t) > start
    ? Number(lyricsLines[index + 1].t)
    : start + Math.max(1, Number(lyricsLines[index].duration) || 4.2);
  return Math.max(0, Math.min(1, (seconds - start) / Math.max(0.8, end - start)));
}

function lyricDepthChunkText(text) {
  var spaced = /\s/.test(text);
  var units = spaced ? text.split(/\s+/).filter(Boolean) : Array.from(text);
  if (!units.length) return [''];
  var groupCount = units.length <= 4 ? Math.min(2, units.length) : (units.length <= 9 ? 3 : 4);
  var chunks = [];
  for (var group = 0; group < groupCount; group++) {
    var start = Math.round(group * units.length / groupCount);
    var end = Math.round((group + 1) * units.length / groupCount);
    chunks.push(units.slice(start, Math.max(start + 1, end)).join(spaced ? ' ' : ''));
  }
  return chunks.filter(Boolean);
}

function lyricDepthTextFont(size, weight) {
  if (typeof lyricFontCss === 'function') return lyricFontCss(Math.max(24, Math.round(size)), weight);
  return String(Math.round(weight || 700)) + ' ' + String(Math.max(24, Math.round(size))) + 'px sans-serif';
}

function lyricDepthMeasureText(ctx, text, size) {
  return typeof lyricMeasureText === 'function' ? lyricMeasureText(ctx, text, size) : ctx.measureText(text).width;
}

function lyricDepthFillText(ctx, text, x, y, size) {
  if (typeof lyricFillText === 'function') lyricFillText(ctx, text, x, y, size);
  else ctx.fillText(text, x, y);
}

function lyricDepthRasterStyleSignature() {
  var base = typeof lyricRasterStyleKey === 'function' ? lyricRasterStyleKey() : [fx && fx.lyricFont, fx && fx.lyricWeight, fx && fx.lyricLetterSpacing].join('|');
  return [
    base,
    lyricDepthTranslationMode(),
    typeof lyricTranslationScaleValue === 'function' ? lyricTranslationScaleValue() : 0.72,
    typeof lyricTranslationOpacityValue === 'function' ? lyricTranslationOpacityValue() : 0.62,
    typeof lyricTranslationGapValue === 'function' ? lyricTranslationGapValue() : 0.72
  ].join('|');
}

function lyricDepthBuildTextCanvas(payload, lineIndex) {
  var canvas = document.createElement('canvas');
  canvas.width = LYRIC_DEPTH_TEXT_WIDTH;
  canvas.height = LYRIC_DEPTH_TEXT_HEIGHT;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  payload = payload && typeof payload === 'object' ? payload : { text: payload, translation: '' };
  var text = lyricDepthCleanText(payload.text);
  var translation = lyricDepthCleanText(payload.translation);
  var chunks = lyricDepthChunkText(text);
  var hash = lyricDepthHashString(text + '|' + lineIndex);
  var accentIndex = chunks.length ? hash % chunks.length : 0;
  var secondaryIndex = chunks.length > 2 ? (accentIndex + 2) % chunks.length : -1;
  var glyphCount = Math.max(1, Array.from(text).length);
  var baseSize = glyphCount > 20 ? 64 : (glyphCount > 13 ? 74 : (glyphCount > 8 ? 88 : 102));
  var sizes = [];
  var alphas = [];
  var widths = [];
  var totalWidth = 0;
  var gap = glyphCount > 13 ? 22 : 30;
  var selectedWeight = typeof lyricFontWeightValue === 'function' ? lyricFontWeightValue() : 800;

  for (var i = 0; i < chunks.length; i++) {
    var size = i === accentIndex ? baseSize * (chunks.length <= 2 ? 1.62 : 1.48) : (i === secondaryIndex ? baseSize * 1.20 : baseSize);
    sizes[i] = size;
    alphas[i] = i === accentIndex ? 1 : (i === secondaryIndex ? 0.88 : 0.76 + lyricDepthRandom(hash + i * 17) * 0.12);
    ctx.font = lyricDepthTextFont(size, i === accentIndex ? selectedWeight : Math.max(500, selectedWeight - 120));
    widths[i] = Math.max(1, lyricDepthMeasureText(ctx, chunks[i], size));
    totalWidth += widths[i] + (i ? gap : 0);
  }

  var fit = Math.min(1, (canvas.width - 112) / Math.max(1, totalWidth));
  if (fit < 1) {
    totalWidth = 0;
    gap *= fit;
    for (var fi = 0; fi < chunks.length; fi++) {
      sizes[fi] *= fit;
      ctx.font = lyricDepthTextFont(sizes[fi], fi === accentIndex ? selectedWeight : Math.max(500, selectedWeight - 120));
      widths[fi] = Math.max(1, lyricDepthMeasureText(ctx, chunks[fi], sizes[fi]));
      totalWidth += widths[fi] + (fi ? gap : 0);
    }
  }

  var x = (canvas.width - totalWidth) * 0.5;
  var primaryTextMin = x / canvas.width;
  var primaryTextMax = (x + totalWidth) / canvas.width;
  var baseline = canvas.height * 0.59;
  for (var di = 0; di < chunks.length; di++) {
    var yShift = di === accentIndex ? -8 : ((di % 2 ? 1 : -1) * (8 + lyricDepthRandom(hash + di * 31) * 10));
    ctx.font = lyricDepthTextFont(sizes[di], di === accentIndex ? selectedWeight : Math.max(500, selectedWeight - 120));
    // RGB 仅作为 shader 内部的原文/译文遮罩；最终颜色仍由歌词配色 uniform 决定。
    ctx.fillStyle = 'rgba(255,0,0,' + alphas[di].toFixed(3) + ')';
    lyricDepthFillText(ctx, chunks[di], x, baseline + yShift, sizes[di]);
    x += widths[di] + gap;
  }
  if (translation) {
    var translationScale = typeof lyricTranslationScaleValue === 'function' ? lyricTranslationScaleValue() : 0.72;
    var translationOpacity = typeof lyricTranslationOpacityValue === 'function' ? lyricTranslationOpacityValue() : 0.62;
    var translationGap = typeof lyricTranslationGapValue === 'function' ? lyricTranslationGapValue() : 0.72;
    var trSize = Math.max(28, Math.min(58, baseSize * translationScale * 0.66));
    ctx.font = lyricDepthTextFont(trSize, Math.max(500, selectedWeight - 180));
    var trWidth = lyricDepthMeasureText(ctx, translation, trSize);
    var trFit = Math.min(1, (canvas.width - 160) / Math.max(1, trWidth));
    trSize *= trFit;
    ctx.font = lyricDepthTextFont(trSize, Math.max(500, selectedWeight - 180));
    ctx.fillStyle = 'rgba(0,255,0,' + Math.max(0.18, Math.min(1, translationOpacity)).toFixed(3) + ')';
    ctx.textAlign = 'center';
    lyricDepthFillText(ctx, translation, canvas.width * 0.5, baseline + 78 + (translationGap - 0.72) * 18, trSize);
    ctx.textAlign = 'left';
  }
  canvas.__lyricDepthTextMin = Math.max(0.02, Math.min(0.98, primaryTextMin));
  canvas.__lyricDepthTextMax = Math.max(canvas.__lyricDepthTextMin + 0.01, Math.min(0.98, primaryTextMax));
  return canvas;
}

function lyricDepthCreateTextTexture(payload, lineIndex) {
  var canvas = lyricDepthBuildTextCanvas(payload, lineIndex);
  var texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.userData = texture.userData || {};
  texture.userData.textMin = canvas.__lyricDepthTextMin == null ? 0.08 : canvas.__lyricDepthTextMin;
  texture.userData.textMax = canvas.__lyricDepthTextMax == null ? 0.92 : canvas.__lyricDepthTextMax;
  if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function lyricDepthCreateTextMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uTexel: { value: new THREE.Vector2(1 / LYRIC_DEPTH_TEXT_WIDTH, 1 / LYRIC_DEPTH_TEXT_HEIGHT) },
      uBaseColor: { value: new THREE.Color('#b8c8c6') },
      uHiColor: { value: new THREE.Color('#f7f6ef') },
      uOpacity: { value: 0 },
      uBlur: { value: 0 },
      uGlow: { value: 0.22 },
      uProgress: { value: 0 },
      uKaraokeEnabled: { value: 0 },
      uUnsungBrightness: { value: 0.34 },
      uTextMin: { value: 0.08 },
      uTextMax: { value: 0.92 }
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
      'uniform vec2 uTexel;',
      'uniform vec3 uBaseColor;',
      'uniform vec3 uHiColor;',
      'uniform float uOpacity;',
      'uniform float uBlur;',
      'uniform float uGlow;',
      'uniform float uProgress;',
      'uniform float uKaraokeEnabled;',
      'uniform float uUnsungBrightness;',
      'uniform float uTextMin;',
      'uniform float uTextMax;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 faceUv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);',
      '  vec4 textSample = texture2D(uMap, faceUv);',
      '  float core = textSample.a;',
      '  vec2 d = uTexel * mix(0.65, 9.0, clamp(uBlur, 0.0, 1.0));',
      '  float primaryCore = textSample.r;',
      '  float soft = 0.0;',
      '  soft += texture2D(uMap, faceUv + vec2( d.x, 0.0)).a;',
      '  soft += texture2D(uMap, faceUv + vec2(-d.x, 0.0)).a;',
      '  soft += texture2D(uMap, faceUv + vec2(0.0,  d.y)).a;',
      '  soft += texture2D(uMap, faceUv + vec2(0.0, -d.y)).a;',
      '  soft += texture2D(uMap, faceUv + vec2( d.x,  d.y)).a;',
      '  soft += texture2D(uMap, faceUv + vec2(-d.x,  d.y)).a;',
      '  soft += texture2D(uMap, faceUv + vec2( d.x, -d.y)).a;',
      '  soft += texture2D(uMap, faceUv + vec2(-d.x, -d.y)).a;',
      '  soft *= 0.125;',
      '  float primarySoft = 0.0;',
      '  primarySoft += texture2D(uMap, faceUv + vec2( d.x, 0.0)).r;',
      '  primarySoft += texture2D(uMap, faceUv + vec2(-d.x, 0.0)).r;',
      '  primarySoft += texture2D(uMap, faceUv + vec2(0.0,  d.y)).r;',
      '  primarySoft += texture2D(uMap, faceUv + vec2(0.0, -d.y)).r;',
      '  primarySoft += texture2D(uMap, faceUv + vec2( d.x,  d.y)).r;',
      '  primarySoft += texture2D(uMap, faceUv + vec2(-d.x,  d.y)).r;',
      '  primarySoft += texture2D(uMap, faceUv + vec2( d.x, -d.y)).r;',
      '  primarySoft += texture2D(uMap, faceUv + vec2(-d.x, -d.y)).r;',
      '  primarySoft *= 0.125;',
      '  float blurMix = clamp(uBlur * 0.92, 0.0, 0.92);',
      '  float body = mix(core, soft, blurMix);',
      '  float primaryBody = mix(primaryCore, primarySoft, blurMix);',
      '  float halo = max(soft - core * 0.18, 0.0) * uGlow;',
      '  float alpha = (body + halo * 0.42) * uOpacity;',
      '  if (alpha < 0.004) discard;',
      '  float textX = clamp((faceUv.x - uTextMin) / max(0.001, uTextMax - uTextMin), 0.0, 1.0);',
      '  float sung = 1.0 - smoothstep(uProgress - 0.018, uProgress + 0.018, textX);',
      '  float primaryMask = smoothstep(0.015, 0.16, primaryBody / max(0.001, body));',
      '  float karaokeMix = uKaraokeEnabled * primaryMask;',
      '  float karaokeLight = mix(1.0, mix(uUnsungBrightness, 1.0, sung), karaokeMix);',
      '  vec3 lyricColor = mix(uBaseColor, uHiColor, sung * karaokeMix);',
      '  vec3 color = lyricColor * karaokeLight * (0.84 + core * 0.28 + halo * (0.54 + sung * 0.28));',
      '  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));',
      '}'
    ].join('\n'),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide
  });
}

function lyricDepthCreateBackdrop() {
  var material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAudio: { value: 0 }
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
      'uniform float uTime;',
      'uniform float uAudio;',
      'varying vec2 vUv;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
      'void main(){',
      '  vec2 p = vUv - 0.5;',
      '  float radius = length(p * vec2(1.18, 0.92));',
      '  float fogA = exp(-length(p - vec2(-0.20, 0.08)) * 4.2);',
      '  float fogB = exp(-length(p - vec2(0.30, -0.14)) * 5.0);',
      '  float grain = hash(floor(vUv * 180.0) + floor(uTime * 0.16)) - 0.5;',
      '  vec3 base = vec3(0.004, 0.016, 0.019);',
      '  base += vec3(0.006, 0.032, 0.034) * fogA;',
      '  base += vec3(0.010, 0.022, 0.025) * fogB;',
      '  base *= 1.0 - smoothstep(0.25, 0.76, radius) * 0.58;',
      '  base += grain * 0.0022 + uAudio * vec3(0.0015, 0.0040, 0.0042);',
      '  gl_FragColor = vec4(max(base, vec3(0.0)), 1.0);',
      '}'
    ].join('\n'),
    depthTest: false,
    depthWrite: false,
    transparent: false
  });
  var mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.position.z = -24;
  mesh.frustumCulled = false;
  mesh.renderOrder = -80;
  return mesh;
}

function lyricDepthCreateStars() {
  var geometry = new THREE.BufferGeometry();
  var positions = new Float32Array(LYRIC_DEPTH_STAR_MAX * 3);
  var seeds = new Float32Array(LYRIC_DEPTH_STAR_MAX);
  for (var i = 0; i < LYRIC_DEPTH_STAR_MAX; i++) {
    var depth = 5.0 + lyricDepthRandom(i * 7 + 3) * 15.0;
    positions[i * 3] = (lyricDepthRandom(i * 13 + 5) - 0.5) * depth * 1.58;
    positions[i * 3 + 1] = (lyricDepthRandom(i * 17 + 11) - 0.5) * depth * 0.88;
    positions[i * 3 + 2] = -depth;
    seeds[i] = lyricDepthRandom(i * 29 + 19);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  var material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uOpacity: { value: 0 },
      uPixel: uniforms.uPixel,
      uDot: { value: dotTexture }
    },
    vertexShader: [
      'attribute float aSeed;',
      'uniform float uTime;',
      'uniform float uEnergy;',
      'uniform float uPixel;',
      'varying float vSeed;',
      'void main(){',
      '  vSeed = aSeed;',
      '  vec3 p = position;',
      '  p.x += sin(uTime * (0.035 + aSeed * 0.025) + aSeed * 17.0) * (0.025 + aSeed * 0.055);',
      '  p.y += cos(uTime * (0.028 + aSeed * 0.022) + aSeed * 23.0) * (0.020 + aSeed * 0.045);',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  float depthScale = clamp(9.0 / max(2.0, -mv.z), 0.46, 1.65);',
      '  gl_PointSize = (0.72 + aSeed * 1.42 + uEnergy * 0.34) * depthScale * uPixel;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uDot;',
      'uniform float uTime;',
      'uniform float uEnergy;',
      'uniform float uOpacity;',
      'varying float vSeed;',
      'void main(){',
      '  float dotAlpha = texture2D(uDot, gl_PointCoord).a;',
      '  float twinkle = 0.50 + 0.50 * sin(uTime * (0.20 + vSeed * 0.34) + vSeed * 31.0);',
      '  float alpha = dotAlpha * uOpacity * (0.30 + twinkle * 0.48 + uEnergy * 0.09);',
      '  vec3 color = mix(vec3(0.70, 0.82, 0.82), vec3(0.95, 0.96, 0.91), vSeed);',
      '  gl_FragColor = vec4(color, alpha);',
      '}'
    ].join('\n'),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  var points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 202;
  return points;
}

function lyricDepthCreateCover() {
  var material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: coverTex },
      uPrevMap: { value: prevCoverTex },
      uMix: uniforms.uColorMixT,
      uOpacity: { value: 0 },
      uPulse: { value: 0 }
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
      'uniform sampler2D uPrevMap;',
      'uniform float uMix;',
      'uniform float uOpacity;',
      'uniform float uPulse;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 faceUv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);',
      '  vec2 d = abs(faceUv - 0.5) - vec2(0.445);',
      '  float rounded = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.045;',
      '  float mask = 1.0 - smoothstep(-0.010, 0.018, rounded);',
      '  vec3 color = mix(texture2D(uPrevMap, faceUv).rgb, texture2D(uMap, faceUv).rgb, clamp(uMix, 0.0, 1.0));',
      '  float luminance = dot(color, vec3(0.299, 0.587, 0.114));',
      '  color = mix(vec3(luminance), color, 0.58);',
      '  color *= 0.66 + uPulse * 0.035;',
      '  float inner = 1.0 - smoothstep(0.26, 0.70, length(faceUv - 0.5));',
      '  color += vec3(0.012, 0.026, 0.027) * inner;',
      '  gl_FragColor = vec4(color, mask * uOpacity);',
      '}'
    ].join('\n'),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide
  });
  var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 218;
  return mesh;
}

function lyricDepthEnsureScene() {
  if (lyricDepthState.root) return;
  var root = new THREE.Group();
  root.visible = false;
  root.frustumCulled = false;
  scene.add(root);

  lyricDepthState.root = root;
  lyricDepthState.interactionPivot = new THREE.Group();
  lyricDepthState.contentGroup = new THREE.Group();
  lyricDepthState.interactionPivot.position.z = LYRIC_DEPTH_INTERACTION_PIVOT_Z;
  lyricDepthState.contentGroup.position.z = -LYRIC_DEPTH_INTERACTION_PIVOT_Z;
  lyricDepthState.interactionPivot.add(lyricDepthState.contentGroup);
  lyricDepthState.backdrop = lyricDepthCreateBackdrop();
  lyricDepthState.stars = lyricDepthCreateStars();
  lyricDepthState.cover = lyricDepthCreateCover();
  lyricDepthState.cardGeometry = new THREE.PlaneGeometry(1, 1);
  root.add(lyricDepthState.backdrop);
  root.add(lyricDepthState.stars);
  root.add(lyricDepthState.interactionPivot);
  lyricDepthState.contentGroup.add(lyricDepthState.cover);

  for (var i = 0; i < LYRIC_DEPTH_CARD_COUNT; i++) {
    var material = lyricDepthCreateTextMaterial();
    var mesh = new THREE.Mesh(lyricDepthState.cardGeometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 240 + i;
    lyricDepthState.contentGroup.add(mesh);
    lyricDepthState.cards.push({
      mesh: mesh,
      material: material,
      texture: null,
      lineIndex: -999,
      textKey: '',
      relative: 99,
      fresh: true,
      exitOriginZ: null,
      used: false
    });
  }
}

function lyricDepthCardKey(lineIndex, payload) {
  payload = payload || { text: '', translation: '' };
  return [lineIndex, payload.text || '', payload.translation || '', lyricDepthRasterStyleSignature()].join('|');
}

function lyricDepthAssignCard(card, lineIndex, payload) {
  var key = lyricDepthCardKey(lineIndex, payload);
  if (card.textKey === key && card.texture) return false;
  // 卡片复用成另一句后，不能继承旧句退出时保存的景深原点。
  // 这主要覆盖快速拖动进度条、跨行 seek 和反向 seek 的 -1 → -1 重用。
  card.exitOriginZ = null;
  if (card.texture) card.texture.dispose();
  card.texture = lyricDepthCreateTextTexture(payload, lineIndex);
  card.material.uniforms.uMap.value = card.texture;
  card.material.uniforms.uTexel.value.set(1 / LYRIC_DEPTH_TEXT_WIDTH, 1 / LYRIC_DEPTH_TEXT_HEIGHT);
  card.material.uniforms.uTextMin.value = card.texture.userData && card.texture.userData.textMin != null ? card.texture.userData.textMin : 0.08;
  card.material.uniforms.uTextMax.value = card.texture.userData && card.texture.userData.textMax != null ? card.texture.userData.textMax : 0.92;
  card.lineIndex = lineIndex;
  card.textKey = key;
  card.fresh = true;
  return true;
}

function lyricDepthSetCardRelative(card, relative) {
  var previousRelative = card.relative;
  card.relative = relative;
  if (relative === -1 && previousRelative === 0 && card.mesh) {
    card.exitOriginZ = card.mesh.position.z;
  } else if (relative !== -1) {
    card.exitOriginZ = null;
  }
}

function lyricDepthSyncCards(centerIndex) {
  var cards = lyricDepthState.cards;
  for (var i = 0; i < cards.length; i++) cards[i].used = false;
  var start = centerIndex < 0 ? 0 : -2;
  var end = centerIndex < 0 ? 0 : 2;
  for (var relative = start; relative <= end; relative++) {
    var lineIndex = centerIndex < 0 ? -2 : centerIndex + relative;
    if (lineIndex >= 0 && (!lyricsLines || lineIndex >= lyricsLines.length)) continue;
    var payload = lyricDepthLinePayload(lineIndex, centerIndex < 0 ? 0 : relative);
    if (!payload.text) continue;
    var key = lyricDepthCardKey(lineIndex, payload);
    var card = null;
    for (var ci = 0; ci < cards.length; ci++) {
      if (!cards[ci].used && cards[ci].textKey === key) { card = cards[ci]; break; }
    }
    if (!card) {
      for (var freeIndex = 0; freeIndex < cards.length; freeIndex++) {
        if (!cards[freeIndex].used) { card = cards[freeIndex]; break; }
      }
    }
    if (!card) continue;
    lyricDepthAssignCard(card, lineIndex, payload);
    lyricDepthSetCardRelative(card, centerIndex < 0 ? 0 : relative);
    card.used = true;
    card.mesh.visible = true;
  }
  for (var hideIndex = 0; hideIndex < cards.length; hideIndex++) {
    if (!cards[hideIndex].used) cards[hideIndex].mesh.visible = false;
  }
}

function lyricDepthSyncDuringSeek(centerIndex) {
  var dragging = typeof progressDragState !== 'undefined' && progressDragState && progressDragState.active;
  if (!dragging) {
    lyricDepthState.deferredCenterIndex = null;
    lyricDepthState.seekPreviewIndex = null;
    lyricDepthState.seekPreviewKey = '';
    lyricDepthState.lastSeekTextureAt = 0;
    lyricDepthSyncCards(centerIndex);
    return;
  }
  lyricDepthState.deferredCenterIndex = centerIndex;
  var payload = lyricDepthLinePayload(centerIndex, 0);
  var text = payload.text;
  var key = lyricDepthCardKey(centerIndex, payload);
  var now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  var previewChanged = lyricDepthState.seekPreviewIndex !== centerIndex || lyricDepthState.seekPreviewKey !== key;
  // 拖进度条时最多约 11 次/秒上传单张当前歌词纹理；松手后再一次性补齐前后层。
  // 这样保留即时预览，但不会在滑过每一行时连续制造五张 1536x384 纹理。
  if (!previewChanged || (lyricDepthState.seekPreviewIndex !== null && now - lyricDepthState.lastSeekTextureAt < 90)) return;
  lyricDepthState.seekPreviewIndex = centerIndex;
  lyricDepthState.seekPreviewKey = key;
  lyricDepthState.lastSeekTextureAt = now;
  var cards = lyricDepthState.cards;
  for (var i = 0; i < cards.length; i++) cards[i].used = false;
  if (!text) {
    for (var hi = 0; hi < cards.length; hi++) cards[hi].mesh.visible = false;
    return;
  }
  var current = null;
  for (var ci = 0; ci < cards.length; ci++) {
    if (cards[ci].textKey === key) { current = cards[ci]; break; }
  }
  if (!current) current = cards[0];
  lyricDepthAssignCard(current, centerIndex, payload);
  lyricDepthSetCardRelative(current, 0);
  current.used = true;
  current.mesh.visible = true;
  for (var hideIndex = 0; hideIndex < cards.length; hideIndex++) {
    if (!cards[hideIndex].used) cards[hideIndex].mesh.visible = false;
  }
}

function lyricDepthSetCardTarget(card, layout, progress, transitionProgress, shelfFactor, dt) {
  var relative = card.relative;
  var current = layout.current;
  var mesh = card.mesh;
  var side = current[0] >= 0 ? -1 : 1;
  var x, y, z, scale, rotX, rotY, rotZ, opacity, blur, glow;
  var lineNoise = Math.sin((card.lineIndex + 5) * 2.173) * 0.18;
  var motion = layout.motion || 'side';

  if (relative === 0) {
    x = current[0] + lineNoise * 0.16;
    y = current[1] + Math.sin((card.lineIndex + 2) * 1.37) * 0.055;
    z = current[2] + progress * 0.24;
    scale = current[3] * (1 + progress * 0.040);
    rotX = current[4]; rotY = current[5]; rotZ = current[6];
    // 新句整组从封面后方/深处推到焦面；不是逐字打字或逐字透明度。
    var enter = Math.max(0, Math.min(1, transitionProgress));
    var enterEase = 1 - Math.pow(1 - enter, 3);
    var entering = 1 - enterEase;
    if (motion === 'rise') {
      x += side * 0.42 * entering;
      y -= 1.62 * entering;
      z -= 4.25 * entering;
      rotZ += side * 0.08 * entering;
    } else if (motion === 'diagonal') {
      x += side * 2.18 * entering;
      y += 1.04 * entering;
      z -= 5.85 * entering;
      rotY += side * 0.12 * entering;
    } else if (motion === 'orbit') {
      x += Math.cos(enter * Math.PI * 0.9) * side * 1.72 * entering;
      y += Math.sin(enter * Math.PI) * 0.92 * entering;
      z -= 6.10 * entering;
      rotZ += side * 0.11 * entering;
    } else if (motion === 'sweep') {
      x += side * 3.10 * entering;
      y -= 0.45 * entering;
      z -= 3.70 * entering;
    } else if (motion === 'float') {
      x -= side * 0.86 * entering;
      y += 1.46 * entering;
      z -= 5.10 * entering;
      rotX -= 0.09 * entering;
    } else if (motion === 'burst') {
      var hold = enter < 0.48 ? enter / 0.48 : 1;
      var charge = 1 - (hold * hold * (3 - 2 * hold));
      x += side * 0.34 * charge;
      y += 0.20 * charge;
      z -= 9.20 * charge;
      scale *= 0.44 + 0.56 * enterEase;
    } else if (motion === 'depth') {
      y += 0.14 * entering;
      z -= 7.35 * entering;
    } else {
      x += side * 1.42 * entering;
      y += 0.28 * entering;
      z -= 5.25 * entering;
    }
    scale *= 0.42 + 0.58 * enterEase;
    opacity = 0.18 + 0.80 * enterEase;
    blur = 0.78 * (1 - enterEase) + 0.015;
    glow = 0.20 + 0.10 * enterEase;
  } else if (relative === -1) {
    // 旧句继续越过焦平面朝镜头滑行，放大并失焦；与新句重叠约 0.8 秒。
    var exit = Math.max(0, Math.min(1, transitionProgress));
    var exitEase = 1 - Math.pow(1 - exit, 2);
    x = side * (1.35 + exitEase * 2.45) + lineNoise;
    y = -0.28 - exitEase * 0.56 + lineNoise * 0.42;
    // 从该卡换句瞬间的真实 Z 起步，随后只向相机方向推进，避免不同 layout
    // 之间用固定起点造成“先后退、再前冲”的折返顿挫。
    var exitOriginZ = Number.isFinite(card.exitOriginZ) ? card.exitOriginZ : mesh.position.z;
    z = exitOriginZ + exitEase * 2.48;
    scale = 1.02 + exitEase * 0.86;
    rotX = -0.018 - exitEase * 0.022;
    rotY = side * (-0.055 - exitEase * 0.10);
    rotZ = side * (0.012 + exitEase * 0.030);
    opacity = 0.90 - exitEase * 0.66;
    blur = 0.10 + exitEase * 0.82;
    glow = 0.20 - exitEase * 0.05;
  } else if (relative === -2) {
    x = -side * 4.35 + lineNoise * 1.2;
    y = 1.24 + lineNoise * 0.55;
    z = -12.55;
    scale = 1.04;
    rotX = 0.045; rotY = side * 0.18; rotZ = side * -0.045;
    opacity = 0.095; blur = 0.94; glow = 0.13;
  } else if (relative === 1) {
    x = -side * 3.42 + lineNoise * 0.9;
    y = 0.82 + lineNoise * 0.48;
    z = -10.15;
    scale = 0.80;
    rotX = 0.028; rotY = side * 0.15; rotZ = side * -0.034;
    opacity = 0.16; blur = 0.70; glow = 0.15;
  } else {
    x = side * 4.72 + lineNoise;
    y = -1.18 + lineNoise * 0.42;
    z = -14.10;
    scale = 0.88;
    rotX = -0.040; rotY = side * -0.20; rotZ = side * 0.050;
    opacity = 0.065; blur = 1.0; glow = 0.11;
  }

  opacity *= shelfFactor;
  // 参考片里歌词通常占画面约三至六成，只有个别强调字接近镜头。
  // 保留 Canvas 的 4:1 比例，但不要让整句长期铺满整屏。
  var liveLyricScale = Math.max(0.35, Math.min(1.65, Number(fx && fx.lyricScale) || 1));
  var targetScaleX = 4.72 * scale * liveLyricScale;
  var targetScaleY = 1.18 * scale * liveLyricScale;
  if (card.fresh) {
    mesh.position.set(x * 1.06, y * 1.06, z - 1.65);
    mesh.scale.set(targetScaleX * 0.76, targetScaleY * 0.76, 1);
    mesh.rotation.set(rotX, rotY, rotZ);
    card.material.uniforms.uOpacity.value = 0;
    card.material.uniforms.uBlur.value = Math.min(1, blur + 0.24);
    card.fresh = false;
  }

  mesh.position.x = lyricDepthDamp(mesh.position.x, x, 3.6, dt);
  mesh.position.y = lyricDepthDamp(mesh.position.y, y, 3.4, dt);
  mesh.position.z = lyricDepthDamp(mesh.position.z, z, 3.2, dt);
  mesh.scale.x = lyricDepthDamp(mesh.scale.x, targetScaleX, 3.8, dt);
  mesh.scale.y = lyricDepthDamp(mesh.scale.y, targetScaleY, 3.8, dt);
  mesh.rotation.x = lyricDepthDamp(mesh.rotation.x, rotX, 3.2, dt);
  mesh.rotation.y = lyricDepthDamp(mesh.rotation.y, rotY, 3.2, dt);
  mesh.rotation.z = lyricDepthDamp(mesh.rotation.z, rotZ, 3.0, dt);
  card.material.uniforms.uOpacity.value = lyricDepthDamp(card.material.uniforms.uOpacity.value, opacity, opacity > card.material.uniforms.uOpacity.value ? 5.2 : 3.5, dt);
  card.material.uniforms.uBlur.value = lyricDepthDamp(card.material.uniforms.uBlur.value, blur, 3.8, dt);
  card.material.uniforms.uGlow.value = lyricDepthDamp(card.material.uniforms.uGlow.value, glow, 3.2, dt);
  var palette = typeof effectiveLyricPalette === 'function' ? effectiveLyricPalette(stageLyrics && stageLyrics.palette) : null;
  var baseColor = palette && palette.primary || '#b8c8c6';
  var hiColor = palette && palette.highlight || '#f7f6ef';
  card.material.uniforms.uBaseColor.value.set(relative === 0 ? baseColor : (palette && palette.secondary || '#b8c8c6'));
  card.material.uniforms.uHiColor.value.set(hiColor);
  card.material.uniforms.uProgress.value = relative < 0 ? 1 : (relative === 0 ? Math.max(0, Math.min(1, progress)) : 0);
  card.material.uniforms.uKaraokeEnabled.value = relative === 0 && card.lineIndex >= 0 && fx && fx.lyricDepthKaraokeHighlight !== false ? 1 : 0;
  mesh.renderOrder = relative === 0 ? 258 : (246 - Math.abs(relative));
}

function lyricDepthUpdateCover(layout, progress, shelfFactor, time, dt) {
  var mesh = lyricDepthState.cover;
  var target = layout.cover;
  var driftX = Math.sin(time * 0.13 + lyricDepthState.patternIndex) * 0.075;
  var driftY = Math.cos(time * 0.16 + lyricDepthState.patternIndex * 0.7) * 0.050;
  var targetX = target[0] + driftX;
  var targetY = target[1] + driftY;
  var targetZ = target[2] + progress * 0.10;
  var trackState = lyricDepthTrackTransitionState();
  var trackScale = 1;
  var trackOpacity = 1;
  if (trackState.phase === 'outgoing') {
    var outgoingT = Math.max(0, Math.min(1, trackState.elapsed / 0.52));
    var outgoingEase = outgoingT * outgoingT * (3 - 2 * outgoingT);
    targetZ += 1.85 * outgoingEase;
    targetX += (trackState.variant % 2 ? -1 : 1) * 0.58 * outgoingEase;
    trackScale = 1 + outgoingEase * 0.22;
    trackOpacity = 1 - outgoingEase * 0.36;
  } else if (trackState.phase === 'bridge') {
    var bridgeWave = 0.5 + 0.5 * Math.sin(time * 1.18 + trackState.variant);
    targetZ -= 0.74 + bridgeWave * 0.20;
    targetX += Math.sin(time * 0.42 + trackState.variant) * 0.28;
    targetY += Math.cos(time * 0.37 + trackState.variant) * 0.16;
    trackScale = 0.82 + bridgeWave * 0.035;
    trackOpacity = 0.58 + bridgeWave * 0.08;
  } else if (trackState.phase === 'incoming') {
    var incomingT = Math.max(0, Math.min(1, trackState.elapsed / 0.78));
    var incomingEase = 1 - Math.pow(1 - incomingT, 3);
    targetZ -= (1 - incomingEase) * 5.8;
    targetY += (1 - incomingEase) * 0.74;
    trackScale = 0.46 + incomingEase * 0.54;
    trackOpacity = 0.36 + incomingEase * 0.64;
  }
  var audioPulse = Math.min(1, Math.max(0, smoothBass * 0.70 + audioEnergy * 0.18));
  lyricDepthUpdateHover(dt);
  var hover = lyricDepthState.hover;
  var targetScale = target[3] * (1 + audioPulse * 0.018) * hover.scale * trackScale;

  if (!lyricDepthState.coverReady) {
    mesh.position.set(targetX, targetY, targetZ - 1.0);
    mesh.scale.setScalar(targetScale * 0.88);
    mesh.rotation.set(target[4], target[5], target[6]);
    lyricDepthState.coverReady = true;
  }
  mesh.position.x = lyricDepthDamp(mesh.position.x, targetX, 2.9, dt);
  mesh.position.y = lyricDepthDamp(mesh.position.y, targetY, 2.8, dt);
  mesh.position.z = lyricDepthDamp(mesh.position.z, targetZ, 2.6, dt);
  mesh.scale.x = lyricDepthDamp(mesh.scale.x, targetScale, 3.0, dt);
  mesh.scale.y = lyricDepthDamp(mesh.scale.y, targetScale, 3.0, dt);
  mesh.rotation.x = lyricDepthDamp(mesh.rotation.x, target[4] + Math.sin(time * 0.11) * 0.008 + hover.rotX, 4.8, dt);
  mesh.rotation.y = lyricDepthDamp(mesh.rotation.y, target[5] + Math.cos(time * 0.10) * 0.012 + hover.rotY, 4.8, dt);
  mesh.rotation.z = lyricDepthDamp(mesh.rotation.z, target[6] + Math.sin(time * 0.08) * 0.006, 2.4, dt);
  var hasCover = !!(typeof uniforms !== 'undefined' && uniforms.uHasCover && uniforms.uHasCover.value > 0.5 && coverTex && coverTex.image);
  mesh.visible = hasCover || mesh.material.uniforms.uOpacity.value > 0.004;
  mesh.material.uniforms.uOpacity.value = lyricDepthDamp(mesh.material.uniforms.uOpacity.value, hasCover ? 0.58 * shelfFactor * trackOpacity : 0, hasCover ? 3.2 : 8.5, dt);
  mesh.material.uniforms.uPulse.value = audioPulse;
}

function lyricDepthUpdateBackdropAndStars(time, shelfFactor, lyricsVisible, dt) {
  var distance = 24;
  var halfHeight = Math.tan((camera.fov || 45) * Math.PI / 360) * distance;
  lyricDepthState.backdrop.scale.set(halfHeight * 2 * (camera.aspect || 1.78) * 1.08, halfHeight * 2 * 1.08, 1);
  lyricDepthState.backdrop.material.uniforms.uTime.value = time;
  lyricDepthState.backdrop.material.uniforms.uAudio.value = Math.min(1, Math.max(0, audioEnergy));

  var budget = typeof runtimePerfBudgetLevel === 'function' ? runtimePerfBudgetLevel() : 2;
  var starCount = budget <= 0 ? 90 : (budget === 1 ? 120 : (budget >= 3 ? LYRIC_DEPTH_STAR_MAX : 154));
  lyricDepthState.stars.geometry.setDrawRange(0, starCount);
  lyricDepthState.starCount = starCount;
  lyricDepthState.stars.material.uniforms.uTime.value = time;
  var trackState = lyricDepthTrackTransitionState();
  var bridgeEnergy = trackState.phase === 'bridge' ? 0.34 + 0.12 * Math.sin(time * 1.4) : (trackState.phase === 'outgoing' || trackState.phase === 'incoming' ? 0.22 : 0);
  lyricDepthState.stars.material.uniforms.uEnergy.value = Math.min(1, Math.max(0, audioEnergy * 0.44 + smoothTreb * 0.18 + bridgeEnergy));
  lyricDepthState.stars.material.uniforms.uOpacity.value = lyricDepthDamp(
    lyricDepthState.stars.material.uniforms.uOpacity.value,
    0.72 * (shelfFactor < 1 ? 0.46 : 1),
    2.8,
    dt
  );

  for (var i = 0; i < lyricDepthState.cards.length; i++) {
    var card = lyricDepthState.cards[i];
    if (!card.used) continue;
    var farCard = Math.abs(card.relative) >= 2;
    card.mesh.visible = lyricsVisible
      ? !(budget <= 0 && farCard)
      : card.material.uniforms.uOpacity.value > 0.004;
  }
}

function lyricDepthUpdateInteractionTransform(dt) {
  var pivot = lyricDepthState.interactionPivot;
  if (!pivot) return;
  var enabled = !!(fx && fx.lyricDepthInteraction === true);
  var targetX = enabled && typeof gestureRotation !== 'undefined' ? gestureRotation.x : 0;
  var targetY = enabled && typeof gestureRotation !== 'undefined' ? gestureRotation.y : 0;
  var targetZ = enabled && typeof gestureRotation !== 'undefined' ? gestureRotation.z : 0;
  var targetScale = enabled && typeof gestureZoom !== 'undefined' ? Math.max(0.55, Math.min(1.9, gestureZoom.value)) : 1;
  var ease = Math.min(1, Math.max(0, Number(dt) || 0) * 7.4);
  pivot.rotation.x += (targetX - pivot.rotation.x) * ease;
  pivot.rotation.y += (targetY - pivot.rotation.y) * ease;
  pivot.rotation.z += (targetZ - pivot.rotation.z) * ease;
  var nextScale = pivot.scale.x + (targetScale - pivot.scale.x) * ease;
  pivot.scale.setScalar(nextScale);
}

function resetLyricDepthInteractionTransform(syncVisual) {
  if (!lyricDepthState.interactionPivot) return;
  if (syncVisual) {
    lyricDepthState.interactionPivot.rotation.set(0, 0, 0);
    lyricDepthState.interactionPivot.scale.setScalar(1);
  }
}

function rebaseLyricDepthInteractionAxis(axis, offset) {
  if (!lyricDepthState.interactionPivot || !axis || !isFinite(offset)) return;
  lyricDepthState.interactionPivot.rotation[axis] -= offset;
}

function lyricDepthSetStageHidden(hidden) {
  if (stageLyrics && stageLyrics.group) {
    if (hidden) {
      stageLyrics.group.visible = false;
      lyricDepthState.stageHidden = true;
    } else if (lyricDepthState.stageHidden) {
      stageLyrics.group.visible = true;
      lyricDepthState.stageHidden = false;
    }
  } else if (!hidden) {
    lyricDepthState.stageHidden = false;
  }
}

function updateLyricDepthFlight(dt) {
  var active = lyricDepthFlightActive();
  lyricDepthSyncPresetShell(active);
  if (!active) {
    if (lyricDepthState.root) lyricDepthState.root.visible = false;
    lyricDepthSetStageHidden(false);
    if (lyricDepthState.active) cancelLyricDepthTrackTransition();
    lyricDepthState.active = false;
    return;
  }

  lyricDepthEnsureScene();
  lyricDepthState.root.visible = true;
  lyricDepthSetStageHidden(true);
  lyricDepthState.root.position.copy(camera.position);
  lyricDepthState.root.quaternion.copy(camera.quaternion);
  lyricDepthUpdateInteractionTransform(dt);
  var trackState = lyricDepthUpdateTrackTransition(dt);

  var lyricsVisible = lyricDepthFlightLyricsVisible();
  var index = lyricDepthPlaybackIndex();
  var lyricsChanged = lyricDepthState.lyricsRef !== lyricsLines;
  var pendingLyrics = typeof lyricsTimingSource !== 'undefined' && lyricsTimingSource === 'pending';
  if (pendingLyrics && trackState.phase !== 'idle' && lyricDepthState.active) index = lyricDepthState.currentIndex;
  if (lyricsChanged && !pendingLyrics) lyricDepthState.lyricsRef = lyricsLines;
  if (lyricsChanged && pendingLyrics && trackState.phase !== 'idle') lyricsChanged = false;
  if (!lyricDepthState.active || lyricDepthState.currentIndex !== index || lyricsChanged) {
    lyricDepthState.currentIndex = index;
    lyricDepthState.patternIndex = Math.abs(index < 0 ? 0 : index) % LYRIC_DEPTH_LAYOUTS.length;
    lyricDepthState.lastLineChangeAt = uniforms.uTime.value;
    lyricDepthState.transitionProgress = lyricDepthState.active ? 0 : 0.72;
    lyricDepthState.transitionDuration = LYRIC_DEPTH_LAYOUTS[lyricDepthState.patternIndex].motion === 'burst' ? 1.34 : 0.82;
    if (!pendingLyrics) {
      lyricDepthSyncDuringSeek(index);
      trackState.pendingAdopt = false;
    }
  } else {
    if (!pendingLyrics) lyricDepthSyncDuringSeek(index);
  }

  var layout = LYRIC_DEPTH_LAYOUTS[lyricDepthState.patternIndex];
  var progress = pendingLyrics && trackState.phase !== 'idle'
    ? Math.max(0, Math.min(1, Number(trackState.frozenProgress) || 1))
    : lyricDepthLineProgress(index);
  var time = uniforms.uTime.value;
  lyricDepthState.transitionProgress = Math.min(1, lyricDepthState.transitionProgress + Math.max(0, dt) / lyricDepthState.transitionDuration);
  var shelfFactor = 1;
  for (var i = 0; i < lyricDepthState.cards.length; i++) {
    if (lyricDepthState.cards[i].used) {
      var trackLyricFactor = trackState.phase === 'outgoing'
        ? Math.max(0.24, 1 - trackState.elapsed / 0.70)
        : (trackState.phase === 'bridge' || trackState.phase === 'await-lyrics' || ((trackState.phase === 'incoming' || trackState.phase === 'settle') && !trackState.lyricsReady) ? 0.22 : 1);
      lyricDepthSetCardTarget(lyricDepthState.cards[i], layout, progress, lyricDepthState.transitionProgress, lyricsVisible ? shelfFactor * trackLyricFactor : 0, dt);
      if (!lyricsVisible && lyricDepthState.cards[i].material.uniforms.uOpacity.value < 0.004) lyricDepthState.cards[i].mesh.visible = false;
    }
  }
  lyricDepthUpdateCover(layout, progress, shelfFactor, time, dt);
  lyricDepthUpdateBackdropAndStars(time, shelfFactor, lyricsVisible, dt);
  lyricDepthState.active = true;
}

function disposeLyricDepthFlight() {
  lyricDepthSyncPresetShell(false);
  lyricDepthSetStageHidden(false);
  if (!lyricDepthState.root) return;
  for (var i = 0; i < lyricDepthState.cards.length; i++) {
    var card = lyricDepthState.cards[i];
    if (card.texture) card.texture.dispose();
    if (card.material) card.material.dispose();
  }
  if (lyricDepthState.cardGeometry) lyricDepthState.cardGeometry.dispose();
  if (lyricDepthState.backdrop) {
    lyricDepthState.backdrop.geometry.dispose();
    lyricDepthState.backdrop.material.dispose();
  }
  if (lyricDepthState.stars) {
    lyricDepthState.stars.geometry.dispose();
    lyricDepthState.stars.material.dispose();
  }
  if (lyricDepthState.cover) {
    lyricDepthState.cover.geometry.dispose();
    lyricDepthState.cover.material.dispose();
  }
  scene.remove(lyricDepthState.root);
  lyricDepthState.root = null;
  lyricDepthState.interactionPivot = null;
  lyricDepthState.contentGroup = null;
  lyricDepthState.backdrop = null;
  lyricDepthState.stars = null;
  lyricDepthState.cover = null;
  lyricDepthState.cards = [];
  lyricDepthState.cardGeometry = null;
  lyricDepthState.active = false;
  lyricDepthState.coverReady = false;
  lyricDepthState.deferredCenterIndex = null;
  lyricDepthState.seekPreviewIndex = null;
  lyricDepthState.seekPreviewKey = '';
  lyricDepthState.lastSeekTextureAt = 0;
  lyricDepthState.transitionProgress = 1;
  lyricDepthState.transitionDuration = 0.82;
  lyricDepthState.hover.active = false;
  lyricDepthState.hover.targetScale = lyricDepthState.hover.scale = 1;
  lyricDepthState.hover.targetRotX = lyricDepthState.hover.rotX = 0;
  lyricDepthState.hover.targetRotY = lyricDepthState.hover.rotY = 0;
  lyricDepthState.trackTransition.phase = 'idle';
  lyricDepthState.trackTransition.elapsed = 0;
}

window.__mineradioLyricDepthSnapshot = function () {
  return {
    active: lyricDepthFlightActive(),
    initialized: !!lyricDepthState.root,
    currentIndex: lyricDepthState.currentIndex,
    patternIndex: lyricDepthState.patternIndex,
    starCount: lyricDepthState.starCount,
    lyricsVisible: lyricDepthFlightLyricsVisible(),
    coverVisible: !!(lyricDepthState.cover && lyricDepthState.cover.visible),
    coverHovered: !!lyricDepthState.hover.active,
    interactionEnabled: !!(fx && fx.lyricDepthInteraction === true),
    interactionScale: lyricDepthState.interactionPivot ? Number(lyricDepthState.interactionPivot.scale.x.toFixed(3)) : 1,
    trackTransitionPhase: lyricDepthState.trackTransition.phase,
    seekDeferredIndex: lyricDepthState.deferredCenterIndex,
    visibleCards: lyricDepthState.cards.filter(function (card) { return card.mesh && card.mesh.visible; }).map(function (card) {
      return {
        lineIndex: card.lineIndex,
        relative: card.relative,
        opacity: Number(card.material.uniforms.uOpacity.value.toFixed(3))
      };
    })
  };
};
