'use strict';
// macOS 壁纸库桥接：从另一台 Windows 电脑（Win 版 Mineradio + Wallpaper Engine 库）或本地 SMB 挂载目录
// 读取 WE 壁纸库（图片/视频壁纸），供 Mac 壁纸模式播放。Scene 场景壁纸（PKGV）需 WE 引擎，标注不可用。
// 自包含：仅通过 init(refs) 接入主进程的 protocol / ipcMain / app，不侵入式改 main.js。
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
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
const WINDOWS_PORT_PROBE_MIN = 8123;
const WINDOWS_PORT_PROBE_MAX = 8155;
const WINDOWS_PORT_PROBE_TIMEOUT_MS = 900;
const WINDOWS_PORT_PROBE_CONCURRENCY = 4;
const WINDOWS_ACTIVE_PROBE_CONCURRENCY = 32;
const WINDOWS_ACTIVE_FALLBACK_DELAY_MS = 900;
const WINDOWS_ACTIVE_SUBNET_MAX_HOSTS = 512;
const WINDOWS_MEDIA_MAX_BYTES = 256 * 1024 * 1024;
let windowsDiscoveryJobSequence = 0;
const execFileAsync = promisify(execFile);

let library = null;
let refs = {};
let windowsClient = null;

function normalizeWindowsBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const port = Number(url.port);
    if (url.protocol !== 'http:' || !url.hostname || url.username || url.password || url.pathname !== '/' || !Number.isInteger(port) || port < 1024 || port > 65535) return '';
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

function parseWindowsDiscoveryAnnouncement(message) {
  const raw = String(message || '').trim();
  if (!raw.startsWith(WINDOWS_DISCOVERY_PREFIX)) return null;
  const token = raw.slice(WINDOWS_DISCOVERY_PREFIX.length).trim();
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/.exec(token);
  if (!match) return null;
  const host = match[1];
  if (!host.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255)) return null;
  const port = match[2] ? Number(match[2]) : 0;
  return {
    host,
    baseUrl: Number.isInteger(port) && port >= 1024 && port <= 65535 ? normalizeWindowsBaseUrl('http://' + host + ':' + port) : '',
  };
}

