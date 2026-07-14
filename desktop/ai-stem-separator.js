'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');

const AI_STEM_MODEL_FILENAME = 'UVR-MDX-NET-Inst_HQ_3.onnx';
const AI_STEM_SEPARATOR_PACKAGE = 'audio-separator[cpu]==0.44.3';
const AI_STEM_MAX_INPUT_BYTES = 220 * 1024 * 1024;
const AI_STEM_PYTHON_HOOK = `'Mineradio AI stem runtime limits.'
import os

try:
    _threads = max(1, int(os.environ.get('MINERADIO_AI_STEM_MAX_THREADS', '1')))
except (TypeError, ValueError):
    _threads = 1

try:
    import torch
    torch.set_num_threads(_threads)
    torch.set_num_interop_threads(1)
except Exception:
    pass

try:
    import onnxruntime as ort
    if not getattr(ort, '_mineradio_session_options_patched', False):
        _original_session_options = ort.SessionOptions

        def _mineradio_session_options():
            options = _original_session_options()
            options.intra_op_num_threads = _threads
            options.inter_op_num_threads = 1
            try:
                options.add_session_config_entry('session.intra_op.allow_spinning', '0')
                options.add_session_config_entry('session.inter_op.allow_spinning', '0')
            except Exception:
                pass
            return options

        ort.SessionOptions = _mineradio_session_options
        ort._mineradio_session_options_patched = True
except Exception:
    pass
`;

function codedError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function cacheIdForTrack(trackKey) {
  const value = String(trackKey || '').trim();
  if (!value) throw codedError('AI_STEM_TRACK_KEY_REQUIRED');
  return crypto.createHash('sha256').update(value).digest('hex');
}

function recommendedMdxBatchSize(options = {}) {
  const platform = String(options.platform || process.platform);
  const arch = String(options.arch || process.arch);
  const totalMemoryBytes = Number(options.totalMemoryBytes == null ? os.totalmem() : options.totalMemoryBytes) || 0;
  const onBatteryPower = options.onBatteryPower === true;
  const thermalState = options.thermalState == null ? 'nominal' : String(options.thermalState).toLowerCase();
  const thermalHealthy = thermalState === 'nominal';
  return platform === 'darwin'
    && arch === 'arm64'
    && totalMemoryBytes >= 12 * 1024 * 1024 * 1024
    && !onBatteryPower
    && thermalHealthy
    ? 2
    : 1;
}

function recommendedAiStemThreadCount(options = {}) {
  const detected = Number(options.logicalCpuCount == null ? (os.cpus() || []).length : options.logicalCpuCount);
  const logicalCpuCount = Number.isFinite(detected) ? Math.max(1, Math.floor(detected)) : 1;
  return Math.max(1, Math.min(6, logicalCpuCount - 2));
}

function ensureAiStemRuntimeHook(cacheRoot) {
  const hookDir = path.join(cacheRoot, 'runtime');
  const hookFile = path.join(hookDir, 'sitecustomize.py');
  fs.mkdirSync(hookDir, { recursive: true });
  let current = '';
  try { current = fs.readFileSync(hookFile, 'utf8'); } catch (_) {}
  if (current !== AI_STEM_PYTHON_HOOK) fs.writeFileSync(hookFile, AI_STEM_PYTHON_HOOK, 'utf8');
  return hookDir;
}

function buildAiStemProcessEnvironment(baseEnv = {}, runtime = {}) {
  const env = { ...baseEnv };
  const threads = String(Math.max(1, Number(runtime.maxCpuThreads) || 1));
  env.MINERADIO_AI_STEM_MAX_THREADS = threads;
  env.OMP_NUM_THREADS = threads;
  env.OMP_THREAD_LIMIT = threads;
  env.OPENBLAS_NUM_THREADS = threads;
  env.MKL_NUM_THREADS = threads;
  env.VECLIB_MAXIMUM_THREADS = threads;
  env.NUMEXPR_NUM_THREADS = threads;
  env.OMP_WAIT_POLICY = 'PASSIVE';
  env.KMP_BLOCKTIME = '0';
  if (runtime.pythonHookDir) {
    env.PYTHONPATH = String(runtime.pythonHookDir)
      + (env.PYTHONPATH ? path.delimiter + String(env.PYTHONPATH) : '');
  }
  return env;
}

