'use strict';

// 汽水在公开构建中只作为元数据目录使用：搜索、封面与歌词。
// 本模块刻意不接入账户会话、直连音频或受保护媒体处理。
const DEFAULT_SEARCH_URL = 'https://api-vehicle.volcengine.com/v2/search/type';
const DEFAULT_CONTENTS_URL = 'https://api-vehicle.volcengine.com/v2/custom/contents';
const REQUEST_TIMEOUT_MS = 8000;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const LYRIC_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;
const REQUEST_HEADERS = Object.freeze({
  Accept: 'application/json,text/plain,*/*',
  'User-Agent': 'Mineradio/2.0 (Qishui public catalog metadata only)',
});

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeLyricBody(value) {
  if (value && typeof value === 'object') {
    value = value.content || value.text || value.lyric || value.lyric_text || '';
  }
  return String(value == null ? '' : value).replace(/\\n/g, '\n').trim();
}

function firstObject() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return {};
}

function firstUrl(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstUrl(item);
      if (found) return found;
    }
    return '';
  }
  if (value && typeof value === 'object') {
    return firstUrl(value.url_list || value.urls || value.url || value.uri || value.src || '');
  }
  const text = normalizeText(value);
  return /^https?:\/\//i.test(text) ? text : '';
}

function endpoint(name, fallback) {
  const value = normalizeText(process.env[name] || fallback);
  return value;
}

function urlWithParams(base, params) {
  const target = new URL(base);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value == null || value === '') return;
    target.searchParams.set(key, String(value));
  });
  return target.toString();
}

async function requestJson(targetUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: REQUEST_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      const error = new Error('QISHUI_CATALOG_HTTP_' + response.status);
      error.code = 'QISHUI_CATALOG_HTTP_ERROR';
      error.statusCode = response.status;
      throw error;
    }
    const contentType = normalizeText(response.headers.get('content-type')).toLowerCase();
    if (contentType && !contentType.includes('json')) {
      const error = new Error('QISHUI_CATALOG_INVALID_RESPONSE');
      error.code = 'QISHUI_CATALOG_INVALID_RESPONSE';
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeoutError = new Error('QISHUI_CATALOG_TIMEOUT');
      timeoutError.code = 'QISHUI_CATALOG_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function createTtlCache(ttlMs) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry || Date.now() - entry.at > ttlMs) {
        if (entry) entries.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { at: Date.now(), value });
      while (entries.size > MAX_CACHE_ENTRIES) entries.delete(entries.keys().next().value);
      return value;
    },
  };
}

const searchCache = createTtlCache(SEARCH_CACHE_TTL_MS);
const lyricCache = createTtlCache(LYRIC_CACHE_TTL_MS);

function catalogRestriction() {
  return {
    category: 'provider_limited',
    action: 'switch_source',
    message: '汽水音乐当前作为搜索与匹配源接入，播放时会自动寻找其它平台的可播版本。',
  };
}

function mapCatalogItem(raw, index, query) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const author = firstObject(raw.author_info, raw.author, raw.artist);
  const album = firstObject(raw.album_info, raw.album);
  const lyricInfo = firstObject(raw.lyric_info, raw.lyric);
  const id = normalizeText(raw.item_id || raw.id || raw.song_id || raw.music_id);
  const name = normalizeText(raw.title || raw.name || raw.song_name);
  if (!id || !name) return null;
  const artist = normalizeText(author.name || raw.author_name || raw.artist_name || raw.singer);
  const lyric = normalizeLyricBody(lyricInfo.lyric_text || lyricInfo.content || lyricInfo.lyric || raw.lyric_text);
  const tlyric = normalizeLyricBody(lyricInfo.translated_lyric || lyricInfo.translation || lyricInfo.tlyric);
  if (lyric || tlyric) lyricCache.set(id, { lyric, tlyric });
  const durationValue = Number(raw.duration_ms || raw.duration || 0) || 0;
  return {
    provider: 'qishui',
    source: 'qishui',
    type: 'qishui',
    id,
    providerSongId: id,
    name,
    artist,
    artists: artist ? [{ id: normalizeText(author.id || author.author_id), name: artist }] : [],
    album: normalizeText(album.name || raw.album_name),
    cover: firstUrl(raw.cover_url || raw.cover || raw.artwork || album.cover_url),
    duration: durationValue > 10000 ? Math.round(durationValue / 1000) : durationValue,
    fee: raw.qishui_label_info && raw.qishui_label_info.only_vip_playable ? 1 : 0,
    playable: false,
    playbackMode: 'recommend-match',
    recommendationSource: 'qishui-public-catalog',
    qishuiRank: index,
    qishuiQuery: normalizeText(query),
    lyric,
    tlyric,
    restriction: catalogRestriction(),
  };
}

