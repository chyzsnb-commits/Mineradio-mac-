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
  lyricDepthWordSweep: true,        // 词境穿行：底色常亮，逐字流光随演唱进度覆盖
  lyricDepthInteraction: false,     // 词境穿行：360° 词境漫游（用户主动开启）
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
  perspectiveMode: false,       // 摄像头实景作底层，保留歌词 / 封面 / 粒子 / 音域内容
  backgroundAlbumCover: false,
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
  // 音域回响(体素地形)预设 + 全局背景
  voxAutoRotate: true,
  voxRes: 'mid',
  voxCoverColor: true,
  voxMeteors: true,
  voxGhostCover: true,   // 音域回响:上方封面图层
  voxFloatBlocks: true,  // 音域回响:悬浮方块(蓝方块+白线框)
  voxFloatBlockScale: 1, // 1=原版大小，2=移植版大方块观感；只缩放现有实例，不增加数量
  voxShimmer: true,      // 音域回响:地形散落发光小方块的顶面闪烁/棱边火花/微光(关=uShimmer 0)
  voxSensitivity: 1.0,
  voxRotateSpeed: 0.5,
  voxColor: '',
  voxRippleColor: '',   // 冲击波(涟漪)独立取色:''=自动(封面第二主色/现状色);管道与 voxColor 完全镜像(同样不入存档)
  voxBgColor: '',
  voxBgImage: '',
  voxPlaylistColor: '',
};
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
