// ============================================================
function audioGraphHealthy() {
  var aiHealthy = !(typeof aiStemPlaybackActive === 'function' && aiStemPlaybackActive())
    || !!(aiStemVocalSource && aiStemMixNode && aiStemAccompanimentGain && aiStemVocalGain);
  var keyShiftHealthy = !singingKeyShiftProcessingNeeded()
    || !singingKeyShiftWorkletReady(audioCtx)
    || !!singingKeyShiftNode;
  // 唱歌去人声链缺失时视为不健康，避免 initAudio 早退导致“开了唱歌模式却仍原声直通/无声”。
  // 捕获流回退路径本身不做去人声，不要求 vocalCutChain。
  var vocalHealthy = !singingVocalProcessingNeeded()
    || !!(source && source.__mineradioUsesCapture)
    || !!vocalCutChain;
  return !!(audio && audioReady && audioCtx && audioCtx.state !== 'closed' && source && analyser && beatAnalyser && (gainNode || analysisSinkNode) && aiHealthy && keyShiftHealthy && vocalHealthy);
}
function disconnectAudioGraphNodes(keepSource) {
  [source, aiStemVocalSource, aiStemMixNode, aiStemAccompanimentGain, aiStemVocalGain, singingKeyShiftNode, analyser, beatAnalyser, gainNode, analysisSinkNode].forEach(function (node) {
    if (!node) return;
    try { node.disconnect(); } catch (e) { }
  });
  if (vocalCutChain) {
    try { vocalCutChain.input.disconnect(); } catch (e) { }
    try { vocalCutChain.output.disconnect(); } catch (e) { }
    vocalCutChain = null;
  }
  if (micVisualNode) { try { micVisualNode.disconnect(); } catch (e) { } micVisualNode = null; }
  // micSource 与 audioCtx 绑定,置空让 initAudio 从持久的 micStream 重建;micStream 不动
  if (micSource) { try { micSource.disconnect(); } catch (e) { } micSource = null; }
  if (!keepSource) source = null;
  analyser = null;
  beatAnalyser = null;
  gainNode = null;
  analysisSinkNode = null;
  aiStemMixNode = null;
  aiStemAccompanimentGain = null;
  aiStemVocalGain = null;
  singingKeyShiftNode = null;
  ['low', 'mid', 'high'].forEach(function (band) {
    if (!eqNodes[band]) return;
    try { eqNodes[band].disconnect(); } catch (e) { }
    eqNodes[band] = null;
  });
  audioReady = false;
}
// 三段均衡器：位于 analyser 和最终输出之间，不改动 #52 的实时唱歌、AI 双轨和升降 Key 路由。
var eqNodes = { low: null, mid: null, high: null };
var eqBands = { low: 0, mid: 0, high: 0 };
var EQ_STORE_KEY = 'mineradio-eq-v1';
var EQ_MIN_DB = -12, EQ_MAX_DB = 12;
(function loadEqBands() {
  try {
    var parsed = JSON.parse(localStorage.getItem(EQ_STORE_KEY) || 'null');
    if (parsed && typeof parsed === 'object') ['low', 'mid', 'high'].forEach(function (band) {
      var value = Number(parsed[band]);
      if (isFinite(value)) eqBands[band] = Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, value));
    });
  } catch (e) { }
})();
function applyEqToAudio() {
  ['low', 'mid', 'high'].forEach(function (band) {
    if (!eqNodes[band]) return;
    try { eqNodes[band].gain.value = eqBands[band]; } catch (e) { }
  });
}
function saveEqBands() {
  try { localStorage.setItem(EQ_STORE_KEY, JSON.stringify(eqBands)); } catch (e) { }
}
function syncEqUi() {
  ['low', 'mid', 'high'].forEach(function (band) {
    var slider = document.getElementById('eq-' + band + '-slider');
    var value = document.getElementById('eq-' + band + '-value');
    var db = eqBands[band];
    if (slider && document.activeElement !== slider) slider.value = String(db);
    if (value) value.textContent = (db > 0 ? '+' : '') + db + ' dB';
  });
}
function setEqBand(band, db, opts) {
  opts = opts || {};
  if (band !== 'low' && band !== 'mid' && band !== 'high') return;
  eqBands[band] = Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, Math.round(Number(db) || 0)));
  applyEqToAudio();
  saveEqBands();
  syncEqUi();
  if (!opts.silent) {
    var label = band === 'low' ? '低频' : (band === 'mid' ? '中频' : '高频');
    showToast('均衡器 · ' + label + ' ' + (eqBands[band] > 0 ? '+' : '') + eqBands[band] + ' dB');
  }
}
function resetEq() {
  eqBands.low = eqBands.mid = eqBands.high = 0;
  applyEqToAudio();
  saveEqBands();
  syncEqUi();
  showToast('均衡器已重置');
}
function restoreMediaTimeWhenReady(media, seconds) {
  seconds = Math.max(0, Number(seconds) || 0);
  if (!media || !seconds) return;
  function applyTime() {
    try {
      if (media.duration && isFinite(media.duration)) media.currentTime = Math.min(seconds, Math.max(0, media.duration - 0.25));
      else media.currentTime = seconds;
    } catch (e) { }
  }
  applyTime();
  media.addEventListener('loadedmetadata', applyTime, { once: true });
}
function replaceAudioElementForGraphRecovery(reason) {
  if (!audio) return false;
  var oldAudio = audio;
  var src = oldAudio.currentSrc || oldAudio.src || '';
  var seconds = isFinite(oldAudio.currentTime) ? oldAudio.currentTime : 0;
  var wasPaused = oldAudio.paused;
  var rate = oldAudio.playbackRate || 1;
  var endedHandler = oldAudio.onended;
  var metadataHandler = oldAudio.onloadedmetadata;
  try { oldAudio.pause(); } catch (e) { }
  disconnectAudioGraphNodes(false);
  try {
    if (audioCtx && audioCtx.state !== 'closed' && audioCtx.close) audioCtx.close().catch(function () { });
  } catch (e) { }
  audioCtx = null;
  audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = oldAudio.preload || 'auto';
  audio.playbackRate = rate;
  audio.onended = endedHandler;
  audio.onloadedmetadata = metadataHandler;
  bindPlaybackProgressEvents(audio);
  applyVolumeToAudio();
  if (src) {
    audio.src = src;
    restoreMediaTimeWhenReady(audio, seconds);
    if (!wasPaused) {
      try { audio.load(); } catch (e) { }
    }
  }
  applyAudioOutputDevice(audio);
  console.warn('audio graph recovery:', reason || 'unknown');
  return true;
}
function resetPlaybackAudioGraphForSourceSwitch(reason) {
  if (!audio) return;
  if (typeof aiStemPlaybackActive === 'function' && aiStemPlaybackActive() && String(reason || '').indexOf('ai-stem-') !== 0) {
    deactivateAiStemPlayback({ restoreOriginal: false, reason: reason || 'track-switch' });
  }
  var sourceUsesCapture = !!(source && source.__mineradioUsesCapture);
  disconnectAudioGraphNodes(!sourceUsesCapture);
  if (sourceUsesCapture) audio.__mineradioMediaSourceBound = false;
}
var MIC_VISUAL_GAIN = 3.0;  // 麦克风信号进可视化分析器前的提亮倍数(嗓音常偏小)

