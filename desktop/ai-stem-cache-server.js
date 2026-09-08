'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_ID_RE = /^[a-f0-9]{64}$/;
const STEM_FILES = { instrumental: 'instrumental.flac', vocals: 'vocals.flac' };

function sendText(res, statusCode, text, headers = {}) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(text || '');
}

function parseSingleRange(value, size) {
  const match = String(value || '').match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  let start;
  let end;
  if (!match[1] && match[2]) {
    const suffix = Math.max(1, Number(match[2]) || 0);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function pipeFile(res, file, range) {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(file, range || undefined);
    let ended = false;
    function finish() {
      if (ended) return;
      ended = true;
      resolve();
    }
    stream.on('data', (chunk) => {
      if (!res.write(chunk)) {
        stream.pause();
        res.once('drain', () => stream.resume());
      }
    });
    stream.once('end', () => { res.end(); finish(); });
    stream.once('error', () => {
      if (!res.headersSent) sendText(res, 500, 'AI stem read failed');
      else { try { res.end(); } catch (_) {} }
      finish();
    });
  });
}

async function serveAiStemRequest(req, res, cacheRoot, searchParams) {
  if (!['GET', 'HEAD'].includes(String(req && req.method || 'GET').toUpperCase())) {
    sendText(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }
  const id = String(searchParams && searchParams.get('id') || '');
  const stem = String(searchParams && searchParams.get('stem') || '');
  if (!CACHE_ID_RE.test(id) || !STEM_FILES[stem]) {
    sendText(res, 400, 'Invalid AI stem request');
    return;
  }
  const root = path.resolve(String(cacheRoot || ''));
  const file = path.resolve(root, id, STEM_FILES[stem]);
  if (!root || !file.startsWith(root + path.sep)) {
    sendText(res, 400, 'Invalid AI stem path');
    return;
  }
  let stat;
  try { stat = fs.statSync(file); } catch (_) {
    sendText(res, 404, 'AI stem not found');
    return;
  }
  if (!stat.isFile() || stat.size <= 0) {
    sendText(res, 404, 'AI stem not found');
    return;
  }
  const commonHeaders = {
    'Content-Type': 'audio/flac',
    'Accept-Ranges': 'bytes',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'private, max-age=31536000, immutable',
  };
  const rawRange = req && req.headers && req.headers.range;
  if (rawRange) {
    const range = parseSingleRange(rawRange, stat.size);
    if (!range) {
      sendText(res, 416, 'Invalid range', { ...commonHeaders, 'Content-Range': 'bytes */' + stat.size });
      return;
    }
    const length = range.end - range.start + 1;
    res.writeHead(206, {
      ...commonHeaders,
      'Content-Length': length,
      'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + stat.size,
    });
    if (String(req.method || 'GET').toUpperCase() === 'HEAD') { res.end(); return; }
    await pipeFile(res, file, range);
    return;
  }
  res.writeHead(200, { ...commonHeaders, 'Content-Length': stat.size });
  if (String(req.method || 'GET').toUpperCase() === 'HEAD') { res.end(); return; }
  await pipeFile(res, file, null);
}

module.exports = { CACHE_ID_RE, STEM_FILES, parseSingleRange, serveAiStemRequest };
