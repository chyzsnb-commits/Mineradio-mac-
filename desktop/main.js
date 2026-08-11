const { app, BrowserWindow, ipcMain, shell, screen, session, globalShortcut, dialog, Tray, Menu, crashReporter, powerMonitor, protocol } = require('electron');
const net = require('net');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { execFile, spawn } = require('child_process');
// 内存清理模块：Windows 用 system-memory.js（PowerShell + Win32 API），
// Mac 用 system-memory-mac.js（vm_stat + purge，参考腾讯柠檬清理逻辑）。
// 见 AGENTS.md 关键约束 #2、issue #2。
const systemMemory = process.platform === 'win32'
  ? require('./system-memory')
  : require('./system-memory-mac');
const { readSystemGpuUsage } = require('./gpu-usage');
const { createAiStemService } = require('./ai-stem-separator');
const { createCrashDiagnostics } = require('./crash-diagnostics');
const { LocalMusicLibrary, registerLocalMusicScheme } = require('./local-music-library');
const { applyOfficialProviderLogin } = require('./official-login-bridge');
const { WallpaperEngineLibrary, registerWallpaperEngineScheme } = require('./wallpaper-engine-library');
const { clearDirectoryContents, safeWallpaperLibraryFileName, scanDirectoryUsage } = require('./cache-manager');
registerLocalMusicScheme(protocol);
registerWallpaperEngineScheme(protocol);

const RELEASE_POLICY = require('./release-policy');
// macOS Touch Bar 播放控制（2016-2019 Intel MBP）。无 Touch Bar 的机器安全 no-op。
const touchbar = require('./touchbar');
const { extractKugouAuth } = require('../kugou-api');
const {
  getSpotifyOAuthConfig,
  buildSpotifyOAuthAuthorizeUrl,
  exchangeSpotifyOAuthCode,
  clearSpotifyToken,
} = require('../spotify-api');

let mainWindow = null;
let createWindowInFlight = null;
let localServer = null;
let mainServerPort = 0;
let localMusicLibrary = null;
const localMusicImportCapabilities = new Map();
// Windows v2.1.0 对齐: 歌词磁盘缓存(userData/cache/lyrics, 不搬 Chromium 缓存/登录态)
const LYRIC_CACHE_VERSION = 1;
const LYRIC_CACHE_MAX_BYTES = 96 * 1024 * 1024;
const LYRIC_CACHE_ENTRY_MAX_BYTES = 1024 * 1024;
let desktopLyricsWindow = null;
let desktopLyricsState = {};
let desktopLyricsUserBounds = null;
let desktopLyricsProgrammaticMove = false;
let desktopLyricsPointerCapture = false;
let desktopLyricsMouseIgnored = null;
let desktopLyricsMousePoller = null;
let desktopLyricsMousePollerBuffer = '';
let desktopLyricsHotBounds = null;
let desktopLyricsLastMiddleAt = 0;
let wallpaperWindow = null;
let wallpaperState = {};
let htmlFullscreenActive = false;
let windowFullscreenActive = false;
let mainWindowStateTimer = null;
let appMemoryTrimTimer = null;
let appMemoryTrimInFlight = false;
let lastAppMemoryTrimAt = 0;
let lastAppMemoryTrimReason = '';
let memoryAutoTimer = null;
let memoryAutoState = {
  appTrimEnabled: true,
  backgroundTrimEnabled: true,
  enabled: false,
  mask: systemMemory.MEMORY_MASK_DEFAULT,
  intervalMin: 30,
  thresholdPercent: 78,
  autoElevate: false,
  pendingSystemPurge: false,
  lastRunAt: 0,
  lastReason: '',
  lastResult: null,
  lastError: '',
};
let memoryPlaybackActive = false;
let memoryPlaybackReason = '';
let closeBehavior = 'exit';
let appQuitting = false;
let mainWindowCloseFlushArmed = false;
let tray = null;
let aiStemService = null;
const registeredGlobalHotkeys = new Map();

const WINDOWED_ASPECT = 16 / 9;
const WINDOWED_SCALE = 3 / 4;
const WINDOWED_MARGIN = 32;
const MIN_WINDOWED_WIDTH = 960;
const MIN_WINDOWED_HEIGHT = 540;
const APP_PACKAGE_INFO = (() => {
  try {
    return require('../package.json');
  } catch (_) {
    return {};
  }
})();
const APP_METADATA = APP_PACKAGE_INFO.mineradio || {};
const APP_NAME = process.env.MINERADIO_RUNTIME_NAME || APP_METADATA.runtimeName || APP_PACKAGE_INFO.productName || 'Mineradio';
const APP_USER_MODEL_ID = process.env.MINERADIO_APP_USER_MODEL_ID || APP_METADATA.appUserModelId || (APP_PACKAGE_INFO.build && APP_PACKAGE_INFO.build.appId) || 'com.mineradio.desktop';
const APP_ICON_ICO = path.join(__dirname, '..', 'build', process.platform === 'darwin' ? 'icon.icns' : 'icon.ico');
const CURRENT_FX_AUTOSAVE_FILE = 'current-fx-autosave.json';
const CURRENT_FX_AUTOSAVE_MAX_BYTES = 12 * 1024 * 1024;
const NETEASE_LOGIN_PARTITION = 'persist:mineradio-netease-login';
const NETEASE_LOGIN_URL = 'https://music.163.com/#/login';
const QQ_LOGIN_PARTITION = 'persist:mineradio-qqmusic-login';
const QQ_LOGIN_URL = 'https://y.qq.com/n/ryqq/profile';
const KUGOU_LOGIN_PARTITION = 'persist:mineradio-kugou-login';
const KUGOU_LOGIN_URL = 'https://www.kugou.com/';
const KUGOU_LOGIN_WARMUP_URL = 'https://www.kugou.com/newuc/user/uc/type=edit';
const QISHUI_LOGIN_PARTITION = 'persist:mineradio-qishui-login';
const SPOTIFY_LOGIN_PARTITION = 'persist:mineradio-spotify-login';

const CHROMIUM_SAFE_PERFORMANCE_SWITCHES = [
  ['autoplay-policy', 'no-user-gesture-required'],
];
// 这些开关只对 Windows 有收益；macOS 上让 Chromium 走默认 Metal 路径更流畅
if (process.platform === 'win32') {
  CHROMIUM_SAFE_PERFORMANCE_SWITCHES.push(
    ['enable-gpu-rasterization'],
    ['enable-oop-rasterization'],
    ['enable-zero-copy'],
    ['enable-accelerated-2d-canvas'],
    ['use-angle', 'd3d11'],
  );
}
// macOS 没有 EmptyWorkingSet；暴露 window.gc 让「压缩播放器」能真实回收 renderer 的 V8 堆
if (process.platform === 'darwin') {
  CHROMIUM_SAFE_PERFORMANCE_SWITCHES.push(['js-flags', '--expose-gc']);
}
const CHROMIUM_OPT_IN_PERFORMANCE_SWITCHES = [
  ['ignore-gpu-blocklist', null, 'MINERADIO_IGNORE_GPU_BLOCKLIST'],
  ['force_high_performance_gpu', null, 'MINERADIO_FORCE_HIGH_PERFORMANCE_GPU'],
  ['disable-background-timer-throttling', null, 'MINERADIO_KEEP_BACKGROUND_RENDERING'],
  ['disable-renderer-backgrounding', null, 'MINERADIO_KEEP_BACKGROUND_RENDERING'],
  ['disable-backgrounding-occluded-windows', null, 'MINERADIO_KEEP_BACKGROUND_RENDERING'],
];
function appendChromiumSwitch(name, value) {
  if (value == null) app.commandLine.appendSwitch(name);
  else app.commandLine.appendSwitch(name, value);
}
for (const [name, value] of CHROMIUM_SAFE_PERFORMANCE_SWITCHES) appendChromiumSwitch(name, value);
for (const [name, value, envName] of CHROMIUM_OPT_IN_PERFORMANCE_SWITCHES) {
  if (process.env[envName] === '1') appendChromiumSwitch(name, value);
}
// 开发/测试:指定独立 userData,可与正式安装版同时运行(单实例锁按 userData 隔离)
if (process.env.MINERADIO_USER_DATA_DIR) app.setPath('userData', process.env.MINERADIO_USER_DATA_DIR);
const crashDiagnostics = createCrashDiagnostics({
  app,
  crashReporter,
  appName: APP_NAME,
  packageInfo: APP_PACKAGE_INFO,
});
crashDiagnostics.configure();
const gotSingleInstanceLock = app.requestSingleInstanceLock();

const QQ_LOGIN_COOKIE_PRIORITY = [
  'uin',
  'qqmusic_uin',
  'wxuin',
  'login_type',
  'qm_keyst',
  'qqmusic_key',
  'p_skey',
  'skey',
  'psrf_qqopenid',
  'psrf_qqunionid',
  'psrf_qqaccess_token',
  'psrf_qqrefresh_token',
  'wxopenid',
  'wxunionid',
  'wxrefresh_token',
  'wxskey',
  'p_uin',
  'ptcz',
  'RK',
];
const KUGOU_LOGIN_COOKIE_PRIORITY = [
  'KuGoo',
  'token',
  'userid',
  'KugooID',
  'kugouID',
  'UserId',
  'kg_mid',
  'kg_dfid',
  'Kugou',
  'NickName',
];
const QISHUI_LOGIN_COOKIE_PRIORITY = [
  'sessionid', 'sessionid_ss', 'sid_guard', 'sid_tt', 'uid_tt', 'uid_tt_ss',
  'passport_csrf_token', 'passport_csrf_token_default', 's_v_web_id', 'odin_tt', 'ttwid',
];
const NETEASE_LOGIN_COOKIE_PRIORITY = [
  'MUSIC_U',
  '__csrf',
  'NMTID',
  'MUSIC_A',
  '__remember_me',
  '_ntes_nuid',
  '_ntes_nnid',
  'WEVNSM',
  'WNMCID',
  'JSESSIONID-WYYY',
];

function findOpenPort(startPort) {
  return new Promise((resolve, reject) => {
    function tryPort(port) {
      const tester = net.createServer();

      tester.once('error', (err) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          tryPort(port + 1);
          return;
        }
        reject(err);
      });

      tester.once('listening', () => {
        tester.close(() => resolve(port));
      });

      tester.listen(port, '127.0.0.1');
    }

    tryPort(startPort);
  });
}

function waitForServer(server) {
  if (!server || server.listening) return Promise.resolve();

  return new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

function getCurrentFxAutosavePath() {
  return path.join(app.getPath('userData'), CURRENT_FX_AUTOSAVE_FILE);
}

function getAiStemCacheRoot() {
  return path.join(app.getPath('userData'), 'ai-stems');
}

function getAiStemPowerState() {
  let onBatteryPower = process.platform === 'darwin';
  let thermalState = process.platform === 'darwin' ? 'unknown' : 'nominal';
  try { onBatteryPower = powerMonitor.isOnBatteryPower(); } catch (_) {}
  try { thermalState = powerMonitor.getCurrentThermalState(); } catch (_) {}
  return { onBatteryPower, thermalState };
}

function ensureAiStemService() {
  if (aiStemService) return aiStemService;
  aiStemService = createAiStemService({
    cacheRoot: getAiStemCacheRoot(),
    getLocalOrigin: () => 'http://127.0.0.1:' + mainServerPort,
    getPowerState: getAiStemPowerState,
    onProgress: (payload) => {
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) return;
      mainWindow.webContents.send('mineradio-ai-stems-progress', payload || {});
    },
  });
  return aiStemService;
}

function readCurrentFxAutosaveFile() {
  try {
    const file = getCurrentFxAutosavePath();
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    if (!stat || stat.size <= 0 || stat.size > CURRENT_FX_AUTOSAVE_MAX_BYTES) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const payload = JSON.parse(raw);
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch (e) {
    console.warn('[FxAutosave] read skipped:', e.message);
    return null;
  }
}

function writeCurrentFxAutosaveFile(payload) {
  try {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, error: 'INVALID_AUTOSAVE_PAYLOAD' };
    }
    const text = JSON.stringify(payload);
    if (Buffer.byteLength(text, 'utf8') > CURRENT_FX_AUTOSAVE_MAX_BYTES) {
      return { ok: false, error: 'AUTOSAVE_PAYLOAD_TOO_LARGE' };
    }
    const file = getCurrentFxAutosavePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch (e) {
    console.warn('[FxAutosave] write failed:', e.message);
    return { ok: false, error: e.message || 'AUTOSAVE_WRITE_FAILED' };
  }
}

function flushMainWindowFxAutosave(reason) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return Promise.resolve({ ok: false, skipped: true, reason: 'no-window' });
  }
  const safeReason = String(reason || 'main-close').replace(/[^a-z0-9:_-]/gi, '').slice(0, 48) || 'main-close';
  const script = `
    (function () {
      try {
        if (typeof flushLyricLayoutSave === 'function') {
          flushLyricLayoutSave('${safeReason}');
          return { ok: true };
        }
        return { ok: false, missing: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e || '') };
      }
    })()
  `;
  return Promise.race([
    mainWindow.webContents.executeJavaScript(script, true),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 800)),
  ]).catch((e) => ({ ok: false, error: e.message || String(e) }));
}

const LOCAL_APP_PERMISSION_ALLOWLIST = new Set(['media', 'speaker-selection', 'pointerLock', 'pointer-lock']);

function isLocalAppUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'http:' && u.hostname === '127.0.0.1' && Number(u.port || 0) === Number(mainServerPort || 0);
  } catch (e) {
    return false;
  }
}

function configureLocalAppPermissions() {
  const ses = session.defaultSession;
  if (!ses || ses._mineradioPermissionsConfigured) return;
  ses._mineradioPermissionsConfigured = true;
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const origin = requestingOrigin || (details && details.requestingUrl) || (webContents && webContents.getURL && webContents.getURL()) || '';
    return LOCAL_APP_PERMISSION_ALLOWLIST.has(permission) && isLocalAppUrl(origin);
  });
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = (details && (details.requestingUrl || details.securityOrigin)) || (webContents && webContents.getURL && webContents.getURL()) || '';
    callback(LOCAL_APP_PERMISSION_ALLOWLIST.has(permission) && isLocalAppUrl(origin));
  });
}

function sendWindowState(win) {
  if (!win || win.isDestroyed()) return;
  // 防护：渲染进程崩溃/销毁后不再发消息（避免 "Render frame was disposed" 刷屏）
  try {
    if (!win.webContents || win.webContents.isDestroyed()) return;
    win.webContents.send('desktop-window-state', getWindowState(win));
  } catch (e) {
    // 渲染进程已 dispose，静默忽略
  }
}

function sendGlobalHotkeyAction(action) {
  if (!mainWindow || mainWindow.isDestroyed() || !action) return;
  mainWindow.webContents.send('mineradio-global-hotkey', { action });
}

function unregisterMineradioGlobalHotkeys() {
  for (const accelerator of registeredGlobalHotkeys.keys()) {
    try { globalShortcut.unregister(accelerator); } catch (e) {}
  }
  registeredGlobalHotkeys.clear();
}

