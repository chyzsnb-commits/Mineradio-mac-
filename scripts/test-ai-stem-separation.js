const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('node:vm');
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

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`${name} 函数未闭合`);
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

test('读取音频时取消会删除半截文件，同曲可以重试', async () => {
  const cacheRoot = tempDir();
  const modelPath = path.join(cacheRoot, 'source-model.onnx');
  fs.writeFileSync(modelPath, 'model');
  let streamController;
  const fetchImpl = async (_url, options) => {
    const body = new ReadableStream({
      start(controller) {
        streamController = controller;
        controller.enqueue(new Uint8Array(64 * 1024));
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          controller.error(error);
        }, { once: true });
      },
      cancel() {},
    });
    return {
      ok: true,
      status: 200,
      headers: { get(name) { return String(name).toLowerCase() === 'content-type' ? 'audio/wav' : ''; } },
      body,
    };
  };
  const service = createAiStemService({
    cacheRoot,
    getLocalOrigin: () => 'http://127.0.0.1:3147',
    findUv: () => '/bin/echo',
    findModel: () => modelPath,
    fetchImpl,
  });

  const pending = service.start({ trackKey: 'qq:partial', audioUrl: '/api/audio?url=partial' });
  while (!streamController || service.status('qq:partial').stage !== 'downloading') {
    await new Promise((resolve) => setImmediate(resolve));
  }
  service.cancel(service.status('qq:partial').jobId);
  const result = await pending;
  assert.equal(result.status, 'cancelled');
  const dir = path.join(cacheRoot, cacheIdForTrack('qq:partial'));
  assert.deepEqual(fs.readdirSync(dir).filter((name) => name.startsWith('input.')), []);
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

test('唱歌面板提供对称的实时与 AI 模式、进度和取消按钮', () => {
  const html = read('public/index.html');
  const css = read('public/css/index.css');
  assert.match(html, /id="singing-separation-mode"[\s\S]*data-singing-separation="realtime"[^>]*>实时<[\s\S]*data-singing-separation="ai"[^>]*>AI</);
  assert.match(html, /id="ai-stem-progress"[\s\S]*id="ai-stem-progress-fill"/);
  assert.match(html, /id="ai-stem-cancel-btn"[^>]*aria-label="取消 AI 分轨"/);
  assert.match(css, /\.singing-separation-mode\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.ai-stem-progress-fill/);
});

test('AI 双轨直接使用伴奏和人声音量，不经过实时 Worklet', () => {
  const aiSource = read('public/js/modules/05-playback/09-ai-stem-playback.js');
  const audioGraph = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const sandbox = {
    singingAccompanimentLevel: 0.35,
    singingVocalLevel: 0.82,
    aiStemAccompanimentGain: { gain: { value: 0 } },
    aiStemVocalGain: { gain: { value: 0 } },
  };
  vm.runInNewContext(`${readFunction(aiSource, 'applyAiStemLevels')}; applied = applyAiStemLevels();`, sandbox);
  assert.equal(sandbox.applied, true);
  assert.equal(sandbox.aiStemAccompanimentGain.gain.value, 0.35);
  assert.equal(sandbox.aiStemVocalGain.gain.value, 0.82);
  assert.match(audioGraph, /if \(typeof aiStemPlaybackActive === 'function' && aiStemPlaybackActive\(\)\) return false;/);
  assert.match(audioGraph, /connectAiStemPlaybackGraph\(audioCtx, source, analyser, beatAnalyser\)/);
});

test('AI 人声轨跟随主轨播放、暂停、跳转和倍速', async () => {
  const aiSource = read('public/js/modules/05-playback/09-ai-stem-playback.js');
  const calls = [];
  const main = { currentTime: 28.4, playbackRate: 1.25, paused: false, ended: false };
  const vocal = {
    currentTime: 27.9,
    playbackRate: 1,
    paused: true,
    ended: false,
    play() { calls.push('play'); this.paused = false; return Promise.resolve(); },
    pause() { calls.push('pause'); this.paused = true; },
  };
  const sandbox = { Promise };
  vm.runInNewContext(`${readFunction(aiSource, 'syncAiStemSecondaryForEvent')};`, sandbox);
  sandbox.syncAiStemSecondaryForEvent('play', main, vocal);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(vocal.currentTime, main.currentTime);
  assert.equal(vocal.playbackRate, 1.25);
  assert.deepEqual(calls, ['play']);

  main.currentTime = 64.2;
  sandbox.syncAiStemSecondaryForEvent('seeked', main, vocal);
  assert.equal(vocal.currentTime, 64.2);
  main.playbackRate = 0.8;
  sandbox.syncAiStemSecondaryForEvent('ratechange', main, vocal);
  assert.equal(vocal.playbackRate, 0.8);
  sandbox.syncAiStemSecondaryForEvent('pause', main, vocal);
  assert.deepEqual(calls, ['play', 'pause']);
});