// ── 频谱级去人声 AudioWorklet 处理器 ──
// STFT(2048/HOP512,Hann,75% 叠加)生成两套掩码:伴奏轨强力削中置,人声轨保护鼓点瞬态。
// 仍是单路 FFT 处理,无双路延迟错配。
var VOCAL_REMOVER_PROCESSOR_SRC = `
class VocalRemoverProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    var N = 2048, HOP = 512;
    this.N = N; this.HOP = HOP;
    this.win = new Float32Array(N);
    for (var i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    var c = 0; for (var p = (N / 2) % HOP; p < N; p += HOP) c += this.win[p] * this.win[p];
    this.norm = c > 0 ? 1 / c : 1;
    this.lowKeepBin = Math.max(1, Math.round(130 * N / sampleRate));  // <130Hz(贝斯/底鼓)整段保留
    this.highProtectBin = Math.max(this.lowKeepBin + 1, Math.round(7200 * N / sampleRate));
    this.voiceLowBin = Math.max(this.lowKeepBin + 1, Math.round(160 * N / sampleRate));
    this.voicePresenceBin = Math.round(1400 * N / sampleRate);
    this.voiceHighBin = Math.min(N >> 1, Math.round(6000 * N / sampleRate));
    this.accompanimentMaskPrev = new Float32Array(N);
    for (var mk = 0; mk < N; mk++) this.accompanimentMaskPrev[mk] = 1;
    this.vocalProbabilityPrev = new Float32Array(N);
    this.prevMidEnergy = new Float32Array(N);
    this.transientState = new Float32Array(N);
    this.frameVocalConfidence = 0.25;
    this.inL = new Float32Array(N); this.inR = new Float32Array(N); this.inFill = 0;
    this.olaL = new Float32Array(N); this.olaR = new Float32Array(N);
    this.qL = new Float32Array(N * 2); this.qR = new Float32Array(N * 2);
    this.qHead = 0; this.qTail = 0; this.qCount = 0;
    this.re1 = new Float32Array(N); this.im1 = new Float32Array(N);
    this.re2 = new Float32Array(N); this.im2 = new Float32Array(N);
    this.rev = new Uint32Array(N);
    var bits = Math.round(Math.log(N) / Math.log(2));
    for (var i2 = 0; i2 < N; i2++) { var x = i2, r = 0; for (var j = 0; j < bits; j++) { r = (r << 1) | (x & 1); x >>= 1; } this.rev[i2] = r; }
    this.tcos = new Float32Array(N / 2); this.tsin = new Float32Array(N / 2);
    for (var i3 = 0; i3 < N / 2; i3++) { this.tcos[i3] = Math.cos(2 * Math.PI * i3 / N); this.tsin[i3] = Math.sin(2 * Math.PI * i3 / N); }
    var mix = options && options.processorOptions || {};
    this.accompanimentLevel = Math.max(0, Math.min(1, typeof mix.accompaniment === 'number' ? mix.accompaniment : 1));
    this.vocalLevel = Math.max(0, Math.min(1, typeof mix.vocal === 'number' ? mix.vocal : 0));
    this.port.onmessage = (e) => {
      var data = e.data || {};
      if (typeof data.accompaniment === 'number') this.accompanimentLevel = Math.max(0, Math.min(1, data.accompaniment));
      if (typeof data.vocal === 'number') this.vocalLevel = Math.max(0, Math.min(1, data.vocal));
    };
  }
  fft(re, im, inv) {
    var N = this.N, rev = this.rev, tcos = this.tcos, tsin = this.tsin;
    for (var i = 0; i < N; i++) { var j = rev[i]; if (j > i) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (var len = 2; len <= N; len <<= 1) {
      var half = len >> 1, step = N / len;
      for (var a0 = 0; a0 < N; a0 += len) {
        for (var k = 0, idx = 0; k < half; k++, idx += step) {
          var wr = tcos[idx], wi = inv ? tsin[idx] : -tsin[idx];
          var a = a0 + k, b = a + half;
          var xr = re[b], xi = im[b];
          var tr = xr * wr - xi * wi, ti = xr * wi + xi * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] = re[a] + tr; im[a] = im[a] + ti;
        }
      }
    }
    if (inv) { for (var m = 0; m < N; m++) { re[m] /= N; im[m] /= N; } }
  }
  frame() {
    var N = this.N, win = this.win, accompaniment = this.accompanimentLevel, vocal = this.vocalLevel;
    var keepBin = this.lowKeepBin, highBin = this.highProtectBin, amp = this.accompanimentMaskPrev, vp = this.vocalProbabilityPrev, pe = this.prevMidEnergy, ts = this.transientState;
    for (var i = 0; i < N; i++) { this.re1[i] = this.inL[i] * win[i]; this.im1[i] = 0; this.re2[i] = this.inR[i] * win[i]; this.im2[i] = 0; }
    this.fft(this.re1, this.im1, false);
    this.fft(this.re2, this.im2, false);
    var voiceTotalEnergy = 0, voicePresenceEnergy = 0;
    var voiceLowBin = this.voiceLowBin, voicePresenceBin = this.voicePresenceBin, voiceHighBin = this.voiceHighBin;
    var frameVocalConfidence = this.frameVocalConfidence;
    for (var b = 0; b < N; b++) {
      var lr = this.re1[b], li = this.im1[b], rr = this.re2[b], ri = this.im2[b];
      var mr = (lr + rr) * 0.5, mi = (li + ri) * 0.5;
      var sr = (lr - rr) * 0.5, si = (li - ri) * 0.5;
      var midEnergy = mr * mr + mi * mi, sideEnergy = sr * sr + si * si;
      var leftEnergy = lr * lr + li * li, rightEnergy = rr * rr + ri * ri;
      var rawAccompanimentMask = 1;
      var rawVocalProbability = 0;
      var instantTransientProbability = 0;
      var fb = b <= (N >> 1) ? b : (N - b);   // 折叠到 0..N/2
      if (fb > keepBin && midEnergy > 1e-12) {
        var sideToMid = Math.min(1, Math.sqrt(sideEnergy) / (Math.sqrt(midEnergy) + 1e-9));
        rawAccompanimentMask = Math.pow(sideToMid, 2.2);
        var crossRoot = Math.sqrt(leftEnergy * rightEnergy);
        var phaseCoherence = Math.max(0, Math.min(1, (lr * rr + li * ri) / (crossRoot + 1e-12)));
        var levelBalance = Math.min(1, 2 * crossRoot / (leftEnergy + rightEnergy + 1e-12));
        var sideRatioSquared = Math.min(1, sideEnergy / (midEnergy + 1e-12));
        var spatialCenter = (1 - Math.pow(sideRatioSquared, 1.1)) * phaseCoherence * levelBalance;
        var previousEnergy = pe[b];
        var transientProbability = previousEnergy > 1e-12
          ? Math.max(0, Math.min(1, (midEnergy - previousEnergy) / (midEnergy + 1e-12)))
          : 1;
        instantTransientProbability = transientProbability;
        transientProbability = Math.max(transientProbability, ts[b] * 0.58);
        ts[b] = transientProbability;
        pe[b] = previousEnergy * 0.56 + midEnergy * 0.44;
        if (b >= voiceLowBin && b <= voiceHighBin) {
          var stableWeight = 1 - transientProbability;
          var stableEnergy = midEnergy * stableWeight * stableWeight;
          voiceTotalEnergy += stableEnergy;
          if (b >= voicePresenceBin) voicePresenceEnergy += stableEnergy;
        }
        var highFrequencyProtection = fb > highBin
          ? Math.max(0.35, 1 - 0.65 * (fb - highBin) / Math.max(1, (N >> 1) - highBin))
          : 1;
        rawVocalProbability = spatialCenter * spatialCenter
          * (1 - 0.98 * transientProbability)
          * highFrequencyProtection
          * frameVocalConfidence;
      } else {
        pe[b] *= 0.5;
        ts[b] *= 0.5;
      }
      // 只放回最尖锐的第一下瞬态；五次方会快速压低持续人声，同时保留军鼓/镲片的冲击。
      if (fb > keepBin) rawAccompanimentMask = Math.max(rawAccompanimentMask, Math.pow(instantTransientProbability, 5));
      var previousAccompanimentMask = amp[b];
      var accompanimentSmoothing = rawAccompanimentMask < previousAccompanimentMask ? 0.18 : 0.62;
      var accompanimentMask = accompanimentSmoothing * previousAccompanimentMask + (1 - accompanimentSmoothing) * rawAccompanimentMask;
      amp[b] = accompanimentMask;
      // 瞬态到来时快速转入伴奏,人声概率慢速恢复,减少水声伪影。
      var previousVocalProbability = vp[b];
      var smoothing = rawVocalProbability < previousVocalProbability ? 0.16 : 0.72;
      var vocalProbability = smoothing * previousVocalProbability + (1 - smoothing) * rawVocalProbability;
      vp[b] = vocalProbability;
      var accompanimentApplied = accompaniment * accompanimentMask;
      var vocalApplied = vocal * vocalProbability;
      // 人声支路只重建中置信号，避免同频的侧声道乐器随掩码一起漏回。
      this.re1[b] = lr * accompanimentApplied + mr * vocalApplied;
      this.im1[b] = li * accompanimentApplied + mi * vocalApplied;
      this.re2[b] = rr * accompanimentApplied + mr * vocalApplied;
      this.im2[b] = ri * accompanimentApplied + mi * vocalApplied;
    }
    // 用本帧统计更新下一帧，避免为人声判断再扫描一遍频谱。
    var presenceShare = voicePresenceEnergy / (voiceTotalEnergy + 1e-12);
    var targetVocalConfidence = 0.25 + 0.75 * Math.min(1, presenceShare / 0.01);
    this.frameVocalConfidence = 0.55 * frameVocalConfidence + 0.45 * targetVocalConfidence;
    this.fft(this.re1, this.im1, true);
    this.fft(this.re2, this.im2, true);
    var norm = this.norm;
    for (var o = 0; o < N; o++) { this.olaL[o] += this.re1[o] * win[o] * norm; this.olaR[o] += this.re2[o] * win[o] * norm; }
    for (var h = 0; h < this.HOP; h++) {
      this.qL[this.qTail] = this.olaL[h]; this.qR[this.qTail] = this.olaR[h];
      this.qTail = (this.qTail + 1) % this.qL.length; this.qCount++;
    }
    this.olaL.copyWithin(0, this.HOP); this.olaR.copyWithin(0, this.HOP);
    for (var z = N - this.HOP; z < N; z++) { this.olaL[z] = 0; this.olaR[z] = 0; }
  }
  process(inputs, outputs) {
    var out = outputs[0]; if (!out || !out.length) return true;
    var outL = out[0], outR = out[1] || out[0];
    var inp = inputs[0];
    if (!inp || !inp.length) { for (var z = 0; z < outL.length; z++) { outL[z] = 0; if (outR !== outL) outR[z] = 0; } return true; }
    var inL = inp[0], inR = inp[1] || inp[0];
    var blk = outL.length;
    for (var n = 0; n < blk; n++) {
      this.inL[this.inFill] = inL[n]; this.inR[this.inFill] = inR[n]; this.inFill++;
      if (this.qCount > 0) { outL[n] = this.qL[this.qHead]; if (outR !== outL) outR[n] = this.qR[this.qHead]; this.qHead = (this.qHead + 1) % this.qL.length; this.qCount--; }
      else { outL[n] = 0; if (outR !== outL) outR[n] = 0; }
      if (this.inFill === this.N) {
        this.frame();
        this.inL.copyWithin(0, this.HOP); this.inR.copyWithin(0, this.HOP);
        this.inFill = this.N - this.HOP;
      }
    }
    return true;
  }
}
registerProcessor('vocal-remover-processor', VocalRemoverProcessor);
`;
var _vocalWorkletCtx = null, _vocalWorkletPromise = null;
var _vocalWorkletReadyContexts = new WeakSet();
var _vocalWorkletPromisesByContext = new WeakMap();
function vocalRemoverWorkletReady(ctx) {
  return !!(ctx && _vocalWorkletReadyContexts.has(ctx));
}
function ensureVocalRemoverWorklet(ctx) {
  if (!ctx || !ctx.audioWorklet) return Promise.resolve(false);
  if (vocalRemoverWorkletReady(ctx)) return Promise.resolve(true);
  var pending = _vocalWorkletPromisesByContext.get(ctx);
  if (pending) return pending;
  var url;
  try { url = URL.createObjectURL(new Blob([VOCAL_REMOVER_PROCESSOR_SRC], { type: 'application/javascript' })); }
  catch (e) { return Promise.resolve(false); }
  var p = ctx.audioWorklet.addModule(url).then(function () {
    _vocalWorkletReadyContexts.add(ctx);
    _vocalWorkletCtx = ctx;
    try { URL.revokeObjectURL(url); } catch (e) {}
    return true;
  }).catch(function (err) {
    console.warn('vocal remover worklet load failed:', err && (err.message || err));
    try { URL.revokeObjectURL(url); } catch (e) {} return false;
  }).then(function (ok) {
    if (_vocalWorkletPromisesByContext.get(ctx) === p) _vocalWorkletPromisesByContext.delete(ctx);
    if (_vocalWorkletPromise === p) _vocalWorkletPromise = null;
    return ok;
  });
  p._ctx = ctx;
  _vocalWorkletPromise = p;
  _vocalWorkletPromisesByContext.set(ctx, p);
  return p;
}

