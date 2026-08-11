'use strict';
// macOS 壁纸库桥接：从另一台 Windows 电脑（Win 版 Mineradio + Wallpaper Engine 库）或本地 SMB 挂载目录
// 读取 WE 壁纸库（图片/视频壁纸），供 Mac 壁纸模式播放。Scene 场景壁纸（PKGV）需 WE 引擎，标注不可用。
// 自包含：仅通过 init(refs) 接入主进程的 protocol / ipcMain / app，不侵入式改 main.js。
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { WallpaperEngineLibrary, registerWallpaperEngineScheme } = require('./wallpaper-engine-library');

const IS_MAC = process.platform === 'darwin';

// HTTP 壁纸源（Win 端可选共享脚本）：列表 + 媒体文件代理
const HTTP_SOURCE_TIMEOUT_MS = 8000;
const HTTP_SOURCE_MAX_LIST_BYTES = 4 * 1024 * 1024;
const WINDOWS_DISCOVERY_PORT = 45678;
const WINDOWS_DISCOVERY_PREFIX = 'MINERADIO_WALLPAPER ';
const WINDOWS_DISCOVERY_WAIT_MS = 8000;
const WINDOWS_SUBNET_PROBE_DELAY_MS = 350;
const WINDOWS_SUBNET_PROBE_TIMEOUT_MS = 900;
const WINDOWS_SUBNET_PROBE_CONCURRENCY = 24;
const WINDOWS_MEDIA_MAX_BYTES = 256 * 1024 * 1024;

let library = null;
let refs = {};
let windowsClient = null;

function normalizeWindowsBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' || !url.hostname || url.username || url.password || url.pathname !== '/') return '';
    return url.origin;
  } catch (_) {
    return '';
  }
}

function serviceUrl(baseUrl, pathname) {
  return normalizeWindowsBaseUrl(baseUrl) + pathname;
}

function resolveWindowsAssetUrl(baseUrl, value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return new URL(raw, normalizeWindowsBaseUrl(baseUrl) + '/').href; } catch (_) { return ''; }
}

function safeExportFileName(value) {
  const name = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._ -]{0,180}\.(?:mp4|webm|mov)$/i.test(name) && path.basename(name) === name ? name : '';
}

function safeWallpaperRecordId(value) {
  const id = String(value || '').trim();
  return id && id.length <= 240 && !/[\x00-\x1f\x7f]/.test(id) ? id : '';
}

function mediaExtensionForMime(mime, fallback) {
  const normalized = String(mime || '').toLowerCase().split(';')[0].trim();
  const extensions = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  };
  return extensions[normalized] || fallback;
}

