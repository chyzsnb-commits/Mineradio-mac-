// ====================================================================
//  粒子音乐可视化播放器 — Server v2
//  - 网易云搜索 / 歌曲URL / 封面/音频代理
//  - 扫码登录 (login_qr_*) + cookie 持久化 (./.cookie)
//  - 试听检测 (freeTrialInfo) + 全 quality 探测
//  - 所有受保护 API 都会带上已登录用户的 cookie
// ====================================================================
const {
  search,
  cloudsearch,
  song_detail,
  song_url,
  song_url_v1,
  login_qr_key,
  login_qr_create,
  login_qr_check,
  login_status,
  vip_info,
  vip_info_v2,
  logout,
  user_account,
  user_playlist,
  comment_music,
  album,
  artist_detail,
  artist_top_song,
  artist_songs,
  like: like_song,
  likelist,
  song_like_check,
  playlist_tracks,
  playlist_track_add,
  playlist_create,
  playlist_detail,
  playlist_track_all,
  personalized,
  recommend_resource,
  recommend_songs,
  personal_fm,
  playmode_intelligence_list,
  toplist,
  toplist_detail,
  top_list,
  dj_detail,
  dj_program,
  dj_hot,
  dj_sublist,
  user_audio,
  dj_paygift,
  record_recent_voice,
  sati_resource_sub_list,
  lyric,
  lyric_new,
} = require('NeteaseCloudMusicApi');
const http = require('http');
const https = require('https');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');
const tls = require('tls');
const { once } = require('events');
const { fileURLToPath } = require('url');
const { analyzePodcastDjStream, analyzePodcastDjIntro } = require('./dj-analyzer');
const { TrackDecryptor } = require('./qishui-audio-decryptor/track-decryptor');
const {
  handleKugouSearch,
  handleKugouSongUrl,
  handleKugouLyric,
  handleKugouUserPlaylists,
  handleKugouPlaylistTracks,
  handleKugouLikeCheck,
  handleKugouLikeToggle,
  handleKugouPlaylistAddSong,
  handleKugouGuessLike,
  handleKugouRankList,
  handleKugouRankTracks,
  handleKugouAlbumDetail,
  handleKugouArtistDetail,
  getKugouLoginInfo,
  normalizeKugouCookieInput,
  kugouCookieHasPlayback,
  extractKugouAuth,
  kugouAudioReferer,
} = require('./kugou-api');
const {
  getQishuiStatus,
  handleQishuiStatus,
  normalizeQishuiCookieInput,
  qishuiCookieHasLogin,
  saveQishuiAccessToken,
  clearQishuiAccessToken,
  handleQishuiSearch,
  handleQishuiFeed,
  handleQishuiUserPlaylists,
  handleQishuiPlaylistTracks,
  handleQishuiLyric,
  handleQishuiSongUrl,
} = require('./qishui-api');
const {
  getSpotifyConfig,
  clearSpotifyToken,
  saveSpotifyConfig,
  handleSpotifyStatus,
  handleSpotifySearch,
  handleSpotifyUserPlaylists,
  handleSpotifyPlaylistTracks,
  handleSpotifyAlbumDetail,
  handleSpotifySongUrl,
  handleSpotifyLyric,
} = require('./spotify-api');

// QQ 逐字歌词(qrc):加密 qrc(hex)-> 网易 yrc 逐字格式,复用前端现成逐字渲染
const { qrcHexToYrc } = require('./qq-qrc');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_COOKIE_FILE = path.join(__dirname, '.cookie');
const DEFAULT_QQ_COOKIE_FILE = path.join(__dirname, '.qq-cookie');
const DEFAULT_KUGOU_COOKIE_FILE = path.join(__dirname, '.kugou-cookie');
const DEFAULT_QISHUI_COOKIE_FILE = path.join(__dirname, '.qishui-cookie');
const UPDATE_WORK_DIR = process.env.MINERADIO_UPDATE_DIR || path.join(__dirname, 'updates');
const UPDATE_DOWNLOAD_DIR = process.env.MINERADIO_UPDATE_DOWNLOAD_DIR || path.join(UPDATE_WORK_DIR, 'downloads');
const UPDATE_PATCH_BACKUP_DIR = process.env.MINERADIO_PATCH_BACKUP_DIR || path.join(UPDATE_WORK_DIR, 'backups', 'patches');
const BEATMAP_CACHE_DIR = process.env.MINERADIO_BEAT_CACHE_DIR
  || (process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Mineradio', 'beatmaps')
    : 'D:\\MineradioCache\\beatmaps');
const APP_PACKAGE = readPackageInfo();
const APP_VERSION = process.env.MINERADIO_VERSION || APP_PACKAGE.version || '0.9.11';
const UPDATE_CONFIG = readUpdateConfig(APP_PACKAGE);
const PATCH_MAX_BYTES = 12 * 1024 * 1024;
const PATCH_ALLOWED_ROOTS = new Set(['public', 'desktop', 'build']);
const qishuiAudioDecryptor = new TrackDecryptor();
const qishuiAudioDecryptCache = new Map();
const QISHUI_AUDIO_DECRYPT_CACHE_MAX_BYTES = 96 * 1024 * 1024;
let qishuiAudioDecryptCacheBytes = 0;
const PATCH_ALLOWED_FILES = new Set(['server.js', 'dj-analyzer.js', 'package.json', 'package-lock.json']);
const UPDATE_FALLBACK_NOTES = [
  '电影镜头节奏更松',
  '音源失败自动换源',
  '右上角更新提示',
];
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_IP_LOCATION_URL = 'http://ip-api.com/json/';
const WEATHER_DEFAULT_LOCATION = {
  name: '上海',
  country: 'China',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
};

const updateDownloadJobs = new Map();

function applySystemCertificateAuthorities() {
  try {
    if (typeof tls.getCACertificates !== 'function' || typeof tls.setDefaultCACertificates !== 'function') return;
    const bundled = tls.getCACertificates('default') || [];
    const system = tls.getCACertificates('system') || [];
    if (!system.length) return;
    const seen = new Set();
    const merged = [];
    bundled.concat(system).forEach(cert => {
      if (!cert || seen.has(cert)) return;
      seen.add(cert);
      merged.push(cert);
    });
    if (merged.length > bundled.length) tls.setDefaultCACertificates(merged);
  } catch (e) {
    console.warn('[TLS] system CA merge skipped:', e.message);
  }
}

applySystemCertificateAuthorities();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.mjs':  'application/javascript',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
};