var SINGING_KEY_SHIFT_MIN = -6;
var SINGING_KEY_SHIFT_MAX = 6;
var SINGING_KEY_SHIFT_PROCESSOR_URL = 'vendor/soundtouch/soundtouch-processor.js';
var _singingKeyShiftReadyContexts = new WeakSet();
var _singingKeyShiftPromisesByContext = new WeakMap();
var _singingKeyShiftChangeSerial = 0;

function normalizeSingingKeyShift(value) {
  value = Number(value);
  if (!isFinite(value)) value = 0;
  return Math.max(-6, Math.min(6, Math.round(value)));
}

function effectiveSingingKeyShift() {
  return singingModeEnabled ? normalizeSingingKeyShift(singingKeyShift) : 0;
}

function singingKeyShiftProcessingNeeded() {
  return effectiveSingingKeyShift() !== 0;
}

function singingKeyShiftWorkletReady(ctx) {
  return !!(ctx && _singingKeyShiftReadyContexts.has(ctx));
}

function ensureSingingKeyShiftWorklet(ctx) {
  if (!ctx || !ctx.audioWorklet) return Promise.resolve(false);
  if (singingKeyShiftWorkletReady(ctx)) return Promise.resolve(true);
  var pending = _singingKeyShiftPromisesByContext.get(ctx);
  if (pending) return pending;
  var url;
  try { url = new URL(SINGING_KEY_SHIFT_PROCESSOR_URL, window.location.href).href; }
  catch (e) { url = SINGING_KEY_SHIFT_PROCESSOR_URL; }
  var promise = ctx.audioWorklet.addModule(url).then(function () {
    _singingKeyShiftReadyContexts.add(ctx);
    return true;
  }).catch(function (error) {
    console.warn('singing key shift worklet load failed:', error && (error.message || error));
    return false;
  }).then(function (ok) {
    if (_singingKeyShiftPromisesByContext.get(ctx) === promise) _singingKeyShiftPromisesByContext.delete(ctx);
    return ok;
  });
  _singingKeyShiftPromisesByContext.set(ctx, promise);
  return promise;
}

function setAudioParamImmediate(parameter, value, ctx) {
  if (!parameter) return;
  var now = ctx && isFinite(ctx.currentTime) ? ctx.currentTime : 0;
  try {
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(value, now);
  } catch (e) {
    try { parameter.value = value; } catch (_) {}
  }
}

function updateSingingKeyShiftNodeParameters(node) {
  node = node || singingKeyShiftNode;
  if (!node || !node.parameters) return false;
  var ctx = node.context || audioCtx;
  setAudioParamImmediate(node.parameters.get('pitch'), 1, ctx);
  setAudioParamImmediate(node.parameters.get('pitchSemitones'), effectiveSingingKeyShift(), ctx);
  setAudioParamImmediate(node.parameters.get('playbackRate'), Number(playbackSpeed) || 1, ctx);
  return true;
}

function buildSingingKeyShiftNode(ctx) {
  var node = new AudioWorkletNode(ctx, 'soundtouch-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    processorOptions: { sampleBufferType: 'circular' }
  });
  updateSingingKeyShiftNodeParameters(node);
  return node;
}

function connectSingingKeyShiftOutput(ctx, inputNode, outputNodes) {
  outputNodes = Array.isArray(outputNodes) ? outputNodes.filter(Boolean) : [outputNodes].filter(Boolean);
  if (!inputNode || !outputNodes.length) return false;
  singingKeyShiftNode = null;
  if (!singingKeyShiftProcessingNeeded() || !singingKeyShiftWorkletReady(ctx) || typeof AudioWorkletNode === 'undefined') {
    outputNodes.forEach(function (outputNode) { inputNode.connect(outputNode); });
    return false;
  }
  try {
    singingKeyShiftNode = buildSingingKeyShiftNode(ctx);
    inputNode.connect(singingKeyShiftNode);
    outputNodes.forEach(function (outputNode) { singingKeyShiftNode.connect(outputNode); });
    return true;
  } catch (error) {
    console.warn('singing key shift node unavailable:', error && (error.message || error));
    singingKeyShift = 0;
    singingKeyShiftNode = null;
    outputNodes.forEach(function (outputNode) { inputNode.connect(outputNode); });
    syncSingingKeyShiftUi();
    return false;
  }
}

