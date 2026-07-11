'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const SPOTIFY_ACCOUNTS_BASE = (process.env.SPOTIFY_ACCOUNTS_BASE || 'https://accounts.spotify.com').replace(/\/+$/, '');
const SPOTIFY_API_BASE = (process.env.SPOTIFY_API_BASE || 'https://api.spotify.com/v1').replace(/\/+$/, '');
const DEFAULT_SPOTIFY_MARKET = String(process.env.MINERADIO_SPOTIFY_MARKET || process.env.SPOTIFY_MARKET || 'US').trim().toUpperCase();
const DEFAULT_SPOTIFY_CONFIG_FILE = path.join(__dirname, '.spotify-credentials.json');
const DEFAULT_SPOTIFY_TOKEN_FILE = path.join(__dirname, '.spotify-token.json');
const DEFAULT_SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:43879/callback';
const DEFAULT_SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
];
const SPOTIFY_LIKED_PLAYLIST_ID = 'spotify-liked';
const SPOTIFY_UA = 'Mineradio/1.1.2 (Spotify Web API bridge)';
const SPOTIFY_SEARCH_LIMIT_MAX = 10;
const SPOTIFY_PLAYLIST_PAGE_LIMIT = 50;

let spotifyClientTokenCache = { token: '', expiresAt: 0 };
const spotifySearchCache = new Map();

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function firstEnv(keys) {
  for (const key of keys) {
    const value = normalizeText(process.env[key]);
    if (value) return value;
  }
  return '';
}

function uniqueList(items) {
  const out = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    item = normalizeText(item);
    if (!item || seen.has(item)) return;
    seen.add(item);
    out.push(item);
  });
  return out;
}

function normalizeScopes(value) {
  if (Array.isArray(value)) return uniqueList(value);
  return uniqueList(String(value || '').split(/[\s,;]+/));
}

function spotifyConfigFileCandidates() {
  const candidates = [];
  function add(value) {
    value = normalizeText(value);
    if (!value) return;
    const resolved = path.resolve(value);
    if (!candidates.includes(resolved)) candidates.push(resolved);
  }
  add(firstEnv(['SPOTIFY_CONFIG_FILE', 'MINERADIO_SPOTIFY_CONFIG_FILE']));
  add(DEFAULT_SPOTIFY_CONFIG_FILE);
  add(path.join(__dirname, 'spotify-credentials.json'));
  return candidates;
}

function normalizeSpotifyFileConfig(raw, file) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const spotify = raw.spotify && typeof raw.spotify === 'object' ? raw.spotify : raw;
  return {
    clientId: normalizeText(spotify.clientId || spotify.client_id || spotify.id),
    clientSecret: normalizeText(spotify.clientSecret || spotify.client_secret || spotify.secret),
    redirectUri: normalizeText(spotify.redirectUri || spotify.redirect_uri || spotify.callbackUrl || spotify.callback_url),
    scopes: normalizeScopes(spotify.scopes || spotify.scope),
    market: normalizeText(spotify.market || spotify.country || ''),
    file,
    source: file ? 'file' : '',
  };
}

function readSpotifyFileConfig() {
  const candidates = spotifyConfigFileCandidates();
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      const config = normalizeSpotifyFileConfig(parsed, file);
      if (config.clientId || config.clientSecret || config.redirectUri || config.scopes.length || config.market) return config;
    } catch (err) {
      console.warn('[SpotifyConfig] ignored invalid config file:', file, err.message);
    }
  }
  return normalizeSpotifyFileConfig(null, '');
}

function getSpotifyConfigFile() {
  return process.env.SPOTIFY_CONFIG_FILE || process.env.MINERADIO_SPOTIFY_CONFIG_FILE || DEFAULT_SPOTIFY_CONFIG_FILE;
}

function saveSpotifyConfig(input) {
  input = input && typeof input === 'object' ? input : {};
  const clientId = normalizeText(input.clientId || input.client_id || input.id);
  const clientSecret = normalizeText(input.clientSecret || input.client_secret || input.secret);
  const redirectUri = normalizeText(input.redirectUri || input.redirect_uri || input.callbackUrl || input.callback_url) || DEFAULT_SPOTIFY_REDIRECT_URI;
  const scopes = normalizeScopes(input.scopes || input.scope);
  const market = normalizeText(input.market || input.country || DEFAULT_SPOTIFY_MARKET || 'US').toUpperCase();
  if (!clientId) {
    const err = new Error('SPOTIFY_CLIENT_ID_REQUIRED');
    err.code = 'SPOTIFY_CLIENT_ID_REQUIRED';
    err.missing = ['SPOTIFY_CLIENT_ID'];
    throw err;
  }
  const file = getSpotifyConfigFile();
  writeJsonFile(file, {
    spotify: {
      clientId,
      ...(clientSecret ? { clientSecret } : {}),
      redirectUri,
      scopes: scopes.length ? scopes : DEFAULT_SPOTIFY_SCOPES,
      market,
    },
  });
  return {
    provider: 'spotify',
    ok: true,
    saved: true,
    credentialsFile: file,
    credentialsFileExists: true,
    clientId,
    redirectUri,
    scope: (scopes.length ? scopes : DEFAULT_SPOTIFY_SCOPES).join(' '),
    market,
  };
}