// ---------- Cookie 持久化 ----------
const COOKIE_ATTRIBUTE_NAMES = new Set(['path', 'domain', 'expires', 'max-age', 'samesite', 'secure', 'httponly']);
function collectCookiePair(picked, key, value) {
  key = String(key || '').trim();
  if (!key || COOKIE_ATTRIBUTE_NAMES.has(key.toLowerCase())) return;
  if (value === null || value === undefined) return;
  picked.set(key, String(value).trim());
}
function collectCookieInput(input, picked) {
  if (input === null || input === undefined) return;
  if (Array.isArray(input)) {
    input.forEach(item => collectCookieInput(item, picked));
    return;
  }
  if (typeof input === 'object') {
    if (input.name && Object.prototype.hasOwnProperty.call(input, 'value')) {
      collectCookiePair(picked, input.name, input.value);
      return;
    }
    Object.keys(input).forEach(key => {
      const value = input[key];
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
        collectCookiePair(picked, key, value.value);
      } else if (typeof value !== 'object') {
        collectCookiePair(picked, key, value);
      }
    });
    return;
  }
  String(input).split(/\r?\n/).forEach(line => {
    line.split(';').forEach(part => {
      const raw = String(part || '').trim();
      const idx = raw.indexOf('=');
      if (idx <= 0) return;
      collectCookiePair(picked, raw.slice(0, idx), raw.slice(idx + 1));
    });
  });
}
function normalizeCookieHeader(input) {
  const picked = new Map();
  collectCookieInput(input, picked);
  return Array.from(picked.entries())
    .filter(([key, value]) => key && value != null && String(value) !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}
function rawCookieFallback(input) {
  if (typeof input === 'string') return input.trim();
  if (Array.isArray(input) && input.every(item => typeof item === 'string')) return input.join('; ').trim();
  return '';
}
function getCookieFile() {
  return process.env.COOKIE_FILE || DEFAULT_COOKIE_FILE;
}
function getQQCookieFile() {
  return process.env.QQ_COOKIE_FILE || DEFAULT_QQ_COOKIE_FILE;
}
function getKugouCookieFile() {
  return process.env.KUGOU_COOKIE_FILE || DEFAULT_KUGOU_COOKIE_FILE;
}
function getQishuiCookieFile() {
  return process.env.QISHUI_COOKIE_FILE || DEFAULT_QISHUI_COOKIE_FILE;
}
function readConfiguredCookieFile(file) {
  try {
    if (file && fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  } catch (_) {}
  return '';
}
function writeConfiguredCookieFile(file, value) {
  try {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(value || ''), 'utf8');
  } catch (_) {}
}
const configuredCookieStores = {
  netease: { file: '', value: '', getFile: getCookieFile },
  qq: { file: '', value: '', getFile: getQQCookieFile },
  kugou: { file: '', value: '', getFile: getKugouCookieFile },
  qishui: { file: '', value: '', getFile: getQishuiCookieFile },
};
function refreshConfiguredCookieStore(store, force) {
  const file = store.getFile();
  if (force || store.file !== file) {
    store.file = file;
    store.value = readConfiguredCookieFile(file);
  }
  return store.value;
}
function saveConfiguredCookieStore(store, value) {
  const file = store.getFile();
  store.file = file;
  store.value = String(value || '');
  writeConfiguredCookieFile(file, store.value);
  return store.value;
}
let userCookie = '';
function saveCookie(c) {
  userCookie = saveConfiguredCookieStore(configuredCookieStores.netease, normalizeCookieHeader(c) || rawCookieFallback(c));
}

let qqCookie = '';
function saveQQCookie(c) {
  qqCookie = saveConfiguredCookieStore(configuredCookieStores.qq, normalizeCookieHeader(c) || rawCookieFallback(c));
}

let kugouCookie = '';
function saveKugouCookie(c) {
  kugouCookie = saveConfiguredCookieStore(configuredCookieStores.kugou, normalizeCookieHeader(c) || rawCookieFallback(c));
}

let qishuiCookie = '';
function saveQishuiCookie(c) {
  qishuiCookie = saveConfiguredCookieStore(configuredCookieStores.qishui, normalizeQishuiCookieInput(c) || normalizeCookieHeader(c) || rawCookieFallback(c));
}
function refreshConfiguredCookieStores(force) {
  userCookie = refreshConfiguredCookieStore(configuredCookieStores.netease, force);
  qqCookie = refreshConfiguredCookieStore(configuredCookieStores.qq, force);
  kugouCookie = refreshConfiguredCookieStore(configuredCookieStores.kugou, force);
  qishuiCookie = refreshConfiguredCookieStore(configuredCookieStores.qishui, force);
}
function refreshQQConfiguredCookieStore(force) {
  qqCookie = refreshConfiguredCookieStore(configuredCookieStores.qq, force);
  return qqCookie;
}
refreshConfiguredCookieStores(true);

// ---------- 工具 ----------
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(data);
  });
}
function sendJSON(res, data, status) {
  res.writeHead(status || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(JSON.stringify(data));
}
function readPackageInfo() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}
function parseGitHubRepository(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const direct = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (direct) return { owner: direct[1], repo: direct[2].replace(/\.git$/i, '') };
  const github = raw.match(/github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[#/?].*)?$/i);
  if (github) return { owner: github[1], repo: github[2].replace(/\.git$/i, '') };
  return null;
}
function readUpdateConfig(pkg) {
  const local = (pkg && pkg.mineradio && pkg.mineradio.update) || {};
  const disabled = local.disabled === true || local.provider === 'none';
  if (disabled) {
    return {
      provider: local.provider || 'none',
      owner: '',
      repo: '',
      configured: false,
      disabled: true,
      preview: false,
      preferMirrors: false,
      mirrors: [],
      manifest: '',
    };
  }
  const repoHint = process.env.MINERADIO_UPDATE_REPOSITORY
    || process.env.GITHUB_REPOSITORY
    || local.repository
    || local.github
    || (pkg && pkg.repository && (pkg.repository.url || pkg.repository))
    || '';
  const parsed = parseGitHubRepository(repoHint) || {};
  const owner = process.env.MINERADIO_UPDATE_OWNER || local.owner || parsed.owner || '';
  const repo = process.env.MINERADIO_UPDATE_REPO || local.repo || parsed.repo || '';
  return {
    provider: local.provider || 'github',
    owner,
    repo,
    configured: !!(owner && repo),
    disabled: false,
    preview: local.preview !== false,
    preferMirrors: local.preferMirrors !== false,
    mirrors: readUpdateMirrors(local),
    manifest: process.env.MINERADIO_UPDATE_MANIFEST
      || process.env.MINERADIO_UPDATE_MANIFEST_URL
      || process.env.MINERADIO_UPDATE_MANIFEST_FILE
      || '',
  };
}
function parseUpdateMirrorList(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(/[\n,;]/);
}
function readUpdateMirrors(local) {
  const envMirrors = process.env.MINERADIO_UPDATE_MIRRORS || process.env.MINERADIO_UPDATE_MIRROR || '';
  const raw = envMirrors
    ? parseUpdateMirrorList(envMirrors)
    : parseUpdateMirrorList(local.mirrors || local.downloadMirrors || []);
  const seen = new Set();
  const mirrors = [];
  raw.forEach(item => {
    const url = String(item || '').trim();
    if (!/^https?:\/\//i.test(url)) return;
    const key = url.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    mirrors.push(url);
  });
  return mirrors.slice(0, 6);
}
function normalizeDigest(value, algorithm) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const prefix = new RegExp('^' + algorithm + ':', 'i');
  return raw.replace(prefix, '').trim().replace(/^['"]|['"]$/g, '');
}
function assetDigestInfo(asset) {
  const digest = String(asset && asset.digest || '').trim();
  return {
    sha256: normalizeDigest((asset && asset.sha256) || (/^sha256:/i.test(digest) ? digest : ''), 'sha256').toLowerCase(),
    sha512: normalizeDigest((asset && asset.sha512) || (/^sha512:/i.test(digest) ? digest : ''), 'sha512'),
  };
}
function buildMirrorUrl(originalUrl, mirror) {
  const source = String(originalUrl || '').trim();
  const base = String(mirror || '').trim();
  if (!/^https?:\/\//i.test(source) || !/^https?:\/\//i.test(base)) return '';
  if (base.includes('{encodedUrl}')) return base.replace(/\{encodedUrl\}/g, encodeURIComponent(source));
  if (base.includes('{url}')) return base.replace(/\{url\}/g, source);
  return base.replace(/\/+$/, '/') + source;
}
function uniqueDownloadCandidates(urls, opts) {
  opts = opts || {};
  const directUrls = (Array.isArray(urls) ? urls : [urls])
    .map(url => String(url || '').trim())
    .filter(url => /^https?:\/\//i.test(url));
  const directSet = new Set(directUrls.map(url => url.toLowerCase()));
  const mirrors = opts.useMirrors === false ? [] : (UPDATE_CONFIG.mirrors || []);
  const mirrored = [];
  directUrls.forEach(source => {
    mirrors.forEach((mirror, index) => {
      const url = buildMirrorUrl(source, mirror);
      if (url) mirrored.push({
        url,
        label: '国内加速线路 ' + (index + 1),
        mirrored: true,
      });
    });
  });
  const direct = directUrls.map(url => ({
    url,
    label: directSet.has(url.toLowerCase()) ? 'GitHub 直连' : '下载线路',
    mirrored: false,
  }));
  const ordered = UPDATE_CONFIG.preferMirrors === false ? direct.concat(mirrored) : mirrored.concat(direct);
  const seen = new Set();
  return ordered.filter(item => {
    const key = item.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function publicDownloadUrls(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map(item => item && item.url)
    .filter(Boolean);
}
function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').replace(/[+].*$/, '').replace(/-.+$/, '');
}
function compareVersions(a, b) {
  const aa = normalizeVersion(a).split('.').map(n => parseInt(n, 10) || 0);
  const bb = normalizeVersion(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(aa.length, bb.length, 3);
  for (let i = 0; i < len; i++) {
    const left = aa[i] || 0;
    const right = bb[i] || 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}
function cleanReleaseLine(line) {
  return String(line || '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*[-*]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
}
function extractReleaseNotes(body) {
  const notes = [];
  String(body || '').split(/\r?\n/).forEach(line => {
    const text = cleanReleaseLine(line);
    if (!text) return;
    if (/^(what'?s changed|changes|changelog|full changelog|更新日志)$/i.test(text)) return;
    if (/^https?:\/\//i.test(text)) return;
    if (text.length > 72) return;
    notes.push(text);
  });
  return notes.slice(0, 4);
}
function pickReleaseAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const preferred = list.find(a => /\.(exe|msi)$/i.test(a && a.name || ''))
    || list.find(a => /\.(zip|7z)$/i.test(a && a.name || ''))
    || list[0];
  if (!preferred) return null;
  const digest = assetDigestInfo(preferred);
  const candidates = uniqueDownloadCandidates(preferred.browser_download_url || '');
  return {
    name: preferred.name || '',
    size: preferred.size || 0,
    contentType: preferred.content_type || '',
    downloadUrl: preferred.browser_download_url || '',
    downloadUrls: publicDownloadUrls(candidates),
    sha256: digest.sha256 || '',
    sha512: digest.sha512 || '',
  };
}
function patchAssetVersions(name) {
  const matches = String(name || '').match(/\d+(?:[._-]\d+){1,3}/g) || [];
  return matches.map(item => normalizeVersion(item.replace(/[._-]/g, '.'))).filter(Boolean);
}
function pickPatchAsset(assets, currentVersion, latestVersion) {
  const list = Array.isArray(assets) ? assets : [];
  const current = normalizeVersion(currentVersion || APP_VERSION);
  const latest = normalizeVersion(latestVersion || '');
  const preferred = list.find(a => {
    const name = String(a && a.name || '');
    if (!/\.(patch\.json|patch|json)$/i.test(name)) return false;
    const versions = patchAssetVersions(name);
    if (latest) return versions[0] === current && versions[versions.length - 1] === latest;
    return versions[0] === current && name.toLowerCase().includes('patch');
  }) || list.find(a => {
    const name = String(a && a.name || '');
    if (!/\.(patch\.json|patch|json)$/i.test(name)) return false;
    const versions = patchAssetVersions(name);
    return versions[0] === current && name.toLowerCase().includes('patch');
  }) || list.find(a => /\.(patch\.json|patch)$/i.test(a && a.name || ''));
  if (!preferred) return null;
  const digest = assetDigestInfo(preferred);
  const candidates = uniqueDownloadCandidates(preferred.browser_download_url || '');
  return {
    name: preferred.name || '',
    size: preferred.size || 0,
    contentType: preferred.content_type || '',
    downloadUrl: preferred.browser_download_url || '',
    downloadUrls: publicDownloadUrls(candidates),
    sha256: digest.sha256 || '',
    sha512: digest.sha512 || '',
  };
}
function updateAssetNameFromUrl(value) {
  try {
    const u = new URL(String(value || ''));
    const base = path.basename(decodeURIComponent(u.pathname || ''));
    if (base) return base;
  } catch (_) {}
  return path.basename(String(value || '').split('?')[0]) || '';
}
function normalizeManifestUpdateInfo(data) {
  data = data || {};
  const release = data.release || {};
  const asset = release.asset || data.asset || {};
  const latestVersion = normalizeVersion(
    data.latestVersion
    || data.version
    || release.version
    || release.tagName
    || release.tag_name
    || release.name
    || APP_VERSION
  ) || APP_VERSION;
  const downloadUrl = release.downloadUrl || data.downloadUrl || asset.downloadUrl || asset.browser_download_url || '';
  const patch = release.patch || data.patch || null;
  const assetUrls = [downloadUrl].concat(Array.isArray(asset.downloadUrls) ? asset.downloadUrls : []);
  const patchUrls = patch ? [patch.downloadUrl].concat(Array.isArray(patch.downloadUrls) ? patch.downloadUrls : []) : [];
  const patchInfo = patch && patch.downloadUrl ? {
    name: patch.name || updateAssetNameFromUrl(patch.downloadUrl) || `Mineradio-${APP_VERSION}→${latestVersion}.patch.json`,
    size: Number(patch.size || 0) || 0,
    contentType: patch.contentType || patch.content_type || 'application/json',
    downloadUrl: patch.downloadUrl,
    downloadUrls: publicDownloadUrls(uniqueDownloadCandidates(patchUrls)),
    from: normalizeVersion(patch.from || APP_VERSION),
    to: normalizeVersion(patch.to || latestVersion),
    sha256: normalizeDigest(patch.sha256 || '', 'sha256').toLowerCase(),
    sha512: normalizeDigest(patch.sha512 || '', 'sha512'),
  } : null;
  const notes = Array.isArray(release.notes) && release.notes.length
    ? release.notes.slice(0, 4).map(cleanReleaseLine).filter(Boolean)
    : (extractReleaseNotes(release.body || data.body).length ? extractReleaseNotes(release.body || data.body) : UPDATE_FALLBACK_NOTES);
  const assetInfo = downloadUrl ? {
    name: asset.name || updateAssetNameFromUrl(downloadUrl) || `Mineradio-${latestVersion}-Setup.exe`,
    size: Number(asset.size || 0) || 0,
    contentType: asset.contentType || asset.content_type || '',
    downloadUrl,
    downloadUrls: publicDownloadUrls(uniqueDownloadCandidates(assetUrls)),
    sha256: normalizeDigest(asset.sha256 || '', 'sha256').toLowerCase(),
    sha512: normalizeDigest(asset.sha512 || release.sha512 || data.sha512 || '', 'sha512'),
  } : null;
  return {
    configured: true,
    preview: false,
    updateAvailable: data.updateAvailable != null ? !!data.updateAvailable : compareVersions(latestVersion, APP_VERSION) > 0,
    currentVersion: APP_VERSION,
    latestVersion,
    release: {
      tagName: release.tagName || release.tag_name || data.tagName || ('v' + latestVersion),
      name: release.name || data.name || ('Mineradio v' + latestVersion),
      version: latestVersion,
      publishedAt: release.publishedAt || release.published_at || data.publishedAt || '',
      htmlUrl: release.htmlUrl || release.html_url || data.htmlUrl || '',
      downloadUrl,
      asset: assetInfo,
      patch: patchInfo,
      patchAvailable: !!(patchInfo && patchInfo.downloadUrl && compareVersions(latestVersion, APP_VERSION) > 0),
      summary: release.summary || data.summary || notes[0] || '发现新版本，建议更新。',
      notes,
    },
    source: 'manifest',
  };
}
async function readUpdateManifest(ref) {
  const value = String(ref || '').trim();
  if (!value) throw new Error('UPDATE_MANIFEST_MISSING');
  if (/^https?:\/\//i.test(value)) {
    const resp = await fetch(value, {
      headers: { 'User-Agent': `Mineradio/${APP_VERSION}` },
    });
    if (!resp.ok) throw new Error('Update manifest ' + resp.status);
    return resp.json();
  }
  const file = /^file:/i.test(value) ? fileURLToPath(value) : path.resolve(value);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
async function fetchManifestUpdateInfo(ref) {
  try {
    const data = await readUpdateManifest(ref);
    return normalizeManifestUpdateInfo(data);
  } catch (err) {
    return localUpdateFallback(err.message || 'Update manifest failed', { configured: true });
  }
}
function beatCacheRootInfo() {
  const dir = path.resolve(BEATMAP_CACHE_DIR);
  const root = path.parse(dir).root;
  const drive = root ? root.replace(/[\\\/]+$/, '').toUpperCase() : '';
  const allowed = !!root && !/^C:$/i.test(drive);
  const available = allowed && fs.existsSync(root);
  return { dir, root, drive, allowed, available };
}
function ensureBeatMapCacheDir() {
  const info = beatCacheRootInfo();
  if (!info.allowed) {
    const err = new Error('BEAT_CACHE_ON_C_DRIVE_DISABLED');
    err.code = 'BEAT_CACHE_ON_C_DRIVE_DISABLED';
    err.info = info;
    throw err;
  }
  if (!info.available) {
    const err = new Error('BEAT_CACHE_DRIVE_UNAVAILABLE');
    err.code = 'BEAT_CACHE_DRIVE_UNAVAILABLE';
    err.info = info;
    throw err;
  }
  fs.mkdirSync(info.dir, { recursive: true });
  return info.dir;
}
function safeBeatMapCacheFile(key) {
  const raw = String(key || '').trim();
  if (!raw || raw.length > 240) return null;
  const hash = crypto.createHash('sha1').update(raw).digest('hex');
  const label = raw.replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'beatmap';
  return path.join(ensureBeatMapCacheDir(), `${label}-${hash}.json`);
}
function compactBeatMapCachePayload(body) {
  const key = String(body && body.key || '').trim();
  const map = body && body.map;
  if (!key || !map || typeof map !== 'object') return null;
  return {
    v: 1,
    key,
    savedAt: Date.now(),
    meta: {
      provider: String(body.provider || '').slice(0, 32),
      title: String(body.title || '').slice(0, 160),
      artist: String(body.artist || '').slice(0, 160),
      mode: String(body.mode || 'mr').slice(0, 32),
    },
    map,
  };
}
function readBeatMapCache(key) {
  const file = safeBeatMapCacheFile(key);
  if (!file || !fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw && raw.map ? raw : null;
}
function writeBeatMapCache(body) {
  const payload = compactBeatMapCachePayload(body);
  if (!payload) return { ok: false, error: 'INVALID_BEATMAP_CACHE_PAYLOAD' };
  const file = safeBeatMapCacheFile(payload.key);
  if (!file) return { ok: false, error: 'INVALID_BEATMAP_CACHE_KEY' };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, file);
  return { ok: true, key: payload.key, savedAt: payload.savedAt, dir: path.dirname(file) };
}
function localUpdateFallback(reason, opts) {
  opts = opts || {};
  const configured = !!(opts.configured != null ? opts.configured : false);
  return {
    configured,
    preview: UPDATE_CONFIG.preview,
    updateAvailable: false,
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
    release: {
      tagName: 'v' + APP_VERSION,
      name: 'Mineradio v' + APP_VERSION,
      version: APP_VERSION,
      htmlUrl: '',
      downloadUrl: '',
      summary: '当前版本，更新检测已就绪。',
      notes: UPDATE_FALLBACK_NOTES,
    },
    reason: reason || '',
  };
}
function updateError(code, message, cause) {
  const err = new Error(message || code);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}
function classifyUpdateError(err) {
  const code = String(err && err.code || '').trim();
  const message = String(err && err.message || err || '').trim();
  const detail = message || code || '未知错误';
  if (/HASH|DIGEST|CHECKSUM/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_HASH_MISMATCH', reason: '文件校验失败，可能是线路缓存异常，已拦截该安装包。', detail };
  }
  if (/SIZE_MISMATCH|content length/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_SIZE_MISMATCH', reason: '下载文件大小不一致，可能是网络中断或线路缓存不完整。', detail };
  }
  if (/AbortError|TIMEOUT|ETIMEDOUT|timeout/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_TIMEOUT', reason: '连接超时，当前网络到更新线路不稳定。', detail };
  }
  if (/ENOTFOUND|EAI_AGAIN|DNS|fetch failed|getaddrinfo/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_DNS_FAILED', reason: '域名解析失败，可能是当前网络无法连接该更新线路。', detail };
  }
  if (/ECONNRESET|ECONNREFUSED|socket|network/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_NETWORK_FAILED', reason: '网络连接被中断，已尝试切换更新线路。', detail };
  }
  const http = message.match(/\bHTTP[_\s-]?(\d{3})\b/i) || message.match(/\b(\d{3})\b/);
  if (http) {
    const status = Number(http[1]);
    if (status === 403) return { code: code || 'UPDATE_HTTP_403', reason: '更新线路返回 403，可能被限流或拦截。', detail };
    if (status === 404) return { code: code || 'UPDATE_HTTP_404', reason: '更新文件不存在，可能 release 资源还没有同步完成。', detail };
    if (status >= 500) return { code: code || 'UPDATE_HTTP_5XX', reason: '更新线路服务器异常，请稍后重试。', detail };
    return { code: code || ('UPDATE_HTTP_' + status), reason: '更新线路返回 HTTP ' + status + '。', detail };
  }
  return { code: code || 'UPDATE_FAILED', reason: '更新失败：' + detail, detail };
}
async function fetchWithTimeout(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 12000);
  try {
    return await fetch(url, Object.assign({}, opts || {}, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}
async function fetchTextFromCandidates(candidates, timeoutMs) {
  const list = Array.isArray(candidates) && candidates.length ? candidates : [];
  const failures = [];
  for (let i = 0; i < list.length; i++) {
    const candidate = list[i];
    try {
      const resp = await fetchWithTimeout(candidate.url, {
        headers: { 'User-Agent': `Mineradio/${APP_VERSION}` },
      }, timeoutMs || 6500);
      if (!resp.ok) throw updateError('HTTP_' + resp.status, 'HTTP ' + resp.status);
      return { text: await resp.text(), candidate };
    } catch (err) {
      const info = classifyUpdateError(err);
      failures.push(candidate.label + ': ' + info.reason);
    }
  }
  throw updateError('UPDATE_ALL_LINES_FAILED', failures.join('；') || 'All update lines failed');
}
function yamlScalar(text, key) {
  const pattern = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*(.+?)\\s*$', 'm');
  const match = String(text || '').match(pattern);
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}
function githubReleaseDownloadUrl(version, fileName) {
  const tag = 'v' + normalizeVersion(version);
  const encodedOwner = encodeURIComponent(UPDATE_CONFIG.owner);
  const encodedRepo = encodeURIComponent(UPDATE_CONFIG.repo);
  const encodedName = String(fileName || '').split('/').map(part => encodeURIComponent(part)).join('/');
  return `https://github.com/${encodedOwner}/${encodedRepo}/releases/download/${tag}/${encodedName}`;
}
function parseLatestYmlUpdateInfo(text, reason) {
  const latestVersion = normalizeVersion(yamlScalar(text, 'version') || APP_VERSION) || APP_VERSION;
  const assetPath = yamlScalar(text, 'path') || yamlScalar(text, 'url') || `Mineradio-${latestVersion}-Setup.exe`;
  const sha512 = normalizeDigest(yamlScalar(text, 'sha512'), 'sha512');
  const size = Number(yamlScalar(text, 'size') || 0) || 0;
  const releaseDate = yamlScalar(text, 'releaseDate');
  const downloadUrl = githubReleaseDownloadUrl(latestVersion, assetPath);
  const candidates = uniqueDownloadCandidates(downloadUrl);
  const asset = {
    name: updateAssetNameFromUrl(downloadUrl) || assetPath,
    size,
    contentType: 'application/octet-stream',
    downloadUrl,
    downloadUrls: publicDownloadUrls(candidates),
    sha256: '',
    sha512,
  };
  return {
    configured: true,
    preview: false,
    updateAvailable: compareVersions(latestVersion, APP_VERSION) > 0,
    currentVersion: APP_VERSION,
    latestVersion,
    release: {
      tagName: 'v' + latestVersion,
      name: 'Mineradio v' + latestVersion,
      version: latestVersion,
      publishedAt: releaseDate,
      htmlUrl: `https://github.com/${UPDATE_CONFIG.owner}/${UPDATE_CONFIG.repo}/releases/tag/v${latestVersion}`,
      downloadUrl,
      asset,
      patch: null,
      patchAvailable: false,
      summary: '发现新版本，已启用备用更新线路。',
      notes: ['更新检测已切换到备用线路', '下载时会自动选择国内加速线路', '下载失败会显示具体原因和当前速度'],
    },
    source: 'latest-yml',
    reason: reason || '',
  };
}
async function fetchLatestYmlUpdateInfo(reason) {
  if (!UPDATE_CONFIG.configured || UPDATE_CONFIG.provider !== 'github') throw updateError('UPDATE_REPOSITORY_NOT_CONFIGURED');
  const latestYmlUrl = `https://github.com/${encodeURIComponent(UPDATE_CONFIG.owner)}/${encodeURIComponent(UPDATE_CONFIG.repo)}/releases/latest/download/latest.yml`;
  const candidates = uniqueDownloadCandidates(latestYmlUrl);
  const result = await fetchTextFromCandidates(candidates, 6500);
  return parseLatestYmlUpdateInfo(result.text, reason);
}
async function fetchLatestUpdateInfo() {
  if (UPDATE_CONFIG.manifest) return fetchManifestUpdateInfo(UPDATE_CONFIG.manifest);
  if (!UPDATE_CONFIG.configured || UPDATE_CONFIG.provider !== 'github') return localUpdateFallback();
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(UPDATE_CONFIG.owner)}/${encodeURIComponent(UPDATE_CONFIG.repo)}/releases/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    const resp = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': `Mineradio/${APP_VERSION}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!resp.ok) {
      try { return await fetchLatestYmlUpdateInfo('GitHub Releases ' + resp.status); }
      catch (_) { return localUpdateFallback('GitHub Releases ' + resp.status, { configured: true }); }
    }
    const data = await resp.json();
    const latestVersion = normalizeVersion(data.tag_name || data.name || APP_VERSION) || APP_VERSION;
    const asset = pickReleaseAsset(data.assets);
    const patch = pickPatchAsset(data.assets, APP_VERSION, latestVersion);
    const notes = extractReleaseNotes(data.body).length ? extractReleaseNotes(data.body) : UPDATE_FALLBACK_NOTES;
    return {
      configured: true,
      preview: false,
      updateAvailable: compareVersions(latestVersion, APP_VERSION) > 0,
      currentVersion: APP_VERSION,
      latestVersion,
      release: {
        tagName: data.tag_name || ('v' + latestVersion),
        name: data.name || ('Mineradio v' + latestVersion),
        version: latestVersion,
        publishedAt: data.published_at || '',
        htmlUrl: data.html_url || '',
        downloadUrl: asset ? asset.downloadUrl : '',
        asset,
        patch,
        patchAvailable: !!(patch && patch.downloadUrl && compareVersions(latestVersion, APP_VERSION) > 0),
        summary: notes[0] || '发现新版本，建议更新。',
        notes,
      },
    };
  } catch (err) {
    const reason = err && err.message || 'Update check failed';
    try { return await fetchLatestYmlUpdateInfo(reason); }
    catch (fallbackErr) { return localUpdateFallback((fallbackErr && fallbackErr.message) || reason, { configured: true }); }
  } finally {
    clearTimeout(timer);
  }
}
function safeUpdateFileName(name, version) {
  const raw = String(name || '').trim() || `Mineradio-${version || APP_VERSION}.exe`;
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned || `Mineradio-${version || APP_VERSION}.exe`;
}
function publicUpdateJob(job) {
  if (!job) return { ok: false, error: 'UPDATE_JOB_NOT_FOUND' };
  return {
    ok: job.status !== 'error',
    id: job.id,
    status: job.status,
    progress: job.progress || 0,
    received: job.received || 0,
    total: job.total || 0,
    speedBps: job.speedBps || 0,
    etaSeconds: job.etaSeconds || 0,
    sourceLabel: job.sourceLabel || '',
    attempt: job.attempt || 0,
    attempts: job.attempts || 0,
    mode: job.mode || 'installer',
    message: job.message || '',
    restartRequired: !!job.restartRequired,
    cached: !!job.cached,
    fileName: job.fileName || '',
    filePath: job.status === 'ready' ? job.filePath : '',
    version: job.version || '',
    releaseUrl: job.releaseUrl || '',
    error: job.error || '',
    errorReason: job.errorReason || '',
    errorDetail: job.errorDetail || '',
    failedAttempts: Array.isArray(job.failedAttempts) ? job.failedAttempts.slice(0, 6) : [],
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
function activeUpdateJobFor(version) {
  const jobs = Array.from(updateDownloadJobs.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return jobs.find(job => job.version === version && (job.status === 'queued' || job.status === 'downloading' || job.status === 'ready'));
}
function trimUpdateJobs() {
  const jobs = Array.from(updateDownloadJobs.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  jobs.slice(8).forEach(job => updateDownloadJobs.delete(job.id));
}
async function downloadUpdateAsset(job) {
  const tmpPath = job.filePath + '.download';
  try {
    fs.mkdirSync(UPDATE_DOWNLOAD_DIR, { recursive: true });
    job.status = 'downloading';
    job.updatedAt = Date.now();

    const resp = await fetch(job.downloadUrl, {
      headers: {
        'User-Agent': `Mineradio/${APP_VERSION}`,
      },
    });
    if (!resp.ok) throw new Error('Download failed ' + resp.status);

    const totalHeader = parseInt(resp.headers.get('content-length') || '0', 10) || 0;
    job.total = totalHeader || job.total || 0;
    job.received = 0;
    job.progress = 0;
    job.speedBps = 0;
    job.etaSeconds = 0;
    job.message = job.total ? '正在下载完整安装包' : '正在下载完整安装包，等待服务器返回大小';
    job.updatedAt = Date.now();
    let speedWindowAt = Date.now();
    let speedWindowBytes = 0;

    const writer = fs.createWriteStream(tmpPath);
    const reader = resp.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const buf = Buffer.from(chunk.value);
        job.received += buf.length;
        speedWindowBytes += buf.length;
        const now = Date.now();
        if (now - speedWindowAt >= 900) {
          job.speedBps = Math.round(speedWindowBytes / Math.max(0.001, (now - speedWindowAt) / 1000));
          speedWindowAt = now;
          speedWindowBytes = 0;
        }
        if (job.total > 0) {
          job.progress = Math.max(1, Math.min(99, Math.round((job.received / job.total) * 100)));
          job.etaSeconds = job.speedBps > 0 ? Math.max(0, Math.round((job.total - job.received) / job.speedBps)) : 0;
        } else {
          const kb = Math.max(1, job.received / 1024);
          job.progress = Math.max(1, Math.min(88, Math.round(Math.log10(kb + 1) * 24)));
        }
        job.message = job.total > 0 ? '正在下载完整安装包' : '正在下载完整安装包，服务器未提供总大小';
        job.updatedAt = Date.now();
        if (!writer.write(buf)) await once(writer, 'drain');
      }
    } finally {
      writer.end();
      await once(writer, 'finish').catch(() => {});
    }

    if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
    fs.renameSync(tmpPath, job.filePath);
    job.status = 'ready';
    job.progress = 100;
    job.message = '安装包已下载';
    job.updatedAt = Date.now();
  } catch (e) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    job.status = 'error';
    job.error = e.message || 'UPDATE_DOWNLOAD_FAILED';
    job.updatedAt = Date.now();
  }
}
function sha512Base64(buffer) {
  return crypto.createHash('sha512').update(buffer).digest('base64');
}
function sha512Hex(buffer) {
  return crypto.createHash('sha512').update(buffer).digest('hex');
}
function verifyUpdateBuffer(buffer, job) {
  const expectedSize = Number(job.expectedSize || job.total || 0) || 0;
  if (expectedSize > 0 && buffer.length !== expectedSize) {
    throw updateError('UPDATE_SIZE_MISMATCH', `Expected ${expectedSize} bytes, got ${buffer.length}`);
  }
  const expectedSha256 = normalizeDigest(job.sha256 || '', 'sha256').toLowerCase();
  if (expectedSha256 && sha256Hex(buffer) !== expectedSha256) {
    throw updateError('UPDATE_SHA256_MISMATCH', 'Downloaded sha256 mismatch');
  }
  const expectedSha512 = normalizeDigest(job.sha512 || '', 'sha512');
  if (expectedSha512) {
    const actualBase64 = sha512Base64(buffer);
    const actualHex = sha512Hex(buffer).toLowerCase();
    if (actualBase64 !== expectedSha512 && actualHex !== expectedSha512.toLowerCase()) {
      throw updateError('UPDATE_SHA512_MISMATCH', 'Downloaded sha512 mismatch');
    }
  }
}
function verifyUpdateFile(filePath, job) {
  verifyUpdateBuffer(fs.readFileSync(filePath), job);
}
function moveInvalidUpdateFile(filePath, reason) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return;
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const invalidPath = path.join(dir, `${base}.invalid-${Date.now()}${ext || '.bin'}`);
    fs.renameSync(filePath, invalidPath);
    console.warn('[UpdateDownload] cached installer moved aside:', reason || 'invalid', invalidPath);
  } catch (e) {
    console.warn('[UpdateDownload] failed to move invalid cached installer:', e.message);
  }
}
function reuseVerifiedInstallerJob(opts) {
  if (!opts || !opts.filePath || !fs.existsSync(opts.filePath)) return null;
  if (!opts.expectedSize && !opts.sha256 && !opts.sha512) return null;
  const now = Date.now();
  const stat = fs.statSync(opts.filePath);
  const job = {
    id: 'cached-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    status: 'ready',
    progress: 100,
    received: stat.size || 0,
    total: opts.expectedSize || stat.size || 0,
    speedBps: 0,
    etaSeconds: 0,
    sourceLabel: '本地缓存',
    attempt: 0,
    attempts: opts.attempts || 0,
    mode: 'installer',
    message: '安装包已下载，可直接打开安装',
    fileName: opts.fileName || path.basename(opts.filePath),
    filePath: opts.filePath,
    version: opts.version || '',
    downloadUrl: opts.downloadUrl || '',
    downloadCandidates: opts.downloadCandidates || [],
    expectedSize: opts.expectedSize || 0,
    sha256: opts.sha256 || '',
    sha512: opts.sha512 || '',
    releaseUrl: opts.releaseUrl || '',
    failedAttempts: [],
    cached: true,
    createdAt: now,
    updatedAt: now,
    error: '',
  };
  try {
    verifyUpdateFile(opts.filePath, job);
    updateDownloadJobs.set(job.id, job);
    trimUpdateJobs();
    return job;
  } catch (err) {
    moveInvalidUpdateFile(opts.filePath, (err && err.message) || 'cache verification failed');
    return null;
  }
}
function setUpdateJobError(job, err, fallbackMessage) {
  const info = classifyUpdateError(err);
  job.status = 'error';
  job.error = info.code;
  job.errorReason = info.reason;
  job.errorDetail = info.detail;
  job.message = fallbackMessage || info.reason;
  job.updatedAt = Date.now();
}
function prepareUpdateJobAttempt(job, candidate, index, total) {
  job.status = 'downloading';
  job.sourceLabel = candidate.label || '下载线路';
  job.attempt = index + 1;
  job.attempts = total;
  job.received = 0;
  job.speedBps = 0;
  job.etaSeconds = 0;
  job.error = '';
  job.errorReason = '';
  job.errorDetail = '';
  job.updatedAt = Date.now();
}
function ensureMirrorCanBeVerified(job, candidate) {
  if (!candidate || !candidate.mirrored) return;
  if (job.sha256 || job.sha512) return;
  throw updateError('MIRROR_HASH_MISSING', 'Mirror download skipped because no digest is available');
}
async function downloadUpdateAssetWithMirrors(job) {
  const tmpPath = job.filePath + '.download';
  const candidates = Array.isArray(job.downloadCandidates) && job.downloadCandidates.length
    ? job.downloadCandidates
    : uniqueDownloadCandidates(job.downloadUrl || '');
  const failures = [];
  fs.mkdirSync(UPDATE_DOWNLOAD_DIR, { recursive: true });
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
      ensureMirrorCanBeVerified(job, candidate);
      prepareUpdateJobAttempt(job, candidate, i, candidates.length);
      job.message = job.total ? '正在下载完整安装包' : '正在下载完整安装包，等待服务器返回大小';

      const resp = await fetchWithTimeout(candidate.url, {
        headers: { 'User-Agent': `Mineradio/${APP_VERSION}` },
      }, 14000);
      if (!resp.ok) throw updateError('HTTP_' + resp.status, 'HTTP ' + resp.status);

      const totalHeader = parseInt(resp.headers.get('content-length') || '0', 10) || 0;
      job.total = totalHeader || job.expectedSize || job.total || 0;
      job.progress = 0;
      job.updatedAt = Date.now();
      let speedWindowAt = Date.now();
      let speedWindowBytes = 0;

      const writer = fs.createWriteStream(tmpPath);
      const reader = resp.body.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          const buf = Buffer.from(chunk.value);
          job.received += buf.length;
          speedWindowBytes += buf.length;
          const now = Date.now();
          if (now - speedWindowAt >= 900) {
            job.speedBps = Math.round(speedWindowBytes / Math.max(0.001, (now - speedWindowAt) / 1000));
            speedWindowAt = now;
            speedWindowBytes = 0;
          }
          if (job.total > 0) {
            job.progress = Math.max(1, Math.min(99, Math.round((job.received / job.total) * 100)));
            job.etaSeconds = job.speedBps > 0 ? Math.max(0, Math.round((job.total - job.received) / job.speedBps)) : 0;
          } else {
            const kb = Math.max(1, job.received / 1024);
            job.progress = Math.max(1, Math.min(88, Math.round(Math.log10(kb + 1) * 24)));
          }
          job.message = job.total > 0 ? '正在下载完整安装包' : '正在下载完整安装包，服务器未提供总大小';
          job.updatedAt = Date.now();
          if (!writer.write(buf)) await once(writer, 'drain');
        }
      } finally {
        writer.end();
        await once(writer, 'finish').catch(() => {});
      }

      verifyUpdateFile(tmpPath, job);
      if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
      fs.renameSync(tmpPath, job.filePath);
      job.status = 'ready';
      job.progress = 100;
      job.etaSeconds = 0;
      job.message = '安装包已下载';
      job.updatedAt = Date.now();
      return;
    } catch (err) {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
      const info = classifyUpdateError(err);
      failures.push({ source: candidate.label || '下载线路', reason: info.reason, detail: info.detail });
      job.failedAttempts = failures.slice(-6);
      job.message = i < candidates.length - 1 ? ((candidate.label || '当前线路') + '失败，正在切换线路') : info.reason;
      job.updatedAt = Date.now();
      if (i >= candidates.length - 1) setUpdateJobError(job, err, '下载失败：' + info.reason);
    }
  }
}
function startUpdateDownloadJob(info) {
  const release = info && info.release ? info.release : {};
  const asset = release.asset || {};
  const downloadUrl = release.downloadUrl || asset.downloadUrl || '';
  if (!info || !info.configured) return { ok: false, error: 'UPDATE_REPOSITORY_NOT_CONFIGURED' };
  if (!info.updateAvailable) return { ok: false, error: 'NO_UPDATE_AVAILABLE' };
  if (!/^https?:\/\//i.test(downloadUrl)) return { ok: false, error: 'UPDATE_ASSET_MISSING' };

  const version = info.latestVersion || release.version || '';
  const existing = activeUpdateJobFor(version);
  if (existing) return publicUpdateJob(existing);

  const fileName = safeUpdateFileName(asset.name || '', version);
  const filePath = path.join(UPDATE_DOWNLOAD_DIR, fileName);
  const downloadCandidates = uniqueDownloadCandidates([downloadUrl].concat(Array.isArray(asset.downloadUrls) ? asset.downloadUrls : []));
  const expectedSize = asset.size || 0;
  const sha256 = normalizeDigest(asset.sha256 || '', 'sha256').toLowerCase();
  const sha512 = normalizeDigest(asset.sha512 || '', 'sha512');
  const cached = reuseVerifiedInstallerJob({
    fileName,
    filePath,
    version,
    downloadUrl,
    downloadCandidates,
    expectedSize,
    sha256,
    sha512,
    releaseUrl: release.htmlUrl || '',
    attempts: downloadCandidates.length,
  });
  if (cached) return publicUpdateJob(cached);

  const now = Date.now();
  const job = {
    id: now.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    status: 'queued',
    progress: 0,
    received: 0,
    total: expectedSize,
    mode: 'installer',
    fileName,
    filePath,
    version,
    downloadUrl,
    downloadCandidates,
    expectedSize,
    sha256,
    sha512,
    releaseUrl: release.htmlUrl || '',
    sourceLabel: '',
    attempt: 0,
    attempts: downloadCandidates.length,
    failedAttempts: [],
    createdAt: now,
    updatedAt: now,
    error: '',
  };
  updateDownloadJobs.set(job.id, job);
  trimUpdateJobs();
  downloadUpdateAssetWithMirrors(job);
  return publicUpdateJob(job);
}
function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function safePatchRelativePath(value) {
  const rel = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!rel || rel.includes('\0')) return '';
  const parts = rel.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '..' || part === '.')) return '';
  const root = parts[0];
  if (PATCH_ALLOWED_FILES.has(rel)) return rel;
  if (!PATCH_ALLOWED_ROOTS.has(root)) return '';
  if (/\.(exe|dll|node|msi|bat|cmd|ps1|pfx|pem|key)$/i.test(rel)) return '';
  return parts.join('/');
}
function patchTargetPath(rel) {
  const safeRel = safePatchRelativePath(rel);
  if (!safeRel) return null;
  const target = path.resolve(__dirname, safeRel);
  const root = path.resolve(__dirname);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}
function decodePatchFile(file) {
  if (!file || typeof file !== 'object') return null;
  if (typeof file.contentBase64 === 'string') return Buffer.from(file.contentBase64, 'base64');
  if (typeof file.content === 'string') return Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
  return null;
}
function backupPatchTarget(job, rel, target) {
  if (!fs.existsSync(target)) return;
  const backup = path.join(UPDATE_PATCH_BACKUP_DIR, job.id, rel);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
}
function writePatchFile(job, file) {
  const rel = safePatchRelativePath(file.path || file.name);
  const target = rel ? patchTargetPath(rel) : null;
  const content = decodePatchFile(file);
  if (!rel || !target || !content) throw new Error('INVALID_PATCH_FILE');
  if (content.length > PATCH_MAX_BYTES) throw new Error('PATCH_FILE_TOO_LARGE');
  const expected = String(file.sha256 || '').trim().toLowerCase();
  const actual = sha256Hex(content);
  if (expected && expected !== actual) throw new Error('PATCH_HASH_MISMATCH:' + rel);
  backupPatchTarget(job, rel, target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.mineradio-patch';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, target);
  if (expected && sha256Hex(fs.readFileSync(target)) !== expected) throw new Error('PATCH_WRITE_VERIFY_FAILED:' + rel);
  return rel;
}
function normalizePatchPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('INVALID_PATCH_PAYLOAD');
  const type = String(payload.type || payload.kind || '');
  if (type && type !== 'mineradio-resource-patch') throw new Error('UNSUPPORTED_PATCH_TYPE');
  const from = normalizeVersion(payload.from || payload.baseVersion || '');
  const to = normalizeVersion(payload.to || payload.version || payload.targetVersion || '');
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (!from || compareVersions(from, APP_VERSION) !== 0) throw new Error('PATCH_VERSION_MISMATCH');
  if (!to || compareVersions(to, APP_VERSION) <= 0) throw new Error('PATCH_TARGET_VERSION_INVALID');
  if (!files.length) throw new Error('PATCH_EMPTY');
  if (files.length > 40) throw new Error('PATCH_TOO_MANY_FILES');
  return { from, to, files, restartRequired: payload.restartRequired !== false };
}
async function downloadAndApplyPatch(job) {
  const chunks = [];
  try {
    fs.mkdirSync(UPDATE_DOWNLOAD_DIR, { recursive: true });
    job.status = 'downloading';
    job.mode = 'patch';
    job.message = '正在下载快速补丁';
    job.updatedAt = Date.now();

    const resp = await fetch(job.downloadUrl, {
      headers: { 'User-Agent': `Mineradio/${APP_VERSION}` },
    });
    if (!resp.ok) throw new Error('Patch download failed ' + resp.status);

    job.total = parseInt(resp.headers.get('content-length') || '0', 10) || job.total || 0;
    job.received = 0;
    const reader = resp.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const buf = Buffer.from(chunk.value);
      job.received += buf.length;
      if (job.received > PATCH_MAX_BYTES) throw new Error('PATCH_TOO_LARGE');
      chunks.push(buf);
      job.progress = job.total > 0
        ? Math.max(1, Math.min(84, Math.round((job.received / job.total) * 84)))
        : Math.max(1, Math.min(76, Math.round(Math.log10(job.received / 1024 + 1) * 24)));
      job.updatedAt = Date.now();
    }

    const raw = Buffer.concat(chunks);
    const expectedPatchHash = String(job.sha256 || '').trim().toLowerCase();
    if (expectedPatchHash && sha256Hex(raw) !== expectedPatchHash) throw new Error('PATCH_PACKAGE_HASH_MISMATCH');
    const patch = normalizePatchPayload(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')));
    job.version = patch.to;
    job.message = '正在应用快速补丁';
    job.progress = 88;
    job.updatedAt = Date.now();
    const changed = [];
    patch.files.forEach(file => changed.push(writePatchFile(job, file)));
    job.changedFiles = changed;
    job.status = 'ready';
    job.progress = 100;
    job.restartRequired = patch.restartRequired;
    job.message = patch.restartRequired ? '快速补丁已应用，重启后生效' : '快速补丁已应用';
    job.updatedAt = Date.now();
  } catch (e) {
    job.status = 'error';
    job.error = e.message || 'PATCH_APPLY_FAILED';
    job.message = '快速补丁失败，可改用完整安装包';
    job.updatedAt = Date.now();
  }
}
async function downloadPatchBufferFromCandidate(job, candidate, index, total) {
  ensureMirrorCanBeVerified(job, candidate);
  prepareUpdateJobAttempt(job, candidate, index, total);
  job.mode = 'patch';
  job.message = '正在下载快速补丁';
  job.progress = 0;
  job.updatedAt = Date.now();

  const resp = await fetchWithTimeout(candidate.url, {
    headers: { 'User-Agent': `Mineradio/${APP_VERSION}` },
  }, 12000);
  if (!resp.ok) throw updateError('HTTP_' + resp.status, 'HTTP ' + resp.status);

  job.total = parseInt(resp.headers.get('content-length') || '0', 10) || job.expectedSize || job.total || 0;
  job.received = 0;
  const chunks = [];
  const reader = resp.body.getReader();
  let speedWindowAt = Date.now();
  let speedWindowBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const buf = Buffer.from(chunk.value);
    job.received += buf.length;
    speedWindowBytes += buf.length;
    if (job.received > PATCH_MAX_BYTES) throw updateError('PATCH_TOO_LARGE', 'Patch package is too large');
    chunks.push(buf);
    const now = Date.now();
    if (now - speedWindowAt >= 700) {
      job.speedBps = Math.round(speedWindowBytes / Math.max(0.001, (now - speedWindowAt) / 1000));
      speedWindowAt = now;
      speedWindowBytes = 0;
    }
    job.progress = job.total > 0
      ? Math.max(1, Math.min(84, Math.round((job.received / job.total) * 84)))
      : Math.max(1, Math.min(76, Math.round(Math.log10(job.received / 1024 + 1) * 24)));
    job.etaSeconds = job.total > 0 && job.speedBps > 0 ? Math.max(0, Math.round((job.total - job.received) / job.speedBps)) : 0;
    job.updatedAt = Date.now();
  }
  const raw = Buffer.concat(chunks);
  verifyUpdateBuffer(raw, job);
  return raw;
}
async function downloadAndApplyPatchWithMirrors(job) {
  const candidates = Array.isArray(job.downloadCandidates) && job.downloadCandidates.length
    ? job.downloadCandidates
    : uniqueDownloadCandidates(job.downloadUrl || '');
  const failures = [];
  fs.mkdirSync(UPDATE_DOWNLOAD_DIR, { recursive: true });
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      const raw = await downloadPatchBufferFromCandidate(job, candidate, i, candidates.length);
      const patch = normalizePatchPayload(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')));
      job.version = patch.to;
      job.message = '正在应用快速补丁';
      job.progress = 88;
      job.etaSeconds = 0;
      job.updatedAt = Date.now();
      const changed = [];
      patch.files.forEach(file => changed.push(writePatchFile(job, file)));
      job.changedFiles = changed;
      job.status = 'ready';
      job.progress = 100;
      job.restartRequired = patch.restartRequired;
      job.message = patch.restartRequired ? '快速补丁已应用，重启后生效' : '快速补丁已应用';
      job.updatedAt = Date.now();
      return;
    } catch (err) {
      const info = classifyUpdateError(err);
      failures.push({ source: candidate.label || '下载线路', reason: info.reason, detail: info.detail });
      job.failedAttempts = failures.slice(-6);
      job.message = i < candidates.length - 1 ? ((candidate.label || '当前线路') + '失败，正在切换线路') : info.reason;
      job.updatedAt = Date.now();
      if (i >= candidates.length - 1) setUpdateJobError(job, err, '快速补丁失败：' + info.reason);
    }
  }
}
function startUpdatePatchJob(info) {
  const release = info && info.release ? info.release : {};
  const patch = release.patch || {};
  const downloadUrl = patch.downloadUrl || '';
  if (!info || !info.configured) return { ok: false, error: 'UPDATE_REPOSITORY_NOT_CONFIGURED' };
  if (!info.updateAvailable) return { ok: false, error: 'NO_UPDATE_AVAILABLE' };
  if (!release.patchAvailable || !/^https?:\/\//i.test(downloadUrl)) return { ok: false, error: 'PATCH_ASSET_MISSING' };

  const version = info.latestVersion || release.version || patch.to || '';
  const existing = Array.from(updateDownloadJobs.values())
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .find(job => job.mode === 'patch' && job.version === version && (job.status === 'queued' || job.status === 'downloading' || job.status === 'ready'));
  if (existing) return publicUpdateJob(existing);

  const now = Date.now();
  const downloadCandidates = uniqueDownloadCandidates([downloadUrl].concat(Array.isArray(patch.downloadUrls) ? patch.downloadUrls : []));
  const job = {
    id: 'patch-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    status: 'queued',
    progress: 0,
    received: 0,
    total: patch.size || 0,
    mode: 'patch',
    fileName: patch.name || safeUpdateFileName('', version).replace(/\.exe$/i, '.patch.json'),
    filePath: '',
    version,
    downloadUrl,
    downloadCandidates,
    releaseUrl: release.htmlUrl || '',
    expectedSize: patch.size || 0,
    sha256: normalizeDigest(patch.sha256 || '', 'sha256').toLowerCase(),
    sha512: normalizeDigest(patch.sha512 || '', 'sha512'),
    restartRequired: true,
    sourceLabel: '',
    attempt: 0,
    attempts: downloadCandidates.length,
    failedAttempts: [],
    message: '等待下载快速补丁',
    createdAt: now,
    updatedAt: now,
    error: '',
  };
  updateDownloadJobs.set(job.id, job);
  trimUpdateJobs();
  downloadAndApplyPatchWithMirrors(job);
  return publicUpdateJob(job);
}
function readRequestBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch (e) {
        const params = new URLSearchParams(raw);
        const out = {};
        params.forEach((v, k) => { out[k] = v; });
        resolve(out);
      }
    });
    req.on('error', () => resolve({}));
  });
}
function normalizeApiCode(payload) {
  const body = payload && (payload.body || payload);
  return Number((body && body.code) || (body && body.body && body.body.code) || (payload && payload.status) || 0);
}
function normalizeApiMessage(payload) {
  const body = payload && (payload.body || payload);
  return (body && (body.message || body.msg || body.error)) || (body && body.body && (body.body.message || body.body.msg || body.body.error)) || '';
}
function parseCookieString(cookieText) {
  const out = {};
  String(cookieText || '').split(';').forEach(part => {
    const raw = String(part || '').trim();
    if (!raw) return;
    const idx = raw.indexOf('=');
    if (idx <= 0) return;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}
function serializeCookieObject(obj) {
  return Object.keys(obj || {})
    .filter(k => obj[k] != null && String(obj[k]) !== '')
    .map(k => k + '=' + String(obj[k]))
    .join('; ');
}
function qqCookieObject() {
  return parseCookieString(qqCookie);
}
function normalizeQQUin(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
}
function qqCookieUin(obj) {
  obj = obj || qqCookieObject();
  const raw = Number(obj.login_type) === 2 ? (obj.wxuin || obj.uin || obj.p_uin) : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin);
  return normalizeQQUin(raw);
}
function qqCookieMusicKey(obj) {
  obj = obj || qqCookieObject();
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
    obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || '';
}
function qqCookiePlaybackKey(obj) {
  obj = obj || qqCookieObject();
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || '';
}
function decodeQQCookieValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidates = [raw];
  if (/^(?:[0-9a-fA-F]{2}){2,}$/.test(raw)) {
    try {
      const decodedHex = Buffer.from(raw, 'hex').toString('utf8').trim();
      if (decodedHex && /[^\x20-\x7e]/.test(decodedHex)) candidates.push(decodedHex);
    } catch (e) {}
  }
  const plusSafe = raw.replace(/\+/g, '%20');
  try { candidates.push(decodeURIComponent(plusSafe).trim()); } catch (e) {}
  const percentBytes = [];
  let hasPercentBytes = false;
  for (let i = 0; i < plusSafe.length; i += 1) {
    const ch = plusSafe[i];
    const hex = plusSafe.slice(i + 1, i + 3);
    if (ch === '%' && /^[0-9a-fA-F]{2}$/.test(hex)) {
      percentBytes.push(parseInt(hex, 16));
      hasPercentBytes = true;
      i += 2;
    } else {
      const text = ch === '+' ? ' ' : ch;
      for (const byte of Buffer.from(text, 'utf8')) percentBytes.push(byte);
    }
  }
  if (hasPercentBytes && percentBytes.length) {
    const buf = Buffer.from(percentBytes);
    try { candidates.push(new TextDecoder('gb18030').decode(buf).trim()); } catch (e) {}
    try { candidates.push(buf.toString('utf8').trim()); } catch (e) {}
  }
  for (const item of candidates.slice()) {
    if (!item) continue;
    if (/\\u[0-9a-fA-F]{4}/.test(item)) {
      try { candidates.push(JSON.parse('"' + item.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\\\\u/g, '\\u') + '"').trim()); } catch (e) {}
    }
    if (/[ÃÂ]|[\u00c0-\u00ff][\u0080-\u00bf]/.test(item)) {
      try { candidates.push(Buffer.from(item, 'latin1').toString('utf8').trim()); } catch (e) {}
    }
  }
  function score(text) {
    text = String(text || '').trim();
    if (!text) return 1e9;
    let s = 0;
    s += (text.match(/\uFFFD/g) || []).length * 80;
    s += (text.match(/%[0-9a-fA-F]{2}/g) || []).length * 10;
    s += (text.match(/\\u[0-9a-fA-F]{4}/g) || []).length * 8;
    s += (text.match(/[ÃÂ]/g) || []).length * 34;
    s += (text.match(/[\u0080-\u009f]/g) || []).length * 42;
    s += (text.match(/[\x00-\x08\x0e-\x1f\x7f]/g) || []).length * 50;
    s -= (text.match(/[\u4e00-\u9fff]/g) || []).length * 2;
    return s + Math.min(text.length, 80) * 0.02;
  }
  return candidates
    .filter(Boolean)
    .sort((a, b) => score(a) - score(b))[0]
    .trim();
}
function qqCookieNickname(obj, uin) {
  obj = obj || qqCookieObject();
  uin = normalizeQQUin(uin || qqCookieUin(obj));
  const padded = uin ? '0' + uin : '';
  const keys = [
    uin && ('ptnick_' + uin),
    padded && ('ptnick_' + padded),
    'ptnick',
    'nick',
    'nickname',
    'qq_nickname'
  ].filter(Boolean);
  for (const key of keys) {
    if (obj[key]) {
      const nick = decodeQQCookieValue(obj[key]);
      if (nick) return nick;
    }
  }
  const ptnickKey = Object.keys(obj).find(key => /^ptnick_/i.test(key) && obj[key]);
  return ptnickKey ? decodeQQCookieValue(obj[ptnickKey]) : '';
}
function qqCookieAvatar(obj, uin) {
  obj = obj || qqCookieObject();
  const direct = obj.qqmusic_avatar || obj.avatar || obj.avatarUrl || obj.headpic || '';
  if (direct) return decodeQQCookieValue(direct);
  uin = normalizeQQUin(uin || qqCookieUin(obj));
  return uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100` : '';
}
function normalizeQQCookieInput(cookieText) {
  const obj = parseCookieString(cookieText);
  if (Number(obj.login_type) === 2 && obj.wxuin && !obj.uin) obj.uin = obj.wxuin;
  if (!obj.uin && (obj.qqmusic_uin || obj.p_uin)) obj.uin = obj.qqmusic_uin || obj.p_uin;
  if (obj.uin) obj.uin = normalizeQQUin(obj.uin);
  return serializeCookieObject(obj);
}
function playbackRestriction(provider, category, message, action, extra) {
  return {
    provider,
    category,
    action: action || '',
    message,
    ...(extra || {}),
  };
}
function classifyNeteasePlaybackRestriction(lastData, loginInfo) {
  const loggedIn = !!(loginInfo && loginInfo.loggedIn);
  const fee = Number(lastData && lastData.fee);
  const code = Number(lastData && lastData.code);
  const freeTrial = lastData && lastData.freeTrialInfo;
  if (!loggedIn) {
    return playbackRestriction('netease', 'login_required', '网易云需要登录后尝试获取完整播放地址', 'login', { code, fee });
  }
  if (freeTrial) {
    return playbackRestriction('netease', 'trial_only', '网易云仅返回试听片段，完整播放需要会员或购买', 'upgrade', { code, fee });
  }
  if (fee === 1) {
    return playbackRestriction('netease', 'vip_required', '网易云歌曲需要 VIP 权限，当前无法获取完整播放地址', 'upgrade', { code, fee });
  }
  if (fee === 4 || fee === 8) {
    return playbackRestriction('netease', 'paid_required', '网易云歌曲需要单曲、专辑购买或更高权限', 'purchase', { code, fee });
  }
  if (code === 404 || code === 403) {
    return playbackRestriction('netease', 'copyright_unavailable', '网易云版权暂不可播，换源或稍后重试会更稳', 'switch_source', { code, fee });
  }
  return playbackRestriction('netease', 'url_unavailable', '网易云没有返回可播放地址，可能是版权、会员或地区限制', loggedIn ? 'switch_source' : 'login', { code, fee });
}
function classifyQQPlaybackRestriction(info, session) {
  const hasSession = typeof session === 'object' ? !!session.hasSession : !!session;
  const hasPlaybackKey = typeof session === 'object' ? !!session.hasPlaybackKey : hasSession;
  const rawMsg = String((info && (info.msg || info.tips || info.errmsg || info.message)) || '').trim();
  const code = Number((info && (info.result || info.code || info.errtype)) || 0);
  const lower = rawMsg.toLowerCase();
  if (!hasSession) {
    return playbackRestriction('qq', 'login_required', 'QQ 音乐需要登录或授权后才能获取播放地址', 'login', { code, rawMessage: rawMsg });
  }
  if (!hasPlaybackKey && code === 104003) {
    return playbackRestriction('qq', 'login_required', 'QQ 音乐当前只拿到了网页登录状态，还缺少播放授权，请重新打开官方 QQ 音乐登录窗口完成授权', 'login', { code, rawMessage: rawMsg, missingPlaybackKey: true });
  }
  if (code === 104003) {
    return playbackRestriction('qq', 'copyright_unavailable', 'QQ 音乐没有给当前版本返回播放地址，通常是版权、会员或官方版本限制，可以换一个搜索结果或切到网易云源', 'switch_source', { code, rawMessage: rawMsg });
  }
  if (/vip|会员|付费|购买|数字专辑|专辑|pay/.test(lower + rawMsg)) {
    return playbackRestriction('qq', 'paid_required', 'QQ 音乐歌曲需要会员、购买或数字专辑权限', 'upgrade', { code, rawMessage: rawMsg });
  }
  if (code && code !== 0) {
    return playbackRestriction('qq', 'copyright_unavailable', rawMsg || 'QQ 音乐版权暂不可播或仅官方客户端可播', 'switch_source', { code, rawMessage: rawMsg });
  }
  return playbackRestriction('qq', 'url_unavailable', 'QQ 音乐没有返回播放地址，可能受版权、会员或官方客户端限制', 'switch_source', { code, rawMessage: rawMsg });
}
const NETEASE_QUALITY_CANDIDATES = [
  { level: 'jymaster', br: 1999000, label: '超清母带', svip: true },
  { level: 'hires',    br: 1999000, label: '高清臻音' },
  { level: 'lossless', br: 1411000, label: '无损' },
  { level: 'exhigh',   br: 999000,  label: '极高' },
  { level: 'standard', br: 128000,  label: '标准' },
];
const QQ_QUALITY_CANDIDATE_TEMPLATES = [
  { prefix: 'RS01', ext: '.flac', level: 'hires', label: 'Hi-Res FLAC' },
  { prefix: 'F000', ext: '.flac', level: 'lossless', label: '无损 FLAC' },
  { prefix: 'M800', ext: '.mp3', level: 'exhigh', label: '320k MP3' },
  { prefix: 'M500', ext: '.mp3', level: 'standard', label: '128k MP3' },
  { prefix: 'C400', ext: '.m4a', level: 'aac', label: 'AAC/M4A' },
];
function normalizeQualityPreference(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (['jymaster', 'master', 'studio', 'svip'].includes(raw)) return 'jymaster';
  if (['hires', 'hi-res', 'highres', 'zhenyin', 'spatial'].includes(raw)) return 'hires';
  if (['lossless', 'flac', 'sq'].includes(raw)) return 'lossless';
  if (['exhigh', 'high', '320', '320k', 'hq'].includes(raw)) return 'exhigh';
  if (['standard', 'normal', '128', '128k', 'std'].includes(raw)) return 'standard';
  return 'hires';
}
function qualityCandidatesFrom(target, candidates) {
  target = normalizeQualityPreference(target);
  let start = candidates.findIndex(item => item.level === target);
  if (start < 0) start = 0;
  return candidates.slice(start);
}
function hasNeteaseSvip(loginInfo) {
  return !!(loginInfo && loginInfo.loggedIn && (loginInfo.vipLevel === 'svip' || loginInfo.isSvip));
}
function mapArtists(raw) {
  return (raw || [])
    .map(a => ({ id: a && a.id, name: (a && a.name) || '' }))
    .filter(a => a.name);
}
function mapSongRecord(s) {
  s = s || {};
  const artists = mapArtists(s.ar || s.artists);
  const album = s.al || s.album || {};
  return {
    provider: 'netease',
    source: 'netease',
    type: 'song',
    id: s.id,
    name: s.name,
    artist: artists.map(a => a.name).join(' / '),
    artists,
    artistId: artists[0] && artists[0].id,
    album: album.name || '',
    albumId: album.id || '',
    cover: album.picUrl || album.coverUrl || '',
    duration: s.dt || s.duration || 0,
    popularity: Number(s.pop || s.popularity || s.score || s.hotScore || 0) || 0,
    searchRank: Number(s.rank || 0) || 0,
    fee: s.fee,
  };
}
function mapDiscoverPlaylist(pl, tag) {
  pl = pl || {};
  const creator = pl.creator || pl.user || {};
  const id = pl.id || pl.resourceId || pl.creativeId;
  return {
    provider: 'netease',
    source: 'netease',
    type: 'playlist',
    id,
    name: pl.name || pl.title || '',
    cover: pl.picUrl || pl.coverImgUrl || pl.coverUrl || pl.uiElement && pl.uiElement.image && pl.uiElement.image.imageUrl || '',
    trackCount: pl.trackCount || pl.songCount || pl.programCount || 0,
    playCount: pl.playCount || pl.playcount || 0,
    creator: creator.nickname || creator.name || '',
    tag: tag || pl.alg || '',
  };
}

function lowSignalText(value) {
  return String(value || '').trim().toLowerCase();
}

function isLowSignalPodcastItem(item) {
  const name = lowSignalText(item && (item.name || item.title || item.radioName));
  const sub = lowSignalText(item && (item.djName || item.category || item.desc || item.sub));
  const text = name + ' ' + sub;
  return /购买播客|付费精品|qzone|空间背景音乐|背景音乐|四只烤翅|试纸烤翅/i.test(text);
}

const QQ_LIKED_PLAYLIST_ID = 'liked';
const QQ_LIKED_DIRID = 201;
const QQ_LIKED_PLAYLIST_NAME = 'QQ 音乐·我的喜欢';
const QQ_LIKED_PLAYLIST_COVER = 'https://y.gtimg.cn/mediastyle/global/img/cover_like.png';
const QQ_LIKED_AUTH_MESSAGE = 'QQ 音乐“我的喜欢”需要完整 QQ 音乐授权。请重新打开官方 QQ 音乐登录窗口，等待进入播放器页后再关闭。';

function isQQLikedPlaylistId(id) {
  const value = String(id || '').trim().toLowerCase();
  return value === QQ_LIKED_PLAYLIST_ID || value === 'qq-liked' || value === String(QQ_LIKED_DIRID);
}

function isQQFavoritePlaylist(pl) {
  if (pl && (isQQLikedPlaylistId(pl.id) || Number(pl.dirid || 0) === QQ_LIKED_DIRID)) return true;
  const name = String(pl && pl.name || pl && pl.diss_name || '').trim();
  return /我喜欢|我的喜欢|喜欢的音乐/i.test(name);
}

function isQzoneBackgroundPlaylist(pl) {
  const text = String((pl && pl.name || '') + ' ' + (pl && pl.creator || '')).toLowerCase();
  return /qzone|空间|背景音乐/i.test(text);
}
async function requireLogin(res) {
  const info = await getLoginInfo();
  if (!info.loggedIn || !info.userId) {
    sendJSON(res, { error: 'LOGIN_REQUIRED', loggedIn: false }, 401);
    return null;
  }
  return info;
}

// ---------- 业务: 搜索 ----------
//   优先用 cloudsearch (新接口, 字段更全, picUrl 更稳定)
//   对于仍然缺失封面的歌曲, 用 song_detail 批量补齐
async function handleSearch(keywords, limit) {
  console.log('[Search]', keywords, 'limit:', limit);
  const result = await cloudsearch({ keywords, limit, cookie: userCookie });
  const songs = result.body && result.body.result && result.body.result.songs ? result.body.result.songs : [];

  let mapped = songs.map(s => {
    return mapSongRecord(s);
  });

  // 兜底: 补齐缺失的封面
  const missing = mapped.filter(s => !s.cover).map(s => s.id);
  if (missing.length) {
    try {
      console.log('[Search] backfilling covers for', missing.length, 'songs');
      const dd = await song_detail({ ids: missing.join(','), cookie: userCookie });
      const songsArr = (dd.body && dd.body.songs) || [];
      const idToPic = {};
      songsArr.forEach(s => {
        const pic = (s.al && s.al.picUrl) || (s.album && s.album.picUrl) || '';
        if (pic) idToPic[s.id] = pic;
      });
      mapped = mapped.map(s => s.cover ? s : { ...s, cover: idToPic[s.id] || '' });
    } catch (e) { console.warn('[Search] backfill failed:', e.message); }
  }

  return mapped;
}

async function handleNeteaseAlbumDetail(id, limit) {
  const albumId = String(id || '').trim();
  const num = Math.max(10, Math.min(120, parseInt(limit || '80', 10) || 80));
  if (!albumId) return { provider: 'netease', error: 'MISSING_ALBUM_ID', album: null, songs: [] };
  const result = await album({ id: albumId, cookie: userCookie, timestamp: Date.now() });
  const body = result.body || result || {};
  const info = body.album || body.data && (body.data.album || body.data) || {};
  const rawSongs = Array.isArray(body.songs) ? body.songs : (Array.isArray(info.songs) ? info.songs : []);
  const artists = mapArtists(info.artists || info.ar || []);
  const songs = rawSongs
    .slice(0, num)
    .map(song => mapSongRecord(song))
    .filter(song => song && song.id);
  return {
    provider: 'netease',
    album: {
      provider: 'netease',
      id: info.id || albumId,
      albumId: info.id || albumId,
      name: info.name || '',
      artist: artists.map(a => a.name).join(' / ') || info.artist && info.artist.name || (songs[0] && songs[0].artist) || '',
      artists,
      cover: info.picUrl || info.coverUrl || '',
      releaseDate: info.publishTime || info.publishTime === 0 ? info.publishTime : '',
      trackCount: Number(info.size || info.trackCount || rawSongs.length) || songs.length,
    },
    songs,
    total: Number(info.size || info.trackCount || rawSongs.length) || songs.length,
  };
}

async function handleDiscoverHome() {
  const info = await getLoginInfo();
  const loggedIn = !!(info && info.loggedIn);
  if (!loggedIn) {
    // 网易云未登录:尝试 QQ 登录态的真实推荐(每日30首 + 猜你喜欢电台)
    try {
      const qqInfo = await getQQLoginInfo();
      if (qqInfo && qqInfo.loggedIn) {
        const [daily, radio] = await Promise.allSettled([handleQQDailySongs(), handleQQPersonalRadio(15)]);
        const dailySongs = daily.status === 'fulfilled' && Array.isArray(daily.value.songs) ? daily.value.songs : [];
        const personalFm = radio.status === 'fulfilled' && Array.isArray(radio.value.songs) ? radio.value.songs : [];
        return {
          loggedIn: true,
          user: { userId: qqInfo.userId, nickname: qqInfo.nickname || '', avatar: qqInfo.avatar || '' },
          dailySongs,
          personalFm,
          dailyName: daily.status === 'fulfilled' ? (daily.value.name || '') : '',
          playlists: [],
          podcasts: [],
          mode: 'qq',
          updatedAt: Date.now(),
        };
      }
    } catch (e) { console.warn('[DiscoverHome] qq fallback failed:', e.message); }
    return {
      loggedIn: false,
      user: null,
      dailySongs: [],
      personalFm: [],
      playlists: [],
      podcasts: [],
      mode: 'starter',
      updatedAt: Date.now(),
    };
  }
  const tasks = [
    personalized({ limit: 8, cookie: userCookie, timestamp: Date.now() }),
    dj_hot({ limit: 6, offset: 0, cookie: userCookie, timestamp: Date.now() }),
    recommend_resource({ cookie: userCookie, timestamp: Date.now() }),
    recommend_songs({ cookie: userCookie, timestamp: Date.now() }),
    personal_fm({ cookie: userCookie, timestamp: Date.now() }),
  ];
  const result = await Promise.allSettled(tasks);

  const personalizedBody = result[0].status === 'fulfilled' && result[0].value && result[0].value.body || {};
  const publicPlaylists = (personalizedBody.result || personalizedBody.data || [])
    .map(pl => mapDiscoverPlaylist(pl, '推荐歌单'))
    .filter(pl => pl.id && pl.name)
    .slice(0, 8);

  const podcastBody = result[1].status === 'fulfilled' && result[1].value && result[1].value.body || {};
  const podcastRaw = podcastBody.djRadios || podcastBody.djradios || podcastBody.radios || podcastBody.data || [];
  const podcasts = (Array.isArray(podcastRaw) ? podcastRaw : [])
    .map(mapPodcastRadio)
    .filter(p => p.id && !isLowSignalPodcastItem(p))
    .slice(0, 6);

  let privatePlaylists = [];
  if (result[2].status === 'fulfilled' && result[2].value) {
    const body = result[2].value.body || {};
    const raw = body.recommend || body.data || [];
    privatePlaylists = (Array.isArray(raw) ? raw : [])
      .map(pl => mapDiscoverPlaylist(pl, '私人推荐'))
      .filter(pl => pl.id && pl.name)
      .slice(0, 6);
  }

  let dailySongs = [];
  if (result[3].status === 'fulfilled' && result[3].value) {
    const body = result[3].value.body || {};
    const raw = body.data && (body.data.dailySongs || body.data.recommend) || body.recommend || [];
    dailySongs = (Array.isArray(raw) ? raw : [])
      .map(mapSongRecord)
      .filter(song => song.id && song.name)
      .slice(0, 12);
  }

  // 私人 FM(私人雷达)——网易云官方私人电台,单独于每日推荐
  let personalFm = [];
  if (result[4].status === 'fulfilled' && result[4].value) {
    const body = result[4].value.body || {};
    const raw = body.data || body.result || [];
    personalFm = (Array.isArray(raw) ? raw : [])
      .map(mapSongRecord)
      .filter(song => song.id && song.name)
      .slice(0, 12);
  }

  return {
    loggedIn,
    user: loggedIn ? { userId: info.userId, nickname: info.nickname || '', avatar: info.avatar || '' } : null,
    dailySongs,
    personalFm,
    playlists: privatePlaylists.concat(publicPlaylists).slice(0, 10),
    podcasts,
    updatedAt: Date.now(),
  };
}

const QQ_MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const QQ_SMARTBOX_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg';
const QQ_HEADERS = {
  Referer: 'https://y.qq.com/',
  'User-Agent': UA,
};
const QQ_VIP_INFO_CACHE_TTL_MS = 2 * 60 * 1000;
const qqVipInfoCache = new Map();

function requestText(targetUrl, opts, body) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 400) {
          const err = new Error('HTTP ' + response.statusCode);
          err.statusCode = response.statusCode;
          err.body = text;
          reject(err);
          return;
        }
        resolve(text);
      });
    });
    req.setTimeout(opts.timeoutMs || 10000, () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function requestJson(targetUrl, opts, body) {
  const text = await requestText(targetUrl, opts, body);
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error('Invalid JSON from ' + targetUrl);
    err.cause = e;
    throw err;
  }
}

function clampNumber(value, min, max, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function openMeteoWeatherLabel(code) {
  code = Number(code);
  if (code === 0) return '晴';
  if (code === 1 || code === 2) return '少云';
  if (code === 3) return '阴';
  if (code === 45 || code === 48) return '雾';
  if (code === 51 || code === 53 || code === 55) return '毛毛雨';
  if (code === 56 || code === 57) return '冻雨';
  if (code === 61 || code === 63 || code === 65) return '雨';
  if (code === 66 || code === 67) return '冻雨';
  if (code === 71 || code === 73 || code === 75 || code === 77) return '雪';
  if (code === 80 || code === 81 || code === 82) return '阵雨';
  if (code === 85 || code === 86) return '阵雪';
  if (code === 95 || code === 96 || code === 99) return '雷雨';
  return '天气';
}

function buildWeatherMood(weather, date) {
  const now = date || new Date();
  const hour = now.getHours();
  const code = Number(weather && weather.weatherCode);
  const temp = Number(weather && weather.temperature);
  const apparent = Number(weather && weather.apparentTemperature);
  const rain = Number(weather && weather.precipitation) || 0;
  const humidity = Number(weather && weather.humidity) || 0;
  const wind = Number(weather && weather.windSpeed) || 0;
  const isNight = weather && weather.isDay === 0 || hour < 6 || hour >= 20;
  const isMorning = hour >= 5 && hour < 11;
  const isDusk = hour >= 17 && hour < 20;
  const isRain = rain > 0 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const isSnow = [71, 73, 75, 77, 85, 86].includes(code);
  const isCloud = [2, 3, 45, 48].includes(code);
  const isStorm = [95, 96, 99].includes(code);
  const feels = Number.isFinite(apparent) ? apparent : temp;

  let mood = {
    key: 'clear',
    title: '晴朗电台',
    tagline: '让节奏亮一点，像窗边的光',
    energy: 0.62,
    warmth: 0.58,
    focus: 0.48,
    melancholy: 0.24,
    keywords: ['轻快 华语', 'city pop', 'indie pop', 'chill pop', '阳光 歌单'],
  };
  if (isStorm) {
    mood = {
      key: 'storm',
      title: '雷雨电台',
      tagline: '低频更厚，适合把世界关小一点',
      energy: 0.46,
      warmth: 0.34,
      focus: 0.66,
      melancholy: 0.62,
      keywords: ['暗色 R&B', 'trip hop', '夜晚 电子', '氛围 摇滚', '雨夜 歌单'],
    };
  } else if (isRain) {
    mood = {
      key: 'rain',
      title: '雨天电台',
      tagline: '留一点潮湿的空间给旋律',
      energy: 0.38,
      warmth: 0.42,
      focus: 0.64,
      melancholy: 0.66,
      keywords: ['雨天 R&B', 'lofi rainy', '华语 慢歌', 'dream pop', '雨夜 歌单'],
    };
  } else if (isSnow || feels <= 3) {
    mood = {
      key: 'snow',
      title: '冷空气电台',
      tagline: '干净、慢速、带一点冬天的颗粒感',
      energy: 0.34,
      warmth: 0.28,
      focus: 0.72,
      melancholy: 0.54,
      keywords: ['冬天 民谣', 'ambient piano', '日系 冬天', 'indie folk', '安静 歌单'],
    };
  } else if (feels >= 31 || humidity >= 78) {
    mood = {
      key: 'humid',
      title: '闷热电台',
      tagline: '降低密度，留出一点呼吸',
      energy: 0.48,
      warmth: 0.76,
      focus: 0.46,
      melancholy: 0.30,
      keywords: ['夏日 chill', 'bossa nova', 'city pop 夏天', '轻电子', '海边 歌单'],
    };
  } else if (isCloud) {
    mood = {
      key: 'cloudy',
      title: '阴天电台',
      tagline: '不急着明亮，先让声音变软',
      energy: 0.40,
      warmth: 0.46,
      focus: 0.58,
      melancholy: 0.52,
      keywords: ['阴天 华语', 'indie rock mellow', 'neo soul', 'chillhop', '独立 民谣'],
    };
  }

  if (isNight) {
    mood.key += '-night';
    mood.title = mood.key.startsWith('clear') ? '夜色电台' : mood.title.replace('电台', '夜听');
    mood.tagline = '音量放低一点，让夜色参与编曲';
    mood.energy = Math.min(mood.energy, 0.42);
    mood.focus = Math.max(mood.focus, 0.68);
    mood.melancholy = Math.max(mood.melancholy, 0.52);
    mood.keywords = ['夜晚 R&B', 'late night jazz', 'ambient', 'lofi sleep', '夜跑 歌单'].concat(mood.keywords.slice(0, 3));
  } else if (isMorning) {
    mood.title = mood.key.startsWith('rain') ? '雨晨电台' : '早晨电台';
    mood.energy = Math.max(mood.energy, 0.52);
    mood.keywords = ['早晨 通勤', 'morning acoustic', '清晨 indie', '轻快 华语'].concat(mood.keywords.slice(0, 3));
  } else if (isDusk) {
    mood.title = mood.key.startsWith('rain') ? '黄昏雨声' : '黄昏电台';
    mood.melancholy = Math.max(mood.melancholy, 0.48);
    mood.keywords = ['黄昏 city pop', '日落 歌单', '落日飞车', 'soul pop'].concat(mood.keywords.slice(0, 3));
  }

  if (wind >= 28) {
    mood.energy = Math.max(mood.energy, 0.56);
    mood.keywords = ['公路 摇滚', 'windy day playlist'].concat(mood.keywords.slice(0, 4));
  }
  mood.keywords = Array.from(new Set(mood.keywords)).slice(0, 7);
  return mood;
}

async function resolveOpenMeteoLocation(query) {
  const raw = String(query || '').trim();
  if (!raw) return WEATHER_DEFAULT_LOCATION;
  const u = new URL(OPEN_METEO_GEOCODE_URL);
  u.searchParams.set('name', raw);
  u.searchParams.set('count', '1');
  u.searchParams.set('language', 'zh');
  u.searchParams.set('format', 'json');
  const body = await requestJson(u.toString(), { headers: { 'User-Agent': UA } });
  const first = body && Array.isArray(body.results) && body.results[0];
  if (!first) return { ...WEATHER_DEFAULT_LOCATION, query: raw, fallback: true };
  return {
    name: first.name || raw,
    country: first.country || '',
    admin1: first.admin1 || '',
    latitude: first.latitude,
    longitude: first.longitude,
    timezone: first.timezone || 'auto',
  };
}

async function fetchOpenMeteoWeather(params) {
  params = params || {};
  let location;
  const lat = clampNumber(params.lat, -90, 90, NaN);
  const lon = clampNumber(params.lon, -180, 180, NaN);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    location = {
      name: String(params.city || params.name || '当前位置').trim() || '当前位置',
      country: '',
      latitude: lat,
      longitude: lon,
      timezone: params.timezone || 'auto',
    };
  } else {
    location = await resolveOpenMeteoLocation(params.city || params.q || params.location);
  }
  const u = new URL(OPEN_METEO_FORECAST_URL);
  u.searchParams.set('latitude', String(location.latitude));
  u.searchParams.set('longitude', String(location.longitude));
  u.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m');
  u.searchParams.set('hourly', 'precipitation_probability,weather_code,temperature_2m');
  u.searchParams.set('forecast_days', '1');
  u.searchParams.set('timezone', location.timezone || 'auto');
  const body = await requestJson(u.toString(), { headers: { 'User-Agent': UA } });
  const cur = body && body.current || {};
  const weather = {
    provider: 'open-meteo',
    location: {
      name: location.name,
      country: location.country || '',
      admin1: location.admin1 || '',
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: body.timezone || location.timezone || '',
      fallback: !!location.fallback,
    },
    label: openMeteoWeatherLabel(cur.weather_code),
    weatherCode: Number(cur.weather_code),
    temperature: Number(cur.temperature_2m),
    apparentTemperature: Number(cur.apparent_temperature),
    humidity: Number(cur.relative_humidity_2m),
    precipitation: Number(cur.precipitation || cur.rain || cur.showers || cur.snowfall || 0),
    cloudCover: Number(cur.cloud_cover),
    windSpeed: Number(cur.wind_speed_10m),
    windGusts: Number(cur.wind_gusts_10m),
    isDay: Number(cur.is_day),
    time: cur.time || '',
    updatedAt: Date.now(),
  };
  weather.mood = buildWeatherMood(weather);
  return weather;
}

async function fetchIpWeatherLocation() {
  const u = new URL(WEATHER_IP_LOCATION_URL);
  u.searchParams.set('fields', 'status,message,country,regionName,city,lat,lon,timezone,query');
  u.searchParams.set('lang', 'zh-CN');
  const body = await requestJson(u.toString(), { headers: { 'User-Agent': UA } });
  if (!body || body.status !== 'success' || !Number.isFinite(Number(body.lat)) || !Number.isFinite(Number(body.lon))) {
    const err = new Error(body && body.message || 'IP_LOCATION_FAILED');
    err.body = body;
    throw err;
  }
  return {
    provider: 'ip-api',
    city: body.city || WEATHER_DEFAULT_LOCATION.name,
    region: body.regionName || '',
    country: body.country || '',
    latitude: Number(body.lat),
    longitude: Number(body.lon),
    timezone: body.timezone || 'auto',
    ip: body.query || '',
  };
}

function weatherRadioSeedQueries(mood) {
  const key = String(mood && mood.key || '');
  if (key.includes('rain') || key.includes('storm')) return ['陈奕迅 阴天快乐', '周杰伦 雨下一整晚', '孙燕姿 遇见', '林宥嘉 说谎', '毛不易 消愁'];
  if (key.includes('snow') || key.includes('cloudy')) return ['陈奕迅 好久不见', '莫文蔚 阴天', '李健 贝加尔湖畔', '朴树 平凡之路', '蔡健雅 达尔文'];
  if (key.includes('humid')) return ['落日飞车 My Jinji', '告五人 爱人错过', '夏日入侵企画 想去海边', '陈绮贞 旅行的意义', '王若琳 Lost in Paradise'];
  if (key.includes('night')) return ['方大同 特别的人', '陶喆 爱很简单', 'Frank Ocean Pink + White', '林忆莲 夜太黑', "Norah Jones Don't Know Why"];
  return ['孙燕姿 天黑黑', '周杰伦 晴天', '五月天 温柔', '陈奕迅 稳稳的幸福', '王菲'];
}

function fallbackWeatherForRadio(params, err) {
  params = params || {};
  const name = String(params.city || params.q || params.location || WEATHER_DEFAULT_LOCATION.name).trim() || WEATHER_DEFAULT_LOCATION.name;
  return {
    provider: 'open-meteo',
    location: {
      name,
      country: '',
      admin1: '',
      latitude: null,
      longitude: null,
      timezone: params.timezone || WEATHER_DEFAULT_LOCATION.timezone,
      fallback: true,
    },
    label: '天气暂不可用',
    weatherCode: null,
    temperature: null,
    apparentTemperature: null,
    humidity: null,
    precipitation: null,
    cloudCover: null,
    windSpeed: null,
    windGusts: null,
    isDay: null,
    time: '',
    updatedAt: Date.now(),
    error: err && err.message || '',
    mood: {
      key: 'fallback',
      title: '临时电台',
      tagline: '天气暂时没有回来，先放一组稳妥的歌',
      energy: 0.54,
      warmth: 0.55,
      focus: 0.55,
      melancholy: 0.35,
      keywords: ['华语 流行', 'indie pop', 'city pop', '轻快 歌单', 'chill pop'],
    },
  };
}

function uniqueSongsByKey(songs) {
  const seen = new Set();
  const out = [];
  (songs || []).forEach(song => {
    const key = String(song && (song.id || song.name + '|' + song.artist) || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(song);
  });
  return out;
}

function tagWeatherPoolSongs(songs, source) {
  return (songs || []).map(song => ({ ...song, weatherSource: source }));
}

async function fetchWeatherPlaylistSongs(playlist, limit) {
  const id = playlist && playlist.id;
  if (!id) return [];
  let rawTracks = [];
  try {
    if (typeof playlist_track_all === 'function') {
      const all = await playlist_track_all({ id, limit: limit || 36, offset: 0, cookie: userCookie, timestamp: Date.now() });
      rawTracks = (all.body && (all.body.songs || all.body.tracks)) || [];
    }
  } catch (e) {
    console.warn('[WeatherRadio] playlist_track_all failed:', playlist && playlist.name, e.message);
  }
  if (!rawTracks.length && typeof playlist_detail === 'function') {
    try {
      const detail = await playlist_detail({ id, s: 0, cookie: userCookie, timestamp: Date.now() });
      const pl = (detail.body && detail.body.playlist) || {};
      rawTracks = pl.tracks || [];
    } catch (e) {
      console.warn('[WeatherRadio] playlist_detail failed:', playlist && playlist.name, e.message);
    }
  }
  return rawTracks.map(mapSongRecord).filter(song => song.id && song.name).slice(0, limit || 36);
}

const NETEASE_PLAYLIST_SYNC_PAGE_SIZE = 200;
const NETEASE_PLAYLIST_SYNC_MAX_PAGES = 80;
const NETEASE_TRACK_SYNC_PAGE_SIZE = 500;
const NETEASE_TRACK_SYNC_MAX_PAGES = 80;

function mapNeteasePlaylistMeta(pl, fallbackId) {
  pl = pl || {};
  return {
    id: pl.id || fallbackId,
    name: pl.name || '',
    cover: pl.coverImgUrl || pl.cover || '',
    trackCount: pl.trackCount || pl.track_count || 0,
    playCount: pl.playCount || pl.play_count || 0,
    creator: (pl.creator && pl.creator.nickname) || pl.creatorNickname || '',
    subscribed: !!pl.subscribed,
    specialType: pl.specialType || 0,
  };
}

function mergeUniqueNeteasePlaylists(target, incoming, seen) {
  (incoming || []).forEach(pl => {
    const id = String(pl && pl.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    target.push(pl);
  });
}

async function fetchAllNeteaseUserPlaylists(uid, maxItems) {
  const playlists = [];
  const seen = new Set();
  let offset = 0;
  let total = 0;
  for (let page = 0; page < NETEASE_PLAYLIST_SYNC_MAX_PAGES; page += 1) {
    const r = await user_playlist({
      uid,
      limit: NETEASE_PLAYLIST_SYNC_PAGE_SIZE,
      offset,
      cookie: userCookie,
      timestamp: Date.now(),
    });
    const body = r.body || r || {};
    const raw = Array.isArray(body.playlist) ? body.playlist : [];
    total = Number(body.total || body.count || total) || total;
    mergeUniqueNeteasePlaylists(playlists, raw, seen);
    if (maxItems && playlists.length >= maxItems) break;
    if (!raw.length || raw.length < NETEASE_PLAYLIST_SYNC_PAGE_SIZE) break;
    if (total && playlists.length >= total) break;
    offset += NETEASE_PLAYLIST_SYNC_PAGE_SIZE;
  }
  return maxItems ? playlists.slice(0, maxItems) : playlists;
}

function neteaseRawTrackKey(track, fallback) {
  track = track || {};
  const privilege = track.privilege || {};
  const album = track.al || track.album || {};
  return String(
    track.id ||
    track.songId ||
    track.resourceId ||
    privilege.id ||
    ((track.name || '') + '|' + (album.id || album.name || '') + '|' + fallback)
  );
}

function mergeUniqueNeteaseTracks(target, incoming, seen) {
  let added = 0;
  (incoming || []).forEach((track, index) => {
    const key = neteaseRawTrackKey(track, target.length + ':' + index);
    if (!key || seen.has(key)) return;
    seen.add(key);
    target.push(track);
    added += 1;
  });
  return added;
}

async function fetchNeteasePlaylistDetailMeta(id) {
  if (typeof playlist_detail !== 'function') return { playlistMeta: { id, name: '', cover: '', trackCount: 0 }, tracks: [] };
  const detail = await playlist_detail({ id, s: 0, cookie: userCookie, timestamp: Date.now() });
  const pl = (detail.body && detail.body.playlist) || {};
  return { playlistMeta: mapNeteasePlaylistMeta(pl, id), tracks: Array.isArray(pl.tracks) ? pl.tracks : [] };
}

async function fetchAllNeteasePlaylistTracks(id) {
  let playlistMeta = { id, name: '', cover: '', trackCount: 0 };
  let detailTracks = [];
  try {
    const detail = await fetchNeteasePlaylistDetailMeta(id);
    playlistMeta = detail.playlistMeta || playlistMeta;
    detailTracks = detail.tracks || [];
  } catch (err) {
    console.warn('[PlaylistTracks] playlist_detail meta failed:', err.message);
  }

  const rawTracks = [];
  const seen = new Set();
  const expectedTotal = Number(playlistMeta.trackCount || 0) || 0;

  if (typeof playlist_track_all === 'function') {
    let offset = 0;
    for (let page = 0; page < NETEASE_TRACK_SYNC_MAX_PAGES; page += 1) {
      try {
        const all = await playlist_track_all({
          id,
          limit: NETEASE_TRACK_SYNC_PAGE_SIZE,
          offset,
          cookie: userCookie,
          timestamp: Date.now(),
        });
        const body = all.body || all || {};
        const rows = (body.songs || body.tracks || []);
        const added = mergeUniqueNeteaseTracks(rawTracks, rows, seen);
        if (!rows.length || !added) break;
        if (expectedTotal && rawTracks.length >= expectedTotal) break;
        if (!expectedTotal && rows.length < NETEASE_TRACK_SYNC_PAGE_SIZE) break;
        offset += NETEASE_TRACK_SYNC_PAGE_SIZE;
      } catch (err) {
        console.warn('[PlaylistTracks] playlist_track_all page failed:', id, offset, err.message);
        break;
      }
    }
  }

  if (!rawTracks.length && detailTracks.length) {
    mergeUniqueNeteaseTracks(rawTracks, detailTracks, seen);
  }

  return { playlistMeta, rawTracks };
}

async function fetchNeteasePlaylistTracksPage(id, limit, offset) {
  limit = Math.max(1, Math.min(NETEASE_TRACK_SYNC_PAGE_SIZE, parseInt(limit || '48', 10) || 48));
  offset = Math.max(0, parseInt(offset || '0', 10) || 0);
  let rawTracks = [];
  if (typeof playlist_track_all === 'function') {
    const page = await playlist_track_all({
      id,
      limit,
      offset,
      cookie: userCookie,
      timestamp: Date.now(),
    });
    const body = page.body || page || {};
    rawTracks = body.songs || body.tracks || [];
  }
  if (!rawTracks.length && typeof playlist_detail === 'function') {
    const detail = await fetchNeteasePlaylistDetailMeta(id);
    rawTracks = (detail.tracks || []).slice(offset, offset + limit);
  }
  return {
    playlistMeta: { id, name: '', cover: '', trackCount: 0 },
    rawTracks,
    offset,
    limit,
    nextOffset: offset + rawTracks.length,
    hasMore: rawTracks.length >= limit,
  };
}

async function filterLikelyPlayableWeatherSongs(songs) {
  const source = uniqueSongsByKey(songs)
    .filter(song => song && song.name && song.id && !isLowSignalWeatherSong(song))
    .slice(0, 24);
  const playable = [];
  const fallback = source.slice(0, 24);
  for (let i = 0; i < source.length; i += 4) {
    const chunk = source.slice(i, i + 4);
    const settled = await Promise.allSettled(chunk.map(async song => {
      const info = await handleSongUrl(song.id, { loggedIn: !!userCookie }, 'standard');
      return info && info.url ? song : null;
    }));
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) playable.push(result.value);
      else if (result.status === 'rejected') console.warn('[WeatherRadio] playable probe failed:', chunk[idx] && chunk[idx].name, result.reason && result.reason.message);
    });
    if (playable.length >= 12) break;
  }
  return (playable.length ? playable : fallback).slice(0, 24);
}

function isLowSignalWeatherSong(song) {
  const text = String([
    song && song.name,
    song && song.artist,
    song && song.album,
  ].filter(Boolean).join(' ')).toLowerCase();
  if (!text) return true;
  if (/(^|[\s\-_/（(])ai(?:\s*(歌|歌曲|音乐|cover|翻唱|生成|作曲|演唱|女声|男声)|$|[\s\-_/）)])/i.test(text)) return true;
  if (/suno|udio|人工智能|生成歌曲|ai歌曲|虚拟歌手|测试音频|demo|beat\s*maker/i.test(text)) return true;
  if (/翻自|翻唱|cover|remix|伴奏|纯音乐|钢琴|dj|live\s*版|live版|唯美钢琴|karaoke|instrumental/i.test(text)) return true;
  if (/白噪音|雨声|睡眠|助眠|冥想|疗愈频率|环境音|自然声音|asmr/i.test(text)) return true;
  if (/[（(](r&b|lofi|jazz|dj|edm|trap|remix|伴奏|纯音乐|钢琴|电子|治愈|古风|女声|男声|英文|中文版|抖音|ai)[）)]/i.test(text)) return true;
  if (/^(纯音乐|轻音乐|治愈系|放松|睡眠|雨天|阴天|夜晚|夏日|海边)$/i.test(String(song.name || '').trim())) return true;
  return false;
}

function scoreWeatherSong(song, mood) {
  const text = String((song && song.name || '') + ' ' + (song && song.artist || '') + ' ' + (song && song.album || '')).toLowerCase();
  let score = 0;
  if (song && song.cover) score += 4;
  if (song && song.duration) score += 2;
  if (song && song.weatherSource === 'daily') score += 6;
  if (song && song.weatherSource === 'private') score += 4;
  if (/周杰伦|陈奕迅|孙燕姿|五月天|王菲|陶喆|方大同|林宥嘉|蔡健雅|莫文蔚|李健|毛不易|告五人|落日飞车|陈绮贞|朴树/.test(text)) score += 10;
  const key = String(mood && mood.key || '');
  if (key.includes('rain') && /雨|阴|夜|慢|r&b|soul|陈奕迅|林宥嘉|孙燕姿/.test(text)) score += 5;
  if (key.includes('humid') && /夏|海|city|pop|落日|告五人|方大同|陶喆/.test(text)) score += 5;
  if (key.includes('night') && /夜|moon|jazz|soul|r&b|方大同|陶喆|王菲/.test(text)) score += 5;
  if (key.includes('cloudy') && /阴|民谣|indie|陈绮贞|朴树|李健/.test(text)) score += 5;
  return score;
}

function weatherArtistKey(song) {
  const raw = String(song && song.artist || song && song.name || '').split(/\s*\/\s*|、|,|&/)[0] || '';
  return raw.trim().toLowerCase() || 'unknown';
}

function weatherTitleKey(song) {
  return String(song && song.name || '')
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s._\-·'’"“”「」《》:：/\\|]+/g, '')
    .trim();
}

function uniqueWeatherTitles(sorted) {
  const seen = new Set();
  const out = [];
  (sorted || []).forEach(song => {
    const key = weatherTitleKey(song);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    out.push(song);
  });
  return out;
}

function diversifyWeatherSongs(sorted, artistLimit) {
  const primary = [];
  const deferred = [];
  const counts = new Map();
  (sorted || []).forEach(song => {
    const key = weatherArtistKey(song);
    const count = counts.get(key) || 0;
    if (count < artistLimit) {
      primary.push(song);
      counts.set(key, count + 1);
    } else {
      deferred.push(song);
    }
  });
  return primary.length >= 8 ? primary : primary.concat(deferred.slice(0, 8 - primary.length));
}

function orderWeatherSongs(songs, mood) {
  const sorted = uniqueSongsByKey(songs)
    .filter(song => song && song.name && song.id && !isLowSignalWeatherSong(song))
    .sort((a, b) => scoreWeatherSong(b, mood) - scoreWeatherSong(a, mood));
  return diversifyWeatherSongs(uniqueWeatherTitles(sorted), 2);
}

async function buildWeatherRadio(params) {
  let weather;
  try {
    weather = await fetchOpenMeteoWeather(params);
  } catch (e) {
    console.warn('[WeatherRadio] weather provider failed, using fallback radio:', e.message);
    weather = fallbackWeatherForRadio(params, e);
  }
  const queries = weatherRadioSeedQueries(weather.mood);
  let songs = [];
  const settled = await Promise.allSettled(queries.slice(0, 4).map(q => handleSearch(q, 6)));
  settled.forEach(result => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) songs = songs.concat(result.value);
  });
  if (songs.length < 10 && weather.mood && Array.isArray(weather.mood.keywords)) {
    const more = await Promise.allSettled(weather.mood.keywords.slice(0, 2).map(q => handleSearch(q, 6)));
    more.forEach(result => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) songs = songs.concat(result.value);
    });
  }
  songs = orderWeatherSongs(songs, weather.mood);
  return {
    ok: true,
    weather,
    radio: {
      title: weather.mood.title,
      subtitle: weather.mood.tagline,
      seedQueries: queries.slice(0, 4),
      songs: songs.slice(0, 18),
      updatedAt: Date.now(),
    },
  };
}

function parseJSONText(text) {
  const raw = String(text || '').trim();
  const json = raw.replace(/^callback\(([\s\S]*)\);?$/, '$1');
  return JSON.parse(json);
}

async function qqMusicRequest(payload, opts) {
  opts = opts || {};
  const body = JSON.stringify(payload);
  const headers = {
    ...QQ_HEADERS,
    'Content-Type': 'application/json;charset=UTF-8',
    'Content-Length': Buffer.byteLength(body),
  };
  if (opts.cookie && qqCookie) headers.Cookie = qqCookie;
  const text = await requestText(QQ_MUSICU_URL, {
    method: 'POST',
    headers,
    timeoutMs: opts.timeoutMs,
  }, body);
  return parseJSONText(text);
}

const QQ_VIP_TYPE_KEYS = [
  'vipType', 'vip_type', 'viptype', 'vipLevel', 'vip_level', 'level',
  'music_vip_level', 'musicVipLevel', 'green_vip_level', 'greenVipLevel',
  'green_level', 'greenLevel', 'vipStatus', 'vip_status', 'vipFlag', 'vipflag',
];
const QQ_SVIP_TYPE_KEYS = [
  'svipType', 'svip_type', 'superVipType', 'super_vip_type',
  'superVipLevel', 'super_vip_level', 'luxury_vip_level', 'luxuryVipLevel',
  'super_vip', 'superVip', 'svip', 'greenSvip', 'green_svip',
];
const QQ_VIP_FLAG_KEYS = [
  'isVip', 'is_vip', 'vip', 'vipFlag', 'vipflag', 'isGreenVip',
  'is_green_vip', 'greenVip', 'green_vip', 'isMember', 'is_member',
  'member', 'opened', 'active', 'valid',
];
const QQ_SVIP_FLAG_KEYS = [
  'isSvip', 'is_svip', 'svip', 'superVip', 'super_vip', 'isSuperVip',
  'is_super_vip', 'luxuryVip', 'luxury_vip', 'isLuxuryVip', 'is_luxury_vip',
];

function collectQQVipObjects(value, out, depth, pathText) {
  if (depth > 6 || value == null || typeof value !== 'object') return out;
  const keys = Object.keys(value);
  const looksVip = /vip|svip|member|green|luxury|associator|privilege|right|package|expire/i.test((pathText || '') + ' ' + keys.join(' '));
  if (looksVip) out.push(value);
  keys.forEach(key => collectQQVipObjects(value[key], out, depth + 1, (pathText || '') + ' ' + key));
  return out;
}

function collectQQVipExpiryValues(value, out, depth) {
  if (depth > 4 || value == null || typeof value !== 'object') return out;
  Object.keys(value).forEach(key => {
    const child = value[key];
    if (/expire|expiry|end[_-]?time|valid[_-]?time|deadline|due/i.test(key)) {
      const n = Number(child);
      if (Number.isFinite(n) && n > 0) out.push(n < 10000000000 ? n * 1000 : n);
    }
    if (child && typeof child === 'object') collectQQVipExpiryValues(child, out, depth + 1);
  });
  return out;
}

function qqVipObjectLooksExpired(obj) {
  const values = collectQQVipExpiryValues(obj, [], 0).filter(n => n > 946684800000);
  if (!values.length) return false;
  return Math.max(...values) < Date.now() - 60 * 1000;
}

function qqVipFlagEnabled(obj, keys) {
  if (!obj || typeof obj !== 'object') return false;
  return keys.some(key => {
    const value = obj[key];
    if (value === true) return true;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return true;
    const text = String(value || '').trim().toLowerCase();
    if (!text || text === '0' || text === 'false' || text === 'none' || text === 'normal' || text === 'expired') return false;
    return /^(true|yes|active|valid|vip|svip|premium)$/.test(text) || /已开通|有效|会员|绿钻|豪华/.test(text);
  });
}

function normalizeQQVipPayload(payload, fallback) {
  fallback = fallback || {};
  const candidates = collectQQVipObjects(payload, [], 0, '');
  const activeCandidates = candidates.filter(obj => !qqVipObjectLooksExpired(obj));
  const allCandidatesExpired = candidates.length > 0 && activeCandidates.length === 0 && candidates.some(obj => qqVipObjectLooksExpired(obj));
  const objects = allCandidatesExpired ? [] : (activeCandidates.length ? activeCandidates : candidates);
  const fallbackVipType = Number(fallback.vipType || fallback.vip_type || 0) || 0;
  const fallbackSvipType = Number(fallback.svipType || fallback.svip_type || 0) || 0;
  const vipType = firstPositiveNumberFrom(objects, QQ_VIP_TYPE_KEYS) || fallbackVipType;
  const svipType = firstPositiveNumberFrom(objects, QQ_SVIP_TYPE_KEYS) || fallbackSvipType;
  let vipText = '';
  try { vipText = collectVipStringValues(payload, [], 0).join(' ').toLowerCase(); } catch (_) {}
  const negativeText = /无vip|非会员|普通用户|普通账号|未开通|已过期|过期|expired|not\s+vip/.test(vipText);
  const svipText = /svip|supervip|super_vip|豪华绿钻|超级会员|超级vip|绿钻豪华/.test(vipText);
  const vipTextPositive = !negativeText && /vip|premium|会员|绿钻|已开通|有效期内|豪华/.test(vipText);
  const isSvip = svipType > 0 || objects.some(obj => qqVipFlagEnabled(obj, QQ_SVIP_FLAG_KEYS)) || svipText || !!fallback.isSvip;
  const isVip = isSvip || vipType > 0 || objects.some(obj => qqVipFlagEnabled(obj, QQ_VIP_FLAG_KEYS)) || vipTextPositive || !!fallback.isVip;
  const vipLevel = isSvip ? 'svip' : (isVip ? 'vip' : 'none');
  const resolved = candidates.length > 0 || vipType > 0 || svipType > 0 || !!vipText || !!fallback.isVip || !!fallback.isSvip;
  return {
    vipType,
    svipType,
    vipLevel,
    isVip,
    isSvip,
    vipLabel: vipLevel === 'svip' ? 'SVIP' : (vipLevel === 'vip' ? 'VIP' : '无VIP'),
    resolved,
  };
}

function withQQVipSyncState(info, probeAvailable) {
  info = info || {};
  const authIncomplete = !!(info.loggedIn && !info.playbackKeyReady);
  const membershipStale = !!(info.loggedIn && (authIncomplete || (info.profileUnavailable && !probeAvailable)));
  return {
    ...info,
    membershipStale,
    authorizationIncomplete: authIncomplete,
    vipSyncState: authIncomplete ? 'authorization_incomplete' : (probeAvailable ? 'checked' : (membershipStale ? 'stale' : 'profile')),
  };
}

function mergeQQVipStatus(info, vip, source) {
  info = info || {};
  if (!vip || !vip.resolved) {
    return withQQVipSyncState({
      ...info,
      vipCheckedAt: Date.now(),
      vipProbeAvailable: false,
      vipSource: info.vipSource || 'profile',
    }, false);
  }
  if (info.loggedIn && info.playbackKeyReady === false && !vip.isVip) {
    return withQQVipSyncState({
      ...info,
      vipCheckedAt: Date.now(),
      vipProbeAvailable: false,
      vipSource: source || vip.vipSource || info.vipSource || 'qq-vip-probe-untrusted',
    }, false);
  }
  return withQQVipSyncState({
    ...info,
    vipType: vip.vipType || 0,
    svipType: vip.svipType || 0,
    vipLevel: vip.vipLevel || 'none',
    isVip: !!vip.isVip,
    isSvip: !!vip.isSvip,
    vipLabel: vip.vipLabel || (vip.isVip ? 'VIP' : '无VIP'),
    vipCheckedAt: Date.now(),
    vipProbeAvailable: true,
    vipSource: source || vip.vipSource || 'qq-vip-probe',
  }, true);
}

async function fetchQQVipStatus(cookieObj, opts) {
  opts = opts || {};
  cookieObj = cookieObj || qqCookieObject();
  const uin = qqCookieUin(cookieObj);
  const musicKey = qqCookieMusicKey(cookieObj);
  if (!uin || !musicKey) return null;
  const cached = qqVipInfoCache.get(uin);
  if (!opts.force && cached && Date.now() - cached.at < QQ_VIP_INFO_CACHE_TTL_MS) return cached.value;
  const comm = { uin, format: 'json', ct: 24, cv: 0 };
  if (musicKey) comm.authst = musicKey;
  const probes = [
    {
      source: 'qq-vip-query-v2-list',
      body: {
        comm,
        req_1: {
          module: 'userInfo.VipQueryServer',
          method: 'SRFVipQuery_V2',
          param: { uin_list: [String(uin)] },
        },
      },
    },
    {
      source: 'qq-vip-query-v1-list',
      body: {
        comm,
        req_1: {
          module: 'userInfo.VipQueryServer',
          method: 'SRFVipQuery',
          param: { uin_list: [String(uin)] },
        },
      },
    },
    {
      source: 'qq-vip-query-v2-single',
      body: {
        comm,
        vip: {
          module: 'userInfo.VipQueryServer',
          method: 'SRFVipQuery_V2',
          param: { uin: String(uin), uin_list: [String(uin)] },
        },
      },
    },
  ];
  let lastError = null;
  for (const probe of probes) {
    try {
      const body = await qqMusicRequest(probe.body, { cookie: true, timeoutMs: 4200 });
      const vip = normalizeQQVipPayload(body, {});
      if (vip.resolved) {
        const value = { ...vip, vipSource: probe.source, rawCode: normalizeApiCode(body) };
        qqVipInfoCache.set(uin, { at: Date.now(), value });
        return value;
      }
    } catch (e) {
      lastError = e;
    }
  }
  if (opts.force && lastError) console.warn('[QQLogin] VIP probe failed:', lastError.message);
  return null;
}

function normalizeQQProfile(body, cookieObj) {
  cookieObj = cookieObj || qqCookieObject();
  const uin = qqCookieUin(cookieObj);
  const data = (body && (body.data || body.profile || body.creator || body.result)) || {};
  const creator = (data.creator || data.user || data.profile || data) || {};
  const vipInfo = data.vipInfo || data.vipinfo || data.vip || creator.vipInfo || creator.vipinfo || {};
  const profileNick = decodeQQCookieValue(creator.nick || creator.nickname || creator.name || creator.hostname || creator.title || '');
  const profileAvatar = creator.headpic || creator.avatar || creator.avatarUrl || creator.logo || '';
  const cookieNick = qqCookieNickname(cookieObj, uin);
  const nick = profileNick || cookieNick || '';
  const avatar = profileAvatar || qqCookieAvatar(cookieObj, uin);
  const profileVip = normalizeQQVipPayload({ data, creator, vipInfo, cookie: cookieObj }, {});
  return {
    provider: 'qq',
    loggedIn: !!(uin && qqCookieMusicKey(cookieObj)),
    preview: false,
    userId: uin,
    nickname: nick || (uin ? ('QQ ' + uin) : 'QQ 音乐'),
    avatar,
    vipType: profileVip.vipType || 0,
    svipType: profileVip.svipType || 0,
    vipLevel: profileVip.vipLevel || 'none',
    isVip: !!profileVip.isVip,
    isSvip: !!profileVip.isSvip,
    vipLabel: profileVip.vipLabel || '无VIP',
    hasCookie: !!qqCookie,
    playbackKeyReady: !!qqCookiePlaybackKey(cookieObj),
    profileSource: profileNick || profileAvatar ? 'qq-profile' : (cookieNick || avatar ? 'cookie' : 'fallback'),
    vipSource: profileVip.resolved ? 'qq-profile-vip' : 'profile',
  };
}

async function getQQLoginInfo(options) {
  options = options || {};
  if (options.forceCookie) refreshQQConfiguredCookieStore(true);
  const cookieObj = qqCookieObject();
  const uin = qqCookieUin(cookieObj);
  const musicKey = qqCookieMusicKey(cookieObj);
  if (!uin || !musicKey) return { provider: 'qq', loggedIn: false, hasCookie: !!qqCookie };
  const fallback = normalizeQQProfile(null, cookieObj);
  const vipProbePromise = fetchQQVipStatus(cookieObj, { force: !!options.forceVip }).catch(e => {
    if (options.forceVip) console.warn('[QQLogin] VIP probe skipped:', e.message);
    return null;
  });
  try {
    const u = new URL('https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg');
    u.searchParams.set('cid', '205360838');
    u.searchParams.set('userid', uin);
    u.searchParams.set('reqfrom', '1');
    u.searchParams.set('g_tk', '5381');
    u.searchParams.set('loginUin', uin);
    u.searchParams.set('hostUin', '0');
    u.searchParams.set('format', 'json');
    u.searchParams.set('inCharset', 'utf8');
    u.searchParams.set('outCharset', 'utf-8');
    u.searchParams.set('notice', '0');
    u.searchParams.set('platform', 'yqq.json');
    u.searchParams.set('needNewCode', '0');
    const text = await requestText(u.toString(), {
      headers: { ...QQ_HEADERS, Cookie: qqCookie },
      timeoutMs: options.forceVip ? 6500 : 10000,
    });
    const body = parseJSONText(text);
    const info = normalizeQQProfile(body, cookieObj);
    const vipProbe = await vipProbePromise;
    if (body && (body.code === 1000 || body.result === 301)) {
      return mergeQQVipStatus({ ...fallback, profileUnavailable: true }, vipProbe, vipProbe && vipProbe.vipSource);
    }
    return mergeQQVipStatus(info, vipProbe, vipProbe && vipProbe.vipSource);
  } catch (e) {
    console.warn('[QQLogin] profile check failed:', e.message);
    const vipProbe = await vipProbePromise;
    return mergeQQVipStatus({ ...fallback, profileUnavailable: true }, vipProbe, vipProbe && vipProbe.vipSource);
  }
}

async function qqGetJSON(targetUrl, params, opts) {
  opts = opts || {};
  const u = new URL(targetUrl);
  Object.keys(params || {}).forEach(k => {
    if (params[k] != null) u.searchParams.set(k, String(params[k]));
  });
  const headers = { ...QQ_HEADERS, ...(opts.headers || {}) };
  if (opts.cookie !== false && qqCookie) headers.Cookie = qqCookie;
  const text = await requestText(u.toString(), { headers });
  return parseJSONText(text);
}

// ==================== YouTube Music Adapter (results页搜索 + IOS/ANDROID player 直链 + /api/audio 代理流) ====================
const YT_WEB_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const YT_CONSENT_COOKIE = 'SOCS=CAISEwgDEgk2Nzc5NjI4NjkaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb.20210328-17-p0.en+FX+999';
const YT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const YT_PLAYER_CLIENTS = [
  // ANDROID 优先:它返回「渐进式 formats」(itag 22/18,faststart 普通 mp4),<audio> 能直接播;
  // IOS/MWEB 只给 adaptiveFormats(itag 140 = DASH 分片 fMP4),<audio> 播不了(error 4 SRC_NOT_SUPPORTED)。
  { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en', gl: 'US' }, ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip' },
  { client: { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', hl: 'en', gl: 'US' }, ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)' },
];
async function ytFetch(targetUrl, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 15000);
  try { return await fetch(targetUrl, Object.assign({}, opts, { signal: ctrl.signal })); }
  finally { clearTimeout(t); }
}
function mapYtSong(vr) {
  const videoId = vr.videoId;
  const title = (vr.title && vr.title.runs && vr.title.runs[0] && vr.title.runs[0].text) || '';
  const artist = (vr.ownerText && vr.ownerText.runs && vr.ownerText.runs[0] && vr.ownerText.runs[0].text)
    || (vr.longBylineText && vr.longBylineText.runs && vr.longBylineText.runs[0] && vr.longBylineText.runs[0].text) || 'YouTube';
  const lengthText = (vr.lengthText && vr.lengthText.simpleText) || '';
  return { id: videoId, videoId: videoId, provider: 'ytmusic', source: 'ytmusic', name: title, artist: artist, album: '', cover: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg', durationText: lengthText, playable: true };
}
function ytCollectVideoRenderers(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) ytCollectVideoRenderers(node[i], out); return; }
  if (node.videoRenderer && node.videoRenderer.videoId) out.push(node.videoRenderer);
  for (const k in node) { if (k !== 'videoRenderer') ytCollectVideoRenderers(node[k], out); }
}
async function ytmusicSearch(keywords, limit) {
  const kw = String(keywords || '').trim();
  if (!kw) return [];
  const lim = limit || 24;
  const targetUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(kw) + '&sp=EgIQAQ%253D%253D';
  const r = await ytFetch(targetUrl, { headers: { 'User-Agent': YT_UA, 'Accept-Language': 'zh-CN,zh;q=0.9', Cookie: YT_CONSENT_COOKIE } }, 15000);
  const html = await r.text();
  const songs = []; const seen = {};
  const m = html.match(/var ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const vrs = []; ytCollectVideoRenderers(data, vrs);
      for (let i = 0; i < vrs.length && songs.length < lim; i++) {
        const vr = vrs[i];
        if (!vr.videoId || seen[vr.videoId] || !(vr.title && vr.title.runs)) continue;
        seen[vr.videoId] = 1; songs.push(mapYtSong(vr));
      }
    } catch (e) { console.warn('[YTMusicSearch] parse failed:', e.message); }
  }
  if (!songs.length) {
    const re = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]*?"title":\{"runs":\[\{"text":"([^"]{1,80})"/g;
    let mm;
    while ((mm = re.exec(html)) && songs.length < lim) {
      if (seen[mm[1]]) continue; seen[mm[1]] = 1;
      songs.push({ id: mm[1], videoId: mm[1], provider: 'ytmusic', source: 'ytmusic', name: mm[2].replace(/\\u0026/g, '&'), artist: 'YouTube', album: '', cover: 'https://i.ytimg.com/vi/' + mm[1] + '/hqdefault.jpg', playable: true });
    }
  }
  return songs;
}
async function ytmusicGetSongUrl(videoId) {
  const vid = String(videoId || '').trim();
  if (!vid) return { provider: 'ytmusic', url: '', playable: false, error: 'MISSING_ID' };
  let dashFallback = null;
  for (let i = 0; i < YT_PLAYER_CLIENTS.length; i++) {
    const c = YT_PLAYER_CLIENTS[i];
    try {
      const body = JSON.stringify({ context: { client: c.client }, videoId: vid, contentCheckOk: true, racyCheckOk: true });
      const r = await ytFetch('https://www.youtube.com/youtubei/v1/player?key=' + YT_WEB_KEY + '&prettyPrint=false', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua }, body: body }, 15000);
      const data = await r.json();
      if (!data || !data.streamingData) continue;
      // 首选「渐进式 formats」(itag 22≈192k / 18≈96k,combined mp4,faststart)——<audio> 能直接播。
      const prog = (data.streamingData.formats || []).filter(function (f) { return f.url; });
      let best = prog.find(function (f) { return f.itag === 22; }) || prog.find(function (f) { return f.itag === 18; }) || prog[0];
      if (best && best.url) return { provider: 'ytmusic', url: best.url, playable: true, bitrate: best.bitrate || 0, mime: best.mimeType || '', progressive: true };
      // 没有渐进式流:记一个 DASH 音频兜底(itag 140 等,<audio> 大概率播不了,仅作最后手段)
      if (!dashFallback) {
        const audios = (data.streamingData.adaptiveFormats || []).filter(function (f) { return f.url && String(f.mimeType || '').indexOf('audio/') === 0; }).sort(function (a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });
        if (audios[0] && audios[0].url) dashFallback = { url: audios[0].url, bitrate: audios[0].bitrate || 0, mime: audios[0].mimeType || '' };
      }
    } catch (e) { console.warn('[YTMusicSongUrl] player ' + c.client.clientName + ' failed:', e.message); }
  }
  if (dashFallback) return { provider: 'ytmusic', url: dashFallback.url, playable: true, bitrate: dashFallback.bitrate, mime: dashFallback.mime, dash: true };
  return { provider: 'ytmusic', url: '', playable: false, error: 'YT_URL_UNAVAILABLE' };
}

// ==================== YT Music 歌词跨源匹配(清洗 YT 脏标题 → 网易/QQ 搜索 → 时长评分 → 取词) ====================
// YT 脏标题清洗:去 Official Music Video / MV / Lyric Video / HD / 4K 等噪声,归一连字符与空白。
// 括号组【】/()/()/[]/「」:含噪声词的整组删除;否则只去括号、保留内文——否则会把「【稻香 Rice Field】」这类真标题误删。
const YT_TITLE_NOISE = /official\s+music\s+video|official\s+video|official\s+audio|official\s+mv|music\s+video|lyric\s+video|lyrics?|visualizer|\baudio\b|\bhd\b|\bhq\b|\b4k\b|\bmv\b/i;
function cleanYtTitle(t) {
  let s = String(t || '');
  s = s.replace(/[【\[(（「][^【】\[\]()（）「」]*[】\])）」]/g, grp => {
    const inner = grp.replace(/^[【\[(（「]|[】\])）」]$/g, '');
    return YT_TITLE_NOISE.test(inner) ? ' ' : ' ' + inner + ' ';
  });
  s = s.replace(/\b(?:official\s+music\s+video|official\s+video|official\s+audio|official\s+mv|music\s+video|lyric\s+video|lyrics?|visualizer|audio|hd|hq|4k|mv)\b/gi, ' ');
  s = s.replace(/[-_/|~]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}
// YT 歌手清洗:去尾部 " - Topic" 与 "VEVO";占位 'YouTube' / 空归为空串
function cleanYtArtist(a) {
  let s = String(a || '');
  s = s.replace(/\s*-\s*topic\s*$/i, '');
  s = s.replace(/vevo\s*$/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (/^youtube$/i.test(s)) s = '';
  return s;
}
// 匹配用归一:小写并去空白与标点,便于比较
function ytNormForMatch(t) {
  return String(t || '').toLowerCase().replace(/[\s\-_/|,.'"!?()（）\[\]【】「」]/g, '');
}
// 标题相似度:归一后取较短串在较长串里的最长公共子串占比(简易,不引库)
function ytTitleSimilarity(a, b) {
  const na = ytNormForMatch(a), nb = ytNormForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const s = na.length <= nb.length ? na : nb;
  const l = na.length <= nb.length ? nb : na;
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j <= s.length; j++) {
      const sub = s.slice(i, j);
      if (sub.length <= best) continue;
      if (l.indexOf(sub) >= 0) best = sub.length; else break; // 子串不在→更长的必然也不在
    }
  }
  return best / s.length;
}
// CJK 压缩查询:抽取标题/歌手里的中日韩连续段拼最紧凑查询(「周杰倫 稻香」式)——
// 实测网易/QQ 对堆料双语标题(歌手+英译名+歌名+英译歌名)几乎搜不到,紧凑 CJK 查询命中率最高
function ytCjkQuery(title, artist) {
  const cjk = s => (String(s || '').match(/[一-鿿぀-ヿ가-힯]+/g) || []);
  const tks = cjk(title);
  const aks = cjk(artist).filter(a => !tks.some(t => t.indexOf(a) >= 0 || a.indexOf(t) >= 0));
  return aks.concat(tks).join(' ').trim();
}
// 评分选最佳:sec>0 时在时长差 ≤8s 的候选里按「时长贴近 + 标题相似度」共同评分(防同时长错歌);
// 无合格→null,交上层试下一查询/下一源;sec 缺失时取标题相似度最高(需过阈值)
function ytPickBest(cands, sec, title) {
  const list = (cands || []).filter(c => c && c.name);
  if (!list.length) return null;
  const secNum = Number(sec) || 0;
  if (secNum > 0) {
    let best = null, bestScore = -Infinity;
    for (const c of list) {
      const cs = (Number(c.duration) || 0) / 1000;
      if (!cs) continue;
      const diff = Math.abs(cs - secNum);
      if (diff > 8) continue;
      const score = (8 - diff) + ytTitleSimilarity(c.name, title) * 6;
      if (score > bestScore) { best = c; bestScore = score; }
    }
    if (best) return best;
    // 兜底:官方 MV 常比录音室版长半分钟(片头/片尾),8s 门全灭时放宽——标题高相似 + 时长差 ≤45s 才收
    let loose = null, looseScore = -Infinity;
    for (const c of list) {
      const cs = (Number(c.duration) || 0) / 1000;
      if (!cs) continue;
      const diff = Math.abs(cs - secNum);
      if (diff > 45) continue;
      const sim = ytTitleSimilarity(c.name, title);
      if (sim < 0.72) continue;
      const score = sim * 10 - diff * 0.05;
      if (score > looseScore) { loose = c; looseScore = score; }
    }
    return loose;
  }
  let best = null, bestSim = -1;
  for (const c of list) {
    const sim = ytTitleSimilarity(c.name, title);
    if (sim > bestSim) { best = c; bestSim = sim; }
  }
  return bestSim >= 0.5 ? best : null;
}
// 内部取网易歌词(与 /api/lyric 同构),供 YT 跨源命中网易时复用。
// 注:/api/lyric 里的 lyricBodyHasPrimary / mergeLyricBodies 是请求处理器内的嵌套函数,本模块级函数取不到,故等价逻辑就地内联。
async function ytmusicFetchNeteaseLyric(id) {
  const nodeText = (b, key) => String((b && b[key] && b[key].lyric) || '');
  let body = {};
  let source = 'lyric';
  try {
    if (typeof lyric_new === 'function') {
      const nr = await lyric_new({ id, cookie: userCookie, timestamp: Date.now() });
      body = nr.body || {};
      source = 'lyric_new';
    }
  } catch (errNew) { console.warn('[YTLyric][LyricNew]', errNew.message); }
  const hasPrimary = !!(nodeText(body, 'lrc') || nodeText(body, 'yrc'));
  const hasTranslation = !!(nodeText(body, 'tlyric') || nodeText(body, 'ytlrc'));
  if (!hasPrimary || !hasTranslation) {
    const r = await lyric({ id, cookie: userCookie, timestamp: Date.now() });
    const fallback = r.body || {};
    const merged = Object.assign({}, fallback, body); // lyric_new(body) 优先
    ['lrc', 'tlyric', 'yrc', 'ytlrc', 'romalrc', 'yromalrc', 'klyric'].forEach(key => {
      if (!nodeText(merged, key) && fallback[key]) merged[key] = fallback[key];
    });
    body = merged;
    source = source === 'lyric_new' ? 'lyric_new+lyric' : 'lyric';
  }
  return {
    lyric: nodeText(body, 'lrc'),
    tlyric: nodeText(body, 'tlyric'),
    yrc: nodeText(body, 'yrc'),
    ytlrc: nodeText(body, 'ytlrc'),
    romalrc: nodeText(body, 'romalrc'),
    yromalrc: nodeText(body, 'yromalrc'),
    source,
  };
}
const ytLyricCache = new Map(); // 10s 级内存缓存,避免切歌来回打搜索/取词接口
const YT_LYRIC_TTL = 10000;
async function ytmusicResolveLyric(title, artist, sec) {
  const cleanTitle = cleanYtTitle(title);
  const cleanArtist = cleanYtArtist(artist);
  const cacheKey = (cleanTitle + '|' + cleanArtist + '|' + (Number(sec) || 0)).toLowerCase();
  const hit = ytLyricCache.get(cacheKey);
  if (hit && (Date.now() - hit.at) < YT_LYRIC_TTL) return hit.payload;
  // 查询降级序列:CJK 压缩查询优先(实测命中率最高)→ 纯标题 → 标题+歌手;去重去空
  const queryRaw = [ytCjkQuery(cleanTitle, cleanArtist), cleanTitle, cleanArtist ? (cleanTitle + ' ' + cleanArtist) : ''];
  const querySeen = new Set();
  const queries = queryRaw.filter(q => {
    const k = String(q || '').trim().toLowerCase();
    if (k.length < 2 || querySeen.has(k)) return false;
    querySeen.add(k); return true;
  });
  let payload = { lyric: '', nolyric: true };
  outer:
  for (const src of ['netease', 'qq']) {
    for (const kw of queries) {
      try {
        if (src === 'netease') {
          const neSongs = await handleSearch(kw, 8);
          const neBest = ytPickBest(neSongs, sec, cleanTitle);
          if (neBest && neBest.id) {
            const ne = await ytmusicFetchNeteaseLyric(neBest.id);
            if (ne && (ne.lyric || ne.yrc)) { payload = ne; break outer; }
          }
        } else {
          const qqSongs = await handleQQSearch(kw, 8);
          const qqBest = ytPickBest(qqSongs, sec, cleanTitle);
          if (qqBest && (qqBest.mid || qqBest.id)) {
            const qq = await handleQQLyric(qqBest.mid || '', qqBest.id || '');
            if (qq && qq.lyric) { payload = qq; break outer; }
          }
        }
      } catch (e) { console.warn('[YTLyric] ' + src + ' 「' + kw + '」 failed:', e.message); }
    }
  }
  ytLyricCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

function audioProxyHeadersFor(audioUrl, range) {
  const headers = { 'User-Agent': UA, Referer: 'https://music.163.com/' };
  try {
    const host = new URL(audioUrl).hostname.toLowerCase();
    if (host.includes('qq.com') || host.includes('qpic.cn')) headers.Referer = 'https://y.qq.com/';
    else if (host.includes('kugou.com') || host.includes('kgimg.com')) headers.Referer = 'https://www.kugou.com/';
    else if (host.includes('googlevideo')) delete headers.Referer;
    if (host.includes('qishui.com') || host.includes('byteimg.com') || host.includes('douyin')) headers.Referer = 'https://www.qishui.com/';
    const kugouReferer = kugouAudioReferer(audioUrl);
    if (kugouReferer) headers.Referer = kugouReferer;
  } catch (e) {}
  if (range) headers.Range = range;
  return headers;
}

function qishuiAudioAuthFromUrl(audioUrl) {
  const text = String(audioUrl || '');
  const idx = text.indexOf('#auth=');
  if (idx < 0) return { cleanUrl: text, auth: '' };
  const authRaw = text.slice(idx + 6);
  let auth = authRaw;
  try { auth = decodeURIComponent(authRaw); } catch (_) {}
  return { cleanUrl: text.slice(0, idx), auth };
}

function qishuiAudioCacheKey(cleanUrl, auth) {
  return crypto.createHash('sha1').update(String(cleanUrl || '') + '\n' + String(auth || '')).digest('hex');
}

function rememberQishuiDecryptedAudio(key, payload) {
  if (!payload || !Buffer.isBuffer(payload.buffer)) return;
  qishuiAudioDecryptCache.set(key, Object.assign({ at: Date.now() }, payload));
  qishuiAudioDecryptCacheBytes += payload.buffer.length;
  while (qishuiAudioDecryptCacheBytes > QISHUI_AUDIO_DECRYPT_CACHE_MAX_BYTES && qishuiAudioDecryptCache.size > 1) {
    const oldest = [...qishuiAudioDecryptCache.entries()].sort((a, b) => (a[1].at || 0) - (b[1].at || 0))[0];
    if (!oldest) break;
    qishuiAudioDecryptCache.delete(oldest[0]);
    qishuiAudioDecryptCacheBytes -= oldest[1].buffer.length;
  }
}

async function getQishuiDecryptedAudio(audioUrl) {
  const parsed = qishuiAudioAuthFromUrl(audioUrl);
  if (!parsed.auth) return null;
  const key = qishuiAudioCacheKey(parsed.cleanUrl, parsed.auth);
  const cached = qishuiAudioDecryptCache.get(key);
  if (cached) {
    cached.at = Date.now();
    return cached;
  }
  const up = await fetch(parsed.cleanUrl, { headers: audioProxyHeadersFor(parsed.cleanUrl, '') });
  if (!up.ok) throw new Error('Qishui encrypted audio fetch failed: HTTP ' + up.status);
  const encryptedBuffer = Buffer.from(await up.arrayBuffer());
  const result = qishuiAudioDecryptor.decrypt({ encryptedBuffer, spadeA: parsed.auth });
  const payload = {
    buffer: result.buffer,
    contentType: result.extension === '.flac' ? 'audio/flac' : 'audio/mp4',
    extension: result.extension,
  };
  rememberQishuiDecryptedAudio(key, payload);
  return payload;
}

function sendAudioBuffer(res, buffer, contentType, range) {
  const total = buffer.length;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(range || ''));
  if (match) {
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : total - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= total) end = total - 1;
    if (start > end || start >= total) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + total });
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': contentType || 'audio/mp4',
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
    });
    res.end(buffer.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, {
    'Content-Type': contentType || 'audio/mp4',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Content-Length': total,
  });
  res.end(buffer);
}

function audioContentTypeForUrl(audioUrl, upstreamType) {
  let pathname = '';
  try { pathname = new URL(audioUrl).pathname.toLowerCase(); } catch (e) {}
  if (/\.flac$/.test(pathname)) return 'audio/flac';
  if (/\.mp3$/.test(pathname)) return 'audio/mpeg';
  if (/\.(m4a|mp4)$/.test(pathname)) return 'audio/mp4';
  if (/\.ogg$/.test(pathname)) return 'audio/ogg';
  if (/\.wav$/.test(pathname)) return 'audio/wav';
  return upstreamType || 'audio/mpeg';
}

function mapQQPlaylist(pl, kind) {
  pl = pl || {};
  const dirid = pl.dirid || pl.dir_id || '';
  const liked = Number(dirid || 0) === QQ_LIKED_DIRID || isQQFavoritePlaylist(pl);
  const id = liked ? QQ_LIKED_PLAYLIST_ID : (pl.dissid || pl.tid || dirid || pl.id || pl.diss_id);
  const rawName = pl.diss_name || pl.name || pl.title || '';
  return {
    provider: 'qq',
    source: 'qq',
    id: id ? String(id) : '',
    dirid: dirid ? String(dirid) : '',
    virtual: liked,
    name: liked ? QQ_LIKED_PLAYLIST_NAME : (decodeQQCookieValue(rawName) || rawName),
    cover: liked ? QQ_LIKED_PLAYLIST_COVER : (pl.diss_cover || pl.logo || pl.picurl || pl.cover || ''),
    trackCount: pl.song_cnt || pl.songnum || pl.total_song_num || pl.song_count || 0,
    playCount: pl.listen_num || pl.visitnum || pl.play_count || 0,
    creator: pl.hostname || pl.nick || pl.creator || 'QQ 音乐',
    subscribed: kind === 'collect',
    specialType: liked ? 5 : 0,
    requiresPlaybackKey: false,
  };
}

function mapQQPlaylistTrack(raw) {
  raw = raw || {};
  const track = raw.songid || raw.songmid || raw.mid || raw.name ? raw : (raw.track_info || raw.songInfo || raw.songinfo || raw.song || {});
  const album = track.album || {};
  const artists = mapQQArtists(track.singer || track.singers || []);
  const mid = track.mid || track.songmid || raw.mid || raw.songmid || '';
  const albumMid = album.mid || track.albummid || raw.albummid || '';
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid || String(track.id || track.songid || raw.id || raw.songid || ''),
    qqId: track.id || track.songid || raw.id || raw.songid || '',
    mid,
    songmid: mid,
    mediaMid: (track.file && track.file.media_mid) || track.strMediaMid || track.media_mid || raw.strMediaMid || '',
    name: track.name || track.songname || raw.songname || '',
    artist: artists.map(a => a.name).join(' / ') || track.singername || raw.singername || '',
    artists,
    artistId: artists[0] && (artists[0].id || artists[0].mid),
    artistMid: artists[0] && artists[0].mid,
    album: album.name || album.title || track.albumname || raw.albumname || '',
    albumMid,
    cover: qqAlbumCover(albumMid, 300),
    duration: (Number(track.interval || raw.interval) || 0) * 1000,
    fee: track.pay && Number(track.pay.pay_play) ? 1 : 0,
    playable: false,
  };
}

// ── QQ 个性化推荐:每日30首 + 猜你喜欢电台(需 QQ 登录态)──
// 每日30首不是普通歌单接口,而是推荐流(RecommendFeed)里"为你打造"货架上的卡片;
// 卡片 id 可直接当 disstid 走歌单详情拿到当天 30 首(实测返回「xx的今日私享」)。
let qqDailyCardCache = { day: '', id: '', name: '' };
function qqRecommendComm() {
  const cookieObj = qqCookieObject();
  const uin = qqCookieUin(cookieObj) || '0';
  const musicKey = qqCookieMusicKey(cookieObj);
  const comm = { uin, format: 'json', ct: musicKey ? 19 : 24, cv: 0 };
  if (musicKey) comm.authst = musicKey;
  return comm;
}
async function qqFindDailyPlaylistCard() {
  const day = new Date().toDateString();
  if (qqDailyCardCache.day === day && qqDailyCardCache.id) return qqDailyCardCache;
  const json = await qqMusicRequest({
    comm: qqRecommendComm(),
    req_0: { module: 'music.recommend.RecommendFeed', method: 'get_recommend_feed', param: { direction: 0, page: 1, v_cache: [], v_uniq: [], s_num: 0 } },
  }, { cookie: true });
  const shelf = (json && json.req_0 && json.req_0.data && json.req_0.data.v_shelf) || [];
  for (const sh of shelf) {
    for (const niche of (sh.v_niche || [])) {
      for (const card of (niche.v_card || [])) {
        if (/每日30首|每日推荐/.test(String(card.title || ''))) {
          qqDailyCardCache = { day, id: String(card.id || ''), name: String(card.title || '每日30首') };
          return qqDailyCardCache;
        }
      }
    }
  }
  return { day, id: '', name: '' };
}
async function handleQQDailySongs() {
  const info = await getQQLoginInfo();
  if (!info.loggedIn) return { loggedIn: false, provider: 'qq', songs: [] };
  const card = await qqFindDailyPlaylistCard();
  if (!card.id) return { loggedIn: true, provider: 'qq', songs: [], error: 'DAILY_NOT_FOUND' };
  const detail = await handleQQPlaylistTracks(card.id, { limit: 30 });
  return {
    loggedIn: true,
    provider: 'qq',
    playlistId: card.id,
    name: (detail.playlist && detail.playlist.name) || card.name,
    songs: detail.tracks || [],
  };
}
async function handleQQPersonalRadio(count) {
  const info = await getQQLoginInfo();
  if (!info.loggedIn) return { loggedIn: false, provider: 'qq', songs: [] };
  const want = Math.max(1, Math.min(30, Number(count) || 12));
  const songs = [];
  const seen = new Set();
  for (let round = 0; round < 4 && songs.length < want; round += 1) {
    const json = await qqMusicRequest({
      comm: qqRecommendComm(),
      req_0: { module: 'mb_track_radio_svr', method: 'get_radio_track', param: { id: 99, firstplay: round === 0 ? 1 : 0, num: 15 } },
    }, { cookie: true });
    const list = (json && json.req_0 && json.req_0.data && json.req_0.data.tracks) || [];
    if (!list.length) break;
    for (const item of list) {
      const song = mapQQPlaylistTrack(item);
      const key = song.mid || song.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      songs.push(song);
    }
  }
  return { loggedIn: true, provider: 'qq', radioId: 99, songs: songs.slice(0, want) };
}

const QQ_PLAYLIST_SYNC_PAGE_SIZE = 200;
const QQ_PLAYLIST_SYNC_MAX_PAGES = 25;
const QQ_LIKED_DETAIL_BATCH_SIZE = 8;

async function fetchQQCreatedPlaylists(uin) {
  const out = [];
  for (let page = 0; page < QQ_PLAYLIST_SYNC_MAX_PAGES; page += 1) {
    const sin = page * QQ_PLAYLIST_SYNC_PAGE_SIZE;
    const body = await qqGetJSON('https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss', {
      hostUin: 0,
      hostuin: uin,
      sin,
      size: QQ_PLAYLIST_SYNC_PAGE_SIZE,
      g_tk: 5381,
      loginUin: uin,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 0,
    }, { headers: { Referer: 'https://y.qq.com/portal/profile.html' } });
    const rows = body && body.data && Array.isArray(body.data.disslist) ? body.data.disslist : [];
    out.push.apply(out, rows);
    if (rows.length < QQ_PLAYLIST_SYNC_PAGE_SIZE) break;
  }
  return out;
}

async function fetchQQCollectedPlaylists(uin) {
  const out = [];
  for (let page = 0; page < QQ_PLAYLIST_SYNC_MAX_PAGES; page += 1) {
    const sin = page * QQ_PLAYLIST_SYNC_PAGE_SIZE;
    const body = await qqGetJSON('https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg', {
      ct: 20,
      cid: 205360956,
      userid: uin,
      reqtype: 3,
      sin,
      ein: sin + QQ_PLAYLIST_SYNC_PAGE_SIZE - 1,
    }, { headers: { Referer: 'https://y.qq.com/portal/profile.html' } });
    const rows = body && body.data && Array.isArray(body.data.cdlist) ? body.data.cdlist : [];
    out.push.apply(out, rows);
    if (rows.length < QQ_PLAYLIST_SYNC_PAGE_SIZE) break;
  }
  return out;
}

function qqListFromMapValue(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  return String(value || '').split(/[,|;\s]+/).map(v => v.trim()).filter(Boolean);
}

async function fetchQQLikedPlaylistMap() {
  const body = await qqGetJSON('https://c.y.qq.com/splcloud/fcgi-bin/fcg_musiclist_getmyfav.fcg', {
    dirid: QQ_LIKED_DIRID,
    dirinfo: 1,
    g_tk: 5381,
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 0,
  }, { headers: { Referer: 'https://y.qq.com/n/yqq/playlist' } });
  if (Number(body && body.code) === 1000) {
    const err = new Error('QQ_LIKED_REQUIRES_PLAYBACK_LOGIN');
    err.code = 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN';
    throw err;
  }
  const data = body && body.data || body || {};
  return {
    ids: qqListFromMapValue(data.map || data.id || data.ids),
    mids: qqListFromMapValue(data.mapmid || data.mid || data.mids),
    raw: body,
  };
}

function buildQQLikedPlaylistCard(info, likedMap, warning) {
  const count = Math.max(
    likedMap && likedMap.mids && likedMap.mids.length || 0,
    likedMap && likedMap.ids && likedMap.ids.length || 0
  );
  return {
    provider: 'qq',
    source: 'qq',
    id: QQ_LIKED_PLAYLIST_ID,
    dirid: String(QQ_LIKED_DIRID),
    virtual: true,
    name: QQ_LIKED_PLAYLIST_NAME,
    cover: QQ_LIKED_PLAYLIST_COVER,
    trackCount: count,
    playCount: 0,
    creator: info && (info.nickname || info.userId) || 'QQ 音乐',
    subscribed: false,
    specialType: 5,
    requiresPlaybackKey: !!warning,
    warning: warning || '',
  };
}

async function getQQLikedPlaylistCard(info) {
  if (!info || !info.playbackKeyReady) {
    return buildQQLikedPlaylistCard(info, null, 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN');
  }
  try {
    const likedMap = await fetchQQLikedPlaylistMap();
    return buildQQLikedPlaylistCard(info, likedMap, '');
  } catch (err) {
    return buildQQLikedPlaylistCard(info, null, err.code || err.message || 'QQ_LIKED_UNAVAILABLE');
  }
}

async function handleQQLikedPlaylistTracks(info, opts) {
  const pageLimit = Math.max(0, Math.min(500, parseInt(opts && opts.limit || '0', 10) || 0));
  const pageOffset = Math.max(0, parseInt(opts && opts.offset || '0', 10) || 0);
  if (!info || !info.playbackKeyReady) {
    return {
      loggedIn: true,
      provider: 'qq',
      playlist: buildQQLikedPlaylistCard(info, null, 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN'),
      tracks: [],
      error: 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN',
      message: QQ_LIKED_AUTH_MESSAGE,
      requiresPlaybackKey: true,
    };
  }
  let likedMap = null;
  try {
    likedMap = await fetchQQLikedPlaylistMap();
  } catch (err) {
    return {
      loggedIn: true,
      provider: 'qq',
      playlist: buildQQLikedPlaylistCard(info, null, err.code || err.message || 'QQ_LIKED_UNAVAILABLE'),
      tracks: [],
      error: err.code || err.message || 'QQ_LIKED_UNAVAILABLE',
      message: QQ_LIKED_AUTH_MESSAGE,
      requiresPlaybackKey: true,
    };
  }
  const mids = likedMap.mids || [];
  const ids = likedMap.ids || [];
  const total = Math.max(mids.length, ids.length);
  const limit = pageLimit || total;
  const sliceStart = Math.min(pageOffset, total);
  const sliceEnd = Math.min(total, sliceStart + limit);
  const slicedMids = mids.slice(sliceStart, sliceEnd);
  const slicedIds = ids.slice(sliceStart, sliceEnd);
  const tracks = [];
  for (let i = 0; i < slicedMids.length; i += QQ_LIKED_DETAIL_BATCH_SIZE) {
    const batch = slicedMids.slice(i, i + QQ_LIKED_DETAIL_BATCH_SIZE);
    const batchIds = slicedIds.slice(i, i + QQ_LIKED_DETAIL_BATCH_SIZE);
    const rows = await Promise.all(batch.map((mid, index) => qqSongDetail(mid, {
      mid,
      id: batchIds[index] || '',
      qqId: batchIds[index] || '',
    }).catch(() => null)));
    rows.forEach((song, index) => {
      if (!song || !song.name || !(song.mid || song.id)) return;
      song.qqId = song.qqId || batchIds[index] || '';
      tracks.push(song);
    });
  }
  return {
    loggedIn: true,
    provider: 'qq',
    playlist: buildQQLikedPlaylistCard(info, likedMap, ''),
    tracks,
    total,
    offset: pageOffset,
    limit,
    nextOffset: sliceEnd,
    hasMore: sliceEnd < total,
    partial: !!pageLimit,
  };
}

async function handleQQUserPlaylists() {
  const info = await getQQLoginInfo();
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: 'qq', playlists: [] };
  const uin = info.userId;
  const createdReq = fetchQQCreatedPlaylists(uin);
  const collectReq = fetchQQCollectedPlaylists(uin);
  const likedReq = getQQLikedPlaylistCard(info);
  const [createdRaw, collectRaw, likedRaw] = await Promise.allSettled([createdReq, collectReq, likedReq]);
  const created = createdRaw.status === 'fulfilled' && Array.isArray(createdRaw.value)
    ? createdRaw.value.map(pl => mapQQPlaylist(pl, 'created')) : [];
  const collected = collectRaw.status === 'fulfilled' && Array.isArray(collectRaw.value)
    ? collectRaw.value.map(pl => mapQQPlaylist(pl, 'collect')) : [];
  const likedCard = likedRaw.status === 'fulfilled' ? likedRaw.value : buildQQLikedPlaylistCard(info, null, 'QQ_LIKED_UNAVAILABLE');
  const seen = new Set();
  const base = created.concat(collected);
  if (!base.some(isQQFavoritePlaylist)) base.unshift(likedCard);
  const playlists = base.filter(pl => {
    if (!pl.id || !pl.name || seen.has(pl.id)) return false;
    if (isQzoneBackgroundPlaylist(pl)) return false;
    seen.add(pl.id);
    return true;
  }).sort((a, b) => Number(isQQFavoritePlaylist(b)) - Number(isQQFavoritePlaylist(a)));
  return { loggedIn: true, provider: 'qq', userId: uin, playlists };
}

async function handleQQPlaylistTracks(id, opts) {
  opts = opts || {};
  const info = await getQQLoginInfo();
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: 'qq', tracks: [] };
  const pid = String(id || '').trim();
  if (!pid) return { loggedIn: true, provider: 'qq', error: 'Missing QQ playlist id', tracks: [] };
  if (isQQLikedPlaylistId(pid)) return handleQQLikedPlaylistTracks(info, opts);
  const pageLimit = Math.max(0, Math.min(500, parseInt(opts.limit || '0', 10) || 0));
  const pageOffset = Math.max(0, parseInt(opts.offset || '0', 10) || 0);
  const result = await qqGetJSON('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg', {
    type: 1,
    utf8: 1,
    disstid: pid,
    song_begin: pageOffset,
    song_num: pageLimit || undefined,
    loginUin: info.userId,
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 0,
  }, { headers: { Referer: 'https://y.qq.com/n/yqq/playlist' } });
  const detail = result && result.cdlist && result.cdlist[0] ? result.cdlist[0] : {};
  let rawTracks = Array.isArray(detail.songlist) ? detail.songlist : [];
  const totalHint = Number(detail.total_song_num || detail.songnum || detail.song_cnt || detail.song_count || 0) || 0;
  if (pageLimit && rawTracks.length > pageLimit) {
    rawTracks = totalHint && rawTracks.length < totalHint
      ? rawTracks.slice(0, pageLimit)
      : rawTracks.slice(pageOffset, pageOffset + pageLimit);
  }
  const tracks = rawTracks.map(mapQQPlaylistTrack).filter(s => s.name && (s.mid || s.id));
  const total = totalHint || tracks.length;
  const playlist = {
    provider: 'qq',
    id: pid,
    name: detail.dissname || detail.diss_name || detail.name || '',
    cover: detail.logo || detail.diss_cover || '',
    trackCount: total,
  };
  return {
    loggedIn: true,
    provider: 'qq',
    playlist,
    tracks,
    offset: pageOffset,
    limit: pageLimit || tracks.length,
    nextOffset: pageOffset + tracks.length,
    hasMore: pageLimit ? (pageOffset + tracks.length < total || tracks.length >= pageLimit) : false,
    partial: !!pageLimit,
    total,
  };
}

function qqAlbumCover(albumMid, size) {
  if (!albumMid) return '';
  const px = size || 300;
  return 'https://y.qq.com/music/photo_new/T002R' + px + 'x' + px + 'M000' + albumMid + '.jpg?max_age=2592000';
}

function qqSingerAvatar(singerMid, size) {
  if (!singerMid) return '';
  const px = size || 300;
  return 'https://y.qq.com/music/photo_new/T001R' + px + 'x' + px + 'M000' + singerMid + '.jpg?max_age=2592000';
}

function mapQQArtists(raw) {
  return (raw || [])
    .map(a => ({
      id: a && a.id,
      mid: a && a.mid,
      name: (a && (a.name || a.title)) || '',
    }))
    .filter(a => a.name);
}

function mapQQSmartSong(item) {
  item = item || {};
  const mid = item.mid || item.songmid || item.id || '';
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid,
    qqId: item.id || item.docid || '',
    mid,
    songmid: mid,
    name: item.name || item.title || '',
    artist: item.singer || '',
    artists: item.singer ? [{ name: item.singer }] : [],
    album: '',
    cover: '',
    duration: 0,
    fee: 0,
    playable: false,
  };
}

function mapQQTrack(track, fallback) {
  track = track || {};
  fallback = fallback || {};
  const album = track.album || {};
  const artists = mapQQArtists(track.singer || []);
  const mid = track.mid || fallback.mid || fallback.songmid || '';
  const albumMid = album.mid || album.pmid || '';
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid,
    qqId: track.id || fallback.qqId || fallback.id || '',
    mid,
    songmid: mid,
    mediaMid: track.file && track.file.media_mid,
    name: track.name || track.title || fallback.name || '',
    artist: artists.map(a => a.name).join(' / ') || fallback.artist || '',
    artists: artists.length ? artists : (fallback.artists || []),
    artistId: artists[0] && (artists[0].id || artists[0].mid),
    artistMid: artists[0] && artists[0].mid,
    album: album.name || album.title || fallback.album || '',
    albumMid,
    cover: qqAlbumCover(albumMid, 300) || fallback.cover || '',
    duration: (Number(track.interval) || 0) * 1000,
    fee: track.pay && Number(track.pay.pay_play) ? 1 : 0,
    playable: false,
  };
}

async function qqSmartboxSearch(keywords, limit) {
  const u = new URL(QQ_SMARTBOX_URL);
  u.searchParams.set('format', 'json');
  u.searchParams.set('key', keywords);
  u.searchParams.set('g_tk', '5381');
  u.searchParams.set('loginUin', '0');
  u.searchParams.set('hostUin', '0');
  u.searchParams.set('inCharset', 'utf8');
  u.searchParams.set('outCharset', 'utf-8');
  u.searchParams.set('notice', '0');
  u.searchParams.set('platform', 'yqq.json');
  u.searchParams.set('needNewCode', '0');
  const text = await requestText(u.toString(), { headers: QQ_HEADERS });
  const json = parseJSONText(text);
  const items = json && json.data && json.data.song && json.data.song.itemlist;
  return (Array.isArray(items) ? items : []).slice(0, Math.max(1, Math.min(limit || 6, 10))).map(mapQQSmartSong);
}

async function qqSongDetail(mid, fallback) {
  if (!mid) return fallback;
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    songinfo: {
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      param: { song_mid: mid },
    },
  });
  const data = json && json.songinfo && json.songinfo.data;
  return mapQQTrack(data && data.track_info, fallback);
}

async function handleQQArtistDetail(mid, limit) {
  const singerMid = String(mid || '').trim();
  const num = Math.max(10, Math.min(80, parseInt(limit || '36', 10) || 36));
  if (!singerMid) return { provider: 'qq', error: 'MISSING_SINGER_MID', artist: null, songs: [] };
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    singer: {
      module: 'music.web_singer_info_svr',
      method: 'get_singer_detail_info',
      param: { sort: 5, singermid: singerMid, sin: 0, num },
    },
  }, { cookie: true });
  const block = json && json.singer;
  if (!block || Number(block.code || 0) !== 0) {
    return { provider: 'qq', error: block && (block.message || block.msg || block.code) || 'QQ_ARTIST_DETAIL_FAILED', artist: null, songs: [] };
  }
  const data = block.data || {};
  const info = data.singer_info || data.singerInfo || {};
  const rawSongs = Array.isArray(data.songlist) ? data.songlist : [];
  const songs = rawSongs
    .map(raw => mapQQTrack(raw && (raw.track_info || raw.songInfo || raw.songinfo || raw.song) || raw, {}))
    .filter(song => song && song.name && (song.mid || song.id));
  const matchedSongArtist = songs[0] && (songs[0].artists || []).find(a => a && a.mid === singerMid);
  const artistMid = info.mid || singerMid;
  const artistName = info.name || info.title || (matchedSongArtist && matchedSongArtist.name) || '';
  const totalSong = Number(data.total_song || data.song_count || 0) || songs.length;
  return {
    provider: 'qq',
    artist: {
      provider: 'qq',
      id: info.id || '',
      mid: artistMid,
      name: artistName,
      avatar: info.pic || info.avatar || qqSingerAvatar(artistMid, 300),
      fans: Number(info.fans || 0) || 0,
      musicSize: totalSong,
      albumSize: Number(data.total_album || 0) || 0,
      mvSize: Number(data.total_mv || 0) || 0,
    },
    total: totalSong,
    songs,
  };
}

async function handleQQAlbumDetail(mid, limit) {
  const albumMid = String(mid || '').trim();
  const num = Math.max(10, Math.min(120, parseInt(limit || '80', 10) || 80));
  if (!albumMid) return { provider: 'qq', error: 'MISSING_ALBUM_MID', album: null, songs: [] };
  const body = await qqGetJSON('https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg', {
    albummid: albumMid,
    g_tk: 5381,
    loginUin: '0',
    hostUin: '0',
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 0,
  }, { headers: { Referer: 'https://y.qq.com/n/ryqq/albumDetail/' + encodeURIComponent(albumMid) } });
  const data = body && body.data || {};
  const rawSongs = Array.isArray(data.list) ? data.list : (Array.isArray(data.songlist) ? data.songlist : []);
  const songs = rawSongs
    .slice(0, num)
    .map(raw => {
      const song = mapQQPlaylistTrack(Object.assign({}, raw, {
        albummid: raw.albummid || albumMid,
        albumname: raw.albumname || data.name || data.title || data.albumname || '',
      }));
      if (song && !song.cover) song.cover = qqAlbumCover(albumMid, 300);
      if (song && !song.albumMid) song.albumMid = albumMid;
      return song;
    })
    .filter(song => song && song.name && (song.mid || song.id));
  const singerName = data.singername || data.singerName || data.singer_name || (songs[0] && songs[0].artist) || '';
  return {
    provider: 'qq',
    album: {
      provider: 'qq',
      mid: albumMid,
      albumMid,
      id: data.id || data.albumid || '',
      name: data.name || data.title || data.albumname || '',
      artist: singerName,
      cover: qqAlbumCover(albumMid, 300),
      releaseDate: data.aDate || data.publictime || data.pub_time || '',
      trackCount: Number(data.total_song_num || data.total || data.songnum || rawSongs.length) || songs.length,
    },
    songs,
    total: Number(data.total_song_num || data.total || data.songnum || rawSongs.length) || songs.length,
  };
}

function mapNeteaseToplistItem(item) {
  item = item || {};
  return {
    provider: 'netease',
    id: String(item.id || ''),
    name: item.name || '',
    cover: item.coverImgUrl || item.coverUrl || '',
    trackCount: Number(item.trackCount || 0) || 0,
    updateFrequency: item.updateFrequency || '',
    description: item.description || '',
  };
}

async function handleNeteaseToplist() {
  const fn = typeof toplist_detail === 'function' ? toplist_detail : toplist;
  const result = await fn({ cookie: userCookie, timestamp: Date.now() });
  const body = result && result.body || result || {};
  const raw = Array.isArray(body.list) ? body.list : [];
  return { provider: 'netease', toplists: raw.map(mapNeteaseToplistItem).filter(item => item.id && item.name) };
}

async function handleNeteaseToplistTracks(id, limit) {
  const listId = String(id || '').trim();
  if (!listId) return { provider: 'netease', error: 'MISSING_TOPLIST_ID', playlist: null, tracks: [] };
  const max = Math.max(1, Math.min(Number(limit) || 200, 500));
  let result = null;
  if (typeof playlist_track_all === 'function') {
    result = await playlist_track_all({ id: listId, limit: max, offset: 0, cookie: userCookie, timestamp: Date.now() });
  } else if (typeof top_list === 'function') {
    result = await top_list({ idx: listId, cookie: userCookie, timestamp: Date.now() });
  }
  const body = result && result.body || result || {};
  const playlist = body.playlist || {};
  const raw = body.songs || body.tracks || playlist.tracks || [];
  const tracks = (Array.isArray(raw) ? raw : []).slice(0, max).map(mapSongRecord).filter(song => song.id && song.name);
  return {
    provider: 'netease',
    playlist: {
      provider: 'netease', id: listId, name: playlist.name || '网易云榜单', cover: playlist.coverImgUrl || '',
      trackCount: Number(playlist.trackCount || 0) || tracks.length, creator: '网易云音乐',
    },
    tracks,
  };
}

function mapQQToplistItem(item, groupName) {
  item = item || {};
  return {
    provider: 'qq',
    id: String(item.topId || item.id || ''),
    name: item.title || item.name || '',
    cover: item.frontPicUrl || item.headPicUrl || item.musichallPicUrl || (item.song && item.song[0] && item.song[0].cover) || '',
    trackCount: Number(item.totalNum || 0) || 0,
    updateFrequency: item.updateType === 1 ? '每日更新' : (item.updateTime || ''),
    group: groupName || '',
    period: item.period || '',
  };
}

async function handleQQToplist() {
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    toplist: { module: 'musicToplist.ToplistInfoServer', method: 'GetAll', param: {} },
  }, { cookie: true });
  const block = json && json.toplist;
  if (!block || Number(block.code || 0) !== 0) return { provider: 'qq', error: block && (block.message || block.msg || block.code) || 'QQ_TOPLIST_FAILED', toplists: [] };
  const groups = block.data && block.data.group || [];
  const toplists = [];
  (Array.isArray(groups) ? groups : []).forEach(group => {
    (Array.isArray(group.toplist) ? group.toplist : []).forEach(item => toplists.push(mapQQToplistItem(item, group.groupName)));
  });
  return { provider: 'qq', toplists: toplists.filter(item => item.id && item.name) };
}

async function handleQQToplistTracks(id, limit) {
  const topId = Number(id || 0);
  const num = Math.max(1, Math.min(Number(limit) || 100, 300));
  if (!topId) return { provider: 'qq', error: 'MISSING_TOPLIST_ID', playlist: null, tracks: [] };
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    detail: {
      module: 'musicToplist.ToplistInfoServer', method: 'GetDetail',
      param: { topid: topId, offset: 0, num, period: '' },
    },
  }, { cookie: true });
  const block = json && json.detail;
  if (!block || Number(block.code || 0) !== 0) return { provider: 'qq', error: block && (block.message || block.msg || block.code) || 'QQ_TOPLIST_TRACKS_FAILED', playlist: null, tracks: [] };
  const data = block.data || {};
  const raw = data.songInfoList || data.song || data.songlist || [];
  const tracks = (Array.isArray(raw) ? raw : []).map(item => mapQQTrack(item && (item.track_info || item.songInfo || item.songinfo) || item, {})).filter(song => song.name && song.id);
  const info = data.data || data.topInfo || data || {};
  return {
    provider: 'qq',
    playlist: { provider: 'qq', id: String(topId), name: info.title || info.name || 'QQ 音乐榜单', cover: info.frontPicUrl || info.headPicUrl || '', trackCount: tracks.length, creator: 'QQ 音乐' },
    tracks,
  };
}

// ==================== QQ 红心 / 我喜欢(dirid 201)====================
// 读取「我喜欢」直接复用已验证的 fetchQQLikedPlaylistMap(dirid=201 返回全部收藏 mid/id 集合),
// 命中即已收藏;写入/删除走 QQ web 端 add2songdir / delbatchsong —— 与开源 jsososo/QQMusicApi 同源端点。
// 注意:加入用 midlist(歌曲 mid),取消用 ids(数字 songid),两个端点入参不同,不能混用。
function qqLikeSongKeys(song) {
  song = song || {};
  const mid = String(song.mid || song.songmid || song.songMid || song.media_mid || '').trim();
  const id = String(song.qqId || song.songid || song.songId || song.id || '').replace(/\D/g, '');
  return { mid, id };
}

async function handleQQLikeCheck(songs) {
  const cookieObj = qqCookieObject();
  if (!qqCookieUin(cookieObj) || !qqCookieMusicKey(cookieObj)) {
    return { provider: 'qq', loggedIn: false, liked: {}, error: 'QQ_AUTH_REQUIRED' };
  }
  let map;
  try { map = await fetchQQLikedPlaylistMap(); }
  catch (err) { return { provider: 'qq', loggedIn: true, liked: {}, error: err.code || err.message || 'QQ_LIKED_UNAVAILABLE' }; }
  const midSet = new Set((map.mids || []).map(String));
  const idSet = new Set((map.ids || []).map(String));
  const liked = {};
  (songs || []).forEach(s => {
    const key = s.key || s.mid || s.id;
    if (!key) return;
    liked[String(key)] = !!((s.mid && midSet.has(String(s.mid))) || (s.id && idSet.has(String(s.id))));
  });
  return { provider: 'qq', loggedIn: true, liked };
}

async function handleQQLikeToggle(song, like) {
  const cookieObj = qqCookieObject();
  const uin = qqCookieUin(cookieObj);
  if (!uin || !qqCookieMusicKey(cookieObj)) return { provider: 'qq', success: false, error: 'QQ_AUTH_REQUIRED' };
  const songId = Number(qqLikeSongKeys(song).id);
  if (!songId) return { provider: 'qq', success: false, error: 'MISSING_SONG_ID' };
  // 走 musicu 现代写接口 music.musicasset.PlaylistDetailWrite(与维护中的 luren-dc/QQMusicApi 同源);
  // 我喜欢 = dirId 201、tid 0;songType 0 = 普通单曲;成功以子请求 data.retCode === 0 为准。
  // 旧的 c.y.qq.com/fcg_music_add2songdir / fcg_music_delbatchsong 已被 QQ 废弃(实测 invalid request / 404)。
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    req: {
      module: 'music.musicasset.PlaylistDetailWrite',
      method: like ? 'AddSonglist' : 'DelSonglist',
      param: { dirId: QQ_LIKED_DIRID, tid: 0, bFmtUtf8: true, v_songInfo: [{ songId, songType: 0 }] },
    },
  }, { cookie: true });
  const block = json && json.req;
  const transport = Number(block && block.code);
  const retCode = Number(block && block.data && block.data.retCode);
  if (transport === 0 && (retCode === 0 || !Number.isFinite(retCode))) return { provider: 'qq', success: true, liked: !!like };
  if (transport === 1000 || retCode === 1000) return { provider: 'qq', success: false, error: 'QQ_AUTH_REQUIRED' };
  return { provider: 'qq', success: false, error: (block && block.data && (block.data.msg || block.data.message)) || ('QQ_FAV_FAILED_ret' + (Number.isFinite(retCode) ? retCode : '?') + '_code' + (Number.isFinite(transport) ? transport : '?')) };
}

async function handleQQSearch(keywords, limit) {
  const kw = String(keywords || '').trim();
  if (!kw) return [];
  console.log('[QQSearch]', kw, 'limit:', limit);
  const base = await qqSmartboxSearch(kw, limit);
  const detailed = await Promise.all(base.map(async item => {
    try { return await qqSongDetail(item.mid, item); }
    catch (e) {
      console.warn('[QQSearch] detail failed:', item.mid, e.message);
      return item;
    }
  }));
  const seen = new Set();
  return detailed.filter(song => {
    const key = song && (song.mid || song.id || (song.name + '|' + song.artist));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return !!song.name;
  });
}

function truthyQQPlaybackHint(value) {
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return value === true || text === '1' || text === 'true' || text === 'yes' || text === 'vip';
}

function qqPlaybackMemberHints(hints) {
  hints = hints || {};
  const fee = Number(hints.fee || hints.Fee || 0) || 0;
  const privilege = Number(hints.privilege || hints.Privilege || hints.mediaPrivilege || hints.media_privilege || 0) || 0;
  return !!(
    truthyQQPlaybackHint(hints.vipRequired) ||
    truthyQQPlaybackHint(hints.needVip) ||
    truthyQQPlaybackHint(hints.onlyVipPlayable) ||
    truthyQQPlaybackHint(hints.only_vip_playable) ||
    fee > 0 ||
    privilege >= 9
  );
}

async function handleQQSongUrl(mid, mediaMid, qualityPreference, playbackHints) {
  const songmid = String(mid || '').trim();
  if (!songmid) return { provider: 'qq', url: '', error: 'MISSING_MID', message: 'Missing QQ song mid' };
  const guid = String(10000000 + Math.floor(Math.random() * 90000000));
  const cookieObj = qqCookieObject();
  const uin = qqCookieUin(cookieObj) || '0';
  const musicKey = qqCookieMusicKey(cookieObj);
  const playbackKey = qqCookiePlaybackKey(cookieObj);
  const fileMediaMid = String(mediaMid || '').trim();
  const requestedQuality = normalizeQualityPreference(qualityPreference);
  const memberTrackHint = qqPlaybackMemberHints(playbackHints);
  const hasQQPlaybackSession = !!(uin && uin !== '0' && musicKey);
  const mediaIds = [];
  if (fileMediaMid) mediaIds.push(fileMediaMid);
  if (songmid && !mediaIds.includes(songmid)) mediaIds.push(songmid);
  const fileCandidates = mediaIds.flatMap(mediaId =>
    qualityCandidatesFrom(requestedQuality, QQ_QUALITY_CANDIDATE_TEMPLATES)
      .map(item => ({ ...item, mediaId, filename: item.prefix + mediaId + item.ext }))
  );
  const filenames = fileCandidates.map(item => item.filename);
  const param = {
    guid,
    songmid: filenames.length ? filenames.map(() => songmid) : [songmid],
    songtype: filenames.length ? filenames.map(() => 0) : [0],
    uin,
    loginflag: 1,
    platform: '20',
  };
  if (filenames.length) param.filename = filenames;
  const comm = { uin, format: 'json', ct: musicKey ? 19 : 24, cv: 0 };
  if (musicKey) comm.authst = musicKey;
  const json = await qqMusicRequest({
    comm,
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param,
    },
  }, { cookie: true });
  const data = json && json.req_0 && json.req_0.data;
  const infos = (data && Array.isArray(data.midurlinfo)) ? data.midurlinfo : [];
  const sipBase = (data && data.sip && data.sip[0]) || 'https://ws.stream.qqmusic.qq.com/';
  // vkey 会给"不存在的文件"照常签名(如无 Hi-Res 版权的歌请求 RS01),CDN 一取就 404 →
  // 前端播放失败→自动降级 320。逐个候选 Range 探活,取第一个真实存在的(用户实测根因)。
  let info = null;
  for (const cand of infos) {
    if (!cand || !cand.purl) continue;
    try {
      const probeCtrl = new AbortController();
      const probeTimer = setTimeout(() => probeCtrl.abort(), 4500);
      const probeRes = await fetch(sipBase + cand.purl, { headers: { Range: 'bytes=0-0', 'User-Agent': UA }, signal: probeCtrl.signal });
      clearTimeout(probeTimer);
      try { probeRes.body && probeRes.body.cancel && probeRes.body.cancel(); } catch (e) {}
      if (probeRes.status === 200 || probeRes.status === 206) { info = cand; break; }
    } catch (e) { /* 探活超时/网络错:跳过该档 */ }
  }
  if (!info) info = infos.find(item => item && item.purl) || infos[0];
  const purl = info && info.purl;
  if (purl) {
    const sip = sipBase;
    const fileMeta = fileCandidates.find(item => item.filename === info.filename) || {};
    const playbackVipEvidence = memberTrackHint && hasQQPlaybackSession;
    return {
      provider: 'qq',
      url: sip + purl,
      trial: false,
      playable: true,
      playbackReady: true,
      loggedIn: hasQQPlaybackSession,
      userId: hasQQPlaybackSession ? uin : '',
      playbackKeyReady: !!(uin && playbackKey),
      vipRequired: memberTrackHint,
      vipEvidence: playbackVipEvidence,
      vipSource: playbackVipEvidence ? 'member-track-playback' : '',
      level: fileMeta.level || info.filename || '',
      quality: fileMeta.label || info.filename || '',
      filename: info.filename || '',
      requestedQuality,
    };
  }
  const restriction = classifyQQPlaybackRestriction(info, {
    hasSession: !!(uin && musicKey),
    hasPlaybackKey: !!(uin && playbackKey),
  });
  return {
    provider: 'qq',
    url: '',
    playable: false,
    error: 'QQ_URL_UNAVAILABLE',
    loggedIn: hasQQPlaybackSession,
    playbackKeyReady: !!(uin && playbackKey),
    userId: hasQQPlaybackSession ? uin : '',
    vipRequired: memberTrackHint,
    restriction,
    reason: restriction.category,
    message: restriction.message,
    qqCode: info && (info.result || info.code || info.errtype),
    rawMessage: info && (info.msg || info.tips || info.errmsg || ''),
    tried: fileCandidates.map(item => item.label + ' · ' + item.filename),
    requestedQuality,
  };
}

function mapQQComment(raw) {
  raw = raw || {};
  const user = raw.user || raw.uin || {};
  const nickname = raw.nick || raw.nickname || raw.encrypt_uin || user.nick || user.nickname || user.name || 'QQ 音乐用户';
  const avatar = raw.avatarurl || raw.avatar || user.avatarurl || user.avatar || '';
  const timeRaw = Number(raw.time || raw.commenttime || raw.createTime || 0) || 0;
  return {
    id: raw.commentid || raw.commentId || raw.id || '',
    content: raw.rootcommentcontent || raw.content || raw.comment || '',
    likedCount: Number(raw.praisenum || raw.praise_num || raw.likedCount || 0) || 0,
    time: timeRaw && timeRaw < 10000000000 ? timeRaw * 1000 : timeRaw,
    user: {
      id: raw.encrypt_uin || raw.uin || user.uin || '',
      nickname,
      avatar,
    },
  };
}

async function handleQQSongComments(id, mid, limit, offset) {
  let topid = String(id || '').replace(/\D/g, '');
  if (!topid && mid) {
    try {
      const detail = await qqSongDetail(mid, { mid });
      topid = String((detail && (detail.qqId || detail.id)) || '').replace(/\D/g, '');
    } catch (e) {
      console.warn('[QQComments] detail fallback failed:', e.message);
    }
  }
  if (!topid) return { provider: 'qq', error: 'Missing QQ song id', comments: [] };
  const page = Math.max(0, Math.floor((offset || 0) / Math.max(1, limit || 20)));
  const uin = qqCookieUin() || '0';
  const body = await qqGetJSON('https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg', {
    g_tk: '5381',
    loginUin: uin,
    hostUin: '0',
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: '0',
    platform: 'yqq.json',
    needNewCode: '0',
    cid: '205360772',
    reqtype: '2',
    biztype: '1',
    topid,
    cmd: '8',
    needmusiccrit: '0',
    pagenum: String(page),
    pagesize: String(limit || 20),
  }, { headers: { Referer: 'https://y.qq.com/n/ryqq/songDetail/' + encodeURIComponent(mid || topid) } });
  const hotList = body && body.hot_comment && body.hot_comment.commentlist;
  const normalList = body && body.comment && body.comment.commentlist;
  const raw = (offset === 0 && Array.isArray(hotList) && hotList.length) ? hotList : (normalList || []);
  const comments = (raw || []).map(mapQQComment).filter(c => c.content);
  const total = Number(body && body.comment && (body.comment.commenttotal || body.comment.comment_total)) || comments.length;
  return { provider: 'qq', id: topid, total, comments, hot: !!(offset === 0 && Array.isArray(hotList) && hotList.length) };
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

function decodeQQLyricText(text) {
  let raw = decodeHtmlEntities(String(text || '').trim());
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '');
  const looksBase64 = compact.length >= 8 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
  if (looksBase64 && !/^\s*\[/.test(raw)) {
    try {
      const decoded = Buffer.from(compact, 'base64').toString('utf8').replace(/^\uFEFF/, '');
      if (decoded && (decoded.includes('[') || /[\u4e00-\u9fa5]/.test(decoded))) raw = decoded;
    } catch (e) {
      console.warn('[QQLyric] base64 decode failed:', e.message);
    }
  }
  return decodeHtmlEntities(raw).replace(/\r\n/g, '\n').trim();
}

function normalizeQQSongId(id) {
  const n = String(id || '').replace(/\D/g, '');
  return n ? Number(n) : 0;
}

async function handleQQLyric(mid, id) {
  const songMID = String(mid || '').trim();
  const songID = normalizeQQSongId(id);
  if (!songMID && !songID) return { provider: 'qq', error: 'Missing QQ song mid or id', lyric: '' };

  let lyricText = '';
  let transText = '';
  let qrcText = '';
  let romaText = '';
  let source = 'qq-musicu';

  try {
    // trans:1/roma:1 等旗标必带,否则 QQ 不下发翻译歌词(用户实测"开了双语翻译看不到翻译")
    // qrc 必须为 0:置 1 时 QQ 改发加密 QRC,普通歌词解码变空(实测翻车过)。此参数组合已实测:lyric+trans 都是明文 base64
    const param = { crypt: 0, lrc_t: 0, qrc: 0, qrc_t: 0, roma: 1, roma_t: 0, trans: 1, trans_t: 0, type: -1, interval: 0 };
    if (songMID) param.songMID = songMID;
    if (songID) param.songID = songID;
    const json = await qqMusicRequest({
      comm: { ct: 24, cv: 0 },
      lyric: {
        module: 'music.musichallSong.PlayLyricInfo',
        method: 'GetPlayLyricInfo',
        param,
      },
    }, { cookie: true });
    const data = json && json.lyric && json.lyric.data;
    lyricText = decodeQQLyricText(data && data.lyric);
    transText = decodeQQLyricText(data && data.trans);
    qrcText = decodeQQLyricText(data && data.qrc);
    romaText = decodeQQLyricText(data && data.roma);
  } catch (e) {
    console.warn('[QQLyric] musicu failed:', e.message);
  }

  if (!lyricText && songMID) {
    try {
      const body = await qqGetJSON('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
        songmid: songMID,
        songtype: '0',
        format: 'json',
        nobase64: '1',
        g_tk: '5381',
        loginUin: qqCookieUin() || '0',
        hostUin: '0',
        inCharset: 'utf8',
        outCharset: 'utf-8',
        notice: '0',
        platform: 'yqq.json',
        needNewCode: '0',
      }, { headers: { Referer: 'https://y.qq.com/portal/player.html' } });
      lyricText = decodeQQLyricText(body && body.lyric);
      transText = decodeQQLyricText(body && (body.trans || body.tlyric)) || transText;
      source = 'qq-legacy';
    } catch (e) {
      console.warn('[QQLyric] legacy failed:', e.message);
    }
  }

  // 逐字歌词(qrc):单独再发一次 crypt:1&qrc:1(与上面 crypt:0 明文请求分开,零回归)。
  // crypt:1 时逐字密文回落在 data.lyric(hex),解密+归一为网易 yrc;有明文歌词才值得取,
  // 任何环节失败都静默降级回逐行(yrc 留空,前端自动用 lrc)。
  let yrcText = '';
  if (lyricText) {
    try {
      const qparam = { crypt: 1, lrc_t: 0, qrc: 1, qrc_t: 0, roma: 0, roma_t: 0, trans: 0, trans_t: 0, type: -1, interval: 0 };
      if (songMID) qparam.songMID = songMID;
      if (songID) qparam.songID = songID;
      const qjson = await qqMusicRequest({
        comm: { ct: 24, cv: 0 },
        lyric: { module: 'music.musichallSong.PlayLyricInfo', method: 'GetPlayLyricInfo', param: qparam },
      }, { cookie: true });
      const qdata = qjson && qjson.lyric && qjson.lyric.data;
      yrcText = qrcHexToYrc(qdata && qdata.lyric);
    } catch (e) {
      console.warn('[QQLyric] qrc failed:', e.message);
    }
  }

  return {
    provider: 'qq',
    id: songID || '',
    mid: songMID,
    lyric: lyricText,
    tlyric: transText,
    yrc: yrcText,
    qrc: qrcText,
    roma: romaText,
    source: lyricText ? (yrcText ? source + '+qrc' : source) : 'qq-empty',
  };
}

function mapPodcastRadio(r) {
  r = r || {};
  const dj = r.dj || r.djSimple || r.djUser || r.creator || {};
  const id = r.id || r.rid || r.radioId;
  return {
    id,
    rid: id,
    name: r.name || r.radioName || '',
    cover: r.picUrl || r.picURL || r.coverUrl || r.coverImgUrl || r.avatarUrl || '',
    desc: r.desc || r.description || r.rcmdText || '',
    djName: dj.nickname || r.djName || r.nickname || '',
    category: r.category || r.categoryName || '',
    programCount: r.programCount || r.programNum || r.programCnt || 0,
    subCount: r.subCount || r.subedCount || r.subscriberCount || 0,
  };
}

function mapPodcastProgram(p, fallbackRadio) {
  p = p || {};
  const mainSong = p.mainSong || p.song || p.mainTrack || {};
  const radio = p.radio || fallbackRadio || {};
  const mappedRadio = mapPodcastRadio(radio);
  const artists = mapArtists(mainSong.ar || mainSong.artists || []);
  const album = mainSong.al || mainSong.album || {};
  const dj = p.dj || radio.dj || {};
  const playableId = mainSong.id || p.mainSongId || p.songId;
  return {
    type: 'podcast',
    source: 'podcast',
    id: playableId,
    programId: p.id || p.programId,
    radioId: mappedRadio.id,
    name: p.name || mainSong.name || '',
    artist: mappedRadio.name || dj.nickname || artists.map(a => a.name).join(' / ') || mappedRadio.djName || '',
    artists,
    artistId: artists[0] && artists[0].id,
    album: mappedRadio.name || album.name || 'Podcast',
    cover: p.coverUrl || p.cover || p.blurCoverUrl || mappedRadio.cover || album.picUrl || '',
    duration: p.duration || mainSong.dt || mainSong.duration || 0,
    fee: mainSong.fee,
    djName: mappedRadio.djName || dj.nickname || '',
    radioName: mappedRadio.name || '',
    desc: p.description || p.desc || '',
    createTime: p.createTime || 0,
    serialNum: p.serialNum || p.serial || 0,
  };
}

function firstArrayFrom(obj, keys) {
  obj = obj || {};
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.list)) return value.list;
    if (value && Array.isArray(value.data)) return value.data;
    if (value && Array.isArray(value.resources)) return value.resources;
  }
  return [];
}

function mapPodcastVoice(v) {
  v = v || {};
  const raw = v.resource || v.voice || v.data || v.program || v;
  const mainSong = raw.mainSong || raw.song || raw.track || {};
  const radio = raw.radio || raw.djRadio || raw.voiceList || raw.podcast || {};
  const playableId = raw.trackId || raw.songId || raw.mainSongId || mainSong.id || raw.id;
  return {
    type: 'podcast',
    source: 'podcast',
    sourceType: 'podcast-voice',
    id: playableId,
    programId: raw.programId || raw.voiceId || raw.id,
    radioId: radio.id || radio.radioId || radio.voiceListId || raw.radioId || raw.voiceListId,
    name: raw.name || raw.songName || raw.title || mainSong.name || '',
    artist: (radio.name || radio.radioName || radio.voiceListName || raw.podcastName || raw.djName || 'Voice'),
    album: radio.name || radio.radioName || raw.podcastName || 'Podcast',
    cover: raw.coverUrl || raw.cover || raw.picUrl || raw.coverImgUrl || radio.picUrl || radio.coverUrl || '',
    duration: raw.duration || raw.durationMs || mainSong.dt || mainSong.duration || 0,
    djName: raw.djName || (radio.dj && radio.dj.nickname) || '',
    radioName: radio.name || radio.radioName || raw.podcastName || '',
    desc: raw.desc || raw.description || '',
  };
}

function mapPodcastCollectionRadio(r, key) {
  const radio = mapPodcastRadio(r);
  return {
    ...radio,
    type: 'podcast-radio',
    sourceType: 'podcast-radio',
    collectionKey: key || '',
    radioId: radio.id,
    name: radio.name,
    artist: radio.djName || radio.category || 'Podcast',
    album: radio.category || 'Podcast',
  };
}

function podcastCollectionMeta(key, items) {
  const meta = {
    collect: { key: 'collect', title: '收藏播客', sub: '你收藏的播客', itemType: 'radio' },
    created: { key: 'created', title: '创建播客', sub: '你创建的播客', itemType: 'radio' },
    liked: { key: 'liked', title: '喜欢的声音', sub: '收藏或最近喜欢的声音', itemType: 'voice' },
  }[key] || { key, title: key, sub: '', itemType: 'radio' };
  const first = (items || [])[0] || {};
  return {
    ...meta,
    count: (items || []).length,
    cover: first.cover || first.picUrl || first.coverUrl || '',
  };
}

async function fetchMyPodcastItems(key, info, limit, offset) {
  limit = Math.max(8, Math.min(60, Number(limit) || 30));
  offset = Math.max(0, Number(offset) || 0);
  if (key === 'collect') {
    const r = await dj_sublist({ limit, offset, cookie: userCookie, timestamp: Date.now() });
    const raw = firstArrayFrom(r.body, ['djRadios', 'djradios', 'radios', 'data']);
    return { itemType: 'radio', items: raw.map(x => mapPodcastCollectionRadio(x, key)).filter(x => x.id) };
  }
  if (key === 'created') {
    const r = await user_audio({ uid: info.userId, cookie: userCookie, timestamp: Date.now() });
    const raw = firstArrayFrom(r.body, ['data', 'djRadios', 'djradios', 'radios']);
    return { itemType: 'radio', items: raw.map(x => mapPodcastCollectionRadio(x, key)).filter(x => x.id) };
  }
  if (key === 'paid') {
    const r = await dj_paygift({ limit, offset, cookie: userCookie, timestamp: Date.now() });
    const raw = firstArrayFrom(r.body, ['data', 'djRadios', 'djradios', 'radios']);
    return { itemType: 'radio', items: raw.map(x => mapPodcastCollectionRadio(x, key)).filter(x => x.id) };
  }
  if (key === 'liked') {
    let raw = [];
    try {
      const sati = await sati_resource_sub_list({ cookie: userCookie, timestamp: Date.now() });
      raw = firstArrayFrom(sati.body, ['data', 'resources', 'list']);
    } catch (e) {
      console.warn('[MyPodcastLiked] sati sub list failed:', e.message);
    }
    if (!raw.length) {
      try {
        const recent = await record_recent_voice({ limit, cookie: userCookie, timestamp: Date.now() });
        raw = firstArrayFrom(recent.body, ['data', 'list', 'resources']);
      } catch (e) {
        console.warn('[MyPodcastLiked] recent voice fallback failed:', e.message);
      }
    }
    return { itemType: 'voice', items: raw.map(mapPodcastVoice).filter(x => x.id && x.name) };
  }
  return { itemType: 'radio', items: [] };
}

// ---------- 业务: 取歌曲URL (探测试听) ----------
//   返回 { url, trial, level, br }
//   trial=true 表示这是试听片段 (freeTrialInfo 非空)
async function handleSongUrl(id, loginInfo, qualityPreference) {
  console.log('[SongUrl] id:', id, 'logged-in:', !!userCookie);
  const requestedQuality = normalizeQualityPreference(qualityPreference);
  const svipReady = hasNeteaseSvip(loginInfo);
  const qualities = qualityCandidatesFrom(requestedQuality, NETEASE_QUALITY_CANDIDATES)
    .filter(q => !q.svip || svipReady);

  let trialFallback = null; // 兜底: 即使是试听也要能播
  let lastData = null;
  let lastError = null;

  for (const q of qualities) {
    try {
      // 优先用 v1 接口 (支持更高音质 level 字段)
      let result;
      try {
        result = await song_url_v1({ id, level: q.level, cookie: userCookie });
      } catch (e) {
        result = await song_url({ id, br: q.br, cookie: userCookie });
      }
      const d = result.body && result.body.data && result.body.data[0];
      if (d) lastData = d;
      const url = d && d.url;
      const freeTrial = d && d.freeTrialInfo;
      console.log('[SongUrl]', q.level, '->', url ? 'OK' : 'no url', freeTrial ? '(TRIAL)' : '');
      if (url && !freeTrial) {
        return { url, trial: false, playable: true, level: q.level, quality: q.label, br: d.br, requestedQuality };
      }
      if (url && freeTrial && !trialFallback) {
        trialFallback = {
          url,
          trial: true,
          playable: true,
          level: q.level,
          quality: q.label,
          br: d.br,
          requestedQuality,
          trialInfo: freeTrial,
          restriction: classifyNeteasePlaybackRestriction(d, loginInfo),
        };
      }
    } catch (err) {
      lastError = err;
      console.log('[SongUrl]', q.level, 'failed:', err.message);
    }
  }
  if (trialFallback) return trialFallback;
  const restriction = classifyNeteasePlaybackRestriction(lastData, loginInfo);
  return {
    url: null,
    trial: false,
    playable: false,
    reason: restriction.category,
    message: restriction.message,
    restriction,
    lastCode: lastData && lastData.code,
    fee: lastData && lastData.fee,
    error: lastError && lastError.message,
    requestedQuality,
  };
}

// ---------- 业务: 登录态/用户信息 ----------
function readCookieFromResponse(resp) {
  const candidates = [
    resp && resp.cookie,
    resp && resp.body && resp.body.cookie,
    resp && resp.body && resp.body.data && resp.body.data.cookie,
    resp && resp.body && resp.body.data && resp.body.data.cookies,
  ];
  for (const candidate of candidates) {
    const cookie = normalizeCookieHeader(candidate);
    if (cookie) return cookie;
  }
  return '';
}
function firstPositiveNumberFrom(objects, keys) {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    for (const key of keys) {
      const value = Number(obj[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return 0;
}
function collectStringValues(value, out, depth) {
  if (depth > 4 || value == null) return out;
  if (typeof value === 'string') {
    if (value) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectStringValues(item, out, depth + 1));
    return out;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach(key => collectStringValues(value[key], out, depth + 1));
  }
  return out;
}
function collectVipStringValues(value, out, depth) {
  if (depth > 4 || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach(item => collectVipStringValues(item, out, depth + 1));
    return out;
  }
  if (typeof value !== 'object') return out;
  Object.keys(value).forEach(key => {
    const child = value[key];
    if (/vip|svip|member|associator|privilege|right|level|package|label|title|type/i.test(key)) {
      collectStringValues(child, out, depth + 1);
    } else if (child && typeof child === 'object') {
      collectVipStringValues(child, out, depth + 1);
    }
  });
  return out;
}
const neteaseVipInfoCache = new Map();
function activeNeteaseVipPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return false;
  const expire = Number(pkg.expireTime || pkg.expire_time || pkg.expire || pkg.endTime || 0) || 0;
  if (expire && expire < Date.now()) return false;
  return firstPositiveNumberFrom([pkg], ['vipLevel', 'vip_level', 'level', 'vipType', 'vip_type', 'vipCode', 'vip_code', 'status']) > 0;
}
async function fetchNeteaseVipInfo(userId) {
  userId = String(userId || '').trim();
  if (!userId || !userCookie) return null;
  const cached = neteaseVipInfoCache.get(userId);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.value;
  let body = null;
  try {
    const r = await vip_info_v2({ uid: userId, cookie: userCookie, timestamp: Date.now() });
    body = r && r.body ? r.body : r;
  } catch (e) {
    try {
      const r = await vip_info({ uid: userId, cookie: userCookie, timestamp: Date.now() });
      body = r && r.body ? r.body : r;
    } catch (err) {
      console.warn('[Login] vip_info failed:', err.message);
    }
  }
  if (body) neteaseVipInfoCache.set(userId, { at: Date.now(), value: body });
  return body;
}
function normalizeNeteaseVip(profile, account, extra) {
  profile = profile || {};
  account = account || {};
  extra = extra || {};
  const vipInfo = profile.vipInfo || profile.vipinfo || account.vipInfo || account.vipinfo || extra.vipInfo || extra.vipinfo || {};
  const vipExtra = extra.vipExtra || extra.vip_info || extra.vipInfoV2 || {};
  const vipData = vipExtra.data || vipExtra;
  const objects = [account, profile, vipInfo, extra, vipData];
  const vipType = firstPositiveNumberFrom(objects, [
    'vipType', 'vip_type', 'viptype', 'musicVipType', 'music_vip_type',
    'musicVipLevel', 'music_vip_level', 'redVipLevel', 'red_vip_level',
    'blackVipLevel', 'black_vip_level', 'luxuryVipLevel', 'luxury_vip_level',
  ]);
  const text = collectVipStringValues({ account, profile, vipInfo, extra, vipData }, [], 0).join(' ').toLowerCase();
  const redplus = vipData.redplus || vipData.redPlus || vipInfo.redplus || vipInfo.redPlus || extra.redplus || extra.redPlus;
  const associator = vipData.associator || vipInfo.associator || extra.associator;
  const musicPackage = vipData.musicPackage || vipData.music_package || vipInfo.musicPackage || vipInfo.music_package || extra.musicPackage || extra.music_package;
  const svipType = firstPositiveNumberFrom(objects, [
    'svipType', 'svip_type', 'superVipLevel', 'super_vip_level', 'superVipType', 'super_vip_type',
  ]);
  const svipFlag = objects.some(obj => obj && (
    obj.isSvip === true || obj.is_svip === true || obj.svip === true ||
    Number(obj.isSvip || obj.is_svip || obj.svip || obj.svipType || obj.svip_type || obj.superVipLevel || obj.super_vip_level || 0) > 0
  )) || /svip|supervip|super_vip|黑胶svip|超级会员/.test(text);
  const vipFlag = objects.some(obj => obj && (
    obj.isVip === true || obj.is_vip === true || obj.vip === true ||
    Number(obj.isVip || obj.is_vip || obj.vip || obj.vipFlag || obj.vipflag || 0) > 0
  )) || /vip|黑胶|会员/.test(text);
  const svipResolved = svipFlag || svipType > 0 || activeNeteaseVipPackage(redplus);
  const vipResolved = vipFlag || activeNeteaseVipPackage(associator) || activeNeteaseVipPackage(musicPackage);
  const isSvip = svipResolved;
  const isVip = isSvip || vipResolved || vipType > 0;
  const vipLevel = isSvip ? 'svip' : (isVip ? 'vip' : 'none');
  return {
    vipType,
    vipLevel,
    isVip,
    isSvip,
    vipLabel: vipLevel === 'svip' ? 'SVIP' : (vipLevel === 'vip' ? 'VIP' : '无VIP'),
  };
}
function normalizeLoginInfo(profile, account, extra) {
  profile = profile || {};
  account = account || {};
  const userId = profile.userId || profile.user_id || profile.id || account.userId || account.id || '';
  if (!(userId || userId === 0)) return { loggedIn: false };
  const vip = normalizeNeteaseVip(profile, account, extra);
  return {
    loggedIn: true,
    userId,
    nickname: profile.nickname || profile.userName || '网易云用户',
    avatar: profile.avatarUrl || profile.avatar || '',
    ...vip,
  };
}
async function enrichNeteaseLoginInfo(info, profile, account, extra) {
  if (!info || !info.loggedIn || !info.userId) return info;
  const vipExtra = await fetchNeteaseVipInfo(info.userId);
  if (!vipExtra) return info;
  const vip = normalizeNeteaseVip(profile, account, { ...(extra || {}), vipExtra });
  return { ...info, ...vip };
}
function isNeteaseAuthInvalidPayload(payload) {
  const code = normalizeApiCode(payload);
  if (code === 301 || code === 401) return true;
  const msg = normalizeApiMessage(payload);
  return /未登录|需要登录|请先登录|login/i.test(msg) && code >= 300;
}
async function getLoginInfo() {
  if (!userCookie) return { loggedIn: false, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };

  // login_status 对二维码 cookie 的资料刷新通常更及时；失败时再降级到 user_account。
  try {
    const st = await login_status({ cookie: userCookie, timestamp: Date.now() });
    const body = st.body || {};
    const data = body.data || body;
    const profile = data.profile || body.profile;
    const account = data.account || body.account;
    const info = normalizeLoginInfo(profile, account, data);
    if (info.loggedIn) return await enrichNeteaseLoginInfo(info, profile, account, data);
  } catch (e) {
    console.warn('[Login] login_status failed:', e.message);
  }

  try {
    const acc = await user_account({ cookie: userCookie, timestamp: Date.now() });
    const body = acc.body || {};
    const info = normalizeLoginInfo(body.profile, body.account, body);
    if (info.loggedIn) return await enrichNeteaseLoginInfo(info, body.profile, body.account, body);
    if (isNeteaseAuthInvalidPayload(acc)) saveCookie('');
    return { loggedIn: false, hasCookie: !!userCookie, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };
  } catch (e) {
    console.warn('[Login] account check failed:', e.message);
    return { loggedIn: false, hasCookie: !!userCookie, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };
  }
}

// ====================================================================
//  HTTP Server
// ====================================================================
const server = http.createServer(async (req, res) => {
  refreshConfiguredCookieStores(false);
  const url = new URL(req.url, 'http://localhost:' + PORT);
  const pn = url.pathname;

  if (pn === '/api/app/version') {
    sendJSON(res, {
      name: APP_PACKAGE.name || 'mineradio',
      productName: APP_PACKAGE.productName || 'Mineradio',
      version: APP_VERSION,
      update: {
        provider: UPDATE_CONFIG.provider,
        configured: UPDATE_CONFIG.configured,
        owner: UPDATE_CONFIG.owner,
        repo: UPDATE_CONFIG.repo,
        preview: UPDATE_CONFIG.preview,
        manifestOverride: !!UPDATE_CONFIG.manifest,
      },
    });
    return;
  }

  if (pn === '/api/update/latest') {
    try {
      sendJSON(res, await fetchLatestUpdateInfo());
    } catch (err) {
      sendJSON(res, {
        ...localUpdateFallback(err.message || 'Update check failed', { configured: UPDATE_CONFIG.configured }),
        error: err.message || 'Update check failed',
      });
    }
    return;
  }

  if (pn === '/api/update/download') {
    try {
      const info = await fetchLatestUpdateInfo();
      const job = startUpdateDownloadJob(info);
      sendJSON(res, job, job.ok ? 200 : 400);
    } catch (err) {
      console.error('[UpdateDownload]', err);
      sendJSON(res, { ok: false, error: err.message || 'UPDATE_DOWNLOAD_START_FAILED' }, 500);
    }
    return;
  }

  if (pn === '/api/update/download/status') {
    const id = url.searchParams.get('id') || '';
    const job = id
      ? updateDownloadJobs.get(id)
      : Array.from(updateDownloadJobs.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    sendJSON(res, publicUpdateJob(job), job ? 200 : 404);
    return;
  }

  if (pn === '/api/update/patch') {
    try {
      const info = await fetchLatestUpdateInfo();
      const job = startUpdatePatchJob(info);
      sendJSON(res, job, job.ok ? 200 : 400);
    } catch (err) {
      console.error('[UpdatePatch]', err);
      sendJSON(res, { ok: false, error: err.message || 'UPDATE_PATCH_START_FAILED' }, 500);
    }
    return;
  }

  if (pn === '/api/update/patch/status') {
    const id = url.searchParams.get('id') || '';
    const job = id
      ? updateDownloadJobs.get(id)
      : Array.from(updateDownloadJobs.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).find(item => item.mode === 'patch');
    sendJSON(res, publicUpdateJob(job), job ? 200 : 404);
    return;
  }

  if (pn === '/api/beatmap/cache/status') {
    const info = beatCacheRootInfo();
    sendJSON(res, {
      enabled: info.allowed && info.available,
      dir: info.dir,
      drive: info.drive,
      reason: !info.allowed ? 'C_DRIVE_DISABLED' : (!info.available ? 'TARGET_DRIVE_UNAVAILABLE' : ''),
      mode: info.allowed && info.available ? 'disk' : 'memory-only',
    });
    return;
  }

  if (pn === '/api/beatmap/cache') {
    if (req.method === 'GET') {
      const key = url.searchParams.get('key') || '';
      try {
        const entry = readBeatMapCache(key);
        sendJSON(res, entry
          ? { ok: true, hit: true, key: entry.key || key, map: entry.map, meta: entry.meta || {}, savedAt: entry.savedAt || 0 }
          : { ok: true, hit: false, key });
      } catch (err) {
        const info = err.info || beatCacheRootInfo();
        sendJSON(res, {
          ok: false,
          hit: false,
          enabled: false,
          mode: 'memory-only',
          key,
          reason: err.code || err.message || 'BEAT_CACHE_READ_FAILED',
          dir: info.dir,
        });
      }
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readRequestBody(req);
        sendJSON(res, writeBeatMapCache(body));
      } catch (err) {
        const info = err.info || beatCacheRootInfo();
        sendJSON(res, {
          ok: false,
          enabled: false,
          mode: 'memory-only',
          reason: err.code || err.message || 'BEAT_CACHE_WRITE_FAILED',
          dir: info.dir,
        });
      }
      return;
    }

    sendJSON(res, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    return;
  }

  if (pn === '/api/discover/home') {
    try {
      sendJSON(res, await handleDiscoverHome());
    } catch (err) {
      console.error('[DiscoverHome]', err);
      sendJSON(res, { error: err.message, loggedIn: false, dailySongs: [], personalFm: [], playlists: [], podcasts: [] }, 500);
    }
    return;
  }

  if (pn === '/api/weather/radio') {
    try {
      const data = await buildWeatherRadio({
        city: url.searchParams.get('city') || url.searchParams.get('q') || '',
        lat: url.searchParams.get('lat'),
        lon: url.searchParams.get('lon'),
        timezone: url.searchParams.get('timezone') || '',
      });
      sendJSON(res, data);
    } catch (err) {
      console.error('[WeatherRadio]', err);
      sendJSON(res, {
        ok: false,
        error: err.message,
        weather: null,
        radio: { title: '天气电台', subtitle: '天气暂时没有回来，可以先听今日推荐。', seedQueries: [], songs: [] },
      }, 500);
    }
    return;
  }

  if (pn === '/api/weather/ip-location') {
    try {
      sendJSON(res, { ok: true, location: await fetchIpWeatherLocation() });
    } catch (err) {
      console.error('[WeatherIpLocation]', err);
      sendJSON(res, { ok: false, error: err.message, location: null }, 500);
    }
    return;
  }

  // ---------- 搜索 ----------
  if (pn === '/api/search') {
    try {
      const kw    = url.searchParams.get('keywords') || '';
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const songs = await handleSearch(kw, limit);
      sendJSON(res, { songs });
    } catch (err) { console.error('[Search]', err); sendJSON(res, { error: err.message, songs: [] }, 500); }
    return;
  }

  if (pn === '/api/qq/search') {
    try {
      const kw = url.searchParams.get('keywords') || '';
      const limit = Math.max(4, Math.min(12, parseInt(url.searchParams.get('limit') || '8', 10) || 8));
      const songs = await handleQQSearch(kw, limit);
      sendJSON(res, { provider: 'qq', songs });
    } catch (err) {
      console.error('[QQSearch]', err);
      sendJSON(res, { provider: 'qq', error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/search') {
    try {
      const kw = url.searchParams.get('keywords') || '';
      const limit = Math.max(4, Math.min(12, parseInt(url.searchParams.get('limit') || '8', 10) || 8));
      const songs = await handleKugouSearch(kw, limit, kugouCookie);
      sendJSON(res, { provider: 'kugou', songs });
    } catch (err) {
      console.error('[KugouSearch]', err);
      sendJSON(res, { provider: 'kugou', error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/status') {
    try {
      sendJSON(res, await handleSpotifyStatus());
    } catch (err) {
      console.error('[SpotifyStatus]', err);
      sendJSON(res, { provider: 'spotify', configured: false, loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/config') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { provider: 'spotify', ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      const saved = saveSpotifyConfig(body);
      const status = await handleSpotifyStatus();
      sendJSON(res, Object.assign({}, status, saved, {
        ok: true,
        configured: true,
        oauthConfigured: true,
        message: status.loggedIn
          ? status.message
          : 'Spotify Client ID 已保存，可打开官方 OAuth 授权。'
      }));
    } catch (err) {
      console.error('[SpotifyConfig]', err);
      const missing = err && err.missing || [];
      sendJSON(res, {
        provider: 'spotify',
        ok: false,
        configured: getSpotifyConfig().configured,
        loggedIn: false,
        error: err.code || err.message,
        message: err.code === 'SPOTIFY_CLIENT_ID_REQUIRED' || err.message === 'SPOTIFY_CLIENT_ID_REQUIRED'
          ? '请先粘贴 Spotify Client ID。'
          : err.message,
        missing,
      }, err && err.code === 'SPOTIFY_CLIENT_ID_REQUIRED' ? 400 : 500);
    }
    return;
  }

  if (pn === '/api/spotify/logout') {
    try {
      sendJSON(res, clearSpotifyToken());
    } catch (err) {
      console.error('[SpotifyLogout]', err);
      sendJSON(res, { provider: 'spotify', ok: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/user/playlists') {
    try {
      const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '300', 10) || 300));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      sendJSON(res, await handleSpotifyUserPlaylists({ limit, offset }));
    } catch (err) {
      console.error('[SpotifyUserPlaylists]', err);
      sendJSON(res, { provider: 'spotify', loggedIn: false, error: err.message, playlists: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/playlist/tracks') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('playlistId') || '';
      const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '48', 10) || 48));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      sendJSON(res, await handleSpotifyPlaylistTracks(id, { limit, offset, market: url.searchParams.get('market') || '' }));
    } catch (err) {
      console.error('[SpotifyPlaylistTracks]', err);
      sendJSON(res, { provider: 'spotify', error: err.message, tracks: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/album/detail') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('albumId') || '';
      const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '80', 10) || 80));
      sendJSON(res, await handleSpotifyAlbumDetail(id, { limit, market: url.searchParams.get('market') || '' }));
    } catch (err) {
      console.error('[SpotifyAlbumDetail]', err);
      sendJSON(res, { provider: 'spotify', error: err.message, album: null, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/search') {
    try {
      const kw = url.searchParams.get('keywords') || '';
      const limit = Math.max(4, Math.min(18, parseInt(url.searchParams.get('limit') || '8', 10) || 8));
      sendJSON(res, await handleSpotifySearch(kw, limit));
    } catch (err) {
      console.error('[SpotifySearch]', err);
      sendJSON(res, { provider: 'spotify', configured: getSpotifyConfig().configured, error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/song/url') {
    try {
      sendJSON(res, await handleSpotifySongUrl({
        id: url.searchParams.get('id') || '',
        providerSongId: url.searchParams.get('providerSongId') || '',
        spotifyId: url.searchParams.get('spotifyId') || '',
        uri: url.searchParams.get('uri') || '',
      }));
    } catch (err) {
      console.error('[SpotifySongUrl]', err);
      sendJSON(res, { provider: 'spotify', url: '', playable: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/lyric') {
    try {
      const id = url.searchParams.get('id') || '';
      sendJSON(res, await handleSpotifyLyric(id));
    } catch (err) {
      console.error('[SpotifyLyric]', err);
      sendJSON(res, { provider: 'spotify', error: err.message, lyric: '', tlyric: '', yrc: '', ytlrc: '' }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/status') {
    try {
      sendJSON(res, await handleQishuiStatus(qishuiCookie));
    } catch (err) {
      console.error('[QishuiStatus]', err);
      sendJSON(res, { provider: 'qishui', configured: false, loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/login/token') {
    try {
      const body = await readRequestBody(req);
      const token = body.token || body.accessToken || body.access_token || body.data || body.text || '';
      sendJSON(res, saveQishuiAccessToken(token));
    } catch (err) {
      console.error('[QishuiLoginToken]', err);
      const invalid = err && (err.code === 'INVALID_QISHUI_TOKEN' || err.message === 'INVALID_QISHUI_TOKEN');
      sendJSON(res, {
        provider: 'qishui',
        configured: getQishuiStatus(qishuiCookie).configured,
        loggedIn: getQishuiStatus(qishuiCookie).loggedIn,
        error: invalid ? 'INVALID_QISHUI_TOKEN' : err.message,
        message: invalid ? '汽水 OpenAPI token 无效或太短' : err.message,
      }, invalid ? 400 : 500);
    }
    return;
  }

  if (pn === '/api/qishui/login/cookie') {
    try {
      const body = await readRequestBody(req);
      const raw = body.cookie || body.data || body.text || '';
      const normalized = normalizeQishuiCookieInput(raw);
      if (!qishuiCookieHasLogin(normalized)) {
        sendJSON(res, { provider: 'qishui', loggedIn: false, error: 'INVALID_QISHUI_COOKIE', message: '汽水 cookie 无效或缺少登录态' }, 400);
        return;
      }
      saveQishuiCookie(normalized);
      sendJSON(res, { ...await handleQishuiStatus(qishuiCookie), saved: true });
    } catch (err) {
      console.error('[QishuiLoginCookie]', err);
      sendJSON(res, { provider: 'qishui', loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/logout') {
    try {
      saveQishuiCookie('');
      sendJSON(res, { ...clearQishuiAccessToken(), webSession: false, cookieReady: false, configured: getQishuiStatus('').configured, loggedIn: getQishuiStatus('').loggedIn });
    } catch (err) {
      console.error('[QishuiLogout]', err);
      sendJSON(res, { provider: 'qishui', ok: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/search') {
    try {
      const kw = url.searchParams.get('keywords') || '';
      const limit = Math.max(4, Math.min(12, parseInt(url.searchParams.get('limit') || '8', 10) || 8));
      sendJSON(res, await handleQishuiSearch(kw, limit));
    } catch (err) {
      console.error('[QishuiSearch]', err);
      sendJSON(res, { provider: 'qishui', configured: getQishuiStatus(qishuiCookie).configured, error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/feed') {
    try {
      const limit = Math.max(4, Math.min(12, parseInt(url.searchParams.get('limit') || '8', 10) || 8));
      sendJSON(res, await handleQishuiFeed(limit, qishuiCookie));
    } catch (err) {
      console.error('[QishuiFeed]', err);
      sendJSON(res, { provider: 'qishui', configured: getQishuiStatus(qishuiCookie).configured, error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/user/playlists') {
    try {
      sendJSON(res, await handleQishuiUserPlaylists(qishuiCookie));
    } catch (err) {
      console.error('[QishuiUserPlaylists]', err);
      sendJSON(res, { provider: 'qishui', loggedIn: getQishuiStatus(qishuiCookie).configured, configured: getQishuiStatus(qishuiCookie).configured, error: err.message, playlists: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/playlist/tracks') {
    try {
      const id = url.searchParams.get('id') || 'qishui-feed';
      const limit = parseInt(url.searchParams.get('limit') || '0', 10) || 0;
      const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
      sendJSON(res, await handleQishuiPlaylistTracks(id, limit || offset ? { limit: limit || 50, offset } : {}, qishuiCookie));
    } catch (err) {
      console.error('[QishuiPlaylistTracks]', err);
      sendJSON(res, { provider: 'qishui', configured: getQishuiStatus(qishuiCookie).configured, error: err.message, tracks: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/song/url') {
    try {
      sendJSON(res, await handleQishuiSongUrl({
        id: url.searchParams.get('id') || '',
        quality: url.searchParams.get('quality') || '',
      }, qishuiCookie));
    } catch (err) {
      console.error('[QishuiSongUrl]', err);
      sendJSON(res, { provider: 'qishui', url: '', playable: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/lyric') {
    try {
      const id = url.searchParams.get('id') || '';
      sendJSON(res, await handleQishuiLyric(id));
    } catch (err) {
      console.error('[QishuiLyric]', err);
      sendJSON(res, { provider: 'qishui', error: err.message, lyric: '', tlyric: '' }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/song/url') {
    try {
      const info = await handleKugouSongUrl({
        hash: url.searchParams.get('hash') || url.searchParams.get('id') || '',
        albumId: url.searchParams.get('albumId') || url.searchParams.get('album_id') || '',
        albumAudioId: url.searchParams.get('albumAudioId') || url.searchParams.get('album_audio_id') || url.searchParams.get('mixSongId') || '',
        mixSongId: url.searchParams.get('mixSongId') || url.searchParams.get('albumAudioId') || url.searchParams.get('album_audio_id') || '',
        hqHash: url.searchParams.get('hqHash') || url.searchParams.get('hq_hash') || '',
        sqHash: url.searchParams.get('sqHash') || url.searchParams.get('sq_hash') || '',
        resHash: url.searchParams.get('resHash') || url.searchParams.get('res_hash') || '',
        quality: url.searchParams.get('quality') || '',
      }, kugouCookie);
      sendJSON(res, info);
    } catch (err) {
      console.error('[KugouSongUrl]', err);
      sendJSON(res, { provider: 'kugou', url: '', playable: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/lyric') {
    try {
      const hash = url.searchParams.get('hash') || url.searchParams.get('id') || '';
      const albumAudioId = url.searchParams.get('albumAudioId') || url.searchParams.get('album_audio_id') || '';
      const duration = url.searchParams.get('duration') || '';
      if (!hash) { sendJSON(res, { provider: 'kugou', error: 'Missing Kugou hash', lyric: '' }, 400); return; }
      const data = await handleKugouLyric(hash, albumAudioId, duration);
      sendJSON(res, data);
    } catch (err) {
      console.error('[KugouLyric]', err);
      sendJSON(res, { provider: 'kugou', error: err.message, lyric: '' }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/login/status') {
    try {
      sendJSON(res, await getKugouLoginInfo(kugouCookie));
    } catch (err) {
      console.error('[KugouLoginStatus]', err);
      sendJSON(res, { provider: 'kugou', loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/login/cookie') {
    try {
      const body = await readRequestBody(req);
      const raw = body.cookie || body.data || body.text || '';
      const normalized = normalizeKugouCookieInput(raw);
      const auth = extractKugouAuth(normalized);
      if (!auth.loggedIn && !parseCookieString(normalized).kg_mid) {
        sendJSON(res, { provider: 'kugou', loggedIn: false, error: 'INVALID_KUGOU_COOKIE', message: '酷狗 cookie 无效或缺少登录标识' }, 400);
        return;
      }
      saveKugouCookie(normalized);
      const info = await getKugouLoginInfo(kugouCookie);
      sendJSON(res, { ...info, saved: true, partial: auth.loggedIn && !auth.playbackReady });
    } catch (err) {
      console.error('[KugouLoginCookie]', err);
      sendJSON(res, { provider: 'kugou', loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/logout') {
    saveKugouCookie('');
    sendJSON(res, { provider: 'kugou', loggedIn: false, ok: true });
    return;
  }

  if (pn === '/api/kugou/user/playlists') {
    try {
      sendJSON(res, await handleKugouUserPlaylists(kugouCookie));
    } catch (err) {
      console.error('[KugouUserPlaylists]', err);
      sendJSON(res, { provider: 'kugou', loggedIn: false, error: err.message, playlists: [] }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/playlist/tracks') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('global_collection_id') || '';
      const paged = url.searchParams.has('limit') || url.searchParams.has('offset');
      const limit = Math.max(10, Math.min(50, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      sendJSON(res, await handleKugouPlaylistTracks(id, kugouCookie, paged ? { limit, offset, paged: true } : {}));
    } catch (err) {
      console.error('[KugouPlaylistTracks]', err);
      sendJSON(res, { provider: 'kugou', error: err.message, tracks: [] }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/song/like/check') {
    try {
      if (!kugouCookieHasPlayback(kugouCookie)) {
        sendJSON(res, { provider: 'kugou', loggedIn: false, liked: {}, error: 'KUGOU_AUTH_REQUIRED' });
        return;
      }
      const hashes = url.searchParams.get('hashes') || url.searchParams.get('hash') || '';
      sendJSON(res, await handleKugouLikeCheck({ hashes }, kugouCookie));
    } catch (err) {
      console.error('[KugouLikeCheck]', err);
      sendJSON(res, { provider: 'kugou', liked: {}, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/song/like') {
    try {
      if (!kugouCookieHasPlayback(kugouCookie)) {
        sendJSON(res, { provider: 'kugou', success: false, error: 'KUGOU_AUTH_REQUIRED' }, 401);
        return;
      }
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const song = body.song || {};
      const like = String(body.like != null ? body.like : (url.searchParams.get('like') || 'true')) !== 'false';
      sendJSON(res, await handleKugouLikeToggle(song, like, kugouCookie));
    } catch (err) {
      console.error('[KugouLike]', err);
      sendJSON(res, { provider: 'kugou', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/playlist/add-song') {
    try {
      if (!kugouCookieHasPlayback(kugouCookie)) {
        sendJSON(res, { provider: 'kugou', success: false, error: 'KUGOU_AUTH_REQUIRED' }, 401);
        return;
      }
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const pid = body.pid || url.searchParams.get('pid') || '';
      const song = body.song || body;
      if (!pid) { sendJSON(res, { provider: 'kugou', success: false, error: 'Missing playlist id' }, 400); return; }
      sendJSON(res, await handleKugouPlaylistAddSong(pid, song, kugouCookie));
    } catch (err) {
      console.error('[KugouPlaylistAddSong]', err);
      sendJSON(res, { provider: 'kugou', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/recommend/guess' || pn === '/api/kugou/recommend/fm') {
    try {
      sendJSON(res, await handleKugouGuessLike(kugouCookie, url.searchParams.get('limit')));
    } catch (err) {
      console.error('[KugouGuessLike]', err);
      sendJSON(res, { provider: 'kugou', loggedIn: false, songs: [], error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/toplist') {
    try { sendJSON(res, await handleKugouRankList()); }
    catch (err) { console.error('[KugouToplist]', err); sendJSON(res, { provider: 'kugou', toplists: [], error: err.message }, 500); }
    return;
  }

  if (pn === '/api/kugou/toplist/tracks') {
    try { sendJSON(res, await handleKugouRankTracks(url.searchParams.get('id'), url.searchParams.get('limit'))); }
    catch (err) { console.error('[KugouToplistTracks]', err); sendJSON(res, { provider: 'kugou', playlist: null, tracks: [], error: err.message }, 500); }
    return;
  }

  if (pn === '/api/kugou/album/detail') {
    try { sendJSON(res, await handleKugouAlbumDetail(url.searchParams.get('id') || url.searchParams.get('albumId'), url.searchParams.get('limit'))); }
    catch (err) { console.error('[KugouAlbumDetail]', err); sendJSON(res, { provider: 'kugou', album: null, songs: [], error: err.message }, 500); }
    return;
  }

  if (pn === '/api/kugou/artist/detail') {
    try { sendJSON(res, await handleKugouArtistDetail(url.searchParams.get('id') || url.searchParams.get('artistId'), url.searchParams.get('limit'))); }
    catch (err) { console.error('[KugouArtistDetail]', err); sendJSON(res, { provider: 'kugou', artist: null, songs: [], error: err.message }, 500); }
    return;
  }

  if (pn === '/api/qq/song/url') {
    try {
      const mid = url.searchParams.get('mid') || url.searchParams.get('id') || '';
      const mediaMid = url.searchParams.get('mediaMid') || url.searchParams.get('media_mid') || '';
      const quality = url.searchParams.get('quality') || '';
      const playbackHints = {
        vipRequired: url.searchParams.get('vipRequired') || '',
        needVip: url.searchParams.get('needVip') || url.searchParams.get('need_vip') || '',
        onlyVipPlayable: url.searchParams.get('onlyVipPlayable') || url.searchParams.get('only_vip_playable') || '',
        privilege: url.searchParams.get('privilege') || url.searchParams.get('mediaPrivilege') || url.searchParams.get('media_privilege') || '',
        fee: url.searchParams.get('fee') || ''
      };
      const info = await handleQQSongUrl(mid, mediaMid, quality, playbackHints);
      sendJSON(res, info);
    } catch (err) {
      console.error('[QQSongUrl]', err);
      sendJSON(res, { provider: 'qq', url: '', playable: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qq/lyric') {
    try {
      const mid = url.searchParams.get('mid') || url.searchParams.get('songmid') || '';
      const id = url.searchParams.get('id') || url.searchParams.get('qqId') || '';
      if (!mid && !id) { sendJSON(res, { provider: 'qq', error: 'Missing QQ song mid or id', lyric: '' }, 400); return; }
      const data = await handleQQLyric(mid, id);
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQLyric]', err);
      sendJSON(res, { provider: 'qq', error: err.message, lyric: '' }, 500);
    }
    return;
  }

  // ---------- 网易心动模式(智能播放队列) ----------
  // 基于当前歌 + 其所在歌单生成智能播放列表(网易 /playmode/intelligence/list,需登录)。
  // 未登录优雅返回空 + loggedIn:false;真实数据待用户登录网易自测。
  if (pn === '/api/netease/heartbeat') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('sid') || '';
      const pid = url.searchParams.get('pid') || url.searchParams.get('playlistId') || '';
      const sid = url.searchParams.get('sid') || id;
      const count = Math.max(1, Math.min(50, Number(url.searchParams.get('count')) || 1));
      if (!id) { sendJSON(res, { provider: 'netease', mode: 'heartbeat', error: 'Missing song id', songs: [] }, 400); return; }
      const info = await getLoginInfo();
      const loggedIn = !!(info && info.loggedIn);
      let songs = [];
      if (loggedIn) {
        const r = await playmode_intelligence_list({ id, pid, sid, count, cookie: userCookie, timestamp: Date.now() });
        const raw = (r && r.body && (r.body.data || r.body.result)) || [];
        // 每项形如 { songInfo:{...}, recommendReason };兼容直接是歌曲对象
        songs = (Array.isArray(raw) ? raw : [])
          .map(item => mapSongRecord((item && (item.songInfo || item.song || item)) || {}))
          .filter(song => song.id && song.name);
      }
      sendJSON(res, { provider: 'netease', mode: 'heartbeat', loggedIn, id, pid, songs });
    } catch (err) {
      console.error('[NeteaseHeartbeat]', err);
      sendJSON(res, { provider: 'netease', mode: 'heartbeat', error: err.message, songs: [] }, 500);
    }
    return;
  }

  // ---------- 网易私人FM 无限流(续拉控制器) ----------
  // 每次调用返回下一批(网易 personal_fm 服务端有状态,循环调用即无限流)。
  // 未登录优雅返回空;真实数据待用户登录网易自测。
  if (pn === '/api/netease/personal-fm') {
    try {
      const info = await getLoginInfo();
      const loggedIn = !!(info && info.loggedIn);
      let songs = [];
      if (loggedIn) {
        const r = await personal_fm({ cookie: userCookie, timestamp: Date.now() });
        const raw = (r && r.body && (r.body.data || r.body.result)) || [];
        songs = (Array.isArray(raw) ? raw : [])
          .map(mapSongRecord)
          .filter(song => song.id && song.name);
      }
      sendJSON(res, { provider: 'netease', mode: 'personal_fm', loggedIn, songs });
    } catch (err) {
      console.error('[NeteasePersonalFM]', err);
      sendJSON(res, { provider: 'netease', mode: 'personal_fm', error: err.message, songs: [] }, 500);
    }
    return;
  }

  // ---------- 歌曲URL ----------
  if (pn === '/api/qq/login/status') {
    try {
      const forceVip = /^(1|true|yes)$/i.test(String(url.searchParams.get('forceVip') || url.searchParams.get('force') || ''));
      const info = await getQQLoginInfo({ forceVip, forceCookie: forceVip });
      sendJSON(res, info);
    } catch (err) {
      console.error('[QQLoginStatus]', err);
      sendJSON(res, { provider: 'qq', loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qq/login/cookie') {
    try {
      const body = await readRequestBody(req);
      const raw = body.cookie || body.data || body.text || '';
      const normalized = normalizeQQCookieInput(raw);
      const obj = parseCookieString(normalized);
      if (!qqCookieUin(obj) || !qqCookieMusicKey(obj)) {
        sendJSON(res, { provider: 'qq', loggedIn: false, error: 'INVALID_QQ_COOKIE', message: 'QQ cookie 缺少 uin 或有效登录票据' }, 400);
        return;
      }
      saveQQCookie(normalized);
      const info = await getQQLoginInfo({ forceVip: true, forceCookie: true });
      sendJSON(res, { ...info, saved: true });
    } catch (err) {
      console.error('[QQLoginCookie]', err);
      sendJSON(res, { provider: 'qq', loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qq/logout') {
    saveQQCookie('');
    sendJSON(res, { provider: 'qq', ok: true, loggedIn: false });
    return;
  }

  if (pn === '/api/qq/recommend/daily') {
    try {
      sendJSON(res, await handleQQDailySongs());
    } catch (err) {
      console.error('[QQDaily]', err);
      sendJSON(res, { provider: 'qq', loggedIn: false, error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qq/recommend/radio') {
    try {
      sendJSON(res, await handleQQPersonalRadio(url.searchParams.get('count')));
    } catch (err) {
      console.error('[QQRadio]', err);
      sendJSON(res, { provider: 'qq', loggedIn: false, error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qq/user/playlists') {
    try {
      const data = await handleQQUserPlaylists();
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQUserPlaylists]', err);
      sendJSON(res, { provider: 'qq', loggedIn: false, error: err.message, playlists: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qq/playlist/tracks') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('disstid') || '';
      const data = await handleQQPlaylistTracks(id, {
        limit: url.searchParams.get('limit') || '',
        offset: url.searchParams.get('offset') || '0',
      });
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQPlaylistTracks]', err);
      sendJSON(res, { provider: 'qq', error: err.message, tracks: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qq/artist/detail') {
    try {
      const mid = url.searchParams.get('mid') || url.searchParams.get('singermid') || '';
      const limit = Math.max(10, Math.min(80, parseInt(url.searchParams.get('limit') || '36', 10) || 36));
      if (!mid) {
        sendJSON(res, { provider: 'qq', error: 'MISSING_SINGER_MID', artist: null, songs: [] }, 400);
        return;
      }
      const data = await handleQQArtistDetail(mid, limit);
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQArtistDetail]', err);
      sendJSON(res, { provider: 'qq', error: err.message, artist: null, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/toplist') {
    try { sendJSON(res, await handleNeteaseToplist()); }
    catch (err) { console.error('[Toplist]', err); sendJSON(res, { provider: 'netease', toplists: [], error: err.message }, 500); }
    return;
  }

  if (pn === '/api/toplist/tracks') {
    try { sendJSON(res, await handleNeteaseToplistTracks(url.searchParams.get('id'), url.searchParams.get('limit'))); }
    catch (err) { console.error('[ToplistTracks]', err); sendJSON(res, { provider: 'netease', playlist: null, tracks: [], error: err.message }, 500); }
    return;
  }

  if (pn === '/api/qq/toplist') {
    try { sendJSON(res, await handleQQToplist()); }
    catch (err) { console.error('[QQToplist]', err); sendJSON(res, { provider: 'qq', toplists: [], error: err.message }, 500); }
    return;
  }

  if (pn === '/api/qq/toplist/tracks') {
    try { sendJSON(res, await handleQQToplistTracks(url.searchParams.get('id'), url.searchParams.get('limit'))); }
    catch (err) { console.error('[QQToplistTracks]', err); sendJSON(res, { provider: 'qq', playlist: null, tracks: [], error: err.message }, 500); }
    return;
  }

  if (pn === '/api/qq/song/like/check') {
    try {
      const cookieObj = qqCookieObject();
      if (!qqCookieUin(cookieObj) || !qqCookieMusicKey(cookieObj)) {
        sendJSON(res, { provider: 'qq', loggedIn: false, liked: {}, error: 'QQ_AUTH_REQUIRED' });
        return;
      }
      let songs = [];
      if (req.method === 'POST') {
        const b = await readRequestBody(req);
        songs = Array.isArray(b.songs) ? b.songs : [];
      } else {
        // GET ?mids=a,b&ids=1,2 —— 前端同序传入,按位配对
        const mids = (url.searchParams.get('mids') || '').split(',').map(v => v.trim());
        const ids = (url.searchParams.get('ids') || '').split(',').map(v => v.trim());
        const n = Math.max(mids.length, ids.length);
        for (let i = 0; i < n; i++) {
          const mid = mids[i] || '';
          const id = ids[i] || '';
          if (mid || id) songs.push({ mid, id, key: mid || id });
        }
      }
      sendJSON(res, await handleQQLikeCheck(songs));
    } catch (err) {
      console.error('[QQLikeCheck]', err);
      sendJSON(res, { provider: 'qq', liked: {}, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qq/song/like') {
    try {
      const cookieObj = qqCookieObject();
      if (!qqCookieUin(cookieObj) || !qqCookieMusicKey(cookieObj)) {
        sendJSON(res, { provider: 'qq', success: false, error: 'QQ_AUTH_REQUIRED' }, 401);
        return;
      }
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const song = body.song || {};
      const like = String(body.like != null ? body.like : (url.searchParams.get('like') || 'true')) !== 'false';
      sendJSON(res, await handleQQLikeToggle(song, like));
    } catch (err) {
      console.error('[QQLike]', err);
      sendJSON(res, { provider: 'qq', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qq/album/detail') {
    try {
      const mid = url.searchParams.get('mid') || url.searchParams.get('albummid') || url.searchParams.get('albumMid') || '';
      const limit = Math.max(10, Math.min(120, parseInt(url.searchParams.get('limit') || '80', 10) || 80));
      if (!mid) {
        sendJSON(res, { provider: 'qq', error: 'MISSING_ALBUM_MID', album: null, songs: [] }, 400);
        return;
      }
      sendJSON(res, await handleQQAlbumDetail(mid, limit));
    } catch (err) {
      console.error('[QQAlbumDetail]', err);
      sendJSON(res, { provider: 'qq', error: err.message, album: null, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qq/song/comments') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('qqId') || '';
      const mid = url.searchParams.get('mid') || url.searchParams.get('songmid') || '';
      const limit = Math.max(6, Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const data = await handleQQSongComments(id, mid, limit, offset);
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQSongComments]', err);
      sendJSON(res, { provider: 'qq', error: err.message, comments: [] }, 500);
    }
    return;
  }

  if (pn === '/api/ytmusic/search') {
    try {
      const kw = url.searchParams.get('keywords') || '';
      const limit = Math.min(40, Number(url.searchParams.get('limit')) || 24);
      const songs = await ytmusicSearch(kw, limit);
      sendJSON(res, { provider: 'ytmusic', songs: songs });
    } catch (err) {
      console.error('[YTMusicSearch]', err);
      sendJSON(res, { provider: 'ytmusic', songs: [], error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/ytmusic/song/url') {
    try {
      const info = await ytmusicGetSongUrl(url.searchParams.get('id') || '');
      sendJSON(res, info);
    } catch (err) {
      console.error('[YTMusicSongUrl]', err);
      sendJSON(res, { provider: 'ytmusic', url: '', playable: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/ytmusic/lyric') {
    try {
      const title = url.searchParams.get('title') || '';
      const artist = url.searchParams.get('artist') || '';
      const sec = Number(url.searchParams.get('sec')) || 0;
      const data = await ytmusicResolveLyric(title, artist, sec);
      sendJSON(res, data);
    } catch (err) {
      console.error('[YTMusicLyric]', err);
      sendJSON(res, { lyric: '', nolyric: true, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/search') {
    try {
      const kw = String(url.searchParams.get('keywords') || '').trim();
      const limit = Math.max(6, Math.min(30, parseInt(url.searchParams.get('limit') || '18', 10) || 18));
      if (!kw) { sendJSON(res, { podcasts: [] }); return; }
      const r = await cloudsearch({ keywords: kw, type: 1009, limit, cookie: userCookie, timestamp: Date.now() });
      const result = (r.body && r.body.result) || {};
      const raw = result.djRadios || result.djradios || result.radios || [];
      const podcasts = raw.map(mapPodcastRadio).filter(p => p.id);
      sendJSON(res, { podcasts, total: result.djRadiosCount || result.djradiosCount || podcasts.length });
    } catch (err) {
      console.error('[PodcastSearch]', err);
      sendJSON(res, { error: err.message, podcasts: [] }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/hot') {
    try {
      const limit = Math.max(6, Math.min(30, parseInt(url.searchParams.get('limit') || '18', 10) || 18));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const r = await dj_hot({ limit, offset, cookie: userCookie, timestamp: Date.now() });
      const body = r.body || {};
      const raw = body.djRadios || body.djradios || body.radios || body.data || [];
      const podcasts = (Array.isArray(raw) ? raw : []).map(mapPodcastRadio).filter(p => p.id);
      sendJSON(res, { podcasts, more: !!body.hasMore });
    } catch (err) {
      console.error('[PodcastHot]', err);
      sendJSON(res, { error: err.message, podcasts: [] }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/detail') {
    try {
      const rid = url.searchParams.get('id') || url.searchParams.get('rid');
      if (!rid) { sendJSON(res, { error: 'Missing podcast id' }, 400); return; }
      const r = await dj_detail({ rid, cookie: userCookie, timestamp: Date.now() });
      const body = r.body || {};
      const radio = mapPodcastRadio(body.data || body.djRadio || body.radio || body);
      sendJSON(res, { podcast: radio });
    } catch (err) {
      console.error('[PodcastDetail]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/programs') {
    try {
      const rid = url.searchParams.get('id') || url.searchParams.get('rid');
      if (!rid) { sendJSON(res, { error: 'Missing podcast id', programs: [] }, 400); return; }
      const limit = Math.max(10, Math.min(60, parseInt(url.searchParams.get('limit') || '30', 10) || 30));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const r = await dj_program({ rid, limit, offset, asc: false, cookie: userCookie, timestamp: Date.now() });
      const body = r.body || {};
      const raw = body.programs || (body.data && (body.data.list || body.data.programs)) || [];
      const radio = raw[0] && raw[0].radio ? mapPodcastRadio(raw[0].radio) : { id: rid, rid };
      const programs = (Array.isArray(raw) ? raw : [])
        .map(p => mapPodcastProgram(p, radio))
        .filter(p => p.id && p.name);
      sendJSON(res, { radio, programs, more: !!body.more, total: body.count || programs.length });
    } catch (err) {
      console.error('[PodcastPrograms]', err);
      sendJSON(res, { error: err.message, programs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/my') {
    try {
      const info = await getLoginInfo();
      if (!info.loggedIn || !info.userId) {
        const empty = ['collect', 'created', 'liked'].map(k => podcastCollectionMeta(k, []));
        sendJSON(res, { loggedIn: false, collections: empty });
        return;
      }
      const keys = ['collect', 'created', 'liked'];
      const collections = await Promise.all(keys.map(async key => {
        try {
          const data = await fetchMyPodcastItems(key, info, 12, 0);
          return podcastCollectionMeta(key, data.items || []);
        } catch (e) {
          console.warn('[MyPodcast]', key, e.message);
          return podcastCollectionMeta(key, []);
        }
      }));
      sendJSON(res, { loggedIn: true, collections });
    } catch (err) {
      console.error('[MyPodcast]', err);
      sendJSON(res, { error: err.message, collections: [] }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/my/items') {
    try {
      const info = await getLoginInfo();
      if (!info.loggedIn || !info.userId) { sendJSON(res, { loggedIn: false, items: [] }); return; }
      const key = String(url.searchParams.get('key') || 'collect');
      const limit = parseInt(url.searchParams.get('limit') || '48', 10) || 48;
      const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
      const data = await fetchMyPodcastItems(key, info, limit, offset);
      sendJSON(res, { loggedIn: true, key, ...podcastCollectionMeta(key, data.items || []), itemType: data.itemType, items: data.items || [] });
    } catch (err) {
      console.error('[MyPodcastItems]', err);
      sendJSON(res, { error: err.message, items: [] }, 500);
    }
    return;
  }

  if (pn === '/api/album/detail') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('albumId') || '';
      const limit = Math.max(10, Math.min(120, parseInt(url.searchParams.get('limit') || '80', 10) || 80));
      if (!id) {
        sendJSON(res, { provider: 'netease', error: 'Missing album id', album: null, songs: [] }, 400);
        return;
      }
      sendJSON(res, await handleNeteaseAlbumDetail(id, limit));
    } catch (err) {
      console.error('[AlbumDetail]', err);
      sendJSON(res, { provider: 'netease', error: err.message, album: null, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/song/url') {
    try {
      const sid = url.searchParams.get('id');
      const quality = url.searchParams.get('quality') || '';
      const loginInfo = await getLoginInfo();
      const info = await handleSongUrl(sid, loginInfo, quality);
      sendJSON(res, {
        ...info,
        loggedIn: loginInfo.loggedIn,
        vipType: loginInfo.vipType || 0,
        vipLevel: loginInfo.vipLevel || 'none',
        isVip: !!loginInfo.isVip,
        isSvip: !!loginInfo.isSvip,
        vipLabel: loginInfo.vipLabel || '无VIP',
      });
    } catch (err) { console.error('[SongUrl]', err); sendJSON(res, { error: err.message }, 500); }
    return;
  }

  if (pn === '/api/login/cookie') {
    try {
      const body = await readRequestBody(req);
      const raw = body.cookie || body.data || body.text || '';
      const normalized = normalizeCookieHeader(raw);
      const obj = parseCookieString(normalized);
      if (!obj.MUSIC_U) {
        sendJSON(res, { loggedIn: false, error: 'INVALID_NETEASE_COOKIE', message: '网易云 cookie 缺少 MUSIC_U' }, 400);
        return;
      }
      saveCookie(normalized);
      let info = await getLoginInfo();
      if (!info.loggedIn && userCookie) {
        info = {
          loggedIn: true,
          pendingProfile: true,
          nickname: '网易云用户',
          avatar: '',
          vipType: 0,
          vipLevel: 'none',
          isVip: false,
          isSvip: false,
          vipLabel: '无VIP',
        };
      }
      sendJSON(res, { ...info, saved: true, hasCookie: !!userCookie });
    } catch (err) {
      console.error('[LoginCookie]', err);
      sendJSON(res, { loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  // ---------- 登录: QR Key ----------
  // ---------- 播客 DJ 长音频后端离线锁拍 ----------
  if (pn === '/api/podcast/dj-beatmap') {
    try {
      const audioUrl = url.searchParams.get('url');
      const durationSec = Math.max(0, Number(url.searchParams.get('duration') || 0) || 0);
      if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
        sendJSON(res, { error: 'Invalid audio url' }, 400);
        return;
      }
      console.log('[PodcastDjBeatmap] start', Math.round(durationSec || 0) + 's');
      const started = Date.now();
      const introSec = Math.max(0, Number(url.searchParams.get('intro') || 0) || 0);
      const map = introSec
        ? await analyzePodcastDjIntro(audioUrl, { durationSec, introSec, userAgent: UA })
        : await analyzePodcastDjStream(audioUrl, { durationSec, userAgent: UA });
      console.log('[PodcastDjBeatmap] done beats:', map.visualBeatCount || 0, 'ms:', Date.now() - started, 'decode:', map.decode || {});
      sendJSON(res, { ok: true, map });
    } catch (err) {
      console.error('[PodcastDjBeatmap]', err);
      sendJSON(res, { ok: false, error: err.message || String(err) }, 500);
    }
    return;
  }

  if (pn === '/api/login/qr/key') {
    try {
      const r = await login_qr_key({ timestamp: Date.now() });
      const key = r.body && r.body.data && r.body.data.unikey;
      sendJSON(res, { key });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
    return;
  }

  // ---------- 登录: QR 二维码图片 ----------
  if (pn === '/api/login/qr/create') {
    try {
      const key = url.searchParams.get('key');
      const r = await login_qr_create({ key, qrimg: true, timestamp: Date.now() });
      const d = r.body && r.body.data;
      sendJSON(res, { img: d && d.qrimg, url: d && d.qrurl });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
    return;
  }

  // ---------- 登录: 轮询扫码状态 ----------
  if (pn === '/api/login/qr/check') {
    try {
      const key = url.searchParams.get('key');
      let r = await login_qr_check({ key, noCookie: true, timestamp: Date.now() });
      let body = r.body || {};
      let code = Number(body.code || r.code);
      let msg  = body.message || r.message || '';
      let cookie = readCookieFromResponse(r);
      if (code === 803 && !cookie) {
        try {
          const retry = await login_qr_check({ key, timestamp: Date.now() });
          const retryCookie = readCookieFromResponse(retry);
          if (retryCookie) {
            r = retry;
            body = retry.body || body;
            code = Number(body.code || retry.code || code);
            msg = body.message || retry.message || msg;
            cookie = retryCookie;
          }
        } catch (retryErr) {
          console.warn('[Login] qr cookie retry failed:', retryErr.message);
        }
      }
      // 803 = 授权成功, 802 = 已扫待确认, 801 = 等待扫码, 800 = 二维码过期
      if (code === 803) {
        if (cookie) saveCookie(cookie);
        let info = await getLoginInfo();
        if (!info.loggedIn) {
          const profile = body.profile || (body.data && body.data.profile) || {};
          const account = body.account || (body.data && body.data.account);
          const extra = body.data || body;
          info = normalizeLoginInfo(profile, account, extra);
          if (info.loggedIn) info = await enrichNeteaseLoginInfo(info, profile, account, extra);
        }
        if (!info.loggedIn && cookie) {
          info = {
            loggedIn: true,
            pendingProfile: true,
            nickname: (body.nickname || (body.profile && body.profile.nickname) || '网易云用户'),
            avatar: body.avatarUrl || (body.profile && body.profile.avatarUrl) || '',
            vipType: 0,
            vipLevel: 'none',
            isVip: false,
            isSvip: false,
            vipLabel: '无VIP',
          };
        }
        sendJSON(res, { code, message: msg, ...info, hasCookie: !!cookie });
        return;
      }
      sendJSON(res, { code, message: msg, nickname: body.nickname, avatar: body.avatarUrl });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
    return;
  }

  // ---------- 登录态查询 ----------
  if (pn === '/api/login/status') {
    const info = await getLoginInfo();
    sendJSON(res, info);
    return;
  }

  // ---------- 登出 ----------
  if (pn === '/api/logout') {
    try { await logout({ cookie: userCookie }); } catch (e) {}
    saveCookie('');
    sendJSON(res, { ok: true });
    return;
  }

  // ---------- 用户歌单 ----------
  if (pn === '/api/user/playlists') {
    try {
      const info = await getLoginInfo();
      if (!info.loggedIn || !info.userId) { sendJSON(res, { loggedIn: false, playlists: [] }); return; }
      const requestedLimit = Math.max(0, parseInt(url.searchParams.get('limit') || '0', 10) || 0);
      const rawPlaylists = await fetchAllNeteaseUserPlaylists(info.userId, requestedLimit);
      const list = rawPlaylists.map(pl => mapNeteasePlaylistMeta(pl, pl && pl.id));
      sendJSON(res, { loggedIn: true, userId: info.userId, playlists: list });
    } catch (err) {
      console.error('[UserPlaylists]', err);
      sendJSON(res, { error: err.message, loggedIn: false, playlists: [] }, 500);
    }
    return;
  }

  // ---------- 红心状态 ----------
  if (pn === '/api/song/like/check') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const ids = String(url.searchParams.get('ids') || url.searchParams.get('id') || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (!ids.length) { sendJSON(res, { error: 'Missing song id', liked: {}, ids: [] }, 400); return; }
      let likedIds = [];
      try {
        if (typeof song_like_check === 'function') {
          const checked = await song_like_check({ ids: JSON.stringify(ids.map(Number).filter(Boolean)), cookie: userCookie, timestamp: Date.now() });
          const data = (checked.body && (checked.body.data || checked.body.ids)) || checked.body || {};
          if (Array.isArray(data)) likedIds = data.map(String);
          else if (data && typeof data === 'object') {
            ids.forEach(id => {
              if (data[id] || data[String(id)] || data[Number(id)]) likedIds.push(String(id));
            });
          }
        }
      } catch (e) {
        console.warn('[LikeCheck] direct check failed:', e.message);
      }
      if (!likedIds.length) {
        const r = await likelist({ uid: info.userId, cookie: userCookie, timestamp: Date.now() });
        likedIds = ((r.body && r.body.ids) || []).map(String);
      }
      const set = new Set(likedIds);
      const liked = {};
      ids.forEach(id => { liked[id] = set.has(String(id)); });
      sendJSON(res, { loggedIn: true, ids, liked });
    } catch (err) {
      console.error('[LikeCheck]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  // ---------- 红心/取消红心 ----------
  if (pn === '/api/song/like') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const id = body.id || url.searchParams.get('id');
      const nextLike = String(body.like != null ? body.like : (url.searchParams.get('like') || 'true')) !== 'false';
      if (!id) { sendJSON(res, { error: 'Missing song id' }, 400); return; }
      const r = await like_song({ id, like: String(nextLike), cookie: userCookie, timestamp: Date.now() });
      const code = (r.body && r.body.code) || r.code || 200;
      sendJSON(res, { loggedIn: true, id, liked: nextLike, code, body: r.body || r });
    } catch (err) {
      console.error('[Like]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  // ---------- 创建歌单 ----------
  if (pn === '/api/playlist/create') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const name = String(body.name || url.searchParams.get('name') || '').trim();
      const privacy = String(body.privacy || url.searchParams.get('privacy') || '0');
      if (!name) { sendJSON(res, { error: 'Missing playlist name' }, 400); return; }
      const r = await playlist_create({ name, privacy, cookie: userCookie, timestamp: Date.now() });
      const created = (r.body && (r.body.playlist || r.body.data)) || {};
      sendJSON(res, { loggedIn: true, playlist: created, body: r.body || r });
    } catch (err) {
      console.error('[PlaylistCreate]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  // ---------- 收藏歌曲到歌单 ----------
  if (pn === '/api/playlist/add-song') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const pid = body.pid || url.searchParams.get('pid');
      const id = body.id || body.ids || url.searchParams.get('id') || url.searchParams.get('ids');
      if (!pid || !id) { sendJSON(res, { error: 'Missing playlist id or song id' }, 400); return; }
      const attempts = [];
      let finalBody = null;
      let finalCode = 0;
      let finalMessage = '';
      let success = false;

      const primary = await playlist_tracks({ op: 'add', pid, tracks: String(id), cookie: userCookie, timestamp: Date.now() });
      finalBody = primary.body || primary;
      finalCode = normalizeApiCode(primary);
      finalMessage = normalizeApiMessage(primary);
      success = finalCode === 200 && !(finalBody && finalBody.error);
      attempts.push({ api: 'playlist_tracks', code: finalCode, message: finalMessage, body: finalBody });

      if (!success && typeof playlist_track_add === 'function') {
        try {
          const fallback = await playlist_track_add({ pid, ids: String(id), cookie: userCookie, timestamp: Date.now() });
          finalBody = fallback.body || fallback;
          finalCode = normalizeApiCode(fallback);
          finalMessage = normalizeApiMessage(fallback);
          success = finalCode === 200 && !(finalBody && finalBody.error);
          attempts.push({ api: 'playlist_track_add', code: finalCode, message: finalMessage, body: finalBody });
        } catch (fallbackErr) {
          const errBody = fallbackErr.body || fallbackErr.response || {};
          finalBody = errBody;
          finalCode = normalizeApiCode(errBody);
          finalMessage = normalizeApiMessage(errBody) || fallbackErr.message || '';
          attempts.push({ api: 'playlist_track_add', code: finalCode, message: finalMessage, body: errBody });
        }
      }

      if (!success) {
        sendJSON(res, { loggedIn: true, pid, id, success: false, code: finalCode, error: finalMessage || 'PLAYLIST_ADD_FAILED', attempts }, finalCode === 401 ? 401 : 409);
        return;
      }
      sendJSON(res, { loggedIn: true, pid, id, success: true, code: finalCode, body: finalBody, attempts });
    } catch (err) {
      console.error('[PlaylistAddSong]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  // ---------- 歌词 ----------
  function lyricNodeText(body, key) {
    return body && body[key] && typeof body[key].lyric === 'string' ? body[key].lyric : '';
  }

  function lyricBodyHasPrimary(body) {
    return !!(lyricNodeText(body, 'lrc') || lyricNodeText(body, 'yrc'));
  }

  function lyricBodyHasTranslation(body) {
    return !!(lyricNodeText(body, 'tlyric') || lyricNodeText(body, 'ytlrc'));
  }

  function mergeLyricBodies(primary, fallback) {
    const merged = Object.assign({}, fallback || {}, primary || {});
    ['lrc', 'tlyric', 'yrc', 'ytlrc', 'romalrc', 'yromalrc', 'klyric'].forEach((key) => {
      if (!lyricNodeText(merged, key) && fallback && fallback[key]) merged[key] = fallback[key];
    });
    return merged;
  }

  if (pn === '/api/lyric') {
    try {
      const id = url.searchParams.get('id');
      if (!id) { sendJSON(res, { error: 'Missing song id', lyric: '' }, 400); return; }
      let body = {};
      let source = 'lyric';
      try {
        if (typeof lyric_new === 'function') {
          const nr = await lyric_new({ id, cookie: userCookie, timestamp: Date.now() });
          body = nr.body || {};
          source = 'lyric_new';
        }
      } catch (errNew) {
        console.warn('[LyricNew]', errNew.message);
      }
      if (!lyricBodyHasPrimary(body) || !lyricBodyHasTranslation(body)) {
        const r = await lyric({ id, cookie: userCookie, timestamp: Date.now() });
        body = mergeLyricBodies(body, r.body || {});
        source = source === 'lyric_new' ? 'lyric_new+lyric' : 'lyric';
      }
      sendJSON(res, {
        lyric: (body.lrc && body.lrc.lyric) || '',
        tlyric: (body.tlyric && body.tlyric.lyric) || '',
        yrc: (body.yrc && body.yrc.lyric) || '',
        ytlrc: (body.ytlrc && body.ytlrc.lyric) || '',
        romalrc: (body.romalrc && body.romalrc.lyric) || '',
        yromalrc: (body.yromalrc && body.yromalrc.lyric) || '',
        source,
      });
    } catch (err) {
      console.error('[Lyric]', err);
      sendJSON(res, { error: err.message, lyric: '' }, 500);
    }
    return;
  }

  // ---------- 歌曲评论 ----------
  if (pn === '/api/song/comments') {
    try {
      const id = url.searchParams.get('id');
      const limit = Math.max(6, Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      if (!id) { sendJSON(res, { error: 'Missing song id', comments: [] }, 400); return; }
      const r = await comment_music({ id, limit, offset, cookie: userCookie, timestamp: Date.now() });
      const body = r.body || r || {};
      const raw = body.hotComments && offset === 0 ? body.hotComments : (body.comments || []);
      const comments = (raw || []).map(c => ({
        id: c.commentId,
        content: c.content || '',
        likedCount: c.likedCount || 0,
        time: c.time || 0,
        user: c.user ? { id: c.user.userId, nickname: c.user.nickname || '', avatar: c.user.avatarUrl || '' } : null,
      })).filter(c => c.content);
      sendJSON(res, { id, total: body.total || 0, comments, hot: !!(body.hotComments && offset === 0), body });
    } catch (err) {
      console.error('[SongComments]', err);
      sendJSON(res, { error: err.message, comments: [] }, 500);
    }
    return;
  }

  // ---------- 歌手主页 / 热门歌曲 ----------
  if (pn === '/api/artist/detail') {
    try {
      const id = url.searchParams.get('id');
      const limit = Math.max(10, Math.min(80, parseInt(url.searchParams.get('limit') || '30', 10) || 30));
      if (!id) { sendJSON(res, { error: 'Missing artist id', songs: [] }, 400); return; }
      let detailBody = {};
      try {
        const detail = await artist_detail({ id, cookie: userCookie, timestamp: Date.now() });
        detailBody = detail.body || detail || {};
      } catch (e) {
        console.warn('[ArtistDetail] detail failed:', e.message);
      }
      let rawSongs = [];
      try {
        const list = await artist_songs({ id, order: 'hot', limit, offset: 0, cookie: userCookie, timestamp: Date.now() });
        const b = list.body || list || {};
        rawSongs = (b.songs || (b.data && b.data.songs) || []);
      } catch (e) {
        console.warn('[ArtistSongs] hot failed:', e.message);
      }
      if (!rawSongs.length) {
        const top = await artist_top_song({ id, cookie: userCookie, timestamp: Date.now() });
        const b = top.body || top || {};
        rawSongs = b.songs || [];
      }
      const artist = detailBody.artist || (detailBody.data && (detailBody.data.artist || detailBody.data)) || {};
      const songs = rawSongs.map(mapSongRecord).filter(s => s.id).slice(0, limit);
      sendJSON(res, {
        id,
        artist: {
          id: artist.id || id,
          name: artist.name || artist.artistName || '',
          avatar: artist.avatar || artist.cover || artist.picUrl || artist.img1v1Url || '',
          brief: artist.briefDesc || artist.description || artist.desc || '',
          musicSize: artist.musicSize || artist.songSize || 0,
          albumSize: artist.albumSize || 0,
        },
        songs,
        body: detailBody,
      });
    } catch (err) {
      console.error('[ArtistDetail]', err);
      sendJSON(res, { error: err.message, songs: [] }, 500);
    }
    return;
  }

  // ---------- 歌单曲目详情 ----------
  if (pn === '/api/playlist/tracks') {
    try {
      const id = url.searchParams.get('id');
      if (!id) { sendJSON(res, { error: 'Missing playlist id', tracks: [] }, 400); return; }

      const pageLimit = parseInt(url.searchParams.get('limit') || '0', 10) || 0;
      const pageOffset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
      if (pageLimit || pageOffset) {
        const pageData = await fetchNeteasePlaylistTracksPage(id, pageLimit || 48, pageOffset);
        const pageTracks = (pageData.rawTracks || []).map(mapSongRecord).filter(t => t.id);
        sendJSON(res, {
          playlist: pageData.playlistMeta || { id, name: '', cover: '', trackCount: 0 },
          tracks: pageTracks,
          offset: pageData.offset,
          limit: pageData.limit,
          nextOffset: pageData.nextOffset,
          hasMore: pageData.hasMore,
          partial: true,
        });
        return;
      }

      const syncedData = await fetchAllNeteasePlaylistTracks(id);
      const syncedPlaylistMeta = syncedData.playlistMeta || { id, name: '', cover: '', trackCount: 0 };
      const syncedRawTracks = syncedData.rawTracks || [];
      const syncedTracks = syncedRawTracks.map(mapSongRecord).filter(t => t.id);
      if (!syncedPlaylistMeta.trackCount) syncedPlaylistMeta.trackCount = syncedTracks.length;
      sendJSON(res, { playlist: syncedPlaylistMeta, tracks: syncedTracks });
      return;

    } catch (err) {
      console.error('[PlaylistTracks]', err);
      sendJSON(res, { error: err.message, tracks: [] }, 500);
    }
    return;
  }

  // ---------- 封面代理 (带 CORS 头, 给 canvas 提取像素用) ----------
  if (pn === '/api/cover') {
    try {
      const coverUrl = url.searchParams.get('url');
      // URL 校验: 必须是 http(s) 开头, 否则直接 404 (不要让 fetch 抛错)
      if (!coverUrl || !/^https?:\/\//i.test(coverUrl)) {
        res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
        res.end('Invalid cover url');
        return;
      }
      let coverReferer = 'https://music.163.com/';
      try {
        const coverHost = new URL(coverUrl).hostname.toLowerCase();
        if (coverHost.includes('qq.com') || coverHost.includes('qpic.cn')) coverReferer = 'https://y.qq.com/';
        else if (coverHost.includes('kugou.com') || coverHost.includes('kgimg.com')) coverReferer = 'https://www.kugou.com/';
      } catch (e) {}
      const resp = await fetch(coverUrl, { headers: { 'User-Agent': UA, 'Referer': coverReferer } });
      const ct  = resp.headers.get('content-type') || 'image/jpeg';
      const cl  = resp.headers.get('content-length');
      const hdr = {
        'Content-Type': ct,
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=86400',
      };
      if (cl) hdr['Content-Length'] = cl;
      res.writeHead(resp.status, hdr);
      const reader = resp.body.getReader();
      while (true) { const c = await reader.read(); if (c.done) break; res.write(c.value); }
      res.end();
    } catch (err) { console.error('[Cover]', err); res.writeHead(500); res.end(); }
    return;
  }

  // ---------- 音频代理 (支持 Range) ----------
  if (pn === '/api/audio') {
    try {
      const audioUrl = url.searchParams.get('url');
      if (!audioUrl) { res.writeHead(400); res.end('Missing url'); return; }
      const range = req.headers.range || '';
      if (audioUrl.includes('#auth=')) {
        const decrypted = await getQishuiDecryptedAudio(audioUrl);
        if (decrypted && decrypted.buffer) {
          sendAudioBuffer(res, decrypted.buffer, decrypted.contentType, range);
          return;
        }
      }
      const hdr = audioProxyHeadersFor(audioUrl, range);
      const up = await fetch(audioUrl, { headers: hdr });
      const out = {
        'Content-Type': audioContentTypeForUrl(audioUrl, up.headers.get('content-type')),
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
      };
      const cl = up.headers.get('content-length'); if (cl) out['Content-Length'] = cl;
      const cr = up.headers.get('content-range');  if (cr) out['Content-Range']  = cr;
      res.writeHead(up.status, out);
      const reader = up.body.getReader();
      while (true) {
        const c = await reader.read();
        if (c.done) break;
        // 尊重背压:socket 缓冲满时等 drain 再继续拉流, 避免 Hi-Res 大码率下突发喂流/内存暴涨
        if (!res.write(c.value)) await new Promise((resolve) => res.once('drain', resolve));
      }
      res.end();
    } catch (err) { console.error('[Audio]', err); res.writeHead(500); res.end(); }
    return;
  }

  // ---------- 静态资源 ----------
  if (pn === '/favicon.ico') {
    serveStatic(res, path.join(__dirname, 'build', 'icon.ico'));
    return;
  }

  let filePath = pn === '/' ? '/index.html' : pn;
  filePath = path.join(__dirname, 'public', filePath);
  serveStatic(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log('======================================================');
  console.log(' 粒子音乐可视化 v2  →  http://localhost:' + PORT);
  console.log(' 登录态: ' + (userCookie ? '已登录(cookie已加载)' : '未登录'));
  console.log('======================================================');
});

module.exports = server;