function buildVocalCutChainWorklet(ctx) {
  var node = new AudioWorkletNode(ctx, 'vocal-remover-processor', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
    channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete',
    processorOptions: { accompaniment: singingAccompanimentLevel, vocal: singingVocalLevel }
  });
  return {
    input: node, output: node,
    setLevels: function (accompaniment, vocal) { try { node.port.postMessage({ accompaniment: accompaniment, vocal: vocal }); } catch (e) {} },
    setLevel: function (vocal) { try { node.port.postMessage({ accompaniment: singingAccompanimentLevel, vocal: vocal }); } catch (e) {} }
  };
}
// 回退:双段中置消除(近零延迟)。低频<120Hz 取 M=(L+R)/2 保冲击,其余取 S=(L-R)/2 去主唱。
function buildCenterCancelNodes(ctx) {
  var input = ctx.createGain();
  var splitter = ctx.createChannelSplitter(2);
  input.connect(splitter);
  var sBus = ctx.createGain();
  var lS = ctx.createGain(); lS.gain.value = 0.5;
  var rS = ctx.createGain(); rS.gain.value = -0.5;
  splitter.connect(lS, 0); splitter.connect(rS, 1);
  lS.connect(sBus); rS.connect(sBus);
  var mBus = ctx.createGain();
  var lM = ctx.createGain(); lM.gain.value = 0.5;
  var rM = ctx.createGain(); rM.gain.value = 0.5;
  splitter.connect(lM, 0); splitter.connect(rM, 1);
  lM.connect(mBus); rM.connect(mBus);
  var low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 120;
  var high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 120;
  mBus.connect(low); sBus.connect(high);
  var output = ctx.createGain();
  low.connect(output); high.connect(output);
  return { input: input, output: output };
}
function buildVocalCutChainBiquad(ctx) {
  var input = ctx.createGain();
  var cut = buildCenterCancelNodes(ctx);
  input.connect(cut.input);
  // vocal*原声 + (accompaniment-vocal)*伴奏估计
  // = accompaniment*伴奏估计 + vocal*(原声-伴奏估计)。
  var original = ctx.createGain(); original.gain.value = singingVocalLevel;
  var separated = ctx.createGain(); separated.gain.value = singingAccompanimentLevel - singingVocalLevel;
  input.connect(original);
  cut.output.connect(separated);
  var output = ctx.createGain();
  original.connect(output); separated.connect(output);
  return {
    input: input, output: output,
    setLevels: function (accompaniment, vocal) { original.gain.value = vocal; separated.gain.value = accompaniment - vocal; },
    setLevel: function (vocal) { original.gain.value = vocal; separated.gain.value = singingAccompanimentLevel - vocal; }
  };
}
// 有 worklet 用频谱级(单路,内部按 level 调),否则回退双段 biquad(dry/wet 混)
function buildVocalCutChain(ctx) {
  if (vocalRemoverWorkletReady(ctx) && typeof AudioWorkletNode !== 'undefined') {
    try { return buildVocalCutChainWorklet(ctx); } catch (e) { }
  }
  return buildVocalCutChainBiquad(ctx);
}
function singingVocalProcessingNeeded(vocalLevel, accompanimentLevel) {
  if (typeof aiStemPlaybackActive === 'function' && aiStemPlaybackActive()) return false;
  var vocal = arguments.length ? Number(vocalLevel) : Number(singingVocalLevel);
  var accompaniment = arguments.length > 1
    ? Number(accompanimentLevel)
    : Number(typeof singingAccompanimentLevel === 'undefined' ? 1 : singingAccompanimentLevel);
  if (!isFinite(vocal)) vocal = 0;
  if (!isFinite(accompaniment)) accompaniment = 1;
  return !!(singingModeEnabled && (vocal < 1 || accompaniment < 1));
}
function connectSingingPlaybackGraph(ctx, playbackSource, outputAnalyser, sourceUsesCapture) {
  vocalCutChain = null;
  var processedOutput = playbackSource;
  if (singingVocalProcessingNeeded() && !sourceUsesCapture) {
    vocalCutChain = buildVocalCutChain(ctx);
    if (vocalCutChain.setLevels) vocalCutChain.setLevels(singingAccompanimentLevel, singingVocalLevel);
    else if (vocalCutChain.setLevel) vocalCutChain.setLevel(singingVocalLevel);
    playbackSource.connect(vocalCutChain.input);
    processedOutput = vocalCutChain.output;
  }
  connectSingingKeyShiftOutput(ctx, processedOutput, [outputAnalyser]);
  return vocalCutChain;
}
function initAudio() {
  if (!audio) return false;
  if (audioGraphHealthy()) return true;
  var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return false;
  if (audioCtx && audioCtx.state === 'closed') replaceAudioElementForGraphRecovery('closed-context');
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContextCtor({ latencyHint: 'playback' });   // 大缓冲:GPU 打满/手势争抢时不欠载爆音(音质无损,仅播放延迟略增,听歌无感)
  var keepSource = !!(source && source.context === audioCtx && audioCtx.state !== 'closed');
  var sourceUsesCapture = !!(keepSource && source.__mineradioUsesCapture);
  disconnectAudioGraphNodes(keepSource);
  if (!source) {
    var forceCapture = !!audio.__mineradioForceCaptureSource;
    audio.__mineradioForceCaptureSource = false;
    var mediaSource = null;
    if (!forceCapture && !audio.__mineradioMediaSourceBound && audioCtx.createMediaElementSource) {
      try {
        mediaSource = audioCtx.createMediaElementSource(audio);
      } catch (mediaErr) {
        mediaSource = null;
        audio.__mineradioMediaSourceBound = true;
        console.warn('media element source unavailable:', mediaErr && (mediaErr.message || mediaErr));
      }
    }
    if (!forceCapture && !mediaSource && audio.__mineradioMediaSourceBound) {
      replaceAudioElementForGraphRecovery('media-source-rebind');
      if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContextCtor({ latencyHint: 'playback' });   // 大缓冲:GPU 打满/手势争抢时不欠载爆音(音质无损,仅播放延迟略增,听歌无感)
      try {
        mediaSource = audioCtx.createMediaElementSource(audio);
      } catch (rebindingErr) {
        mediaSource = null;
        console.warn('media element source recovery failed:', rebindingErr && (rebindingErr.message || rebindingErr));
      }
    }
    var capturedStream = null;
    if (!mediaSource) {
      try {
        if (audio && audio.captureStream && audioCtx.createMediaStreamSource) capturedStream = audio.captureStream();
      } catch (captureErr) {
        capturedStream = null;
        console.warn('capture stream source unavailable:', captureErr && (captureErr.message || captureErr));
      }
    }
    if (!mediaSource && !capturedStream) return false;
    source = mediaSource || audioCtx.createMediaStreamSource(capturedStream);
    source.__mineradioUsesCapture = !mediaSource;
    audio.__mineradioMediaSourceBound = !!mediaSource;
    sourceUsesCapture = !mediaSource;
  }
  analyser = audioCtx.createAnalyser();
  beatAnalyser = audioCtx.createAnalyser();
  gainNode = sourceUsesCapture ? null : audioCtx.createGain();
  analysisSinkNode = sourceUsesCapture ? audioCtx.createGain() : null;
  if (analysisSinkNode) analysisSinkNode.gain.value = 0;
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.58;
  beatAnalyser.fftSize = BEAT_FFT_SIZE;
  beatAnalyser.smoothingTimeConstant = 0.10;
  var aiStemGraphConnected = false;
  if (typeof connectAiStemPlaybackGraph === 'function' && !sourceUsesCapture) {
    aiStemGraphConnected = connectAiStemPlaybackGraph(audioCtx, source, analyser, beatAnalyser);
  }
  // 唱歌模式麦克风:重建 micSource,提亮后接进“只分析”的 beatAnalyser —— 粒子/节拍跟你嗓音动,
  // 且 beatAnalyser 是死端(不接 destination),麦克风绝不进扬声器=不啸叫。_voxAnalyser 由 voxel-echo 侧再挂一份。
  micVisualNode = null;
  if (singingModeEnabled && micStream && (!micSource || micSource.context !== audioCtx)) {
    try { micSource = audioCtx.createMediaStreamSource(micStream); } catch (e) { micSource = null; }
  }
  if (singingModeEnabled && micSource) {
    try {
      micVisualNode = audioCtx.createGain();
      micVisualNode.gain.value = MIC_VISUAL_GAIN;  // 麦克风常偏小,提亮让嗓音清晰驱动可视化
      micSource.connect(micVisualNode);
      micVisualNode.connect(beatAnalyser);
    } catch (e) { micVisualNode = null; }
  }
  // 原唱 100% 时直连，完全绕过 Worklet；低于 100% 才建立去人声链。
  // 捕获流(mono 回退)仍不做去人声。麦克风不进输出链，只驱动分析器。
  if (!aiStemGraphConnected) {
    source.connect(beatAnalyser);  // 实时模式保持原全混音节拍分析
    connectSingingPlaybackGraph(audioCtx, source, analyser, sourceUsesCapture);
  }
  var eqOutput = gainNode || analysisSinkNode;
  if (eqOutput) {
    eqNodes.low = audioCtx.createBiquadFilter();
    eqNodes.low.type = 'lowshelf';
    eqNodes.low.frequency.value = 120;
    eqNodes.mid = audioCtx.createBiquadFilter();
    eqNodes.mid.type = 'peaking';
    eqNodes.mid.frequency.value = 1000;
    eqNodes.mid.Q.value = 0.9;
    eqNodes.high = audioCtx.createBiquadFilter();
    eqNodes.high.type = 'highshelf';
    eqNodes.high.frequency.value = 5000;
    analyser.connect(eqNodes.low);
    eqNodes.low.connect(eqNodes.mid);
    eqNodes.mid.connect(eqNodes.high);
    eqNodes.high.connect(eqOutput);
    eqOutput.connect(audioCtx.destination);
    applyEqToAudio();
  }
  applyPlaybackSpeedToAudio();
  applyVolumeToAudio();
  frequencyData.fill(0);
  beatFrequencyData.fill(0);
  beatTimeDomainData.fill(128);
  resetRealtimeBeatEngine();
  audioReady = true;
  if (singingKeyShiftProcessingNeeded() && !singingKeyShiftWorkletReady(audioCtx)) prepareSingingKeyShiftProcessor();
  applyAudioOutputDevice(audio);
  return true;
}
function readPlaybackAnalyserSignal() {
  if (!analyser) return 0;
  try {
    analyser.getByteTimeDomainData(timeDomainData);
    analyser.getByteFrequencyData(frequencyData);
    var timeSum = 0;
    var freqSum = 0;
    var step = Math.max(1, Math.floor(timeDomainData.length / 256));
    for (var i = 0; i < timeDomainData.length; i += step) timeSum += Math.abs(timeDomainData[i] - 128);
    var freqStep = Math.max(1, Math.floor(frequencyData.length / 256));
    for (var j = 0; j < frequencyData.length; j += freqStep) freqSum += frequencyData[j];
    return (timeSum / Math.max(1, Math.ceil(timeDomainData.length / step)) / 128) + (freqSum / Math.max(1, Math.ceil(frequencyData.length / freqStep)) / 255);
  } catch (e) {
    return 0;
  }
}
function rebuildPlaybackGraphWithCapture(reason) {
  if (!audio || !audio.captureStream || !audioCtx || !audioCtx.createMediaStreamSource) return false;
  disconnectAudioGraphNodes(false);
  audio.__mineradioForceCaptureSource = true;
  var ok = initAudio();
  if (ok) console.warn('audio analyser recovered with capture stream:', reason || 'silent-graph');
  return ok;
}
var playbackAnalyserRecoverySerial = 0;
function schedulePlaybackAnalyserRecovery(reason) {
  var serial = ++playbackAnalyserRecoverySerial;
  var token = trackSwitchToken;
  [720, 1600, 2800].forEach(function (delay) {
    setTimeout(function () {
      if (serial !== playbackAnalyserRecoverySerial || token !== trackSwitchToken) return;
      if (!audio || audio.paused || audio.ended || !audio.src) return;
      if (!audioReady || !analyser || !source) {
        ensurePlaybackAudioGraph('analyser-health-missing-' + (reason || 'playback'));
        return;
      }
      var current = isFinite(audio.currentTime) ? audio.currentTime : 0;
      if (current < 0.45) return;
      var signal = readPlaybackAnalyserSignal();
      if (signal > 0.0025) return;
      if (source && !source.__mineradioUsesCapture && audio.captureStream) {
        rebuildPlaybackGraphWithCapture(reason || 'silent-after-track-switch');
        ensurePlaybackAudioGraph('analyser-health-capture-' + (reason || 'playback'));
      }
    }, delay);
  });
}
function resumeAudioAnalysis() {
  if (audioCtx && audioCtx.state === 'closed') {
    replaceAudioElementForGraphRecovery('resume-closed-context');
    initAudio();
  }
  if (audioCtx && audioCtx.state === 'suspended') return audioCtx.resume().catch(function (e) { console.warn('audio context resume failed:', e); });
  return Promise.resolve();
}
async function ensurePlaybackAudioGraph(reason) {
  if (!audio) return false;
  if (!audioGraphHealthy()) initAudio();
  await resumeAudioAnalysis();
  if (!audioGraphHealthy()) initAudio();
  await resumeAudioAnalysis();
  if (!audioGraphHealthy()) console.warn('audio graph still unhealthy:', reason || 'playback');
  return audioGraphHealthy();
}

function ensureUiSfxContext() {
  var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!uiSfxCtx || uiSfxCtx.state === 'closed') uiSfxCtx = new AudioContextCtor();
  applyAudioOutputDevice(audio);
  if (uiSfxCtx.state === 'suspended' && uiSfxCtx.resume) uiSfxCtx.resume().catch(function () { });
  return uiSfxCtx;
}