function getSpotifyTokenFile() {
  return process.env.SPOTIFY_TOKEN_FILE || process.env.MINERADIO_SPOTIFY_TOKEN_FILE || DEFAULT_SPOTIFY_TOKEN_FILE;
}

function readStoredSpotifyToken() {
  const file = getSpotifyTokenFile();
  try {
    if (!file || !fs.existsSync(file)) return { file, accessToken: '', refreshToken: '', expiresAt: 0 };
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return {
      file,
      accessToken: normalizeText(raw.accessToken || raw.access_token),
      refreshToken: normalizeText(raw.refreshToken || raw.refresh_token),
      tokenType: normalizeText(raw.tokenType || raw.token_type || 'Bearer') || 'Bearer',
      scope: normalizeText(raw.scope || (Array.isArray(raw.scopes) ? raw.scopes.join(' ') : '')),
      expiresAt: Number(raw.expiresAt || raw.expires_at || 0) || 0,
      createdAt: Number(raw.createdAt || raw.created_at || 0) || 0,
    };
  } catch (err) {
    console.warn('[SpotifyToken] ignored invalid token file:', file, err.message);
    return { file, accessToken: '', refreshToken: '', expiresAt: 0, invalid: true };
  }
}

function writeJsonFile(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
}

function saveSpotifyOAuthToken(payload) {
  payload = payload || {};
  const previous = readStoredSpotifyToken();
  const expiresIn = Math.max(60, Number(payload.expires_in || payload.expiresIn) || 3600);
  const now = Date.now();
  const saved = {
    accessToken: normalizeText(payload.access_token || payload.accessToken),
    refreshToken: normalizeText(payload.refresh_token || payload.refreshToken || previous.refreshToken),
    tokenType: normalizeText(payload.token_type || payload.tokenType || 'Bearer') || 'Bearer',
    scope: normalizeText(payload.scope || previous.scope || DEFAULT_SPOTIFY_SCOPES.join(' ')),
    expiresAt: Number(payload.expiresAt || payload.expires_at) || (now + expiresIn * 1000),
    createdAt: now,
  };
  if (!saved.accessToken && !saved.refreshToken) {
    const err = new Error('SPOTIFY_TOKEN_MISSING');
    err.code = 'SPOTIFY_TOKEN_MISSING';
    throw err;
  }
  writeJsonFile(getSpotifyTokenFile(), saved);
  return {
    provider: 'spotify',
    loggedIn: !!saved.accessToken,
    tokenConfigured: !!(saved.accessToken || saved.refreshToken),
    expiresAt: saved.expiresAt,
    scope: saved.scope,
  };
}

function clearSpotifyToken() {
  try {
    const file = getSpotifyTokenFile();
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    console.warn('[SpotifyToken] clear skipped:', err.message);
  }
  return { ok: true, provider: 'spotify', loggedIn: false };
}

function getSpotifyOAuthConfig() {
  const fileConfig = readSpotifyFileConfig();
  const envClientId = firstEnv(['SPOTIFY_CLIENT_ID', 'MINERADIO_SPOTIFY_CLIENT_ID']);
  const envClientSecret = firstEnv(['SPOTIFY_CLIENT_SECRET', 'MINERADIO_SPOTIFY_CLIENT_SECRET']);
  const envRedirectUri = firstEnv(['SPOTIFY_REDIRECT_URI', 'MINERADIO_SPOTIFY_REDIRECT_URI']);
  const envScopes = normalizeScopes(firstEnv(['SPOTIFY_SCOPES', 'SPOTIFY_SCOPE', 'MINERADIO_SPOTIFY_SCOPES']));
  const clientId = envClientId || fileConfig.clientId;
  const clientSecret = envClientSecret || fileConfig.clientSecret;
  const redirectUri = envRedirectUri || fileConfig.redirectUri || DEFAULT_SPOTIFY_REDIRECT_URI;
  const scopes = envScopes.length ? envScopes : (fileConfig.scopes.length ? fileConfig.scopes : DEFAULT_SPOTIFY_SCOPES);
  const market = (firstEnv(['SPOTIFY_MARKET', 'MINERADIO_SPOTIFY_MARKET']) || fileConfig.market || DEFAULT_SPOTIFY_MARKET || 'US').toUpperCase();
  const missing = [];
  if (!clientId) missing.push('SPOTIFY_CLIENT_ID');
  return {
    provider: 'spotify',
    configured: missing.length === 0,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    scope: scopes.join(' '),
    market,
    credentialsFile: fileConfig.file,
    configSource: envClientId || envClientSecret || envRedirectUri || envScopes.length ? 'env' : (fileConfig.source || (redirectUri === DEFAULT_SPOTIFY_REDIRECT_URI ? 'default' : '')),
    missing,
  };
}