function validateLocalAudioUrl(value, localOrigin) {
  let origin;
  let parsed;
  try {
    origin = new URL(String(localOrigin || ''));
    parsed = new URL(String(value || ''), origin);
  } catch (_) {
    throw codedError('AI_STEM_AUDIO_URL_NOT_LOCAL');
  }
  if (origin.protocol !== 'http:'
      || origin.hostname !== '127.0.0.1'
      || parsed.protocol !== origin.protocol
      || parsed.hostname !== origin.hostname
      || parsed.port !== origin.port
      || parsed.origin !== origin.origin
      || parsed.pathname !== '/api/audio') {
    throw codedError('AI_STEM_AUDIO_URL_NOT_LOCAL');
  }
  return parsed;
}

function buildSeparatorCommand(options = {}) {
  const uvPath = String(options.uvPath || '');
  const executableName = path.basename(uvPath).toLowerCase();
  const mdxBatchSize = Number(options.mdxBatchSize) === 1 || Number(options.mdxBatchSize) === 2
    ? Number(options.mdxBatchSize)
    : recommendedMdxBatchSize();
  const args = executableName === 'uv'
    ? ['tool', 'run', '--from', AI_STEM_SEPARATOR_PACKAGE, 'audio-separator']
    : ['--from', AI_STEM_SEPARATOR_PACKAGE, 'audio-separator'];
  args.push(
    String(options.inputPath || ''),
    '--model_filename', AI_STEM_MODEL_FILENAME,
    '--model_file_dir', String(options.modelDir || ''),
    '--output_dir', String(options.outputDir || ''),
    '--output_format', 'FLAC',
    '--custom_output_names', JSON.stringify({ Instrumental: 'instrumental', Vocals: 'vocals' }),
    '--mdx_batch_size', String(mdxBatchSize),
    '--use_soundfile',
    '--log_level', 'info',
  );
  if (options.lowPriority === true) {
    return {
      file: String(options.nicePath || '/usr/bin/nice'),
      args: ['-n', '10', uvPath, ...args],
      options: { shell: false },
    };
  }
  return { file: uvPath, args, options: { shell: false } };
}

function parseSeparatorProgress(line) {
  const text = String(line || '');
  let match;
  if (/saving\s+vocals?\s+stem/i.test(text)) return { stage: 'saving', percent: 96 };
  if (/saving\s+instrumental\s+stem/i.test(text)) return { stage: 'saving', percent: 94 };
  if (/starting separation process/i.test(text)) return { stage: 'separating', percent: 0 };
  match = text.match(/(?:download|model)[^\r\n%]{0,80}?([0-9]{1,3})\s*%/i);
  if (match) return { stage: 'model', percent: Math.max(0, Math.min(90, Number(match[1]) || 0)) };
  match = text.match(/(?:^|\s)([0-9]{1,3})\s*%\|/);
  if (match) return { stage: 'separating', percent: Math.max(0, Math.min(95, Number(match[1]) || 0)) };
  return null;
}

function firstExistingFile(candidates) {
  for (const candidate of candidates) {
    try {
      if (candidate && fs.statSync(candidate).isFile()) return candidate;
    } catch (_) {}
  }
  return '';
}

function findUvExecutable(env = process.env) {
  const home = env.HOME || os.homedir();
  return firstExistingFile([
    env.MINERADIO_UVX_PATH,
    path.join(home, '.local', 'bin', 'uvx'),
    '/opt/homebrew/bin/uvx',
    '/usr/local/bin/uvx',
    path.join(home, '.local', 'bin', 'uv'),
    '/opt/homebrew/bin/uv',
    '/usr/local/bin/uv',
  ]);
}

