const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AI_STEM_MODEL_FILENAME,
  buildSeparatorCommand,
  cacheIdForTrack,
  createAiStemService,
  parseSeparatorProgress,
  validateLocalAudioUrl,
} = require('../desktop/ai-stem-separator');
const { serveAiStemRequest } = require('../desktop/ai-stem-cache-server');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-ai-stems-'));
}

test('歌曲键生成稳定且不可注入路径的缓存 ID', () => {
  const first = cacheIdForTrack('qq:0039/../../secret');
  const second = cacheIdForTrack('qq:0039/../../secret');
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, cacheIdForTrack('qq:0040'));
});

test('只允许下载 Mineradio 当前本地服务器的音频 URL', () => {
  const origin = 'http://127.0.0.1:3147';
  assert.equal(validateLocalAudioUrl('/api/audio?url=https%3A%2F%2Fexample.com%2Fa.mp3', origin).origin, origin);
  assert.equal(validateLocalAudioUrl('http://127.0.0.1:3147/api/audio?url=x', origin).pathname, '/api/audio');
  assert.throws(() => validateLocalAudioUrl('https://example.com/song.mp3', origin), /AI_STEM_AUDIO_URL_NOT_LOCAL/);
  assert.throws(() => validateLocalAudioUrl('http://127.0.0.1:9999/api/audio?url=x', origin), /AI_STEM_AUDIO_URL_NOT_LOCAL/);
  assert.throws(() => validateLocalAudioUrl('file:///tmp/song.mp3', origin), /AI_STEM_AUDIO_URL_NOT_LOCAL/);
});

test('分轨命令复用 UVR 模型且不经过 shell 字符串', () => {
  const command = buildSeparatorCommand({
    uvPath: '/Users/test/.local/bin/uv',
    inputPath: '/tmp/input song.flac',
    outputDir: '/tmp/stems output',
    modelDir: '/tmp/models',
  });
  assert.equal(command.file, '/Users/test/.local/bin/uv');
  assert.equal(command.options.shell, false);
  assert.ok(command.args.includes('audio-separator[cpu]==0.44.3'));
  assert.ok(command.args.includes(AI_STEM_MODEL_FILENAME));
  assert.ok(command.args.includes('/tmp/input song.flac'));
  assert.ok(command.args.includes('/tmp/stems output'));
  assert.ok(command.args.includes('/tmp/models'));
  assert.ok(command.args.includes('FLAC'));
});

test('解析准备、下载和 AI 分轨百分比', () => {
  assert.deepEqual(parseSeparatorProgress('Downloading model 28%'), { stage: 'model', percent: 28 });
  assert.deepEqual(parseSeparatorProgress('Starting separation process for audio_file_path: input.flac'), { stage: 'separating', percent: 0 });
  assert.deepEqual(parseSeparatorProgress(' 67%|██████▋   | 8/12'), { stage: 'separating', percent: 67 });
  assert.deepEqual(parseSeparatorProgress('Saving Vocals stem to vocals.flac'), { stage: 'saving', percent: 96 });
  assert.equal(parseSeparatorProgress('ordinary log line'), null);
});

test('缓存命中直接返回双轨，不再次运行模型', async () => {
  const cacheRoot = tempDir();
  const trackKey = 'qq:cached-song';
  const id = cacheIdForTrack(trackKey);
  const dir = path.join(cacheRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'instrumental.flac'), 'instrumental');
  fs.writeFileSync(path.join(dir, 'vocals.flac'), 'vocals');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, id, trackKey, model: AI_STEM_MODEL_FILENAME }));
  let runs = 0;
  const service = createAiStemService({
    cacheRoot,
    getLocalOrigin: () => 'http://127.0.0.1:3147',
    processTrack: async () => { runs += 1; },
  });

  const result = await service.start({ trackKey, audioUrl: '/api/audio?url=x' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.cached, true);
  assert.equal(result.id, id);
  assert.match(result.instrumentalUrl, new RegExp('/api/ai-stem\\?id=' + id + '&stem=instrumental'));
  assert.match(result.vocalsUrl, new RegExp('/api/ai-stem\\?id=' + id + '&stem=vocals'));
  assert.equal(runs, 0);
});