function getSpotifyConfig() {
  const oauth = getSpotifyOAuthConfig();
  const token = readStoredSpotifyToken();
  const tokenFileExists = !!(token.file && fs.existsSync(token.file));
  const credentialsFileExists = !!(oauth.credentialsFile && fs.existsSync(oauth.credentialsFile));
  const clientCredentialsConfigured = !!(oauth.clientId && oauth.clientSecret);
  const oauthConfigured = !!(oauth.clientId && oauth.redirectUri);
  const tokenConfigured = !!(token.accessToken || token.refreshToken);
  const localConfigMissing = !tokenConfigured && !oauth.clientId && !credentialsFileExists;
  const spotifyConfigMessage = clientCredentialsConfigured || tokenConfigured
    ? 'Spotify Web API 已接入；播放仍会按匹配源自动换源。'
    : (localConfigMissing
      ? 'Spotify 未连接：请先粘贴一次 Client ID 保存配置，再打开官方 OAuth 授权。'
      : 'Spotify 已保存 Client ID，可直接打开官方 OAuth 授权；Client Secret 只用于未登录时的公开搜索加速，可不填。');
  const missing = [];
  if (!oauth.clientId) missing.push('SPOTIFY_CLIENT_ID');
  const clientCredentialsMissing = [];
  if (!oauth.clientId) clientCredentialsMissing.push('SPOTIFY_CLIENT_ID');
  if (!oauth.clientSecret) clientCredentialsMissing.push('SPOTIFY_CLIENT_SECRET');
  return {
    provider: 'spotify',
    configured: !!(clientCredentialsConfigured || oauthConfigured || tokenConfigured),
    loggedIn: false,
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
    redirectUri: oauth.redirectUri,
    scopes: oauth.scopes,
    scope: oauth.scope,
    market: oauth.market,
    clientCredentialsConfigured,
    clientCredentialsMissing,
    oauthConfigured,
    oauthMissing: oauth.missing,
    tokenConfigured,
    tokenFileExists,
    tokenReady: !!(token.accessToken && Date.now() < token.expiresAt - 30000),
    tokenFile: token.file,
    credentialsFile: oauth.credentialsFile,
    credentialsFileExists,
    localConfigMissing,
    configSource: oauth.configSource,
    missing,
    playbackMode: 'recommend-match',
    capabilities: {
      search: clientCredentialsConfigured || tokenConfigured,
      metadata: clientCredentialsConfigured || tokenConfigured,
      lyric: false,
      playableUrl: false,
      userPlaylists: tokenConfigured,
      likedTracks: tokenConfigured,
    },
    message: spotifyConfigMessage,
  };
}

function requestText(targetUrl, opts, body) {
  opts = opts || {};
  const timeoutMs = Number(opts.timeoutMs) || 10000;
  const method = opts.method || (body == null ? 'GET' : 'POST');
  const headers = Object.assign({ 'User-Agent': SPOTIFY_UA }, opts.headers || {});
  return new Promise((resolve, reject) => {
    const req = https.request(targetUrl, { method, headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(text);
          return;
        }
        const err = new Error('SPOTIFY_HTTP_' + res.statusCode);
        err.statusCode = res.statusCode;
        err.body = text;
        err.retryAfter = res.headers && res.headers['retry-after'];
        reject(err);
      });
    });
    req.on('timeout', () => req.destroy(new Error('SPOTIFY_REQUEST_TIMEOUT')));
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

async function requestJson(targetUrl, opts, body) {
  const text = await requestText(targetUrl, opts, body);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    err.message = 'SPOTIFY_JSON_PARSE_FAILED: ' + err.message;
    throw err;
  }
}

function spotifyErrorDetails(err) {
  err = err || {};
  let apiMessage = '';
  let apiStatus = '';
  try {
    const body = err.body ? JSON.parse(String(err.body)) : null;
    if (body && body.error) {
      if (typeof body.error === 'string') {
        apiMessage = body.error_description || body.error;
      } else {
        apiMessage = body.error.message || body.error.reason || '';
        apiStatus = body.error.status || '';
      }
    }
  } catch (parseErr) { }
  const statusCode = Number(err.statusCode || apiStatus || 0) || 0;
  const code = normalizeText(err.code || (statusCode ? ('SPOTIFY_HTTP_' + statusCode) : err.message)) || 'SPOTIFY_ERROR';
  let message = apiMessage || normalizeText(err.message) || 'Spotify 请求失败';
  if (statusCode === 401 || code === 'SPOTIFY_REFRESH_TOKEN_MISSING') {
    message = 'Spotify 登录已过期，请重新连接 Spotify。';
  } else if (statusCode === 403) {
    message = 'Spotify 授权权限不够，请在 Spotify 登录面板里重新连接一次。';
  } else if (statusCode === 404) {
    message = 'Spotify 没找到这个歌单，可能已删除、未公开或当前账号无权访问。';
  } else if (/scope|permission|insufficient/i.test(apiMessage || code)) {
    message = 'Spotify 授权权限不够，请重新连接 Spotify 后再同步歌单。';
  }
  return {
    error: code,
    message,
    statusCode,
    spotifyApiMessage: apiMessage,
  };
}