function findUvrModel(env = process.env, modelDir) {
  return firstExistingFile([
    env.MINERADIO_AI_STEM_MODEL_PATH,
    modelDir && path.join(modelDir, AI_STEM_MODEL_FILENAME),
    path.join('/Applications', 'Ultimate Vocal Remover.app', 'Contents', 'Resources', 'models', 'MDX_Net_Models', AI_STEM_MODEL_FILENAME),
    path.join(os.homedir(), 'Applications', 'Ultimate Vocal Remover.app', 'Contents', 'Resources', 'models', 'MDX_Net_Models', AI_STEM_MODEL_FILENAME),
  ]);
}

function findUvrFfmpegDirectory(env = process.env) {
  const configured = env.MINERADIO_AI_STEM_FFMPEG_DIR;
  const appFrameworks = path.join('/Applications', 'Ultimate Vocal Remover.app', 'Contents', 'Frameworks');
  if (configured && firstExistingFile([path.join(configured, 'ffmpeg')])) return configured;
  if (firstExistingFile([path.join(appFrameworks, 'ffmpeg')])) return appFrameworks;
  return '';
}

function extensionForContentType(contentType) {
  const value = String(contentType || '').toLowerCase();
  if (value.includes('flac')) return '.flac';
  if (value.includes('wav') || value.includes('wave')) return '.wav';
  if (value.includes('ogg') || value.includes('opus')) return '.ogg';
  if (value.includes('mp4') || value.includes('m4a') || value.includes('aac')) return '.m4a';
  return '.mp3';
}

function safeUnlink(file) {
  try { if (file) fs.unlinkSync(file); } catch (_) {}
}

function writeManifestAtomic(file, manifest) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, file);
}

function cachedStemResult(cacheRoot, trackKey) {
  let id;
  try { id = cacheIdForTrack(trackKey); } catch (_) { return null; }
  const dir = path.join(cacheRoot, id);
  const manifestPath = path.join(dir, 'manifest.json');
  const instrumentalPath = path.join(dir, 'instrumental.flac');
  const vocalsPath = path.join(dir, 'vocals.flac');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest || manifest.version !== 1 || manifest.id !== id || manifest.trackKey !== String(trackKey)) return null;
    if (fs.statSync(instrumentalPath).size <= 0 || fs.statSync(vocalsPath).size <= 0) return null;
    return { id, dir, manifest, instrumentalPath, vocalsPath };
  } catch (_) {
    return null;
  }
}

function publicReadyResult(cacheRoot, trackKey, cached) {
  const hit = cached || cachedStemResult(cacheRoot, trackKey);
  if (!hit) return null;
  const query = '/api/ai-stem?id=' + encodeURIComponent(hit.id);
  return {
    ok: true,
    status: 'ready',
    cached: true,
    id: hit.id,
    trackKey: String(trackKey || ''),
    model: AI_STEM_MODEL_FILENAME,
    instrumentalUrl: query + '&stem=instrumental',
    vocalsUrl: query + '&stem=vocals',
  };
}

function createCancelSignal() {
  let cancelled = false;
  const listeners = new Set();
  return {
    get cancelled() { return cancelled; },
    onCancel(listener) {
      if (typeof listener !== 'function') return () => {};
      if (cancelled) listener();
      else listeners.add(listener);
      return () => listeners.delete(listener);
    },
    cancel() {
      if (cancelled) return false;
      cancelled = true;
      for (const listener of [...listeners]) {
        try { listener(); } catch (_) {}
      }
      listeners.clear();
      return true;
    },
    throwIfCancelled() {
      if (cancelled) throw codedError('AI_STEM_CANCELLED');
    },
  };
}

function canonicalizeOutput(outputDir, stem) {
  const canonical = path.join(outputDir, stem + '.flac');
  try { if (fs.statSync(canonical).size > 0) return canonical; } catch (_) {}
  let candidates = [];
  try {
    candidates = fs.readdirSync(outputDir)
      .filter((name) => name.toLowerCase().endsWith('.flac') && name.toLowerCase().includes(stem === 'vocals' ? 'vocal' : 'instrument'))
      .map((name) => path.join(outputDir, name));
  } catch (_) {}
  const source = firstExistingFile(candidates);
  if (!source) throw codedError('AI_STEM_OUTPUT_MISSING_' + stem.toUpperCase());
  if (source !== canonical) fs.renameSync(source, canonical);
  return canonical;
}

