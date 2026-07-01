const MOBILE_KUGOU_REFERER = 'https://m.kugou.com/';
const MOBILE_KUGOU_ORIGIN = 'https://m.kugou.com';
const MOBILE_KUGOU_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const KUGOU_SEARCH_MOBILE_URL = 'https://mobiles.kugou.com/api/v3/search/song';

function escRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch (_) { return fallback; }
}

function extractKugouPlaylistId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let match = raw.match(/\/plist\/list\/(\d+)(?:\/|$)/i);
  if (match) return match[1];
  match = raw.match(/\/yy\/special\/single\/(\d+)(?:\.html)?(?:[?#]|$)/i);
  if (match) return match[1];
  return '';
}

function pickKugouCover(albumId, fallback) {
  const id = String(albumId || '').trim();
  if (id) {
    const numeric = Number(id);
    if (Number.isFinite(numeric) && numeric > 0) {
      return `https://imgessl.kugou.com/stdmusic/${Math.floor(numeric / 1000000)}/${id}/cover.jpg`;
    }
  }
  return String(fallback || '').trim();
}

function mapKugouSong(item) {
  item = item || {};
  const authorNames = Array.isArray(item.authors)
    ? item.authors.map((author) => normalizeText(author && (author.author_name || author.name || ''))).filter(Boolean)
    : [];
  const hash = String(item.hash || item.Hash || item.FileHash || item.audio_id || '').trim();
  const albumId = String(item.album_id || item.AlbumID || item.albumid || '').trim();
  const albumAudioId = String(item.album_audio_id || item.AlbumAudioId || item.encode_album_audio_id || '').trim();
  const name = normalizeText(item.songname || item.SongName || item.name || item.filename || '');
  const artist = normalizeText(item.singername || item.SingerName || item.author_name || item.artist || authorNames.join(' / ') || item.filename && String(item.filename).split(' - ')[0] || '');
  const album = normalizeText(item.album_name || item.AlbumName || item.album || '');
  const cover = pickKugouCover(albumId, item.img || item.image || item.cover || item.sizable_cover || '');
  const rawDuration = Number(item.duration || item.Duration || item.timelength || item.duration_128 || 0);
  const duration = rawDuration > 1000 ? Math.round(rawDuration / 1000) : Math.max(0, rawDuration);
  return {
    id: hash || albumAudioId || String(item.audio_id || '').trim(),
    hash,
    name,
    artist,
    album,
    cover,
    duration,
    albumId,
    albumAudioId,
    songUrl: item.song_url || '',
    provider: 'kugou',
    source: 'kugou',
    raw: item,
  };
}

function parseKugouPlaylistLinksFromHtml(html) {
  const out = [];
  const seen = new Set();
  const source = String(html || '');
  const anchorRe = /<a\b[^>]*href=(["'])([^"'<>]+)\1[^>]*>([\s\S]*?)<\/a>/ig;
  let match;
  while ((match = anchorRe.exec(source))) {
    const href = String(match[2] || '').trim();
    const id = extractKugouPlaylistId(href);
    if (!id || seen.has(id)) continue;
    const titleMatch = String(match[0] || '').match(/\btitle=(["'])(.*?)\1/i);
    const plainText = normalizeText((titleMatch && titleMatch[2]) || match[3].replace(/<[^>]+>/g, ' '));
    if (!plainText) continue;
    seen.add(id);
    out.push({
      id,
      name: plainText,
      cover: '',
      creator: '',
      trackCount: 0,
      provider: 'kugou',
      source: 'kugou',
      href,
    });
  }
  const jsonRe = /"specialid"\s*:\s*(\d+)[\s\S]{0,240}?"specialname"\s*:\s*"([^"]+)"/ig;
  while ((match = jsonRe.exec(source))) {
    const id = String(match[1] || '').trim();
    const name = normalizeText(match[2] || '');
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      cover: '',
      creator: '',
      trackCount: 0,
      provider: 'kugou',
      source: 'kugou',
      href: '',
    });
  }
  return out;
}

function parseKugouResponseJson(text, label) {
  const body = safeJsonParse(text, null);
  if (body) return body;
  const wrapped = String(text || '').trim().replace(/^[^(]+\(/, '').replace(/\)\s*;?\s*$/, '');
  const fallback = safeJsonParse(wrapped, null);
  if (fallback) return fallback;
  const error = new Error(`${label || 'Kugou'} returned invalid JSON`);
  error.body = String(text || '').slice(0, 2000);
  throw error;
}

function buildKugouRequestHeaders(cookie) {
  const headers = {
    'User-Agent': MOBILE_KUGOU_UA,
    'Referer': MOBILE_KUGOU_REFERER,
    'Origin': MOBILE_KUGOU_ORIGIN,
    'Accept': 'application/json,text/plain,*/*',
  };
  const cookieText = normalizeText(cookie).replace(/\s*;\s*/g, '; ');
  if (cookieText) headers.Cookie = cookieText;
  return headers;
}

async function defaultFetchText(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.statusCode = response.status;
    error.body = text;
    throw error;
  }
  return text;
}

async function kugouProxySearch(fetchText, cookie, keywords, limit) {
  const keyword = normalizeText(keywords);
  const pageSize = Math.max(1, Math.min(30, Number(limit) || 20));
  const url = new URL(KUGOU_SEARCH_MOBILE_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('page', '1');
  url.searchParams.set('pagesize', String(pageSize));
  url.searchParams.set('showtype', '1');
  const text = await fetchText(url.toString(), { headers: buildKugouRequestHeaders(cookie) });
  const body = parseKugouResponseJson(text, 'Kugou search');
  const list = body && body.data && (body.data.info || body.data.lists) || [];
  return (Array.isArray(list) ? list : []).map(mapKugouSong).filter((song) => song.hash && song.name);
}

async function kugouProxyPlaylistTracks(fetchText, cookie, playlistId) {
  const pid = extractKugouPlaylistId(playlistId) || String(playlistId || '').trim();
  if (!pid) return { provider: 'kugou', playlist: { id: '' }, tracks: [] };
  const url = `https://m.kugou.com/plist/list/${encodeURIComponent(pid)}/?json=true`;
  const text = await fetchText(url, { headers: buildKugouRequestHeaders(cookie) });
  const body = parseKugouResponseJson(text, 'Kugou playlist tracks');
  const listRoot = body && body.list && body.list.list || {};
  const rows = Array.isArray(listRoot.info) ? listRoot.info : [];
  const playlist = {
    id: pid,
    name: normalizeText((body && body.info && body.info.list && body.info.list.specialname) || (body && body.title) || ''),
    creator: normalizeText((body && body.info && body.info.list && body.info.list.nickname) || ''),
    cover: (body && body.info && body.info.list && body.info.list.imgurl) || '',
    trackCount: Number(listRoot.total || rows.length || 0) || rows.length || 0,
    provider: 'kugou',
    source: 'kugou',
  };
  const tracks = rows.map(mapKugouSong).filter((song) => song.hash && song.name);
  return { provider: 'kugou', playlist, tracks };
}

function uniquePlaylistItems(list) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

async function kugouProxyUserPlaylists(fetchText, cookie, htmlFetcher) {
  const candidates = [
    'https://www.kugou.com/yy/html/my.html',
    'https://www.kugou.com/',
  ];
  const rows = [];
  for (const url of candidates) {
    try {
      const html = htmlFetcher
        ? await htmlFetcher(url)
        : await fetchText(url, { headers: buildKugouRequestHeaders(cookie) });
      rows.push(...parseKugouPlaylistLinksFromHtml(html));
      if (rows.length) break;
    } catch (error) {
      console.error('[Kugou:user-playlists:scrape]', {
        url,
        message: error && error.message || 'Unknown scrape error',
        body: String(error && error.body || '').slice(0, 1200),
      });
    }
  }
  return {
    provider: 'kugou',
    loggedIn: !!cookie,
    playlists: uniquePlaylistItems(rows),
  };
}

module.exports = {
  MOBILE_KUGOU_REFERER,
  MOBILE_KUGOU_ORIGIN,
  MOBILE_KUGOU_UA,
  KUGOU_SEARCH_MOBILE_URL,
  extractKugouPlaylistId,
  mapKugouSong,
  parseKugouPlaylistLinksFromHtml,
  parseKugouResponseJson,
  buildKugouRequestHeaders,
  defaultFetchText,
  kugouProxySearch,
  kugouProxyPlaylistTracks,
  kugouProxyUserPlaylists,
};