function spotifyUrl(pathname, params) {
  const cleanPath = String(pathname || '').replace(/^\/+/, '');
  const url = new URL(cleanPath, SPOTIFY_API_BASE + '/');
  Object.keys(params || {}).forEach((key) => {
    const value = params[key];
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function spotifyTokenHeaders(config) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (config && config.clientSecret) {
    headers.Authorization = 'Basic ' + Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64');
  }
  return headers;
}

async function requestSpotifyToken(bodyParams) {
  const config = getSpotifyOAuthConfig();
  if (!config.clientId) {
    const err = new Error('SPOTIFY_CLIENT_ID_REQUIRED');
    err.code = 'SPOTIFY_CLIENT_ID_REQUIRED';
    err.missing = ['SPOTIFY_CLIENT_ID'];
    throw err;
  }
  bodyParams = Object.assign({ client_id: config.clientId }, bodyParams || {});
  const body = new URLSearchParams(bodyParams).toString();
  return requestJson(SPOTIFY_ACCOUNTS_BASE + '/api/token', {
    method: 'POST',
    timeoutMs: 9000,
    headers: spotifyTokenHeaders(config),
  }, body);
}

async function getSpotifyClientCredentialsAccessToken() {
  const config = getSpotifyOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    const err = new Error('SPOTIFY_CREDENTIALS_REQUIRED');
    err.status = getSpotifyConfig();
    throw err;
  }
  const now = Date.now();
  if (spotifyClientTokenCache.token && now < spotifyClientTokenCache.expiresAt - 30000) return spotifyClientTokenCache.token;
  const json = await requestSpotifyToken({ grant_type: 'client_credentials' });
  const token = normalizeText(json && json.access_token);
  if (!token) throw new Error('SPOTIFY_TOKEN_MISSING');
  const expiresIn = Math.max(60, Number(json.expires_in) || 3600);
  spotifyClientTokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

async function refreshSpotifyUserToken() {
  const stored = readStoredSpotifyToken();
  if (!stored.refreshToken) {
    const err = new Error('SPOTIFY_REFRESH_TOKEN_MISSING');
    err.code = 'SPOTIFY_REFRESH_TOKEN_MISSING';
    throw err;
  }
  const json = await requestSpotifyToken({
    grant_type: 'refresh_token',
    refresh_token: stored.refreshToken,
  });
  const token = normalizeText(json && json.access_token);
  if (!token) throw new Error('SPOTIFY_TOKEN_MISSING');
  saveSpotifyOAuthToken(Object.assign({}, json, {
    refresh_token: json.refresh_token || stored.refreshToken,
    scope: json.scope || stored.scope,
  }));
  return readStoredSpotifyToken();
}

async function getSpotifyUserAccessToken() {
  let stored = readStoredSpotifyToken();
  if (stored.accessToken && Date.now() < stored.expiresAt - 30000) return stored.accessToken;
  stored = await refreshSpotifyUserToken();
  if (!stored.accessToken) throw new Error('SPOTIFY_TOKEN_MISSING');
  return stored.accessToken;
}

async function getSpotifyApiAccessToken(opts) {
  opts = opts || {};
  if (opts.preferUser !== false) {
    const stored = readStoredSpotifyToken();
    if (stored.accessToken || stored.refreshToken) {
      try {
        return await getSpotifyUserAccessToken();
      } catch (err) {
        if (!getSpotifyConfig().clientCredentialsConfigured) throw err;
      }
    }
  }
  return getSpotifyClientCredentialsAccessToken();
}

async function spotifyGet(pathname, params, opts) {
  opts = opts || {};
  const token = opts.accessToken || await getSpotifyApiAccessToken({ preferUser: opts.preferUser !== false });
  return requestJson(spotifyUrl(pathname, params || {}), {
    timeoutMs: opts.timeoutMs || 9000,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
    },
  });
}

async function spotifyUserGet(pathname, params, opts) {
  opts = opts || {};
  const token = opts.accessToken || await getSpotifyUserAccessToken();
  return spotifyGet(pathname, params, Object.assign({}, opts, { accessToken: token, preferUser: true }));
}

function cacheWrap(map, key, ttlMs, loader) {
  const now = Date.now();
  const cached = map.get(key);
  if (cached && now - cached.at < ttlMs) return Promise.resolve(cached.value);
  return Promise.resolve(loader()).then((value) => {
    map.set(key, { at: Date.now(), value });
    if (map.size > 80) {
      const oldest = [...map.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) map.delete(oldest[0]);
    }
    return value;
  });
}

function spotifyImage(images) {
  images = Array.isArray(images) ? images.filter(item => item && item.url) : [];
  if (!images.length) return '';
  const sorted = images.slice().sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
  return sorted[0].url || '';
}

function mapSpotifyTrack(track, index, query) {
  track = track || {};
  const id = normalizeText(track.id);
  const name = normalizeText(track.name);
  if (!id || !name || track.is_local) return null;
  const album = track.album || {};
  const artists = Array.isArray(track.artists) ? track.artists.map(artist => ({
    id: normalizeText(artist && artist.id),
    name: normalizeText(artist && artist.name),
    mid: normalizeText(artist && artist.id),
    uri: normalizeText(artist && artist.uri),
  })).filter(artist => artist.name) : [];
  const artistText = artists.map(artist => artist.name).join(' / ');
  return {
    provider: 'spotify',
    source: 'spotify',
    type: 'spotify',
    id,
    providerSongId: id,
    spotifyId: id,
    uri: normalizeText(track.uri),
    spotifyUri: normalizeText(track.uri),
    spotifyUrl: track.external_urls && track.external_urls.spotify || '',
    name,
    artist: artistText,
    artists,
    album: normalizeText(album.name),
    albumId: normalizeText(album.id),
    albumUri: normalizeText(album.uri),
    cover: spotifyImage(album.images),
    duration: Math.max(0, Math.round((Number(track.duration_ms) || 0) / 1000)),
    durationMs: Number(track.duration_ms) || 0,
    popularity: Number(track.popularity || 0) || 0,
    explicit: !!track.explicit,
    fee: 0,
    playable: false,
    playbackMode: 'recommend-match',
    recommendationSource: 'spotify-web-api',
    spotifyRank: index,
    spotifyQuery: query || '',
    previewUrl: track.preview_url || '',
    restriction: {
      category: 'provider_limited',
      reason: 'spotify_metadata_only',
      message: 'Spotify 官方 Web API 当前作为搜索/歌单资料源接入，播放会自动寻找其它可播版本。',
      action: 'switch_source',
    },
  };
}

function dedupeSpotifySongs(songs) {
  const out = [];
  const seen = new Set();
  (songs || []).forEach((song) => {
    const key = (song.id || '') + '|' + normalizeText(song.name).toLowerCase() + '|' + normalizeText(song.artist).toLowerCase();
    if (!song || !song.name || seen.has(key)) return;
    seen.add(key);
    out.push(song);
  });
  return out;
}

function normalizeSpotifyProfile(profile) {
  profile = profile || {};
  const product = normalizeText(profile.product || '').toLowerCase();
  const isPremium = product === 'premium';
  return {
    userId: normalizeText(profile.id),
    nickname: normalizeText(profile.display_name || profile.id || 'Spotify'),
    avatar: spotifyImage(profile.images),
    country: normalizeText(profile.country),
    product: product || 'unknown',
    vipType: isPremium ? 1 : 0,
    vipLevel: isPremium ? 'vip' : 'none',
    vipLabel: isPremium ? 'Premium' : (product ? product.toUpperCase() : 'Free'),
    isVip: isPremium,
    isSvip: false,
  };
}

function buildSpotifyOAuthAuthorizeUrl(options) {
  options = options || {};
  const config = getSpotifyOAuthConfig();
  if (!config.configured) {
    const err = new Error('SPOTIFY_OAUTH_NOT_CONFIGURED');
    err.code = 'SPOTIFY_OAUTH_NOT_CONFIGURED';
    err.missing = config.missing;
    throw err;
  }
  const codeChallenge = normalizeText(options.codeChallenge || options.code_challenge);
  if (!codeChallenge) {
    const err = new Error('SPOTIFY_PKCE_CHALLENGE_REQUIRED');
    err.code = 'SPOTIFY_PKCE_CHALLENGE_REQUIRED';
    throw err;
  }
  const redirectUri = normalizeText(options.redirectUri || config.redirectUri);
  const url = new URL('/authorize', SPOTIFY_ACCOUNTS_BASE + '/');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('scope', normalizeText(options.scope || config.scope || DEFAULT_SPOTIFY_SCOPES.join(' ')));
  if (options.state) url.searchParams.set('state', String(options.state));
  if (options.showDialog) url.searchParams.set('show_dialog', 'true');
  return url.toString();
}

async function exchangeSpotifyOAuthCode(options) {
  options = options || {};
  const config = getSpotifyOAuthConfig();
  if (!config.configured) {
    const err = new Error('SPOTIFY_OAUTH_NOT_CONFIGURED');
    err.code = 'SPOTIFY_OAUTH_NOT_CONFIGURED';
    err.missing = config.missing;
    throw err;
  }
  const code = normalizeText(options.code);
  const codeVerifier = normalizeText(options.codeVerifier || options.code_verifier);
  if (!code) throw new Error('SPOTIFY_OAUTH_CODE_MISSING');
  if (!codeVerifier) throw new Error('SPOTIFY_PKCE_VERIFIER_MISSING');
  const json = await requestSpotifyToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: normalizeText(options.redirectUri || config.redirectUri),
    code_verifier: codeVerifier,
  });
  saveSpotifyOAuthToken(json);
  return handleSpotifyStatus();
}

