const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('desktopWindow', {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke('desktop-window-minimize'),
  toggleMaximize: () => ipcRenderer.invoke('desktop-window-toggle-maximize'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop-window-toggle-fullscreen'),
  exitFullscreenWindowed: () => ipcRenderer.invoke('desktop-window-exit-fullscreen-windowed'),
  getState: () => ipcRenderer.invoke('desktop-window-get-state'),
  getGpuDiagnostics: () => ipcRenderer.invoke('mineradio-get-gpu-diagnostics'),
  getMemorySnapshot: () => ipcRenderer.invoke('mineradio-memory-get-snapshot'),
  configureMemoryReduct: (payload) => ipcRenderer.invoke('mineradio-memory-configure-auto', payload || {}),
  trimAppMemory: (payload) => ipcRenderer.invoke('mineradio-memory-trim-app', payload || {}),
  purgeSystemMemory: (payload) => ipcRenderer.invoke('mineradio-memory-purge-system', payload || {}),
  deviceStats: () => ipcRenderer.invoke('mineradio-device-stats'),
  close: (behavior) => ipcRenderer.invoke('desktop-window-close', behavior),
  getCloseBehavior: () => ipcRenderer.invoke('desktop-window-get-close-behavior'),
  setCloseBehavior: (behavior) => ipcRenderer.invoke('desktop-window-set-close-behavior', behavior),
  openNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-open-login'),
  clearNeteaseMusicLogin: () => ipcRenderer.invoke('netease-music-clear-login'),
  openQQMusicLogin: () => ipcRenderer.invoke('qq-music-open-login'),
  clearQQMusicLogin: () => ipcRenderer.invoke('qq-music-clear-login'),
  openKugouMusicLogin: () => ipcRenderer.invoke('kugou-music-open-login'),
  clearKugouMusicLogin: () => ipcRenderer.invoke('kugou-music-clear-login'),
  openQishuiMusicLogin: () => ipcRenderer.invoke('qishui-music-open-login'),
  clearQishuiMusicLogin: () => ipcRenderer.invoke('qishui-music-clear-login'),
  openSpotifyMusicLogin: () => ipcRenderer.invoke('spotify-music-open-login'),
  clearSpotifyMusicLogin: () => ipcRenderer.invoke('spotify-music-clear-login'),
  // 手部姿态原生桥接(Vision/ANE):start 返回 {ok};frame 送 RGBA;onResult 收 21 点关键点
  handposeStart: () => ipcRenderer.invoke('mineradio-handpose-start'),
  handposeFrame: (buf) => ipcRenderer.send('mineradio-handpose-frame', buf),
  handposeStop: () => ipcRenderer.send('mineradio-handpose-stop'),
  onHandposeResult: (cb) => { ipcRenderer.removeAllListeners('mineradio-handpose-result'); ipcRenderer.on('mineradio-handpose-result', (_e, hands) => cb(hands)); },
  openUpdateInstaller: (filePath) => ipcRenderer.invoke('mineradio-open-update-installer', filePath),
  restartApp: () => ipcRenderer.invoke('mineradio-restart-app'),
  configureGlobalHotkeys: (bindings) => ipcRenderer.invoke('mineradio-hotkeys-configure-global', bindings || []),
  copyText: (text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  },
  readText: () => ({ ok: true, text: clipboard.readText() || '' }),
  exportJsonFile: (payload) => ipcRenderer.invoke('mineradio-export-json-file', payload || {}),
  exportLoginCookie: (provider) => ipcRenderer.invoke('mineradio-export-login-cookie', provider || ''),
  importJsonFile: () => ipcRenderer.invoke('mineradio-import-json-file'),
  readCurrentFxAutosaveSync: () => ipcRenderer.sendSync('mineradio-current-fx-autosave-read-sync'),
  saveCurrentFxAutosaveSync: (payload) => ipcRenderer.sendSync('mineradio-current-fx-autosave-save-sync', payload || {}),
  saveCurrentFxAutosave: (payload) => ipcRenderer.invoke('mineradio-current-fx-autosave-save', payload || {}),
  onGlobalHotkey: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-global-hotkey', listener);
    return () => ipcRenderer.removeListener('mineradio-global-hotkey', listener);
  },
  setDesktopLyricsEnabled: (enabled, payload) => ipcRenderer.invoke('mineradio-desktop-lyrics-set-enabled', !!enabled, payload || {}),
  updateDesktopLyrics: (payload) => ipcRenderer.invoke('mineradio-desktop-lyrics-update', payload || {}),
  onDesktopLyricsLockState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-desktop-lyrics-lock-state', listener);
    return () => ipcRenderer.removeListener('mineradio-desktop-lyrics-lock-state', listener);
  },
  onDesktopLyricsEnabledState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-desktop-lyrics-enabled-state', listener);
    return () => ipcRenderer.removeListener('mineradio-desktop-lyrics-enabled-state', listener);
  },
  setWallpaperMode: (enabled, payload) => ipcRenderer.invoke('mineradio-wallpaper-set-enabled', !!enabled, payload || {}),
  updateWallpaperMode: (payload) => ipcRenderer.invoke('mineradio-wallpaper-update', payload || {}),
  onWallpaperSetVolume: (callback) => { const l = (_e, v) => { try { callback(v); } catch (e) {} }; ipcRenderer.on('mineradio-wallpaper-setvolume', l); return () => ipcRenderer.removeListener('mineradio-wallpaper-setvolume', l); },
  onWallpaperRequestState: (callback) => { const l = () => { try { callback(); } catch (e) {} }; ipcRenderer.on('mineradio-wallpaper-request-state', l); return () => ipcRenderer.removeListener('mineradio-wallpaper-request-state', l); },
  reportWallpaperState: (st) => ipcRenderer.send('mineradio-wallpaper-report-state', st),
  sendWallpaperAudio: (payload) => ipcRenderer.send('mineradio-wallpaper-audio-push', payload),
  onWallpaperState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('mineradio-wallpaper-state', listener);
    return () => ipcRenderer.removeListener('mineradio-wallpaper-state', listener);
  },
  onWallpaperAudio: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('mineradio-wallpaper-audio', listener);
    return () => ipcRenderer.removeListener('mineradio-wallpaper-audio', listener);
  },
  onWallpaperActive: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, active) => callback(!!active);
    ipcRenderer.on('mineradio-wallpaper-active', listener);
    return () => ipcRenderer.removeListener('mineradio-wallpaper-active', listener);
  },
  // 从 Tray/Dock 退出壁纸时,通知主窗口把前端开关也关掉(状态同步)——移植自主线 fork
  onWallpaperForceOff: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('mineradio-wallpaper-force-off', listener);
    return () => ipcRenderer.removeListener('mineradio-wallpaper-force-off', listener);
  },
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop-window-state', listener);
    return () => ipcRenderer.removeListener('desktop-window-state', listener);
  },
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-shell-root');
  document.body.classList.add('desktop-shell');
  // macOS 用原生红黄绿按钮，标记后由 CSS 隐藏自带的窗口按钮
  if (process.platform === 'darwin') document.body.classList.add('desktop-mac');
});
