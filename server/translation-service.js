'use strict';

const lyricTranslation = require('../public/lyric-translation');

const GOOGLE_GTX_URL = 'https://translate.googleapis.com/translate_a/single';
const LINGVA_BASE_URL = 'https://lingva.ml/api/v1';
const BING_TRANSLATE_URL = 'https://www.bing.com/ttranslatev3';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const LIBRETRANSLATE_URL = 'https://libretranslate.de/translate';

function normalizeText(value) {
  return lyricTranslation.normalizeText
    ? lyricTranslation.normalizeText(value)
    : String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function defaultFetchWithTimeout(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), Math.max(1, Number(timeoutMs) || 10000));
  return fetch(url, Object.assign({}, opts || {}, { signal: controller.signal }))
    .finally(() => clearTimeout(timer));
}

function createLogger(customLogger) {
  if (customLogger && typeof customLogger.error === 'function') return customLogger;
  return console;
}

function createHttpError(message, response, body) {
  const error = new Error(message);
  error.statusCode = response && response.status;
  error.body = String(body || '');
  return error;
}

function createEngineContext(options) {
  options = options || {};
  return {
    fetchWithTimeout: typeof options.fetchWithTimeout === 'function' ? options.fetchWithTimeout : defaultFetchWithTimeout,
    userAgent: options.userAgent || 'Mozilla/5.0',
    logger: createLogger(options.logger),
    timeoutMs: Math.max(1000, Number(options.timeoutMs) || 8000),
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    const err = new Error('Invalid JSON response');
    err.body = text;
    err.cause = error;
    throw err;
  }
}

async function translateViaGoogleGtx(batch, options) {
  const context = createEngineContext(options);
  const params = new URLSearchParams({
    client: 'gtx',
    sl: String(batch.from || 'auto'),
    tl: String(batch.to || 'zh-CN'),
    dt: 't',
    dj: '0',
    q: batch.joinedText,
  });
  const response = await context.fetchWithTimeout(`${GOOGLE_GTX_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': context.userAgent,
      Referer: 'https://translate.google.com/',
      Accept: 'application/json,text/plain,*/*',
    },
  }, context.timeoutMs);
  if (!response.ok) throw createHttpError('Google gtx HTTP ' + response.status, response, await response.text());
  const json = await response.json();
  const translatedText = Array.isArray(json && json[0])
    ? json[0].map(row => Array.isArray(row) ? String(row[0] || '') : '').join('')
    : '';
  return splitTranslatedTextToLines(translatedText, batch.lines.length);
}

async function translateViaLingva(batch, options) {
  const context = createEngineContext(options);
  const from = encodeURIComponent(String(batch.from || 'auto'));
  const to = encodeURIComponent(String(batch.to || 'zh-CN'));
  const text = encodeURIComponent(batch.joinedText);
  const response = await context.fetchWithTimeout(`${LINGVA_BASE_URL}/${from}/${to}/${text}`, {
    headers: {
      'User-Agent': context.userAgent,
      Accept: 'application/json,text/plain,*/*',
    },
  }, context.timeoutMs);
  if (!response.ok) throw createHttpError('Lingva HTTP ' + response.status, response, await response.text());
  const json = await parseJsonResponse(response);
  return splitTranslatedTextToLines(json && (json.translation || json.translatedText || ''), batch.lines.length);
}

async function translateViaBing(batch, options) {
  const context = createEngineContext(options);
  const params = new URLSearchParams({
    fromLang: String(batch.from || 'auto'),
    text: batch.joinedText,
    to: String(batch.to || 'zh-CN'),
  });
  const response = await context.fetchWithTimeout(BING_TRANSLATE_URL, {
    method: 'POST',
    headers: {
      'User-Agent': context.userAgent,
      Referer: 'https://www.bing.com/translator',
      Origin: 'https://www.bing.com',
      Accept: 'application/json,text/plain,*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: params.toString(),
  }, context.timeoutMs);
  if (!response.ok) throw createHttpError('Bing HTTP ' + response.status, response, await response.text());
  const json = await parseJsonResponse(response);
  const translatedText = Array.isArray(json) && json[0] && Array.isArray(json[0].translations)
    ? String(json[0].translations[0] && json[0].translations[0].text || '')
    : '';
  return splitTranslatedTextToLines(translatedText, batch.lines.length);
}

async function translateViaMyMemory(batch, options) {
  const context = createEngineContext(options);
  const params = new URLSearchParams({
    q: batch.joinedText,
    langpair: `${String(batch.from || 'auto')}|${String(batch.to || 'zh-CN')}`,
  });
  const response = await context.fetchWithTimeout(`${MYMEMORY_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': context.userAgent,
      Accept: 'application/json,text/plain,*/*',
    },
  }, context.timeoutMs);
  if (!response.ok) throw createHttpError('MyMemory HTTP ' + response.status, response, await response.text());
  const json = await parseJsonResponse(response);
  const translatedText = json && json.responseData && json.responseData.translatedText
    ? String(json.responseData.translatedText)
    : '';
  return splitTranslatedTextToLines(translatedText, batch.lines.length);
}