async function handleSpotifyStatus() {
  const config = getSpotifyConfig();
  const token = readStoredSpotifyToken();
  let profile = null;
  let profileError = '';
  let loggedIn = false;
  if (token.accessToken || token.refreshToken) {
    try {
      profile = await spotifyUserGet('/me', {}, { timeoutMs: 9000 });
      loggedIn = true;
    } catch (err) {
      profileError = err.message || 'SPOTIFY_PROFILE_FAILED';
    }
  }
  const normalized = normalizeSpotifyProfile(profile);
  return Object.assign({}, config, normalized, {
    clientSecret: '',
    loggedIn,
    configured: !!(config.configured || loggedIn),
    profileReady: loggedIn,
    tokenConfigured: !!(token.accessToken || token.refreshToken),
    tokenReady: !!(token.accessToken && Date.now() < token.expiresAt - 30000),
    stale: !!(!loggedIn && (token.accessToken || token.refreshToken)),
    error: profileError || '',
    capabilities: Object.assign({}, config.capabilities, {
      search: !!(config.clientCredentialsConfigured || loggedIn),
      metadata: !!(config.clientCredentialsConfigured || loggedIn),
      userPlaylists: loggedIn,
      likedTracks: loggedIn,
      lyric: false,
      playableUrl: false,
    }),
    message: loggedIn
      ? 'Spotify 登录态已保存，可同步会员状态、歌单和 Liked Songs；播放仍会自动换源。'
      : config.message,
  });
}

