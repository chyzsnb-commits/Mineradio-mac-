const { app, BrowserWindow, ipcMain, shell, screen, session, globalShortcut, dialog, Tray, Menu } = require('electron');
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
// macOS Touch Bar 播放控制（2016-2019 Intel MBP）。无 Touch Bar 的机器安全 no-op。
const touchbar = require('./touchbar');
const { extractKugouAuth } = require('../kugou-api');
const {
  getQishuiOAuthConfig,
  buildQishuiOAuthAuthorizeUrl,
  exchangeQishuiOAuthCode,
  createQishuiPcQrLogin,
  checkQishuiPcQrLogin,
  QISHUI_PC_FIXED,
  qishuiPcUrl,
  qishuiPcPassportParams,
  qishuiOrderedForm,
  qishuiQrErrorCode,
  qishuiPcQrRedirectUrl,
} = require('../qishui-api');
const {
  getSpotifyOAuthConfig,
  buildSpotifyOAuthAuthorizeUrl,
  exchangeSpotifyOAuthCode,
  clearSpotifyToken,
} = require('../spotify-api');

let mainWindow = null;
let localServer = null;
let mainServerPort = 0;
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
  lastRunAt: 0,
  lastReason: '',
  lastResult: null,
  lastError: '',
};
let closeBehavior = 'exit';
let appQuitting = false;
let mainWindowCloseFlushArmed = false;
let tray = null;
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
const QISHUI_LOGIN_PARTITION = 'persist:mineradio-qishui-oauth-login';
const SPOTIFY_LOGIN_PARTITION = 'persist:mineradio-spotify-login';
const QISHUI_WEB_LOGIN_URL = process.env.QISHUI_WEB_LOGIN_URL || 'https://qishui.douyin.com/';
const QISHUI_WEB_LOGIN_FALLBACK_URL = process.env.QISHUI_WEB_LOGIN_FALLBACK_URL || 'https://bff-pc.qishui.com/ucenter_web/app/sdk-next';
const QISHUI_OFFICIAL_CLIENT_DATA_DIRS = (process.env.QISHUI_OFFICIAL_CLIENT_DATA_DIRS || '')
  .split(/[;,]/)
  .map((value) => String(value || '').trim())
  .filter(Boolean);

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
  'sessionid',
  'sessionid_ss',
  'sid_guard',
  'sid_tt',
  'uid_tt',
  'uid_tt_ss',
  'passport_csrf_token',
  'passport_csrf_token_default',
  's_v_web_id',
  'odin_tt',
  'ttwid',
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
  win.webContents.send('desktop-window-state', getWindowState(win));
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
  return {
    appTrimEnabled: payload.appTrimEnabled !== false,
    backgroundTrimEnabled: payload.backgroundTrimEnabled !== false,
    enabled: systemEnabled && payload.enabled === true,
    mask: systemMemory.normalizeMask(payload.mask != null ? payload.mask : memoryAutoState.mask),
    intervalMin: Math.max(5, Math.min(180, Math.round(Number(payload.intervalMin != null ? payload.intervalMin : memoryAutoState.intervalMin) || 30))),
    thresholdPercent: Math.max(0, Math.min(100, Math.round(Number(payload.thresholdPercent != null ? payload.thresholdPercent : memoryAutoState.thresholdPercent) || 0))),
    autoElevate: payload.autoElevate === true,
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
    memoryAutoState.lastRunAt = Date.now();
    memoryAutoState.lastReason = reason + ':below-threshold';
    memoryAutoState.lastResult = { ok: true, skipped: true, usedPercent: snapshot.usedPercent, thresholdPercent: threshold };
    return { ok: true, skipped: true, snapshot, state: memoryAutoState };
  }
  memoryAutoState.lastRunAt = Date.now();
  memoryAutoState.lastReason = reason;
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

function isQishuiCookieDomain(domain) {
  const normalized = String(domain || '').replace(/^\./, '').toLowerCase();
  return normalized === 'douyin.com' || normalized.endsWith('.douyin.com') ||
    normalized === 'qishui.com' || normalized.endsWith('.qishui.com');
}

function qishuiCookieHasLogin(cookieText) {
  return /(?:^|;\s*)(sessionid|sessionid_ss|sid_guard|sid_tt|uid_tt|uid_tt_ss)=/i.test(String(cookieText || ''));
}

function qishuiOfficialClientDataDirCandidates() {
  const candidates = [];
  const add = (value) => {
    value = String(value || '').trim();
    if (!value) return;
    const resolved = path.resolve(value.replace(/^~(?=\\|\/|$)/, app.getPath('home')));
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };
  QISHUI_OFFICIAL_CLIENT_DATA_DIRS.forEach(add);
  try { add(path.join(app.getPath('appData'), 'SodaMusic')); } catch (e) {}
  try { add(path.join(app.getPath('appData'), 'sodaMusic')); } catch (e) {}
  try { add(path.join(app.getPath('appData'), 'QishuiMusic')); } catch (e) {}
  try { add(path.join(app.getPath('appData'), 'LunaMusic')); } catch (e) {}
  // macOS:汽水客户端(bundleId com.soda.music)是沙盒应用,userData 在容器内而非标准 appData。
  // 实测 cookie DB = ~/Library/Containers/com.soda.music/Data/Library/Application Support/SodaMusic/Cookies,
  // 且 value 列为明文(沙盒版未启用 Safe Storage 加密),现有 SQLite 解析器直接可读(已对拍 sqlite3 一致)。
  if (process.platform === 'darwin') {
    try {
      const home = app.getPath('home');
      const container = path.join(home, 'Library', 'Containers', 'com.soda.music', 'Data', 'Library', 'Application Support');
      add(path.join(container, 'SodaMusic'));
      add(path.join(container, 'sodaMusic'));
      add(path.join(container, 'QishuiMusic'));
    } catch (e) {}
  }
  return candidates;
}

function readSqliteVarint(buffer, offset, end) {
  let value = 0n;
  for (let i = 0; i < 9 && offset + i < end; i++) {
    const byte = buffer[offset + i];
    if (i === 8) {
      value = (value << 8n) | BigInt(byte);
      return { value: Number(value), next: offset + i + 1 };
    }
    value = (value << 7n) | BigInt(byte & 0x7f);
    if ((byte & 0x80) === 0) return { value: Number(value), next: offset + i + 1 };
  }
  return null;
}

function sqliteSerialSize(type) {
  if (type === 0 || type === 8 || type === 9) return 0;
  if (type === 1) return 1;
  if (type === 2) return 2;
  if (type === 3) return 3;
  if (type === 4) return 4;
  if (type === 5) return 6;
  if (type === 6 || type === 7) return 8;
  if (type >= 12) return Math.floor((type - 12) / 2);
  return 0;
}

function sqliteDecodeSerialValue(buffer, offset, type) {
  const size = sqliteSerialSize(type);
  if (offset + size > buffer.length) return { value: null, size };
  if (type === 0) return { value: null, size };
  if (type === 1) return { value: buffer.readInt8(offset), size };
  if (type === 2) return { value: buffer.readInt16BE(offset), size };
  if (type === 3) return { value: buffer.readIntBE(offset, 3), size };
  if (type === 4) return { value: buffer.readInt32BE(offset), size };
  if (type === 5) return { value: buffer.readIntBE(offset, 6), size };
  if (type === 6) return { value: Number(buffer.readBigInt64BE(offset)), size };
  if (type === 7) return { value: buffer.readDoubleBE(offset), size };
  if (type === 8) return { value: 0, size };
  if (type === 9) return { value: 1, size };
  if (type >= 12 && type % 2 === 0) return { value: buffer.slice(offset, offset + size), size };
  if (type >= 13 && type % 2 === 1) return { value: buffer.toString('utf8', offset, offset + size), size };
  return { value: null, size };
}