function handleQishuiCatalogStatus() {
  return {
    provider: 'qishui',
    label: '汽水音乐',
    short: 'QS',
    enabled: true,
    catalogOnly: true,
    configured: false,
    loggedIn: false,
    playbackKeyReady: false,
    playbackMode: 'recommend-match',
    searchReady: true,
    publicCatalog: true,
    capabilities: {
      search: true,
      lyric: true,
      directPlayback: false,
      login: false,
      userPlaylists: false,
    },
    message: '汽水公开目录已启用；无需登录即可搜索，播放会自动匹配其它平台的可播版本。',
  };
}

async function handleQishuiCatalogSearch(keywords, limit) {
  const query = normalizeText(keywords);
  const safeLimit = Math.max(1, Math.min(18, Number(limit) || 8));
  if (!query) return { ...handleQishuiCatalogStatus(), songs: [], rawCount: 0 };
  const cacheKey = query.toLowerCase() + '|' + safeLimit;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;
  const targetUrl = urlWithParams(endpoint('QISHUI_CATALOG_SEARCH_URL', DEFAULT_SEARCH_URL), {
    keyword: query,
    search_type: 'music',
    limit: safeLimit,
    real_offset: 0,
    search_source: 'qishui',
  });
  const payload = await requestJson(targetUrl);
  const list = payload && payload.data && Array.isArray(payload.data.list) ? payload.data.list : [];
  const result = {
    ...handleQishuiCatalogStatus(),
    songs: list.map((item, index) => mapCatalogItem(item, index, query)).filter(Boolean).slice(0, safeLimit),
    rawCount: list.length,
  };
  if (!result.songs.length) result.message = '汽水公开目录暂时没有返回匹配结果。';
  return searchCache.set(cacheKey, result);
}

async function handleQishuiCatalogLyric(id) {
  const songId = normalizeText(id);
  if (!songId) return { provider: 'qishui', lyric: '', tlyric: '', yrc: '', ytlrc: '', error: 'MISSING_ID' };
  const cached = lyricCache.get(songId);
  if (cached) return { provider: 'qishui', ...cached, yrc: '', ytlrc: '', source: 'qishui-public-catalog-cache' };
  const targetUrl = urlWithParams(endpoint('QISHUI_CATALOG_CONTENTS_URL', DEFAULT_CONTENTS_URL), {
    sources: 'qishui',
    need_author: true,
    need_album: true,
    need_ugc: true,
    need_stat: true,
    item_ids: songId,
  });
  const payload = await requestJson(targetUrl);
  const item = payload && payload.data && Array.isArray(payload.data.list) ? payload.data.list[0] : null;
  const lyricInfo = firstObject(item && item.lyric_info, item && item.lyric);
  const lyric = normalizeLyricBody(lyricInfo.lyric_text || lyricInfo.content || lyricInfo.lyric || lyricInfo.lyric_entity);
  const tlyric = normalizeLyricBody(lyricInfo.translated_lyric || lyricInfo.translation || lyricInfo.tlyric);
  lyricCache.set(songId, { lyric, tlyric });
  return { provider: 'qishui', lyric, tlyric, yrc: '', ytlrc: '', source: 'qishui-public-catalog' };
}

function handleQishuiCatalogPlayback(id) {
  const restriction = catalogRestriction();
  return {
    provider: 'qishui',
    sourceId: normalizeText(id),
    catalogOnly: true,
    playbackMode: 'recommend-match',
    url: '',
    playable: false,
    playbackKeyReady: false,
    reason: restriction.category,
    message: restriction.message,
    restriction,
  };
}

module.exports = {
  handleQishuiCatalogStatus,
  handleQishuiCatalogSearch,
  handleQishuiCatalogLyric,
  handleQishuiCatalogPlayback,
};