async function handleSpotifySearch(keywords, limit) {
  keywords = normalizeText(keywords);
  limit = Math.max(1, Math.min(18, Number(limit) || 8));
  const status = getSpotifyConfig();
  if (!keywords) return { provider: 'spotify', configured: status.configured, songs: [], message: status.message };
  if (!status.capabilities.search) {
    return {
      provider: 'spotify',
      configured: status.configured,
      songs: [],
      error: 'SPOTIFY_AUTH_REQUIRED',
      reason: 'missing_spotify_auth',
      message: status.message,
      missing: status.oauthMissing && status.oauthMissing.length ? status.oauthMissing : status.missing,
    };
  }
  const cacheKey = [keywords.toLowerCase(), limit, status.market, status.tokenConfigured ? 'user' : 'client'].join('|');
  return cacheWrap(spotifySearchCache, cacheKey, 2 * 60 * 1000, async () => {
    const pages = [];
    let offset = 0;
    while (pages.length < limit) {
      const pageLimit = Math.min(SPOTIFY_SEARCH_LIMIT_MAX, limit - pages.length);
      const json = await spotifyGet('/search', {
        q: keywords,
        type: 'track',
        market: status.market,
        limit: pageLimit,
        offset,
      }, { timeoutMs: 9000, preferUser: true });
      const items = json && json.tracks && Array.isArray(json.tracks.items) ? json.tracks.items : [];
      pages.push(...items);
      if (!items.length || !json.tracks || !json.tracks.next) break;
      offset += pageLimit;
      if (offset >= 40) break;
    }
    const songs = dedupeSpotifySongs(pages.map((item, index) => mapSpotifyTrack(item, index, keywords)).filter(Boolean)).slice(0, limit);
    return {
      provider: 'spotify',
      configured: true,
      market: status.market,
      songs,
      rawCount: pages.length,
      message: songs.length ? '' : 'Spotify 没有返回匹配结果。',
    };
  });
}

function mapSpotifyPlaylist(item, profile) {
  item = item || {};
  const id = normalizeText(item.id);
  if (!id) return null;
  const owner = item.owner || {};
  const ownerId = normalizeText(owner.id);
  const profileId = normalizeText(profile && profile.id);
  const owned = !!(profileId && ownerId === profileId);
  return {
    provider: 'spotify',
    source: 'spotify',
    id,
    name: normalizeText(item.name || 'Spotify Playlist'),
    cover: spotifyImage(item.images),
    creator: normalizeText(owner.display_name || owner.id || 'Spotify'),
    trackCount: Number(item.tracks && item.tracks.total) || 0,
    playCount: 0,
    subscribed: !owned,
    shelfPane: owned ? 'mine' : 'fav',
    public: item.public,
    collaborative: !!item.collaborative,
    spotifyUrl: item.external_urls && item.external_urls.spotify || '',
    spotifyUri: normalizeText(item.uri),
  };
}