test('切歌时优先使用新设置的音频代理地址', () => {
  const aiSource = read('public/js/modules/05-playback/09-ai-stem-playback.js');
  const sandbox = {
    URL,
    window: { location: { href: 'http://127.0.0.1:3000/' } },
  };
  vm.runInNewContext(`${readFunction(aiSource, 'aiStemRequestAudioUrl')};`, sandbox);
  const media = {
    src: 'http://127.0.0.1:3000/api/audio?url=new-song',
    currentSrc: 'http://127.0.0.1:3000/api/ai-stem?id=old-song&stem=instrumental',
  };
  assert.equal(sandbox.aiStemRequestAudioUrl(media), media.src);
  assert.equal(sandbox.aiStemRequestAudioUrl({ src: '', currentSrc: media.src }), media.src);
});

test('AI 双轨加载期间切歌不会让旧分轨覆盖新歌', async () => {
  const aiSource = read('public/js/modules/05-playback/09-ai-stem-playback.js');
  let releaseMedia;
  let waitCalls = 0;
  let playCalls = 0;
  let initCalls = 0;
  const mediaReady = new Promise((resolve) => { releaseMedia = resolve; });
  const vocal = {
    currentSrc: '', src: '', currentTime: 0, playbackRate: 1, paused: true, ended: false,
    readyState: 0,
    pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); },
    load() {}, removeAttribute() { this.src = ''; },
    addEventListener() {}, removeEventListener() {},
  };
  const main = {
    currentSrc: '/api/audio?url=old', src: '/api/audio?url=old', currentTime: 18,
    playbackRate: 1, paused: false, ended: false, preload: 'auto',
    pause() { this.paused = true; },
    play() { playCalls += 1; this.paused = false; return Promise.resolve(); },
    load() {}, addEventListener() {},
  };
  const sandbox = {
    Promise,
    console: { warn() {} },
    audio: main,
    audioReady: true,
    playbackSpeed: 1,
    targetVolume: 0.8,
    trackSwitchToken: 4,
    singingSeparationMode: 'ai',
    aiStemRuntime: { status: 'idle', active: false },
    aiStemVocalAudio: null,
    aiStemVocalSource: null,
    aiStemMixNode: null,
    aiStemAccompanimentGain: null,
    aiStemVocalGain: null,
    Audio: function () { return vocal; },
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    document: { getElementById() { return null; }, querySelectorAll() { return []; } },
    aiStemTrackKey() { return 'qq:old|quality:lossless'; },
    waitAiStemMediaReady() { waitCalls += 1; return mediaReady; },
    resetPlaybackAudioGraphForSourceSwitch() {},
    initAudio() { initCalls += 1; return true; },
    applyAiStemLevels() { return true; },
    rampAudioOutputGain() {},
    applyVolumeToAudio() {},
    showToast() {},
  };
  vm.runInNewContext(aiSource, sandbox);
  sandbox.aiStemTrackKey = () => 'qq:old|quality:lossless';
  sandbox.waitAiStemMediaReady = () => { waitCalls += 1; return mediaReady; };
  sandbox.setAiStemRuntime = (patch) => { sandbox.aiStemRuntime = Object.assign({}, sandbox.aiStemRuntime, patch); };
  sandbox.syncAiStemUi = () => {};
  sandbox.resetPlaybackAudioGraphForSourceSwitch = () => {};
  sandbox.initAudio = () => { initCalls += 1; return true; };
  sandbox.applyAiStemLevels = () => true;

  const activation = sandbox.activateAiStemPlayback({
    status: 'ready', id: 'old-id', trackKey: 'qq:old|quality:lossless',
    instrumentalUrl: '/api/ai-stem?id=old-id&stem=instrumental',
    vocalsUrl: '/api/ai-stem?id=old-id&stem=vocals',
  });
  while (waitCalls < 2) await new Promise((resolve) => setImmediate(resolve));
  sandbox.trackSwitchToken += 1;
  sandbox.aiStemTrackKey = () => 'qq:new|quality:lossless';
  main.currentSrc = '/api/audio?url=new';
  main.src = '/api/audio?url=new';
  releaseMedia(true);

  assert.equal(await activation, false);
  assert.equal(main.src, '/api/audio?url=new');
  assert.equal(playCalls, 0);
  assert.equal(initCalls, 0);
});