function playShelfSelectTick(direction, variant) {
  var nowMs = performance.now();
  var minGap = variant === 'row' ? 36 : 42;
  if (nowMs - lastShelfSelectSfxAt < minGap) return;
  var ctx = ensureUiSfxContext();
  if (!ctx) return;
  lastShelfSelectSfxAt = nowMs;
  var dir = direction < 0 ? -1 : 1;
  var pitch = dir > 0 ? 1.035 : 0.965;
  var rowScale = variant === 'row' ? 0.74 : 1.0;
  var volumeScale = 0.38 + Math.max(0, Math.min(1, targetVolume == null ? 0.65 : targetVolume)) * 0.62;
  var t = ctx.currentTime + 0.002;
  var out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(0.058 * rowScale * volumeScale, t + 0.002);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.082);
  out.connect(ctx.destination);

  var sampleRate = ctx.sampleRate || 44100;
  var len = Math.max(1, Math.floor(sampleRate * 0.034));
  var buf = ctx.createBuffer(1, len, sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) {
    var e = Math.pow(1 - i / len, 4.2);
    data[i] = (Math.random() * 2 - 1) * e;
  }
  var noise = ctx.createBufferSource();
  noise.buffer = buf;
  var hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(4200 * pitch, t);
  var bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(8400 * pitch, t);
  bp.Q.setValueAtTime(7.2, t);
  var ng = ctx.createGain();
  ng.gain.setValueAtTime(0.56, t);
  noise.connect(hp);
  hp.connect(bp);
  bp.connect(ng);
  ng.connect(out);
  noise.start(t);
  noise.stop(t + 0.040);

  function clickOsc(type, freq, delay, dur, gainValue, bend) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    var start = t + delay;
    var end = start + dur;
    osc.type = type;
    osc.frequency.setValueAtTime(freq * pitch, start);
    osc.frequency.exponentialRampToValueAtTime(freq * pitch * (bend || 0.72), end);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gainValue, start + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g);
    g.connect(out);
    osc.start(start);
    osc.stop(end + 0.004);
  }

  clickOsc('triangle', 720, 0.000, 0.030, 0.18, 0.70);
  clickOsc('square', 2180, 0.004, 0.022, 0.30, 0.86);
  clickOsc('triangle', 4200, 0.011, 0.018, 0.18, 0.94);
  clickOsc('square', 7100, 0.018, 0.012, 0.070, 0.98);
  setTimeout(function () {
    try { out.disconnect(); } catch (_) { }
  }, 160);
}

function clearAudioFadeTimers() {
  if (audioFadeTimer) {
    clearTimeout(audioFadeTimer);
    audioFadeTimer = null;
  }
  cancelAudioElementFadeFrame();
  clearAudioAudibilityRecoveryTimers();
}
function cancelAudioElementFadeFrame() {
  if (audioElementFadeFrame) {
    cancelAnimationFrame(audioElementFadeFrame);
    audioElementFadeFrame = 0;
  }
}
var audioAudibilityRecoveryTimers = [];
function clearAudioAudibilityRecoveryTimers() {
  if (!audioAudibilityRecoveryTimers || !audioAudibilityRecoveryTimers.length) return;
  audioAudibilityRecoveryTimers.forEach(function (timer) { clearTimeout(timer); });
  audioAudibilityRecoveryTimers = [];
}
function currentAudioOutputGain() {
  if (isFinite(audioFadeEnvelope)) return clampRange(targetVolume * audioFadeEnvelope, 0, 1);
  if (audio && isFinite(audio.volume)) return clampRange(Number(audio.volume), 0, 1);
  if (gainNode && gainNode.gain && isFinite(gainNode.gain.value)) return clampRange(Number(gainNode.gain.value), 0, 1);
  return clampRange(targetVolume, 0, 1);
}
function audioSilentFloor() {
  return targetVolume > 0.001 ? AUDIO_SILENCE_GAIN : 0;
}
function normalizeAudioFadeTarget(value) {
  value = clampRange(Number(value) || 0, 0, 1);
  return value <= 0.001 ? audioSilentFloor() : value;
}
function writeAudioOutputGain(value) {
  value = normalizeAudioFadeTarget(value);
  audioFadeEnvelope = targetVolume > 0.001 ? clampRange(value / targetVolume, 0, 1) : (value > 0.001 ? 1 : 0);
  var branchValue = (gainNode && audioCtx) ? Math.sqrt(value) : value;
  if (audio) {
    audio.muted = false;
    audio.volume = branchValue;
  }
  if (typeof aiStemVocalAudio !== 'undefined' && aiStemVocalAudio) {
    try { aiStemVocalAudio.muted = false; aiStemVocalAudio.volume = branchValue; } catch (e) {}
  }
  if (gainNode && audioCtx) {
    try {
      var now = audioCtx.currentTime || 0;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(branchValue, now);
    } catch (e) { }
  }
}
function holdAudioOutputGain(now) {
  var current = currentAudioOutputGain();
  if (!gainNode || !audioCtx || !gainNode.gain) return current;
  var param = gainNode.gain;
  try {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(now);
      return currentAudioOutputGain();
    }
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
  } catch (e) {
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(current, now);
    } catch (_) { }
  }
  return current;
}
function setAudioOutputGainImmediate(value) {
  value = normalizeAudioFadeTarget(value);
  clearAudioFadeTimers();
  writeAudioOutputGain(value);
}
function rampAudioOutputGain(value, durationMs) {
  value = normalizeAudioFadeTarget(value);
  durationMs = Math.max(0, Number(durationMs) || 0);
  clearAudioFadeTimers();
  var serial = audioFadeSerial;
  if (gainNode && audioCtx) holdAudioOutputGain(audioCtx.currentTime || 0);
  if (durationMs <= 0) {
    writeAudioOutputGain(value);
    return;
  }
  var from = currentAudioOutputGain();
  var started = performance.now();
  function tickAudioFade(nowMs) {
    if (serial !== audioFadeSerial) return;
    var t = durationMs ? clampRange((nowMs - started) / durationMs, 0, 1) : 1;
    var eased = 1 - Math.pow(1 - t, 3);
    writeAudioOutputGain(from + (value - from) * eased);
    if (t < 1) audioElementFadeFrame = requestAnimationFrame(tickAudioFade);
    else audioElementFadeFrame = 0;
  }
  audioElementFadeFrame = requestAnimationFrame(tickAudioFade);
}
function isBackgroundAudioFadeConstrained() {
  try {
    if (typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode()) return true;
  } catch (e) { }
  try {
    if (document && document.hidden) return true;
  } catch (e2) { }
  try {
    if (typeof desktopRuntimeState !== 'undefined' && (desktopRuntimeState.minimized || desktopRuntimeState.visible === false)) return true;
  } catch (e3) { }
  return false;
}
function ensureAudiblePlaybackGain(reason) {
  if (!audio || audio.paused || audio.ended || !audio.src) return false;
  if (targetVolume <= 0.001) return false;
  var current = currentAudioOutputGain();
  var floor = Math.max(0.004, targetVolume * 0.10);
  if (current > floor) return false;
  setAudioOutputGainImmediate(targetVolume);
  console.warn('[AudioFade] restored silent playback gain:', reason || 'playback');
  return true;
}
function scheduleAudioAudibilityRecovery(reason) {
  clearAudioAudibilityRecoveryTimers();
  if (targetVolume <= 0.001) return;
  var serial = audioFadeSerial;
  var token = trackSwitchToken;
  [520, 1400, 3200].forEach(function (delay) {
    var timer = setTimeout(function () {
      if (serial !== audioFadeSerial || token !== trackSwitchToken) return;
      ensureAudiblePlaybackGain(reason || 'track-switch');
    }, delay);
    audioAudibilityRecoveryTimers.push(timer);
  });
}
function preparePlaybackFadeIn() {
  audioFadeSerial++;
  setAudioOutputGainImmediate(0);
}
function startPlaybackFadeIn() {
  audioFadeSerial++;
  if (targetVolume <= 0.001) {
    setAudioOutputGainImmediate(0);
    return;
  }
  if (isBackgroundAudioFadeConstrained()) {
    setAudioOutputGainImmediate(targetVolume);
    return;
  }
  rampAudioOutputGain(targetVolume, AUDIO_FADE_IN_MS);
  scheduleAudioAudibilityRecovery('fade-in-watchdog');
}
function restorePlaybackGain() {
  audioFadeSerial++;
  setAudioOutputGainImmediate(targetVolume);
}
function fadeOutAndPauseAudio() {
  if (!audio || audio.paused) return Promise.resolve(false);
  var serial = ++audioFadeSerial;
  rampAudioOutputGain(0, AUDIO_FADE_OUT_MS);
  return new Promise(function (resolve) {
    audioFadeTimer = setTimeout(function () {
      audioFadeTimer = null;
      if (serial !== audioFadeSerial || !audio) {
        resolve(false);
        return;
      }
      try { audio.pause(); } catch (pauseErr) { console.warn('[TogglePlayPause]', pauseErr); }
      setAudioOutputGainImmediate(0);
      resolve(true);
    }, AUDIO_FADE_OUT_MS + 80);
  });
}

function applyVolumeToAudio(opts) {
  opts = opts || {};
  if (opts.restoreEnvelope && targetVolume > 0.001) audioFadeEnvelope = 1;
  writeAudioOutputGain(targetVolume * clampRange(audioFadeEnvelope, 0, 1));
}