async function buildSpotifyLikedPlaylistCard(profile) {
  try {
    const json = await spotifyUserGet('/me/tracks', { limit: 1, offset: 0, market: getSpotifyConfig().market }, { timeoutMs: 9000 });
    const first = json && Array.isArray(json.items) && json.items[0] && json.items[0].track;
    return {
      provider: 'spotify',
      source: 'spotify',
      id: SPOTIFY_LIKED_PLAYLIST_ID,
      virtual: true,
      name: 'Spotify 喜欢的歌曲',
      cover: first ? spotifyImage(first.album && first.album.images) : '',
      creator: normalizeText(profile && (profile.display_name || profile.id)) || 'Spotify',
      trackCount: Number(json && json.total) || 0,
      playCount: 0,
      subscribed: false,
      shelfPane: 'fav',
    };
  } catch (err) {
    const detail = spotifyErrorDetails(err);
    return {
      provider: 'spotify',
      source: 'spotify',
      id: SPOTIFY_LIKED_PLAYLIST_ID,
      virtual: true,
      name: 'Spotify 喜欢的歌曲',
      cover: '',
      creator: normalizeText(profile && (profile.display_name || profile.id)) || 'Spotify',
      trackCount: 0,
      playCount: 0,
      subscribed: false,
      shelfPane: 'fav',
      warning: detail.message,
      error: detail.error,
      message: detail.message,
    };
  }
}

async function handleSpotifyUserPlaylists(options) {
  options = options || {};
  const status = await handleSpotifyStatus();
  if (!status.loggedIn) {
    return { provider: 'spotify', loggedIn: false, playlists: [], message: status.message, error: status.error || '' };
  }
  const profile = await spotifyUserGet('/me', {}, { timeoutMs: 9000 });
  const maxTotal = Math.max(1, Math.min(500, Number(options.limit) || 300));
  const playlists = [];
  let offset = Math.max(0, Number(options.offset) || 0);
  let playlistError = null;
  try {
    while (playlists.length < maxTotal) {
      const pageLimit = Math.min(SPOTIFY_PLAYLIST_PAGE_LIMIT, maxTotal - playlists.length);
      const json = await spotifyUserGet('/me/playlists', { limit: pageLimit, offset }, { timeoutMs: 9000 });
      const items = Array.isArray(json && json.items) ? json.items : [];
      items.forEach((item) => {
        const mapped = mapSpotifyPlaylist(item, profile);
        if (mapped) playlists.push(mapped);
      });
      if (!items.length || !(json && json.next)) break;
      offset += items.length;
    }
  } catch (err) {
    playlistError = spotifyErrorDetails(err);
  }
  const likedCard = await buildSpotifyLikedPlaylistCard(profile);
  return {
    provider: 'spotify',
    loggedIn: true,
    userId: normalizeText(profile && profile.id),
    playlists: [likedCard].concat(playlists),
    error: playlistError && playlistError.error || '',
    message: playlistError && playlistError.message || '',
  };
}

async function handleSpotifyPlaylistTracks(playlistId, opts) {
  opts = opts || {};
  playlistId = normalizeText(playlistId);
  const status = await handleSpotifyStatus();
  if (!status.loggedIn) {
    return { provider: 'spotify', loggedIn: false, playlist: { id: playlistId, provider: 'spotify', name: '' }, tracks: [], message: status.message, error: status.error || '' };
  }
  const limit = Math.max(1, Math.min(100, Number(opts.limit) || 48));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const market = normalizeText(opts.market || status.market || DEFAULT_SPOTIFY_MARKET);
  if (!playlistId || playlistId === SPOTIFY_LIKED_PLAYLIST_ID || playlistId === 'liked') {
    let json = null;
    try {
      json = await spotifyUserGet('/me/tracks', { limit, offset, market }, { timeoutMs: 12000 });
    } catch (err) {
      const detail = spotifyErrorDetails(err);
      return Object.assign({
        provider: 'spotify',
        loggedIn: true,
        playlist: {
          provider: 'spotify',
          id: SPOTIFY_LIKED_PLAYLIST_ID,
          name: 'Spotify 喜欢的歌曲',
          trackCount: 0,
        },
        tracks: [],
        total: 0,
        offset,
        limit,
        nextOffset: offset,
        hasMore: false,
        partial: true,
      }, detail);
    }
    const items = Array.isArray(json && json.items) ? json.items : [];
    const tracks = items.map((item, index) => mapSpotifyTrack(item && item.track, offset + index, 'liked')).filter(Boolean);
    return {
      provider: 'spotify',
      loggedIn: true,
      playlist: {
        provider: 'spotify',
        id: SPOTIFY_LIKED_PLAYLIST_ID,
        name: 'Spotify 喜欢的歌曲',
        trackCount: Number(json && json.total) || tracks.length,
      },
      tracks,
      total: Number(json && json.total) || tracks.length,
      offset,
      limit,
      nextOffset: offset + items.length,
      hasMore: !!(json && json.next),
      partial: true,
    };
  }
  let json = null;
  try {
    json = await spotifyUserGet('/playlists/' + encodeURIComponent(playlistId) + '/tracks', { limit, offset, market }, { timeoutMs: 12000 });
  } catch (err) {
    const detail = spotifyErrorDetails(err);
    return Object.assign({
      provider: 'spotify',
      loggedIn: true,
      playlist: {
        provider: 'spotify',
        id: playlistId,
        name: '',
        trackCount: 0,
      },
      tracks: [],
      total: 0,
      offset,
      limit,
      nextOffset: offset,
      hasMore: false,
      partial: true,
    }, detail);
  }
  const items = Array.isArray(json && json.items) ? json.items : [];
  const tracks = items.map((item, index) => mapSpotifyTrack(item && item.track, offset + index, playlistId)).filter(Boolean);
  return {
    provider: 'spotify',
    loggedIn: true,
    playlist: {
      provider: 'spotify',
      id: playlistId,
      name: '',
      trackCount: Number(json && json.total) || tracks.length,
    },
    tracks,
    total: Number(json && json.total) || tracks.length,
    offset,
    limit,
    nextOffset: offset + items.length,
    hasMore: !!(json && json.next),
    partial: true,
  };
}