test('同曲复用任务，换曲取消旧任务，手动取消立即结束', async () => {
  const cacheRoot = tempDir();
  const controls = [];
  const service = createAiStemService({
    cacheRoot,
    getLocalOrigin: () => 'http://127.0.0.1:3147',
    processTrack: ({ id, signal, report }) => new Promise((resolve, reject) => {
      report({ stage: 'separating', percent: 21 });
      const control = { id, resolve, reject, signal };
      controls.push(control);
      signal.onCancel(() => {
        const error = new Error('AI_STEM_CANCELLED');
        error.code = 'AI_STEM_CANCELLED';
        reject(error);
      });
    }),
  });

  const firstPromise = service.start({ trackKey: 'qq:first', audioUrl: '/api/audio?url=first' });
  await new Promise((resolve) => setImmediate(resolve));
  const sameResult = await service.start({ trackKey: 'qq:first', audioUrl: '/api/audio?url=first' });
  assert.equal(sameResult.status, 'running');
  assert.equal(sameResult.jobId, service.status('qq:first').jobId);
  assert.equal(controls.length, 1);

  const secondPromise = service.start({ trackKey: 'qq:second', audioUrl: '/api/audio?url=second' });
  const firstResult = await firstPromise;
  assert.equal(firstResult.status, 'cancelled');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controls.length, 2);
  assert.equal(service.status('qq:second').status, 'running');

  const cancelResult = service.cancel(service.status('qq:second').jobId);
  assert.equal(cancelResult.ok, true);
  const secondResult = await secondPromise;
  assert.equal(secondResult.status, 'cancelled');
  assert.equal(service.status('qq:second').status, 'idle');
});

function mockResponse() {
  const chunks = [];
  return {
    statusCode: 0,
    headers: {},
    chunks,
    writeHead(code, headers) { this.statusCode = code; this.headers = headers || {}; },
    write(chunk) { chunks.push(Buffer.from(chunk)); return true; },
    end(chunk) { if (chunk) chunks.push(Buffer.from(chunk)); this.ended = true; },
    once() {},
    body() { return Buffer.concat(chunks); },
  };
}

test('只读 stem 路由校验缓存 ID 并支持 Range 拖动', async () => {
  const cacheRoot = tempDir();
  const id = cacheIdForTrack('qq:range-song');
  const dir = path.join(cacheRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'instrumental.flac'), Buffer.from('0123456789'));

  const invalid = mockResponse();
  await serveAiStemRequest({ method: 'GET', headers: {} }, invalid, cacheRoot, new URLSearchParams('id=../../etc&stem=instrumental'));
  assert.equal(invalid.statusCode, 400);

  const ranged = mockResponse();
  await serveAiStemRequest({ method: 'GET', headers: { range: 'bytes=2-5' } }, ranged, cacheRoot, new URLSearchParams({ id, stem: 'instrumental' }));
  assert.equal(ranged.statusCode, 206);
  assert.equal(ranged.headers['Content-Range'], 'bytes 2-5/10');
  assert.equal(ranged.headers['Content-Length'], 4);
  assert.equal(ranged.body().toString(), '2345');

  const full = mockResponse();
  await serveAiStemRequest({ method: 'GET', headers: {} }, full, cacheRoot, new URLSearchParams({ id, stem: 'instrumental' }));
  assert.equal(full.statusCode, 200);
  assert.equal(full.headers['Accept-Ranges'], 'bytes');
  assert.equal(full.body().toString(), '0123456789');
});

test('Electron 暴露 AI 分轨开始、状态、取消和进度通道', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'preload.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(main, /createAiStemService/);
  assert.match(main, /ipcMain\.handle\('mineradio-ai-stems-start'/);
  assert.match(main, /ipcMain\.handle\('mineradio-ai-stems-status'/);
  assert.match(main, /ipcMain\.handle\('mineradio-ai-stems-cancel'/);
  assert.match(main, /aiStemService\.shutdown\(\)/);
  assert.match(preload, /startAiStemSeparation:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\('mineradio-ai-stems-start'/);
  assert.match(preload, /getAiStemStatus:/);
  assert.match(preload, /cancelAiStemSeparation:/);
  assert.match(preload, /onAiStemProgress:/);
  assert.match(server, /pn === '\/api\/ai-stem'/);
  assert.match(server, /serveAiStemRequest/);
});