function configureMineradioGlobalHotkeys(bindings = []) {
  unregisterMineradioGlobalHotkeys();
  const results = [];
  const seen = new Set();
  for (const item of Array.isArray(bindings) ? bindings : []) {
    const action = item && String(item.action || '').trim();
    const accelerator = item && String(item.accelerator || '').trim();
    if (!action || !accelerator || seen.has(accelerator)) continue;
    seen.add(accelerator);
    let registered = false;
    try {
      registered = globalShortcut.register(accelerator, () => sendGlobalHotkeyAction(action));
    } catch (error) {
      registered = false;
    }
    if (registered) {
      registeredGlobalHotkeys.set(accelerator, action);
      results.push({ action, accelerator, ok: true });
    } else {
      results.push({
        action,
        accelerator,
        ok: false,
        conflict: {
          sourceName: '系统 / 其他软件',
          sourceIcon: 'warning',
          reason: '该组合键已被占用或被系统保留',
        },
      });
    }
  }
  return { ok: true, results };
}

function scheduleWindowStateSend(win, delay = 80) {
  if (!win || win.isDestroyed()) return;
  if (mainWindowStateTimer) clearTimeout(mainWindowStateTimer);
  mainWindowStateTimer = setTimeout(() => {
    mainWindowStateTimer = null;
    sendWindowState(win);
  }, delay);
}

function rectsOverlapOnY(a, b) {
  if (!a || !b) return false;
  const aTop = Number(a.y) || 0;
  const bTop = Number(b.y) || 0;
  const aBottom = aTop + (Number(a.height) || 0);
  const bBottom = bTop + (Number(b.height) || 0);
  return aBottom > bTop && bBottom > aTop;
}

function getDisplayState(win) {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const display = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds())
    : primary;
  const bounds = display && display.bounds ? display.bounds : primary.bounds;
  const displayId = display && display.id;
  const primaryId = primary && primary.id;
  const edgeTolerance = 2;
  const hasDisplayOnLeft = displays.some((candidate) => {
    if (!candidate || candidate.id === displayId || !candidate.bounds) return false;
    return rectsOverlapOnY(bounds, candidate.bounds)
      && Math.abs((candidate.bounds.x + candidate.bounds.width) - bounds.x) <= edgeTolerance;
  });
  const hasDisplayOnRight = displays.some((candidate) => {
    if (!candidate || candidate.id === displayId || !candidate.bounds) return false;
    return rectsOverlapOnY(bounds, candidate.bounds)
      && Math.abs((bounds.x + bounds.width) - candidate.bounds.x) <= edgeTolerance;
  });
  return {
    displayId,
    primaryDisplayId: primaryId,
    isPrimaryDisplay: !!(display && primary && display.id === primary.id),
    hasDisplayOnLeft,
    hasDisplayOnRight,
    displayBounds: bounds ? {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    } : null,
  };
}

function getWindowState(win) {
  if (!win || win.isDestroyed()) return {
    isMaximized: false,
    isNativeFullScreen: false,
    isHtmlFullScreen: false,
    isWindowFullScreen: false,
    isFullScreen: false,
    isMinimized: false,
    isVisible: false,
    isFocused: false,
    isOccluded: false,
    isPrimaryDisplay: true,
    hasDisplayOnLeft: false,
    hasDisplayOnRight: false,
    displayBounds: null,
  };
  return {
    isMaximized: win.isMaximized(),
    isNativeFullScreen: win.isFullScreen(),
    isHtmlFullScreen: htmlFullscreenActive,
    isWindowFullScreen: windowFullscreenActive,
    isFullScreen: win.isFullScreen() || htmlFullscreenActive || windowFullscreenActive,
    isMinimized: win.isMinimized(),
    isVisible: win.isVisible(),
    isFocused: win.isFocused(),
    isOccluded: typeof win.isOccluded === 'function' ? win.isOccluded() : false,
    ...getDisplayState(win),
  };
}

function getSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

async function getGpuDiagnostics() {
  const status = (() => {
    try { return app.getGPUFeatureStatus(); } catch (e) { return { error: e.message || String(e) }; }
  })();
  let basicInfo = null;
  try {
    basicInfo = await app.getGPUInfo('basic');
  } catch (e) {
    basicInfo = { error: e.message || String(e) };
  }
  return {
    status,
    basicInfo,
    switches: {
      safeGpuRasterization: true,
      ignoreGpuBlocklist: process.env.MINERADIO_IGNORE_GPU_BLOCKLIST === '1',
      forceHighPerformanceGpu: process.env.MINERADIO_FORCE_HIGH_PERFORMANCE_GPU === '1',
      keepBackgroundRendering: process.env.MINERADIO_KEEP_BACKGROUND_RENDERING === '1',
      angle: process.platform === 'win32' ? 'd3d11' : 'default',
    },
  };
}

function collectAppTrimPids() {
  const pids = new Set([process.pid]);
  function addWindowProcess(win) {
    if (!win || win.isDestroyed()) return;
    try {
      const pid = win.webContents && win.webContents.getOSProcessId && win.webContents.getOSProcessId();
      if (pid) pids.add(pid);
    } catch (e) {}
  }
  addWindowProcess(mainWindow);
  try {
    app.getAppMetrics().forEach((row) => {
      if (row && Number.isFinite(Number(row.pid))) pids.add(Math.round(Number(row.pid)));
    });
  } catch (e) {}
  return Array.from(pids);
}

function isMainWindowForegroundVisible() {
  try {
    return !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized());
  } catch (e) {
    return false;
  }
}

// macOS 无 EmptyWorkingSet 等价物；改用 renderer GC(需 --expose-gc) + 清 HTTP/GPU 缓存做软压缩
async function softTrimAppMemoryMac() {
  let gc = 0;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed()) continue;
    try {
      await wc.executeJavaScript('window.gc && window.gc(); true');
      gc++;
    } catch (e) {}
  }
  let cacheCleared = false;
  try {
    await session.defaultSession.clearCache();
    cacheCleared = true;
  } catch (e) {}
  return { ok: true, soft: true, scope: 'app', platform: 'darwin', gc, cacheCleared };
}

async function runWithRendererAudioMuted(operation) {
  let audioState = null;
  const wc = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
  const canTouchRenderer = wc && !wc.isDestroyed();
  if (canTouchRenderer) {
    try {
      audioState = await wc.executeJavaScript(`(function () {
        if (typeof audio === 'undefined' || !audio) return Promise.resolve({ ok: false });
        var state = {
          ok: true,
          paused: !!audio.paused,
          muted: !!audio.muted,
          volume: Number(audio.volume),
          targetVolume: (typeof targetVolume === 'number') ? targetVolume : null,
          audioFadeEnvelope: (typeof audioFadeEnvelope === 'number') ? audioFadeEnvelope : null
        };
        if (state.paused || state.muted) return Promise.resolve(state);
        try {
          if (typeof rampAudioOutputGain === 'function') rampAudioOutputGain(0, 120);
          else audio.volume = 0;
        } catch (e) {
          try { audio.volume = 0; } catch (_) {}
        }
        return new Promise(function (resolve) {
          setTimeout(function () {
            try { audio.muted = true; } catch (e) {}
            resolve(state);
          }, 150);
        });
      })()`);
    } catch (e) {
      audioState = null;
    }
  }

  try {
    return await operation();
  } finally {
    if (canTouchRenderer && audioState && audioState.ok && !audioState.paused) {
      try {
        await wc.executeJavaScript(`(function (state) {
          if (!state || typeof audio === 'undefined' || !audio) return false;
          var restoreGain = (typeof state.targetVolume === 'number' && isFinite(state.targetVolume))
            ? state.targetVolume
            : ((typeof state.volume === 'number' && isFinite(state.volume)) ? state.volume : 0.7);
          if (state.muted) {
            try { audio.muted = true; } catch (e0) {}
            try { audio.volume = restoreGain; } catch (e1) {}
            return true;
          }
          try { audio.muted = false; } catch (e) {}
          try {
            if (typeof state.audioFadeEnvelope === 'number' && isFinite(state.audioFadeEnvelope)) {
              audioFadeEnvelope = state.audioFadeEnvelope;
            }
            if (typeof rampAudioOutputGain === 'function') rampAudioOutputGain(restoreGain, 180);
            else audio.volume = restoreGain;
          } catch (e2) {
            try { audio.volume = restoreGain; } catch (_) {}
          }
          setTimeout(function () {
            try { audio.muted = !!state.muted; } catch (e3) {}
          }, 230);
          return true;
        })(${JSON.stringify(audioState)})`);
      } catch (e) {}
    }
  }
}

async function trimAppMemoryNow(reason) {
  if (appMemoryTrimInFlight) {
    return { ok: false, skipped: true, reason: 'in-flight' };
  }
  const trimReason = String(reason || 'manual');
  if (isMainWindowForegroundVisible() && trimReason !== 'manual-force') {
    return { ok: false, skipped: true, reason: 'foreground-visible' };
  }
  appMemoryTrimInFlight = true;
  lastAppMemoryTrimAt = Date.now();
  lastAppMemoryTrimReason = trimReason;
  try {
    const before = systemMemory.getMemorySnapshot();
    const trim = process.platform === 'darwin'
      ? await softTrimAppMemoryMac()
      : await systemMemory.trimAppWorkingSets(collectAppTrimPids());
    const after = systemMemory.getMemorySnapshot();
    return { ok: true, reason: lastAppMemoryTrimReason, before, trim, after };
  } catch (e) {
    return { ok: false, reason: lastAppMemoryTrimReason, error: e.message || 'APP_MEMORY_TRIM_FAILED', snapshot: systemMemory.getMemorySnapshot() };
  } finally {
    appMemoryTrimInFlight = false;
  }
}

function scheduleAppMemoryTrim(reason, delay = 9000) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  if (memoryAutoState.appTrimEnabled === false || memoryAutoState.backgroundTrimEnabled === false) return;
  if (Date.now() - lastAppMemoryTrimAt < 120000) return;
  if (appMemoryTrimTimer) clearTimeout(appMemoryTrimTimer);
  appMemoryTrimTimer = setTimeout(() => {
    appMemoryTrimTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isMinimized() && mainWindow.isVisible()) return;
    trimAppMemoryNow(reason).catch(() => {});
  }, Math.max(4000, delay));
}

function normalizeMemoryAutoState(payload = {}) {
  const systemEnabled = systemMemory.SYSTEM_PURGE_AVAILABLE === true && systemMemory.SYSTEM_PURGE_ENABLED === true;
  const enabled = systemEnabled && payload.enabled === true;
  return {
    appTrimEnabled: payload.appTrimEnabled !== false,
    backgroundTrimEnabled: payload.backgroundTrimEnabled !== false,
    enabled,
    mask: systemMemory.normalizeMask(payload.mask != null ? payload.mask : memoryAutoState.mask),
    intervalMin: Math.max(5, Math.min(180, Math.round(Number(payload.intervalMin != null ? payload.intervalMin : memoryAutoState.intervalMin) || 30))),
    thresholdPercent: Math.max(0, Math.min(100, Math.round(Number(payload.thresholdPercent != null ? payload.thresholdPercent : memoryAutoState.thresholdPercent) || 0))),
    autoElevate: payload.autoElevate === true,
    pendingSystemPurge: enabled && memoryAutoState.pendingSystemPurge === true,
    lastRunAt: memoryAutoState.lastRunAt || 0,
    lastReason: memoryAutoState.lastReason || '',
    lastResult: memoryAutoState.lastResult || null,
    lastError: '',
  };
}

function stopMemoryAutoTimer() {
  if (memoryAutoTimer) {
    clearInterval(memoryAutoTimer);
    memoryAutoTimer = null;
  }
}

function syncMemoryAutoTimer() {
  stopMemoryAutoTimer();
  if (!memoryAutoState.enabled) return;
  memoryAutoTimer = setInterval(() => {
    runMemoryAutoTick('timer').catch(() => {});
  }, Math.max(5, memoryAutoState.intervalMin) * 60000);
}

async function runMemoryAutoTick(reason = 'auto') {
  if (!memoryAutoState.enabled) return { ok: false, skipped: true, reason: 'disabled', state: memoryAutoState };
  if (isMainWindowForegroundVisible()) {
    memoryAutoState.lastRunAt = Date.now();
    memoryAutoState.lastReason = reason + ':foreground-visible';
    memoryAutoState.lastResult = { ok: true, skipped: true, reason: 'foreground-visible' };
    return { ok: true, skipped: true, reason: 'foreground-visible', state: memoryAutoState };
  }
  const snapshot = await systemMemory.getMemorySnapshotExtended();
  const threshold = Number(memoryAutoState.thresholdPercent) || 0;
  if (threshold > 0 && snapshot && snapshot.usedPercent < threshold) {
    memoryAutoState.pendingSystemPurge = false;
    memoryAutoState.lastRunAt = Date.now();
    memoryAutoState.lastReason = reason + ':below-threshold';
    memoryAutoState.lastResult = { ok: true, skipped: true, usedPercent: snapshot.usedPercent, thresholdPercent: threshold };
    return { ok: true, skipped: true, snapshot, state: memoryAutoState };
  }
  memoryAutoState.lastRunAt = Date.now();
  memoryAutoState.lastReason = reason;
  if (memoryPlaybackActive) {
    const trim = memoryAutoState.appTrimEnabled === false
      ? { ok: false, skipped: true, reason: 'app-trim-disabled' }
      : await trimAppMemoryNow('memory-auto-playing');
    const result = {
      ok: true,
      skipped: true,
      deferred: true,
      reason: 'playback-active',
      message: '播放中只清理播放器内存；系统级释放将在暂停并进入后台后执行。',
      trim,
    };
    memoryAutoState.pendingSystemPurge = true;
    memoryAutoState.lastResult = result;
    memoryAutoState.lastError = '';
    return { ok: true, result, snapshot: await systemMemory.getMemorySnapshotExtended(), state: memoryAutoState };
  }
  memoryAutoState.pendingSystemPurge = false;
  try {
    const result = await systemMemory.purgeSystemMemorySmart(memoryAutoState.mask, {
      autoElevate: memoryAutoState.autoElevate === true,
    });
    memoryAutoState.lastResult = result;
    memoryAutoState.lastError = '';
    return { ok: true, result, snapshot: await systemMemory.getMemorySnapshotExtended(), state: memoryAutoState };
  } catch (e) {
    memoryAutoState.lastError = e.message || 'MEMORY_AUTO_FAILED';
    memoryAutoState.lastResult = { ok: false, error: memoryAutoState.lastError };
    return { ok: false, error: memoryAutoState.lastError, snapshot: systemMemory.getMemorySnapshot(), state: memoryAutoState };
  }
}

function normalizeCloseBehavior(value) {
  return value === 'tray' ? 'tray' : 'exit';
}

function resetMainWindowZoom() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try { mainWindow.webContents.setZoomFactor(1); } catch (e) {}
  try {
    const result = mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (e) {}
}

function isZoomShortcutInput(input) {
  if (!input || input.type !== 'keyDown' || !(input.control || input.meta)) return false;
  const key = String(input.key || '').toLowerCase();
  const code = String(input.code || '');
  return key === '+' || key === '=' || key === '-' || key === '_' || key === '0'
    || code === 'Equal' || code === 'Minus' || code === 'NumpadAdd'
    || code === 'NumpadSubtract' || code === 'Digit0' || code === 'Numpad0';
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  resetMainWindowZoom();
  mainWindow.focus();
  sendWindowState(mainWindow);
  return true;
}

