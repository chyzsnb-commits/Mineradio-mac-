'use strict';
// macOS 壁纸库桥接：从另一台 Windows 电脑（Win 版 Mineradio + Wallpaper Engine 库）或本地 SMB 挂载目录
// 读取 WE 壁纸库（图片/视频壁纸），供 Mac 壁纸模式播放。Scene 场景壁纸（PKGV）需 WE 引擎，标注不可用。
// 自包含：仅通过 init(refs) 接入主进程的 protocol / ipcMain / app，不侵入式改 main.js。
const path = require('path');
const { WallpaperEngineLibrary, registerWallpaperEngineScheme } = require('./wallpaper-engine-library');

const IS_MAC = process.platform === 'darwin';

// HTTP 壁纸源（Win 端可选共享脚本）：列表 + 媒体文件代理
const HTTP_SOURCE_TIMEOUT_MS = 8000;
const HTTP_SOURCE_MAX_LIST_BYTES = 4 * 1024 * 1024;

let library = null;
let refs = {};

function init(options) {
  refs = Object.assign(refs, options || {});
  const userDataPath = refs.userDataPath || '';
  if (!library && userDataPath) {
    library = new WallpaperEngineLibrary({ userDataPath });
  }
  return {
    scanDirectory,
    scanHttpSource,
    list,
    getMediaFile,
    addManualRoot,
    removeManualRoot,
    getLibrary,
  };
}

function getLibrary() {
  return library;
}

async function scanDirectory(dirPath) {
  if (!library) return { ok: false, error: 'LIBRARY_NOT_READY' };
  const root = String(dirPath || '').trim();
  if (!root) return { ok: false, error: 'EMPTY_PATH' };
  try {
    const result = await library.addManualRoot(root);
    const snapshot = await library.performScan();
    return { ok: true, result, snapshot };
  } catch (e) {
    return { ok: false, error: e && e.message || 'SCAN_FAILED' };
  }
}

async function list() {
  if (!library) return { ok: false, error: 'LIBRARY_NOT_READY' };
  try {
    const records = await library.list({ includeUnplayable: true });
    return { ok: true, records };
  } catch (e) {
    return { ok: false, error: e && e.message || 'LIST_FAILED' };
  }
}

async function getMediaFile(recordId, kind) {
  if (!library) return { ok: false, error: 'LIBRARY_NOT_READY' };
  try {
    const file = await library.validatedRecordFile(recordId, kind === 'video' ? 'video' : 'image');
    if (!file) return { ok: false, error: 'NO_MEDIA_FILE' };
    return { ok: true, filePath: file };
  } catch (e) {
    return { ok: false, error: e && e.message || 'MEDIA_FAILED' };
  }
}

// HTTP 源：Win 端可选共享脚本返回 { records: [{ id, title, type: image|video, url, previewUrl }] }
async function scanHttpSource(baseUrl) {
  const url = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!url) return { ok: false, error: 'EMPTY_URL' };
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'INVALID_URL' };
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), HTTP_SOURCE_TIMEOUT_MS) : null;
    const res = await fetch(url + '/api/wallpapers', {
      signal: controller ? controller.signal : undefined,
      headers: { Accept: 'application/json' },
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return { ok: false, error: 'HTTP_' + res.status };
    const text = await res.text();
    if (text.length > HTTP_SOURCE_MAX_LIST_BYTES) return { ok: false, error: 'LIST_TOO_LARGE' };
    const data = JSON.parse(text);
    const records = Array.isArray(data && data.records) ? data.records.map((r, i) => ({
      id: String(r.id || 'http-' + i),
      title: String(r.title || '壁纸 ' + (i + 1)),
      type: r.type === 'video' ? 'video' : 'image',
      httpUrl: String(r.url || ''),
      httpPreviewUrl: String(r.previewUrl || r.url || ''),
      source: 'http',
    })).filter(r => r.httpUrl) : [];
    // 合并 Win 端已导出的场景视频(_exported/ 下的 mp4)
    let exported = [];
    try {
      const evRes = await fetch(url + '/api/exported-videos', { signal: controller ? controller.signal : undefined });
      if (evRes.ok) {
        const evData = await evRes.json();
        exported = Array.isArray(evData && evData.records) ? evData.records.map((r, i) => ({
          id: 'exported-' + i,
          title: 'Scene 导出 · ' + String(r.name || '视频 ' + (i + 1)),
          type: 'video',
          httpUrl: String(r.url || ''),
          httpPreviewUrl: String(r.url || ''),
          source: 'http-exported',
        })).filter(r => r.httpUrl) : [];
      }
    } catch (_) {}
    return { ok: true, records: records.concat(exported), baseUrl: url };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'HTTP_TIMEOUT' : (e && e.message || 'HTTP_FAILED') };
  }
}

module.exports = { init };