function updateVolumeUi() {
  var slider = document.getElementById('volume-slider');
  var value = document.getElementById('volume-value');
  var icon = document.getElementById('volume-icon');
  var wrap = document.getElementById('volume-control');
  var pct = Math.round(targetVolume * 100);
  if (slider && Math.abs(parseFloat(slider.value) - targetVolume) > 0.001) slider.value = targetVolume;
  if (value) value.textContent = pct + '%';
  if (wrap) wrap.classList.toggle('muted', targetVolume <= 0.01);
  if (icon) {
    icon.innerHTML = targetVolume <= 0.01
      ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/>'
      : targetVolume < 0.45
        ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15 10.5a2 2 0 0 1 0 3"/>'
        : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M18 7a7 7 0 0 1 0 10"/>';
  }
  updateAudioFadeUi();
}
function audioFadeSecondsLabel(ms) {
  ms = normalizeAudioFadeMs(ms, 0);
  return (ms / 1000).toFixed(ms % 1000 ? 2 : 1).replace(/0$/, '') + 's';
}
function updateAudioFadeUi() {
  var fadeInSlider = document.getElementById('fade-in-slider');
  var fadeOutSlider = document.getElementById('fade-out-slider');
  var fadeInValue = document.getElementById('fade-in-value');
  var fadeOutValue = document.getElementById('fade-out-value');
  var inSeconds = (AUDIO_FADE_IN_MS / 1000).toFixed(2);
  var outSeconds = (AUDIO_FADE_OUT_MS / 1000).toFixed(2);
  if (fadeInSlider && Math.abs(Number(fadeInSlider.value) - Number(inSeconds)) > 0.001) fadeInSlider.value = inSeconds;
  if (fadeOutSlider && Math.abs(Number(fadeOutSlider.value) - Number(outSeconds)) > 0.001) fadeOutSlider.value = outSeconds;
  if (fadeInValue) fadeInValue.textContent = audioFadeSecondsLabel(AUDIO_FADE_IN_MS);
  if (fadeOutValue) fadeOutValue.textContent = audioFadeSecondsLabel(AUDIO_FADE_OUT_MS);
}
function setAudioFadeSetting(kind, seconds, silent) {
  var ms = normalizeAudioFadeMs(Number(seconds) * 1000, kind === 'in' ? 460 : 420);
  if (kind === 'in') AUDIO_FADE_IN_MS = ms;
  else AUDIO_FADE_OUT_MS = ms;
  saveAudioFadePreference();
  updateAudioFadeUi();
  if (!silent) showToast((kind === 'in' ? '淡入 ' : '淡出 ') + audioFadeSecondsLabel(ms));
}
function crossfadeSecondsLabel(ms) {
  ms = normalizeCrossfadeMs(ms, 0);
  if (ms <= 0) return '关';
  return (ms / 1000).toFixed(ms % 1000 ? 1 : 0) + 's';
}
function updateCrossfadeUi() {
  var toggle = document.getElementById('crossfade-toggle');
  var stateEl = document.getElementById('crossfade-toggle-state');
  var slider = document.getElementById('crossfade-slider');
  var value = document.getElementById('crossfade-value');
  var on = Number(AUDIO_CROSSFADE_MS) > 0;
  // 开:滑块反映当前时长;关:保留滑块当前位置作为记忆时长,不覆盖
  if (on && slider && document.activeElement !== slider) {
    var s = AUDIO_CROSSFADE_MS / 1000;
    if (Math.abs(Number(slider.value) - s) > 0.001) slider.value = s;
  }
  if (slider) slider.disabled = !on;
  if (toggle) { toggle.classList.toggle('on', on); toggle.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  if (stateEl) stateEl.textContent = on ? '开' : '关';
  if (value) value.textContent = on ? crossfadeSecondsLabel(AUDIO_CROSSFADE_MS) : '关';
}
function toggleCrossfade() {
  if (Number(AUDIO_CROSSFADE_MS) > 0) {
    setCrossfadeSetting(0, false);   // 关
  } else {
    var slider = document.getElementById('crossfade-slider');
    var secs = slider ? (Number(slider.value) || 6) : 6;   // 用滑块记忆的时长,默认 6s
    if (!(secs >= 1)) secs = 6;
    setCrossfadeSetting(secs, false);
  }
}
function setCrossfadeSetting(seconds, silent) {
  var prev = AUDIO_CROSSFADE_MS;
  var ms = normalizeCrossfadeMs(Number(seconds) * 1000, 0);
  AUDIO_CROSSFADE_MS = ms;
  saveAudioFadePreference();
  updateCrossfadeUi();
  // 开/关切换时,即时给当前曲目预排/清理下一首预加载,避免要等下一次切歌才生效
  if (prev <= 0 && ms > 0) {
    if (typeof scheduleAlbumGaplessPreloadForCurrent === 'function' && typeof trackSwitchToken !== 'undefined') {
      try { scheduleAlbumGaplessPreloadForCurrent(trackSwitchToken, 'crossfade-enabled'); } catch (e) { }
    }
  } else if (prev > 0 && ms <= 0) {
    if (typeof clearAlbumGaplessPreload === 'function' && !(typeof albumGaplessState !== 'undefined' && albumGaplessState && (albumGaplessState.handoff || (albumGaplessState.preload && albumGaplessState.preload.mixStarted)))) {
      try { clearAlbumGaplessPreload('crossfade-disabled'); } catch (e) { }
    }
  }
  if (!silent) showToast(ms > 0 ? ('交叉淡入 ' + crossfadeSecondsLabel(ms)) : '交叉淡入 关');
}

function setVolume(value, silent) {
  var next = Math.max(0, Math.min(1, Number(value) || 0));
  var previous = targetVolume;
  var shouldRestoreAudibleEnvelope = next > 0.001 && !audioFadeTimer && (previous <= 0.001 || clampRange(audioFadeEnvelope, 0, 1) <= 0.0015);
  targetVolume = next;
  if (next > 0.01) lastNonZeroVolume = next;
  try { localStorage.setItem('apex-player-volume', String(next)); } catch (e) { }
  if (shouldRestoreAudibleEnvelope) cancelAudioElementFadeFrame();
  applyVolumeToAudio({ restoreEnvelope: shouldRestoreAudibleEnvelope });
  updateVolumeUi();
  if (!silent) showToast('音量 ' + Math.round(next * 100) + '%');
}
function adjustVolumeByKeyboard(delta) {
  var step = Number(delta) || 0;
  if (!step) return;
  setVolume(clampRange(targetVolume + step, 0, 1), false);
}
function adjustVolumeByWheel(e) {
  if (!e) return;
  e.preventDefault();
  e.stopPropagation();
  var step = 0.01;
  var direction = e.deltaY < 0 ? 1 : -1;
  var wrap = document.getElementById('volume-control');
  if (wrap) {
    wrap.classList.add('open');
    if (volumeCloseTimer) clearTimeout(volumeCloseTimer);
    volumeCloseTimer = setTimeout(function () {
      volumeCloseTimer = null;
      if (wrap && !wrap.matches(':hover')) wrap.classList.remove('open');
    }, 1200);
  }
  setVolume(clampRange(targetVolume + direction * step, 0, 1), false);
}

function toggleVolumePanel(e) {
  if (e) e.stopPropagation();
  var wrap = document.getElementById('volume-control');
  if (volumeCloseTimer) { clearTimeout(volumeCloseTimer); volumeCloseTimer = null; }
  if (wrap) wrap.classList.toggle('open');
}

function releaseVolumePanelFocus(wrap) {
  wrap = wrap || document.getElementById('volume-control');
  var active = document.activeElement;
  if (!wrap || !active || !wrap.contains(active) || typeof active.blur !== 'function') return;
  try { active.blur(); } catch (e) { }
}

function closeVolumePanel(force) {
  var wrap = document.getElementById('volume-control');
  if (volumeCloseTimer) {
    clearTimeout(volumeCloseTimer);
    volumeCloseTimer = null;
  }
  if (!wrap) return;
  wrap.classList.remove('open');
  releaseVolumePanelFocus(wrap);
  if (force) {
    wrap.classList.add('handoff-closing');
    setTimeout(function () {
      if (wrap && !wrap.classList.contains('sibling-suppressed')) wrap.classList.remove('handoff-closing');
    }, 220);
  } else {
    wrap.classList.remove('handoff-closing');
  }
}

function setVolumePanelSiblingSuppressed(suppressed) {
  var wrap = document.getElementById('volume-control');
  if (!wrap) return;
  if (suppressed) {
    wrap.classList.add('sibling-suppressed');
    closeVolumePanel(true);
  } else {
    wrap.classList.remove('sibling-suppressed', 'handoff-closing');
  }
}

function toggleMute() {
  setVolume(targetVolume > 0.01 ? 0 : (lastNonZeroVolume || 0.8));
}

var playbackSpeed = 1;
function syncSpeedSliderUi() {
  var slider = document.getElementById('speed-slider');
  var val = document.getElementById('speed-value');
  if (slider && document.activeElement !== slider) slider.value = String(playbackSpeed);
  if (val) val.textContent = playbackSpeed.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + '×';
}
// 把当前倍速套到 audio 元素上;每次新建/换 audio 元素后调用,保证提前设好的倍速不丢
function applyPlaybackSpeedToAudio() {
  if (!audio) return;
  var keyShiftActive = !!singingKeyShiftNode;
  function applyToMedia(media) {
    if (!media) return;
    try {
      media.preservesPitch = !keyShiftActive;
      media.mozPreservesPitch = !keyShiftActive;
      media.webkitPreservesPitch = !keyShiftActive;
    } catch (e) {}
    try { media.playbackRate = playbackSpeed; } catch (e) {}
  }
  applyToMedia(audio);
  if (typeof aiStemVocalAudio !== 'undefined' && aiStemVocalAudio) {
    applyToMedia(aiStemVocalAudio);
  }
  updateSingingKeyShiftNodeParameters(singingKeyShiftNode);
}
function setPlaybackSpeed(v, opts) {
  v = Math.min(3, Math.max(0.5, parseFloat(v) || 1));
  playbackSpeed = v;
  applyPlaybackSpeedToAudio();
  // 影子输出元素跟随(syncAudioOutputMirrors 会把 audio.playbackRate 抄给各 mirror)
  if (typeof syncAudioOutputMirrors === 'function') { try { syncAudioOutputMirrors('playback-speed'); } catch (e) {} }
  syncSpeedSliderUi();
  if (!(opts && opts.silent)) showToast('倍速 ' + (v === 1 ? '正常' : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + '×'));
}
function syncSingingModeUi() {
  var btn = document.getElementById('singing-mode-btn');
  if (btn) {
    btn.classList.toggle('active', singingModeEnabled);
    btn.setAttribute('aria-pressed', singingModeEnabled ? 'true' : 'false');
  }
  var wrap = document.getElementById('singing-control');
  if (wrap) wrap.classList.toggle('singing-on', singingModeEnabled);
  syncSingingVocalUi();
  syncSingingKeyShiftUi();
}
function syncSingingVocalUi() {
  var accompanimentSlider = document.getElementById('accompaniment-level-slider');
  var accompanimentValue = document.getElementById('accompaniment-level-value');
  var slider = document.getElementById('vocal-level-slider');
  var val = document.getElementById('vocal-level-value');
  var accompanimentPct = Math.round(singingAccompanimentLevel * 100);
  var pct = Math.round(singingVocalLevel * 100);
  if (accompanimentSlider && document.activeElement !== accompanimentSlider) accompanimentSlider.value = String(singingAccompanimentLevel);
  if (accompanimentValue) accompanimentValue.textContent = accompanimentPct + '%';
  if (slider && document.activeElement !== slider) slider.value = String(singingVocalLevel);
  if (val) val.textContent = pct + '%';
}
function formatSingingKeyShift(value) {
  value = normalizeSingingKeyShift(value);
  return (value > 0 ? '+' : '') + value + ' Key';
}
function syncSingingKeyShiftUi() {
  var value = document.getElementById('singing-key-value');
  if (value) value.textContent = formatSingingKeyShift(singingKeyShift);
  document.querySelectorAll('[data-singing-key-step]').forEach(function (button) {
    var step = Number(button.getAttribute('data-singing-key-step')) || 0;
    var next = singingKeyShift + step;
    button.disabled = next < SINGING_KEY_SHIFT_MIN || next > SINGING_KEY_SHIFT_MAX;
  });
}
function prepareSingingKeyShiftProcessor() {
  if (!audioCtx || !singingKeyShiftProcessingNeeded()) return Promise.resolve(false);
  if (singingKeyShiftWorkletReady(audioCtx)) return Promise.resolve(true);
  var targetCtx = audioCtx;
  var serial = _singingKeyShiftChangeSerial;
  return ensureSingingKeyShiftWorklet(targetCtx).then(function (ok) {
    if (serial !== _singingKeyShiftChangeSerial || audioCtx !== targetCtx || !singingKeyShiftProcessingNeeded()) return false;
    if (!ok) {
      singingKeyShift = 0;
      syncSingingKeyShiftUi();
      applyPlaybackSpeedToAudio();
      showToast('变调组件加载失败，已恢复原调');
      return false;
    }
    rebuildAudioGraphNow();
    return true;
  });
}
function setSingingKeyShift(value, opts) {
  var previousEffective = effectiveSingingKeyShift();
  singingKeyShift = normalizeSingingKeyShift(value);
  var nextEffective = effectiveSingingKeyShift();
  _singingKeyShiftChangeSerial++;
  syncSingingKeyShiftUi();
  if (!singingModeEnabled) {
    if (!(opts && opts.silent)) showToast(formatSingingKeyShift(singingKeyShift) + '，开启唱歌模式后生效');
    return Promise.resolve(false);
  }
  if (!nextEffective) {
    if (previousEffective || singingKeyShiftNode) rebuildAudioGraphNow();
    else applyPlaybackSpeedToAudio();
    if (!(opts && opts.silent)) showToast('已恢复原调');
    return Promise.resolve(true);
  }
  if (!audioCtx || !singingKeyShiftWorkletReady(audioCtx)) {
    var loading = prepareSingingKeyShiftProcessor();
    if (!(opts && opts.silent)) showToast(formatSingingKeyShift(singingKeyShift) + '，正在准备');
    return loading;
  }
  if (!previousEffective || !singingKeyShiftNode) rebuildAudioGraphNow();
  else {
    updateSingingKeyShiftNodeParameters();
    applyPlaybackSpeedToAudio();
  }
  if (!(opts && opts.silent)) showToast(formatSingingKeyShift(singingKeyShift));
  return Promise.resolve(true);
}
function prepareSingingVocalProcessor() {
  if (!audioCtx || !singingVocalProcessingNeeded()) return Promise.resolve(false);
  if (vocalRemoverWorkletReady(audioCtx)) return Promise.resolve(true);
  var targetCtx = audioCtx;
  return ensureVocalRemoverWorklet(targetCtx).then(function (ok) {
    if (ok && audioCtx === targetCtx && singingVocalProcessingNeeded()) rebuildAudioGraphNow();
    return ok;
  });
}
function setSingingAccompanimentLevel(level, opts) {
  var wasProcessing = singingVocalProcessingNeeded();
  level = Math.max(0, Math.min(1, parseFloat(level)));
  if (isNaN(level)) level = 1;
  singingAccompanimentLevel = level;
  if (typeof aiStemPlaybackActive === 'function' && aiStemPlaybackActive()) {
    applyAiStemLevels();
    syncSingingVocalUi();
    if (!(opts && opts.silent)) showToast('伴奏 ' + Math.round(level * 100) + '%');
    return;
  }
  var needsProcessing = singingVocalProcessingNeeded();
  if (singingModeEnabled && wasProcessing !== needsProcessing) {
    rebuildAudioGraphNow();
    if (needsProcessing) prepareSingingVocalProcessor();
  } else if (vocalCutChain) {
    if (vocalCutChain.setLevels) vocalCutChain.setLevels(level, singingVocalLevel);
    else if (vocalCutChain.setLevel) vocalCutChain.setLevel(singingVocalLevel);
  }
  syncSingingVocalUi();
  if (!(opts && opts.silent)) showToast('伴奏 ' + Math.round(level * 100) + '%');
}
// 实时调人声音量。只有双 100% 直通边界变化时才重建音频图。
function setSingingVocalLevel(level, opts) {
  var wasProcessing = singingVocalProcessingNeeded();
  level = Math.max(0, Math.min(1, parseFloat(level)));
  if (isNaN(level)) level = 0;
  singingVocalLevel = level;
  if (typeof aiStemPlaybackActive === 'function' && aiStemPlaybackActive()) {
    applyAiStemLevels();
    syncSingingVocalUi();
    if (!(opts && opts.silent)) showToast('人声 ' + Math.round(level * 100) + '%');
    return;
  }
  var needsProcessing = singingVocalProcessingNeeded();
  if (singingModeEnabled && wasProcessing !== needsProcessing) {
    rebuildAudioGraphNow();
    if (needsProcessing) prepareSingingVocalProcessor();
  } else if (vocalCutChain) {
    try {
      if (vocalCutChain.setLevels) vocalCutChain.setLevels(singingAccompanimentLevel, level);
      else if (vocalCutChain.setLevel) vocalCutChain.setLevel(level);
    } catch (e) {}
  }
  syncSingingVocalUi();
  if (!(opts && opts.silent)) showToast('人声 ' + Math.round(level * 100) + '%');
}
var _graphRebuildTimer = 0;
// 保留 source 强制重接音频图(切换去人声/麦克风接线用)。断连会产生"砰",
// 用主增益斜坡把断点包起来(不用 audio.muted——它本身开关会爆音);连续多次调用自动合并成一次。
function rebuildAudioGraphNow() {
  if (!(audio && audioCtx && audioCtx.state !== 'closed')) return;
  if (gainNode) {
    try {
      var t = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(t);
      gainNode.gain.setValueAtTime(Math.max(0.0001, gainNode.gain.value), t);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);  // 断连前淡出到近零
    } catch (e) {}
  }
  if (_graphRebuildTimer) clearTimeout(_graphRebuildTimer);
  _graphRebuildTimer = setTimeout(function () {
    _graphRebuildTimer = 0;
    audioReady = false;
    initAudio();  // 重接;disconnect 时旧增益已近零→无断连爆音,initAudio 内会新建 gainNode
    if (gainNode) {
      try {
        var t2 = audioCtx.currentTime;
        var tgt = Math.max(0.0001, gainNode.gain.value);
        gainNode.gain.cancelScheduledValues(t2);
        gainNode.gain.setValueAtTime(0.0001, t2);
        gainNode.gain.exponentialRampToValueAtTime(tgt, t2 + 0.02);  // 新图从近零淡入到原音量
      } catch (e) {}
    }
  }, 16);
}
var _singingMicRequestPromise = null;
var _singingMicRequestSerial = 0;
var _singingMicPermissionBlocked = false;
function singingMicShouldRun() {
  // 默认不开麦：唱歌模式只做伴奏/人声混音。只有显式 singingMicEnabled 才申请麦克风。
  if (!singingModeEnabled || !singingMicEnabled || !audio) return false;
  if (typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode()) return false;
  var src = audio.currentSrc || audio.src || '';
  return !!(src && !audio.paused && !audio.ended && !audio.error);
}
function stopMediaStreamTracks(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  try { stream.getTracks().forEach(function (track) { try { track.stop(); } catch (e) { } }); } catch (e) { }
}
function singingMicPermissionDenied(error) {
  var name = String(error && error.name || '').toLowerCase();
  var message = String(error && error.message || error || '').toLowerCase();
  return name === 'notallowederror'
    || name === 'securityerror'
    || name === 'permissiondeniederror'
    || /permission|not allowed|denied/.test(message);
}
function stopSingingMic() {
  stopMediaStreamTracks(micStream);
  micStream = null;
  if (micVisualNode) { try { micVisualNode.disconnect(); } catch (e) { } micVisualNode = null; }
  if (micSource) { try { micSource.disconnect(); } catch (e) { } micSource = null; }
}
function startSingingMic(opts) {
  opts = opts || {};
  if (!singingMicShouldRun()) { stopSingingMic(); return Promise.resolve(false); }
  if (micStream) return Promise.resolve(true);
  if (_singingMicPermissionBlocked) return Promise.resolve(false);
  if (_singingMicRequestPromise) return _singingMicRequestPromise;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    _singingMicPermissionBlocked = true;
    if (!opts.silent) showToast('此环境不支持麦克风');
    return Promise.resolve(false);
  }
  var serial = ++_singingMicRequestSerial;
  var request = navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  }).then(function (stream) {
    if (serial !== _singingMicRequestSerial || !singingMicShouldRun()) {
      stopMediaStreamTracks(stream);
      return false;
    }
    micStream = stream;
    rebuildAudioGraphNow();
    if (!opts.silent) showToast('麦克风已开,开唱吧');
    return true;
  }).catch(function (error) {
    if (serial === _singingMicRequestSerial) {
      if (singingMicPermissionDenied(error)) _singingMicPermissionBlocked = true;
      else console.warn('singing microphone unavailable:', error && (error.message || error));
      micStream = null;
      if (!opts.silent) showToast('麦克风未授权,唱歌律动暂用伴奏驱动');
    }
    return false;
  }).finally(function () {
    if (_singingMicRequestPromise === request) _singingMicRequestPromise = null;
  });
  _singingMicRequestPromise = request;
  return request;
}
function syncSingingMicPowerState(opts) {
  if (!singingMicShouldRun()) { stopSingingMic(); return Promise.resolve(false); }
  return startSingingMic(opts);
}
var _singingPrevLyrics = null;
// 进唱歌模式亮出同步歌词(跟唱),退出时恢复用户原来的歌词偏好(非破坏性)
function ensureSingingLyrics(on) {
  if (typeof fx === 'undefined' || typeof toggleLyricsPanel !== 'function') return;
  if (on) {
    _singingPrevLyrics = !!fx.particleLyrics;
    if (!fx.particleLyrics) toggleLyricsPanel(true);
  } else {
    if (_singingPrevLyrics === false && fx.particleLyrics) toggleLyricsPanel(false);
    _singingPrevLyrics = null;
  }
}
function setSingingMode(on) {
  on = !!on;
  if (on === singingModeEnabled) { syncSingingModeUi(); return; }
  singingModeEnabled = on;
  var needsVocalProcessing = singingVocalProcessingNeeded();
  var needsKeyShiftProcessing = singingKeyShiftProcessingNeeded();
  _singingKeyShiftChangeSerial++;
  // 开/关都强制重建：仅靠“处理边界变化”会漏掉已健康图未挂链、或关闭后残留节点的情况。
  rebuildAudioGraphNow();
  if (on) {
    _singingMicPermissionBlocked = false;
    if (needsVocalProcessing) prepareSingingVocalProcessor();
    if (needsKeyShiftProcessing) prepareSingingKeyShiftProcessor();
    // 默认不开麦；仅当用户显式打开 singingMicEnabled 才申请权限
    if (singingMicEnabled) syncSingingMicPowerState({ silent: false });
    else stopSingingMic();
    ensureSingingLyrics(true);
    showToast(singingMicEnabled
      ? '唱歌模式:伴奏人声混音已开启,正在开麦…'
      : '唱歌模式:伴奏人声混音已开启');
  } else {
    if (typeof setAiStemMode === 'function') setAiStemMode('realtime', { silent: true });
    stopSingingMic();
    ensureSingingLyrics(false);
    showToast('唱歌模式:已关闭');
  }
  syncSingingModeUi();
}
function toggleSingingMode() {
  setSingingMode(!singingModeEnabled);
}
function bindVolumeControls() {
  var slider = document.getElementById('volume-slider');
  var fadeInSlider = document.getElementById('fade-in-slider');
  var fadeOutSlider = document.getElementById('fade-out-slider');
  var btn = document.getElementById('volume-btn');
  var wrap = document.getElementById('volume-control');
  function keepVolumePanelOpen() {
    if (volumeCloseTimer) { clearTimeout(volumeCloseTimer); volumeCloseTimer = null; }
    if (wrap && !wrap.classList.contains('sibling-suppressed')) wrap.classList.add('open');
  }
  function closeVolumePanelSoon() {
    if (volumeCloseTimer) clearTimeout(volumeCloseTimer);
    volumeCloseTimer = setTimeout(function () {
      volumeCloseTimer = null;
      if (wrap) closeVolumePanel(false);
    }, 520);
  }
  if (wrap) {
    wrap.addEventListener('mouseenter', keepVolumePanelOpen);
    wrap.addEventListener('mouseleave', closeVolumePanelSoon);
  }
  if (slider) {
    slider.addEventListener('input', function () { setVolume(slider.value, true); });
    slider.addEventListener('focus', keepVolumePanelOpen);
    slider.addEventListener('blur', closeVolumePanelSoon);
    slider.addEventListener('change', function () { showToast('音量 ' + Math.round(targetVolume * 100) + '%'); });
  }
  if (fadeInSlider) {
    fadeInSlider.addEventListener('input', function () { setAudioFadeSetting('in', fadeInSlider.value, true); });
    fadeInSlider.addEventListener('focus', keepVolumePanelOpen);
    fadeInSlider.addEventListener('blur', closeVolumePanelSoon);
    fadeInSlider.addEventListener('change', function () { setAudioFadeSetting('in', fadeInSlider.value, false); });
  }
  if (fadeOutSlider) {
    fadeOutSlider.addEventListener('input', function () { setAudioFadeSetting('out', fadeOutSlider.value, true); });
    fadeOutSlider.addEventListener('focus', keepVolumePanelOpen);
    fadeOutSlider.addEventListener('blur', closeVolumePanelSoon);
    fadeOutSlider.addEventListener('change', function () { setAudioFadeSetting('out', fadeOutSlider.value, false); });
  }
  var speedSlider = document.getElementById('speed-slider');
  if (speedSlider && !speedSlider._speedBound) {
    speedSlider._speedBound = true;
    speedSlider.addEventListener('input', function () { setPlaybackSpeed(speedSlider.value, { silent: true }); });
    speedSlider.addEventListener('change', function () { setPlaybackSpeed(speedSlider.value, { silent: false }); });
    speedSlider.addEventListener('focus', keepVolumePanelOpen);
    speedSlider.addEventListener('blur', closeVolumePanelSoon);
  }
  var vocalSlider = document.getElementById('vocal-level-slider');
  var accompanimentSlider = document.getElementById('accompaniment-level-slider');
  if (accompanimentSlider && !accompanimentSlider._accompanimentBound) {
    accompanimentSlider._accompanimentBound = true;
    accompanimentSlider.addEventListener('input', function () { setSingingAccompanimentLevel(accompanimentSlider.value, { silent: true }); });
    accompanimentSlider.addEventListener('change', function () { setSingingAccompanimentLevel(accompanimentSlider.value, { silent: false }); });
  }
  if (vocalSlider && !vocalSlider._vocalBound) {
    vocalSlider._vocalBound = true;
    vocalSlider.addEventListener('input', function () { setSingingVocalLevel(vocalSlider.value, { silent: true }); });
    vocalSlider.addEventListener('change', function () { setSingingVocalLevel(vocalSlider.value, { silent: false }); });
  }
  var crossfadeSlider = document.getElementById('crossfade-slider');
  if (crossfadeSlider && !crossfadeSlider._crossfadeBound) {
    crossfadeSlider._crossfadeBound = true;
    crossfadeSlider.addEventListener('input', function () { setCrossfadeSetting(crossfadeSlider.value, true); });
    crossfadeSlider.addEventListener('change', function () { setCrossfadeSetting(crossfadeSlider.value, false); });
    crossfadeSlider.addEventListener('focus', keepVolumePanelOpen);
    crossfadeSlider.addEventListener('blur', closeVolumePanelSoon);
  }
  document.querySelectorAll('[data-singing-key-step]').forEach(function (button) {
    if (button._singingKeyBound) return;
    button._singingKeyBound = true;
    button.addEventListener('click', function () {
      setSingingKeyShift(singingKeyShift + (Number(button.getAttribute('data-singing-key-step')) || 0));
    });
  });
  ['low', 'mid', 'high'].forEach(function (band) {
    var slider = document.getElementById('eq-' + band + '-slider');
    if (!slider || slider._eqBound) return;
    slider._eqBound = true;
    slider.addEventListener('input', function () { setEqBand(band, slider.value, { silent: true }); });
    slider.addEventListener('change', function () { setEqBand(band, slider.value, { silent: false }); });
    slider.addEventListener('focus', keepVolumePanelOpen);
    slider.addEventListener('blur', closeVolumePanelSoon);
  });
  var eqResetBtn = document.getElementById('eq-reset-btn');
  if (eqResetBtn && !eqResetBtn._eqBound) {
    eqResetBtn._eqBound = true;
    eqResetBtn.addEventListener('click', function (e) { e.stopPropagation(); resetEq(); });
  }
  syncEqUi();
  syncSpeedSliderUi();
  syncSingingVocalUi();
  syncSingingKeyShiftUi();
  updateCrossfadeUi();
  if (typeof bindAiStemControls === 'function') bindAiStemControls();
  if (btn) {
    btn.addEventListener('dblclick', function (e) { e.stopPropagation(); toggleMute(); });
  }
  if (wrap && !wrap._wheelBound) {
    wrap._wheelBound = true;
    wrap.addEventListener('wheel', adjustVolumeByWheel, { passive: false });
  }
  document.addEventListener('click', function (e) {
    if (!wrap) return;
    if (!wrap.contains(e.target)) {
      closeVolumePanel(false);
    }
  });
  updateVolumeUi();
  updateAudioFadeUi();
  applyVolumeToAudio();
}

// ============================================================
//  播放队列