function createOrUpdateTray() {
  if (process.platform !== 'win32' && process.platform !== 'linux') return;
  if (!tray) {
    try {
      tray = new Tray(APP_ICON_ICO);
      tray.setToolTip(APP_NAME);
      tray.on('click', () => focusMainWindow());
      tray.on('double-click', () => focusMainWindow());
    } catch (e) {
      console.warn('Tray init failed:', e.message);
      tray = null;
      return;
    }
  }
  const menu = Menu.buildFromTemplate([
    { label: `显示 ${APP_NAME}`, click: () => focusMainWindow() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        appQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function getUpdateDownloadDir() {
  return path.join(app.getPath('userData'), 'updates');
}

function shouldEnsureDesktopShortcut() {
  if (process.platform !== 'win32') return false;
  if (process.env.MINERADIO_NO_DESKTOP_SHORTCUT === '1') return false;
  return app.isPackaged || process.env.MINERADIO_CREATE_DESKTOP_SHORTCUT === '1';
}

function ensureDesktopShortcut() {
  if (!shouldEnsureDesktopShortcut()) return { ok: false, skipped: true };
  try {
    const shortcutPath = path.join(app.getPath('desktop'), `${APP_NAME}.lnk`);
    const target = process.execPath;
    const shortcut = {
      target,
      cwd: path.dirname(target),
      args: '',
      description: `${APP_NAME} desktop music player`,
      icon: fs.existsSync(APP_ICON_ICO) ? APP_ICON_ICO : target,
      iconIndex: 0,
      appUserModelId: APP_USER_MODEL_ID,
    };

    if (fs.existsSync(shortcutPath) && shell.readShortcutLink) {
      try {
        const existing = shell.readShortcutLink(shortcutPath);
        if (existing && path.resolve(existing.target || '') === path.resolve(target) && String(existing.args || '') === '') {
          return { ok: true, path: shortcutPath, existing: true };
        }
      } catch (_) {}
      shell.writeShortcutLink(shortcutPath, 'replace', shortcut);
    } else {
      shell.writeShortcutLink(shortcutPath, 'create', shortcut);
    }
    return { ok: true, path: shortcutPath, created: true };
  } catch (e) {
    console.warn('Desktop shortcut creation skipped:', e.message);
    return { ok: false, error: e.message || 'DESKTOP_SHORTCUT_FAILED' };
  }
}

function parseCookieHeader(cookieText) {
  const out = {};
  String(cookieText || '').split(';').forEach((part) => {
    const raw = String(part || '').trim();
    if (!raw) return;
    const idx = raw.indexOf('=');
    if (idx <= 0) return;
    out[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  });
  return out;
}

function qqCookieHasLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const rawUin = Number(obj.login_type) === 2
    ? (obj.wxuin || obj.uin || obj.p_uin || '')
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || '');
  const uin = String(rawUin).replace(/\D/g, '');
  const musicKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
    obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || '';
  return !!(uin && musicKey);
}

function qqCookieHasPlaybackLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const rawUin = Number(obj.login_type) === 2
    ? (obj.wxuin || obj.uin || obj.p_uin || '')
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || '');
  const uin = String(rawUin).replace(/\D/g, '');
  const playbackKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || '';
  return !!(uin && playbackKey);
}

function neteaseCookieHasLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  return !!obj.MUSIC_U;
}

function isQQCookieDomain(domain) {
  const normalized = String(domain || '').replace(/^\./, '').toLowerCase();
  return normalized === 'qq.com' || normalized.endsWith('.qq.com') || normalized.endsWith('qqmusic.qq.com');
}

function isNeteaseCookieDomain(domain) {
  const normalized = String(domain || '').replace(/^\./, '').toLowerCase();
  return normalized === '163.com' || normalized.endsWith('.163.com') ||
    normalized === 'music.163.com' || normalized.endsWith('.music.163.com') ||
    normalized === 'netease.com' || normalized.endsWith('.netease.com');
}

function buildCookieHeaderFor(cookies, isAllowedDomain, priority) {
  const picked = new Map();
  (cookies || []).forEach((cookie) => {
    if (!cookie || !cookie.name || !isAllowedDomain(cookie.domain)) return;
    picked.set(cookie.name, cookie.value || '');
  });

  const ordered = [];
  (priority || []).forEach((name) => {
    if (picked.has(name)) {
      ordered.push([name, picked.get(name)]);
      picked.delete(name);
    }
  });
  picked.forEach((value, name) => ordered.push([name, value]));

  return ordered
    .filter(([name, value]) => name && value != null && String(value) !== '')
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function buildCookieHeader(cookies) {
  return buildCookieHeaderFor(cookies, isQQCookieDomain, QQ_LOGIN_COOKIE_PRIORITY);
}

async function readQQLoginCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildCookieHeader(cookies);
}

async function readNeteaseLoginCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildCookieHeaderFor(cookies, isNeteaseCookieDomain, NETEASE_LOGIN_COOKIE_PRIORITY);
}