function sqliteParseRecord(buffer, offset, payloadSize) {
  const payloadEnd = Math.min(buffer.length, offset + payloadSize);
  const header = readSqliteVarint(buffer, offset, payloadEnd);
  if (!header || header.value <= 0 || offset + header.value > payloadEnd) return [];
  const headerEnd = offset + header.value;
  const serials = [];
  let pos = header.next;
  while (pos < headerEnd) {
    const serial = readSqliteVarint(buffer, pos, headerEnd);
    if (!serial) break;
    serials.push(serial.value);
    pos = serial.next;
  }
  const values = [];
  pos = headerEnd;
  for (const type of serials) {
    const decoded = sqliteDecodeSerialValue(buffer, pos, type);
    values.push(decoded.value);
    pos += decoded.size;
    if (pos > payloadEnd) break;
  }
  return values;
}

function sqliteLeafRecords(buffer) {
  if (!buffer || buffer.length < 100 || buffer.toString('ascii', 0, 16) !== 'SQLite format 3\0') return [];
  const rawPageSize = buffer.readUInt16BE(16);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  if (!pageSize || pageSize < 512) return [];
  const pageCount = Math.floor(buffer.length / pageSize);
  const records = [];
  for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
    const pageStart = (pageNo - 1) * pageSize;
    const headerStart = pageStart + (pageNo === 1 ? 100 : 0);
    if (headerStart + 8 > buffer.length || buffer[headerStart] !== 0x0d) continue;
    const cellCount = buffer.readUInt16BE(headerStart + 3);
    const pointerStart = headerStart + 8;
    for (let i = 0; i < cellCount; i++) {
      const pointerOffset = pointerStart + i * 2;
      if (pointerOffset + 2 > buffer.length) break;
      const cellOffset = pageStart + buffer.readUInt16BE(pointerOffset);
      if (cellOffset <= 0 || cellOffset >= buffer.length) continue;
      const payloadSize = readSqliteVarint(buffer, cellOffset, Math.min(buffer.length, cellOffset + 10));
      if (!payloadSize) continue;
      const rowId = readSqliteVarint(buffer, payloadSize.next, Math.min(buffer.length, payloadSize.next + 10));
      if (!rowId) continue;
      records.push(sqliteParseRecord(buffer, rowId.next, payloadSize.value));
    }
  }
  return records;
}

function sqliteCookieColumns(records) {
  const master = records.find((record) =>
    record.some((value) => typeof value === 'string' && /CREATE\s+TABLE\s+cookies/i.test(value))
  );
  const sql = master && master.find((value) => typeof value === 'string' && /CREATE\s+TABLE\s+cookies/i.test(value));
  const body = sql && sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
  if (!body) return [];
  return body.split(/,(?![^()]*\))/)
    .map(part => part.trim().split(/\s+/)[0])
    .map(name => String(name || '').replace(/^[`"[]|[`"\]]$/g, ''))
    .filter(Boolean);
}

function extractQishuiSessionIdFromCookieDatabase(databasePath) {
  const buffer = fs.readFileSync(databasePath);
  const records = sqliteLeafRecords(buffer);
  const columns = sqliteCookieColumns(records);
  const hostIndex = columns.indexOf('host_key');
  const nameIndex = columns.indexOf('name');
  const valueIndex = columns.indexOf('value');
  if (hostIndex < 0 || nameIndex < 0 || valueIndex < 0) return '';
  for (const record of records) {
    const host = String(record[hostIndex] || '').replace(/^\./, '').toLowerCase();
    const name = String(record[nameIndex] || '').toLowerCase();
    if ((host === 'qishui.com' || host.endsWith('.qishui.com')) && name === 'sessionid') {
      return String(record[valueIndex] || '').trim();
    }
  }
  return '';
}

function readQishuiOfficialClientCookieDatabase(dir) {
  // Windows/新版 Chromium 把 Cookies 放 <dir>/Network/Cookies;mac 沙盒版汽水直接放 <dir>/Cookies —— 两种布局都试。
  const candidates = [path.join(dir, 'Network', 'Cookies'), path.join(dir, 'Cookies')];
  const cookieDb = candidates.find((p) => fs.existsSync(p));
  if (!cookieDb) return { cookie: '', source: '', missing: true, dbPath: candidates[0] };
  try {
    const sessionid = extractQishuiSessionIdFromCookieDatabase(cookieDb);
    if (!sessionid) return { cookie: '', source: '', noSession: true, dbPath: cookieDb };
    return { cookie: 'sessionid=' + sessionid + ';', source: cookieDb, dbPath: cookieDb };
  } catch (e) {
    const message = e && e.message || String(e || '');
    const locked = /used by another process|EBUSY|locked|busy|access.*denied|无法访问|另一个程序正在使用|进程无法访问/i.test(message);
    return { cookie: '', source: '', locked, error: message, dbPath: cookieDb };
  }
}

async function readQishuiOfficialClientCookieHeader() {
  let last = null;
  for (const dir of qishuiOfficialClientDataDirCandidates()) {
    const direct = readQishuiOfficialClientCookieDatabase(dir);
    if (direct && direct.cookie) return Object.assign({ method: 'cookie-db' }, direct);
    if (direct && direct.locked) return Object.assign({ method: 'cookie-db' }, direct);
    last = direct || last;
  }
  if (!session || typeof session.fromPath !== 'function') return Object.assign({ cookie: '', source: '', skipped: 'session.fromPath unavailable' }, last || {});
  for (const dir of qishuiOfficialClientDataDirCandidates()) {
    try {
      const cookieDb = path.join(dir, 'Network', 'Cookies');
      if (!fs.existsSync(cookieDb)) continue;
      const clientSession = session.fromPath(dir, { cache: false });
      const cookie = await readQishuiLoginCookieHeader(clientSession);
      if (qishuiCookieHasLogin(cookie)) return { cookie, source: dir, method: 'electron-session' };
    } catch (e) {
      console.warn('Qishui official client cookie import skipped:', dir, e && e.message || e);
    }
  }
  return Object.assign({ cookie: '', source: '', skipped: 'no logged-in SodaMusic client session' }, last || {});
}

async function readQishuiLoginCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildCookieHeaderFor(cookies, isQishuiCookieDomain, QISHUI_LOGIN_COOKIE_PRIORITY);
}

// 汽水 PC 登录接口 UA —— 与 qishui-api.js 第 32 行 QISHUI_WEB_UA 同值(该常量未从模块导出,故在此镜像;上游改动需同步此处)。
const QISHUI_WEB_UA_WARMUP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SodaMusic/3.1.0 Chrome/136.0.7103.59 Electron/36.4.0-rs.22.release.main.1 TTElectron/36.4.0-rs.22.release.main.1 Safari/537.36';
// 汽水 PC 登录同源 origin —— 读自 qishui-api.js 第 27 行 QISHUI_WEB_PC_API_BASE;qishuiPcUrl(第 306-311 行)据此拼 check_qrconnect/get_qrcode 等 PC 登录接口。
const QISHUI_PC_WARMUP_ORIGIN = 'https://api.qishui.com';

function mergeQishuiCookieStrings(baseCookie, overrideCookie) {
  const map = new Map();
  const add = (str) => {
    String(str || '').split(';').forEach((part) => {
      const seg = part.trim();
      if (!seg) return;
      const eq = seg.indexOf('=');
      const name = (eq >= 0 ? seg.slice(0, eq) : seg).trim();
      if (!name) return;
      map.set(name, seg);
    });
  };
  add(baseCookie);      // 预热 ttwid/passport_csrf_token 等打底
  add(overrideCookie);  // qrPayload.cookie 同名覆盖(优先)
  return Array.from(map.values()).join('; ');
}

function extractQishuiWarmupCookie(setCookieHeader) {
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : (setCookieHeader ? [setCookieHeader] : []);
  const out = [];
  list.forEach((line) => {
    const first = String(line || '').split(';')[0].trim();
    const eq = first.indexOf('=');
    if (eq <= 0) return;
    const name = first.slice(0, eq).trim();
    const val = first.slice(eq + 1).trim();
    if (!name || !val || val.toLowerCase() === 'deleted') return;
    out.push(name + '=' + val);
  });
  return out.join('; ');
}

// 创建二维码前预热:向汽水 PC 登录同源 origin 发一次 GET,捕获 set-cookie(ttwid/passport_csrf_token 等)。
// 失败/超时/无 cookie 一律静默 resolve('') —— 绝不阻塞或抛出到扫码主流程。
function warmupQishuiPcTtwid() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (done) return; done = true; resolve(val || ''); };
    try {
      const https = require('https');
      const req = https.request(QISHUI_PC_WARMUP_ORIGIN + '/', {
        method: 'GET',
        headers: {
          'User-Agent': QISHUI_WEB_UA_WARMUP,
          'Referer': 'app://resources/',
          'Accept': '*/*',
        },
      }, (res) => {
        const setCookie = res.headers && res.headers['set-cookie'];
        res.on('data', () => {});
        res.on('end', () => finish(extractQishuiWarmupCookie(setCookie)));
        res.on('error', () => finish(extractQishuiWarmupCookie(setCookie)));
      });
      req.on('error', () => finish(''));
      req.setTimeout(3500, () => { try { req.destroy(); } catch (e) {} finish(''); });
      req.end();
    } catch (e) {
      finish('');
    }
  });
}