async function translateViaLibreTranslate(batch, options) {
  const context = createEngineContext(options);
  const response = await context.fetchWithTimeout(LIBRETRANSLATE_URL, {
    method: 'POST',
    headers: {
      'User-Agent': context.userAgent,
      Accept: 'application/json,text/plain,*/*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: batch.joinedText,
      source: String(batch.from || 'auto'),
      target: String(batch.to || 'zh-CN'),
      format: 'text',
    }),
  }, context.timeoutMs);
  if (!response.ok) throw createHttpError('LibreTranslate HTTP ' + response.status, response, await response.text());
  const json = await parseJsonResponse(response);
  return splitTranslatedTextToLines(json && (json.translatedText || ''), batch.lines.length);
}

function splitTranslatedTextToLines(text, expectedCount) {
  const rows = String(text || '').split(/\r?\n/).map(normalizeText);
  while (rows.length < expectedCount) rows.push('');
  return rows.slice(0, expectedCount);
}

function createDefaultTranslationEngines(options) {
  return [
    { name: 'google-gtx', limit: 4000, translateBatch: (batch) => translateViaGoogleGtx(batch, options) },
    { name: 'lingva', limit: 3500, translateBatch: (batch) => translateViaLingva(batch, options) },
    { name: 'bing', limit: 2500, translateBatch: (batch) => translateViaBing(batch, options) },
    { name: 'mymemory', limit: 500, translateBatch: (batch) => translateViaMyMemory(batch, options) },
    { name: 'libretranslate', limit: 2500, translateBatch: (batch) => translateViaLibreTranslate(batch, options) },
  ];
}

function normalizedPendingLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line, index) => ({
      index,
      text: normalizeText(line && line.text),
      hasTranslation: !!normalizeText(line && line.subText),
    }))
    .filter(line => line.text && !line.hasTranslation);
}

function splitTranslationBatches(lines, options) {
  const pending = (Array.isArray(lines) ? lines : []).map((line, index) => Object.assign({ index }, line));
  const hardLimit = Math.max(1, Number(options && options.hardLimit) || 500);
  const batches = [];
  let current = [];
  let currentLen = 0;
  pending.forEach(line => {
    const text = normalizeText(line && line.text);
    if (!text) return;
    const projected = current.length ? currentLen + 1 + text.length : text.length;
    if (current.length && projected >= hardLimit) {
      batches.push({
        lines: current.slice(),
        joinedText: current.map(item => item.text).join('\n'),
      });
      current = [];
      currentLen = 0;
    }
    current.push({ index: line.index, text });
    currentLen = current.length ? current.map(item => item.text).join('\n').length : 0;
  });
  if (current.length) {
    batches.push({
      lines: current.slice(),
      joinedText: current.map(item => item.text).join('\n'),
    });
  }
  return batches;
}