async function openNeteaseMusicLoginWindow(owner) {
  const cookieSession = session.fromPartition(NETEASE_LOGIN_PARTITION);
  const initialCookie = await readNeteaseLoginCookieHeader(cookieSession);
  if (neteaseCookieHasLogin(initialCookie)) return { ok: true, cookie: initialCookie, reused: true };

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;

    const loginWindow = new BrowserWindow({
      width: 940,
      height: 760,
      minWidth: 780,
      minHeight: 580,
      // macOS: 不挂 parent —— 全屏状态下关闭子窗口会触发 AppKit
      // _NSExitFullScreenTransitionController 崩溃(登录成功关窗即黑屏死)
      parent: process.platform !== 'darwin' && owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: '网易云音乐登录',
      backgroundColor: '#111111',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: NETEASE_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      resolve(result);
    };

    const checkCookies = async () => {
      try {
        const cookie = await readNeteaseLoginCookieHeader(cookieSession);
        if (neteaseCookieHasLogin(cookie)) {
          finish({ ok: true, cookie });
        }
      } catch (e) {
        console.warn('Netease login cookie check failed:', e.message);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\/([^/]+\.)?(163|music\.163|netease)\.com/i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('Netease login popup navigation failed:', e.message));
      } else if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies();
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const docs = [document];
          document.querySelectorAll('iframe').forEach((frame) => {
            try { if (frame.contentDocument) docs.push(frame.contentDocument); } catch (_) {}
          });
          for (const doc of docs) {
            const nodes = Array.from(doc.querySelectorAll('a, button, span, div'));
            const loginNode = nodes.find((node) => {
              const text = (node.textContent || '').trim();
              if (!/登录|立即登录/.test(text)) return false;
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            if (loginNode) { loginNode.click(); return true; }
          }
          return false;
        }, 900);
      `, true).catch(() => {});
    });

    loginWindow.on('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', async () => {
      if (settled) return;
      if (pollTimer) clearInterval(pollTimer);
      try {
        const cookie = await readNeteaseLoginCookieHeader(cookieSession);
        resolve(neteaseCookieHasLogin(cookie)
          ? { ok: true, cookie }
          : { ok: false, cancelled: true, message: '网易云登录窗口已关闭' });
      } catch (e) {
        resolve({ ok: false, error: e.message || '网易云登录窗口已关闭' });
      }
    });

    pollTimer = setInterval(checkCookies, 1200);
    loginWindow.loadURL(NETEASE_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function openQQMusicLoginWindow(owner) {
  const cookieSession = session.fromPartition(QQ_LOGIN_PARTITION);
  const initialCookie = await readQQLoginCookieHeader(cookieSession);
  if (qqCookieHasPlaybackLogin(initialCookie)) return { ok: true, cookie: initialCookie, reused: true };

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let warmupStarted = false;

    const loginWindow = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      // macOS: 不挂 parent —— 全屏状态下关闭子窗口会触发 AppKit
      // _NSExitFullScreenTransitionController 崩溃(登录成功关窗即黑屏死)
      parent: process.platform !== 'darwin' && owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: 'QQ 音乐登录',
      backgroundColor: '#111111',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: QQ_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      resolve(result);
    };

    const checkCookies = async () => {
      try {
        const cookie = await readQQLoginCookieHeader(cookieSession);
        if (qqCookieHasPlaybackLogin(cookie)) {
          finish({ ok: true, cookie });
        } else if (qqCookieHasLogin(cookie) && !warmupStarted) {
          warmupStarted = true;
          setTimeout(() => {
            if (!settled && loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.loadURL('https://y.qq.com/n/ryqq/player').catch((e) => console.warn('QQ login warmup navigation failed:', e.message));
            }
          }, 900);
        }
      } catch (e) {
        console.warn('QQ login cookie check failed:', e.message);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('QQ login popup navigation failed:', e.message));
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies();
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
          const loginNode = nodes.find((node) => {
            const text = (node.textContent || '').trim();
            if (!/登录|登陆/.test(text)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (loginNode) loginNode.click();
        }, 700);
      `, true).catch(() => {});
    });

    loginWindow.on('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', async () => {
      if (settled) return;
      if (pollTimer) clearInterval(pollTimer);
      try {
        const cookie = await readQQLoginCookieHeader(cookieSession);
        resolve(qqCookieHasLogin(cookie)
          ? { ok: true, cookie, partial: !qqCookieHasPlaybackLogin(cookie) }
          : { ok: false, cancelled: true, message: 'QQ 登录窗口已关闭' });
      } catch (e) {
        resolve({ ok: false, error: e.message || 'QQ 登录窗口已关闭' });
      }
    });

    pollTimer = setInterval(checkCookies, 1200);
    loginWindow.loadURL(QQ_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function clearQQMusicLoginSession() {
  const cookieSession = session.fromPartition(QQ_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  return { ok: true };
}

function kugouCookieHasLogin(cookieText) {
  return extractKugouAuth(cookieText).loggedIn;
}

function kugouCookieHasPlayback(cookieText) {
  return extractKugouAuth(cookieText).playbackReady;
}

function isKugouCookieDomain(domain) {
  const normalized = String(domain || '').replace(/^\./, '').toLowerCase();
  return normalized === 'kugou.com' || normalized.endsWith('.kugou.com');
}

async function readKugouLoginCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildCookieHeaderFor(cookies, isKugouCookieDomain, KUGOU_LOGIN_COOKIE_PRIORITY);
}

async function openKugouMusicLoginWindow(owner) {
  const cookieSession = session.fromPartition(KUGOU_LOGIN_PARTITION);
  const initialCookie = await readKugouLoginCookieHeader(cookieSession);
  if (kugouCookieHasPlayback(initialCookie)) return { ok: true, cookie: initialCookie, reused: true };

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let warmupStarted = false;

    const loginWindow = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      // macOS: 不挂 parent —— 全屏状态下关闭子窗口会触发 AppKit
      // _NSExitFullScreenTransitionController 崩溃(登录成功关窗即黑屏死)
      parent: process.platform !== 'darwin' && owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: '酷狗音乐登录',
      backgroundColor: '#111111',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: KUGOU_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      resolve(result);
    };

    const checkCookies = async () => {
      try {
        const cookie = await readKugouLoginCookieHeader(cookieSession);
        if (kugouCookieHasPlayback(cookie)) {
          finish({ ok: true, cookie });
        } else if (kugouCookieHasLogin(cookie) && !warmupStarted) {
          warmupStarted = true;
          setTimeout(() => {
            if (!settled && loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.loadURL(KUGOU_LOGIN_WARMUP_URL).catch((e) => console.warn('Kugou login warmup navigation failed:', e.message));
            }
          }, 900);
        }
      } catch (e) {
        console.warn('Kugou login cookie check failed:', e.message);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('Kugou login popup navigation failed:', e.message));
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies();
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
          const loginNode = nodes.find((node) => {
            const text = (node.textContent || '').trim();
            if (!/登录|登陆/.test(text)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (loginNode) loginNode.click();
        }, 700);
      `, true).catch(() => {});
    });

    loginWindow.on('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', async () => {
      if (settled) return;
      if (pollTimer) clearInterval(pollTimer);
      try {
        const cookie = await readKugouLoginCookieHeader(cookieSession);
        resolve(kugouCookieHasPlayback(cookie)
          ? { ok: true, cookie }
          : (kugouCookieHasLogin(cookie)
            ? { ok: true, cookie, partial: true, message: '酷狗账号已登录，但播放 token 不完整，请稍后在播放器内重试登录' }
            : { ok: false, cancelled: true, message: '酷狗登录窗口已关闭' }));
      } catch (e) {
        resolve({ ok: false, error: e.message || '酷狗登录窗口已关闭' });
      }
    });

    pollTimer = setInterval(checkCookies, 1200);
    loginWindow.loadURL(KUGOU_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function clearKugouMusicLoginSession() {
  const cookieSession = session.fromPartition(KUGOU_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  return { ok: true };
}

async function clearNeteaseMusicLoginSession() {
  const cookieSession = session.fromPartition(NETEASE_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  return { ok: true };
}

function qishuiOfficialClientDataDirCandidates() {
  const candidates = [];
  const add = (value) => {
    if (!value) return;
    const resolved = path.resolve(value);
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };
  if (process.platform === 'darwin') {
    const support = path.join(app.getPath('home'), 'Library', 'Containers', 'com.soda.music', 'Data', 'Library', 'Application Support');
    add(path.join(support, 'SodaMusic'));
    add(path.join(support, 'sodaMusic'));
  }
  return candidates;
}

function readQishuiCookieDatabase(databasePath) {
  return new Promise((resolve) => {
    const sql = "SELECT value FROM cookies WHERE host_key LIKE '%qishui.com' AND name IN ('sessionid', 'sessionid_ss') AND value != '' LIMIT 1;";
    execFile('/usr/bin/sqlite3', ['-readonly', '-noheader', databasePath, sql], { timeout: 3500, maxBuffer: 16 * 1024 }, (error, stdout) => {
      const sessionId = String(stdout || '').trim();
      if (!error && sessionId) return resolve({ cookie: 'sessionid=' + sessionId + ';', source: databasePath });
      resolve({
        cookie: '',
        source: databasePath,
        locked: !!(error && /locked|busy|EBUSY/i.test(String(error.message || ''))),
      });
    });
  });
}

async function readQishuiOfficialClientCookieHeader() {
  let last = null;
  for (const dir of qishuiOfficialClientDataDirCandidates()) {
    for (const databasePath of [path.join(dir, 'Cookies'), path.join(dir, 'Network', 'Cookies')]) {
      if (!fs.existsSync(databasePath)) continue;
      const result = await readQishuiCookieDatabase(databasePath);
      if (result.cookie) return result;
      last = result;
    }
  }
  return last || { cookie: '', source: '' };
}

async function openQishuiMusicLoginWindow() {
  const imported = await readQishuiOfficialClientCookieHeader();
  if (imported.cookie) {
    return {
      ok: true,
      provider: 'qishui',
      cookie: imported.cookie,
      importedOfficialClient: true,
      source: imported.source,
    };
  }
  return {
    ok: false,
    provider: 'qishui',
    error: imported.locked ? 'QISHUI_LOCAL_COOKIE_DB_LOCKED' : 'QISHUI_LOCAL_COOKIE_NOT_FOUND',
    message: imported.locked
      ? '汽水音乐正在占用登录数据。请完全退出汽水音乐后重试。'
      : '请先在 macOS 汽水音乐客户端登录一次，再回到这里点击“读取本地汽水”。',
  };
}

async function clearQishuiMusicLoginSession() {
  const cookieSession = session.fromPartition(QISHUI_LOGIN_PARTITION);
  await cookieSession.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'] });
  return { ok: true };
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createSpotifyPkcePair() {
  const codeVerifier = base64Url(crypto.randomBytes(48));
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function spotifyOAuthRedirectMatches(targetUrl, redirectUri) {
  try {
    const target = new URL(String(targetUrl || ''));
    const redirect = new URL(String(redirectUri || ''));
    const normalizePath = (value) => (value || '/').replace(/\/+$/, '') || '/';
    return target.protocol === redirect.protocol &&
      target.host === redirect.host &&
      normalizePath(target.pathname) === normalizePath(redirect.pathname);
  } catch (e) {
    return false;
  }
}

function spotifyOAuthResultHtml(ok, message) {
  const escaped = String(message || '').replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
  return [
    '<!doctype html><meta charset="utf-8">',
    '<title>Spotify Login</title>',
    '<style>',
    'html,body{margin:0;height:100%;background:#101414;color:#f3fff6;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    'body{display:grid;place-items:center;}',
    'main{max-width:520px;padding:30px;text-align:center;}',
    '.brand{font-size:12px;letter-spacing:.24em;color:#1ed760;font-weight:900;margin-bottom:14px;}',
    'h1{font-size:26px;margin:0 0 12px;font-weight:850;}',
    'p{margin:0 auto;color:rgba(243,255,246,.72);line-height:1.7;font-size:14px;}',
    '</style>',
    '<main><div class="brand">SPOTIFY</div><h1>' + (ok ? '授权完成' : '授权失败') + '</h1><p>' + escaped + '</p></main>',
  ].join('');
}

function startSpotifyOAuthCallbackServer(redirectUri, onCallback) {
  return new Promise((resolve, reject) => {
    let redirect = null;
    try {
      redirect = new URL(String(redirectUri || ''));
    } catch (e) {
      reject(Object.assign(new Error('SPOTIFY_REDIRECT_URI_INVALID'), { code: 'SPOTIFY_REDIRECT_URI_INVALID' }));
      return;
    }
    if (redirect.protocol !== 'http:') {
      reject(Object.assign(new Error('SPOTIFY_REDIRECT_URI_MUST_BE_HTTP_LOCALHOST'), { code: 'SPOTIFY_REDIRECT_URI_MUST_BE_HTTP_LOCALHOST' }));
      return;
    }
    const port = Number(redirect.port || 80);
    const host = redirect.hostname || '127.0.0.1';
    const normalizePath = (value) => (value || '/').replace(/\/+$/, '') || '/';
    const expectedPath = normalizePath(redirect.pathname);
    const callbackServer = http.createServer(async (req, res) => {
      let current = null;
      try {
        current = new URL(req.url || '/', redirect.origin);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad callback URL');
        return;
      }
      if (normalizePath(current.pathname) !== expectedPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      try {
        const result = await onCallback(current);
        const ok = !!(result && result.ok);
        res.writeHead(ok ? 200 : 500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(spotifyOAuthResultHtml(ok, (result && (result.message || result.error)) || (ok ? '可以回到 Mineradio。' : '请回到 Mineradio 重新尝试。')));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(spotifyOAuthResultHtml(false, e && e.message || 'SPOTIFY_OAUTH_CALLBACK_FAILED'));
      }
    });
    callbackServer.once('error', (err) => {
      const code = err && err.code === 'EADDRINUSE' ? 'SPOTIFY_CALLBACK_PORT_BUSY' : (err && err.code || 'SPOTIFY_CALLBACK_SERVER_FAILED');
      reject(Object.assign(new Error(code), { code, cause: err }));
    });
    callbackServer.listen(port, host, () => {
      resolve({
        server: callbackServer,
        close: () => {
          try { callbackServer.close(); } catch (_) {}
        },
      });
    });
  });
}

async function openSpotifyMusicLoginWindow(owner) {
  const config = getSpotifyOAuthConfig();
  if (!config.configured) {
    return {
      ok: false,
      provider: 'spotify',
      error: 'SPOTIFY_OAUTH_NOT_CONFIGURED',
      missing: config.missing,
      redirectUri: config.redirectUri,
      message: 'Spotify 登录需要先配置 SPOTIFY_CLIENT_ID，并在 Spotify Developer Dashboard 登记本地回调地址 ' + config.redirectUri,
    };
  }

  const oauthState = crypto.randomBytes(16).toString('hex');
  const pkce = createSpotifyPkcePair();
  let authUrl = '';
  try {
    authUrl = buildSpotifyOAuthAuthorizeUrl({
      state: oauthState,
      codeChallenge: pkce.codeChallenge,
      redirectUri: config.redirectUri,
      scope: config.scope,
    });
  } catch (e) {
    return {
      ok: false,
      provider: 'spotify',
      error: e.code || e.message,
      missing: e.missing || config.missing,
      message: e.message || 'Spotify 授权地址生成失败',
    };
  }

  return new Promise(async (resolve) => {
    let settled = false;
    let exchangeStarted = false;
    let callbackServer = null;
    let loginWindow = null;

    const finish = (result) => {
      if (settled) return result;
      settled = true;
      if (callbackServer && typeof callbackServer.close === 'function') callbackServer.close();
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      resolve(result);
      return result;
    };

    const exchangeFromRedirect = async (targetUrl, event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (exchangeStarted) return { ok: true, provider: 'spotify', message: 'Spotify 授权正在处理。' };
      exchangeStarted = true;
      let parsed = null;
      try {
        parsed = targetUrl instanceof URL ? targetUrl : new URL(String(targetUrl || ''));
      } catch (e) {
        return finish({ ok: false, provider: 'spotify', error: 'SPOTIFY_OAUTH_BAD_REDIRECT', message: e.message });
      }
      const returnedState = parsed.searchParams.get('state') || '';
      if (returnedState !== oauthState) {
        return finish({ ok: false, provider: 'spotify', error: 'SPOTIFY_OAUTH_STATE_MISMATCH', message: 'Spotify 授权状态校验失败，请重新登录。' });
      }
      const oauthError = parsed.searchParams.get('error') || '';
      if (oauthError) {
        return finish({
          ok: false,
          provider: 'spotify',
          error: oauthError,
          message: parsed.searchParams.get('error_description') || 'Spotify 授权已取消或失败。',
        });
      }
      const code = parsed.searchParams.get('code') || '';
      if (!code) {
        return finish({ ok: false, provider: 'spotify', error: 'SPOTIFY_OAUTH_CODE_MISSING', message: 'Spotify 回调没有返回 code。' });
      }
      try {
        const info = await exchangeSpotifyOAuthCode({
          code,
          codeVerifier: pkce.codeVerifier,
          redirectUri: config.redirectUri,
        });
        return finish(Object.assign({ ok: true, provider: 'spotify', opened: true }, info || {}, {
          redirectUri: config.redirectUri,
          message: 'Spotify 登录成功，会员状态、歌单和 Liked Songs 已可同步。',
        }));
      } catch (e) {
        return finish({
          ok: false,
          provider: 'spotify',
          error: e.code || e.message || 'SPOTIFY_OAUTH_EXCHANGE_FAILED',
          message: e.message || 'Spotify token 换取失败。',
          missing: e.missing || [],
        });
      }
    };

    try {
      callbackServer = await startSpotifyOAuthCallbackServer(config.redirectUri, exchangeFromRedirect);
    } catch (e) {
      resolve({
        ok: false,
        provider: 'spotify',
        error: e.code || e.message || 'SPOTIFY_CALLBACK_SERVER_FAILED',
        redirectUri: config.redirectUri,
        message: (e.code || e.message) === 'SPOTIFY_CALLBACK_PORT_BUSY'
          ? 'Spotify 本地回调端口被占用，请关闭占用 43879 端口的程序后重试。'
          : 'Spotify 本地回调端口启动失败：' + (e.message || e.code || ''),
      });
      return;
    }

    loginWindow = new BrowserWindow({
      width: 900,
      height: 760,
      minWidth: 720,
      minHeight: 560,
      // macOS: 不挂 parent —— 全屏状态下关闭子窗口会触发 AppKit
      // _NSExitFullScreenTransitionController 崩溃(登录成功关窗即黑屏死)
      parent: process.platform !== 'darwin' && owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: 'Spotify 授权',
      backgroundColor: '#101414',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: SPOTIFY_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const handleMaybeRedirect = (targetUrl, event) => {
      if (!spotifyOAuthRedirectMatches(targetUrl, config.redirectUri)) return false;
      exchangeFromRedirect(targetUrl, event).catch((e) => {
        finish({ ok: false, provider: 'spotify', error: e.message || 'SPOTIFY_OAUTH_EXCHANGE_FAILED' });
      });
      return true;
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (handleMaybeRedirect(url)) return { action: 'deny' };
      if (/^https?:\/\//i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('Spotify login popup navigation failed:', e.message));
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });
    loginWindow.webContents.on('will-redirect', (event, url) => handleMaybeRedirect(url, event));
    loginWindow.webContents.on('will-navigate', (event, url) => handleMaybeRedirect(url, event));
    loginWindow.on('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', () => {
      if (!settled) finish({ ok: false, provider: 'spotify', cancelled: true, message: 'Spotify 授权窗口已关闭。' });
    });
    loginWindow.loadURL(authUrl).catch((e) => finish({ ok: false, provider: 'spotify', error: e.message || 'Spotify 授权页打开失败' }));
  });
}

async function clearSpotifyMusicLoginSession() {
  const cookieSession = session.fromPartition(SPOTIFY_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  clearSpotifyToken();
  return { ok: true, provider: 'spotify' };
}

function getWindowDisplay(win) {
  if (win && !win.isDestroyed()) {
    try {
      return screen.getDisplayMatching(win.getBounds());
    } catch (e) {
      return screen.getPrimaryDisplay();
    }
  }
  return screen.getPrimaryDisplay();
}

function getDisplayArea(display) {
  return (display && (display.workArea || display.bounds)) || screen.getPrimaryDisplay().workArea;
}

function isPortraitDisplayArea(area) {
  return !!(area && area.height > area.width * 1.12);
}

function getAdaptiveWindowMinimumSize(display) {
  const area = getDisplayArea(display);
  const portrait = isPortraitDisplayArea(area);
  const margin = Math.min(WINDOWED_MARGIN, Math.max(8, Math.round(Math.min(area.width, area.height) * 0.04)));
  const availableWidth = Math.max(360, area.width - margin);
  const availableHeight = Math.max(360, area.height - margin);
  return {
    width: Math.round(Math.max(360, Math.min(portrait ? 540 : MIN_WINDOWED_WIDTH, availableWidth))),
    height: Math.round(Math.max(360, Math.min(portrait ? 720 : MIN_WINDOWED_HEIGHT, availableHeight))),
  };
}

function updateMainWindowMinimumSize(win) {
  if (!win || win.isDestroyed()) return;
  const minimum = getAdaptiveWindowMinimumSize(getWindowDisplay(win));
  win.setMinimumSize(minimum.width, minimum.height);
}

function clampBoundsToDisplayArea(bounds, display) {
  const area = getDisplayArea(display);
  const minimum = getAdaptiveWindowMinimumSize(display);
  let width = Math.round(Math.min(Math.max(Number(bounds && bounds.width) || minimum.width, minimum.width), area.width));
  let height = Math.round(Math.min(Math.max(Number(bounds && bounds.height) || minimum.height, minimum.height), area.height));
  width = Math.max(1, Math.min(width, area.width));
  height = Math.max(1, Math.min(height, area.height));
  const maxX = area.x + area.width - width;
  const maxY = area.y + area.height - height;
  const rawX = Number(bounds && bounds.x);
  const rawY = Number(bounds && bounds.y);
  const x = Math.round(Math.max(area.x, Math.min(Number.isFinite(rawX) ? rawX : area.x, maxX)));
  const y = Math.round(Math.max(area.y, Math.min(Number.isFinite(rawY) ? rawY : area.y, maxY)));
  return { x, y, width, height };
}

function ensureMainWindowInsideDisplay(win) {
  if (!win || win.isDestroyed() || win.isFullScreen()) return;
  const display = getWindowDisplay(win);
  updateMainWindowMinimumSize(win);
  const current = win.getBounds();
  const next = clampBoundsToDisplayArea(current, display);
  if (next.x !== current.x || next.y !== current.y || next.width !== current.width || next.height !== current.height) {
    win.setBounds(next, false);
  }
}

function getWindowedBounds(win) {
  const display = getWindowDisplay(win);
  const area = getDisplayArea(display);
  const basis = display.bounds || area;
  const portrait = isPortraitDisplayArea(area);
  const margin = Math.min(WINDOWED_MARGIN, Math.max(12, Math.round(Math.min(area.width, area.height) * 0.04)));
  const maxWidth = Math.max(360, area.width - margin);
  const maxHeight = Math.max(360, area.height - margin);
  const minimum = getAdaptiveWindowMinimumSize(display);
  const aspect = portrait ? Math.max(0.52, Math.min(0.82, area.width / Math.max(1, area.height))) : WINDOWED_ASPECT;

  let width;
  let height;

  if (portrait) {
    width = Math.min(maxWidth, Math.round(area.width * 0.92));
    height = Math.round(width / aspect);
    const desiredHeight = Math.min(maxHeight, Math.round(area.height * 0.88));
    if (height > desiredHeight) {
      height = desiredHeight;
      width = Math.round(height * aspect);
    }
  } else {
    width = Math.round(basis.width * WINDOWED_SCALE);
    height = Math.round(width / WINDOWED_ASPECT);
    const scaledHeight = Math.round(basis.height * WINDOWED_SCALE);
    if (height > scaledHeight) {
      height = scaledHeight;
      width = Math.round(height * WINDOWED_ASPECT);
    }
  }

  if (width < minimum.width && maxWidth >= minimum.width) {
    width = minimum.width;
    if (!portrait) height = Math.round(width / WINDOWED_ASPECT);
  }
  if (height < minimum.height && maxHeight >= minimum.height) {
    height = minimum.height;
    if (!portrait) width = Math.round(height * WINDOWED_ASPECT);
  }

  if (width > maxWidth) {
    width = maxWidth;
    if (!portrait) height = Math.round(width / WINDOWED_ASPECT);
  }
  if (height > maxHeight) {
    height = maxHeight;
    if (!portrait) width = Math.round(height * WINDOWED_ASPECT);
  }

  width = Math.round(Math.max(1, Math.min(width, maxWidth)));
  height = Math.round(Math.max(1, Math.min(height, maxHeight)));

  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  };
}

function applyWindowedBounds(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) win.unmaximize();
  updateMainWindowMinimumSize(win);
  win.setBounds(getWindowedBounds(win), false);
  sendWindowState(win);
}

function exitFullscreenToWindow(win) {
  if (!win || win.isDestroyed()) return;
  windowFullscreenActive = false;

  if (!win.isFullScreen()) {
    applyWindowedBounds(win);
    return;
  }

  let applied = false;
  const applyOnce = () => {
    if (applied || !win || win.isDestroyed() || win.isFullScreen()) return;
    applied = true;
    applyWindowedBounds(win);
  };

  win.once('leave-full-screen', () => setTimeout(applyOnce, 50));
  win.setFullScreen(false);
  setTimeout(applyOnce, 500);
}

function toggleFullscreen(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isFullScreen() || windowFullscreenActive) {
    exitFullscreenToWindow(win);
    return;
  }
  windowFullscreenActive = true;
  ensureMainWindowInsideDisplay(win);
  win.setFullScreen(true);
  sendWindowState(win);
}

function overlayUrl(page) {
  const port = mainServerPort || process.env.PORT || 3000;
  return `http://127.0.0.1:${port}/${page}`;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function desktopLyricsDefaultBounds(payload = desktopLyricsState) {
  const display = desktopLyricsUserBounds
    ? screen.getDisplayMatching(desktopLyricsUserBounds)
    : screen.getPrimaryDisplay();
  const bounds = display.bounds;
  const yRatio = clampNumber(payload.y, 0.08, 0.92, 0.76);
  const width = Math.round(Math.min(Math.max(880, bounds.width * 0.72), bounds.width - 96));
  const height = Math.round(Math.min(Math.max(340, bounds.height * 0.38), 560, bounds.height - 96));
  return {
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + bounds.height * yRatio - height / 2),
    width,
    height,
  };
}

function constrainDesktopLyricsBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const area = display.bounds;
  const next = {
    ...bounds,
    width: Math.round(Math.min(Math.max(320, bounds.width), area.width)),
    height: Math.round(Math.min(Math.max(180, bounds.height), area.height)),
  };
  const maxX = area.x + Math.max(0, area.width - next.width);
  const maxY = area.y + Math.max(0, area.height - next.height);
  next.x = Math.round(clampNumber(next.x, area.x, maxX, area.x));
  next.y = Math.round(clampNumber(next.y, area.y, maxY, area.y));
  return next;
}

