// 已退役预设仍保留索引迁移，避免旧存档错误地指向后续预设。
var HIDDEN_PRESET_INDICES = [11];
var HIDDEN_PRESET_FALLBACK = 9;   // 隐藏预设的落点：雨境
function isPresetHidden(id) {
  return HIDDEN_PRESET_INDICES.indexOf(Number(id)) >= 0;
}
// 拖动跟随与松手惯性是两条独立的物理链：这里的数值只控制目标到显示状态的缓冲。
var POINTER_DRAG_FOLLOW_DEFAULT_60FPS = 0.055;
var POINTER_DRAG_FOLLOW_LEVELS = {
  light: 0.22,
  medium: 0.12,
  'medium-strong': POINTER_DRAG_FOLLOW_DEFAULT_60FPS,
  strong: 0.032
};
function normalizePointerDragFollowMode(value) {
  value = String(value || '');
  return Object.prototype.hasOwnProperty.call(POINTER_DRAG_FOLLOW_LEVELS, value) ? value : 'medium-strong';
}
function pointerDragFollowRateForMode(mode) {
  return POINTER_DRAG_FOLLOW_LEVELS[normalizePointerDragFollowMode(mode)];
}
function getPointerDragFollowRate() {
  var mode = (typeof fx !== 'undefined' && fx && fx.pointerDragFollowMode)
    || (typeof fxDefaults !== 'undefined' && fxDefaults && fxDefaults.pointerDragFollowMode)
    || 'medium-strong';
  return pointerDragFollowRateForMode(mode);
}
function pointerDragFollowBlend(dt) {
  var frames = Math.max(0, Math.min(6, (Number(dt) || 0) * 60));
  if (frames <= 0) return 0;
  return 1 - Math.pow(1 - getPointerDragFollowRate(), frames);
}
var fxDefaults = {
  preset: 0,            // 0=emily cover, 1=tunnel, 2=orbit, 3=void, 4=vinyl, 5=wallpaper, 6=skull
  intensity: 0.85,
  cinemaShake: 0.5,
  depth: 1.0,
  coverResolution: 1.0,   // 默认降档:映射 118×118≈13.9k 点(原 1.55=183×183=33.5k,无风扇 mac 首帧即满载);滑块上限仍 1.55,已存档用户值不迁移
  point: 1.0, speed: 1.0, twist: 0.0, color: 1.10, scatter: 0.0, bgFade: 0.20,
  bloomStrength: 0.62,
  lyricGlowStrength: 0.28,
  lyricBackgroundAdapt: 0.72,
  lyricScale: 1.0,
  lyricOffsetX: 0,
  lyricOffsetY: 0,
  lyricOffsetZ: 0,
  lyricTiltX: 0,
  lyricTiltY: 0,
  lyricColorMode: 'auto',
  lyricColor: '#a9b8c8',
  lyricHighlightMode: 'auto',
  lyricHighlightColor: '#fac900',
  lyricGlowLinked: true,
  lyricGlowColor: '#008aff',
  lyricDisplayMode: 'single',
  lyricTranslationMode: 'off',
  lyricMotionStyle: 'float',
  lyricRasterQuality: 1, // 歌词纹理超采样档位:1x/2x/3x/4x,默认不改变现有显存预算
  lyricScalePulse: 0,    // 歌词缩放脉动:0=关(稳定缩放),>0 做规律放大缩小(用户可调可关)
  lyricCustomLineCount: 5,
  lyricGlitchCameraBind: false,
  lyricGlitchIntensity: 1.0,
  lyricGlitchSlice: 0.25,   // 原 0.72 太猛:水平切片位移把字横向劈成"叠影/重叠"(用户截到的 00在);降到 0.25 保留故障感但字不再劈开
  lyricGlitchChroma: 0.6,   // 原 0.86:RGB 色散过强也在加重叠;降一档,仍有故障色边
  lyricGlitchRate: 1.0,
  lyricGlitchJitter: 0.35,  // 原 0.72:抖动过大= 字发糊/重影;减半
  lyricContextOpacity: 0.72,
  lyricContextSpread: 1.12,
  lyricTranslationGap: 0.42,
  lyricTranslationScale: 0.78,
  lyricTranslationOpacity: 0.86,
  lyricEdgeFade: 0.46,
  lyricMotionSoftness: 0.72,
  lyricFont: 'hei',
  lyricLetterSpacing: 0,
  lyricLineHeight: 1.0,
  lyricWeight: 900,
  visualTintMode: 'auto',
  visualTintColor: '#9db8cf',
  uiAccentColor: '#ffffff',
  homeAccentColor: '#ffffff',
  homeIconColor: '#ffffff',
  visualIconColor: '#ffffff',
  backgroundColorMode: 'cover',
  backgroundColor: '#000000',
  backgroundOpacity: 1,
  windowBackgroundOpacity: 1,
  backgroundGlassOpacity: 0,
  controlGlassChromaticOffset: 0,   // 上游默认 90:三通道位移在无风扇 mac 上让 GPU 进程 CPU 近乎翻倍(实测 54%→120%),音频跟着出砂;默认关,想要色散拉滑杆
  playlistPanelGlassBlur: 38,
  playlistPanelGlassDensity: 0.92,
  playlistPanelOpenDuration: 0.34,
  playlistPanelCloseDuration: 0.26,
  backgroundColorCustom: false,
  backgroundImage: '',
  backgroundMedia: null,
  backgroundAlbumCover: false,
  albumBackgroundMouseBind: false,
  wallpaperMouseParallax: false,
  backgroundMediaCropX: 50,
  backgroundMediaCropY: 50,
  backgroundMediaZoom: 1,
  desktopLyrics: false,
  desktopLyricsSize: 1.0,
  desktopLyricsOpacity: 0.92,
  desktopLyricsY: 0.76,
  desktopLyricsClickThrough: false,
  desktopLyricsCinema: true,
  desktopLyricsHighlight: false,
  desktopLyricsFps: 60,
  wallpaperMode: false,
  wallpaperOpacity: 1,
  floatLayer: false, cinema: true, edge: false, aiDepth: false, bloom: false, lyricGlow: true,
  lyricGlowBeat: true,
  lyricGlowParticles: false,
  lyricVerticalFloat: true,
  backgroundStarRiver: true,
  lyricPauseHold: true,
  lyricCameraLock: false,
  particleLyrics: true,    // v7.2: 粒子歌词
  backCover: false,        // 旧的封面背面粒子层关闭；浮空粒子层会跟随封面翻转
  shelf: 'side',
  shelfPinnedOpen: false,
  shelfCameraMode: 'dynamic',
  shelfPresence: 'always',
  shelfShowPodcasts: false,
  shelfMergeCollections: false,
  shelfSize: 1,
  shelfOffsetX: 0,
  shelfOffsetY: 0,
  shelfOffsetZ: 0,
  shelfAngleY: -15,
  shelfAngleYManual: false,
  shelfOpacity: 1,
  shelfBgOpacity: 0.90,
  shelfAccentColor: '#ffffff',
  shelfDetailOffsetX: 0,
  shelfDetailOffsetY: 0,
  shelfDetailOffsetZ: 0,
  shelfDetailScale: 1,
  shelfDetailAngleX: 0,
  shelfDetailAngleY: 0,
  shelfDetailRowGap: 1,
  shelfDetailOpenDuration: 0.48,
  shelfDetailCloseDuration: 0.18,
  shelfDetailRowDuration: 0.72,
  shelfDetailIntroStrength: 1,
  shelfDetailParallax: 1,
  shelfSummonOpenDuration: 0.62,
  shelfSummonCloseDuration: 0.46,
  shelfSummonSlide: 1,
  shelfSummonStagger: 1,
  shelfSummonScale: 1,
  shelfSummonParallax: 1,
  shelfCameraEnterSpeed: 1,
  shelfCameraExitSpeed: 1,
  performanceBackground: 'auto',
  performanceQuality: 'auto',   // 自动 = 按实测帧率自适应治理(见 08-desktop-render-power 自适应治理器);静态档 eco/balanced/high/ultra 不再联动画质滑块/体素密度
  foregroundFpsMode: 'vsync',
  maxFps: 0,
  memoryAutoTrimApp: true,
  memoryAutoTrimOnBackground: true,
  memoryAutoSystemTrim: false,
  memorySystemAutoElevate: false,
  memorySystemIntervalMin: 30,
  memorySystemThresholdPercent: 78,
  memorySystemMask: 29,
  memorySafetyRevision: 3,
  liveBackgroundKeep: false,
  cam: 'off',
  pointerDragFollowMode: 'medium-strong', // 拖动缓冲:弱/中/中强/强;不改变松手后的 0.90 惯性阻尼
  // 音域回响(体素地形)预设 + 全局背景
  voxAutoRotate: true,
  voxRes: 'mid',
  voxCoverColor: true,
  voxMeteors: true,
  voxGhostCover: true,   // 音域回响:上方封面图层
  rainGhostCover: true,  // 雨境:湿玻璃幽灵封面
  rainAmount: 1.0,       // 雨境:雨量倍率(0.05 毛毛雨 ~ 4.0 暴雨)
  rainThunder: 0.70,     // 雨境:打雷节奏阈值(低=更易闪,高=更稀)
  rainThunderMode: 'music', // 雨境:off=关闭 / music=跟随音乐 / random=随机打雷
  rainRandomFrequency: 15, // 雨境:随机打雷的平均间隔秒数(4~40)
  rainRandomThunder: false, // 兼容旧版存档；运行时由 rainThunderMode 决定
  rainGlassEnabled: true, // 雨境:玻璃水珠滑落后处理
  rainGlassAmount: 0.70,  // 雨境:玻璃水珠数量(0.15~2.5)
  rainGlassSpeed: 5.00,   // 雨境:玻璃水珠流速(0.2~16.0)
  rainGlassSize: 1.00,    // 雨境:玻璃水珠尺寸(0.6~1.8)
  rainWindOffset: 0,      // 雨境:风向偏移(-1 左飘 ~ 1 右飘),叠加在中频驱动风向上
  rainDensity: 1.0,       // 雨境:雨幕浓度(0.3 稀疏 ~ 1.5 浓密),缩放雨丝整体强度
  voxFloatBlocks: true,  // 音域回响:悬浮方块(蓝方块+白线框)
  voxShimmer: true,      // 音域回响:地形散落发光小方块的顶面闪烁/棱边火花/微光(关=uShimmer 0)
  voxSensitivity: 1.0,
  voxRotateSpeed: 0.5,
  voxColor: '',
  voxRippleColor: '',   // 冲击波(涟漪)独立取色:''=自动(封面第二主色/现状色);管道与 voxColor 完全镜像(同样不入存档)
  voxBgColor: '',
  voxBgImage: '',
  voxPlaylistColor: '',
  // 声波地形(音域地形)预设 12 + 声波工坊(音域回响·WE)预设 13 —— Windows v2.1.0 迁移
  sonicGroundAmplitude: 50,
  sonicGroundMotionSpeed: 50,
  sonicGroundDensity: 46,
  sonicGroundRange: 82,
  sonicGroundLower: 68,
  sonicGroundDepth: 62,
  sonicGroundAutoRotate: 50,
  sonicGroundColorMode: 'cover',
  sonicGroundBaseColor: '#05070c',
  sonicGroundCoolColor: '#0066ff',
  sonicGroundWarmColor: '#ff3c19',
  sonicGroundAccentColor: '#33e6ff',
  sonicGroundGlow: 20,
  sonicGroundSubBass: 90,
  sonicGroundBass: 92,
  sonicGroundLowMid: 50,
  sonicGroundMid: 50,
  sonicGroundHighMid: 50,
  sonicGroundPresence: 25,
  sonicGroundBrilliance: 50,
  sonicGroundAir: 48,
  sonicGroundFloatingEnabled: true,
  sonicGroundFloatingIntensity: 36,
  sonicGroundFloatingMinSize: 9,
  sonicGroundFloatingMaxSize: 12,
  sonicGroundFloatingSpeed: 59,
  sonicGroundFloatingCount: 80,
  sonicAudioMonitorEnabled: true,
  sonicAudioAutoTrack: true,
  sonicAudioSensitivity: 100,
  sonicAudioBandStart: 1,
  sonicAudioBandEnd: 4,
  sonicAudioThreshold: 32,
  sonicAudioPulseStrength: 62,
  sonicWorkshopInputGain: 82,
  sonicWorkshopAudioIntensity: 1.15,
  sonicWorkshopResponseRange: 1.30,
  sonicWorkshopPeakIntensity: 0.62,
  sonicWorkshopColorMode: 'cover',
  sonicWorkshopTheme: 'minimal-monochrome',
  sonicWorkshopCustomColor: '#d9dde3',
  sonicWorkshopBaseColorMode: 'cover',
  sonicWorkshopBaseColor: '#0b0c0e',
  sonicWorkshopWarmColorMode: 'cover',
  sonicWorkshopWarmColor: '#d9dde3',
  sonicWorkshopCoolColorMode: 'custom',
  sonicWorkshopCoolColor: '#ffffff',
  sonicWorkshopRippleColorMode: 'cover',
  sonicWorkshopRippleColor: '#ffffff',
  sonicWorkshopPeakColorMode: 'cover',
  sonicWorkshopPeakColor: '#f2f5f8',
};
function normalizeLyricRasterQuality(value) {
  var isNumericInput = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  var quality = isNumericInput ? Number(value) : NaN;
  return [1, 2, 3, 4].indexOf(quality) >= 0 ? quality : (fxDefaults.lyricRasterQuality || 1);
}
function normalizeForegroundFpsMode(value) {
  var mode = String(value || '').trim().toLowerCase();
  if (mode === 'vsync' || mode === 'adaptive') return mode;
  if (/^(45|60|75|90|120)$/.test(mode)) return mode;
  return fxDefaults.foregroundFpsMode || 'vsync';
}
function foregroundFixedFpsForMode(mode) {
  mode = normalizeForegroundFpsMode(mode);
  if (mode === 'vsync') return 0;
  if (mode === 'adaptive') return null;
  return Math.max(1, Number(mode) || 60);
}