async function downloadInput({ audioUrl, localOrigin, inputBase, signal, fetchImpl, report }) {
  const parsed = validateLocalAudioUrl(audioUrl, localOrigin);
  const controller = new AbortController();
  const removeCancel = signal.onCancel(() => controller.abort());
  let inputPath = '';
  let completed = false;
  try {
    report({ stage: 'downloading', percent: 1 });
    const response = await fetchImpl(parsed.href, { signal: controller.signal });
    if (!response || !response.ok || !response.body) {
      throw codedError('AI_STEM_AUDIO_DOWNLOAD_FAILED', 'AI_STEM_AUDIO_DOWNLOAD_FAILED:' + (response && response.status || 0));
    }
    const length = Number(response.headers && response.headers.get && response.headers.get('content-length')) || 0;
    if (length > AI_STEM_MAX_INPUT_BYTES) throw codedError('AI_STEM_AUDIO_TOO_LARGE');
    const extension = extensionForContentType(response.headers && response.headers.get && response.headers.get('content-type'));
    inputPath = inputBase + extension;
    let received = 0;
    const readable = Readable.fromWeb(response.body);
    readable.on('data', (chunk) => {
      received += chunk.length;
      if (received > AI_STEM_MAX_INPUT_BYTES) {
        controller.abort();
        readable.destroy(codedError('AI_STEM_AUDIO_TOO_LARGE'));
        return;
      }
      if (length > 0) report({ stage: 'downloading', percent: Math.max(1, Math.min(18, Math.round(received / length * 18))) });
    });
    await pipeline(readable, fs.createWriteStream(inputPath, { flags: 'wx' }));
    signal.throwIfCancelled();
    completed = true;
    return inputPath;
  } catch (error) {
    if (signal.cancelled || (error && error.name === 'AbortError')) throw codedError('AI_STEM_CANCELLED');
    throw error;
  } finally {
    removeCancel();
    if (!completed) safeUnlink(inputPath);
  }
}

function runSeparatorProcess({ command, signal, report, spawnImpl, env, logFile }) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command.file, command.args, { ...command.options, env });
    let log = '';
    let settled = false;
    let killTimer = null;
    function finish(error) {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      removeCancel();
      try { fs.writeFileSync(logFile, log.slice(-256 * 1024)); } catch (_) {}
      if (error) reject(error);
      else resolve();
    }
    function consume(chunk) {
      const text = String(chunk || '');
      log += text;
      for (const line of text.split(/[\r\n]+/)) {
        const progress = parseSeparatorProgress(line);
        if (progress) report(progress);
      }
    }
    if (child.stdout) child.stdout.on('data', consume);
    if (child.stderr) child.stderr.on('data', consume);
    child.once('error', (error) => finish(codedError('AI_STEM_HELPER_START_FAILED', error.message)));
    child.once('exit', (code, childSignal) => {
      if (signal.cancelled) finish(codedError('AI_STEM_CANCELLED'));
      else if (code === 0) finish();
      else finish(codedError('AI_STEM_HELPER_FAILED', 'AI_STEM_HELPER_FAILED:' + code + ':' + (childSignal || '')));
    });
    const removeCancel = signal.onCancel(() => {
      try { child.kill('SIGTERM'); } catch (_) {}
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 1800);
    });
  });
}