function ipv4Parts(value) {
  const parts = String(value || '').trim().split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function ipv4ToInt(value) {
  const parts = ipv4Parts(value);
  return parts ? ((((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0) : null;
}

function intToIpv4(value) {
  const input = Number(value) >>> 0;
  return [input >>> 24, (input >>> 16) & 255, (input >>> 8) & 255, input & 255].join('.');
}

function isPrivateIpv4(value) {
  const parts = ipv4Parts(value);
  if (!parts) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function subnetForInterface(entry) {
  const address = String(entry && entry.address || '');
  const addressInt = ipv4ToInt(address);
  const maskInt = ipv4ToInt(entry && entry.netmask);
  if (addressInt === null || maskInt === null || !isPrivateIpv4(address)) return null;
  const networkInt = (addressInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0;
  const hostCount = Math.max(0, broadcastInt - networkInt - 1);
  return { address, netmask: String(entry.netmask), networkInt, broadcastInt, hostCount };
}

function privateNetworkInterfaces(networkInterfaces) {
  const source = typeof networkInterfaces === 'function' ? networkInterfaces() : {};
  const seen = new Set();
  return Object.values(source || {}).flatMap((entries) => Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && !entry.internal && (entry.family === 'IPv4' || entry.family === 4))
    .map(subnetForInterface)
    .filter((network) => network && !seen.has(network.address) && seen.add(network.address));
}

function hostBelongsToNetwork(host, network) {
  const value = ipv4ToInt(host);
  return value !== null && value > network.networkInt && value < network.broadcastInt;
}

function progressiveHostsForNetwork(network) {
  if (!network || network.hostCount <= 0) return [];
  // /16、/8 等大网段先依赖 ARP；后台只从本机所在的 /24 开始渐进探测，避免一次铺满数万主机。
  const start = network.hostCount > WINDOWS_ACTIVE_SUBNET_MAX_HOSTS
    ? Math.max(network.networkInt + 1, (ipv4ToInt(network.address) & 0xffffff00) + 1)
    : network.networkInt + 1;
  const end = network.hostCount > WINDOWS_ACTIVE_SUBNET_MAX_HOSTS
    ? Math.min(network.broadcastInt, start + 255)
    : network.broadcastInt;
  const hosts = [];
  for (let value = start; value < end; value += 1) {
    const host = intToIpv4(value);
    if (host !== network.address) hosts.push(host);
  }
  return hosts;
}

function parseNeighborHosts(output) {
  return Array.from(new Set(String(output || '').split(/\r?\n/)
    .filter((line) => !/\b(?:incomplete|failed)\b/i.test(line))
    .flatMap((line) => (line.match(/(?:\(|\b)(\d{1,3}(?:\.\d{1,3}){3})(?:\)|\b)/g) || [])
      .map((match) => match.replace(/[^\d.]/g, '')))
    .filter(isPrivateIpv4)));
}

async function defaultNeighborHosts() {
  const command = process.platform === 'win32' ? 'arp' : (process.platform === 'darwin' ? 'arp' : 'ip');
  const args = process.platform === 'win32' ? ['-a'] : (process.platform === 'darwin' ? ['-an'] : ['neigh', 'show']);
  try {
    const result = await execFileAsync(command, args, { timeout: 1200, maxBuffer: 256 * 1024 });
    return parseNeighborHosts(result.stdout);
  } catch (_) {
    return [];
  }
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
    this.neighborHosts = opts.neighborHosts || defaultNeighborHosts;
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

  async probeWindowsService(baseUrl, diagnostics, timeoutMs) {
    const base = normalizeWindowsBaseUrl(baseUrl);
    if (!base) return { ok: false, outcome: 'INVALID_URL' };
    const ping = await this.requestJson(serviceUrl(base, '/api/ping'), undefined, timeoutMs || WINDOWS_PORT_PROBE_TIMEOUT_MS);
    const outcome = ping.ok && ping.data && ping.data.ok === true
      ? 'PING_OK'
      : (!ping.ok ? (ping.error === 'HTTP_TIMEOUT' ? 'PING_TIMEOUT' : 'PING_FAILED') : 'PING_REJECTED');
    if (diagnostics && Array.isArray(diagnostics.probes)) diagnostics.probes.push({ baseUrl: base, outcome });
    return { ok: outcome === 'PING_OK', outcome };
  }

  async scanDiscoveredWindowsHost(host, diagnostics, options) {
    const opts = options || {};
    const ports = Array.from({ length: WINDOWS_PORT_PROBE_MAX - WINDOWS_PORT_PROBE_MIN + 1 }, (_, index) => WINDOWS_PORT_PROBE_MIN + index);
    const preferredPort = Number(opts.preferredPort) || 8130;
    const orderedPorts = ports.includes(preferredPort) ? [preferredPort].concat(ports.filter((port) => port !== preferredPort)) : ports;
    const candidates = orderedPorts.map((port) => 'http://' + host + ':' + port);
    let service = null;
    let next = 0;
    const worker = async () => {
      while (next < candidates.length && !service) {
        const candidate = candidates[next++];
        const probe = await this.probeWindowsService(candidate, diagnostics, opts.timeoutMs);
        if (!probe.ok) continue;
        const result = await this.connect(candidate);
        if (result.ok && !service) service = result;
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.concurrency || WINDOWS_PORT_PROBE_CONCURRENCY, candidates.length) }, worker));
    return service;
  }

  async scanActivePrivateNetworks(diagnostics, deadline) {
    let networks = [];
    try { networks = privateNetworkInterfaces(this.networkInterfaces); } catch (error) {
      diagnostics.subnetScan.error = 'NETWORK_INTERFACES_FAILED';
      diagnostics.subnetScan.errorDetail = String(error && error.message || '');
      return null;
    }
    diagnostics.subnetScan.networks = networks.map((network) => ({
      address: network.address,
      netmask: network.netmask,
      hostCount: network.hostCount,
      progressive: network.hostCount <= WINDOWS_ACTIVE_SUBNET_MAX_HOSTS,
    }));
    let neighbors = [];
    try { neighbors = await this.neighborHosts(); } catch (error) {
      diagnostics.subnetScan.neighborError = String(error && error.message || 'NEIGHBOR_LOOKUP_FAILED');
    }
    const neighborHosts = Array.from(new Set((Array.isArray(neighbors) ? neighbors : []).map((value) => String(value || '').trim())
      .filter((host) => isPrivateIpv4(host) && networks.some((network) => hostBelongsToNetwork(host, network)))));
    diagnostics.subnetScan.neighborHosts = neighborHosts;
    const progressiveHosts = networks.flatMap(progressiveHostsForNetwork);
    const progressiveOnlyHosts = progressiveHosts.filter((host) => !neighborHosts.includes(host));
    diagnostics.subnetScan.candidates = neighborHosts.length + progressiveOnlyHosts.length;
    if (!diagnostics.subnetScan.candidates) return null;
    const ports = Array.from({ length: WINDOWS_PORT_PROBE_MAX - WINDOWS_PORT_PROBE_MIN + 1 }, (_, index) => WINDOWS_PORT_PROBE_MIN + index);
    const orderedPorts = [8130].concat(ports.filter((port) => port !== 8130));
    const probeCandidates = async (candidates) => {
      let service = null;
      let next = 0;
      const worker = async () => {
        while (next < candidates.length && !service && (!deadline || Date.now() < deadline)) {
          const candidate = candidates[next++];
          const probe = await this.probeWindowsService(candidate, diagnostics, WINDOWS_PORT_PROBE_TIMEOUT_MS);
          if (!probe.ok) continue;
          const result = await this.connect(candidate);
          if (result && result.ok && !service) service = result;
        }
      };
      await Promise.all(Array.from({ length: Math.min(WINDOWS_ACTIVE_PROBE_CONCURRENCY, candidates.length) }, worker));
      return service;
    };
    // 先只验证 ARP 邻居的 8130；可用时不再请求整段 /24 或同一主机的其余端口。
    let service = await probeCandidates(neighborHosts.map((host) => 'http://' + host + ':8130'));
    if (!service && (!deadline || Date.now() < deadline)) {
      const neighborFallbackCandidates = orderedPorts.slice(1).flatMap((port) => neighborHosts.map((host) => 'http://' + host + ':' + port));
      service = await probeCandidates(neighborFallbackCandidates);
    }
    if (!service && (!deadline || Date.now() < deadline)) {
      // 无 ARP 命中才展开渐进扫描，且全体主机始终先探测最常见的 8130。
      const progressiveCandidates = orderedPorts.flatMap((port) => progressiveOnlyHosts.map((host) => 'http://' + host + ':' + port));
      service = await probeCandidates(progressiveCandidates);
    }
    diagnostics.subnetScan.completed = !!service || (!deadline || Date.now() < deadline);
    return service;
  }

  async discover(waitMs) {
    const socket = this.dgramImpl.createSocket({ type: 'udp4', reuseAddr: true });
    const announcements = new Map();
    const wait = Math.max(500, Math.min(Number(waitMs) || WINDOWS_DISCOVERY_WAIT_MS, 12000));
    return new Promise((resolve) => {
      let finished = false;
      let timeout = 0;
      let fallbackTimer = 0;
      let fallbackPromise = null;
      let announcementProbeStarted = false;
      const diagnostics = {
        jobId: 'wallpaper-discovery-' + (++windowsDiscoveryJobSequence),
        udp: { port: WINDOWS_DISCOVERY_PORT, address: '0.0.0.0', startedAt: Date.now(), received: 0, lastReceivedAt: 0, lastRaw: '', parseError: '' },
        announcements: [],
        probes: [],
        subnetScan: { networks: [], neighborHosts: [], candidates: 0 },
        reason: '',
        userHint: '',
      };
      const complete = (services) => {
        if (finished) return;
        finished = true;
        if (timeout) clearTimeout(timeout);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        try { socket.close(); } catch (_) {}
        if (!diagnostics.reason) diagnostics.reason = services.length ? 'SERVICE_FOUND' : (diagnostics.udp.received ? 'NO_VALID_WINDOWS_SERVICE' : 'NO_UDP_ANNOUNCEMENT');
        diagnostics.userHint = services.length
          ? '已验证 Windows Mineradio 服务。'
          : 'Windows Mineradio 应监听 0.0.0.0:服务端口；Windows 防火墙需允许 UDP 45678 广播和 TCP 服务端口。也可输入 http://Windows-IP:端口号 立即验证。';
        resolve({ ok: true, services, diagnostics });
      };
      const inspectAnnouncements = async () => {
        const services = [];
        for (const announcement of announcements.values()) {
          let result = null;
          if (announcement.baseUrl && (await this.probeWindowsService(announcement.baseUrl, diagnostics)).ok) result = await this.connect(announcement.baseUrl);
          else result = await this.scanDiscoveredWindowsHost(announcement.host, diagnostics);
          if (result && result.ok) {
            result.source = 'udp';
            services.push(result);
          }
        }
        return services;
      };
      const startFallback = () => {
        if (fallbackPromise) return fallbackPromise;
        if (finished) return Promise.resolve(null);
        fallbackPromise = this.scanActivePrivateNetworks(diagnostics, diagnostics.udp.startedAt + wait).then((service) => {
          if (service && service.ok) {
            service.source = 'subnet';
            complete([service]);
          }
          return service;
        });
        return fallbackPromise;
      };
      const finish = async () => {
        if (finished) return;
        const services = await inspectAnnouncements();
        if (services.length) return complete(services);
        if (!fallbackPromise) await startFallback();
        if (!finished) complete([]);
      };
      socket.on('message', (message) => {
        diagnostics.udp.received += 1;
        diagnostics.udp.lastReceivedAt = Date.now();
        diagnostics.udp.lastRaw = String(message || '').slice(0, 300);
        const announcement = parseWindowsDiscoveryAnnouncement(message);
        if (!announcement) {
          diagnostics.udp.parseError = 'PARSE_FAILED';
          return;
        }
        announcements.set(announcement.host, announcement);
        diagnostics.announcements = Array.from(announcements.values());
        if (!announcementProbeStarted) {
          announcementProbeStarted = true;
          inspectAnnouncements().then((services) => { if (services.length) complete(services); });
        }
      });
      socket.on('error', (error) => {
        diagnostics.udp.error = String(error && error.message || 'UDP_LISTEN_FAILED');
        diagnostics.reason = 'UDP_LISTEN_FAILED';
        startFallback();
      });
      try {
        socket.bind(WINDOWS_DISCOVERY_PORT, () => {
          fallbackTimer = setTimeout(startFallback, Math.min(WINDOWS_ACTIVE_FALLBACK_DELAY_MS, Math.max(120, Math.floor(wait / 2))));
          timeout = setTimeout(finish, wait);
        });
      } catch (error) {
        diagnostics.udp.error = String(error && error.message || 'UDP_LISTEN_FAILED');
        diagnostics.reason = 'UDP_LISTEN_FAILED';
        startFallback().then(() => { if (!finished) complete([]); });
      }
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

module.exports = { init, WindowsWallpaperClient, normalizeWindowsWallpaperRecord, normalizeWindowsWallpaperRecords, normalizeWindowsBaseUrl, parseWindowsDiscoveryAnnouncement, parseNeighborHosts };
