// ============================================================
function audioGraphHealthy() {
  return !!(audio && audioReady && audioCtx && audioCtx.state !== 'closed' && source && analyser && beatAnalyser && (gainNode || analysisSinkNode));
}
function disconnectAudioGraphNodes(keepSource) {
  [source, analyser, beatAnalyser, gainNode, analysisSinkNode].forEach(function (node) {
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
  audioReady = false;
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
  var sourceUsesCapture = !!(source && source.__mineradioUsesCapture);
  disconnectAudioGraphNodes(!sourceUsesCapture);
  if (sourceUsesCapture) audio.__mineradioMediaSourceBound = false;
}
var MIC_VISUAL_GAIN = 3.0;  // 麦克风信号进可视化分析器前的提亮倍数(嗓音常偏小)

// ── 频谱级去人声 AudioWorklet 处理器 ──
// STFT(2048/HOP512,Hann,75% 叠加)逐频率格判断“居中成分”并按 level 扣除。
// mask = |side| / (|side|+|mid|):声像两侧保留、居中(人声)压掉;
// 实际应用 = level + (1-level)*mask,level=1 原声、level=0 全去人声。单路,无双路延迟错配。
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
    this.maskPrev = new Float32Array(N); for (var mk = 0; mk < N; mk++) this.maskPrev[mk] = 1;  // 掩码时间平滑状态
    this.maskAlpha = 0.6;  // 时间平滑系数:越大越平滑(水声越少),响应越慢
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
    var initLv = options && options.processorOptions && typeof options.processorOptions.level === 'number' ? options.processorOptions.level : 0;
    this.level = Math.max(0, Math.min(1, initLv));
    this.port.onmessage = (e) => { if (e.data && typeof e.data.level === 'number') this.level = Math.max(0, Math.min(1, e.data.level)); };
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
    var N = this.N, win = this.win, lv = this.level, keepBin = this.lowKeepBin, a = this.maskAlpha, ia = 1 - this.maskAlpha, mp = this.maskPrev;
    for (var i = 0; i < N; i++) { this.re1[i] = this.inL[i] * win[i]; this.im1[i] = 0; this.re2[i] = this.inR[i] * win[i]; this.im2[i] = 0; }
    this.fft(this.re1, this.im1, false);
    this.fft(this.re2, this.im2, false);
    for (var b = 0; b < N; b++) {
      var lr = this.re1[b], li = this.im1[b], rr = this.re2[b], ri = this.im2[b];
      var mr = (lr + rr) * 0.5, mi = (li + ri) * 0.5;
      var sr = (lr - rr) * 0.5, si = (li - ri) * 0.5;
      var mMag = Math.sqrt(mr * mr + mi * mi), sMag = Math.sqrt(sr * sr + si * si);
      var rawMask;
      var fb = b <= (N >> 1) ? b : (N - b);   // 折叠到 0..N/2
      if (fb <= keepBin) {
        rawMask = 1;   // 低频(贝斯/底鼓)整段保留,不动律动冲击
      } else {
        var ratio = Math.min(1, sMag / (mMag + 1e-9));
        rawMask = Math.pow(ratio, 1.4);   // 居中(人声)→0 压掉,声像两侧→1 保留
      }
      // 掩码时间平滑(逐帧 IIR):压掉逐帧乱跳造成的 musical noise(水声/金属声)
      var mask = a * mp[b] + ia * rawMask;
      mp[b] = mask;
      var applied = lv + (1 - lv) * mask;
      this.re1[b] = lr * applied; this.im1[b] = li * applied;
      this.re2[b] = rr * applied; this.im2[b] = ri * applied;
    }
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
function ensureVocalRemoverWorklet(ctx) {
  if (!ctx || !ctx.audioWorklet) return Promise.resolve(false);
  if (_vocalWorkletCtx === ctx) return Promise.resolve(true);
  if (_vocalWorkletPromise && _vocalWorkletPromise._ctx === ctx) return _vocalWorkletPromise;
  var url;
  try { url = URL.createObjectURL(new Blob([VOCAL_REMOVER_PROCESSOR_SRC], { type: 'application/javascript' })); }
  catch (e) { return Promise.resolve(false); }
  var p = ctx.audioWorklet.addModule(url).then(function () {
    _vocalWorkletCtx = ctx; try { URL.revokeObjectURL(url); } catch (e) {} return true;
  }).catch(function (err) {
    console.warn('vocal remover worklet load failed:', err && (err.message || err));
    try { URL.revokeObjectURL(url); } catch (e) {} return false;
  });
  p._ctx = ctx; _vocalWorkletPromise = p; return p;
}
function buildVocalCutChainWorklet(ctx) {
  var node = new AudioWorkletNode(ctx, 'vocal-remover-processor', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
    channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete',
    processorOptions: { level: singingVocalLevel }
  });
  return {
    input: node, output: node,
    setLevel: function (l) { try { node.port.postMessage({ level: l }); } catch (e) {} }
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
  var dry = ctx.createGain(); dry.gain.value = singingVocalLevel;       // 原声(含人声)
  var wet = ctx.createGain(); wet.gain.value = 1 - singingVocalLevel;   // 去人声
  input.connect(dry);
  cut.output.connect(wet);
  var output = ctx.createGain();
  dry.connect(output); wet.connect(output);
  return {
    input: input, output: output,
    setLevel: function (l) { dry.gain.value = l; wet.gain.value = 1 - l; }
  };
}
// 有 worklet 用频谱级(单路,内部按 level 调),否则回退双段 biquad(dry/wet 混)
function buildVocalCutChain(ctx) {
  if (_vocalWorkletCtx === ctx && typeof AudioWorkletNode !== 'undefined') {
    try { return buildVocalCutChainWorklet(ctx); } catch (e) { }
  }
  return buildVocalCutChainBiquad(ctx);
}
function initAudio() {
  if (!audio) return false;
  if (audioGraphHealthy()) return true;
  var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return false;
  if (audioCtx && audioCtx.state === 'closed') replaceAudioElementForGraphRecovery('closed-context');
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContextCtor();
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
      if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContextCtor();
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
  source.connect(beatAnalyser);  // beatAnalyser 始终读全混音,节拍更稳
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
  if (singingModeEnabled && !sourceUsesCapture) {
    // 可调原唱:source → 去人声链(worklet 频谱级,内部按 level 调;biquad 为回退)→ analyser → 输出。
    // 捕获流(mono 回退)不做去人声。麦克风不进这条输出链,只驱动 beatAnalyser/_voxAnalyser。
    vocalCutChain = buildVocalCutChain(audioCtx);
    if (vocalCutChain.setLevel) vocalCutChain.setLevel(singingVocalLevel);
    source.connect(vocalCutChain.input);
    vocalCutChain.output.connect(analyser);
  } else {
    vocalCutChain = null;
    source.connect(analyser);
  }
  if (gainNode) {
    analyser.connect(gainNode);
    gainNode.connect(audioCtx.destination);
  } else if (analysisSinkNode) {
    analyser.connect(analysisSinkNode);
    analysisSinkNode.connect(audioCtx.destination);
  }
  applyVolumeToAudio();
  frequencyData.fill(0);
  beatFrequencyData.fill(0);
  beatTimeDomainData.fill(128);
  resetRealtimeBeatEngine();
  audioReady = true;
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
  // preservesPitch 在 Chromium 默认 true(变速不变调),这里显式置一遍更稳
  try { audio.preservesPitch = true; audio.mozPreservesPitch = true; audio.webkitPreservesPitch = true; } catch (e) {}
  try { audio.playbackRate = playbackSpeed; } catch (e) {}
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
}
function syncSingingVocalUi() {
  var slider = document.getElementById('vocal-level-slider');
  var val = document.getElementById('vocal-level-value');
  var pct = Math.round(singingVocalLevel * 100);
  if (slider && document.activeElement !== slider) slider.value = String(singingVocalLevel);
  if (val) val.textContent = pct + '%';
}
// 实时调原唱人声占比(1=原唱满,0=纯伴奏),直接改 dry/wet 增益,不重建音频图
function setSingingVocalLevel(level, opts) {
  level = Math.max(0, Math.min(1, parseFloat(level)));
  if (isNaN(level)) level = 0;
  singingVocalLevel = level;
  if (vocalCutChain && vocalCutChain.setLevel) { try { vocalCutChain.setLevel(level); } catch (e) {} }
  syncSingingVocalUi();
  if (!(opts && opts.silent)) showToast('原唱 ' + Math.round(level * 100) + '%');
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
async function startSingingMic() {
  if (micStream) { rebuildAudioGraphNow(); return true; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showToast('此环境不支持麦克风'); return false; }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
  } catch (e) {
    micStream = null;
    showToast('麦克风未授权,唱歌律动暂用伴奏驱动');
    return false;
  }
  if (!singingModeEnabled) { stopSingingMic(); return false; }  // 拿到权限前用户已关掉
  rebuildAudioGraphNow();  // 把嗓音接进可视化混音总线
  showToast('麦克风已开,开唱吧');
  return true;
}
function stopSingingMic() {
  if (micStream) { try { micStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { } }
  micStream = null;
  if (micSource) { try { micSource.disconnect(); } catch (e) { } micSource = null; }
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
  if (on) {
    rebuildAudioGraphNow();  // 先用 biquad 立即去人声
    if (audioCtx) ensureVocalRemoverWorklet(audioCtx).then(function (ok) { if (ok && singingModeEnabled) rebuildAudioGraphNow(); });  // worklet 就绪后重建成频谱级
    startSingingMic();       // 异步:拿到麦克风后再重建,把嗓音接进律动
    ensureSingingLyrics(true);
    showToast('唱歌模式:已压低原唱,正在开麦…');
  } else {
    stopSingingMic();
    rebuildAudioGraphNow();  // 移除去人声与麦克风,恢复原声
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
  if (vocalSlider && !vocalSlider._vocalBound) {
    vocalSlider._vocalBound = true;
    vocalSlider.addEventListener('input', function () { setSingingVocalLevel(vocalSlider.value, { silent: true }); });
    vocalSlider.addEventListener('change', function () { setSingingVocalLevel(vocalSlider.value, { silent: false }); });
  }
  syncSpeedSliderUi();
  syncSingingVocalUi();
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
