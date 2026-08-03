// ============================================================
//  手势推理 Worker — HandLandmarker 的 detectForVideo 搬到 Worker 线程
//  · 主线程零阻塞:主线程只送 ImageBitmap(transfer 所有权),Worker 回传 landmarks
//  · module worker:vendor 是 ESM(vision_bundle.mjs 带 export),classic worker 的
//    importScripts 会在 export 处抛 SyntaxError,只能走 { type:'module' } + 动态 import
//  · delegate 顺序由主线程按平台传入(mac 优先 CPU 让出 GPU 给 three.js);首选失败自动降级到下一个
//  · 常驻:detect 异常只回报不 throw,worker 不退出
// ============================================================

// MediaPipe tasks-vision 的 wasm 加载器在 worker 内用 importScripts() 加载 Emscripten
// glue(vision_wasm_internal.js)。module worker 里 importScripts 虽存在但一调用即抛
// "Module scripts don't support importScripts()",故无条件用同步 XHR + 全局 eval 覆盖
// (worker 内同步 XHR 合法;不覆盖则 GPU/CPU 委托都无法初始化)。
self.importScripts = function () {
  for (let i = 0; i < arguments.length; i++) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', arguments[i], false);
    xhr.send(null);
    if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) {
      throw new Error('importScripts polyfill failed: ' + arguments[i] + ' -> ' + xhr.status);
    }
    (0, eval)(xhr.responseText);
  }
};

let FilesetResolver = null;
let HandLandmarker = null;
let landmarker = null;

self.onmessage = async function (ev) {
  const msg = ev.data;
  if (!msg) return;

  // ---- init: 加载 vendor(绝对 URL 由主线程算好传入)+ 建 HandLandmarker ----
  if (msg.type === 'init') {
    try {
      const vision = await import(msg.vendorBase + 'vision_bundle.mjs');
      FilesetResolver = vision.FilesetResolver;
      HandLandmarker = vision.HandLandmarker;
      const fileset = await FilesetResolver.forVisionTasks(msg.vendorBase + 'wasm');
      // delegate 顺序 + 手数由主线程按平台/开关算好传入;缺省回退到旧行为(GPU 优先 + 双手)
      const delegates = (Array.isArray(msg.delegates) && msg.delegates.length) ? msg.delegates : ['GPU', 'CPU'];
      const numHands = msg.numHands || 2;
      let lastErr = null, chosen = '';
      for (let d = 0; d < delegates.length; d++) {
        try {
          landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: msg.vendorBase + 'hand_landmarker.task', delegate: delegates[d] },
            runningMode: 'VIDEO',
            numHands: numHands,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          });
          chosen = delegates[d];
          break;
        } catch (e) { lastErr = e; }
      }
      if (!landmarker) throw lastErr || new Error('hand landmarker unavailable');
      self.postMessage({ type: 'ready', delegate: chosen });
    } catch (e) {
      self.postMessage({ type: 'init-error', message: String((e && e.message) || e) });
    }
    return;
  }

  // ---- frame: 收 ImageBitmap(已 transfer)→ 推理 → 回传 landmarks → 关 bitmap ----
  if (msg.type === 'frame') {
    const bmp = msg.bitmap;
    if (!landmarker) { try { bmp.close(); } catch (e) { } return; }
    const t0 = performance.now();
    try {
      const res = landmarker.detectForVideo(bmp, msg.ts);
      const inferMs = performance.now() - t0;
      // 只回传 handleGestureResults 实际消费的字段(仅 landmarks;handedness 语义层未用)
      self.postMessage({ type: 'result', landmarks: (res && res.landmarks) || [], ts: msg.ts, inferMs: inferMs });
    } catch (e) {
      self.postMessage({ type: 'detect-error', message: String((e && e.message) || e) });
    } finally {
      try { bmp.close(); } catch (e) { }   // 无论成败都释放,避免 ImageBitmap 泄漏
    }
    return;
  }

  // ---- stop: 关模型(terminate 已足够,这里是显式回收路径的补充)----
  if (msg.type === 'stop') {
    try { if (landmarker && landmarker.close) landmarker.close(); } catch (e) { }
    landmarker = null;
    return;
  }
};