test('恢复原曲的等待期间切歌不会操作新歌', async () => {
  const aiSource = read('public/js/modules/05-playback/09-ai-stem-playback.js');
  let releaseMedia;
  let playCalls = 0;
  let initCalls = 0;
  const mediaReady = new Promise((resolve) => { releaseMedia = resolve; });
  const main = {
    currentSrc: '/api/ai-stem?id=old-id&stem=instrumental',
    src: '/api/ai-stem?id=old-id&stem=instrumental', currentTime: 33,
    playbackRate: 1, paused: false, ended: false, preload: 'auto',
    pause() { this.paused = true; },
    play() { playCalls += 1; this.paused = false; return Promise.resolve(); },
    load() {}, addEventListener() {},
  };
  const vocal = {
    pause() {}, removeAttribute() {}, load() {},
  };
  const sandbox = {
    Promise,
    console: { warn() {} },
    audio: main,
    audioReady: true,
    playbackSpeed: 1,
    targetVolume: 0.8,
    trackSwitchToken: 8,
    singingSeparationMode: 'realtime',
    aiStemRuntime: {
      status: 'ready', active: true,
      original: { src: '/api/audio?url=old', currentTime: 12, wasPlaying: true },
    },
    aiStemVocalAudio: vocal,
    aiStemVocalSource: null,
    aiStemMixNode: null,
    aiStemAccompanimentGain: null,
    aiStemVocalGain: null,
    document: { getElementById() { return null; }, querySelectorAll() { return []; } },
    aiStemTrackKey() { return 'qq:old|quality:lossless'; },
    waitAiStemMediaReady() { return mediaReady; },
    disconnectAudioGraphNodes() {},
    initAudio() { initCalls += 1; return true; },
    rampAudioOutputGain() {},
    applyVolumeToAudio() {},
  };
  vm.runInNewContext(aiSource, sandbox);
  sandbox.aiStemTrackKey = () => 'qq:old|quality:lossless';
  sandbox.waitAiStemMediaReady = () => mediaReady;
  sandbox.setAiStemRuntime = (patch) => { sandbox.aiStemRuntime = Object.assign({}, sandbox.aiStemRuntime, patch); };
  sandbox.disconnectAudioGraphNodes = () => {};
  sandbox.disposeAiStemSecondaryAudio = () => { sandbox.aiStemVocalAudio = null; };
  sandbox.initAudio = () => { initCalls += 1; return true; };

  const restoration = sandbox.deactivateAiStemPlayback({ restoreOriginal: true, reason: 'realtime-mode' });
  await new Promise((resolve) => setImmediate(resolve));
  sandbox.trackSwitchToken += 1;
  sandbox.aiStemTrackKey = () => 'qq:new|quality:lossless';
  main.currentSrc = '/api/audio?url=new';
  main.src = '/api/audio?url=new';
  releaseMedia(true);

  assert.equal(await restoration, false);
  assert.equal(main.src, '/api/audio?url=new');
  assert.equal(playCalls, 0);
  assert.equal(initCalls, 0);
});

test('AI 模式在播放时请求当前曲目，切歌会释放旧人声轨', () => {
  const aiSource = read('public/js/modules/05-playback/09-ai-stem-playback.js');
  const playbackCore = read('public/js/modules/05-playback/12-playback-switch-core.js');
  const audioGraph = read('public/js/modules/05-playback/08-audio-graph-controls.js');
  const stores = read('public/js/modules/00-state/00-core-stores.js');
  const loader = read('public/js/index-loader.js');
  assert.match(aiSource, /function requestAiStemForCurrentTrack\(/);
  assert.match(aiSource, /function activateAiStemPlayback\(/);
  assert.match(aiSource, /function deactivateAiStemPlayback\(/);
  assert.match(playbackCore, /requestAiStemForCurrentTrack/);
  assert.match(audioGraph, /deactivateAiStemPlayback\(\{ restoreOriginal: false, reason: reason \|\| 'track-switch' \}\)/);
  assert.match(stores, /singingSeparationMode\s*=\s*'realtime'/);
  assert.match(loader, /js\/modules\/05-playback\/09-ai-stem-playback\.js/);
});