function privateSubnetProbeUrls(networkInterfaces) {
  const interfaces = typeof networkInterfaces === 'function' ? networkInterfaces() : {};
  const candidates = [];
  for (const entries of Object.values(interfaces || {})) {
    for (const entry of entries || []) {
      const address = String(entry && entry.address || '');
      const parts = address.split('.').map(Number);
      const privateRange = (parts[0] === 10)
        || (parts[0] === 192 && parts[1] === 168)
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
      if (entry && !entry.internal && (entry.family === 'IPv4' || entry.family === 4) && privateRange && parts.length === 4 && parts.every(Number.isInteger)) {
        for (let host = 1; host <= 254; host += 1) {
          if (host === parts[3]) continue;
          candidates.push({
            distance: Math.abs(host - parts[3]),
            url: 'http://' + parts.slice(0, 3).join('.') + '.' + host + ':8123',
          });
        }
      }
    }
  }
  const seen = new Set();
  return candidates.sort((left, right) => left.distance - right.distance).map((candidate) => candidate.url).filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function normalizeWindowsWallpaperRecord(rawRecord, baseUrl, index) {
  const raw = rawRecord && typeof rawRecord === 'object' ? rawRecord : {};
  const id = String(raw.id || raw.projectId || raw.sceneId || raw.scene || 'wallpaper-' + Number(index || 0)).trim();
  const declared = String(raw.type || raw.kind || raw.mediaType || '').toLowerCase();
  const projectId = String(raw.projectId || id.split('/')[0] || id).trim();
  const engineScene = raw.sceneNeedsEngine === true;
  const sceneId = String(raw.sceneId || raw.scene || (engineScene ? projectId : '') || (declared === 'scene' ? id : '')).trim();
  const videoValue = typeof raw.video === 'string' ? raw.video : '';
  const imageValue = typeof raw.image === 'string' ? raw.image : '';
  const type = sceneId || declared === 'scene' ? 'scene' : (declared === 'video' || raw.video === true || videoValue ? 'video' : 'image');
  const previewValue = raw.previewUrl || raw.preview || raw.thumbnail || raw.cover || imageValue || videoValue || '';
  const directValue = raw.fileUrl || raw.url || raw.file || '';
  const encodedId = encodeURIComponent(id);
  const fileUrl = type === 'scene' ? '' : (resolveWindowsAssetUrl(baseUrl, directValue) || serviceUrl(baseUrl, '/api/wallpaper-file?id=' + encodedId));
  return {
    id,
    title: String(raw.title || raw.name || id || '未命名壁纸').trim().slice(0, 180) || '未命名壁纸',
    type,
    previewUrl: resolveWindowsAssetUrl(baseUrl, previewValue),
    fileUrl,
    sceneId: type === 'scene' ? (sceneId || id) : '',
    liveUrl: type === 'scene' ? serviceUrl(baseUrl, '/api/live/' + encodeURIComponent(sceneId || id)) : '',
    sourceHost: normalizeWindowsBaseUrl(baseUrl),
  };
}

function windowsWallpaperProjectId(rawRecord, index) {
  const raw = rawRecord && typeof rawRecord === 'object' ? rawRecord : {};
  const id = String(raw.projectId || raw.id || raw.sceneId || raw.scene || 'wallpaper-' + Number(index || 0)).trim();
  return String(raw.projectId || id.split('/')[0] || id).trim() || 'wallpaper-' + Number(index || 0);
}

function windowsWallpaperIsPreview(rawRecord) {
  const raw = rawRecord && typeof rawRecord === 'object' ? rawRecord : {};
  if (raw.isPreview === true) return true;
  const id = String(raw.id || raw.file || raw.url || '').split('?')[0];
  return /^preview\.(jpe?g|png|webp|gif)$/i.test(id.split('/').pop() || '');
}

function normalizeWindowsWallpaperRecords(rawRecords, baseUrl) {
  const groups = new Map();
  (Array.isArray(rawRecords) ? rawRecords : []).forEach((rawRecord, index) => {
    const key = windowsWallpaperProjectId(rawRecord, index);
    const entries = groups.get(key) || [];
    entries.push({ record: normalizeWindowsWallpaperRecord(rawRecord, baseUrl, index), preview: windowsWallpaperIsPreview(rawRecord) });
    groups.set(key, entries);
  });
  return Array.from(groups.values()).flatMap((entries) => {
    const scene = entries.find((entry) => entry.record.type === 'scene');
    if (scene) return [scene.record];
    const originals = entries.filter((entry) => !entry.preview);
    return (originals.length ? originals : entries).map((entry) => entry.record);
  });
}

class WindowsWallpaperClient {
  constructor(options) {
    const opts = options || {};
    this.fetchImpl = opts.fetchImpl || global.fetch;
    this.dgramImpl = opts.dgramImpl || dgram;
    this.networkInterfaces = opts.networkInterfaces || os.networkInterfaces;
    this.trustedBases = new Set();
  }

  async requestJson(url, options, timeoutMs) {
    if (typeof this.fetchImpl !== 'function') return { ok: false, error: 'FETCH_UNAVAILABLE' };
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), Number(timeoutMs) || HTTP_SOURCE_TIMEOUT_MS) : null;
    try {
      const response = await this.fetchImpl(url, Object.assign({ headers: { Accept: 'application/json' } }, options || {}, {
        signal: controller ? controller.signal : undefined,
      }));
      const data = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, error: error && error.name === 'AbortError' ? 'HTTP_TIMEOUT' : 'HTTP_FAILED' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async connect(baseUrl) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    if (!base) return { ok: false, error: 'INVALID_URL' };
    const ping = await this.requestJson(serviceUrl(base, '/api/ping'));
    if (!ping.ok) return { ok: false, error: ping.error || 'PING_FAILED' };
    if (!ping.data || ping.data.ok !== true) return { ok: false, error: 'PING_REJECTED' };
    const listing = await this.requestJson(serviceUrl(base, '/api/wallpapers'));
    if (!listing.ok) return { ok: false, error: listing.error || 'WALLPAPERS_FAILED' };
    if (!listing.data || listing.data.ok !== true || !Array.isArray(listing.data.records)) return { ok: false, error: 'WALLPAPERS_REJECTED' };
    this.trustedBases.add(base);
    return {
      ok: true,
      baseUrl: base,
      host: String(ping.data.host || ping.data.name || new URL(base).host),
      records: normalizeWindowsWallpaperRecords(listing.data.records, base),
    };
  }

  async probeWindowsService(baseUrl) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    if (!base) return false;
    const ping = await this.requestJson(serviceUrl(base, '/api/ping'), undefined, WINDOWS_SUBNET_PROBE_TIMEOUT_MS);
    return !!(ping.ok && ping.data && ping.data.ok === true);
  }

  async scanPrivateSubnets() {
    const candidates = privateSubnetProbeUrls(this.networkInterfaces);
    const services = [];
    let next = 0;
    const worker = async () => {
      while (next < candidates.length && !services.length) {
        const candidate = candidates[next++];
        if (!await this.probeWindowsService(candidate)) continue;
        const result = await this.connect(candidate);
        if (result.ok && !services.length) services.push(result);
      }
    };
    await Promise.all(Array.from({ length: Math.min(WINDOWS_SUBNET_PROBE_CONCURRENCY, candidates.length) }, worker));
    return services;
  }

  async discover(waitMs) {
    const socket = this.dgramImpl.createSocket({ type: 'udp4', reuseAddr: true });
    const candidates = new Set();
    const wait = Math.max(500, Math.min(Number(waitMs) || WINDOWS_DISCOVERY_WAIT_MS, 12000));
    return new Promise((resolve) => {
      let finished = false;
      let timeout = 0;
      let fallbackTimer = 0;
      let fallbackPromise = null;
      const finish = async () => {
        if (finished) return;
        finished = true;
        if (timeout) clearTimeout(timeout);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        try { socket.close(); } catch (_) {}
        const attempts = await Promise.all([...candidates].map((url) => this.connect(url)));
        resolve({ ok: true, services: attempts.filter((result) => result.ok) });
      };
      const finishWithServices = (services) => {
        if (finished) return;
        finished = true;
        if (timeout) clearTimeout(timeout);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        try { socket.close(); } catch (_) {}
        resolve({ ok: true, services });
      };
      const runFallback = async () => {
        if (!fallbackPromise) fallbackPromise = this.scanPrivateSubnets();
        const services = await fallbackPromise;
        if (services.length) finishWithServices(services);
        return services;
      };
      socket.on('message', (message) => {
        const match = new RegExp('^' + WINDOWS_DISCOVERY_PREFIX + '([^\\s]+)$').exec(String(message || '').trim());
        const base = match ? normalizeWindowsBaseUrl('http://' + match[1]) : '';
        if (base) candidates.add(base);
      });
      socket.on('error', () => { runFallback().then((services) => finishWithServices(services || [])); });
      try {
        socket.bind(WINDOWS_DISCOVERY_PORT, () => {
          timeout = setTimeout(finish, wait);
          fallbackTimer = setTimeout(runFallback, Math.min(WINDOWS_SUBNET_PROBE_DELAY_MS, Math.max(80, wait - 50)));
        });
      } catch (_) { runFallback().then((services) => finishWithServices(services || [])); }
    });
  }

  async getLiveStatus(baseUrl) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    if (!base) return { ok: false, error: 'INVALID_URL' };
    const result = await this.requestJson(serviceUrl(base, '/api/live-status'));
    return result.ok && result.data && result.data.ok === true ? { ok: true, status: result.data } : { ok: false, error: result.error || 'LIVE_UNAVAILABLE' };
  }

  async startSceneExport(baseUrl, sceneId, seconds) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    const scene = String(sceneId || '').trim();
    const duration = Math.max(1, Math.min(300, Math.round(Number(seconds) || 30)));
    if (!base || !scene) return { ok: false, error: 'INVALID_EXPORT_REQUEST' };
    const result = await this.requestJson(serviceUrl(base, '/api/export-scene?scene=' + encodeURIComponent(scene) + '&seconds=' + duration), { method: 'POST' });
    if (result.status !== 202 || !result.data || result.data.ok !== true || !result.data.id) return { ok: false, error: result.error || 'EXPORT_REJECTED' };
    return { ok: true, id: String(result.data.id), scene, seconds: duration, state: String(result.data.state || 'queued'), statusUrl: String(result.data.statusUrl || '') };
  }

  async getExportJob(baseUrl, jobId) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    const id = String(jobId || '').trim();
    if (!base || !id) return { ok: false, error: 'INVALID_EXPORT_JOB' };
    const result = await this.requestJson(serviceUrl(base, '/api/export-jobs?id=' + encodeURIComponent(id)));
    if (!result.ok || !result.data || result.data.ok !== true) return { ok: false, error: result.error || 'EXPORT_STATUS_FAILED' };
    const state = String(result.data.state || '');
    const output = safeExportFileName(result.data.output);
    if (state === 'completed' && !output) return { ok: false, error: 'EXPORT_OUTPUT_INVALID' };
    return { ok: true, id, state, output, downloadUrl: state === 'completed' ? serviceUrl(base, '/api/exported-file?name=' + encodeURIComponent(output)) : '' };
  }

  async listExportedVideos(baseUrl) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    if (!base) return { ok: false, error: 'INVALID_URL' };
    const result = await this.requestJson(serviceUrl(base, '/api/exported-videos'));
    if (!result.ok || !result.data || result.data.ok !== true || !Array.isArray(result.data.records)) return { ok: false, error: result.error || 'EXPORTED_VIDEOS_FAILED' };
    return { ok: true, records: result.data.records.map((record) => {
      const name = safeExportFileName(record && (record.name || record.output));
      return name ? { name, url: serviceUrl(base, '/api/exported-file?name=' + encodeURIComponent(name)) } : null;
    }).filter(Boolean) };
  }

  async downloadMedia(url, expectedType, name) {
    if (typeof this.fetchImpl !== 'function') return { ok: false, error: 'FETCH_UNAVAILABLE' };
    try {
      const response = await this.fetchImpl(url);
      if (!response || !response.ok || typeof response.arrayBuffer !== 'function') return { ok: false, error: 'MEDIA_RESPONSE_FAILED' };
      const mime = String(response.headers && response.headers.get && response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!mime || (expectedType === 'image' ? !/^image\//.test(mime) : !/^video\//.test(mime))) return { ok: false, error: 'MEDIA_TYPE_REJECTED' };
      const length = Number(response.headers && response.headers.get && response.headers.get('content-length') || 0);
      if (Number.isFinite(length) && length > WINDOWS_MEDIA_MAX_BYTES) return { ok: false, error: 'MEDIA_TOO_LARGE' };
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) return { ok: false, error: 'MEDIA_EMPTY' };
      if (bytes.length > WINDOWS_MEDIA_MAX_BYTES) return { ok: false, error: 'MEDIA_TOO_LARGE' };
      return { ok: true, mime, name, bytes };
    } catch (_) {
      return { ok: false, error: 'MEDIA_DOWNLOAD_FAILED' };
    }
  }

  async downloadWallpaperMedia(baseUrl, recordId, type) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    const id = safeWallpaperRecordId(recordId);
    const expectedType = type === 'video' ? 'video' : (type === 'image' ? 'image' : '');
    if (!base || !id || !expectedType) return { ok: false, error: 'INVALID_MEDIA_REQUEST' };
    if (!this.trustedBases.has(base)) return { ok: false, error: 'UNVERIFIED_SOURCE' };
    const fallback = expectedType === 'video' ? 'mp4' : 'png';
    const result = await this.downloadMedia(serviceUrl(base, '/api/wallpaper-file?id=' + encodeURIComponent(id)), expectedType, 'wallpaper-' + id + '.' + fallback);
    if (!result.ok) return result;
    result.name = 'wallpaper-' + id + '.' + mediaExtensionForMime(result.mime, fallback);
    return result;
  }

  async downloadExportedMedia(baseUrl, fileName) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    const name = safeExportFileName(fileName);
    if (!base || !name) return { ok: false, error: 'INVALID_MEDIA_REQUEST' };
    if (!this.trustedBases.has(base)) return { ok: false, error: 'UNVERIFIED_SOURCE' };
    return this.downloadMedia(serviceUrl(base, '/api/exported-file?name=' + encodeURIComponent(name)), 'video', name);
  }

  async downloadExportedFile(baseUrl, fileName, destination) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    const name = safeExportFileName(fileName);
    const target = String(destination || '').trim();
    if (!base || !name || !target) return { ok: false, error: 'INVALID_DOWNLOAD_REQUEST' };
    const response = await this.fetchImpl(serviceUrl(base, '/api/exported-file?name=' + encodeURIComponent(name)));
    if (!response || !response.ok || !response.body) return { ok: false, error: 'DOWNLOAD_FAILED' };
    const temporary = target + '.mineradio-part';
    try {
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
      await fs.promises.rename(temporary, target);
      return { ok: true, filePath: target };
    } catch (_) {
      try { await fs.promises.unlink(temporary); } catch (_) {}
      return { ok: false, error: 'DOWNLOAD_WRITE_FAILED' };
    }
  }
}