function setDesktopLyricsBounds(bounds) {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const nextBounds = constrainDesktopLyricsBounds(bounds);
  const currentBounds = desktopLyricsWindow.getBounds();
  if (
    currentBounds.x === nextBounds.x
    && currentBounds.y === nextBounds.y
    && currentBounds.width === nextBounds.width
    && currentBounds.height === nextBounds.height
  ) {
    return;
  }
  desktopLyricsProgrammaticMove = true;
  desktopLyricsWindow.setBounds(nextBounds, false);
  setTimeout(() => {
    desktopLyricsProgrammaticMove = false;
  }, 120);
}

function rememberDesktopLyricsBounds() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed() || desktopLyricsProgrammaticMove) return;
  desktopLyricsUserBounds = desktopLyricsWindow.getBounds();
}

function applyDesktopLyricsMouseBehavior() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const locked = desktopLyricsState.clickThrough !== false;
  const shouldIgnore = locked || !desktopLyricsPointerCapture;
  if (desktopLyricsMouseIgnored === shouldIgnore) return;
  desktopLyricsMouseIgnored = shouldIgnore;
  desktopLyricsWindow.setIgnoreMouseEvents(shouldIgnore, { forward: true });
}

function desktopLyricsHotBoundsOnScreen() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return null;
  const winBounds = desktopLyricsWindow.getBounds();
  const rel = desktopLyricsHotBounds;
  if (!rel) return winBounds;
  return {
    x: winBounds.x + rel.left,
    y: winBounds.y + rel.top,
    width: Math.max(1, rel.right - rel.left),
    height: Math.max(1, rel.bottom - rel.top),
  };
}

function pointInBounds(point, bounds) {
  if (!point || !bounds) return false;
  return point.x >= bounds.x
    && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y
    && point.y <= bounds.y + bounds.height;
}

function handleDesktopLyricsGlobalMiddleClick() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  if (!desktopLyricsState.enabled) return;
  const now = Date.now();
  if (now - desktopLyricsLastMiddleAt < 260) return;
  const point = screen.getCursorScreenPoint();
  if (!pointInBounds(point, desktopLyricsHotBoundsOnScreen())) return;
  desktopLyricsLastMiddleAt = now;
  const nextLocked = desktopLyricsState.clickThrough === false;
  desktopLyricsState = { ...desktopLyricsState, clickThrough: nextLocked };
  desktopLyricsPointerCapture = !nextLocked;
  applyDesktopLyricsMouseBehavior();
  broadcastDesktopLyricsLockState();
}

function startDesktopLyricsMousePoller() {
  if (process.platform !== 'win32' || desktopLyricsMousePoller) return;
  const script = `
$ErrorActionPreference = "SilentlyContinue"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MineradioMousePoll {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
"@
$prev = $false
while ($true) {
  $down = (([MineradioMousePoll]::GetAsyncKeyState(4) -band 0x8000) -ne 0)
  if ($down -and -not $prev) {
    [Console]::Out.WriteLine("MMB")
    [Console]::Out.Flush()
  }
  $prev = $down
  Start-Sleep -Milliseconds 24
}
`;
  try {
    desktopLyricsMousePoller = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    desktopLyricsMousePoller.stdout.on('data', (chunk) => {
      desktopLyricsMousePollerBuffer += chunk.toString('utf8');
      const lines = desktopLyricsMousePollerBuffer.split(/\r?\n/);
      desktopLyricsMousePollerBuffer = lines.pop() || '';
      lines.forEach((line) => {
        if (line.trim() === 'MMB') handleDesktopLyricsGlobalMiddleClick();
      });
    });
    desktopLyricsMousePoller.on('exit', () => {
      desktopLyricsMousePoller = null;
      desktopLyricsMousePollerBuffer = '';
    });
    desktopLyricsMousePoller.on('error', () => {
      desktopLyricsMousePoller = null;
      desktopLyricsMousePollerBuffer = '';
    });
  } catch (e) {
    desktopLyricsMousePoller = null;
    desktopLyricsMousePollerBuffer = '';
  }
}

function stopDesktopLyricsMousePoller() {
  if (!desktopLyricsMousePoller) return;
  try {
    desktopLyricsMousePoller.kill();
  } catch (e) {}
  desktopLyricsMousePoller = null;
  desktopLyricsMousePollerBuffer = '';
}

function broadcastDesktopLyricsLockState() {
  const locked = desktopLyricsState.clickThrough !== false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mineradio-desktop-lyrics-lock-state', { locked });
  }
  sendDesktopLyricsState();
}

function broadcastDesktopLyricsEnabledState(enabled) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mineradio-desktop-lyrics-enabled-state', { enabled: !!enabled });
  }
}

function positionDesktopLyricsWindow(payload = desktopLyricsState, options = {}) {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const shouldUseManualBounds = desktopLyricsUserBounds && !options.force;
  setDesktopLyricsBounds(shouldUseManualBounds ? desktopLyricsUserBounds : desktopLyricsDefaultBounds(payload));
  if (typeof desktopLyricsWindow.setOpacity === 'function') {
    desktopLyricsWindow.setOpacity(clampNumber(payload.opacity, 0.28, 1, 0.92));
  }
}

function sendDesktopLyricsState() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  desktopLyricsWindow.webContents.send('mineradio-desktop-lyrics-state', desktopLyricsState);
}

function createDesktopLyricsWindow(payload = {}) {
  const previousY = desktopLyricsState.y;
  const previousOpacity = desktopLyricsState.opacity;
  desktopLyricsState = { ...desktopLyricsState, ...payload, enabled: true };
  const hasY = Object.prototype.hasOwnProperty.call(payload || {}, 'y');
  const nextY = clampNumber(desktopLyricsState.y, 0.08, 0.92, 0.76);
  const yChanged = hasY && Number.isFinite(Number(previousY)) && Math.abs(nextY - clampNumber(previousY, 0.08, 0.92, 0.76)) > 0.001;
  const opacityChanged = Object.prototype.hasOwnProperty.call(payload || {}, 'opacity')
    && Math.abs(clampNumber(desktopLyricsState.opacity, 0.28, 1, 0.92) - clampNumber(previousOpacity, 0.28, 1, 0.92)) > 0.001;
  if (yChanged) desktopLyricsUserBounds = null;
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    if (yChanged) {
      positionDesktopLyricsWindow(desktopLyricsState, { force: yChanged });
    } else if (opacityChanged && typeof desktopLyricsWindow.setOpacity === 'function') {
      desktopLyricsWindow.setOpacity(clampNumber(desktopLyricsState.opacity, 0.28, 1, 0.92));
    }
    applyDesktopLyricsMouseBehavior();
    sendDesktopLyricsState();
    return desktopLyricsWindow;
  }

  desktopLyricsWindow = new BrowserWindow({
    width: 920,
    height: 190,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    focusable: false,
    skipTaskbar: true,
    show: false,
    title: 'Mineradio Desktop Lyrics',
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  try {
    desktopLyricsWindow.setAlwaysOnTop(true, 'screen-saver');
    desktopLyricsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (e) {
    console.warn('Desktop lyrics topmost setup skipped:', e.message);
  }
  startDesktopLyricsMousePoller();
  applyDesktopLyricsMouseBehavior();
  positionDesktopLyricsWindow(desktopLyricsState, { force: yChanged || !desktopLyricsUserBounds });
  desktopLyricsWindow.once('ready-to-show', () => {
    if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
    desktopLyricsWindow.showInactive();
    sendDesktopLyricsState();
  });
  desktopLyricsWindow.webContents.once('did-finish-load', sendDesktopLyricsState);
  desktopLyricsWindow.on('closed', () => {
    desktopLyricsWindow = null;
    desktopLyricsMouseIgnored = null;
  });
  desktopLyricsWindow.on('moved', rememberDesktopLyricsBounds);
  desktopLyricsWindow.loadURL(overlayUrl('desktop-lyrics.html')).catch((e) => console.warn('Desktop lyrics load failed:', e.message));
  return desktopLyricsWindow;
}

function closeDesktopLyricsWindow() {
  desktopLyricsState = { ...desktopLyricsState, enabled: false };
  desktopLyricsPointerCapture = false;
  desktopLyricsMouseIgnored = null;
  desktopLyricsHotBounds = null;
  stopDesktopLyricsMousePoller();
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    sendDesktopLyricsState();
    desktopLyricsWindow.close();
  }
  desktopLyricsWindow = null;
  broadcastDesktopLyricsEnabledState(false);
}

function nativeWindowHandleDecimal(win) {
  const handle = win.getNativeWindowHandle();
  if (process.arch === 'x64') return handle.readBigUInt64LE(0).toString();
  return String(handle.readUInt32LE(0));
}

function attachWallpaperToWorkerW(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return;
  const hwnd = nativeWindowHandleDecimal(win);
  const script = `
$ErrorActionPreference = "Stop"
if (-not ("MineradioNativeWin" -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MineradioNativeWin {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
}
"@
}
$progman = [MineradioNativeWin]::FindWindow("Progman", $null)
$result = [IntPtr]::Zero
[MineradioNativeWin]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$result) | Out-Null
$script:workerw = [IntPtr]::Zero
$enum = [MineradioNativeWin+EnumWindowsProc]{
  param([IntPtr]$top, [IntPtr]$param)
  $shell = [MineradioNativeWin]::FindWindowEx($top, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
  if ($shell -ne [IntPtr]::Zero) {
    $script:workerw = [MineradioNativeWin]::FindWindowEx([IntPtr]::Zero, $top, "WorkerW", $null)
  }
  return $true
}
[MineradioNativeWin]::EnumWindows($enum, [IntPtr]::Zero) | Out-Null
if ($script:workerw -eq [IntPtr]::Zero) { $script:workerw = $progman }
$target = [IntPtr]::new([Int64]${hwnd})
[MineradioNativeWin]::SetParent($target, $script:workerw) | Out-Null
[MineradioNativeWin]::SetWindowPos($target, [IntPtr]::Zero, 0, 0, 0, 0, 0x0013) | Out-Null
`;
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
    timeout: 5000,
  }, (error) => {
    if (error) console.warn('Wallpaper WorkerW attach failed:', error.message);
  });
}

// ===== 壁纸模式(macOS):移植群内 1.1.8 成功版 → 主窗口降桌面层 + 系统壁纸黑底/还原(详见 wallpaper-mode.js)=====
// 完全照 1.1.2 完整工程 desktop/main.js 的集成方式:一切交给 wallpaper-mode.js,不再自建 WorkerW 独立壁纸窗。
const wallpaperMode = require('./wallpaper-mode');
wallpaperMode.init({
  getMainWindow: () => mainWindow,
  sendWindowState: (win) => { try { sendWindowState(win); } catch (e) {} },
  getWindowFullscreenActive: () => windowFullscreenActive,
  setFullscreenFlags: (winFs, htmlFs) => { windowFullscreenActive = !!winFs; htmlFullscreenActive = !!htmlFs; },
  onLeave: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mineradio-wallpaper-active', false);
      mainWindow.webContents.send('mineradio-wallpaper-force-off');
    }
  },
});
// 兼容旧调用点的薄封装(display 重定位 / 退出关闭 / 状态同步)
function positionWallpaperWindow() { wallpaperMode.reposition(); }
function closeWallpaperWindow() { wallpaperMode.leave({ restoreBounds: true, focus: true }); }
function sendWallpaperState() { wallpaperMode.sendState(); }

function closeOverlayWindows() {
  closeDesktopLyricsWindow();
  closeWallpaperWindow();
}

ipcMain.handle('desktop-window-minimize', (event) => {
  getSenderWindow(event)?.minimize();
});

ipcMain.handle('desktop-window-toggle-maximize', (event) => {
  toggleFullscreen(getSenderWindow(event));
});

ipcMain.handle('desktop-window-toggle-fullscreen', (event) => {
  toggleFullscreen(getSenderWindow(event));
});

ipcMain.handle('desktop-window-exit-fullscreen-windowed', (event) => {
  exitFullscreenToWindow(getSenderWindow(event));
});

ipcMain.handle('desktop-window-get-state', (event) => {
  return getWindowState(getSenderWindow(event));
});

ipcMain.handle('desktop-window-restore', (event) => {
  const win = getSenderWindow(event);
  if (!win || win.isDestroyed()) return null;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  return getWindowState(win);
});

ipcMain.handle('mineradio-get-gpu-diagnostics', () => {
  return getGpuDiagnostics();
});

ipcMain.handle('mineradio-get-crash-diagnostics', () => {
  return crashDiagnostics.snapshot();
});

// 负载 HUD 设备指标:CPU + macOS 系统 GPU + 内存(HUD 可见时渲染层每 2s 拉一次)
let __deviceStatsCpuPrev = null; // os.cpus() 上次累计采样,用于系统 CPU 差分
ipcMain.handle('mineradio-device-stats', async () => {
  const out = { sysCpuPct: null, appCpuPct: null, sysGpuPct: null, memUsedMB: null, memTotalMB: null, memFreeMB: null, appMemMB: null };
  // 系统 CPU%:os.cpus() 两次采样差分(首次无上次样本 → 返回 null,渲染层显示 --)
  try {
    const cpus = os.cpus() || [];
    let idle = 0;
    let total = 0;
    for (const c of cpus) {
      const t = c.times;
      idle += t.idle;
      total += t.user + t.nice + t.sys + t.idle + t.irq;
    }
    if (__deviceStatsCpuPrev) {
      const idleDiff = idle - __deviceStatsCpuPrev.idle;
      const totalDiff = total - __deviceStatsCpuPrev.total;
      if (totalDiff > 0) {
        out.sysCpuPct = Math.max(0, Math.min(100, Math.round((1 - idleDiff / totalDiff) * 100)));
      }
    }
    __deviceStatsCpuPrev = { idle, total };
  } catch (e) {}
  // 播放器 CPU% 与内存:app.getAppMetrics() 全进程求和
  try {
    const metrics = app.getAppMetrics() || [];
    let cpuSum = 0;
    let wsKB = 0;
    for (const m of metrics) {
      if (m && m.cpu && typeof m.cpu.percentCPUUsage === 'number') cpuSum += m.cpu.percentCPUUsage;
      if (m && m.memory && typeof m.memory.workingSetSize === 'number') wsKB += m.memory.workingSetSize;
    }
    // percentCPUUsage 为单核口径(单进程满载≈100=占满一核);除以逻辑核数归一为整机口径,与系统 CPU% 同尺度
    const cores = (os.cpus() || []).length || 1;
    out.appCpuPct = Math.max(0, Math.round(cpuSum / cores));
    out.appMemMB = Math.round(wsKB / 1024); // workingSetSize 单位 KB → MB
  } catch (e) {}
  try {
    out.sysGpuPct = await readSystemGpuUsage();
  } catch (e) {}
  // 系统内存:复用 systemMemory(总量/已用/可用 MB,与内存压缩面板同源)
  try {
    const snap = await systemMemory.getMemorySnapshotExtended();
    if (snap) {
      if (typeof snap.usedMB === 'number') out.memUsedMB = snap.usedMB;
      if (typeof snap.totalMB === 'number') out.memTotalMB = snap.totalMB;
      if (typeof snap.freeMB === 'number') out.memFreeMB = snap.freeMB;
    }
  } catch (e) {}
  return out;
});

