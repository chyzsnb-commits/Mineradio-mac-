function applyHomeAccentColor() {
  var color = normalizeHexColor(fx.homeAccentColor || '#00f5d4');
  var rgb = hexToRgb(color);
  document.documentElement.style.setProperty('--home-accent', color);
  document.documentElement.style.setProperty('--home-accent-rgb', rgb.r + ',' + rgb.g + ',' + rgb.b);
}
function updateHomeAccentControls() {
  applyHomeAccentColor();
  var color = normalizeHexColor(fx.homeAccentColor || '#00f5d4');
  var picker = document.getElementById('home-accent-picker');
  var value = document.getElementById('home-accent-value');
  if (picker) picker.value = color;
  if (value) value.textContent = color.toUpperCase();
}
function setHomeAccentColor(color, silent) {
  fx.homeAccentColor = normalizeHexColor(color || '#00f5d4');
  updateHomeAccentControls();
  saveLyricLayout({ user: true, reason: 'homeAccentColor' });
  if (!silent) showToast('Home 填充: ' + fx.homeAccentColor.toUpperCase());
}
function resetHomeAccentColor() {
  setHomeAccentColor(fxDefaults.homeAccentColor || '#00f5d4');
}
function applyIconAccentColors() {
  var homeColor = normalizeHexColor(fx.homeIconColor || fxDefaults.homeIconColor || '#f4d28a', '#f4d28a');
  var visualColor = normalizeHexColor(fx.visualIconColor || fxDefaults.visualIconColor || '#7fd8ff', '#7fd8ff');
  var homeRgb = hexToRgb(homeColor);
  var visualRgb = hexToRgb(visualColor);
  var root = document.documentElement;
  root.style.setProperty('--home-icon-color', homeColor);
  root.style.setProperty('--home-icon-rgb', homeRgb.r + ',' + homeRgb.g + ',' + homeRgb.b);
  root.style.setProperty('--visual-icon-color', visualColor);
  root.style.setProperty('--visual-icon-rgb', visualRgb.r + ',' + visualRgb.g + ',' + visualRgb.b);
}
function updateIconAccentControls() {
  applyIconAccentColors();
  var homeColor = normalizeHexColor(fx.homeIconColor || fxDefaults.homeIconColor || '#f4d28a', '#f4d28a');
  var visualColor = normalizeHexColor(fx.visualIconColor || fxDefaults.visualIconColor || '#7fd8ff', '#7fd8ff');
  var homePicker = document.getElementById('home-icon-picker');
  var homeValue = document.getElementById('home-icon-value');
  var visualPicker = document.getElementById('visual-icon-picker');
  var visualValue = document.getElementById('visual-icon-value');
  if (homePicker) homePicker.value = homeColor;
  if (homeValue) homeValue.textContent = homeColor.toUpperCase();
  if (visualPicker) visualPicker.value = visualColor;
  if (visualValue) visualValue.textContent = visualColor.toUpperCase();
}
function setHomeIconColor(color, silent) {
  fx.homeIconColor = normalizeHexColor(color || fxDefaults.homeIconColor || '#f4d28a', '#f4d28a');
  updateIconAccentControls();
  saveLyricLayout({ user: true, reason: 'homeIconColor' });
  if (!silent) showToast('主页图标: ' + fx.homeIconColor.toUpperCase());
}
function resetHomeIconColor() {
  setHomeIconColor(fxDefaults.homeIconColor || '#f4d28a');
}
function setVisualIconColor(color, silent) {
  fx.visualIconColor = normalizeHexColor(color || fxDefaults.visualIconColor || '#7fd8ff', '#7fd8ff');
  updateIconAccentControls();
  saveLyricLayout({ user: true, reason: 'visualIconColor' });
  if (!silent) showToast('视觉图标: ' + fx.visualIconColor.toUpperCase());
}
function resetVisualIconColor() {
  setVisualIconColor(fxDefaults.visualIconColor || '#7fd8ff');
}
function customBackgroundCropNumber(key, fallback, min, max) {
  var n = Number(fx && fx[key]);
  if (!isFinite(n)) n = Number(fallback);
  if (!isFinite(n)) n = min;
  return clampRange(n, min, max);
}
function customBackgroundAlbumCoverSource() {
  var src = '';
  try {
    if (typeof albumBackgroundCurrentSrc !== 'undefined' && albumBackgroundCurrentSrc) src = String(albumBackgroundCurrentSrc || '');
  } catch (e) { }
  if (!src) {
    try {
      if (typeof currentCoverSource !== 'undefined' && currentCoverSource && currentCoverSource.src) src = String(currentCoverSource.src || '');
    } catch (e2) { }
  }
  if (!src) {
    try {
      var thumb = document.getElementById('thumb-cover');
      var thumbSrc = thumb && thumb.getAttribute('src');
      var thumbSrcSet = thumb && thumb.getAttribute('srcset');
      // 空 src 的 HTMLImageElement.src 会被浏览器解析为当前页面地址，不能当封面。
      src = thumb && (thumbSrc || thumbSrcSet ? (thumb.currentSrc || thumbSrc) : '') || '';
    } catch (e3) { }
  }
  if (!src) {
    try {
      // 切歌/恢复存档时 currentCoverSource 可能尚未写入，但模糊封面层已经可见。
      // 从它读取当前 URL，保证“封面”按钮和鼠标视角不依赖某个异步完成顺序。
      var albumLayer = document.getElementById('album-bg');
      var albumImage = albumLayer && window.getComputedStyle ? window.getComputedStyle(albumLayer).backgroundImage : '';
      var albumMatch = albumImage && albumImage.match(/url\((['"]?)(.*?)\1\)/i);
      if (albumMatch && albumMatch[2] && albumMatch[2] !== 'none') src = albumMatch[2];
    } catch (e4) { }
  }
  if (!src) {
    try {
      var song = typeof sonicWorkshopCurrentSong === 'function' ? sonicWorkshopCurrentSong() : null;
      if (!song) song = Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
      if (!song) song = Array.isArray(playlist) && currentIdx >= 0 && currentIdx < playlist.length ? playlist[currentIdx] : null;
      if (song) src = typeof songCoverSrc === 'function' ? songCoverSrc(song, 640) : (song.customCover || song.cover || '');
    } catch (e5) { }
  }
  if (src && /^https?:\/\//i.test(src) && typeof coverProxySrc === 'function') return coverProxySrc(src, false) || src;
  return src || '';
}
function customBackgroundActiveMedia() {
  var media = normalizeCustomBackgroundMedia(fx.backgroundMedia || fx.backgroundImage);
  if ((typeof customBackgroundUsesAlbumCover === 'function' && customBackgroundUsesAlbumCover()) || (media && media.type === 'album')) {
    var albumSrc = customBackgroundAlbumCoverSource();
    return albumSrc ? { type: 'image', src: albumSrc, album: true } : null;
  }
  return media;
}

var wallpaperMouseParallaxState = {
  targetX: 0,
  targetY: 0,
  currentX: 0,
  currentY: 0,
  frame: 0
};

function wallpaperMouseParallaxSupported() {
  var media = typeof customBackgroundActiveMedia === 'function' ? customBackgroundActiveMedia() : null;
  return !!(media && !media.album && (media.type === 'image' || media.type === 'video'));
}

function writeWallpaperMouseParallaxVars(x, y) {
  var layer = document.getElementById('custom-bg');
  if (!layer) return;
  layer.style.setProperty('--wallpaper-bg-parallax-x', (Number(x) || 0).toFixed(3) + '%');
  layer.style.setProperty('--wallpaper-bg-parallax-y', (Number(y) || 0).toFixed(3) + '%');
}

function updateCustomBackgroundMouseParallax(ndcX, ndcY) {
  if (Number.isFinite(Number(ndcX))) wallpaperMouseParallaxState.targetX = Math.max(-1, Math.min(1, Number(ndcX)));
  if (Number.isFinite(Number(ndcY))) wallpaperMouseParallaxState.targetY = Math.max(-1, Math.min(1, Number(ndcY)));
  var enabled = !!(typeof fx !== 'undefined' && fx && fx.wallpaperMouseParallax === true && wallpaperMouseParallaxSupported());
  if (!enabled) {
    if (wallpaperMouseParallaxState.frame) cancelAnimationFrame(wallpaperMouseParallaxState.frame);
    wallpaperMouseParallaxState.frame = 0;
    wallpaperMouseParallaxState.targetX = wallpaperMouseParallaxState.targetY = 0;
    wallpaperMouseParallaxState.currentX = wallpaperMouseParallaxState.currentY = 0;
    writeWallpaperMouseParallaxVars(0, 0);
    return;
  }
  if (!wallpaperMouseParallaxState.frame) wallpaperMouseParallaxState.frame = requestAnimationFrame(stepCustomBackgroundMouseParallax);
}

function stepCustomBackgroundMouseParallax() {
  wallpaperMouseParallaxState.frame = 0;
  var state = wallpaperMouseParallaxState;
  state.currentX += (state.targetX - state.currentX) * 0.18;
  state.currentY += (state.targetY - state.currentY) * 0.18;
  writeWallpaperMouseParallaxVars(state.currentX * -1.55, state.currentY * 1.25);
  if (Math.abs(state.targetX - state.currentX) > 0.002 || Math.abs(state.targetY - state.currentY) > 0.002) {
    state.frame = requestAnimationFrame(stepCustomBackgroundMouseParallax);
  } else {
    state.currentX = state.targetX;
    state.currentY = state.targetY;
    writeWallpaperMouseParallaxVars(state.currentX * -1.55, state.currentY * 1.25);
  }
}

function applyCustomBackgroundCropVars(root, layer) {
  var cropX = customBackgroundCropNumber('backgroundMediaCropX', fxDefaults.backgroundMediaCropX == null ? 50 : fxDefaults.backgroundMediaCropX, 0, 100);
  var cropY = customBackgroundCropNumber('backgroundMediaCropY', fxDefaults.backgroundMediaCropY == null ? 50 : fxDefaults.backgroundMediaCropY, 0, 100);
  var zoom = customBackgroundCropNumber('backgroundMediaZoom', fxDefaults.backgroundMediaZoom == null ? 1 : fxDefaults.backgroundMediaZoom, 1, 2.8);
  var vars = [
    ['--custom-bg-position-x', cropX.toFixed(1) + '%'],
    ['--custom-bg-position-y', cropY.toFixed(1) + '%'],
    ['--custom-bg-zoom', zoom.toFixed(3)]
  ];
  vars.forEach(function (item) {
    if (root) root.style.setProperty(item[0], item[1]);
    if (layer) layer.style.setProperty(item[0], item[1]);
  });
}
function applyCustomBackground() {
  var color = normalizeHexColor(fx.backgroundColor || '#000000', '#000000');
  var rgb = hexToRgb(color);
  var albumMode = typeof customBackgroundUsesAlbumCover === 'function' && customBackgroundUsesAlbumCover();
  var media = customBackgroundActiveMedia();
  if (!albumMode && media && fx.albumBackgroundMouseBind === true) fx.albumBackgroundMouseBind = false;
  var wallpaperParallax = !!(media && !media.album && (media.type === 'image' || media.type === 'video') && fx.wallpaperMouseParallax === true);
  var image = media && media.type === 'image' ? media.src : '';
  var hasVideo = !!(media && media.type === 'video');
  var opacity = clampRange(fx.backgroundOpacity == null ? 1 : Number(fx.backgroundOpacity), 0, 1);
  // 中心守卫:设了背景媒体时透明度≈0 等于白设(纯黑)。切预设加载的旧存档常带 backgroundOpacity:0,
  // 会把已生效的视频又压没(用户实测:仅音域回响可见,其它预设全黑)。媒体在场时强制可见。
  if (media && !(opacity > 0.05)) { opacity = 1; fx.backgroundOpacity = 1; if (typeof setRange === 'function') setRange('fx-bgopacity', 1); }
  var windowOpacity = clampRange(fx.windowBackgroundOpacity == null ? fxDefaults.windowBackgroundOpacity : Number(fx.windowBackgroundOpacity), 0, 1);
  var glassOpacity = clampRange(fx.backgroundGlassOpacity == null ? fxDefaults.backgroundGlassOpacity : Number(fx.backgroundGlassOpacity), 0, 1);
  var glassActive = glassOpacity > 0.001;
  var overlayOpacity = Math.max((media || albumMode) ? 0.18 : 0, glassActive ? glassOpacity * 0.42 : 0);
  var glassBlur = glassActive ? glassOpacity * 32 : 0;
  var glassSaturate = 1 + glassOpacity * 0.55;
  var glassBrightness = 1 + glassOpacity * 0.08;
  var glassVeil = glassOpacity * 0.075;
  var customColor = fx.backgroundColorMode === 'custom' || !!fx.backgroundColorCustom;
  var override = albumMode || !!media || customColor || opacity < 1 || windowOpacity < 0.999 || glassActive;
  var root = document.documentElement;
  var layer = document.getElementById('custom-bg');
  var video = document.getElementById('custom-bg-video');
  root.style.setProperty('--custom-bg-color', color);
  root.style.setProperty('--custom-bg-color-rgb', rgb.r + ', ' + rgb.g + ', ' + rgb.b);
  root.style.setProperty('--custom-bg-album-opacity', albumMode ? opacity.toFixed(3) : '1');
  applyCustomBackgroundCropVars(root, layer);
  document.body.classList.toggle('custom-background-override', override);
  document.body.classList.toggle('custom-background-flat', override && !media);
  document.body.classList.toggle('custom-background-album-cover', albumMode);
  document.body.classList.toggle('custom-background-video', hasVideo);
  document.body.classList.toggle('custom-background-parallax', wallpaperParallax);
  document.body.classList.toggle('custom-window-transparent', windowOpacity < 0.999);
  document.body.classList.toggle('custom-bg-glass-active', glassActive);
  var token = ++customBgApplyToken;
  if (layer) {
    layer.style.setProperty('--custom-bg-image', image ? 'url("' + cssImageUrl(image) + '")' : 'none');
    layer.style.setProperty('--custom-bg-image-opacity', image ? opacity.toFixed(3) : '0');
    layer.style.setProperty('--custom-bg-video-opacity', hasVideo ? opacity.toFixed(3) : '0');
    layer.style.setProperty('--custom-bg-base-opacity', windowOpacity.toFixed(3));
    layer.style.setProperty('--custom-bg-overlay-opacity', overlayOpacity.toFixed(3));
    layer.style.setProperty('--custom-bg-glass-opacity', glassOpacity.toFixed(3));
    layer.style.setProperty('--custom-bg-glass-blur', glassBlur.toFixed(1) + 'px');
    layer.style.setProperty('--custom-bg-glass-saturate', glassSaturate.toFixed(3));
    layer.style.setProperty('--custom-bg-glass-brightness', glassBrightness.toFixed(3));
    layer.style.setProperty('--custom-bg-glass-veil', glassVeil.toFixed(3));
  }
  // 网格导入的图片按 id 存 IndexedDB(src 为空)→ 异步载 blob → objectURL 塞进 --custom-bg-image
  var hasImageById = !!(layer && media && media.type === 'image' && media.id && !image);
  if (hasImageById && typeof getCustomBackgroundBlob === 'function') {
    getCustomBackgroundBlob(media.id).then(function (blob) {
      if (token !== customBgApplyToken || !blob) return;
      if (customBgImageObjectUrl) URL.revokeObjectURL(customBgImageObjectUrl);
      customBgImageObjectUrl = URL.createObjectURL(blob);
      layer.style.setProperty('--custom-bg-image', 'url("' + customBgImageObjectUrl + '")');
      layer.style.setProperty('--custom-bg-image-opacity', opacity.toFixed(3));
    }).catch(function () {});
  } else if (customBgImageObjectUrl && !hasImageById) {
    URL.revokeObjectURL(customBgImageObjectUrl); customBgImageObjectUrl = '';
  }
  if (!video) return;
  if (!hasVideo) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (customBgObjectUrl) { URL.revokeObjectURL(customBgObjectUrl); customBgObjectUrl = ''; }
    return;
  }
  function setVideoSrc(src) {
    if (token !== customBgApplyToken || !src) return;
    if (customBgObjectUrl && customBgObjectUrl !== src) { URL.revokeObjectURL(customBgObjectUrl); customBgObjectUrl = ''; }
    if (video.getAttribute('src') !== src) {
      video.setAttribute('src', src);
      video.load();
    }
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    // 失败别再静默:解码不了(HEVC 等)或加载失败时明说,不然"已应用"了却黑屏没人知道为什么
    video.onerror = function () {
      showToast('背景视频无法解码(可能是 HEVC/H.265 编码),请换 H.264 的 mp4');
    };
    video.onloadedmetadata = function () {
      if (!video.videoWidth) showToast('背景视频没有可用画面轨道,请换一个文件');
    };
    // 启动竞态下 play() 可能失败且从不重试→永远停在暂停帧(用户实测 paused:true)。多路兜底恢复:
    video.oncanplay = function () { if (video.paused) { var rp = video.play(); if (rp && rp.catch) rp.catch(function () { }); } };
    setTimeout(function () { if (token === customBgApplyToken && video.paused && video.readyState >= 2) { var rp = video.play(); if (rp && rp.catch) rp.catch(function () { }); } }, 900);
    var p = video.play();
    if (p && p.catch) p.catch(function () { });
  }
  if (media.src) {
    setVideoSrc(media.src);
  } else if (media.id) {
    // 同一媒体已在播:别重新生成 objectURL 触发 load 重置(切预设会闪 ~2s 黑帧再自动恢复)
    if (video._mediaKey === media.id && video.currentSrc) {
      if (video.paused) { var rp2 = video.play(); if (rp2 && rp2.catch) rp2.catch(function () { }); }
      return;
    }
    getCustomBackgroundBlob(media.id).then(function (blob) {
      if (token !== customBgApplyToken || !blob) return;
      if (customBgObjectUrl) URL.revokeObjectURL(customBgObjectUrl);
      customBgObjectUrl = URL.createObjectURL(blob);
      video._mediaKey = media.id;
      setVideoSrc(customBgObjectUrl);
    }).catch(function (err) { console.warn('background video load failed:', err); });
  }
}
function updateCustomBackgroundMediaPreview(media) {
  var preview = document.getElementById('bg-media-preview');
  if (!preview) return;
  media = media || customBackgroundActiveMedia();
  preview.classList.toggle('empty', !media);
  preview.classList.toggle('video', !!(media && media.type === 'video'));
  preview.style.removeProperty('background-image');
  preview.dataset.kind = '';
  if (!media) return;
  if (media.type === 'image' && media.src) {
    preview.style.backgroundImage = 'url("' + cssImageUrl(media.src) + '")';
    preview.dataset.kind = media.album ? 'COV' : 'IMG';
  } else if (media.type === 'video') {
    preview.dataset.kind = 'VID';
  }
}
function updateAlbumBackgroundMouseBindControl(activeMedia, albumMode) {
  var toggle = document.getElementById('t-albumBackgroundMouseBind');
  if (!toggle) return;
  activeMedia = activeMedia || customBackgroundActiveMedia();
  albumMode = albumMode === true || (typeof customBackgroundUsesAlbumCover === 'function' && customBackgroundUsesAlbumCover());
  var hasCover = !!customBackgroundAlbumCoverSource();
  var blocked = !!activeMedia && !albumMode;
  var available = albumMode || (!activeMedia && hasCover);
  var bound = fx.albumBackgroundMouseBind === true && available;
  var copy = toggle.querySelector('.fx-toggle-copy small');
  toggle.classList.toggle('on', bound);
  toggle.classList.toggle('is-unavailable', !available);
  toggle.setAttribute('aria-checked', bound ? 'true' : 'false');
  toggle.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  toggle.dataset.state = bound ? 'on' : 'off';
  if (copy) {
    copy.textContent = blocked
      ? '当前为上传媒体，保持固定视角'
      : albumMode
        ? '封面原图随鼠标轻微移动'
        : hasCover
          ? '点击后自动切换到封面原图'
          : '播放有封面的歌曲后可用';
  }
  toggle.title = blocked
    ? '上传图片和视频不支持鼠标视角'
    : hasCover || albumMode
      ? '让当前歌曲封面背景跟随鼠标产生轻微视差'
      : '当前歌曲没有可用封面';
}
var customBackgroundCropPersistTimer = 0;
function updateCustomBackgroundCropPreview() {
  if (window.performance && typeof performance.mark === 'function') performance.mark('mineradio-bg-crop-input');
  updateCustomBackgroundControls({ cropOnly: true });
  if (typeof updateCustomBackgroundCropModalView === 'function') updateCustomBackgroundCropModalView();
  if (window.performance && typeof performance.mark === 'function' && typeof performance.measure === 'function') {
    performance.mark('mineradio-bg-crop-preview-complete');
    try { performance.measure('mineradio-bg-crop-preview', 'mineradio-bg-crop-input', 'mineradio-bg-crop-preview-complete'); } catch (_) {}
  }
}
function flushCustomBackgroundCropPersist() {
  if (customBackgroundCropPersistTimer) {
    clearTimeout(customBackgroundCropPersistTimer);
    customBackgroundCropPersistTimer = 0;
  }
  saveLyricLayout({ user: true, reason: 'backgroundMediaCrop' });
}
function scheduleCustomBackgroundCropPersist() {
  if (customBackgroundCropPersistTimer) clearTimeout(customBackgroundCropPersistTimer);
  customBackgroundCropPersistTimer = setTimeout(function () {
    customBackgroundCropPersistTimer = 0;
    saveLyricLayout({ user: true, reason: 'backgroundMediaCrop' });
  }, 280);
}
function updateCustomBackgroundControls() {
  var options = arguments[0];
  if (options && options.cropOnly === true) {
    applyCustomBackgroundCropVars(document.documentElement, document.getElementById('custom-bg'));
    return;
  }
  applyCustomBackground();
  if (typeof updateAlbumBackgroundMouseView === 'function') updateAlbumBackgroundMouseView();
  updateCustomBackgroundMouseParallax();
  var activeMedia = customBackgroundActiveMedia();
  var albumMode = typeof customBackgroundUsesAlbumCover === 'function' && customBackgroundUsesAlbumCover();
  var color = normalizeHexColor(fx.backgroundColor || '#000000', '#000000');
  var picker = document.getElementById('bg-color-picker');
  var value = document.getElementById('bg-color-value');
  var imageValue = document.getElementById('bg-image-value');
  var albumBtn = document.getElementById('bg-album-toggle-btn');
  var cropBtn = document.getElementById('bg-media-crop-btn');
  var clearBtn = document.getElementById('bg-media-clear-btn');
  var state = document.getElementById('bg-media-state');
  var customColor = fx.backgroundColorMode === 'custom' || !!fx.backgroundColorCustom;
  if (picker) picker.value = color;
  if (value) value.textContent = customColor ? color.toUpperCase() : '\u5c01\u9762\u6e10\u53d8';
  if (picker && picker.closest) {
    var row = picker.closest('.lyric-color-row');
    if (row) row.classList.toggle('bg-cover-mode', !customColor);
  }
  setRange('fx-bgopacity', fx.backgroundOpacity == null ? 1 : fx.backgroundOpacity);
  setRange('fx-windowbgopacity', fx.windowBackgroundOpacity == null ? fxDefaults.windowBackgroundOpacity : fx.windowBackgroundOpacity);
  setRange('fx-bgglassopacity', fx.backgroundGlassOpacity == null ? fxDefaults.backgroundGlassOpacity : fx.backgroundGlassOpacity);
  setRange('fx-bgcropx', customBackgroundCropNumber('backgroundMediaCropX', fxDefaults.backgroundMediaCropX == null ? 50 : fxDefaults.backgroundMediaCropX, 0, 100));
  setRange('fx-bgcropy', customBackgroundCropNumber('backgroundMediaCropY', fxDefaults.backgroundMediaCropY == null ? 50 : fxDefaults.backgroundMediaCropY, 0, 100));
  setRange('fx-bgzoom', customBackgroundCropNumber('backgroundMediaZoom', fxDefaults.backgroundMediaZoom == null ? 1 : fxDefaults.backgroundMediaZoom, 1, 2.8));
  if (imageValue) imageValue.textContent = customBackgroundMediaLabel(fx.backgroundMedia || fx.backgroundImage);
  if (albumBtn) {
    albumBtn.classList.toggle('active', typeof customBackgroundUsesAlbumCover === 'function' && customBackgroundUsesAlbumCover());
    albumBtn.setAttribute('aria-pressed', albumBtn.classList.contains('active') ? 'true' : 'false');
  }
  if (cropBtn) {
    cropBtn.disabled = !activeMedia;
    cropBtn.title = activeMedia ? '\u91cd\u65b0\u88c1\u5207\u5df2\u8bbe\u7f6e\u7684\u80cc\u666f\u5a92\u4f53' : '\u5148\u9009\u62e9\u5c01\u9762\u3001\u56fe\u7247\u6216\u89c6\u9891';
  }
  if (clearBtn) {
    clearBtn.disabled = !activeMedia;
    clearBtn.title = activeMedia ? '\u6e05\u9664\u5f53\u524d\u80cc\u666f\u5a92\u4f53' : '\u5f53\u524d\u6ca1\u6709\u53ef\u6e05\u9664\u7684\u80cc\u666f\u5a92\u4f53';
  }
  if (state) {
    state.textContent = albumMode
      ? '\u5f53\u524d\uff1a\u5c01\u9762\u539f\u56fe'
      : activeMedia
        ? '\u5f53\u524d\uff1a' + (activeMedia.type === 'video' ? '\u80cc\u666f\u89c6\u9891' : '\u80cc\u666f\u56fe\u7247') + '\uff08\u56fa\u5b9a\u89c6\u89d2\uff09'
        : '\u5f53\u524d\uff1a\u9ed8\u8ba4\u80cc\u666f';
  }
  updateCustomBackgroundMediaPreview(activeMedia);
  updateAlbumBackgroundMouseBindControl(activeMedia, albumMode);
  applyBackgroundMediaHint();
}
function setCustomBackgroundColor(color, silent, customFlag) {
  fx.backgroundColor = normalizeHexColor(color || '#000000', '#000000');
  fx.backgroundColorMode = customFlag === false ? 'cover' : 'custom';
  fx.backgroundColorCustom = customFlag !== false;
  updateCustomBackgroundControls();
  saveLyricLayout({ user: true, reason: 'backgroundColor' });
  if (!silent) showToast('背景颜色: ' + fx.backgroundColor.toUpperCase());
}
function setCustomBackgroundCoverMode(silent) {
  fx.backgroundColorMode = 'cover';
  fx.backgroundColorCustom = false;
  fx.backgroundColor = normalizeHexColor(fx.backgroundColor || fxDefaults.backgroundColor || '#000000', '#000000');
  updateCustomBackgroundControls();
  saveLyricLayout({ user: true, reason: 'backgroundColorCover' });
  if (!silent) showToast('\u80cc\u666f\u989c\u8272: \u5c01\u9762\u6e10\u53d8');
}
function resetCustomBackgroundColor() {
  setCustomBackgroundCoverMode(false);
}
function setCustomBackgroundOpacity(value, silent) {
  fx.backgroundOpacity = clampRange(Number(value), 0, 1);
  fx.backgroundColorMode = 'custom';
  fx.backgroundColorCustom = true;
  updateCustomBackgroundControls();
  saveLyricLayout({ user: true, reason: 'backgroundOpacity' });
  if (!silent) showToast('背景透明度: ' + Math.round(fx.backgroundOpacity * 100) + '%');
}
function setWindowBackgroundOpacity(value, silent) {
  fx.windowBackgroundOpacity = clampRange(Number(value), 0, 1);
  updateCustomBackgroundControls();
  saveLyricLayout({ user: true, reason: 'windowBackgroundOpacity' });
  if (!silent) showToast('\u7a97\u53e3\u80cc\u666f\u900f\u660e: ' + Math.round(fx.windowBackgroundOpacity * 100) + '%');
}
function setBackgroundGlassOpacity(value, silent) {
  fx.backgroundGlassOpacity = clampRange(Number(value), 0, 1);
  updateCustomBackgroundControls();
  saveLyricLayout({ user: true, reason: 'backgroundGlassOpacity' });
  if (!silent) showToast('\u6bdb\u73bb\u7483\u900f\u660e: ' + Math.round(fx.backgroundGlassOpacity * 100) + '%');
}
function setCustomBackgroundAlbumCover(enabled, silent) {
  var nextEnabled = enabled === true;
  // 没有当前封面时不能只切换状态:否则 UI 会显示“封面原图”,但实际没有可渲染的媒体。
  if (nextEnabled && !customBackgroundAlbumCoverSource()) {
    fx.backgroundAlbumCover = false;
    fx.albumBackgroundMouseBind = false;
    updateCustomBackgroundControls();
    if (!silent) showToast('当前歌曲暂无可用封面');
    return false;
  }
  fx.backgroundAlbumCover = nextEnabled;
  if (fx.backgroundAlbumCover) {
    fx.backgroundMedia = null;
    fx.backgroundImage = '';
  } else {
    fx.albumBackgroundMouseBind = false;
  }
  updateCustomBackgroundControls();
  saveLyricLayout({ user: true, reason: 'backgroundAlbumCover' });
  if (!silent) showToast(fx.backgroundAlbumCover ? '\u80cc\u666f\u5a92\u4f53: \u5c01\u9762\u539f\u56fe' : '\u80cc\u666f\u5a92\u4f53: \u5df2\u5173\u95ed\u5c01\u9762');
  return true;
}
function setCustomBackgroundCrop(key, value, silent) {
  var allowed = {
    backgroundMediaCropX: [0, 100, 50],
    backgroundMediaCropY: [0, 100, 50],
    backgroundMediaZoom: [1, 2.8, 1]
  };
  if (!allowed[key]) return;
  var meta = allowed[key];
  var next = clampRange(Number(value), meta[0], meta[1]);
  fx[key] = isFinite(next) ? next : meta[2];
  updateCustomBackgroundCropPreview();
  flushCustomBackgroundCropPersist();
  if (!silent) showToast('\u80cc\u666f\u88c1\u5207\u5df2\u66f4\u65b0');
}
function resetCustomBackgroundCrop() {
  fx.backgroundMediaCropX = fxDefaults.backgroundMediaCropX == null ? 50 : fxDefaults.backgroundMediaCropX;
  fx.backgroundMediaCropY = fxDefaults.backgroundMediaCropY == null ? 50 : fxDefaults.backgroundMediaCropY;
  fx.backgroundMediaZoom = fxDefaults.backgroundMediaZoom == null ? 1 : fxDefaults.backgroundMediaZoom;
  updateCustomBackgroundCropPreview();
  flushCustomBackgroundCropPersist();
  showToast('\u80cc\u666f\u88c1\u5207\u5df2\u590d\u4f4d');
}
function customBackgroundCropSnapshot() {
  return {
    x: customBackgroundCropNumber('backgroundMediaCropX', fxDefaults.backgroundMediaCropX == null ? 50 : fxDefaults.backgroundMediaCropX, 0, 100),
    y: customBackgroundCropNumber('backgroundMediaCropY', fxDefaults.backgroundMediaCropY == null ? 50 : fxDefaults.backgroundMediaCropY, 0, 100),
    zoom: customBackgroundCropNumber('backgroundMediaZoom', fxDefaults.backgroundMediaZoom == null ? 1 : fxDefaults.backgroundMediaZoom, 1, 2.8)
  };
}
function applyCustomBackgroundCropSnapshot(snapshot) {
  if (!snapshot) return;
  fx.backgroundMediaCropX = clampRange(Number(snapshot.x), 0, 100);
  fx.backgroundMediaCropY = clampRange(Number(snapshot.y), 0, 100);
  fx.backgroundMediaZoom = clampRange(Number(snapshot.zoom), 1, 2.8);
  updateCustomBackgroundCropPreview();
}
function customBackgroundCropMediaSrc(media) {
  if (!media) return '';
  if (media.type === 'image') return media.src || '';
  if (media.type === 'video') {
    var activeVideo = document.getElementById('custom-bg-video');
    var activeSrc = activeVideo && (activeVideo.currentSrc || activeVideo.getAttribute('src')) || '';
    return activeSrc || media.src || '';
  }
  return '';
}
function setCustomBackgroundImage(src, silent) {
  var image = normalizeCustomBackgroundImage(src);
  fx.backgroundImage = image;
  fx.backgroundMedia = image ? { type: 'image', src: image } : null;
  fx.backgroundAlbumCover = false;
  fx.albumBackgroundMouseBind = false;
  updateCustomBackgroundControls();
  saveLyricLayout({ user: true, reason: 'backgroundImage' });
  if (!silent) showToast(fx.backgroundImage ? '背景图片已应用' : '背景图片已清除');
}
function setCustomBackgroundMedia(media, silent) {
  media = normalizeCustomBackgroundMedia(media);
  if (media && media.type === 'album') {
    setCustomBackgroundAlbumCover(true, silent);
    return;
  }
  fx.backgroundMedia = media;
  fx.backgroundImage = media && media.type === 'image' ? media.src : '';
  fx.backgroundAlbumCover = false;
  fx.albumBackgroundMouseBind = false;
  // 设/清背景媒体后必须让 _voxApplyBg 重新裁决 scene.background:
  // 有媒体→scene.background=null(canvas 透明,露出 DOM 视频);无媒体→回到纯色/默认。
  // 否则从纯色切到 mp4 时,不透明的 THREE.Color canvas 一直压在视频上→视频看不见(用户实测纯色↔mp4 切不动)
  if (typeof _voxApplyBg === 'function') _voxApplyBg();
  // 背景透明度滑到 ~0 时上传的媒体完全看不见(用户实测"mp4 设置了却不显示")——设媒体时自动拉回可见
  if (media && !(Number(fx.backgroundOpacity) > 0.05)) {
    fx.backgroundOpacity = 1;
    if (typeof setRange === 'function') setRange('fx-bgopacity', 1);
    if (!silent) showToast('背景透明度为 0,已自动调回 1.0');
  }
  updateCustomBackgroundControls();
  saveLyricLayout({ user: true, reason: 'backgroundMedia' });
  if (!silent) showToast(media ? (media.type === 'video' ? '背景视频已应用' : '背景图片已应用') : '背景媒体已清除');
}
function clearCustomBackgroundMedia(silent) {
  setCustomBackgroundMedia(null, silent);
}
function readBackgroundImageFile(file) {
  if (!file || !/^image\//i.test(file.type || '')) {
    showToast('请选择图片文件');
    return;
  }
  mirrorCustomBackgroundBlob(file, { id: 'bg-image-source-' + Date.now(), name: file.name || '', mime: file.type || '', size: file.size || 0 });
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var maxSide = 2200;
      var iw = img.naturalWidth || img.width || 1;
      var ih = img.naturalHeight || img.height || 1;
      var scale = Math.min(1, maxSide / Math.max(iw, ih));
      var w = Math.max(1, Math.round(iw * scale));
      var h = Math.max(1, Math.round(ih * scale));
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0, w, h);
      var out = '';
      try { out = cv.toDataURL('image/webp', 0.84); } catch (err) { }
      if (!/^data:image\/webp/i.test(out)) {
        try { out = cv.toDataURL('image/jpeg', 0.86); } catch (err2) { out = String(e.target.result || ''); }
      }
      setCustomBackgroundImage(out);
    };
    img.onerror = function () { showToast('背景图片读取失败'); };
    img.src = e.target.result;
  };
  reader.onerror = function () { showToast('背景图片读取失败'); };
  reader.readAsDataURL(file);
}
function readBackgroundVideoFile(file) {
  if (!file || !/^video\//i.test(file.type || '')) {
    showToast('请选择视频文件');
    return;
  }
  var id = 'bg-video-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  putCustomBackgroundBlob(id, file, { name: file.name || '', mime: file.type || '', size: file.size || 0 }).then(function () {
    mirrorCustomBackgroundBlob(file, { id: id, name: file.name || '', mime: file.type || '', size: file.size || 0 });
    setCustomBackgroundMedia({ type: 'video', id: id, name: file.name || '', mime: file.type || '', size: file.size || 0 });
  }).catch(function (err) {
    console.warn('background video store failed:', err);
    if ((file.size || 0) > 18 * 1024 * 1024) {
      showToast('视频较大，当前环境无法保存，请换小一点的视频');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      setCustomBackgroundMedia({ type: 'video', src: String(e.target.result || ''), name: file.name || '', mime: file.type || '', size: file.size || 0 });
    };
    reader.onerror = function () { showToast('背景视频读取失败'); };
    reader.readAsDataURL(file);
  });
}
function readBackgroundMediaFile(file) {
  if (!file) return;
  if (/^image\//i.test(file.type || '')) readBackgroundImageFile(file);
  else if (/^video\//i.test(file.type || '')) readBackgroundVideoFile(file);
  else showToast('请选择图片或视频文件');
}
function mirrorCustomBackgroundBlob(blob, meta) {
  if (!blob || !window.desktopWindow || typeof window.desktopWindow.storeLocalWallpaperMedia !== 'function' || typeof blob.arrayBuffer !== 'function') return Promise.resolve({ ok: false, skipped: true });
  meta = meta || {};
  return blob.arrayBuffer().then(function (buffer) {
    return window.desktopWindow.storeLocalWallpaperMedia({
      id: String(meta.id || 'wallpaper'),
      name: String(meta.name || ''),
      mime: String(meta.mime || blob.type || ''),
      bytes: new Uint8Array(buffer)
    });
  }).catch(function () { return { ok: false }; });
}
function syncCustomBackgroundLibraryToFolder() {
  if (typeof listCustomBackgroundMediaEntries !== 'function') return Promise.resolve({ ok: true, count: 0 });
  return listCustomBackgroundMediaEntries().then(function (entries) {
    return Promise.all(entries.map(function (entry) {
      return mirrorCustomBackgroundBlob(entry.blob, entry);
    })).then(function () { return { ok: true, count: entries.length }; });
  });
}
function applyUiAccentColor() {
  var color = normalizeHexColor(fx.uiAccentColor || '#00f5d4', '#00f5d4');
  var rgb = hexToRgb(color);
  var root = document.documentElement;
  root.style.setProperty('--fc-accent', color);
  root.style.setProperty('--fc-accent-hov', color);
  root.style.setProperty('--fc-accent-rgb', rgb.r + ',' + rgb.g + ',' + rgb.b);
  root.style.setProperty('--glass-border', 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',.30)');
  root.style.setProperty('--glass-shadow-focus', '0 24px 72px rgba(0,0,0,.34),0 0 0 1px rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',.13),0 0 42px rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',.075),inset 0 1px 0 rgba(255,255,255,.20)');
}
function updateUiAccentControls() {
  applyUiAccentColor();
  var color = normalizeHexColor(fx.uiAccentColor || '#00f5d4', '#00f5d4');
  var picker = document.getElementById('ui-accent-picker');
  var value = document.getElementById('ui-accent-value');
  if (picker) picker.value = color;
  if (value) value.textContent = color.toUpperCase();
}
function setUiAccentColor(color, silent) {
  fx.uiAccentColor = normalizeHexColor(color || '#00f5d4', '#00f5d4');
  updateUiAccentControls();
  if (shelfManager && shelfManager.refreshTheme) shelfManager.refreshTheme();
  saveLyricLayout({ user: true, reason: 'uiAccentColor' });
  if (!silent) showToast('界面高亮: ' + fx.uiAccentColor.toUpperCase());
}
function resetUiAccentColor() {
  setUiAccentColor(fxDefaults.uiAccentColor || '#00f5d4');
}
function updateVisualTintControls() {
  var picker = document.getElementById('visual-tint-picker');
  var value = document.getElementById('visual-tint-value');
  var autoBtn = document.getElementById('visual-tint-auto-btn');
  var color = normalizeHexColor(fx.visualTintColor || '#9db8cf');
  document.documentElement.style.setProperty('--visual-tint', color);
  if (picker) picker.value = color;
  if (value) value.textContent = fx.visualTintMode === 'custom' ? color.toUpperCase() : '封面取色';
  if (autoBtn) autoBtn.classList.toggle('active', fx.visualTintMode !== 'custom');
}
function setVisualTintAuto() {
  fx.visualTintMode = 'auto';
  updateVisualTintControls();
  syncFxUniforms();
  saveLyricLayout({ user: true, reason: 'visualTintAuto' });
  showToast('视觉主色: 封面取色');
}
function resetVisualTintColor() {
  fx.visualTintMode = 'auto';
  fx.visualTintColor = normalizeHexColor(fxDefaults.visualTintColor || '#9db8cf');
  updateVisualTintControls();
  syncFxUniforms();
  saveLyricLayout({ user: true, reason: 'visualTintReset' });
  showToast('视觉主色已恢复默认');
}
function setVisualTintCustom(color, silent) {
  fx.visualTintMode = 'custom';
  fx.visualTintColor = normalizeHexColor(color || '#9db8cf');
  updateVisualTintControls();
  syncFxUniforms();
  saveLyricLayout({ user: true, reason: 'visualTintColor' });
  if (!silent) showToast('视觉主色: ' + fx.visualTintColor.toUpperCase());
}

var SONIC_GROUND_COLOR_CONTROLS = [
  { key: 'sonicGroundBaseColor', picker: 'sonic-ground-base-picker', value: 'sonic-ground-base-value', label: '地形暗部' },
  { key: 'sonicGroundCoolColor', picker: 'sonic-ground-cool-picker', value: 'sonic-ground-cool-value', label: '冷色峰值' },
  { key: 'sonicGroundWarmColor', picker: 'sonic-ground-warm-picker', value: 'sonic-ground-warm-value', label: '暖色峰值' },
  { key: 'sonicGroundAccentColor', picker: 'sonic-ground-accent-picker', value: 'sonic-ground-accent-value', label: '涟漪高光' }
];
function sonicGroundColorControl(key) {
  for (var i = 0; i < SONIC_GROUND_COLOR_CONTROLS.length; i++) {
    if (SONIC_GROUND_COLOR_CONTROLS[i].key === key || SONIC_GROUND_COLOR_CONTROLS[i].picker === key) return SONIC_GROUND_COLOR_CONTROLS[i];
  }
  return null;
}
function sonicHexRgb(hex, fallback) {
  hex = normalizeHexColor(hex || fallback || '#ffffff', fallback || '#ffffff').slice(1);
  var n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function sonicMixHex(a, b, t) {
  var ca = sonicHexRgb(a, '#000000');
  var cb = sonicHexRgb(b, '#ffffff');
  t = clampRange(Number(t) || 0, 0, 1);
  return '#' + [ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t].map(function (v) {
    return Math.round(clampRange(v, 0, 255)).toString(16).padStart(2, '0');
  }).join('');
}
function sonicPaletteHex(value, fallback, minLum) {
  if (typeof lyricPaletteColorToHex === 'function') return lyricPaletteColorToHex(value, fallback, minLum);
  return normalizeHexColor(value || fallback, fallback);
}
function sonicRawPaletteHex(value, fallback) {
  fallback = normalizeHexColor(fallback || '#ffffff', '#ffffff');
  value = String(value || '').trim();
  if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return normalizeHexColor(value, fallback);
  var m = value.match(/^rgba?\(\s*([.\d]+)\s*,\s*([.\d]+)\s*,\s*([.\d]+)/i);
  if (m) {
    return '#' + [m[1], m[2], m[3]].map(function (part) {
      var n = Math.round(clampRange(parseFloat(part) || 0, 0, 255));
      return n.toString(16).padStart(2, '0');
    }).join('');
  }
  return fallback;
}
function sonicGroundCoverPreviewColors() {
  var pal = stageLyrics && (stageLyrics.coverPalette || stageLyrics.palette) || {};
  var primary = sonicPaletteHex(pal.primary || pal.secondary || pal.highlight, '#33e6ff', 0.42);
  var secondary = sonicPaletteHex(pal.secondary || pal.primary || pal.highlight, '#7fd8ff', 0.40);
  var highlight = sonicPaletteHex(pal.highlight || pal.primary || pal.secondary, '#ffd070', 0.48);
  return {
    sonicGroundBaseColor: sonicMixHex('#05070c', primary, 0.12),
    sonicGroundCoolColor: primary,
    sonicGroundWarmColor: highlight,
    sonicGroundAccentColor: secondary
  };
}
function updateSonicGroundColorControls() {
  var customMode = fx.sonicGroundColorMode === 'custom';
  var coverPreview = customMode ? null : sonicGroundCoverPreviewColors();
  SONIC_GROUND_COLOR_CONTROLS.forEach(function (item) {
    var fallback = fxDefaults[item.key] || '#33e6ff';
    var color = customMode ? normalizeHexColor(fx[item.key] || fallback, fallback) : normalizeHexColor(coverPreview[item.key] || fallback, fallback);
    var picker = document.getElementById(item.picker);
    var value = document.getElementById(item.value);
    if (picker) picker.value = color;
    if (value && !customMode) value.textContent = '封面 ' + color.toUpperCase();
    if (value) value.textContent = customMode ? color.toUpperCase() : '封面取色';
  });
  if (!customMode) {
    SONIC_GROUND_COLOR_CONTROLS.forEach(function (item) {
      var fallback = fxDefaults[item.key] || '#33e6ff';
      var color = normalizeHexColor((coverPreview && coverPreview[item.key]) || fallback, fallback);
      var value = document.getElementById(item.value);
      if (value) value.textContent = '封面 ' + color.toUpperCase();
    });
  }
}
function setSonicGroundColor(key, color, silent) {
  var item = sonicGroundColorControl(key);
  if (!item) return;
  var fallback = fxDefaults[item.key] || '#33e6ff';
  fx.sonicGroundColorMode = 'custom';
  fx[item.key] = normalizeHexColor(color || fallback, fallback);
  updateSonicGroundColorControls();
  syncFxUniforms();
  saveLyricLayout({ user: true, reason: item.key });
  if (!silent) showToast(item.label + ': ' + fx[item.key].toUpperCase());
}
function resetSonicGroundColor(key) {
  var item = sonicGroundColorControl(key);
  if (!item) return;
  fx.sonicGroundColorMode = 'cover';
  SONIC_GROUND_COLOR_CONTROLS.forEach(function (control) {
    fx[control.key] = normalizeHexColor(fxDefaults[control.key] || '#33e6ff', '#33e6ff');
  });
  updateSonicGroundColorControls();
  syncFxUniforms();
  saveLyricLayout({ user: true, reason: 'sonicGroundColorAuto' });
  showToast('音域回响颜色: 封面取色');
}
function setSonicGroundColorFromPicker(pickerId, color, silent) {
  var item = sonicGroundColorControl(pickerId);
  if (item) setSonicGroundColor(item.key, color, silent);
}

var SONIC_WORKSHOP_THEME_ALIASES = {
  'minimal-mono': 'minimal-monochrome',
  'arctic-blue': 'arctic-aurora',
  'emerald-forest': 'cyber-forest',
  crimson: 'crimson-sunset',
  aurora: 'arctic-aurora',
  'violet-dream': 'neon-tokyo'
};
var SONIC_WORKSHOP_THEMES = {
  'coral-mirage': { label: '\u73ca\u745a', color: '#cb6c89', base: '#16060f', warm: '#cb6c89', cool: '#99c4ff', ripple: '#f8d8ff', peak: '#99c4ff' },
  'ocean-deep': { label: '\u6df1\u6d77', color: '#1b6fb8', base: '#031025', warm: '#2e8ed4', cool: '#7fdcff', ripple: '#b7f5ff', peak: '#80b8ff' },
  'arctic-aurora': { label: '\u51b0\u84dd', color: '#79e1c4', base: '#05161d', warm: '#79e1c4', cool: '#99c4ff', ripple: '#e6fbff', peak: '#b7e6ff' },
  'cyber-forest': { label: '\u7fe0\u7eff', color: '#3fc78a', base: '#04150d', warm: '#3fc78a', cool: '#74f5ff', ripple: '#b9ffd8', peak: '#d1ffe9' },
  'minimal-monochrome': { label: '\u6781\u7b80', color: '#d9dde3', base: '#0b0c0e', warm: '#d9dde3', cool: '#ffffff', ripple: '#ffffff', peak: '#f2f5f8' },
  'neon-tokyo': { label: '\u9713\u8679', color: '#ff4fb8', base: '#100018', warm: '#ff4fb8', cool: '#39d7ff', ripple: '#ffd6f2', peak: '#e8ff6e' },
  'golden-hour': { label: '\u91d1\u8272', color: '#e8b44c', base: '#160d02', warm: '#e8b44c', cool: '#89c8ff', ripple: '#fff0b8', peak: '#ffffff' },
  'ember-fire': { label: '\u70ed\u706b', color: '#f27a28', base: '#180603', warm: '#f27a28', cool: '#76c8ff', ripple: '#ffd2a1', peak: '#fff2cf' },
  'crimson-sunset': { label: '\u6df1\u7ea2', color: '#d84252', base: '#180307', warm: '#d84252', cool: '#8ec7ff', ripple: '#ffd5df', peak: '#fff1f4' }
};
var SONIC_WORKSHOP_COLOR_CONTROLS = [
  { id: 'theme', role: 'primary', modeKey: 'sonicWorkshopColorMode', colorKey: 'sonicWorkshopCustomColor', picker: 'sonic-workshop-cover-picker', value: 'sonic-workshop-theme-value', button: 'sonic-workshop-cover-btn', fallback: '#cb6c89', label: '\u4e3b\u9898\u57fa\u8272' },
  { id: 'base', role: 'base', modeKey: 'sonicWorkshopBaseColorMode', colorKey: 'sonicWorkshopBaseColor', picker: 'sonic-workshop-base-picker', value: 'sonic-workshop-base-value', button: 'sonic-workshop-base-btn', fallback: '#16060f', label: '\u5730\u5f62\u5e95\u8272' },
  { id: 'warm', role: 'warm', modeKey: 'sonicWorkshopWarmColorMode', colorKey: 'sonicWorkshopWarmColor', picker: 'sonic-workshop-warm-picker', value: 'sonic-workshop-warm-value', button: 'sonic-workshop-warm-btn', fallback: '#cb6c89', label: '\u6696\u8272\u4e3b\u4f53' },
  { id: 'cool', role: 'cool', modeKey: 'sonicWorkshopCoolColorMode', colorKey: 'sonicWorkshopCoolColor', picker: 'sonic-workshop-cool-picker', value: 'sonic-workshop-cool-value', button: 'sonic-workshop-cool-btn', fallback: '#99c4ff', label: '\u4e0a\u5c42\u9ad8\u5149' },
  { id: 'ripple', role: 'ripple', modeKey: 'sonicWorkshopRippleColorMode', colorKey: 'sonicWorkshopRippleColor', picker: 'sonic-workshop-ripple-picker', value: 'sonic-workshop-ripple-value', button: 'sonic-workshop-ripple-btn', fallback: '#f8d8ff', label: '\u6ce2\u7eb9\u4eae\u533a' },
  { id: 'peak', role: 'peak', modeKey: 'sonicWorkshopPeakColorMode', colorKey: 'sonicWorkshopPeakColor', picker: 'sonic-workshop-peak-picker', value: 'sonic-workshop-peak-value', button: 'sonic-workshop-peak-btn', fallback: '#99c4ff', label: '\u5cf0\u503c\u9ad8\u5149' }
];
var sonicWorkshopCoverUiSample = {
  key: '',
  palette: null,
  loading: false,
  refreshing: false,
  token: 0
};
function normalizeSonicWorkshopTheme(theme) {
  theme = String(theme || '');
  theme = SONIC_WORKSHOP_THEME_ALIASES[theme] || theme;
  return SONIC_WORKSHOP_THEMES[theme] ? theme : (fxDefaults.sonicWorkshopTheme || 'coral-mirage');
}
function sonicWorkshopRegionControl(id) {
  if (id && typeof id === 'object' && id.id) return id;
  for (var i = 0; i < SONIC_WORKSHOP_COLOR_CONTROLS.length; i++) {
    var item = SONIC_WORKSHOP_COLOR_CONTROLS[i];
    if (item.id === id || item.role === id || item.picker === id || item.colorKey === id || item.modeKey === id) return item;
  }
  return null;
}
function sonicWorkshopCurrentSong() {
  if (Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length) return playQueue[currentIdx];
  if (Array.isArray(playlist) && currentIdx >= 0 && currentIdx < playlist.length) return playlist[currentIdx];
  return null;
}
function sonicWorkshopCurrentCoverKey() {
  try {
    var domSrc = sonicWorkshopCurrentCoverDomSource();
    if (domSrc) return String(domSrc);
    var song = sonicWorkshopCurrentSong();
    if (!song) return '';
    if (typeof songCoverSrc === 'function') return String(songCoverSrc(song, 400) || song.cover || song.id || '');
    return String(song.customCover || song.cover || song.id || song.name || '');
  } catch (e) {
    return '';
  }
}
function sonicWorkshopCurrentCoverDomSource() {
  try {
    if (typeof currentCoverSource !== 'undefined' && currentCoverSource && currentCoverSource.src) return String(currentCoverSource.src || '');
  } catch (e) { }
  try {
    var thumb = document.getElementById('thumb-cover');
    var thumbAttr = thumb && thumb.getAttribute('src');
    var thumbSrcSet = thumb && thumb.getAttribute('srcset');
    // 空 src 会解析为当前文档 URL；只有实际声明的图片来源才允许读 currentSrc。
    var thumbSrc = thumb && (thumbAttr || thumbSrcSet ? (thumb.currentSrc || thumbAttr) : '');
    if (thumbSrc) return String(thumbSrc);
  } catch (e) { }
  try {
    var bg = document.getElementById('album-bg');
    var style = bg && window.getComputedStyle ? window.getComputedStyle(bg).backgroundImage : '';
    var m = style && style.match(/url\(["']?(.+?)["']?\)/i);
    if (m && m[1]) return m[1];
  } catch (e) { }
  return '';
}
function sonicWorkshopCurrentCoverSampleSrc() {
  var domSrc = sonicWorkshopCurrentCoverDomSource();
  if (domSrc) {
    if (/^data:image\//i.test(domSrc) || /^blob:/i.test(domSrc) || /^\/api\/cover\?/i.test(domSrc) || /^https?:\/\/[^/]+\/api\/cover\?/i.test(domSrc)) return domSrc;
    if (typeof coverProxySrc === 'function') return coverProxySrc(domSrc, false) || domSrc;
    return domSrc;
  }
  var song = sonicWorkshopCurrentSong();
  if (!song) return '';
  var src = '';
  try {
    src = typeof songCoverSrc === 'function' ? songCoverSrc(song, 256) : (song.customCover || song.cover || '');
  } catch (e) {
    src = song.customCover || song.cover || '';
  }
  if (!src) return '';
  if (/^data:image\//i.test(src) || /^blob:/i.test(src) || /^\/api\/cover\?/i.test(src)) return src;
  if (typeof coverProxySrc === 'function') return coverProxySrc(src, false) || src;
  return src;
}
function sonicWorkshopCssFromSample(sample, fallback) {
  if (!sample) return fallback || '#cb6c89';
  if (typeof lyricCoverSampleCss === 'function') return lyricCoverSampleCss(sample, fallback || '#cb6c89');
  return '#' + ['r', 'g', 'b'].map(function (key) {
    return Math.round(clampRange(Number(sample[key]) || 0, 0, 255)).toString(16).padStart(2, '0');
  }).join('');
}
function buildSonicWorkshopUiPaletteFromCanvas(canvas, key) {
  if (!canvas || !canvas.width || !canvas.height) return null;
  try {
    var ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var img = ctx.getImageData(0, 0, w, h).data;
    var buckets = {};
    var count = 0;
    var sumR = 0, sumG = 0, sumB = 0;
    var fallbackList = [];
    var step = Math.max(2, Math.floor(Math.max(w, h) / 96));
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        var di = (y * w + x) * 4;
        var a = img[di + 3] / 255;
        if (a < 0.5) continue;
        var r = img[di], g = img[di + 1], b = img[di + 2];
        count++;
        sumR += r; sumG += g; sumB += b;
        if (typeof lyricCoverAddAreaBucket === 'function') lyricCoverAddAreaBucket(buckets, r, g, b);
        else fallbackList.push({ r: r, g: g, b: b, score: 1 });
      }
    }
    if (!count) return null;
    var areaPalette = typeof lyricCoverAreaPaletteFromBuckets === 'function'
      ? lyricCoverAreaPaletteFromBuckets(buckets)
      : null;
    if (!areaPalette) {
      fallbackList.sort(function (a, b) { return b.score - a.score; });
      areaPalette = {
        primary: fallbackList[0],
        base: fallbackList[0],
        warm: fallbackList[0],
        cool: fallbackList[0],
        light: fallbackList[0],
        accent: fallbackList[0],
        colors: []
      };
    }
    var avg = {
      r: Math.round(sumR / count),
      g: Math.round(sumG / count),
      b: Math.round(sumB / count),
      score: count
    };
    var palette = {
      rawAreaPrimary: sonicWorkshopCssFromSample(areaPalette.primary, '#cb6c89'),
      rawAreaBase: sonicWorkshopCssFromSample(areaPalette.base, '#16060f'),
      rawAreaWarm: sonicWorkshopCssFromSample(areaPalette.warm, '#cb6c89'),
      rawAreaCool: sonicWorkshopCssFromSample(areaPalette.cool, '#99c4ff'),
      rawAreaLight: sonicWorkshopCssFromSample(areaPalette.light, '#f8d8ff'),
      rawAreaAccent: sonicWorkshopCssFromSample(areaPalette.accent, '#99c4ff'),
      rawAverage: sonicWorkshopCssFromSample(avg, '#cb6c89'),
      sonicWorkshopColors: Array.isArray(areaPalette.colors) ? areaPalette.colors.slice(0, 10) : [],
      coverColors: [],
      coverSourceKey: key || '',
      sonicWorkshopCoverKey: key || ''
    };
    [
      palette.rawAreaPrimary,
      palette.rawAreaBase,
      palette.rawAreaWarm,
      palette.rawAreaCool,
      palette.rawAreaLight,
      palette.rawAreaAccent,
      palette.rawAverage
    ].forEach(function (color) {
      if (typeof lyricCoverPushUniqueColor === 'function') lyricCoverPushUniqueColor(palette.coverColors, color);
      else if (palette.coverColors.indexOf(color) < 0) palette.coverColors.push(color);
    });
    return palette;
  } catch (e) {
    return null;
  }
}
function sonicWorkshopPaletteLooksCurrent(pal, key) {
  if (!pal) return false;
  var hasArea = !!(pal.rawAreaPrimary || pal.rawPrimary || pal.sonicWorkshopColors && pal.sonicWorkshopColors.length);
  if (!hasArea) return false;
  var palKey = String(pal.sonicWorkshopCoverKey || pal.coverSourceKey || '');
  if (key && !palKey) return false;
  if (!key || !palKey) return true;
  return palKey === key;
}
function sonicWorkshopUiPaletteForKey(key) {
  var pal = sonicWorkshopCoverUiSample.palette;
  return sonicWorkshopPaletteLooksCurrent(pal, key || sonicWorkshopCurrentCoverKey()) ? pal : null;
}
function applySonicWorkshopCoverCanvasForUi(canvas, key) {
  if (!canvas) return false;
  if (sonicWorkshopCoverUiSample.refreshing) return false;
  sonicWorkshopCoverUiSample.refreshing = true;
  try {
    var uiPalette = buildSonicWorkshopUiPaletteFromCanvas(canvas, key);
    if (uiPalette) {
      sonicWorkshopCoverUiSample.palette = uiPalette;
      if (typeof stageLyrics !== 'undefined' && stageLyrics) {
        stageLyrics.coverPalette = Object.assign({}, stageLyrics.coverPalette || {}, uiPalette);
      }
    }
    if (typeof updateLyricPaletteFromCover === 'function') updateLyricPaletteFromCover(canvas);
    if (stageLyrics && stageLyrics.coverPalette) {
      if (uiPalette) stageLyrics.coverPalette = Object.assign({}, stageLyrics.coverPalette, uiPalette);
      stageLyrics.coverPalette.sonicWorkshopCoverKey = key || stageLyrics.coverPalette.sonicWorkshopCoverKey || '';
      stageLyrics.coverPalette.coverSourceKey = key || stageLyrics.coverPalette.coverSourceKey || '';
    }
    sonicWorkshopCoverUiSample.key = key || sonicWorkshopCoverUiSample.key || '';
    return !!uiPalette || !!(stageLyrics && stageLyrics.coverPalette);
  } catch (e) {
    console.warn('sonic workshop cover UI palette failed:', e);
    return false;
  } finally {
    sonicWorkshopCoverUiSample.refreshing = false;
  }
}
function ensureSonicWorkshopCoverPaletteForUi() {
  if (sonicWorkshopCoverUiSample.refreshing) return;
  var pal = stageLyrics && (stageLyrics.coverPalette || stageLyrics.palette) || {};
  var key = sonicWorkshopCurrentCoverKey();
  if (sonicWorkshopUiPaletteForKey(key)) return;
  if (sonicWorkshopPaletteLooksCurrent(pal, key)) return;
  if (typeof coverPickerCanvas !== 'undefined' && coverPickerCanvas) {
    if (applySonicWorkshopCoverCanvasForUi(coverPickerCanvas, key)) return;
  }
  var src = sonicWorkshopCurrentCoverSampleSrc();
  if (!src || sonicWorkshopCoverUiSample.loading && sonicWorkshopCoverUiSample.key === key) return;
  var token = ++sonicWorkshopCoverUiSample.token;
  sonicWorkshopCoverUiSample.loading = true;
  sonicWorkshopCoverUiSample.key = key;
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = function () {
    if (token !== sonicWorkshopCoverUiSample.token) return;
    sonicWorkshopCoverUiSample.loading = false;
    var size = 96;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var cx = cv.getContext('2d');
    var iw = img.naturalWidth || img.width || size;
    var ih = img.naturalHeight || img.height || size;
    var crop = Math.min(iw, ih);
    try {
      cx.drawImage(img, (iw - crop) / 2, (ih - crop) / 2, crop, crop, 0, 0, size, size);
      applySonicWorkshopCoverCanvasForUi(cv, key);
      updateSonicWorkshopColorControls();
      if (window.MineradioSonicWorkshop && typeof MineradioSonicWorkshop.pushProperties === 'function') MineradioSonicWorkshop.pushProperties(true);
    } catch (e) {
      console.warn('sonic workshop cover UI sample failed:', e);
    }
  };
  img.onerror = function () {
    if (token !== sonicWorkshopCoverUiSample.token) return;
    sonicWorkshopCoverUiSample.loading = false;
  };
  img.src = src;
}
function sonicWorkshopPaletteForUi() {
  return sonicWorkshopUiPaletteForKey(sonicWorkshopCurrentCoverKey()) || stageLyrics && (stageLyrics.coverPalette || stageLyrics.palette) || {};
}
function sonicWorkshopCoverHex(role) {
  var pal = sonicWorkshopPaletteForUi();
  role = String(role || 'primary');
  var fallback = role === 'base' ? '#16060f' : (role === 'cool' || role === 'peak' ? '#99c4ff' : (role === 'ripple' ? '#f8d8ff' : '#cb6c89'));
  var value = pal.rawAreaPrimary || pal.rawPrimary || pal.primary || pal.highlight || pal.secondary;
  if (role === 'base') value = pal.rawAreaBase || pal.rawDark || pal.rawAverage || pal.secondary || pal.rawAreaPrimary || pal.rawPrimary || pal.primary;
  else if (role === 'warm') value = pal.rawAreaWarm || pal.rawAreaPrimary || pal.rawWarm || pal.rawPrimary || pal.secondary || pal.primary || pal.highlight;
  else if (role === 'cool') value = pal.rawAreaCool || pal.rawAreaLight || pal.rawCool || pal.rawLight || pal.highlight || pal.rawAreaPrimary || pal.rawPrimary || pal.primary;
  else if (role === 'ripple') value = pal.rawAreaLight || pal.rawAreaAccent || pal.rawLight || pal.rawAccent || pal.rawAreaCool || pal.rawCool || pal.highlight || pal.primary;
  else if (role === 'peak') value = pal.rawAreaAccent || pal.rawAreaCool || pal.rawAreaLight || pal.rawCool || pal.rawAccent || pal.rawLight || pal.highlight || pal.primary;
  return sonicRawPaletteHex(value, fallback);
}
function sonicWorkshopThemeForColor(hex) {
  var rgb = sonicHexRgb(hex, '#cb6c89');
  var hsl = typeof rgbToHsl === 'function' ? rgbToHsl(rgb.r, rgb.g, rgb.b) : { h: 0, s: 0.5, l: 0.5 };
  if (hsl.s < 0.08) return 'minimal-monochrome';
  if (hsl.h < 0.035 || hsl.h >= 0.94) return 'crimson-sunset';
  if (hsl.h < 0.10) return 'coral-mirage';
  if (hsl.h < 0.14) return 'ember-fire';
  if (hsl.h < 0.18) return 'golden-hour';
  if (hsl.h < 0.42) return 'cyber-forest';
  if (hsl.h < 0.66) return 'arctic-aurora';
  if (hsl.h < 0.74) return 'ocean-deep';
  return 'neon-tokyo';
}
function currentSonicWorkshopTheme() {
  if (fx.sonicWorkshopColorMode === 'custom') return normalizeSonicWorkshopTheme(fx.sonicWorkshopTheme);
  return sonicWorkshopThemeForColor(sonicWorkshopCoverHex('primary'));
}
function sonicWorkshopRegionHex(item) {
  item = sonicWorkshopRegionControl(item);
  if (!item) return '#cb6c89';
  var fallback = item.fallback || '#cb6c89';
  if (fx[item.modeKey] === 'custom') return normalizeHexColor(fx[item.colorKey] || fallback, fallback);
  return normalizeHexColor(sonicWorkshopCoverHex(item.role), fallback);
}
function updateSonicWorkshopColorControls() {
  ensureSonicWorkshopCoverPaletteForUi();
  var theme = currentSonicWorkshopTheme();
  var meta = SONIC_WORKSHOP_THEMES[theme] || SONIC_WORKSHOP_THEMES['coral-mirage'];
  SONIC_WORKSHOP_COLOR_CONTROLS.forEach(function (item) {
    var coverMode = fx[item.modeKey] !== 'custom';
    var hex = sonicWorkshopRegionHex(item);
    var picker = document.getElementById(item.picker);
    var value = document.getElementById(item.value);
    var coverBtn = document.getElementById(item.button);
    if (picker) picker.value = normalizeHexColor(hex, item.fallback);
    if (value) {
      value.textContent = coverMode
        ? ('\u5c01\u9762 ' + hex.toUpperCase() + (item.id === 'theme' ? ' / ' + meta.label : ''))
        : ('\u56fa\u5b9a ' + hex.toUpperCase() + (item.id === 'theme' ? ' / ' + meta.label : ''));
    }
    if (coverBtn) coverBtn.classList.toggle('active', coverMode);
  });
  document.querySelectorAll('#sonic-workshop-theme-seg [data-sonic-workshop-theme]').forEach(function (btn) {
    btn.classList.toggle('active', fx.sonicWorkshopColorMode === 'custom' && normalizeSonicWorkshopTheme(btn.getAttribute('data-sonic-workshop-theme')) === theme);
  });
}
function pushSonicWorkshopColorChange(reason) {
  updateSonicWorkshopColorControls();
  var workshop = window.MineradioSonicWorkshop;
  if (workshop && typeof workshop.pushProperties === 'function') workshop.pushProperties(true);
  if (typeof syncFxUniforms === 'function') syncFxUniforms();
  saveLyricLayout({ user: true, reason: reason || 'sonicWorkshopRegionColors' });
}
function setSonicWorkshopRegionColorMode(id, mode, silent) {
  var item = sonicWorkshopRegionControl(id);
  if (!item) return;
  fx[item.modeKey] = mode === 'custom' ? 'custom' : 'cover';
  pushSonicWorkshopColorChange(item.id === 'theme' ? 'sonicWorkshopColorMode' : item.colorKey);
  if (!silent) showToast('\u97f3\u57df\u56de\u54cd\u00b7WE ' + item.label + ': ' + (fx[item.modeKey] === 'cover' ? '\u5c01\u9762\u53d6\u8272' : '\u56fa\u5b9a\u989c\u8272'));
}
function setSonicWorkshopColorMode(mode, silent) {
  setSonicWorkshopRegionColorMode('theme', mode, silent);
}
function setSonicWorkshopTheme(theme, silent) {
  theme = normalizeSonicWorkshopTheme(theme);
  var meta = SONIC_WORKSHOP_THEMES[theme] || SONIC_WORKSHOP_THEMES['coral-mirage'];
  fx.sonicWorkshopColorMode = 'custom';
  fx.sonicWorkshopTheme = theme;
  fx.sonicWorkshopCustomColor = normalizeHexColor(meta.color, '#cb6c89');
  SONIC_WORKSHOP_COLOR_CONTROLS.forEach(function (item) {
    if (item.id === 'theme') return;
    fx[item.modeKey] = 'custom';
    fx[item.colorKey] = normalizeHexColor(meta[item.id] || item.fallback, item.fallback);
  });
  pushSonicWorkshopColorChange('sonicWorkshopRegionColors');
  if (!silent) showToast('\u97f3\u57df\u56de\u54cd\u00b7WE: ' + meta.label);
}
function setSonicWorkshopThemeFromPicker(color, silent) {
  var hex = normalizeHexColor(color || '#cb6c89', '#cb6c89');
  var theme = sonicWorkshopThemeForColor(hex);
  var meta = SONIC_WORKSHOP_THEMES[theme] || SONIC_WORKSHOP_THEMES['coral-mirage'];
  fx.sonicWorkshopColorMode = 'custom';
  fx.sonicWorkshopTheme = theme;
  fx.sonicWorkshopCustomColor = hex;
  SONIC_WORKSHOP_COLOR_CONTROLS.forEach(function (item) {
    if (item.id === 'theme') return;
    fx[item.modeKey] = 'custom';
    fx[item.colorKey] = normalizeHexColor(meta[item.id] || item.fallback, item.fallback);
  });
  pushSonicWorkshopColorChange('sonicWorkshopRegionColors');
  if (!silent) showToast('\u97f3\u57df\u56de\u54cd\u00b7WE ' + SONIC_WORKSHOP_COLOR_CONTROLS[0].label + ': ' + fx.sonicWorkshopCustomColor.toUpperCase());
}
function setSonicWorkshopRegionColorFromPicker(id, color, silent) {
  var item = sonicWorkshopRegionControl(id);
  if (!item) return;
  if (item.id === 'theme') {
    setSonicWorkshopThemeFromPicker(color, silent);
    return;
  }
  var hex = normalizeHexColor(color || item.fallback, item.fallback);
  fx[item.modeKey] = 'custom';
  fx[item.colorKey] = hex;
  pushSonicWorkshopColorChange(item.colorKey);
  if (!silent) showToast('\u97f3\u57df\u56de\u54cd\u00b7WE ' + item.label + ': ' + hex.toUpperCase());
}

// ===== \u754c\u9762\u4e3b\u9898(\u7f51\u9875\u7248\u89c4\u6574\u800c\u6765)=====
// js/runtime-themes.js \u63d0\u4f9b 6 \u5957\u7ed3\u6784\u8272(default/midnight/ember/violet/aurora/rose);
// default \u7684\u7ed3\u6784\u503c\u4e0e\u672c\u5730 :root \u9010\u9879\u4e00\u81f4,\u6240\u4ee5\u4e0d\u9009\u4e3b\u9898\u65f6\u5b8c\u5168\u7b49\u4ef7\u4e8e\u65e7\u884c\u4e3a\u3002
function normalizeAppThemeId(id) {
  if (window.MineradioThemes && typeof window.MineradioThemes.normalize === 'function') {
    return window.MineradioThemes.normalize(id);
  }
  return 'default';
}
function getAppThemeMeta(id) {
  if (window.MineradioThemes && typeof window.MineradioThemes.get === 'function') {
    return window.MineradioThemes.get(id);
  }
  return { id: 'default', name: '\u9ed8\u8ba4' };
}
function applyAppThemeStructure(id) {
  if (window.MineradioThemes && typeof window.MineradioThemes.applyStructure === 'function') {
    return window.MineradioThemes.applyStructure(id);
  }
}
function renderAppThemeGrid() {
  var grid = document.getElementById('app-theme-grid');
  if (!grid || !window.MineradioThemes || typeof window.MineradioThemes.list !== 'function') return;
  var active = normalizeAppThemeId(fx && fx.appTheme);
  grid.innerHTML = window.MineradioThemes.list().map(function (theme) {
    var swatches = (theme.swatch || []).map(function (color) {
      return '<span class="app-theme-swatch" style="background:' + escHtml(color) + '"></span>';
    }).join('');
    return '<button type="button" class="app-theme-card' + (theme.id === active ? ' active' : '') + '" data-app-theme="' + escHtml(theme.id) + '" role="option" aria-selected="' + (theme.id === active ? 'true' : 'false') + '" title="' + escHtml(theme.name) + '">' +
      '<span class="app-theme-check" aria-hidden="true"></span>' +
      '<span class="app-theme-swatches">' + swatches + '</span>' +
      '<span class="app-theme-copy"><span class="app-theme-name">' + escHtml(theme.name) + '</span><span class="app-theme-desc">' + escHtml(theme.desc || '') + '</span></span>' +
      '</button>';
  }).join('');
}
function setAppTheme(id, opts) {
  opts = opts || {};
  var themeId = normalizeAppThemeId(id);
  var theme = getAppThemeMeta(themeId);
  fx.appTheme = themeId;
  applyAppThemeStructure(themeId);
  if (opts.syncFx !== false && window.MineradioThemes && typeof window.MineradioThemes.getFxDefaults === 'function') {
    var defs = window.MineradioThemes.getFxDefaults(themeId) || {};
    if (defs.uiAccentColor) fx.uiAccentColor = normalizeHexColor(defs.uiAccentColor, '#00f5d4');
    if (defs.homeAccentColor) fx.homeAccentColor = normalizeHexColor(defs.homeAccentColor, '#00f5d4');
    if (defs.homeIconColor) fx.homeIconColor = normalizeHexColor(defs.homeIconColor, '#f4d28a');
    if (defs.visualIconColor) fx.visualIconColor = normalizeHexColor(defs.visualIconColor, '#7fd8ff');
    if (defs.visualTintColor) fx.visualTintColor = normalizeHexColor(defs.visualTintColor, '#9db8cf');
    if (defs.shelfAccentColor) fx.shelfAccentColor = normalizeHexColor(defs.shelfAccentColor, fx.uiAccentColor);
    if (fx.visualTintMode !== 'custom') fx.visualTintMode = 'auto';
    if (typeof updateUiAccentControls === 'function') updateUiAccentControls();
    if (typeof updateHomeAccentControls === 'function') updateHomeAccentControls();
    if (typeof updateIconAccentControls === 'function') updateIconAccentControls();
    if (typeof updateVisualTintControls === 'function') updateVisualTintControls();
    if (typeof updateShelfControlUi === 'function') updateShelfControlUi();
    if (typeof shelfManager !== 'undefined' && shelfManager && shelfManager.refreshTheme) shelfManager.refreshTheme();
  }
  renderAppThemeGrid();
  if (!opts.skipSave) saveLyricLayout({ user: true, reason: 'appTheme' });
  if (!opts.silent) showToast('\u754c\u9762\u4e3b\u9898: ' + (theme.name || themeId));
}
function initAppThemeFromState() {
  if (typeof fx === 'undefined' || !fx) return;
  fx.appTheme = normalizeAppThemeId(fx.appTheme || (window.MineradioThemes ? window.MineradioThemes.readStored() : 'default'));
  applyAppThemeStructure(fx.appTheme);
  renderAppThemeGrid();
}
function bindAppThemeGrid() {
  var grid = document.getElementById('app-theme-grid');
  if (!grid || grid._themeBound) return;
  grid._themeBound = true;
  grid.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-app-theme]') : null;
    if (!btn) return;
    setAppTheme(btn.getAttribute('data-app-theme'));
  });
}