async function defaultProcessTrack(context, options) {
  const { cacheRoot, id, trackKey, audioUrl, localOrigin, signal, report } = context;
  const dir = path.join(cacheRoot, id);
  const modelDir = path.join(cacheRoot, 'models');
  const inputBase = path.join(dir, 'input');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(modelDir, { recursive: true });

  let powerState = {};
  try {
    powerState = typeof options.getPowerState === 'function' ? options.getPowerState() || {} : {};
  } catch (_) {}
  const runtime = {
    mdxBatchSize: recommendedMdxBatchSize({
      platform: process.platform,
      arch: process.arch,
      totalMemoryBytes: os.totalmem(),
      onBatteryPower: powerState.onBatteryPower === true,
      thermalState: powerState.thermalState,
    }),
    maxCpuThreads: recommendedAiStemThreadCount(),
    lowPriority: process.platform === 'darwin',
    powerSource: powerState.onBatteryPower === true ? 'battery' : 'ac',
    thermalState: String(powerState.thermalState || 'unknown'),
  };
  runtime.pythonHookDir = ensureAiStemRuntimeHook(cacheRoot);

  const uvPath = (options.findUv || findUvExecutable)(process.env);
  if (!uvPath) throw codedError('AI_STEM_HELPER_MISSING');
  const sourceModel = (options.findModel || findUvrModel)(process.env, modelDir);
  if (!sourceModel) throw codedError('AI_STEM_MODEL_MISSING');
  const cachedModel = path.join(modelDir, AI_STEM_MODEL_FILENAME);
  if (path.resolve(sourceModel) !== path.resolve(cachedModel)) {
    const sourceSize = fs.statSync(sourceModel).size;
    let cachedSize = -1;
    try { cachedSize = fs.statSync(cachedModel).size; } catch (_) {}
    if (sourceSize !== cachedSize) fs.copyFileSync(sourceModel, cachedModel);
  }
  signal.throwIfCancelled();

  let inputPath = '';
  try {
    inputPath = await downloadInput({
      audioUrl,
      localOrigin,
      inputBase,
      signal,
      fetchImpl: options.fetchImpl || global.fetch,
      report,
    });
    report({ stage: 'preparing', percent: 19 });
    const command = buildSeparatorCommand({
      uvPath,
      inputPath,
      outputDir: dir,
      modelDir,
      mdxBatchSize: runtime.mdxBatchSize,
      lowPriority: runtime.lowPriority,
    });
    const ffmpegDir = (options.findFfmpegDir || findUvrFfmpegDirectory)(process.env);
    const baseEnv = { ...process.env };
    if (ffmpegDir) baseEnv.PATH = ffmpegDir + path.delimiter + String(baseEnv.PATH || '');
    const env = buildAiStemProcessEnvironment(baseEnv, runtime);
    report({
      stage: 'preparing',
      percent: 19,
      runtime: {
        mdxBatchSize: runtime.mdxBatchSize,
        maxCpuThreads: runtime.maxCpuThreads,
        lowPriority: runtime.lowPriority,
        powerSource: runtime.powerSource,
        thermalState: runtime.thermalState,
      },
    });
    await runSeparatorProcess({
      command,
      signal,
      report,
      spawnImpl: options.spawnImpl || spawn,
      env,
      logFile: path.join(dir, 'separator.log'),
    });
    signal.throwIfCancelled();
    const instrumentalPath = canonicalizeOutput(dir, 'instrumental');
    const vocalsPath = canonicalizeOutput(dir, 'vocals');
    const manifest = {
      version: 1,
      id,
      trackKey,
      model: AI_STEM_MODEL_FILENAME,
      createdAt: new Date().toISOString(),
      files: { instrumental: path.basename(instrumentalPath), vocals: path.basename(vocalsPath) },
    };
    writeManifestAtomic(path.join(dir, 'manifest.json'), manifest);
    report({ stage: 'ready', percent: 100 });
    return { instrumentalPath, vocalsPath, manifest };
  } finally {
    safeUnlink(inputPath);
  }
}