async function openQishuiOfficialWebLoginWindow(owner, config) {
  let qrPayload = null;
  // ttwid 预热:创建二维码前拿到同源会话 cookie(ttwid/passport_csrf_token 等),失败静默('')不阻塞扫码。
  let qishuiPreheatCookie = '';
  try { qishuiPreheatCookie = await warmupQishuiPcTtwid(); } catch (e) { qishuiPreheatCookie = ''; }
  try {
    qrPayload = await createQishuiPcQrLogin();
  } catch (e) {
    console.warn('Qishui PC QR create failed:', e && e.message || e);
    return openQishuiOfficialWebLoginWindowLegacy(owner, config);
  }

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let expireTimer = null;
    let lastStatus = '';
    let qrPollBackoffUntil = 0;
    let qrRateLimitStreak = 0;       // 连续命中限流退避次数(≥2 升格网页登录按钮)
    let qrSwitchHighlighted = false; // 网页登录按钮是否已升格为高亮
    let qrRiskEncountered = false;   // 本次扫码是否命中过汽水风控(限流/短信二次验证);随取消结果回传前端,引导改用 Cookie 粘贴

    const loginWindow = new BrowserWindow({
      width: 560,
      height: 700,
      minWidth: 460,
      minHeight: 560,
      // macOS: 不挂 parent —— 全屏状态下关闭子窗口会触发 AppKit
      // _NSExitFullScreenTransitionController 崩溃(登录成功关窗即黑屏死)
      parent: process.platform !== 'darwin' && owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: '汽水音乐扫码登录',
      backgroundColor: '#10110f',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: QISHUI_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const canUseLoginWindow = () => !settled &&
      loginWindow &&
      !loginWindow.isDestroyed() &&
      loginWindow.webContents &&
      !loginWindow.webContents.isDestroyed();

    const clearTimers = () => {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      if (expireTimer) {
        clearTimeout(expireTimer);
        expireTimer = null;
      }
    };

    const publicResult = (cookie, extra) => ({
      ok: true,
      provider: 'qishui',
      webSession: !!cookie,
      opened: true,
      cookieSaved: !!cookie,
      cookie: cookie || '',
      loggedIn: !!cookie,
      configured: !!cookie,
      searchReady: true,
      publicCatalog: !cookie,
      playbackMode: 'recommend-match',
      oauthConfigured: false,
      oauthMissing: config && config.missing || [],
      message: cookie
        ? '汽水音乐扫码登录态已获取，可同步我的喜欢和歌单；播放仍会按匹配源自动换源。'
        : '已打开汽水音乐扫码窗口；未确认前 QS 搜索匹配源仍可用。',
      ...(extra || {}),
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimers();
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      resolve(result);
    };

    const escaped = (value) => String(value == null ? '' : value).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));

    const buildQrHtml = (statusText) => {
      const qrImg = qrPayload && qrPayload.qrcode || '';
      const statusLine = statusText || '等待汽水音乐 App 扫码…';
      return [
        '<!doctype html><meta charset="utf-8">',
        '<title>汽水音乐扫码登录</title>',
        '<style>',
        'html,body{margin:0;height:100%;background:#10110f;color:#ecf6df;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
        'body{display:grid;place-items:center;}',
        'main{width:min(420px,calc(100vw - 44px));text-align:center;}',
        '.brand{font-size:12px;letter-spacing:.22em;color:#b7d48a;font-weight:800;margin-bottom:12px;}',
        'h1{font-size:25px;margin:0 0 10px;font-weight:850;}',
        'p{margin:0 auto 18px;color:rgba(236,246,223,.70);line-height:1.65;font-size:14px;}',
        '.qr{width:286px;height:286px;margin:0 auto 18px;border-radius:24px;background:#f9fff1;padding:16px;box-shadow:0 24px 70px rgba(100,170,70,.20),inset 0 0 0 1px rgba(20,60,30,.10);}',
        '.qr img{width:100%;height:100%;display:block;border-radius:14px;}',
        '.status{min-height:24px;color:#cce68b;font-weight:700;}',
        'a{color:#d6f89b;text-decoration:none;}',
        '.switch{margin:2px auto 0;display:inline-block;padding:7px 16px;border:0;border-radius:999px;background:rgba(236,246,223,.08);color:rgba(236,246,223,.60);font:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:background .2s,color .2s,transform .2s;}',
        '.switch:hover{color:#ecf6df;background:rgba(236,246,223,.15);}',
        '.switch-hot{background:linear-gradient(90deg,#8fd14f,#cbf58a);color:#0f1a08;font-size:13px;box-shadow:0 10px 26px rgba(120,190,60,.34);animation:switchpulse 1.6s ease-in-out infinite;}',
        '@keyframes switchpulse{0%,100%{transform:scale(1);}50%{transform:scale(1.05);}}',
        '</style><main>',
        '<div class="brand">QISHUI MUSIC</div>',
        '<h1>使用汽水音乐 App 扫码</h1>',
        '<p>请用汽水音乐 App 扫码并确认。确认后 Mineradio 会自动保存汽水登录态，同步汽水歌单与我的喜欢。</p>',
        qrImg ? ('<div class="qr"><img src="' + escaped(qrImg) + '" alt="汽水音乐扫码登录"></div>') : '',
        '<div class="status" id="status">' + escaped(statusLine) + '</div>',
        '<button id="switch-login-btn" class="switch' + (qrSwitchHighlighted ? ' switch-hot' : '') + '" onclick="window.open(\'mineradio://switch-web-login\');return false;">' + (qrSwitchHighlighted ? '限流频繁？试试网页登录，成功率更高' : '改用网页登录') + '</button>',
        qrPayload && qrPayload.qrcodeIndexUrl ? '<p>这个二维码来自汽水 PC 登录接口；抖音 App 扫描可能打开 404 页面，请用汽水音乐 App。</p>' : '',
        '</main>'
      ].join('');
    };

    const setQrStatusText = (statusText) => {
      if (!statusText || !canUseLoginWindow()) return;
      loginWindow.webContents.executeJavaScript(
        `var el=document.getElementById('status'); if(el) el.textContent=${JSON.stringify(statusText)};`,
        true
      ).catch(() => {});
    };

    const armQrExpireTimer = () => {
      if (expireTimer) {
        clearTimeout(expireTimer);
        expireTimer = null;
      }
      const ttlMs = qrPayload && qrPayload.expireTime ? Math.max(30000, qrPayload.expireTime * 1000 - Date.now()) : 180000;
      expireTimer = setTimeout(() => {
        if (!canUseLoginWindow()) return;
        lastStatus = '二维码已过期，请重新打开汽水授权';
        setQrStatusText(lastStatus);
      }, Math.min(240000, ttlMs + 3000));
    };

    const showLocalQrPage = (statusText) => {
      if (!canUseLoginWindow()) return;
      loginWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildQrHtml(statusText))).catch((e) => {
        console.warn('Qishui QR fallback page failed:', e && e.message || e);
      });
    };

    const qrNextPollDelay = (status) => {
      if (!status) return 10000;
      if (status.retryAfterMs) return Math.max(60000, Math.min(90000, Number(status.retryAfterMs) || 60000));
      if (status.needsSms) return 10000;
      const key = String(status.status || '').toLowerCase();
      if (status.cookie || status.confirmed || /scan|confirm|success|login/.test(key)) return 2400;
      if (/error|fail/.test(key)) return 12000;
      if (/expire/.test(key)) return 30000;
      return 10000;
    };

    const scheduleQrPoll = (delayMs) => {
      if (!canUseLoginWindow()) return;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      const delay = Math.max(1500, Math.min(90000, Number(delayMs) || 10000));
      pollTimer = setTimeout(() => {
        pollTimer = null;
        pollQrStatus();
      }, delay);
    };

    const highlightSwitchLoginButton = () => {
      if (qrSwitchHighlighted) return;
      qrSwitchHighlighted = true;
      if (!canUseLoginWindow()) return;
      loginWindow.webContents.executeJavaScript(
        "(function(){var b=document.getElementById('switch-login-btn');if(b){b.className='switch switch-hot';b.textContent='限流频繁？试试网页登录，成功率更高';}})();",
        true
      ).catch(() => {});
    };

    let switchingToWebLogin = false;
    const requestSwitchToWebLogin = () => {
      if (settled || switchingToWebLogin) return;
      switchingToWebLogin = true;
      settled = true; // 阻止 'closed' 回调把结果判为 cancelled;下方以 legacy 网页登录结果 resolve
      clearTimers();
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      openQishuiOfficialWebLoginWindowLegacy(owner, config)
        .then(resolve, () => resolve(publicResult('', { cancelled: true, status: 'switch-web-login-failed' })));
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (String(url || '').includes('mineradio://switch-web-login')) {
        requestSwitchToWebLogin();
        return { action: 'deny' };
      }
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });

    loginWindow.webContents.on('will-navigate', (event, url) => {
      if (/^data:/i.test(String(url || ''))) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (/^https?:\/\//i.test(String(url || ''))) shell.openExternal(url).catch(() => {});
    });

    loginWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (!isMainFrame || Number(errorCode) === -3) return;
      lastStatus = errorDescription || ('load failed: ' + errorCode);
      showLocalQrPage();
    });

    const pollQrStatus = async () => {
      if (!canUseLoginWindow()) return;
      if (qrPollBackoffUntil && Date.now() < qrPollBackoffUntil) {
        setQrStatusText(lastStatus || '汽水确认接口临时限流，已自动降频继续确认…');
        scheduleQrPoll(qrPollBackoffUntil - Date.now() + 250);
        return;
      }
      let nextPollDelay = 10000;
      try {
        const status = await checkQishuiPcQrLogin(qrPayload.token, mergeQishuiCookieStrings(qishuiPreheatCookie, qrPayload.cookie || ''), qrPayload);
        if (status && status.pollCookie) qrPayload.cookie = status.pollCookie;
        nextPollDelay = qrNextPollDelay(status);
        // mac 轮询地板:darwin 下正常轮询间隔不低于 3000ms(退避值本就 ≥60000,不受影响,保持上游其余节奏)
        if (process.platform === 'darwin') nextPollDelay = Math.max(3000, nextPollDelay);
        lastStatus = status && (status.message || status.status) || lastStatus;
        if (!status || !status.retryAfterMs) qrPollBackoffUntil = 0;
        if (!status || !status.retryAfterMs) qrRateLimitStreak = 0;
        if (status && status.cookie) {
          finish(publicResult(status.cookie, { detected: true, status: status.status || 'confirmed' }));
          return;
        }
        if (status && status.retryAfterMs) {
          qrPollBackoffUntil = Date.now() + Math.max(5000, Math.min(90000, Number(status.retryAfterMs) || 0));
          qrRateLimitStreak += 1;
          qrRiskEncountered = true; // 限流即风控信号:用户放弃关窗时据此引导改用 Cookie 粘贴登录
          if (qrRateLimitStreak >= 2) highlightSwitchLoginButton();
          setQrStatusText(lastStatus || '汽水确认接口临时限流，已自动降频继续确认…');
          return;
        }
        if (status && status.needsSms) {
          qrPollBackoffUntil = Date.now() + 10000;
          qrRiskEncountered = true; // 短信/二次验证同样是风控整层拦截,一并作为改用 Cookie 的触发信号
          setQrStatusText(lastStatus || '汽水要求短信或二次验证，请先在汽水 App 内完成账号安全验证');
          return;
        }
        if (status && status.confirmed) {
          setQrStatusText(lastStatus || '已确认，正在换取汽水登录态…');
          return;
        }
        if (status && /error|fail|expire/i.test(String(status.status || ''))) {
          setQrStatusText(lastStatus || '扫码状态异常，正在继续确认当前二维码');
          return;
        }
        setQrStatusText(lastStatus);
      } catch (e) {
        lastStatus = e && e.message || 'QISHUI_QR_CHECK_FAILED';
        nextPollDelay = 12000;
        setQrStatusText('扫码状态暂时无法确认，保留当前二维码继续重试…');
      } finally {
        if (!settled) scheduleQrPoll(nextPollDelay);
      }
    };

    loginWindow.on('ready-to-show', () => {
      if (canUseLoginWindow()) loginWindow.show();
    });
    loginWindow.on('closed', () => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve(publicResult('', { cancelled: true, status: lastStatus || '', riskControlBlocked: qrRiskEncountered }));
    });

    showLocalQrPage();
    armQrExpireTimer();
    scheduleQrPoll(6000);
  });
}