ipcMain.handle('mineradio-ai-stems-start', async (_event, payload = {}) => {
  try { return await ensureAiStemService().start(payload); }
  catch (error) { return { ok: false, status: 'error', error: String(error && (error.code || error.message) || 'AI_STEM_FAILED') }; }
});

ipcMain.handle('mineradio-ai-stems-status', (_event, trackKey) => {
  try { return ensureAiStemService().status(trackKey); }
  catch (error) { return { ok: false, status: 'error', error: String(error && (error.code || error.message) || 'AI_STEM_FAILED') }; }
});

ipcMain.handle('mineradio-ai-stems-cancel', (_event, jobId) => {
  try { return ensureAiStemService().cancel(jobId); }
  catch (error) { return { ok: false, status: 'error', error: String(error && (error.code || error.message) || 'AI_STEM_FAILED') }; }
});

ipcMain.handle('mineradio-memory-get-snapshot', async () => {
  try {
    return {
      ok: true,
      snapshot: await systemMemory.getMemorySnapshotExtended(),
      elevated: false,
      systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
      systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
      appMetrics: systemMemory.getMemorySnapshot().process,
      auto: memoryAutoState,
      lastTrimAt: lastAppMemoryTrimAt,
      lastTrimReason: lastAppMemoryTrimReason,
    };
  } catch (e) {
    return { ok: false, error: e.message || 'MEMORY_SNAPSHOT_FAILED', snapshot: systemMemory.getMemorySnapshot(), auto: memoryAutoState };
  }
});

ipcMain.handle('mineradio-memory-configure-auto', async (_event, payload = {}) => {
  memoryAutoState = normalizeMemoryAutoState(payload);
  syncMemoryAutoTimer();
  if (memoryAutoState.enabled && payload.runNow === true && !isMainWindowForegroundVisible()) {
    await runMemoryAutoTick('configure');
  }
  return {
    ok: true,
    state: memoryAutoState,
    systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
    systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
  };
});

ipcMain.on('mineradio-memory-playback-state', (_event, payload = {}) => {
  const wasPlaying = memoryPlaybackActive;
  memoryPlaybackActive = payload.playing === true;
  memoryPlaybackReason = String(payload.reason || '');
  if (wasPlaying && !memoryPlaybackActive
      && memoryAutoState.enabled
      && memoryAutoState.pendingSystemPurge
      && !isMainWindowForegroundVisible()) {
    runMemoryAutoTick('playback-idle:' + memoryPlaybackReason).catch(() => {});
  }
});

ipcMain.handle('mineradio-memory-trim-app', async (_event, payload = {}) => {
  return runWithRendererAudioMuted(() => trimAppMemoryNow(payload.reason || 'renderer'));
});

ipcMain.handle('mineradio-memory-purge-system', async (_event, payload = {}) => {
  const mask = systemMemory.normalizeMask(payload && payload.mask);
  const autoElevate = payload && payload.autoElevate === true;
  try {
    // Windows：窗口可见时跳过 purge（会卡顿）。Mac：purge 不卡顿，随时可清（参考腾讯柠檬）。
    if (process.platform === 'win32' && isMainWindowForegroundVisible()) {
      return {
        ok: true,
        result: { ok: false, skipped: true, reason: 'foreground-visible', message: 'System memory purge is skipped while Mineradio is visible.' },
        snapshot: systemMemory.getMemorySnapshot(),
        elevated: false,
        systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
        systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
      };
    }
    const elevatedBefore = await systemMemory.isProcessElevated();
    // purge 会短暂停住音频线程；清理期间只做短静音保护，不触发播放/暂停状态切换。
    const result = await runWithRendererAudioMuted(() => systemMemory.purgeSystemMemorySmart(mask, { autoElevate, manual: true }));
    return {
      ok: true,
      result,
      snapshot: await systemMemory.getMemorySnapshotExtended(),
      elevated: elevatedBefore || await systemMemory.isProcessElevated(),
      systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
      systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message || 'SYSTEM_MEMORY_PURGE_FAILED',
      snapshot: systemMemory.getMemorySnapshot(),
      elevated: false,
      systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
      systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
    };
  }
});

ipcMain.handle('desktop-window-close', (event, behavior) => {
  const win = getSenderWindow(event);
  if (behavior) closeBehavior = normalizeCloseBehavior(behavior);
  win?.close();
});

ipcMain.handle('desktop-window-get-close-behavior', () => {
  return { behavior: closeBehavior };
});

ipcMain.handle('desktop-window-set-close-behavior', (_event, behavior) => {
  closeBehavior = normalizeCloseBehavior(behavior);
  if (closeBehavior === 'tray') createOrUpdateTray();
  return { ok: true, behavior: closeBehavior };
});

ipcMain.handle('mineradio-hotkeys-configure-global', (_event, bindings) => {
  return configureMineradioGlobalHotkeys(bindings);
});

