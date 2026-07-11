// Mineradio · macOS 壁纸模式(移植自群内 1.1.8 成功版)
// 做法:把主窗口降到桌面层(原生模块 setDesktopLevel)+ 临时把系统壁纸设成黑底,退出/崩溃自动还原。
// 自包含:仅通过 init(refs) 接入主进程的 mainWindow / sendWindowState 等,避免侵入式改 main.js。
const { app, BrowserWindow, screen, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const IS_MAC = process.platform === 'darwin';
const MAC_WALLPAPER_EXIT_SHORTCUT = 'CommandOrControl+Option+W';
const MAC_WALLPAPER_NOTICE_DURATION_MS = 6000;
const MAC_SYSTEM_WALLPAPER_RESTORE_FILE = 'mac-wallpaper-restore.json';
const MAC_BLACK_WALLPAPER_DIR = 'wallpaper-mode';

let R = {
  getMainWindow: () => null,
  sendWindowState: () => {},
  getWindowFullscreenActive: () => false,
  setFullscreenFlags: () => {},
  onLeave: () => {},
};
function init(opts) { R = Object.assign(R, opts || {}); }
function mw() { return R.getMainWindow(); }

let wallpaperState = {};
let mainWallpaperMode = { active: false, pending: false, restore: null, nativeResult: null };
let macWallpaperWindowBridge = null;
let macWallpaperExitShortcutRegistered = false;
let macWallpaperNoticeWindow = null;
let macWallpaperNoticeTimer = null;
let wallpaperTray = null;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function windowMethodValue(win, method, fallback) {
  try {
    if (win && !win.isDestroyed() && typeof win[method] === 'function') return win[method]();
  } catch (e) {}
  return fallback;
}
function isMacSimpleFullScreen(win) {
  return IS_MAC && !!win && !win.isDestroyed()
    && typeof win.isSimpleFullScreen === 'function' && win.isSimpleFullScreen();
}
function escapeNoticeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function asarUnpackedPath(filePath) {
  const marker = `${path.sep}app.asar${path.sep}`;
  if (!filePath.includes(marker)) return filePath;
  const unpackedPath = filePath.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`);
  return fs.existsSync(unpackedPath) ? unpackedPath : filePath;
}

function loadBridge() {
  if (!IS_MAC) return null;
  if (macWallpaperWindowBridge) return macWallpaperWindowBridge;
  const bridgePath = asarUnpackedPath(path.join(__dirname, 'native', 'mac-wallpaper-window.node'));
  if (!fs.existsSync(bridgePath)) return null;
  try { macWallpaperWindowBridge = require(bridgePath); }
  catch (e) { console.warn('Mac wallpaper native bridge load failed:', e.message); macWallpaperWindowBridge = null; }
  return macWallpaperWindowBridge;
}

function macSystemWallpaperRestorePath() { return path.join(app.getPath('userData'), MAC_SYSTEM_WALLPAPER_RESTORE_FILE); }
function macBlackWallpaperDirectory() { return path.join(app.getPath('userData'), MAC_BLACK_WALLPAPER_DIR); }

function normalizeMacDesktopImageRecords(value) {
  const raw = Array.isArray(value) ? value : (value && Array.isArray(value.screens) ? value.screens : []);
  return raw.map((item, index) => {
    if (typeof item === 'string') return { index, url: item };
    return {
      index: Number.isFinite(Number(item && item.index)) ? Number(item.index) : index,
      url: String(item && item.url || ''),
    };
  }).filter((item) => item.url);
}

function readRestoreSnapshot() {
  if (!IS_MAC) return null;
  try {
    const filePath = macSystemWallpaperRestorePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}') || {};
    const screens = normalizeMacDesktopImageRecords(raw.screens || raw.records);
    if (!screens.length) return null;
    return { screens, createdAt: Number(raw.createdAt) || 0 };
  } catch (e) { console.warn('Mac wallpaper restore snapshot read failed:', e.message); return null; }
}
function writeRestoreSnapshot(snapshot) {
  if (!IS_MAC || !snapshot || !Array.isArray(snapshot.screens) || !snapshot.screens.length) return false;
  try {
    fs.mkdirSync(path.dirname(macSystemWallpaperRestorePath()), { recursive: true });
    fs.writeFileSync(macSystemWallpaperRestorePath(), JSON.stringify({ createdAt: snapshot.createdAt || Date.now(), screens: snapshot.screens }, null, 2));
    return true;
  } catch (e) { console.warn('Mac wallpaper restore snapshot write failed:', e.message); return false; }
}
function clearRestoreSnapshot() {
  if (!IS_MAC) return;
  try { const f = macSystemWallpaperRestorePath(); if (fs.existsSync(f)) fs.unlinkSync(f); }
  catch (e) { console.warn('Mac wallpaper restore snapshot cleanup failed:', e.message); }
}

let pngCrcTable = null;
function pngCrc32(buffer) {
  if (!pngCrcTable) {
    pngCrcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); pngCrcTable[n] = c >>> 0; }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = pngCrcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = data || Buffer.alloc(0);
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  typeBuffer.copy(out, 4);
  body.copy(out, 8);
  out.writeUInt32BE(pngCrc32(Buffer.concat([typeBuffer, body])), 8 + body.length);
  return out;
}
function createBlackPng(width, height) {
  const w = Math.max(64, Math.min(8192, Math.round(Number(width) || 1920)));
  const h = Math.max(64, Math.min(8192, Math.round(Number(height) || 1080)));
  const signature = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = 1 + w * 3;
  const raw = Buffer.alloc(stride * h);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND')]);
}
function ensureBlackFile(display) {
  const bounds = (display && display.bounds) || {};
  const width = Math.max(64, Math.min(8192, Math.round(Number(bounds.width) || 1920)));
  const height = Math.max(64, Math.min(8192, Math.round(Number(bounds.height) || 1080)));
  const directory = macBlackWallpaperDirectory();
  const filePath = path.join(directory, `mineradio-black-v2-${width}x${height}.png`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filePath, createBlackPng(width, height));
  return filePath;
}

function captureSnapshot() {
  const bridge = loadBridge();
  if (!bridge || typeof bridge.getDesktopImages !== 'function') return null;
  const result = bridge.getDesktopImages();
  if (result && result.ok === false) return null;
  const screens = normalizeMacDesktopImageRecords(result);
  if (!screens.length) return null;
  return { createdAt: Date.now(), screens };
}
function restoreSystemWallpaper(snapshot, reason) {
  if (!IS_MAC) return { ok: true, skipped: true };
  const bridge = loadBridge();
  if (!bridge || typeof bridge.restoreDesktopImages !== 'function') return { ok: false, error: 'MAC_WALLPAPER_BRIDGE_MISSING' };
  const snap = snapshot && Array.isArray(snapshot.screens) && snapshot.screens.length ? snapshot : readRestoreSnapshot();
  if (!snap || !snap.screens || !snap.screens.length) return { ok: true, skipped: true };
  try {
    const result = bridge.restoreDesktopImages(snap.screens);
    if (result && result.ok === false) { console.warn(`Mac wallpaper restore failed${reason ? ` (${reason})` : ''}:`, result.error || 'unknown'); return result; }
    clearRestoreSnapshot();
    return result || { ok: true };
  } catch (e) { console.warn(`Mac wallpaper restore failed${reason ? ` (${reason})` : ''}:`, e.message); return { ok: false, error: e.message }; }
}
function applyBlackWallpaper(display) {
  if (!IS_MAC) return { ok: true, skipped: true };
  const bridge = loadBridge();
  if (!bridge || typeof bridge.setDesktopImages !== 'function') return { ok: false, error: 'MAC_WALLPAPER_BRIDGE_MISSING' };
  const snapshot = captureSnapshot();
  if (!snapshot || !snapshot.screens.length) return { ok: false, error: 'MAC_WALLPAPER_SNAPSHOT_FAILED' };
  if (!writeRestoreSnapshot(snapshot)) return { ok: false, error: 'MAC_WALLPAPER_RESTORE_SNAPSHOT_WRITE_FAILED' };
  try {
    const blackPath = ensureBlackFile(display || targetDisplay());
    const result = bridge.setDesktopImages(blackPath);
    if (result && result.ok === false) { console.warn('Mac wallpaper black sync failed:', result.error || 'unknown'); restoreSystemWallpaper(snapshot, 'black-sync-failed'); return result; }
    return { ok: true, blackPath, snapshot };
  } catch (e) { console.warn('Mac wallpaper black sync failed:', e.message); restoreSystemWallpaper(snapshot, 'black-sync-exception'); return { ok: false, error: e.message }; }
}
function restorePending(reason) {
  const snapshot = readRestoreSnapshot();
  if (!snapshot) return;
  restoreSystemWallpaper(snapshot, reason || 'pending');
}

function targetDisplay() {
  const win = mw();
  if (win && !win.isDestroyed()) return screen.getDisplayMatching(win.getBounds());
  return screen.getPrimaryDisplay();
}
function targetBounds() {
  const display = targetDisplay();
  return display && display.bounds ? display.bounds : screen.getPrimaryDisplay().bounds;
}
function applyLevel(win, enabled) {
  if (!win || win.isDestroyed()) return { ok: false, error: 'NO_WINDOW' };
  const bridge = loadBridge();
  if (!bridge) return { ok: false, error: 'MAC_WALLPAPER_BRIDGE_MISSING' };
  if (typeof win.getNativeWindowHandle !== 'function') return { ok: false, error: 'NO_NATIVE_WINDOW_HANDLE' };
  const handle = win.getNativeWindowHandle();
  if (enabled) return bridge.setDesktopLevel(handle, { strategy: 'desktop', ignoreMouse: true });
  return bridge.restoreNormalLevel(handle, { hasShadow: true });
}

function isBusy() { return !!(mainWallpaperMode.active || mainWallpaperMode.pending); }
function reset() { mainWallpaperMode = { active: false, pending: false, restore: null, nativeResult: null }; }
function normalizeBounds(bounds) {
  if (!bounds) return null;
  const x = Number(bounds.x), y = Number(bounds.y), width = Number(bounds.width), height = Number(bounds.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
function restoreBoundsOf(win) {
  if (!win || win.isDestroyed()) return null;
  return normalizeBounds(windowMethodValue(win, 'getNormalBounds', null)) || normalizeBounds(win.getBounds());
}

function registerExitShortcut() {
  if (!IS_MAC) return false;
  if (macWallpaperExitShortcutRegistered) return true;
  try { macWallpaperExitShortcutRegistered = globalShortcut.register(MAC_WALLPAPER_EXIT_SHORTCUT, () => { leave({ restoreBounds: true, focus: true }); }); }
  catch (e) { macWallpaperExitShortcutRegistered = false; }
  return macWallpaperExitShortcutRegistered;
}
function unregisterExitShortcut() {
  if (!macWallpaperExitShortcutRegistered) return;
  try { globalShortcut.unregister(MAC_WALLPAPER_EXIT_SHORTCUT); } catch (e) {}
  macWallpaperExitShortcutRegistered = false;
}

function applyOpacity(payload = wallpaperState) {
  const win = mw();
  if (!win || win.isDestroyed() || typeof win.setOpacity !== 'function') return;
  win.setOpacity(isBusy() ? 1 : clampNumber(payload.opacity, 0.35, 1, 1));
}
function reposition() {
  const win = mw();
  if (!mainWallpaperMode.active || !win || win.isDestroyed()) return;
  win.setBounds(targetBounds(), false);
  applyOpacity(wallpaperState);
  R.sendWindowState(win);
}

// ===== 提示窗 =====
function noticeFlagPath() { return path.join(app.getPath('userData'), 'mac-wallpaper-notice-shown'); }
function noticeShownBefore() { try { return fs.existsSync(noticeFlagPath()); } catch (e) { return false; } }
function markNoticeShown() { try { fs.writeFileSync(noticeFlagPath(), '1'); } catch (e) {} }
function noticeBounds() {
  const display = targetDisplay();
  const area = (display && display.workArea) || (display && display.bounds) || screen.getPrimaryDisplay().workArea;
  const width = Math.round(Math.min(520, Math.max(360, area.width - 72)));
  const height = 106;
  return { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + Math.max(24, Math.min(56, area.height * 0.055))), width, height };
}
function noticeHtml(options = {}) {
  const shortcutRegistered = options.shortcutRegistered !== false;
  const title = '壁纸模式已开启';
  const body = shortcutRegistered
    ? '菜单栏 MR 图标可切歌 / 调预设 / 音量;按 Cmd+Option+W 或点 Dock 图标退出。'
    : '菜单栏 MR 图标可控制;点 Dock 图标或重开 Mineradio 退出壁纸。';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Arial,sans-serif;user-select:none;-webkit-user-select:none}
  body{display:grid;place-items:center;padding:8px;color:rgba(255,255,255,.94)}
  .card{position:relative;width:100%;min-height:88px;padding:16px 20px 16px 22px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:linear-gradient(145deg,rgba(13,16,22,.91),rgba(6,8,12,.82));box-shadow:0 24px 72px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.10);backdrop-filter:blur(26px) saturate(1.18);-webkit-backdrop-filter:blur(26px) saturate(1.18)}
  .card::before{content:"";position:absolute;left:0;top:18px;bottom:18px;width:3px;border-radius:0 999px 999px 0;background:linear-gradient(180deg,#7fd8ff,#9cffdf);box-shadow:0 0 18px rgba(127,216,255,.52)}
  .title{font-size:15px;font-weight:700;line-height:1.25}.body{margin-top:7px;font-size:13px;line-height:1.45;color:rgba(238,246,255,.76)}
  .x{position:absolute;top:8px;right:10px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;color:rgba(255,255,255,.6);cursor:pointer;background:rgba(255,255,255,.08)}.x:hover{color:#fff;background:rgba(255,255,255,.18)}
  </style></head><body><div class="card" role="status" aria-live="polite"><div class="x" onclick="window.close()">✕</div><div class="title">${escapeNoticeHtml(title)}</div><div class="body">${escapeNoticeHtml(body)}</div></div></body></html>`;
}
function positionNotice() { if (macWallpaperNoticeWindow && !macWallpaperNoticeWindow.isDestroyed()) macWallpaperNoticeWindow.setBounds(noticeBounds(), false); }
function closeNotice() {
  if (macWallpaperNoticeTimer) { clearTimeout(macWallpaperNoticeTimer); macWallpaperNoticeTimer = null; }
  if (macWallpaperNoticeWindow && !macWallpaperNoticeWindow.isDestroyed()) macWallpaperNoticeWindow.close();
  macWallpaperNoticeWindow = null;
}
function showNotice(options = {}) {
  if (!IS_MAC) return;
  closeNotice();
  const bounds = noticeBounds();
  const noticeWindow = new BrowserWindow({
    ...bounds, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, focusable: false,
    skipTaskbar: true, show: false, title: 'Mineradio Wallpaper Notice', focusable: true,
    webPreferences: { devTools: !app.isPackaged, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  macWallpaperNoticeWindow = noticeWindow;
  try {
    noticeWindow.setAlwaysOnTop(true, 'screen-saver');
    noticeWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (e) { console.warn('Mac wallpaper notice setup skipped:', e.message); }
  const doShow = () => {
    if (macWallpaperNoticeWindow !== noticeWindow || noticeWindow.isDestroyed()) return;
    positionNotice();
    try { noticeWindow.showInactive(); } catch (e) {}
  };
  noticeWindow.once('ready-to-show', doShow);
  noticeWindow.webContents.once('did-finish-load', doShow);
  noticeWindow.once('closed', () => { if (macWallpaperNoticeWindow === noticeWindow) macWallpaperNoticeWindow = null; });
  noticeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(noticeHtml(options))}`).catch((e) => console.warn('Mac wallpaper notice load failed:', e.message));
  macWallpaperNoticeTimer = setTimeout(closeNotice, MAC_WALLPAPER_NOTICE_DURATION_MS);
  if (typeof macWallpaperNoticeTimer.unref === 'function') macWallpaperNoticeTimer.unref();
}

function sendTrayAction(action) {
  const win = mw();
  if (win && !win.isDestroyed()) { try { win.webContents.send('mineradio-global-hotkey', { action }); } catch (e) {} }
}
let wallpaperPanel = null;
function createPanel() {
  if (wallpaperPanel && !wallpaperPanel.isDestroyed()) return wallpaperPanel;
  try {
    wallpaperPanel = new BrowserWindow({
      width: 300, height: 290, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, movable: false, minimizable: false, maximizable: false, show: false,
      skipTaskbar: true, fullscreenable: false, hasShadow: true, vibrancy: 'hud', visualEffectState: 'active',
      webPreferences: { preload: path.join(__dirname, 'wallpaper-control-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    try { wallpaperPanel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (e) {}
    try { wallpaperPanel.setAlwaysOnTop(true, 'screen-saver'); } catch (e) {}
    wallpaperPanel.loadFile(path.join(__dirname, '..', 'public', 'wallpaper-control.html')).catch((e) => console.warn('[WP] panel load failed:', e.message));
    wallpaperPanel.on('blur', () => { if (wallpaperPanel && !wallpaperPanel.isDestroyed()) wallpaperPanel.hide(); });
    wallpaperPanel.on('closed', () => { wallpaperPanel = null; });
  } catch (e) { console.warn('[WP] createPanel failed:', e.message); wallpaperPanel = null; }
  return wallpaperPanel;
}
function togglePanel() {
  const p = createPanel();
  if (!p) return;
  if (p.isVisible()) { p.hide(); return; }
  try {
    const tb = (wallpaperTray && typeof wallpaperTray.getBounds === 'function') ? wallpaperTray.getBounds() : null;
    const wa = screen.getPrimaryDisplay().workArea;
    let x = (tb && tb.width) ? Math.round(tb.x + tb.width / 2 - 150) : (wa.x + wa.width - 320);
    let y = (tb && tb.height) ? Math.round(tb.y + tb.height + 4) : (wa.y + 8);
    x = Math.max(wa.x + 6, Math.min(x, wa.x + wa.width - 306));
    p.setBounds({ x, y, width: 300, height: 290 }, false);
  } catch (e) {}
  p.show();
  try { const win = mw(); if (win && !win.isDestroyed()) win.webContents.send('mineradio-wallpaper-request-state'); } catch (e) {}
}
function destroyPanel() { if (wallpaperPanel && !wallpaperPanel.isDestroyed()) { try { wallpaperPanel.destroy(); } catch (e) {} } wallpaperPanel = null; }
function createTray() {
  console.log('[WP] createTray called, existing=', !!wallpaperTray, 'IS_MAC=', IS_MAC);
  if (!IS_MAC || wallpaperTray) return;
  try {
    let img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
    if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
    wallpaperTray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    try { wallpaperTray.setTitle(' MR'); } catch (e) {}   // 文字兜底:图标不可见时菜单栏也显示 MR
    wallpaperTray.setToolTip('Mineradio 壁纸运行中 · 点此控制');
    console.log('[WP] Tray created OK, isEmpty检查通过, 设菜单');
    wallpaperTray.on('click', () => togglePanel());
    wallpaperTray.on('right-click', () => togglePanel());
    console.log('[WP] tray menu set OK — 菜单栏应出现 MR');
  } catch (e) { console.warn('[WP] tray create FAILED:', e.message); wallpaperTray = null; }
}
function destroyTray() {
  if (wallpaperTray) { try { wallpaperTray.destroy(); } catch (e) {} wallpaperTray = null; }
}

// ===== enter / leave =====
function leave(options = {}) {
  if (!isBusy()) return { ok: true, skipped: true };
  const win = mw();
  const restore = mainWallpaperMode.restore || {};
  reset();
  wallpaperState = { ...wallpaperState, enabled: false };
  unregisterExitShortcut();
  closeNotice();
  destroyTray();
  destroyPanel();
  restoreSystemWallpaper(restore.systemWallpaper, 'leave-wallpaper-mode');
  if (!win || win.isDestroyed()) { R.onLeave(); return { ok: true }; }
  try { win.setIgnoreMouseEvents(false); } catch (e) {}
  try { if (typeof win.setWindowButtonVisibility === 'function') win.setWindowButtonVisibility(true); } catch (e) {}
  try { applyLevel(win, false); } catch (e) { console.warn('[WP] normal restore failed:', e.message); }
  try { win.setAlwaysOnTop(false); } catch (e) {}
  try { win.moveTop(); } catch (e) {}
  try { win.setVisibleOnAllWorkspaces(false); } catch (e) {}
  try { if (typeof win.setFocusable === 'function') win.setFocusable(restore.focusable !== false); } catch (e) {}
  try { if (typeof win.setResizable === 'function') win.setResizable(restore.resizable !== false); } catch (e) {}
  try { if (typeof win.setMovable === 'function') win.setMovable(restore.movable !== false); } catch (e) {}
  try { if (typeof win.setFullScreenable === 'function') win.setFullScreenable(restore.fullscreenable !== false); } catch (e) {}
  try { if (typeof win.setOpacity === 'function') win.setOpacity(clampNumber(restore.opacity, 0.35, 1, 1)); } catch (e) {}
  R.setFullscreenFlags(!!restore.windowFullscreenActive, false);
  if (options.restoreBounds !== false && restore.bounds) {
    try {
      if (win.isFullScreen()) win.setFullScreen(false);
      if (isMacSimpleFullScreen(win)) win.setSimpleFullScreen(false);
      if (win.isMaximized()) win.unmaximize();
      win.setBounds(restore.bounds, false);
      if (restore.wasMaximized) win.maximize();
    } catch (e) { console.warn('Mac wallpaper bounds restore failed:', e.message); }
  }
  try { if (typeof win.setFullScreenable === 'function') win.setFullScreenable(restore.fullscreenable !== false); } catch (e) {}
  // 兜底复位:主窗口本来就可缩放/放大/全屏(创建时 fullscreenable:true,默认 resizable/maximizable);
  // 壁纸退出后无条件把这几项拉回 true,防止 restore 抓到瞬时坏状态导致「绿灯放大不了」(用户实测)。
  try { if (typeof win.setResizable === 'function') win.setResizable(true); } catch (e) {}
  try { if (typeof win.setMaximizable === 'function') win.setMaximizable(true); } catch (e) {}
  try { if (typeof win.setFullScreenable === 'function') win.setFullScreenable(true); } catch (e) {}
  if (options.focus !== false) { try { if (!win.isVisible()) win.show(); win.focus(); } catch (e) {} }
  R.sendWindowState(win);
  R.onLeave();
  return { ok: true };
}

async function prepareWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (isMacSimpleFullScreen(win)) { win.setSimpleFullScreen(false); await new Promise((r) => setTimeout(r, 260)); }
  if (win.isFullScreen()) { win.setFullScreen(false); await new Promise((r) => setTimeout(r, 420)); }
  if (win.isMaximized()) win.unmaximize();
}

function isSupported() { return IS_MAC && !!loadBridge(); }
function unsupportedResult() { return { ok: false, skipped: true, error: 'WALLPAPER_UNSUPPORTED_ON_THIS_PLATFORM' }; }

function setSplashWallpaper() {
  if (!IS_MAC) return;
  let w = null;
  try {
    const display = targetDisplay();
    const b = (display && display.bounds) || screen.getPrimaryDisplay().bounds;
    w = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height, show: false, frame: false,
      transparent: false, backgroundColor: '#050608', skipTaskbar: true, enableLargerThanScreen: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, paintWhenInitiallyHidden: true },
    });
    const win = w;
    win.loadFile(path.join(__dirname, '..', 'public', 'wallpaper-splash.html')).catch(() => {});
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        win.capturePage().then((img) => {
          try {
            const dir = macBlackWallpaperDirectory(); fs.mkdirSync(dir, { recursive: true });
            const fp = path.join(dir, 'mineradio-splash.png');
            fs.writeFileSync(fp, img.toPNG());
            const bridge = loadBridge();
            if (bridge && typeof bridge.setDesktopImages === 'function') bridge.setDesktopImages(fp);
            console.log('[WP] splash wallpaper set');
          } catch (e) { console.warn('[WP] splash set failed:', e.message); }
          try { win.destroy(); } catch (e) {}
        }).catch((e) => { console.warn('[WP] splash capture failed:', e && e.message); try { win.destroy(); } catch (_) {} });
      }, 400);
    });
  } catch (e) { console.warn('[WP] setSplashWallpaper failed:', e.message); try { if (w) w.destroy(); } catch (_) {} }
}
async function enter(payload = {}) {
  if (!isSupported()) { wallpaperState = { ...wallpaperState, ...payload, enabled: false }; return unsupportedResult(); }
  const win = mw();
  if (!win || win.isDestroyed()) return { ok: false, error: 'NO_MAIN_WINDOW' };
  wallpaperState = { ...wallpaperState, ...payload, enabled: true };
  if (!isBusy()) {
    mainWallpaperMode = {
      active: false, pending: true, nativeResult: null,
      restore: {
        bounds: restoreBoundsOf(win),
        wasMaximized: windowMethodValue(win, 'isMaximized', false),
        resizable: windowMethodValue(win, 'isResizable', true),
        movable: windowMethodValue(win, 'isMovable', true),
        fullscreenable: windowMethodValue(win, 'isFullScreenable', true),
        focusable: windowMethodValue(win, 'isFocusable', true),
        opacity: windowMethodValue(win, 'getOpacity', 1),
        windowFullscreenActive: R.getWindowFullscreenActive(),
      },
    };
  } else { mainWallpaperMode.pending = true; }

  await prepareWindow(win);
  if (!isBusy()) return { ok: false, error: 'MAC_WALLPAPER_ENTRY_CANCELLED' };
  R.setFullscreenFlags(false, false);
  mainWallpaperMode.active = true;
  mainWallpaperMode.pending = false;

  win.setBounds(targetBounds(), false);
  applyOpacity(wallpaperState);
  let systemWallpaperResult = applyBlackWallpaper(targetDisplay());
  if (systemWallpaperResult && systemWallpaperResult.ok && systemWallpaperResult.snapshot && mainWallpaperMode.restore) {
    mainWallpaperMode.restore.systemWallpaper = systemWallpaperResult.snapshot;
  } else if (systemWallpaperResult && systemWallpaperResult.ok === false) {
    console.warn('Mac system wallpaper black sync skipped:', systemWallpaperResult.error || 'unknown');
  }
  try { if (typeof win.setResizable === 'function') win.setResizable(false); } catch (e) {}
  try { if (typeof win.setMovable === 'function') win.setMovable(false); } catch (e) {}
  try { if (typeof win.setFullScreenable === 'function') win.setFullScreenable(false); } catch (e) {}
  try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (e) {}
  try { if (typeof win.setFocusable === 'function') win.setFocusable(false); } catch (e) {}
  try { win.setIgnoreMouseEvents(true, { forward: true }); } catch (e) {}
  try { if (typeof win.setWindowButtonVisibility === 'function') win.setWindowButtonVisibility(false); } catch (e) {}

  let nativeResult;
  try { nativeResult = applyLevel(win, true); }
  catch (e) { const error = e && e.message ? e.message : 'MAC_WALLPAPER_LEVEL_FAILED'; leave({ restoreBounds: true, focus: true }); return { ok: false, error }; }
  if (!nativeResult || nativeResult.ok === false) { leave({ restoreBounds: true, focus: true }); return nativeResult || { ok: false, error: 'MAC_WALLPAPER_LEVEL_FAILED' }; }
  mainWallpaperMode.nativeResult = nativeResult;
  try { win.setBounds(targetBounds(), false); } catch (e) {}
  [120, 500, 1200].forEach((ms) => setTimeout(() => { if (mainWallpaperMode.active && win && !win.isDestroyed()) { try { win.setBounds(targetBounds(), false); } catch (e) {} } }, ms));
  const shortcutRegistered = registerExitShortcut();
  try { if (!win.isVisible()) win.showInactive(); else win.blur(); } catch (e) {}
  R.sendWindowState(win);
  console.log('[WP] enter ok → createTray');
  if (!noticeShownBefore()) { showNotice({ shortcutRegistered }); markNoticeShown(); }
  createTray();
  setTimeout(() => { if (mainWallpaperMode.active) setSplashWallpaper(); }, 700);
  return {
    ok: true, native: nativeResult,
    systemWallpaper: { ok: !!(systemWallpaperResult && systemWallpaperResult.ok), skipped: !!(systemWallpaperResult && systemWallpaperResult.skipped), error: (systemWallpaperResult && systemWallpaperResult.error) || null },
    exitShortcut: shortcutRegistered ? MAC_WALLPAPER_EXIT_SHORTCUT : null,
  };
}

function sendState() {
  const win = mw();
  if (mainWallpaperMode.active && win && !win.isDestroyed()) R.sendWindowState(win);
}

// ===== 对外 IPC 入口 =====
async function setEnabled(enabled, payload) {
  try {
    console.log('[WP] setEnabled', enabled, 'supported=', isSupported());
    if (enabled && !isSupported()) { wallpaperState = { ...wallpaperState, ...(payload || {}), enabled: false }; return unsupportedResult(); }
    if (enabled) return await enter(payload || {});
    leave({ restoreBounds: true, focus: true });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || 'WALLPAPER_FAILED' }; }
}
async function update(payload) {
  try {
    wallpaperState = { ...wallpaperState, ...(payload || {}) };
    if (wallpaperState.enabled && !isSupported()) { wallpaperState.enabled = false; return unsupportedResult(); }
    if (wallpaperState.enabled) {
      const result = isBusy() ? { ok: true } : await enter(wallpaperState);
      reposition();
      sendState();
      return result;
    } else if (isBusy()) {
      leave({ restoreBounds: true, focus: true });
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || 'WALLPAPER_UPDATE_FAILED' }; }
}

function sendPanelState(st) { if (wallpaperPanel && !wallpaperPanel.isDestroyed()) { try { wallpaperPanel.webContents.send('mineradio-wallpaper-panel-state', st); } catch (e) {} } }
module.exports = { init, setEnabled, update, leave, reposition, restorePending, isBusy, isSupported, sendState, sendPanelState };