function init(options) {
  refs = Object.assign(refs, options || {});
  const userDataPath = refs.userDataPath || '';
  if (!library && userDataPath) {
    library = new WallpaperEngineLibrary({ userDataPath });
  }
  if (!windowsClient) windowsClient = new WindowsWallpaperClient();
  return {
    scanDirectory,
    scanHttpSource,
    list,
    getMediaFile,
    getLibrary,
    discoverWindowsSources: (waitMs) => windowsClient.discover(waitMs),
    connectWindowsSource: (baseUrl) => windowsClient.connect(baseUrl),
    getWindowsLiveStatus: (baseUrl) => windowsClient.getLiveStatus(baseUrl),
    startWindowsSceneExport: (baseUrl, sceneId, seconds) => windowsClient.startSceneExport(baseUrl, sceneId, seconds),
    getWindowsExportJob: (baseUrl, jobId) => windowsClient.getExportJob(baseUrl, jobId),
    listWindowsExportedVideos: (baseUrl) => windowsClient.listExportedVideos(baseUrl),
    downloadWindowsWallpaperMedia: (baseUrl, recordId, type) => windowsClient.downloadWallpaperMedia(baseUrl, recordId, type),
    downloadWindowsExportedMedia: (baseUrl, fileName) => windowsClient.downloadExportedMedia(baseUrl, fileName),
    downloadWindowsExport: (baseUrl, fileName, destination) => windowsClient.downloadExportedFile(baseUrl, fileName, destination),
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
  if (!windowsClient) windowsClient = new WindowsWallpaperClient();
  return windowsClient.connect(baseUrl);
}

module.exports = { init, WindowsWallpaperClient, normalizeWindowsWallpaperRecord, normalizeWindowsWallpaperRecords, normalizeWindowsBaseUrl, privateSubnetProbeUrls };