ipcMain.handle('mineradio-export-json-file', async (event, payload = {}) => {
  try {
    const owner = getSenderWindow(event);
    const defaultName = String(payload.defaultName || 'mineradio-export.json').replace(/[\\/:*?"<>|]+/g, '-');
    const result = await dialog.showSaveDialog(owner, {
      title: '导出 Mineradio 存档',
      defaultPath: defaultName.toLowerCase().endsWith('.json') ? defaultName : `${defaultName}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const text = typeof payload.text === 'string' ? payload.text : JSON.stringify(payload.data || {}, null, 2);
    fs.writeFileSync(result.filePath, text, 'utf8');
    return { ok: true, filePath: result.filePath };
  } catch (e) {
    return { ok: false, error: e.message || 'EXPORT_FAILED' };
  }
});

ipcMain.handle('mineradio-import-json-file', async (event) => {
  try {
    const owner = getSenderWindow(event);
    const result = await dialog.showOpenDialog(owner, {
      title: '导入 Mineradio 存档',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false, canceled: true };
    const filePath = result.filePaths[0];
    const text = fs.readFileSync(filePath, 'utf8');
    return { ok: true, filePath, text };
  } catch (e) {
    return { ok: false, error: e.message || 'IMPORT_FAILED' };
  }
});

ipcMain.on('mineradio-current-fx-autosave-read-sync', (event) => {
  event.returnValue = { ok: true, payload: readCurrentFxAutosaveFile() };
});

ipcMain.on('mineradio-current-fx-autosave-save-sync', (event, payload) => {
  event.returnValue = writeCurrentFxAutosaveFile(payload || {});
});

ipcMain.handle('mineradio-current-fx-autosave-save', async (_event, payload = {}) => {
  return writeCurrentFxAutosaveFile(payload || {});
});

ipcMain.handle('netease-music-open-login', async (event) => {
  const result = await openNeteaseMusicLoginWindow(getSenderWindow(event));
  return applyOfficialProviderLogin(localServer, 'netease', result);
});

ipcMain.handle('netease-music-clear-login', async () => {
  return clearNeteaseMusicLoginSession();
});

ipcMain.handle('qq-music-open-login', async (event) => {
  const result = await openQQMusicLoginWindow(getSenderWindow(event));
  return applyOfficialProviderLogin(localServer, 'qq', result);
});

ipcMain.handle('qq-music-clear-login', async () => {
  return clearQQMusicLoginSession();
});

ipcMain.handle('kugou-music-open-login', async (event) => {
  const result = await openKugouMusicLoginWindow(getSenderWindow(event));
  return applyOfficialProviderLogin(localServer, 'kugou', result);
});

ipcMain.handle('kugou-music-clear-login', async () => {
  return clearKugouMusicLoginSession();
});

ipcMain.handle('qishui-music-open-login', async (event) => {
  const result = await openQishuiMusicLoginWindow(getSenderWindow(event));
  return applyOfficialProviderLogin(localServer, 'qishui', result);
});

ipcMain.handle('qishui-music-clear-login', async () => {
  return clearQishuiMusicLoginSession();
});

ipcMain.handle('mineradio-local-library-list', async () => {
  if (!localMusicLibrary) return { ok: false, count: 0, tracks: [], error: 'LOCAL_LIBRARY_UNAVAILABLE' };
  try {
    return await localMusicLibrary.listTracks();
  } catch (error) {
    return { ok: false, count: 0, tracks: [], error: error.message || 'LOCAL_LIBRARY_READ_FAILED' };
  }
});

ipcMain.handle('mineradio-local-library-lyric', async (_event, localFileId) => {
  if (!localMusicLibrary) return { ok: false, lyric: '', lyricSource: '', error: 'LOCAL_LIBRARY_UNAVAILABLE' };
  try {
    return localMusicLibrary.lyricForTrack(localFileId);
  } catch (error) {
    return { ok: false, lyric: '', lyricSource: '', error: error.message || 'LOCAL_LYRIC_READ_FAILED' };
  }
});

function pruneLocalMusicImportCapabilities() {
  const now = Date.now();
  for (const [token, capability] of localMusicImportCapabilities) {
    if (!capability || capability.expiresAt <= now) localMusicImportCapabilities.delete(token);
  }
  while (localMusicImportCapabilities.size > 8) {
    const oldest = localMusicImportCapabilities.keys().next().value;
    if (!oldest) break;
    localMusicImportCapabilities.delete(oldest);
  }
}

ipcMain.handle('mineradio-local-library-authorize', async (_event, payload = {}) => {
  if (!localMusicLibrary) return { ok: false, count: 0, error: 'LOCAL_LIBRARY_UNAVAILABLE' };
  const files = [];
  const seen = new Set();
  for (const item of (Array.isArray(payload && payload.files) ? payload.files : []).slice(0, 50000)) {
    const requestedPath = String(item && item.path || '').trim();
    if (!requestedPath || /^[\/]{2}/.test(requestedPath) || !path.isAbsolute(requestedPath)) continue;
    if (!/\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i.test(requestedPath)) continue;
    let filePath = '';
    try {
      filePath = fs.realpathSync.native ? fs.realpathSync.native(requestedPath) : fs.realpathSync(requestedPath);
      if (/^[\/]{2}/.test(filePath) || !fs.statSync(filePath).isFile()) continue;
    } catch (_) { continue; }
    const identity = filePath;
    if (seen.has(identity)) continue;
    seen.add(identity);
    files.push({
      path: filePath,
      relativePath: String(item && item.relativePath || path.basename(filePath)).replace(/\0/g, '').slice(0, 2000),
    });
  }
  if (!files.length) return { ok: false, count: 0, error: 'NO_AUTHORIZED_LOCAL_AUDIO' };
  pruneLocalMusicImportCapabilities();
  const token = crypto.randomBytes(24).toString('hex');
  localMusicImportCapabilities.set(token, {
    senderId: _event && _event.sender && _event.sender.id,
    files,
    expiresAt: Date.now() + 3 * 60 * 1000,
  });
  return { ok: true, count: files.length, token };
});

ipcMain.handle('mineradio-local-library-import', async (event, payload = {}) => {
  if (!localMusicLibrary) return { ok: false, count: 0, tracks: [], error: 'LOCAL_LIBRARY_UNAVAILABLE' };
  pruneLocalMusicImportCapabilities();
  const token = String(payload && payload.token || '').trim().toLowerCase();
  const capability = /^[a-f0-9]{48}$/.test(token) ? localMusicImportCapabilities.get(token) : null;
  if (!capability || (event && event.sender && capability.senderId !== event.sender.id) || capability.expiresAt <= Date.now()) {
    return { ok: false, count: 0, tracks: [], error: 'LOCAL_IMPORT_CAPABILITY_INVALID' };
  }
  localMusicImportCapabilities.delete(token);
  try {
    return await localMusicLibrary.importFiles(capability.files, { replace: false });
  } catch (error) {
    return { ok: false, count: 0, tracks: [], error: error.code || error.message || 'LOCAL_LIBRARY_IMPORT_FAILED' };
  }
});

ipcMain.handle('mineradio-local-library-remove', async (_event, ids) => {
  if (!localMusicLibrary) return { ok: false, count: 0, tracks: [], error: 'LOCAL_LIBRARY_UNAVAILABLE' };
  try {
    const before = localMusicLibrary.listTracksSync().count || 0;
    const result = await localMusicLibrary.removeTracks(ids);
    return { ...result, removed: Math.max(0, before - (result.count || 0)) };
  } catch (error) {
    return { ok: false, count: 0, tracks: [], removed: 0, error: error.message || 'LOCAL_LIBRARY_REMOVE_FAILED' };
  }
});

// ---- 壁纸库：本地库与 Windows Mineradio 服务（固定 HTTP 协议） ----
let wallpaperLibraryBridge = null;
function getWallpaperLibraryBridge() {
  if (!wallpaperLibraryBridge) {
    const bridge = require('./wallpaper-library-bridge');
    wallpaperLibraryBridge = bridge.init({ userDataPath: app.getPath('userData') });
  }
  return wallpaperLibraryBridge;
}

ipcMain.handle('mineradio-wallpaper-library-scan-dir', async (_event, dirPath) => {
  return getWallpaperLibraryBridge().scanDirectory(dirPath);
});
ipcMain.handle('mineradio-wallpaper-library-scan-http', async (_event, baseUrl) => {
  return getWallpaperLibraryBridge().scanHttpSource(baseUrl);
});
ipcMain.handle('mineradio-wallpaper-library-list', async () => {
  return getWallpaperLibraryBridge().list();
});
ipcMain.handle('mineradio-wallpaper-library-media', async (_event, recordId, kind) => {
  return getWallpaperLibraryBridge().getMediaFile(recordId, kind);
});
ipcMain.handle('mineradio-wallpaper-windows-discover', async () => {
  return getWallpaperLibraryBridge().discoverWindowsSources();
});
ipcMain.handle('mineradio-wallpaper-windows-connect', async (_event, baseUrl) => {
  return getWallpaperLibraryBridge().connectWindowsSource(baseUrl);
});
ipcMain.handle('mineradio-wallpaper-windows-live-status', async (_event, baseUrl) => {
  return getWallpaperLibraryBridge().getWindowsLiveStatus(baseUrl);
});
ipcMain.handle('mineradio-wallpaper-windows-export-start', async (_event, baseUrl, sceneId, seconds) => {
  return getWallpaperLibraryBridge().startWindowsSceneExport(baseUrl, sceneId, seconds);
});
ipcMain.handle('mineradio-wallpaper-windows-export-status', async (_event, baseUrl, jobId) => {
  return getWallpaperLibraryBridge().getWindowsExportJob(baseUrl, jobId);
});
ipcMain.handle('mineradio-wallpaper-windows-exported-videos', async (_event, baseUrl) => {
  return getWallpaperLibraryBridge().listWindowsExportedVideos(baseUrl);
});
ipcMain.handle('mineradio-wallpaper-windows-download-media', async (_event, baseUrl, payload) => {
  const request = payload && typeof payload === 'object' ? payload : {};
  if (request.kind === 'scene-export') {
    return getWallpaperLibraryBridge().downloadWindowsExportedMedia(baseUrl, String(request.fileName || ''));
  }
  return getWallpaperLibraryBridge().downloadWindowsWallpaperMedia(baseUrl, String(request.recordId || ''), String(request.type || ''));
});
ipcMain.handle('mineradio-wallpaper-windows-export-download', async (_event, baseUrl, fileName) => {
  const safeName = path.basename(String(fileName || '')).replace(/[^a-z0-9._ -]/gi, '_') || 'wallpaper-scene.mp4';
  const owner = BrowserWindow.getFocusedWindow() || mainWindow;
  const selected = await dialog.showSaveDialog(owner, {
    title: '保存导出的壁纸视频',
    defaultPath: safeName,
    filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mov'] }],
  });
  if (selected.canceled || !selected.filePath) return { ok: false, error: 'DOWNLOAD_CANCELLED' };
  return getWallpaperLibraryBridge().downloadWindowsExport(baseUrl, fileName, selected.filePath);
});

function lyricCacheDirectoryPath() {
  return path.join(app.getPath('userData'), 'cache', 'lyrics');
}
function wallpaperLibraryDirectoryPath() {
  return path.join(app.getPath('userData'), 'Wallpapers');
}
function mineradioCacheDirectories() {
  const userData = app.getPath('userData');
  return {
    lyrics: lyricCacheDirectoryPath(),
    beatmaps: path.join(userData, 'beatmaps'),
    aiStems: path.join(userData, 'ai-stems'),
    wallpapers: wallpaperLibraryDirectoryPath(),
  };
}
function wallpaperMirrorPayload(payload) {
  const value = payload && typeof payload === 'object' ? payload : {};
  const mime = String(value.mime || '').toLowerCase();
  const bytes = value.bytes;
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(mime) && !/^video\/(mp4|webm|quicktime)$/i.test(mime)) {
    throw new Error('WALLPAPER_MIME_NOT_ALLOWED');
  }
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array || bytes instanceof ArrayBuffer)) {
    throw new Error('WALLPAPER_BYTES_INVALID');
  }
  const buffer = Buffer.from(bytes);
  if (!buffer.length || buffer.length > 256 * 1024 * 1024) throw new Error('WALLPAPER_SIZE_INVALID');
  return {
    buffer,
    mime,
    id: String(value.id || 'wallpaper').slice(0, 160),
    name: String(value.name || '').slice(0, 180),
  };
}
ipcMain.handle('mineradio-wallpaper-local-store', async (_event, payload) => {
  try {
    const data = wallpaperMirrorPayload(payload);
    const dir = wallpaperLibraryDirectoryPath();
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = safeWallpaperLibraryFileName(data.name, data.mime, data.id);
    const target = path.join(dir, filename);
    if (path.dirname(target) !== dir) throw new Error('WALLPAPER_PATH_INVALID');
    await fs.promises.writeFile(target, data.buffer);
    return { ok: true, path: target, name: filename, bytes: data.buffer.length };
  } catch (error) {
    return { ok: false, error: error && error.message || 'WALLPAPER_STORE_FAILED' };
  }
});
ipcMain.handle('mineradio-wallpaper-local-open', async () => {
  try {
    const dir = wallpaperLibraryDirectoryPath();
    await fs.promises.mkdir(dir, { recursive: true });
    const error = await shell.openPath(dir);
    return error ? { ok: false, error } : { ok: true, path: dir };
  } catch (error) {
    return { ok: false, error: error && error.message || 'WALLPAPER_FOLDER_OPEN_FAILED' };
  }
});
function lyricCacheFilePath(key) {
  const digest = crypto.createHash('sha256').update(String(key || '')).digest('hex');
  return path.join(lyricCacheDirectoryPath(), `${digest}.json`);
}
async function pruneLyricCache() {
  let entries = [];
  try {
    entries = await fs.promises.readdir(lyricCacheDirectoryPath(), { withFileTypes: true });
  } catch (_) {
    return;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/i.test(entry.name)) continue;
    const file = path.join(lyricCacheDirectoryPath(), entry.name);
    try {
      const stat = await fs.promises.stat(file);
      files.push({ file, size: Math.max(0, Number(stat.size) || 0), time: Number(stat.mtimeMs) || 0 });
    } catch (_) { }
  }
  let total = files.reduce((sum, item) => sum + item.size, 0);
  files.sort((a, b) => a.time - b.time);
  for (const item of files) {
    if (total <= LYRIC_CACHE_MAX_BYTES) break;
    try {
      await fs.promises.unlink(item.file);
      total -= item.size;
    } catch (_) { }
  }
}
ipcMain.handle('mineradio-cache-read-lyric', async (_event, key) => {
  try {
    const file = lyricCacheFilePath(key);
    if (!fs.existsSync(file)) return { ok: true, hit: false };
    const stat = await fs.promises.stat(file);
    if (stat.size <= 0 || stat.size > LYRIC_CACHE_ENTRY_MAX_BYTES) {
      await fs.promises.unlink(file).catch(() => {});
      return { ok: true, hit: false };
    }
    const parsed = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    if (!parsed || parsed.version !== LYRIC_CACHE_VERSION) return { ok: true, hit: false };
    return { ok: true, hit: true, payload: parsed.payload };
  } catch (e) {
    return { ok: false, hit: false, error: e.message || 'LYRIC_CACHE_READ_FAILED' };
  }
});
ipcMain.handle('mineradio-cache-write-lyric', async (_event, key, payload) => {
  try {
    const file = lyricCacheFilePath(key);
    const text = JSON.stringify({
      version: LYRIC_CACHE_VERSION,
      savedAt: Date.now(),
      key: String(key || '').slice(0, 500),
      payload: payload || {},
    });
    if (Buffer.byteLength(text, 'utf8') > LYRIC_CACHE_ENTRY_MAX_BYTES) return { ok: true, skipped: true };
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tempFile, text, 'utf8');
    await fs.promises.rename(tempFile, file);
    await pruneLyricCache();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'LYRIC_CACHE_WRITE_FAILED' };
  }
});

ipcMain.handle('spotify-music-open-login', async (event) => {
  return openSpotifyMusicLoginWindow(getSenderWindow(event));
});

ipcMain.handle('spotify-music-clear-login', async () => {
  return clearSpotifyMusicLoginSession();
});

// Windows v2.1.0 对齐（缓存设置 · Mac 只读版）: 只读歌词缓存占用 + 手动清理，
// 不迁移 Chromium 缓存目录搬迁（避免破坏 macOS 登录态/会话，见 AGENTS.md 硬约束）。
async function mineradioCacheUsageSnapshot() {
  const dirs = mineradioCacheDirectories();
  const [lyrics, beatmaps, aiStems, wallpapers, chromiumBytes] = await Promise.all([
    scanDirectoryUsage(dirs.lyrics),
    scanDirectoryUsage(dirs.beatmaps),
    scanDirectoryUsage(dirs.aiStems),
    scanDirectoryUsage(dirs.wallpapers),
    session.defaultSession.getCacheSize().catch(() => 0),
  ]);
  return {
    ok: true,
    rootPath: app.getPath('userData'),
    lyricsPath: dirs.lyrics,
    lyricsBytes: lyrics.bytes,
    lyricsCount: lyrics.files,
    beatmapsPath: dirs.beatmaps,
    beatmapsBytes: beatmaps.bytes,
    beatmapsCount: beatmaps.files,
    aiStemsPath: dirs.aiStems,
    aiStemsBytes: aiStems.bytes,
    aiStemsCount: aiStems.files,
    wallpapersPath: dirs.wallpapers,
    wallpapersBytes: wallpapers.bytes,
    wallpapersCount: wallpapers.files,
    chromiumBytes: Math.max(0, Number(chromiumBytes) || 0),
    userDataPath: app.getPath('userData'),
    restartRequired: false,
  };
}

ipcMain.handle('mineradio-cache-get-usage', async () => {
  try {
    return await mineradioCacheUsageSnapshot();
  } catch (e) {
    return { ok: false, error: e.message || 'CACHE_USAGE_READ_FAILED' };
  }
});

ipcMain.handle('mineradio-cache-clear-lyrics', async () => {
  try {
    const removed = await clearDirectoryContents(lyricCacheDirectoryPath());
    return Object.assign({ ok: true, removed: removed.files }, await mineradioCacheUsageSnapshot());
  } catch (e) {
    return { ok: false, error: e.message || 'CACHE_CLEAR_FAILED' };
  }
});

ipcMain.handle('mineradio-cache-clear-selected', async (_event, payload) => {
  const allowed = new Set(['lyrics', 'beatmaps', 'aiStems', 'network', 'wallpapers']);
  const categories = Array.from(new Set((payload && Array.isArray(payload.categories) ? payload.categories : [])
    .map((item) => String(item || '')))).filter((item) => allowed.has(item));
  try {
    const dirs = mineradioCacheDirectories();
    const cleared = {};
    for (const category of categories) {
      if (category === 'network') {
        await session.defaultSession.clearCache();
        cleared.network = true;
      } else {
        cleared[category] = await clearDirectoryContents(dirs[category]);
      }
    }
    return Object.assign({ ok: true, cleared }, await mineradioCacheUsageSnapshot());
  } catch (error) {
    return { ok: false, error: error && error.message || 'CACHE_CLEAR_FAILED' };
  }
});

function loginCookieExportMeta(provider) {
  const key = String(provider || '').toLowerCase();
  const userData = app.getPath('userData');
  const entries = {
    netease: { label: '网易云音乐', files: [process.env.COOKIE_FILE, path.join(userData, '.cookie')] },
    qq: { label: 'QQ音乐', files: [process.env.QQ_COOKIE_FILE, path.join(userData, '.qq-cookie')] },
    kugou: { label: '酷狗音乐', files: [process.env.KUGOU_COOKIE_FILE, path.join(userData, '.kugou-cookie')] },
    spotify: { label: 'Spotify', files: [process.env.SPOTIFY_TOKEN_FILE, path.join(userData, '.spotify-token.json')] },
  };
  return entries[key] || null;
}

ipcMain.handle('mineradio-export-login-cookie', async (_event, provider) => {
  try {
    if (!RELEASE_POLICY.allowCredentialExport) {
      return {
        ok: false,
        error: 'CREDENTIAL_EXPORT_DISABLED',
        message: '公开版不提供登录凭据导出。',
      };
    }
    const meta = loginCookieExportMeta(provider);
    if (!meta) return { ok: false, error: 'UNKNOWN_PROVIDER', message: '未知平台，无法导出登录 cookie' };
    const source = (meta.files || []).filter(Boolean).find((file) => {
      try { return fs.existsSync(file) && fs.statSync(file).isFile() && fs.readFileSync(file, 'utf8').trim(); } catch (_) { return false; }
    });
    if (!source) return { ok: false, error: 'COOKIE_NOT_FOUND', message: `${meta.label} 当前没有可导出的登录 cookie` };
    const text = fs.readFileSync(source, 'utf8');
    const safeName = String(`${meta.label}_登录cookie.txt`).replace(/[\\/:*?"<>|]+/g, '-');
    const filePath = path.join(app.getPath('desktop'), safeName);
    fs.writeFileSync(filePath, text, 'utf8');
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message || 'EXPORT_LOGIN_COOKIE_FAILED' };
  }
});

ipcMain.handle('mineradio-open-update-installer', async (_event, filePath) => {
  try {
    const target = path.resolve(String(filePath || ''));
    const updateDir = path.resolve(getUpdateDownloadDir());
    if (!target || !target.startsWith(updateDir + path.sep)) {
      return { ok: false, error: 'INVALID_UPDATE_PATH' };
    }
    if (!fs.existsSync(target)) return { ok: false, error: 'UPDATE_FILE_MISSING' };
    const error = await shell.openPath(target);
    return error ? { ok: false, error } : { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'OPEN_UPDATE_FAILED' };
  }
});

ipcMain.handle('mineradio-restart-app', async () => {
  try {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'RESTART_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-set-enabled', async (_event, enabled, payload) => {
  try {
    if (enabled) {
      createDesktopLyricsWindow(payload || {});
      broadcastDesktopLyricsEnabledState(true);
    } else {
      closeDesktopLyricsWindow();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-update', async (_event, payload) => {
  try {
    const nextState = { ...desktopLyricsState, ...(payload || {}) };
    if (nextState.enabled) {
      createDesktopLyricsWindow(payload || {});
    } else if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
      desktopLyricsState = nextState;
      sendDesktopLyricsState();
    } else {
      desktopLyricsState = nextState;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_UPDATE_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-set-dragging', async () => {
  return { ok: true };
});

ipcMain.handle('mineradio-desktop-lyrics-set-pointer-capture', async (_event, active) => {
  try {
    desktopLyricsPointerCapture = !!active;
    applyDesktopLyricsMouseBehavior();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_POINTER_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-set-hot-bounds', async (_event, bounds) => {
  try {
    const left = clampNumber(bounds && bounds.left, -2000, 4000, 0);
    const top = clampNumber(bounds && bounds.top, -2000, 4000, 0);
    const right = clampNumber(bounds && bounds.right, left + 1, 6000, left + 1);
    const bottom = clampNumber(bounds && bounds.bottom, top + 1, 6000, top + 1);
    desktopLyricsHotBounds = { left, top, right, bottom };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_HOT_BOUNDS_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-set-lock-state', async (_event, locked) => {
  try {
    desktopLyricsState = { ...desktopLyricsState, clickThrough: !!locked };
    if (desktopLyricsState.clickThrough !== false) desktopLyricsPointerCapture = false;
    applyDesktopLyricsMouseBehavior();
    broadcastDesktopLyricsLockState();
    return { ok: true, locked: desktopLyricsState.clickThrough !== false };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_LOCK_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-move-by', async (_event, dx, dy) => {
  try {
    if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return { ok: false, error: 'NO_DESKTOP_LYRICS_WINDOW' };
    if (desktopLyricsState.clickThrough !== false) return { ok: false, error: 'DESKTOP_LYRICS_LOCKED' };
    const bounds = desktopLyricsWindow.getBounds();
    const next = {
      ...bounds,
      x: Math.round(bounds.x + clampNumber(dx, -160, 160, 0)),
      y: Math.round(bounds.y + clampNumber(dy, -160, 160, 0)),
    };
    desktopLyricsWindow.setBounds(next, false);
    desktopLyricsUserBounds = desktopLyricsWindow.getBounds();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_MOVE_FAILED' };
  }
});

// 壁纸 IPC:完全照 1.1.2 完整工程 main.js —— 一切交给 wallpaper-mode.js,不再分支/建独立窗
ipcMain.handle('mineradio-wallpaper-set-enabled', async (_event, enabled, payload) => {
  return wallpaperMode.setEnabled(!!enabled, payload || {});
});
// 新方案:主窗口本身即壁纸,无需推送音频
ipcMain.on('mineradio-wallpaper-audio-push', () => {});
ipcMain.handle('mineradio-wallpaper-update', async (_event, payload) => {
  return wallpaperMode.update(payload || {});
});
ipcMain.on('mineradio-wallpaper-report-state', (_e, st) => { try { wallpaperMode.sendPanelState(st); } catch (e) {} });
ipcMain.on('mineradio-wallpaper-control', (_e, payload) => {
  const action = payload && payload.action;
  if (action === 'exit') { try { wallpaperMode.leave({ restoreBounds: true, focus: true }); } catch (e) {} return; }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (action === 'setVolume') { mainWindow.webContents.send('mineradio-wallpaper-setvolume', payload.value); return; }
  if (['togglePlay', 'prevTrack', 'nextTrack', 'nextPreset', 'prevPreset'].indexOf(action) >= 0) {
    mainWindow.webContents.send('mineradio-global-hotkey', { action });
  }
});

// ── 手部姿态原生桥接(v12):Swift 助手用 Vision 在 ANE 上跑手部姿态(不碰 GPU,不与体素渲染抢核显)──
// 渲染层采集摄像头(已有权限)→ 送 256×192 RGBA 帧到助手 stdin;助手回 21 点关键点 JSON → 转发渲染层。
// 助手只做推理不碰摄像头,故无需摄像头权限。
let handposeProc = null;
let handposeStdoutBuf = '';
const HANDPOSE_BIN = path.join(__dirname, 'native', 'handpose', 'handpose-helper');
function killHandpose() {
  if (handposeProc) { try { handposeProc.kill('SIGKILL'); } catch (e) {} handposeProc = null; }
  handposeStdoutBuf = '';
}
ipcMain.handle('mineradio-handpose-start', async (event) => {
  killHandpose();
  if (!fs.existsSync(HANDPOSE_BIN)) return { ok: false, error: 'HANDPOSE_BIN_MISSING' };
  return await new Promise((resolve) => {
    let settled = false;
    let proc;
    try { proc = spawn(HANDPOSE_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); return; }
    handposeProc = proc;
    const to = setTimeout(() => { if (!settled) { settled = true; killHandpose(); resolve({ ok: false, error: 'HANDPOSE_START_TIMEOUT' }); } }, 8000);
    proc.stdout.on('data', (d) => {
      handposeStdoutBuf += d.toString('utf8');
      let nl;
      while ((nl = handposeStdoutBuf.indexOf('\n')) >= 0) {
        const line = handposeStdoutBuf.slice(0, nl); handposeStdoutBuf = handposeStdoutBuf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch (e) { continue; }
        if (msg.ready) { if (!settled) { settled = true; clearTimeout(to); resolve({ ok: true }); } continue; }
        if (msg.hands && event.sender && !event.sender.isDestroyed()) event.sender.send('mineradio-handpose-result', msg.hands);
      }
    });
    proc.on('error', (e) => { if (!settled) { settled = true; clearTimeout(to); resolve({ ok: false, error: String(e && e.message || e) }); } killHandpose(); });
    proc.on('exit', () => { if (proc === handposeProc) handposeProc = null; });
  });
});
ipcMain.on('mineradio-handpose-frame', (_e, buf) => {
  if (!handposeProc || !handposeProc.stdin.writable) return;
  try {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(b.length, 0);
    handposeProc.stdin.write(len); handposeProc.stdin.write(b);
  } catch (e) {}
});
ipcMain.on('mineradio-handpose-stop', () => killHandpose());
app.on('before-quit', () => killHandpose());

function createWindow() {
  if (createWindowInFlight) return createWindowInFlight;
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return Promise.resolve(mainWindow);
  }
  createWindowInFlight = createWindowInternal().finally(() => {
    createWindowInFlight = null;
  });
  return createWindowInFlight;
}

async function createWindowInternal() {
  htmlFullscreenActive = false;
  windowFullscreenActive = false;
  const port = await findOpenPort(3000);
  mainServerPort = port;
  configureLocalAppPermissions();

  process.env.HOST = '127.0.0.1';
  process.env.PORT = String(port);
  process.env.COOKIE_FILE = path.join(app.getPath('userData'), '.cookie');
  process.env.QQ_COOKIE_FILE = path.join(app.getPath('userData'), '.qq-cookie');
  process.env.KUGOU_COOKIE_FILE = path.join(app.getPath('userData'), '.kugou-cookie');
  process.env.MINERADIO_UPDATE_DIR = getUpdateDownloadDir();
  process.env.MINERADIO_AI_STEM_CACHE_DIR = getAiStemCacheRoot();
  try {
    const legacyQQCookie = path.join(__dirname, '..', '.qq-cookie');
    if (fs.existsSync(legacyQQCookie)) {
      if (!fs.existsSync(process.env.QQ_COOKIE_FILE)) {
        fs.copyFileSync(legacyQQCookie, process.env.QQ_COOKIE_FILE);
      }
      fs.unlinkSync(legacyQQCookie);
    }
  } catch (e) {
    console.warn('QQ cookie migration skipped:', e.message);
  }

  // 音源状态文件（酷狗 VIP 凭据、Spotify 凭据与 token）必须落 userData：
  // mac 的 app bundle 视为只读且随更新被整体覆盖, provider 模块保持与上游零差异, 路径全走环境变量注入
  const providerStateDir = app.getPath('userData');
  if (!localMusicLibrary) localMusicLibrary = new LocalMusicLibrary({ userDataPath: providerStateDir });
  if (!process.env.KUGOU_VIP_EVIDENCE_FILE) process.env.KUGOU_VIP_EVIDENCE_FILE = path.join(providerStateDir, 'kugou-vip-evidence.json');
  if (!process.env.QISHUI_TOKEN_FILE) process.env.QISHUI_TOKEN_FILE = path.join(providerStateDir, 'qishui-token.json');
  if (!process.env.QISHUI_COOKIE_FILE) process.env.QISHUI_COOKIE_FILE = path.join(providerStateDir, '.qishui-cookie');
  if (!process.env.SPOTIFY_CONFIG_FILE) process.env.SPOTIFY_CONFIG_FILE = path.join(providerStateDir, 'spotify-credentials.json');
  if (!process.env.SPOTIFY_TOKEN_FILE) process.env.SPOTIFY_TOKEN_FILE = path.join(providerStateDir, 'spotify-token.json');

  localServer = require(path.join(__dirname, '..', 'server.js'));
  await waitForServer(localServer);

  const initialBounds = getWindowedBounds();
  const initialMinimum = getAdaptiveWindowMinimumSize(screen.getPrimaryDisplay());

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: initialMinimum.width,
    minHeight: initialMinimum.height,
    show: false,
    frame: false,
    // macOS：显示原生红黄绿按钮，并关掉透明以启用原生全屏（绿色=进入全屏的双箭头）
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 14, y: 18 },
          fullscreenable: true,
          // 壁纸模式必须能覆盖 display.bounds（包括菜单栏后的像素）。
          // 没有这个选项，macOS 会把 setBounds 自动夹回 workArea，顶部留下系统壁纸。
          enableLargerThanScreen: true,
        }
      : {}),
    fullscreen: false,
    transparent: process.platform !== 'darwin',
    backgroundColor: process.platform === 'darwin' ? '#04070a' : '#00000000',
    hasShadow: true,
    autoHideMenuBar: true,
    title: APP_NAME,
    icon: APP_ICON_ICO,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: process.env.MINERADIO_KEEP_BACKGROUND_RENDERING === '1' ? false : true,
    },
  });

  try {
    touchbar.init({ window: mainWindow, sendAction: sendGlobalHotkeyAction, ipcMain });
  } catch (e) {
    console.log('[TouchBar] 初始化跳过:', e.message);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.once('did-finish-load', () => {
    resetMainWindowZoom();
    sendWindowState(mainWindow);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isZoomShortcutInput(input)) {
      event.preventDefault();
      resetMainWindowZoom();
      return;
    }
    if (input.type === 'keyDown' && (input.key === 'Escape' || input.code === 'Escape') && mainWindow.isFullScreen()) {
      event.preventDefault();
      exitFullscreenToWindow(mainWindow);
    }
  });

  mainWindow.once('ready-to-show', () => {
    resetMainWindowZoom();
    mainWindow.show();
    if (process.platform === 'darwin' && typeof mainWindow.setWindowButtonVisibility === 'function') {
      mainWindow.setWindowButtonVisibility(true);
    }
    sendWindowState(mainWindow);
  });

  mainWindow.on('maximize', () => sendWindowState(mainWindow));
  mainWindow.on('unmaximize', () => sendWindowState(mainWindow));
  mainWindow.on('minimize', () => {
    sendWindowState(mainWindow);
    scheduleAppMemoryTrim('minimize', 1600);
  });
  mainWindow.on('restore', () => sendWindowState(mainWindow));
  mainWindow.on('show', () => sendWindowState(mainWindow));
  mainWindow.on('hide', () => {
    sendWindowState(mainWindow);
    scheduleAppMemoryTrim('hide', 2200);
  });
  mainWindow.on('focus', () => sendWindowState(mainWindow));
  mainWindow.on('blur', () => sendWindowState(mainWindow));
  // 窗口被完全遮挡(occluded)时进入深后台并延时回收内存;取消遮挡时恢复
  mainWindow.on('occluded', () => {
    sendWindowState(mainWindow);
    scheduleAppMemoryTrim('occluded', 2200);
  });
  mainWindow.on('unoccluded', () => sendWindowState(mainWindow));
  // 渲染进程崩溃恢复：自动重新加载页面（修复"窗口全黑/卡死"）
  // 渲染进程崩溃（OOM/GPU 异常/原生模块出错）时，页面变黑且无法操作。
  // 监听 render-process-gone，延迟 1.5 秒重新加载，给系统回收时间。
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[CrashRecovery] 渲染进程崩溃:', details && details.reason, details);
    crashDiagnostics.capture('render-process-gone', {
      reason: details && details.reason,
      exitCode: details && details.exitCode,
      processType: details && details.processType,
      url: mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents
        ? mainWindow.webContents.getURL()
        : '',
      gpuFeatureStatus: (() => {
        try { return app.getGPUFeatureStatus(); } catch (error) { return { error: error.message || String(error) }; }
      })(),
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 延迟重新加载，避免崩溃瞬间反复重启
      setTimeout(() => {
        try {
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
            console.log('[CrashRecovery] 重新加载页面...');
            mainWindow.webContents.reload();
          }
        } catch (e) {
          console.error('[CrashRecovery] 重新加载失败:', e.message);
        }
      }, 1500);
    }
  });
  mainWindow.on('move', () => {
    updateMainWindowMinimumSize(mainWindow);
    scheduleWindowStateSend(mainWindow);
  });
  mainWindow.on('resize', () => {
    updateMainWindowMinimumSize(mainWindow);
    scheduleWindowStateSend(mainWindow);
  });
  mainWindow.on('close', (event) => {
    if (!appQuitting && closeBehavior === 'tray') {
      event.preventDefault();
      createOrUpdateTray();
      flushMainWindowFxAutosave('tray-hide').finally(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.hide();
        sendWindowState(mainWindow);
        scheduleAppMemoryTrim('tray-hide', 2200);
      });
      return;
    }
    if (!mainWindowCloseFlushArmed) {
      event.preventDefault();
      mainWindowCloseFlushArmed = true;
      flushMainWindowFxAutosave('main-close').finally(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
        // Cmd+Q 时上面的 preventDefault 已把整个退出序列打断(mac 特有:窗关了 app 不退,
        // Dock 僵尸图标 + server 已在 before-quit 关闭导致新窗永远加载不出)——存档完必须续跑退出
        if (appQuitting) app.quit();
      });
    }
  });
  mainWindow.on('closed', () => {
    mainWindowCloseFlushArmed = false;
    if (mainWindowStateTimer) {
      clearTimeout(mainWindowStateTimer);
      mainWindowStateTimer = null;
    }
    if (appMemoryTrimTimer) {
      clearTimeout(appMemoryTrimTimer);
      appMemoryTrimTimer = null;
    }
    closeOverlayWindows();
    mainWindow = null;
  });
  mainWindow.on('enter-full-screen', () => {
    windowFullscreenActive = true;
    sendWindowState(mainWindow);
  });
  mainWindow.on('leave-full-screen', () => {
    windowFullscreenActive = false;
    setTimeout(() => applyWindowedBounds(mainWindow), 50);
  });
  mainWindow.on('enter-html-full-screen', () => {
    htmlFullscreenActive = true;
    sendWindowState(mainWindow);
  });
  mainWindow.on('leave-html-full-screen', () => {
    htmlFullscreenActive = false;
    setTimeout(() => applyWindowedBounds(mainWindow), 50);
  });

  try {
    await mainWindow.webContents.session.clearCache();
  } catch (e) {
    console.warn('Main window cache clear skipped:', e.message);
  }
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);

// macOS 原生集成
if (process.platform === 'darwin') {
  // macOS 应用菜单
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `关于 ${APP_NAME}` },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${APP_NAME}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${APP_NAME}` }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '全部前置' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Dock 菜单
  const dockMenu = Menu.buildFromTemplate([
    {
      label: '播放/暂停',
      click() {
        sendGlobalHotkeyAction('togglePlay');
      }
    },
    {
      label: '下一首',
      click() {
        sendGlobalHotkeyAction('nextTrack');
      }
    },
    {
      label: '上一首',
      click() {
        sendGlobalHotkeyAction('prevTrack');
      }
    }
  ]);

  app.whenReady().then(() => {
    app.dock.setMenu(dockMenu);
  });
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('child-process-gone', (_event, details) => {
    const processType = details && details.type;
    const reason = details && details.reason;
    if (processType !== 'GPU' && reason !== 'crashed' && reason !== 'abnormal-exit') return;
    console.error('[CrashDiagnostics] 子进程异常:', details);
    crashDiagnostics.capture('child-process-gone', {
      type: processType,
      reason,
      exitCode: details && details.exitCode,
      serviceName: details && details.serviceName,
      name: details && details.name,
    });
  });

  app.on('second-instance', () => {
    if (!focusMainWindow()) {
      app.whenReady().then(() => createWindow()).catch((e) => console.error('Second instance window restore failed:', e));
    }
  });

  app.whenReady().then(async () => {
    // 上次异常退出若把系统壁纸改黑了,启动时先还原(移植自主线 fork)
    try { wallpaperMode.restorePending('startup'); } catch (e) {}
    const handleDisplayLayoutChanged = () => {
      positionDesktopLyricsWindow();
      positionWallpaperWindow();
      ensureMainWindowInsideDisplay(mainWindow);
      scheduleWindowStateSend(mainWindow);
    };
    screen.on('display-metrics-changed', handleDisplayLayoutChanged);
    screen.on('display-added', handleDisplayLayoutChanged);
    screen.on('display-removed', handleDisplayLayoutChanged);
    if (localMusicLibrary) {
      try { await localMusicLibrary.installProtocol(protocol); } catch (e) { console.warn('[LocalMusic] media protocol unavailable:', e && e.message || e); }
    }
    await createWindow();
    try { require('./telemetry').startTelemetry(); } catch (e) {}
  });

  app.on('activate', () => {
    // 壁纸模式中点 Dock 图标 = 退出壁纸回到窗口(移植自主线 fork)
    try { if (wallpaperMode.isBusy()) { wallpaperMode.leave({ restoreBounds: true, focus: true }); return; } } catch (e) {}
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else focusMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    appQuitting = true;
    if (aiStemService) aiStemService.shutdown();
    stopMemoryAutoTimer();
    unregisterMineradioGlobalHotkeys();
    closeOverlayWindows();
    // 续跑退出时 before-quit 会二次进入,server 重复 close 会抛 ERR_SERVER_NOT_RUNNING
    if (localServer && localServer.close) { try { localServer.close(); } catch (e) {} localServer = null; }
    if (tray) {
      try { tray.destroy(); } catch (e) {}
      tray = null;
    }
  });
}