function engineErrorMeta(error, engineName, batchIndex) {
  return {
    engine: engineName,
    batchIndex,
    message: error && error.message || 'Unknown error',
    status: error && error.statusCode || 0,
    body: String(error && error.body || '').slice(0, 400),
  };
}

async function runTranslationFallbackPipeline(batch, options) {
  options = options || {};
  const logger = createLogger(options.logger);
  const engines = Array.isArray(options.engines) && options.engines.length
    ? options.engines
    : createDefaultTranslationEngines(options);
  const providersTried = [];
  let lastError = null;
  for (const engine of engines) {
    providersTried.push(engine.name);
    try {
      const translated = await engine.translateBatch(batch, options);
      const translatedLines = Array.isArray(translated)
        ? translated
        : (translated && Array.isArray(translated.translatedLines)
          ? translated.translatedLines
          : splitTranslatedTextToLines(translated && translated.translatedText || translated, batch.lines.length));
      return {
        provider: engine.name,
        providersTried,
        translatedLines: translatedLines,
      };
    } catch (error) {
      lastError = engineErrorMeta(error, engine.name, batch.batchIndex);
      logger.error('[LyricTranslate:' + engine.name + ']', lastError);
    }
  }
  return {
    provider: '',
    providersTried,
    translatedLines: new Array(batch.lines.length).fill(''),
    error: lastError,
  };
}

function mergeTranslatedResults(lines, translatedRows) {
  if (lyricTranslation.mapTranslatedLinesByIndex) return lyricTranslation.mapTranslatedLinesByIndex(lines, translatedRows);
  return Array.isArray(lines) ? lines.slice() : [];
}

async function translateLyricLineSet(lines, options) {
  options = options || {};
  const engines = Array.isArray(options.engines) && options.engines.length
    ? options.engines
    : createDefaultTranslationEngines(options);
  const pending = normalizedPendingLines(lines);
  if (!pending.length) {
    return { lines: lyricTranslation.cloneLyricLines ? lyricTranslation.cloneLyricLines(lines) : (Array.isArray(lines) ? lines.slice() : []), translatedLines: [], provider: '', providersTried: [], partial: false, failedBatches: [] };
  }
  const hardLimit = Math.max(1, Number(options.hardLimit) || Math.min.apply(Math, engines.map(engine => Number(engine.limit) || 500).concat([500])));
  const batches = splitTranslationBatches(pending, { hardLimit }).map((batch, batchIndex) => Object.assign({}, batch, {
    batchIndex,
    from: options.from || 'auto',
    to: options.to || 'zh-CN',
  }));
  const results = await Promise.all(batches.map(batch => runTranslationFallbackPipeline(batch, Object.assign({}, options, { engines }))));
  const translatedRows = [];
  const providersTried = [];
  const failedBatches = [];
  let winningProvider = '';
  results.forEach((result, index) => {
    (result.providersTried || []).forEach(name => {
      if (!providersTried.includes(name)) providersTried.push(name);
    });
    if (result.provider && !winningProvider) winningProvider = result.provider;
    if (result.error) failedBatches.push(Object.assign({ batchIndex: index }, result.error));
    (batches[index].lines || []).forEach((line, lineIdx) => {
      translatedRows.push({
        index: line.index,
        text: normalizeText(result.translatedLines && result.translatedLines[lineIdx] || ''),
      });
    });
  });
  return {
    lines: mergeTranslatedResults(lines, translatedRows),
    translatedLines: translatedRows,
    translatedText: translatedRows.map(row => row.text).join('\n'),
    provider: winningProvider,
    providersTried,
    partial: failedBatches.length > 0,
    failedBatches,
    from: options.from || 'auto',
    to: options.to || 'zh-CN',
  };
}

module.exports = {
  GOOGLE_GTX_URL,
  LINGVA_BASE_URL,
  BING_TRANSLATE_URL,
  MYMEMORY_URL,
  LIBRETRANSLATE_URL,
  createDefaultTranslationEngines,
  splitTranslationBatches,
  runTranslationFallbackPipeline,
  translateLyricLineSet,
};