async function openQishuiOfficialWebLoginWindowLegacy(owner, config) {
  const cookieSession = session.fromPartition(QISHUI_LOGIN_PARTITION);

  // 官方 create 接口返回的 qrcode_index_url 是带 token 的真实登录页(裸开 sdk-next 只会 404 TLB);
  // 让窗口直接加载它 = 用汽水官方自己的扫码/登录页与握手,绕开我们被限流的自研确认轮询
  let officialIndexUrl = '';
  let officialIndexCookie = '';
  try {
    const qrPayload = await createQishuiPcQrLogin();
    officialIndexUrl = String(qrPayload && qrPayload.qrcodeIndexUrl || '').trim();
    officialIndexCookie = String(qrPayload && qrPayload.cookie || '').trim();
  } catch (e) {
    console.warn('Qishui official index url create failed:', e && e.message || e);
  }
  // 建码响应同时下发 passport_csrf_token 会话对,托管登录页要校验它们——不塞进窗口分区,裸开该页就是 404(TLB)
  if (officialIndexUrl && officialIndexCookie) {
    const jobs = officialIndexCookie.split(';').map(async (pair) => {
      const eq = pair.indexOf('=');
      if (eq <= 0) return;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) return;
      try {
        await session.fromPartition(QISHUI_LOGIN_PARTITION).cookies.set({
          url: 'https://bff-pc.qishui.com/', name, value, domain: '.qishui.com', path: '/', secure: true,
        });
      } catch (e) { console.warn('Qishui login cookie seed failed:', name, e && e.message || e); }
    });
    try { await Promise.all(jobs); } catch (e) {}
  }

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let loadRetryTimer = null;
    let loadIndex = 0;
    let lastLoadError = '';
    let fallbackLoadQueued = false;
    // mac 实测:qishui.douyin.com 是营销首页、无任何登录入口;bff-pc 的用户中心 SDK 页才是真登录页 —— 登录页优先,首页只作兜底
    const officialLoginUrls = [officialIndexUrl, QISHUI_WEB_LOGIN_FALLBACK_URL, QISHUI_WEB_LOGIN_URL]
      .map((value) => String(value || '').trim())
      .filter((value, index, arr) => value && arr.indexOf(value) === index);

    const loginWindow = new BrowserWindow({
      width: 920,
      height: 760,
      minWidth: 760,
      minHeight: 560,
      // macOS: 不挂 parent —— 全屏状态下关闭子窗口会触发 AppKit
      // _NSExitFullScreenTransitionController 崩溃(登录成功关窗即黑屏死)
      parent: process.platform !== 'darwin' && owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: '汽水音乐官方窗口',
      backgroundColor: '#111111',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: QISHUI_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      clearLoadRetryTimer();
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      resolve(result);
    };

    const publicResult = (cookie, extra) => ({
      ok: true,
      provider: 'qishui',
      webSession: !!cookie,
      opened: true,
      cookieSaved: !!cookie,
      cookie: cookie || '',
      loggedIn: false,
      configured: false,
      searchReady: true,
      publicCatalog: true,
      playbackMode: 'recommend-match',
      oauthConfigured: false,
      oauthMissing: config && config.missing || [],
      message: cookie
        ? '汽水官方网页登录态已保留；当前仍以汽水搜索/匹配源接入。'
        : '已打开汽水/抖音官方窗口；当前仍以汽水搜索/匹配源接入。',
      ...(extra || {}),
    });

    const readResult = async (extra) => {
      try {
        const cookie = await readQishuiLoginCookieHeader(cookieSession);
        return publicResult(qishuiCookieHasLogin(cookie) ? cookie : '', extra);
      } catch (e) {
        return publicResult('', Object.assign({ warning: e.message }, extra || {}));
      }
    };

    const canUseLoginWindow = () => !settled &&
      loginWindow &&
      !loginWindow.isDestroyed() &&
      loginWindow.webContents &&
      !loginWindow.webContents.isDestroyed();

    const clearLoadRetryTimer = () => {
      if (loadRetryTimer) {
        clearTimeout(loadRetryTimer);
        loadRetryTimer = null;
      }
    };

    const scheduleOfficialLoginLoad = () => {
      clearLoadRetryTimer();
      if (!canUseLoginWindow()) return;
      loadRetryTimer = setTimeout(() => {
        loadRetryTimer = null;
        if (canUseLoginWindow()) loadOfficialLoginUrl();
      }, 30);
    };

    const safeLoadLoginWindowUrl = async (url) => {
      if (!canUseLoginWindow()) return { ok: false, skipped: true };
      try {
        await loginWindow.loadURL(url);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e && e.message || String(e) };
      }
    };

    const showLoadFallbackPage = (message) => {
      if (!canUseLoginWindow()) return;
      lastLoadError = message || lastLoadError || '汽水官方网页打开失败';
      const html = [
        '<!doctype html><meta charset="utf-8">',
        '<title>汽水音乐官方窗口</title>',
        '<style>body{margin:0;background:#10110f;color:#e8f4d2;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;height:100vh}main{max-width:560px;padding:28px;text-align:center}h1{font-size:24px;margin:0 0 12px}p{color:rgba(232,244,210,.72);line-height:1.7}a{color:#cde98a}</style>',
        '<main><h1>汽水官方窗口暂时打不开</h1><p>',
        String(lastLoadError).replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch])),
        '</p><p>窗口不会自动关闭；可以稍后重试，或在浏览器里打开汽水官方扫码页。</p></main>'
      ].join('');
      safeLoadLoginWindowUrl('data:text/html;charset=utf-8,' + encodeURIComponent(html)).then(() => {
        if (canUseLoginWindow() && !loginWindow.isVisible()) loginWindow.show();
      });
    };

    const loadOfficialLoginUrl = () => {
      if (!canUseLoginWindow()) return;
      fallbackLoadQueued = false;
      const targetUrl = officialLoginUrls[loadIndex++];
      if (!targetUrl) {
        showLoadFallbackPage(lastLoadError);
        return;
      }
      safeLoadLoginWindowUrl(targetUrl).then((loadResult) => {
        if (loadResult && loadResult.ok) return;
        if (loadResult && loadResult.skipped) return;
        if (fallbackLoadQueued) return;
        fallbackLoadQueued = true;
        lastLoadError = loadResult && loadResult.error || '汽水官方网页打开失败';
        console.warn('Qishui official window load failed:', lastLoadError);
        scheduleOfficialLoginLoad();
      });
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        safeLoadLoginWindowUrl(url).then((result) => {
          if (result && !result.ok && !result.skipped) console.warn('Qishui official window navigation failed:', result.error);
        });
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    loginWindow.webContents.on('will-navigate', (event, url) => {
      if (/^(https?|data):/i.test(String(url || ''))) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      shell.openExternal(url).catch(() => {});
    });

    loginWindow.webContents.on('did-finish-load', () => {
      if (!canUseLoginWindow()) return;
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
              if (!/登录|扫码|抖音登录|立即登录/.test(text)) return false;
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            if (loginNode) { loginNode.click(); return true; }
          }
          return false;
        }, 900);
      `, true).catch(() => {});
    });

    loginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || Number(errorCode) === -3) return;
      if (fallbackLoadQueued) return;
      fallbackLoadQueued = true;
      lastLoadError = errorDescription || ('load failed: ' + errorCode);
      console.warn('Qishui official window did-fail-load:', lastLoadError, validatedURL || '');
      scheduleOfficialLoginLoad();
    });

    // 404/5xx 属于"加载成功"(did-fail-load 不触发),托管页被网关拒绝时必须靠状态码降级到下一条 URL
    loginWindow.webContents.on('did-navigate', (event, url, httpResponseCode) => {
      if (Number(httpResponseCode) < 400) return;
      if (fallbackLoadQueued) return;
      fallbackLoadQueued = true;
      lastLoadError = 'HTTP ' + httpResponseCode + ' @ ' + String(url || '').slice(0, 120);
      console.warn('Qishui official window http error:', lastLoadError);
      scheduleOfficialLoginLoad();
    });

    loginWindow.on('ready-to-show', () => {
      if (canUseLoginWindow()) loginWindow.show();
    });
    loginWindow.on('closed', async () => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      clearLoadRetryTimer();
      resolve(await readResult({ cancelled: false, loadError: lastLoadError || '' }));
    });

    pollTimer = setInterval(async () => {
      try {
        const cookie = await readQishuiLoginCookieHeader(cookieSession);
        if (qishuiCookieHasLogin(cookie)) {
          finish(publicResult(cookie, { detected: true }));
        }
      } catch (e) {
        console.warn('Qishui official cookie check failed:', e.message);
      }
    }, 1400);

    loadOfficialLoginUrl();
  });
}

function qishuiOAuthRedirectMatches(targetUrl, redirectUri) {
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

async function openQishuiMusicLoginWindow(owner) {
  const config = getQishuiOAuthConfig();
  // macOS 无汽水 PC 客户端可读本地 cookie。web 模式想加载的 bff-pc/ucenter_web/sdk-next 登录页在公网不存在(恒 404,
  // 该页只活在汽水 PC 客户端内嵌环境)。pc-qr(Node 端自绘码+轮询)能出码,但确认接口把 Node 客户端归入风控限流
  // (retryAfter≥60s,扫完要干等一分钟以上)。故 mac 默认改走 pc-qr-web:同一套码/确认接口,改由登录窗内
  // 真 Chromium 同源(api.qishui.com)fetch 发出,赌浏览器指纹不吃这层限流;任何异常自动回退 pc-qr,不破坏现状。
  // QISHUI_LOGIN_MODE=pc-qr / web 可强制走旧通道。
  const qishuiDefaultLoginMode = process.platform === 'darwin' ? 'pc-qr-web' : 'local-pc';
  const qishuiLoginMode = String(process.env.QISHUI_LOGIN_MODE || qishuiDefaultLoginMode).toLowerCase();
  const imported = await readQishuiOfficialClientCookieHeader();
  if (imported && imported.cookie) {
    return {
      ok: true,
      provider: 'qishui',
      webSession: true,
      opened: false,
      cookieSaved: true,
      cookie: imported.cookie,
      loggedIn: true,
      configured: true,
      searchReady: true,
      publicCatalog: false,
      playbackMode: 'recommend-match',
      oauthConfigured: false,
      oauthMissing: config && config.missing || [],
      importedOfficialClient: true,
      source: imported.source,
      importMethod: imported.method || 'cookie-db',
      message: '已读取本地汽水 PC 客户端登录态，正在同步我的喜欢和歌单',
    };
  }
  if (qishuiLoginMode === 'pc-qr') {
    return openQishuiOfficialWebLoginWindow(owner, config);
  }
  // Q3 实验模式:仅在 QISHUI_LOGIN_MODE=pc-qr-web 显式开启,pc-qr 原路径保持不动。任何异常都回退 pc-qr。
  if (qishuiLoginMode === 'pc-qr-web') {
    return openQishuiPcQrWebLoginWindow(owner, config);
  }
  if (qishuiLoginMode === 'web') {
    return openQishuiOfficialWebLoginWindowLegacy(owner, config);
  }
  return {
    ok: false,
    provider: 'qishui',
    error: imported && imported.locked ? 'QISHUI_LOCAL_COOKIE_DB_LOCKED' : 'QISHUI_LOCAL_COOKIE_NOT_FOUND',
    localPcImport: true,
    source: imported && (imported.dbPath || imported.source) || '',
    locked: !!(imported && imported.locked),
    searchReady: true,
    publicCatalog: true,
    message: imported && imported.locked
      ? '汽水 PC 客户端正在占用本地登录数据库。请先完全退出汽水音乐 PC 端，再回到 Mineradio 点击“读取本地汽水”。'
      : '没有读到本地汽水 PC 登录态。请先在汽水音乐 PC 端登录一次，完全退出汽水音乐后再点击“读取本地汽水”。',
  };
}

// ─── Q3 实验:pc-qr-web ───────────────────────────────────────────────────────
// 假设:pc-qr 确认接口拒的是 Node 端 https 的 TLS/设备指纹;把 get_qrcode / check_qrconnect
// 放到一个加载到 https://api.qishui.com(与 passport 接口同源,规避 CORS)的登录窗内用 fetch 发出,
// 借真实 Chromium 的 UA/TLS/ttwid/msToken 生态,尝试绕过风控。登录态 cookie 由该窗会话自带,
// 从分区 cookie jar 读出(fetch 读不到 Set-Cookie,故以 jar 里出现 sessionid 作为确认成功信号)。
// 任一步异常一律回退标准 pc-qr,绝不破坏现状。默认模式仍是 pc-qr。
async function openQishuiPcQrWebLoginWindow(owner, config) {
  try {
    return await runQishuiPcQrWebLogin(owner, config);
  } catch (e) {
    console.warn('Qishui pc-qr-web 实验失败,回退 pc-qr:', e && e.message || e);
    return openQishuiOfficialWebLoginWindow(owner, config);
  }
}

function runQishuiPcQrWebLogin(owner, config) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer = null;
    let token = '';
    let rlStreak = 0;            // error_code=7 连续限流计数:渐进退避,关窗时作为风控标志回传(前端据此展开 Cookie 粘贴区)
    let exchangeStartedAt = 0;   // 已整窗导航去 redirect_url 兑换登录态的时刻;此后不再发 check,只轮询 cookie jar
    const deadline = Date.now() + 180000; // 实验最长 3 分钟,超时按取消处理
    const sess = session.fromPartition(QISHUI_LOGIN_PARTITION);

    const loginWindow = new BrowserWindow({
      width: 560, height: 700, minWidth: 460, minHeight: 560,
      parent: process.platform !== 'darwin' && owner && !owner.isDestroyed() ? owner : undefined,
      modal: false, show: false, autoHideMenuBar: true,
      title: '汽水音乐扫码登录(实验)', backgroundColor: '#10110f', icon: APP_ICON_ICO,
      webPreferences: { partition: QISHUI_LOGIN_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    // 关键:窗口默认 UA 带 "Mineradio/Electron" 字样,页内 fetch 用的就是窗口 UA(User-Agent 是 fetch 禁改头,页面盖不掉),
    // 风控一眼识别 → 每次 check 吃 error_code=7。这里把窗口 UA 换成与 Node 干净路径同源的官方 SodaMusic UA,
    // 抹平「Node 探针干净、实验窗口被限流」的落差(实验前提本就是借真实客户端身份过风控)。
    try { loginWindow.webContents.setUserAgent(QISHUI_WEB_UA_WARMUP); } catch (_) {}

    const alive = () => !settled && loginWindow && !loginWindow.isDestroyed() && loginWindow.webContents && !loginWindow.webContents.isDestroyed();
    const clearPoll = () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } };
    const escaped = (v) => String(v == null ? '' : v).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));

    const publicResult = (cookie, extra) => ({
      ok: true, provider: 'qishui', webSession: !!cookie, opened: true, cookieSaved: !!cookie,
      cookie: cookie || '', loggedIn: !!cookie, configured: !!cookie, searchReady: true,
      publicCatalog: !cookie, playbackMode: 'recommend-match', oauthConfigured: false,
      oauthMissing: config && config.missing || [], experiment: 'pc-qr-web',
      message: cookie
        ? '汽水音乐扫码登录态已获取(实验通道),可同步我的喜欢和歌单。'
        : '已打开汽水扫码窗口(实验通道);未确认前 QS 搜索匹配源仍可用。',
      ...(extra || {}),
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearPoll();
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      resolve(result);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearPoll();
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      reject(err instanceof Error ? err : new Error(String(err || 'QISHUI_PCQRWEB_FAILED')));
    };

    // 在登录窗内(同源 api.qishui.com)发 fetch;fetch 读不到 Set-Cookie,但会写进分区 cookie jar。
    const fetchInPage = (url, init) => {
      if (!alive()) return Promise.reject(new Error('QISHUI_PCQRWEB_WINDOW_GONE'));
      const p = JSON.stringify({ url: url, init: init || {} });
      return loginWindow.webContents.executeJavaScript(
        '(async()=>{try{const p=' + p + ';const r=await fetch(p.url,Object.assign({credentials:"include"},p.init));const t=await r.text();return{ok:r.ok,status:r.status,text:t};}catch(e){return{ok:false,status:0,error:String(e&&e.message||e)};}})()',
        true
      );
    };

    // 汇总分区里几个汽水/抖音域的 cookie,出现 sessionid 即视为登录态下发成功。
    const collectCookie = async () => {
      const urls = ['https://api.qishui.com/', 'https://qishui.com/', 'https://www.qishui.com/', 'https://www.douyin.com/'];
      const seen = new Map();
      for (const u of urls) {
        let list = [];
        try { list = await sess.cookies.get({ url: u }); } catch (_) {}
        for (const c of (list || [])) if (c && c.name) seen.set(c.name, c.value);
      }
      return Array.from(seen.entries()).map(([k, v]) => k + '=' + v).join('; ');
    };

    // 页面文档写入自绘二维码(document.write 不改变 origin,fetch 仍是同源 api.qishui.com)。
    const renderQr = (qrImg, statusText) => {
      if (!alive()) return;
      const body = '<div style="min-height:100vh;margin:0;display:grid;place-items:center;background:#10110f;color:#ecf6df;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;">'
        + '<div style="width:min(420px,calc(100vw - 44px));text-align:center;">'
        + '<div style="font-size:12px;letter-spacing:.22em;color:#b7d48a;font-weight:800;margin-bottom:12px;">QISHUI MUSIC · 实验通道</div>'
        + '<h1 style="font-size:24px;margin:0 0 10px;font-weight:850;">使用汽水音乐 App 扫码</h1>'
        + (qrImg ? '<div style="width:286px;height:286px;margin:0 auto 18px;border-radius:24px;background:#f9fff1;padding:16px;"><img src="' + escaped(qrImg) + '" style="width:100%;height:100%;display:block;border-radius:14px;"></div>' : '')
        + '<div id="status" style="min-height:24px;color:#cce68b;font-weight:700;">' + escaped(statusText || '等待汽水音乐 App 扫码…') + '</div>'
        + '</div></div>';
      const doc = '<!doctype html><meta charset="utf-8"><title>汽水音乐扫码登录</title>' + body;
      loginWindow.webContents.executeJavaScript('document.open();document.write(' + JSON.stringify(doc) + ');document.close();', true).catch(() => {});
    };
    const setStatus = (t) => {
      if (!t || !alive()) return;
      loginWindow.webContents.executeJavaScript('var el=document.getElementById("status");if(el)el.textContent=' + JSON.stringify(t) + ';', true).catch(() => {});
    };

    const schedulePoll = (d) => {
      if (!alive()) return;
      clearPoll();
      pollTimer = setTimeout(() => { pollTimer = null; pollOnce(); }, Math.max(1500, Math.min(30000, Number(d) || 3500)));
    };

    const pollOnce = async () => {
      if (!alive()) return;
      if (Date.now() > deadline) { finish(publicResult('', { cancelled: true, status: 'timeout', riskControlBlocked: rlStreak > 0 })); return; }
      let nextDelay = 3500;
      try {
        // 先看会话内是否已下发登录态 cookie(确认成功的最终信号)
        const jar = await collectCookie();
        if (qishuiCookieHasLogin(jar)) { finish(publicResult(jar, { detected: true })); return; }
        // 兑换阶段:整窗已导航去 redirect_url,页面不再是我们的文档,只轮询 cookie jar 等 session 落袋
        if (exchangeStartedAt) {
          if (Date.now() - exchangeStartedAt > 25000) { finish(publicResult('', { cancelled: true, status: 'exchange-timeout', riskControlBlocked: rlStreak > 0 })); return; }
          nextDelay = 1200;
          return;
        }
        const checkUrl = qishuiPcUrl('/passport/web/check_qrconnect/', qishuiPcPassportParams());
        const body = qishuiOrderedForm({
          need_logo: QISHUI_PC_FIXED.need_logo,
          need_short_url: QISHUI_PC_FIXED.need_short_url,
          is_frontier: QISHUI_PC_FIXED.is_frontier,
          token: token,
          is_new_login: QISHUI_PC_FIXED.is_new_login,
          next: QISHUI_PC_FIXED.next,
        }, ['need_logo', 'need_short_url', 'is_frontier', 'token', 'is_new_login', 'next']);
        const res = await fetchInPage(checkUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json,text/javascript' }, body: body });
        let json = {};
        try { json = JSON.parse(res && res.text || '{}'); } catch (_) {}
        const data = (json && json.data) || {};
        const errorCode = qishuiQrErrorCode(data, json);
        const qrStatus = String(data.status || data.qr_status || json.status || '').toLowerCase();
        const jar2 = await collectCookie();
        if (qishuiCookieHasLogin(jar2)) { finish(publicResult(jar2, { detected: true })); return; }
        if (errorCode === 7) {
          // 7 = 确认接口限流(实测:全新码 check 返回 status:"new"/error_code:0,7 只在敏感时刻或高频轮询后出现),
          // 不是「等待扫码」。渐进退避 15s→30s→60s,码本身仍有效,确认过的话退避结束那次就能拿到 confirmed。
          rlStreak += 1;
          nextDelay = Math.min(60000, 15000 * Math.pow(2, rlStreak - 1));
          setStatus('汽水确认接口限流,' + Math.round(nextDelay / 1000) + ' 秒后自动重试(二维码仍有效,已确认的话稍候即可)');
          return;
        }
        rlStreak = 0;
        if (/confirm|success|login/.test(qrStatus)) {
          const redirectUrl = qishuiPcQrRedirectUrl(json, data);
          if (redirectUrl) {
            // 关键兑换步骤(之前缺失,导致确认了也进不去):确认后必须访问 redirect_url,session cookie 才会下发。
            // 用整窗真实导航而非页内 fetch —— 跨域重定向链的 Set-Cookie 语义与真浏览器完全一致,全部落进分区 jar。
            setStatus('已确认,正在换取汽水登录态…');
            exchangeStartedAt = Date.now();
            loginWindow.loadURL(redirectUrl).catch(() => {});
            nextDelay = 1200;
          } else {
            setStatus('已确认,等待登录态下发…');
            nextDelay = 2000;
          }
        } else if (/scan/.test(qrStatus)) {
          setStatus('已扫码,请在汽水音乐 App 内确认…');
          nextDelay = 2500;   // 确认在即,收紧节奏,抢在限流窗口前拿到 confirmed
        } else if (/expire|cancel|invalid/.test(qrStatus)) {
          setStatus('二维码已过期,正在自动刷新…');
          try { await startFlow(); return; } catch (_) { setStatus('二维码刷新失败,请关闭窗口重试'); nextDelay = 8000; }
        } else if (errorCode) {
          setStatus('扫码返回 error_code=' + errorCode + ',继续确认当前二维码');
        } else {
          setStatus('等待汽水音乐 App 扫码…');   // status=new(实测全新码即此值)或未知,默认等待
          nextDelay = 4000;
        }
      } catch (e) {
        nextDelay = 6000;
      } finally {
        if (!settled) schedulePoll(nextDelay);
      }
    };

    const startFlow = async () => {
      // 1) 同源 fetch 拉二维码(create 步骤 Node 端本就能出码,这里改由 Chromium 同源发,保证与 check 同一设备身份)
      const qrUrl = qishuiPcUrl('/passport/web/get_qrcode/', qishuiPcPassportParams({
        next: QISHUI_PC_FIXED.next,
        need_logo: QISHUI_PC_FIXED.need_logo,
        need_short_url: QISHUI_PC_FIXED.need_short_url,
        is_frontier: QISHUI_PC_FIXED.is_frontier,
      }));
      const res = await fetchInPage(qrUrl, { method: 'GET', headers: { 'Accept': 'application/json,text/javascript' } });
      let json = {};
      try { json = JSON.parse(res && res.text || '{}'); } catch (_) {}
      const data = (json && json.data) || {};
      token = String(data.token || '').trim();
      const qrImg = data.qrcode || '';
      if (!token) throw new Error('QISHUI_PCQRWEB_QR_TOKEN_MISSING' + (res && res.status ? (':' + res.status) : ''));
      renderQr(qrImg, '请用汽水音乐 App 扫码并确认');
      if (alive() && !loginWindow.isVisible()) loginWindow.show();
      schedulePoll(3000);
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });
    loginWindow.on('ready-to-show', () => { if (alive()) loginWindow.show(); });
    loginWindow.on('closed', () => {
      if (settled) return;
      settled = true;
      clearPoll();
      resolve(publicResult('', { cancelled: true, status: 'closed', riskControlBlocked: rlStreak > 0 }));   // 限流过就带风控标志,前端自动展开 Cookie 粘贴区
    });
    loginWindow.webContents.once('did-finish-load', () => { startFlow().catch((e) => fail(e)); });
    loginWindow.webContents.once('did-fail-load', (_e, code, desc, _u, isMain) => {
      if (exchangeStartedAt) return;   // 兑换导航失败不整体回退:cookie 可能已在前几跳落袋,交给 jar 轮询和兑换超时兜底
      if (isMain && Number(code) !== -3) fail(new Error('QISHUI_PCQRWEB_LOAD_FAILED:' + code + ':' + (desc || '')));
    });
    // 加载前先把 ttwid 预热 cookie 种进分区(Node 干净路径也这么做):get_qrcode/check 首发即带 ttwid,少一个风控信号缺失。
    (async () => {
      let warm = '';
      try { warm = await warmupQishuiPcTtwid(); } catch (_) { warm = ''; }
      if (warm && alive()) {
        for (const pair of warm.split(';')) {
          const eq = pair.indexOf('=');
          if (eq <= 0) continue;
          const name = pair.slice(0, eq).trim();
          const value = pair.slice(eq + 1).trim();
          if (!name) continue;
          try { await sess.cookies.set({ url: 'https://api.qishui.com/', name, value, domain: '.qishui.com', path: '/', secure: true }); } catch (_) {}
        }
      }
      if (alive()) loginWindow.loadURL('https://api.qishui.com/').catch((e) => fail(e));
    })();
  });
}

async function clearQishuiMusicLoginSession() {
  const cookieSession = session.fromPartition(QISHUI_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
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

ipcMain.handle('mineradio-get-gpu-diagnostics', () => {
  return getGpuDiagnostics();
});

// 负载 HUD 设备指标:系统/播放器 CPU + 系统/播放器内存(HUD 可见时渲染层每 2s 拉一次)
let __deviceStatsCpuPrev = null; // os.cpus() 上次累计采样,用于系统 CPU 差分
ipcMain.handle('mineradio-device-stats', async () => {
  const out = { sysCpuPct: null, appCpuPct: null, memUsedMB: null, memTotalMB: null, memFreeMB: null, appMemMB: null };
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

ipcMain.handle('mineradio-memory-trim-app', async (_event, payload = {}) => {
  return trimAppMemoryNow(payload.reason || 'renderer');
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
    const result = await systemMemory.purgeSystemMemorySmart(mask, { autoElevate, manual: true });
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
  return openNeteaseMusicLoginWindow(getSenderWindow(event));
});

ipcMain.handle('netease-music-clear-login', async () => {
  return clearNeteaseMusicLoginSession();
});

ipcMain.handle('qq-music-open-login', async (event) => {
  return openQQMusicLoginWindow(getSenderWindow(event));
});

ipcMain.handle('qq-music-clear-login', async () => {
  return clearQQMusicLoginSession();
});

ipcMain.handle('kugou-music-open-login', async (event) => {
  return openKugouMusicLoginWindow(getSenderWindow(event));
});

ipcMain.handle('kugou-music-clear-login', async () => {
  return clearKugouMusicLoginSession();
});

ipcMain.handle('qishui-music-open-login', async (event) => {
  return openQishuiMusicLoginWindow(getSenderWindow(event));
});

ipcMain.handle('qishui-music-clear-login', async () => {
  return clearQishuiMusicLoginSession();
});

ipcMain.handle('spotify-music-open-login', async (event) => {
  return openSpotifyMusicLoginWindow(getSenderWindow(event));
});

ipcMain.handle('spotify-music-clear-login', async () => {
  return clearSpotifyMusicLoginSession();
});

function loginCookieExportMeta(provider) {
  const key = String(provider || '').toLowerCase();
  const userData = app.getPath('userData');
  const entries = {
    netease: { label: '网易云音乐', files: [process.env.COOKIE_FILE, path.join(userData, '.cookie')] },
    qq: { label: 'QQ音乐', files: [process.env.QQ_COOKIE_FILE, path.join(userData, '.qq-cookie')] },
    kugou: { label: '酷狗音乐', files: [process.env.KUGOU_COOKIE_FILE, path.join(userData, '.kugou-cookie')] },
    qishui: { label: '汽水音乐', files: [process.env.QISHUI_COOKIE_FILE, path.join(userData, '.qishui-cookie'), process.env.QISHUI_TOKEN_FILE, path.join(userData, '.qishui-token')] },
    spotify: { label: 'Spotify', files: [process.env.SPOTIFY_TOKEN_FILE, path.join(userData, '.spotify-token.json')] },
  };
  return entries[key] || null;
}

ipcMain.handle('mineradio-export-login-cookie', async (_event, provider) => {
  try {
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

async function createWindow() {
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

  // 音源状态文件(酷狗VIP凭据/汽水token+OAuth/Spotify凭据+token)必须落 userData:
  // mac 的 app bundle 视为只读且随更新被整体覆盖, provider 模块保持与上游零差异, 路径全走环境变量注入
  const providerStateDir = app.getPath('userData');
  if (!process.env.KUGOU_VIP_EVIDENCE_FILE) process.env.KUGOU_VIP_EVIDENCE_FILE = path.join(providerStateDir, 'kugou-vip-evidence.json');
  if (!process.env.QISHUI_TOKEN_FILE) process.env.QISHUI_TOKEN_FILE = path.join(providerStateDir, 'qishui-token.json');
  if (!process.env.QISHUI_COOKIE_FILE) process.env.QISHUI_COOKIE_FILE = path.join(providerStateDir, '.qishui-cookie');
  if (!process.env.QISHUI_OAUTH_CONFIG_FILE) process.env.QISHUI_OAUTH_CONFIG_FILE = path.join(providerStateDir, 'qishui-oauth.json');
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
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 18 }, fullscreenable: true }
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
    await createWindow();
    try { require('./telemetry').startTelemetry(); } catch (e) {}
    // macOS Touch Bar 播放控制（无 Touch Bar 的机器安全 no-op，不报错）
    try {
      touchbar.init({ window: mainWindow, sendAction: sendGlobalHotkeyAction, ipcMain: ipcMain });
    } catch (e) { console.log('[TouchBar] 初始化跳过:', e.message); }
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