function createAiStemService(options = {}) {
  const cacheRoot = path.resolve(String(options.cacheRoot || ''));
  if (!cacheRoot) throw codedError('AI_STEM_CACHE_ROOT_REQUIRED');
  fs.mkdirSync(cacheRoot, { recursive: true });
  const states = new Map();
  let activeJob = null;
  let nextJobId = 1;

  function emit(snapshot) {
    states.set(snapshot.id, { ...snapshot });
    if (typeof options.onProgress === 'function') {
      try { options.onProgress({ ...snapshot }); } catch (_) {}
    }
  }

  function status(trackKey) {
    const ready = publicReadyResult(cacheRoot, trackKey);
    if (ready) return ready;
    let id;
    try { id = cacheIdForTrack(trackKey); } catch (_) { return { ok: false, status: 'idle' }; }
    const state = states.get(id);
    return state ? { ...state } : { ok: true, status: 'idle', id, trackKey: String(trackKey || '') };
  }

  function cancel(jobId) {
    if (!activeJob || (jobId && Number(jobId) !== activeJob.jobId)) return { ok: false, status: 'idle' };
    const job = activeJob;
    job.signal.cancel();
    emit({ ok: true, status: 'cancelling', id: job.id, trackKey: job.trackKey, jobId: job.jobId, stage: 'cancelling', percent: job.percent || 0 });
    return { ok: true, status: 'cancelling', jobId: job.jobId };
  }

  async function start(payload = {}) {
    const trackKey = String(payload.trackKey || '').trim();
    const id = cacheIdForTrack(trackKey);
    const localOrigin = String((options.getLocalOrigin && options.getLocalOrigin()) || '');
    validateLocalAudioUrl(payload.audioUrl, localOrigin);
    const cached = publicReadyResult(cacheRoot, trackKey);
    if (cached) return cached;
    if (activeJob && activeJob.id === id) return status(trackKey);
    if (activeJob) cancel(activeJob.jobId);

    const signal = createCancelSignal();
    const job = {
      id,
      trackKey,
      audioUrl: String(payload.audioUrl || ''),
      localOrigin,
      jobId: nextJobId++,
      signal,
      percent: 0,
    };
    activeJob = job;
    function report(progress = {}) {
      job.percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
      if (progress.runtime && typeof progress.runtime === 'object') job.runtime = { ...progress.runtime };
      emit({
        ok: true,
        status: 'running',
        id,
        trackKey,
        jobId: job.jobId,
        stage: String(progress.stage || 'preparing'),
        percent: job.percent,
        ...(job.runtime ? { runtime: { ...job.runtime } } : {}),
      });
    }
    report({ stage: 'preparing', percent: 0 });
    try {
      const processor = options.processTrack || ((context) => defaultProcessTrack(context, options));
      await processor({ cacheRoot, id, trackKey, audioUrl: job.audioUrl, localOrigin, signal, report });
      signal.throwIfCancelled();
      const ready = publicReadyResult(cacheRoot, trackKey);
      if (!ready) throw codedError('AI_STEM_OUTPUT_MISSING');
      emit({ ...ready, cached: false, jobId: job.jobId });
      return { ...ready, cached: false, jobId: job.jobId };
    } catch (error) {
      if (signal.cancelled || (error && error.code === 'AI_STEM_CANCELLED')) {
        emit({ ok: true, status: 'idle', id, trackKey, stage: 'idle', percent: 0 });
        return { ok: true, status: 'cancelled', id, trackKey, jobId: job.jobId };
      }
      const code = String(error && (error.code || error.message) || 'AI_STEM_FAILED').slice(0, 120);
      emit({ ok: false, status: 'error', id, trackKey, jobId: job.jobId, stage: 'error', percent: job.percent, error: code });
      return { ok: false, status: 'error', id, trackKey, jobId: job.jobId, error: code };
    } finally {
      if (activeJob === job) activeJob = null;
    }
  }

  function shutdown() {
    if (activeJob) cancel(activeJob.jobId);
  }

  return { start, status, cancel, shutdown, cacheRoot };
}

module.exports = {
  AI_STEM_MODEL_FILENAME,
  AI_STEM_SEPARATOR_PACKAGE,
  buildAiStemProcessEnvironment,
  buildSeparatorCommand,
  cacheIdForTrack,
  createAiStemService,
  ensureAiStemRuntimeHook,
  findUvExecutable,
  findUvrFfmpegDirectory,
  findUvrModel,
  parseSeparatorProgress,
  recommendedAiStemThreadCount,
  recommendedMdxBatchSize,
  validateLocalAudioUrl,
};