async function handleSpotifyAlbumDetail(albumId, opts) {
  opts = opts || {};
  const id = normalizeText(albumId);
  const limit = Math.max(1, Math.min(100, parseInt(opts.limit || '80', 10) || 80));
  const market = normalizeText(opts.market || getSpotifyConfig().market);
  if (!id) return { provider: 'spotify', error: 'MISSING_ALBUM_ID', album: null, songs: [] };
  const params = market ? { market } : {};
  const album = await spotifyGet('/albums/' + encodeURIComponent(id), params, { timeoutMs: 12000 });
  const albumInfo = {
    provider: 'spotify',
    id: normalizeText(album && album.id) || id,
    albumId: normalizeText(album && album.id) || id,
    name: normalizeText(album && album.name),
    artist: Array.isArray(album && album.artists) ? album.artists.map(artist => normalizeText(artist && artist.name)).filter(Boolean).join(' / ') : '',
    artists: Array.isArray(album && album.artists) ? album.artists.map(artist => ({ id: normalizeText(artist && artist.id), name: normalizeText(artist && artist.name), uri: normalizeText(artist && artist.uri) })).filter(artist => artist.name) : [],
    cover: spotifyImage(album && album.images),
    releaseDate: normalizeText(album && album.release_date),
    trackCount: Number(album && album.total_tracks) || 0,
    spotifyUrl: album && album.external_urls && album.external_urls.spotify || '',
    spotifyUri: normalizeText(album && album.uri),
  };
  let items = album && album.tracks && Array.isArray(album.tracks.items) ? album.tracks.items.slice() : [];
  let offset = items.length;
  while (items.length < limit && album && album.tracks && album.tracks.next) {
    const page = await spotifyGet('/albums/' + encodeURIComponent(id) + '/tracks', {
      limit: Math.min(50, limit - items.length),
      offset,
      ...(market ? { market } : {}),
    }, { timeoutMs: 12000 });
    const pageItems = Array.isArray(page && page.items) ? page.items : [];
    items = items.concat(pageItems);
    offset += pageItems.length;
    if (!page || !page.next || !pageItems.length) break;
  }
  const songs = items.slice(0, limit).map((track, index) => {
    if (!track) return null;
    return mapSpotifyTrack(Object.assign({}, track, {
      album: {
        id: albumInfo.albumId,
        name: albumInfo.name,
        uri: albumInfo.spotifyUri,
        images: album && album.images,
      },
    }), index, 'album:' + id);
  }).filter(Boolean);
  return {
    provider: 'spotify',
    album: albumInfo,
    songs,
    total: albumInfo.trackCount || songs.length,
  };
}

async function handleSpotifySongUrl(track) {
  const id = normalizeText(track && (track.id || track.providerSongId || track.spotifyId));
  return {
    provider: 'spotify',
    id,
    url: '',
    playable: false,
    playbackMode: 'recommend-match',
    reason: 'provider_limited',
    restriction: {
      category: 'provider_limited',
      reason: 'spotify_metadata_only',
      message: 'Spotify 官方 Web API 不提供可交给 Mineradio 播放的音频直链，正在自动换源。',
      action: 'switch_source',
    },
  };
}

async function handleSpotifyLyric(id) {
  return {
    provider: 'spotify',
    id: normalizeText(id),
    lyric: '',
    tlyric: '',
    yrc: '',
    ytlrc: '',
    source: 'none',
    message: 'Spotify Web API 不提供歌词，Mineradio 会沿用跨平台歌词兜底。',
  };
}

module.exports = {
  getSpotifyConfig,
  getSpotifyOAuthConfig,
  saveSpotifyConfig,
  buildSpotifyOAuthAuthorizeUrl,
  exchangeSpotifyOAuthCode,
  saveSpotifyOAuthToken,
  clearSpotifyToken,
  handleSpotifyStatus,
  handleSpotifySearch,
  handleSpotifyUserPlaylists,
  handleSpotifyPlaylistTracks,
  handleSpotifyAlbumDetail,
  handleSpotifySongUrl,
  handleSpotifyLyric,
  SPOTIFY_SEARCH_LIMIT_MAX,
  SPOTIFY_LIKED_PLAYLIST_ID,
};
