// ============================================================
//  手势可视化 / 自定义手部模型
//  - 与摄像头采集、MediaPipe 推理、透视背景完全解耦
//  - 内置低 draw-call 关键点模型；自定义 GLB/GLTF 只跟随整只手
//  - 自定义文件仅存 IndexedDB，不读取任意本地路径或外部资源
// ============================================================
(function () {
  'use strict';

  var HAND_MODEL_DB = 'mineradio-hand-models-v1';
  var HAND_MODEL_STORE = 'models';
  var HAND_MODEL_SELECTION_KEY = 'mineradio-hand-model-selection-v1';
  var HAND_MODEL_SCALE_KEY = 'mineradio-hand-model-scale-v1';
  var HAND_MODEL_MAX_FILE_BYTES = 32 * 1024 * 1024;
  var HAND_MODEL_MAX_TOTAL_BYTES = 96 * 1024 * 1024;
  var HAND_MODEL_MAX_CUSTOM_COUNT = 8;
  var HAND_MODEL_MAX_TRIANGLES = 350000;
  var HAND_MODEL_MAX_DRAW_CALLS = 192;
  var HAND_MODEL_MAX_NODES = 512;
  var HAND_MODEL_MAX_MESHES = 128;
  var HAND_MODEL_MAX_MATERIALS = 96;
  var HAND_MODEL_MAX_IMAGES = 24;
  var HAND_MODEL_MAX_TEXTURES = 48;
  var HAND_MODEL_MAX_SAMPLERS = 48;
  var HAND_MODEL_MAX_BUFFERS = 64;
  var HAND_MODEL_MAX_SCENES = 4;
  var HAND_MODEL_MAX_CAMERAS = 16;
  var HAND_MODEL_MAX_TEXTURE_EDGE = 4096;
  var HAND_MODEL_MAX_TOTAL_TEXTURE_PIXELS = 20 * 1024 * 1024;
  var HAND_MODEL_MAX_ACCESSORS = 1024;
  var HAND_MODEL_MAX_BUFFER_VIEWS = 1024;
  var HAND_MODEL_MAX_ACCESSOR_ELEMENTS = 4000000;
  var HAND_MODEL_MAX_DECLARED_BYTES = 128 * 1024 * 1024;
  var HAND_MODEL_MAX_SKINS = 16;
  var HAND_MODEL_MAX_JOINTS = 128;
  var HAND_MODEL_MAX_MORPH_TARGETS = 8;
  var HAND_MODEL_IMAGE_HEADER_BYTES = 192 * 1024;

  var HAND_MODEL_BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17],
  ];

  var HAND_MODEL_BUILTINS = [
    { id: 'builtin:aurora', name: '流光骨架', note: '经典', style: 'aurora' },
    { id: 'builtin:crystal', name: '晶体手', note: '3D', style: 'crystal' },
    { id: 'builtin:chrome', name: '液态金属', note: 'MIT 实体手', style: 'chrome', asset: 'generic-hand' },
    { id: 'builtin:stardust', name: '星尘关节', note: '轻量', style: 'stardust' },
    { id: 'builtin:none', name: '隐藏模型', note: '仅交互', style: 'none' },
  ];

  var handModelDbPromise = null;
  var handModelRecords = [];
  var handModelSelectedId = readStoredSelection();
  var handModelScale = readStoredScale();
  var handModelLoadGeneration = 0;
  var handModelBusy = false;
  var handModelInitializationPromise = null;

  var handModelCanvas = null;
  var handModelRenderer = null;
  var handModelScene = null;
  var handModelCamera = null;
  var handModelSceneRoot = null;
  var handModelBuiltInRoot = null;
  var handModelBuiltInRigs = [];
  var handModelBuiltInStyle = '';
  var handModelCustomTemplate = null;
  var handModelCustomObjects = [];
  var handModelCustomReadyId = '';
  var handModelAssetObjects = [];
  var handModelAssetReadyStyle = '';
  var handModelAssetGeneration = 0;
  var handModelRendererFailed = false;
  var handModelLastWidth = 0;
  var handModelLastHeight = 0;
  var handModelMatrix = null;
  var handModelQuaternion = null;
  var handModelUpAxis = null;
  var handModelPointA = null;
  var handModelPointB = null;
  var handModelDelta = null;
  var handModelBox = null;
  var handModelSize = null;
  var handModelCenter = null;

  function handModelSafeToast(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  function handModelSetStatus(message, isError) {
    var node = document.getElementById('hand-model-status');
    if (!node) return;
    node.textContent = String(message || '');
    node.classList.toggle('error', !!isError);
  }

  function readStoredSelection() {
    try {
      var value = String(localStorage.getItem(HAND_MODEL_SELECTION_KEY) || 'builtin:aurora');
      return /^(builtin:[a-z-]+|custom:[a-zA-Z0-9_-]+)$/.test(value) ? value : 'builtin:aurora';
    } catch (e) {
      return 'builtin:aurora';
    }
  }

  function readStoredScale() {
    try {
      var value = Number(localStorage.getItem(HAND_MODEL_SCALE_KEY));
      return isFinite(value) ? Math.max(0.55, Math.min(2.2, value)) : 1;
    } catch (e) {
      return 1;
    }
  }

  function writeStoredSelection(id) {
    try { localStorage.setItem(HAND_MODEL_SELECTION_KEY, id); } catch (e) { }
  }

  function writeStoredScale(value) {
    try { localStorage.setItem(HAND_MODEL_SCALE_KEY, String(value)); } catch (e) { }
  }

  function handModelCleanName(value) {
    var name = String(value || '自定义手部模型').replace(/[\\/]+/g, ' ').replace(/[\u0000-\u001f\u007f]+/g, '').trim();
    if (!name) name = '自定义手部模型';
    return name.slice(0, 80);
  }

  function handModelFormatBytes(bytes) {
    var value = Math.max(0, Number(bytes) || 0);
    if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + ' KB';
    return (value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1) + ' MB';
  }

  function handModelOpenDb() {
    if (handModelDbPromise) return handModelDbPromise;
    handModelDbPromise = new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('当前环境不支持模型本地存储'));
        return;
      }
      var request = indexedDB.open(HAND_MODEL_DB, 1);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(HAND_MODEL_STORE)) db.createObjectStore(HAND_MODEL_STORE, { keyPath: 'id' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('模型库打开失败')); };
    });
    return handModelDbPromise;
  }

  async function handModelReadAll() {
    var db = await handModelOpenDb();
    return new Promise(function (resolve, reject) {
      var request = db.transaction(HAND_MODEL_STORE, 'readonly').objectStore(HAND_MODEL_STORE).getAll();
      request.onsuccess = function () { resolve(Array.isArray(request.result) ? request.result : []); };
      request.onerror = function () { reject(request.error || new Error('读取模型库失败')); };
    });
  }

  async function handModelPut(record) {
    var db = await handModelOpenDb();
    return new Promise(function (resolve, reject) {
      var request = db.transaction(HAND_MODEL_STORE, 'readwrite').objectStore(HAND_MODEL_STORE).put(record);
      request.onsuccess = function () { resolve(true); };
      request.onerror = function () { reject(request.error || new Error('模型保存失败')); };
    });
  }

  async function handModelDeleteRecord(id) {
    var db = await handModelOpenDb();
    return new Promise(function (resolve, reject) {
      var request = db.transaction(HAND_MODEL_STORE, 'readwrite').objectStore(HAND_MODEL_STORE).delete(id);
      request.onsuccess = function () { resolve(true); };
      request.onerror = function () { reject(request.error || new Error('模型删除失败')); };
    });
  }

  function handModelDecodeJson(bytes) {
    var text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    text = text.replace(/^\uFEFF/, '').replace(/\u0000+$/g, '').trim();
    if (!text || text.charAt(0) !== '{') throw new Error('GLTF_JSON_INVALID');
    try { return JSON.parse(text); } catch (error) { throw new Error('GLTF_JSON_INVALID'); }
  }

  function handModelReadGlbPayload(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength < 20) throw new Error('GLB_HEADER_INVALID');
    var view = new DataView(arrayBuffer);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('GLB_MAGIC_INVALID');
    if (view.getUint32(4, true) !== 2) throw new Error('GLB_VERSION_UNSUPPORTED');
    var declaredLength = view.getUint32(8, true);
    if (declaredLength !== arrayBuffer.byteLength) throw new Error('GLB_LENGTH_INVALID');
    var offset = 12;
    var json = null;
    var binaryOffset = -1;
    var binaryLength = 0;
    var chunkIndex = 0;
    while (offset + 8 <= declaredLength) {
      var chunkLength = view.getUint32(offset, true);
      var chunkType = view.getUint32(offset + 4, true);
      offset += 8;
      if (chunkLength % 4 !== 0 || offset + chunkLength > declaredLength) throw new Error('GLB_CHUNK_INVALID');
      if (chunkIndex === 0 && chunkType !== 0x4e4f534a) throw new Error('GLB_JSON_MUST_BE_FIRST');
      if (chunkType === 0x4e4f534a) {
        if (json !== null || chunkIndex !== 0) throw new Error('GLB_JSON_DUPLICATE');
        json = handModelDecodeJson(new Uint8Array(arrayBuffer, offset, chunkLength));
      } else if (chunkType === 0x004e4942) {
        if (binaryOffset >= 0 || chunkIndex !== 1) throw new Error('GLB_BIN_DUPLICATE_OR_OUT_OF_ORDER');
        binaryOffset = offset;
        binaryLength = chunkLength;
      } else {
        throw new Error('GLB_CHUNK_UNSUPPORTED');
      }
      offset += chunkLength;
      chunkIndex++;
    }
    if (offset !== declaredLength || !json) throw new Error('GLB_JSON_MISSING');
    return { document: json, arrayBuffer: arrayBuffer, binaryOffset: binaryOffset, binaryLength: binaryLength };
  }

  function handModelBufferDataUriAllowed(uri) {
    return /^data:application\/(?:octet-stream|gltf-buffer);base64,[a-z0-9+/=\r\n]+$/i.test(String(uri || ''));
  }

  function handModelImageDataUriAllowed(uri) {
    return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(String(uri || ''));
  }

  function handModelDataUriDecodedLength(uri) {
    var encoded = String(uri || '').slice(String(uri || '').indexOf(',') + 1).replace(/[\r\n]/g, '');
    var padding = encoded.endsWith('==') ? 2 : (encoded.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor(encoded.length * 3 / 4) - padding);
  }

  function handModelDataUriPrefix(uri) {
    var raw = String(uri || '');
    var comma = raw.indexOf(',');
    if (comma < 0) throw new Error('纹理 data URI 无效');
    var encoded = raw.slice(comma + 1).replace(/[\r\n]/g, '');
    var take = Math.min(encoded.length, Math.ceil(HAND_MODEL_IMAGE_HEADER_BYTES / 3) * 4);
    take -= take % 4;
    var decoded;
    try { decoded = atob(encoded.slice(0, take)); } catch (error) { throw new Error('纹理 base64 无效'); }
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i) & 255;
    return bytes;
  }

  function handModelReadU24LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  }

  function handModelImageDimensions(bytes, mime) {
    mime = String(mime || '').toLowerCase();
    if (mime === 'image/png') {
      if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) throw new Error('PNG 纹理头无效');
      var png = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: png.getUint32(16, false), height: png.getUint32(20, false) };
    }
    if (mime === 'image/jpeg') {
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('JPEG 纹理头无效');
      var cursor = 2;
      var sof = { 0xc0: 1, 0xc1: 1, 0xc2: 1, 0xc3: 1, 0xc5: 1, 0xc6: 1, 0xc7: 1, 0xc9: 1, 0xca: 1, 0xcb: 1, 0xcd: 1, 0xce: 1, 0xcf: 1 };
      while (cursor + 9 < bytes.length) {
        while (cursor < bytes.length && bytes[cursor] !== 0xff) cursor++;
        while (cursor < bytes.length && bytes[cursor] === 0xff) cursor++;
        if (cursor >= bytes.length) break;
        var marker = bytes[cursor++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
        if (cursor + 1 >= bytes.length) break;
        var segmentLength = (bytes[cursor] << 8) | bytes[cursor + 1];
        if (segmentLength < 2 || cursor + segmentLength > bytes.length) break;
        if (sof[marker] && segmentLength >= 7) {
          return {
            width: (bytes[cursor + 5] << 8) | bytes[cursor + 6],
            height: (bytes[cursor + 3] << 8) | bytes[cursor + 4],
          };
        }
        cursor += segmentLength;
      }
      throw new Error('JPEG 纹理尺寸不可读或头部过大');
    }
    if (mime === 'image/webp') {
      if (bytes.length < 30 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'RIFF'
        || String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== 'WEBP') throw new Error('WebP 纹理头无效');
      var chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (chunk === 'VP8X') return { width: handModelReadU24LE(bytes, 24) + 1, height: handModelReadU24LE(bytes, 27) + 1 };
      if (chunk === 'VP8L' && bytes[20] === 0x2f) {
        return {
          width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
          height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6)),
        };
      }
      if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
      }
      throw new Error('WebP 纹理尺寸不可读');
    }
    throw new Error('仅支持 PNG、JPEG 或 WebP 模型纹理');
  }

  function handModelValidateImage(image, index, doc, format, payload, bufferViews) {
    var mime = String(image && image.mimeType || '');
    var bytes = null;
    if (image && image.uri) {
      if (!handModelImageDataUriAllowed(image.uri)) throw new Error('模型纹理必须内嵌，不能读取外部路径或网址');
      var mimeMatch = /^data:(image\/(?:png|jpeg|webp));base64,/i.exec(String(image.uri));
      if (!mimeMatch) throw new Error('模型纹理 data URI 类型无效');
      mime = mimeMatch[1].toLowerCase();
      bytes = handModelDataUriPrefix(image.uri);
    } else if (image && Number.isInteger(image.bufferView)) {
      if (format !== 'glb' || !payload || payload.binaryOffset < 0) throw new Error('GLTF 纹理请直接内嵌为 data URI，或导出自包含 GLB');
      var view = bufferViews[image.bufferView];
      if (!view || Number(view.buffer || 0) !== 0) throw new Error('模型纹理 bufferView 无效');
      var offset = payload.binaryOffset + (Number(view.byteOffset) || 0);
      var length = Math.min(Number(view.byteLength) || 0, HAND_MODEL_IMAGE_HEADER_BYTES);
      if (length <= 0 || offset < payload.binaryOffset || offset + length > payload.binaryOffset + payload.binaryLength) throw new Error('模型纹理超出 GLB 二进制范围');
      bytes = new Uint8Array(payload.arrayBuffer, offset, length);
    } else {
      throw new Error('模型纹理 ' + (index + 1) + ' 没有内嵌数据');
    }
    if (!/^image\/(png|jpeg|webp)$/i.test(mime)) throw new Error('仅支持 PNG、JPEG 或 WebP 模型纹理');
    var dimensions = handModelImageDimensions(bytes, mime);
    if (!dimensions.width || !dimensions.height || dimensions.width > HAND_MODEL_MAX_TEXTURE_EDGE || dimensions.height > HAND_MODEL_MAX_TEXTURE_EDGE) {
      throw new Error('模型纹理边长不能超过 ' + HAND_MODEL_MAX_TEXTURE_EDGE + ' 像素');
    }
    return dimensions;
  }

  function handModelValidateNodeGraph(nodes, scenes) {
    var state = new Uint8Array(nodes.length);
    var parentCount = new Uint16Array(nodes.length);
    function visit(index) {
      if (!Number.isInteger(index) || index < 0 || index >= nodes.length) throw new Error('模型节点引用无效');
      if (state[index] === 1) throw new Error('模型节点不能循环引用');
      if (state[index] === 2) return;
      state[index] = 1;
      var children = Array.isArray(nodes[index] && nodes[index].children) ? nodes[index].children : [];
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (!Number.isInteger(child) || child < 0 || child >= nodes.length) throw new Error('模型节点引用无效');
        parentCount[child]++;
        if (parentCount[child] > 1) throw new Error('模型节点不能被多个父节点复用；请导出单一树形场景');
        visit(child);
      }
      state[index] = 2;
    }
    for (var i = 0; i < nodes.length; i++) visit(i);
    var rootUse = new Uint8Array(nodes.length);
    scenes.forEach(function (scene) {
      var roots = Array.isArray(scene && scene.nodes) ? scene.nodes : [];
      if (roots.length > nodes.length) throw new Error('模型场景根节点过多');
      roots.forEach(function (root) {
        if (!Number.isInteger(root) || root < 0 || root >= nodes.length) throw new Error('模型场景根节点引用无效');
        if (parentCount[root]) throw new Error('模型场景根节点不能同时作为子节点');
        rootUse[root]++;
        if (rootUse[root] > 1) throw new Error('模型场景不能重复复用同一根节点');
      });
    });
  }

  function handModelValidateDocument(doc, format, payload) {
    if (!doc || typeof doc !== 'object' || !doc.asset || !/^2(?:\.|$)/.test(String(doc.asset.version || ''))) {
      throw new Error('仅支持 glTF 2.x 模型');
    }
    var nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
    var meshes = Array.isArray(doc.meshes) ? doc.meshes : [];
    var materials = Array.isArray(doc.materials) ? doc.materials : [];
    var images = Array.isArray(doc.images) ? doc.images : [];
    var textures = Array.isArray(doc.textures) ? doc.textures : [];
    var samplers = Array.isArray(doc.samplers) ? doc.samplers : [];
    var buffers = Array.isArray(doc.buffers) ? doc.buffers : [];
    var accessors = Array.isArray(doc.accessors) ? doc.accessors : [];
    var bufferViews = Array.isArray(doc.bufferViews) ? doc.bufferViews : [];
    var skins = Array.isArray(doc.skins) ? doc.skins : [];
    var animations = Array.isArray(doc.animations) ? doc.animations : [];
    var scenes = Array.isArray(doc.scenes) ? doc.scenes : [];
    var cameras = Array.isArray(doc.cameras) ? doc.cameras : [];
    if (nodes.length > HAND_MODEL_MAX_NODES) throw new Error('模型节点超过 ' + HAND_MODEL_MAX_NODES + ' 个');
    if (meshes.length > HAND_MODEL_MAX_MESHES) throw new Error('模型网格超过 ' + HAND_MODEL_MAX_MESHES + ' 个');
    if (materials.length > HAND_MODEL_MAX_MATERIALS) throw new Error('模型材质超过 ' + HAND_MODEL_MAX_MATERIALS + ' 个');
    if (images.length > HAND_MODEL_MAX_IMAGES) throw new Error('模型纹理超过 ' + HAND_MODEL_MAX_IMAGES + ' 张');
    if (textures.length > HAND_MODEL_MAX_TEXTURES) throw new Error('模型纹理引用超过 ' + HAND_MODEL_MAX_TEXTURES + ' 个');
    if (samplers.length > HAND_MODEL_MAX_SAMPLERS) throw new Error('模型采样器超过 ' + HAND_MODEL_MAX_SAMPLERS + ' 个');
    if (buffers.length > HAND_MODEL_MAX_BUFFERS) throw new Error('模型缓冲区超过 ' + HAND_MODEL_MAX_BUFFERS + ' 个');
    if (!scenes.length || scenes.length > HAND_MODEL_MAX_SCENES) throw new Error('模型场景数量必须为 1 至 ' + HAND_MODEL_MAX_SCENES + ' 个');
    if (cameras.length > HAND_MODEL_MAX_CAMERAS) throw new Error('模型相机超过 ' + HAND_MODEL_MAX_CAMERAS + ' 个');
    if (accessors.length > HAND_MODEL_MAX_ACCESSORS) throw new Error('模型数据访问器超过 ' + HAND_MODEL_MAX_ACCESSORS + ' 个');
    if (bufferViews.length > HAND_MODEL_MAX_BUFFER_VIEWS) throw new Error('模型数据分块超过 ' + HAND_MODEL_MAX_BUFFER_VIEWS + ' 个');
    if (skins.length > HAND_MODEL_MAX_SKINS) throw new Error('模型骨架超过 ' + HAND_MODEL_MAX_SKINS + ' 个');
    if (animations.length) throw new Error('暂不加载模型动画轨道；请导出静态手部模型');
    var defaultScene = doc.scene === undefined ? 0 : Number(doc.scene);
    if (!Number.isInteger(defaultScene) || !scenes[defaultScene]) throw new Error('模型默认场景引用无效');
    handModelValidateNodeGraph(nodes, scenes);

    var totalBufferBytes = 0;
    var isGlbWithBin = format === 'glb' && payload && payload.binaryOffset >= 0;
    if (isGlbWithBin && buffers.length !== 1) {
      throw new Error('GLB 模型必须仅有一个 buffer');
    }
    buffers.forEach(function (buffer, index) {
      var declaredBytes = Number(buffer && buffer.byteLength);
      if (!Number.isInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > HAND_MODEL_MAX_FILE_BYTES) throw new Error('模型缓冲区声明尺寸无效');
      totalBufferBytes += declaredBytes;
      if (format === 'glb') {
        if (isGlbWithBin && index > 0) throw new Error('GLB 模型必须仅有一个 buffer');
        if (buffer && buffer.uri) throw new Error('GLB 不允许 buffer 使用 uri');
        if (isGlbWithBin && declaredBytes > payload.binaryLength) throw new Error('GLB 二进制数据短于声明尺寸');
        if (!isGlbWithBin && declaredBytes > 0) throw new Error('GLB 缺少 BIN chunk 或声明长度为 0 的缓冲区');
      } else {
        var uri = buffer && buffer.uri;
        if (!uri) throw new Error('GLTF 必须把二进制资源内嵌为 data URI');
        if (!handModelBufferDataUriAllowed(uri)) throw new Error('模型含外部文件或网络路径；请导出为自包含 GLB/GLTF');
        if (declaredBytes > handModelDataUriDecodedLength(uri)) throw new Error('模型内嵌缓冲区短于声明尺寸');
      }
    });
    if (totalBufferBytes > HAND_MODEL_MAX_FILE_BYTES) throw new Error('模型缓冲区总声明尺寸超过 32 MB');
    bufferViews.forEach(function (view) {
      var bufferIndex = Number(view && view.buffer);
      var byteOffset = Number(view && view.byteOffset) || 0;
      var byteLength = Number(view && view.byteLength);
      if (!Number.isInteger(bufferIndex) || !buffers[bufferIndex] || !Number.isInteger(byteOffset) || byteOffset < 0
        || !Number.isInteger(byteLength) || byteLength < 0 || byteOffset + byteLength > Number(buffers[bufferIndex].byteLength)) {
        throw new Error('模型 bufferView 超出缓冲区范围');
      }
    });
    var totalTexturePixels = 0;
    images.forEach(function (image, index) {
      var dimensions = handModelValidateImage(image, index, doc, format, payload, bufferViews);
      totalTexturePixels += dimensions.width * dimensions.height;
    });
    if (totalTexturePixels > HAND_MODEL_MAX_TOTAL_TEXTURE_PIXELS) {
      throw new Error('模型纹理总像素超过安全预算');
    }

    var componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    var typeComponents = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
    var totalAccessorElements = 0;
    var totalDeclaredBytes = 0;
    accessors.forEach(function (accessor) {
      if (accessor && accessor.sparse) throw new Error('暂不支持 sparse accessor，请导出普通网格');
      var count = Number(accessor && accessor.count);
      var bytes = componentBytes[Number(accessor && accessor.componentType)];
      var components = typeComponents[String(accessor && accessor.type || '')];
      if (!Number.isInteger(count) || count < 0 || !bytes || !components) throw new Error('模型 accessor 声明无效');
      if (accessor.bufferView !== undefined) {
        if (!Number.isInteger(accessor.bufferView) || !bufferViews[accessor.bufferView]) throw new Error('模型 accessor 引用了无效 bufferView');
        var accessorView = bufferViews[accessor.bufferView];
        var accessorOffset = accessor.byteOffset === undefined ? 0 : Number(accessor.byteOffset);
        var elementBytes = bytes * components;
        var stride = accessorView.byteStride === undefined ? elementBytes : Number(accessorView.byteStride);
        if (!Number.isInteger(accessorOffset) || accessorOffset < 0 || !Number.isInteger(stride) || stride < elementBytes || stride > 252) {
          throw new Error('模型 accessor 偏移或步长无效');
        }
        var requiredBytes = count ? accessorOffset + (count - 1) * stride + elementBytes : accessorOffset;
        if (requiredBytes > Number(accessorView.byteLength)) throw new Error('模型 accessor 超出 bufferView 范围');
      }
      totalAccessorElements += count;
      totalDeclaredBytes += count * bytes * components;
    });
    if (totalAccessorElements > HAND_MODEL_MAX_ACCESSOR_ELEMENTS || totalDeclaredBytes > HAND_MODEL_MAX_DECLARED_BYTES) {
      throw new Error('模型声明的顶点/动画数据超过安全预算');
    }
    skins.forEach(function (skin) {
      if (!Array.isArray(skin && skin.joints) || skin.joints.length > HAND_MODEL_MAX_JOINTS) throw new Error('模型骨骼关节超过 ' + HAND_MODEL_MAX_JOINTS + ' 个');
      skin.joints.forEach(function (nodeIndex) {
        if (!Number.isInteger(nodeIndex) || !nodes[nodeIndex]) throw new Error('模型骨骼引用无效');
      });
    });

    var required = Array.isArray(doc.extensionsRequired) ? doc.extensionsRequired : [];
    var unsupported = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];
    for (var e = 0; e < unsupported.length; e++) {
      if (required.indexOf(unsupported[e]) >= 0) throw new Error('暂不支持压缩扩展 ' + unsupported[e] + '，请导出未压缩 GLB');
    }

    var triangles = 0;
    var drawCalls = 0;
    var meshMetrics = new Array(meshes.length);
    meshes.forEach(function (mesh, meshIndex) {
      var primitives = mesh && Array.isArray(mesh.primitives) ? mesh.primitives : [];
      var meshTriangles = 0;
      var meshCalls = primitives.length;
      primitives.forEach(function (primitive) {
        var mode = Number.isInteger(primitive && primitive.mode) ? primitive.mode : 4;
        if (mode !== 4) throw new Error('手部模型只支持三角形网格');
        var attributes = primitive && primitive.attributes;
        if (!attributes || !Number.isInteger(attributes.POSITION) || !accessors[attributes.POSITION]) throw new Error('模型网格缺少有效 POSITION');
        if (Object.keys(attributes).length > 16) throw new Error('模型网格顶点属性过多');
        if (Array.isArray(primitive.targets) && primitive.targets.length > HAND_MODEL_MAX_MORPH_TARGETS) throw new Error('模型变形目标超过 ' + HAND_MODEL_MAX_MORPH_TARGETS + ' 个');
        var accessorIndex = primitive && primitive.indices;
        if (!Number.isInteger(accessorIndex)) accessorIndex = attributes.POSITION;
        var accessor = Number.isInteger(accessorIndex) ? accessors[accessorIndex] : null;
        if (!accessor) throw new Error('模型网格索引 accessor 无效');
        var count = Math.max(0, Number(accessor && accessor.count) || 0);
        meshTriangles += Math.floor(count / 3);
      });
      meshMetrics[meshIndex] = { triangles: meshTriangles, drawCalls: meshCalls };
      drawCalls += meshCalls;
      triangles += meshTriangles;
    });
    if (drawCalls > HAND_MODEL_MAX_DRAW_CALLS) throw new Error('模型绘制分组超过 ' + HAND_MODEL_MAX_DRAW_CALLS + ' 个');
    if (triangles > HAND_MODEL_MAX_TRIANGLES) throw new Error('模型面数超过 ' + HAND_MODEL_MAX_TRIANGLES + ' 三角面');

    var instanceTriangles = 0;
    var instanceDrawCalls = 0;
    nodes.forEach(function (node, nodeIndex) {
      if (node.mesh !== undefined) {
        if (!Number.isInteger(node.mesh) || node.mesh < 0 || !meshes[node.mesh]) throw new Error('模型节点引用了无效的网格');
        var metric = meshMetrics[node.mesh];
        if (!metric) throw new Error('模型节点引用了无效的网格');
        instanceTriangles += metric.triangles;
        instanceDrawCalls += metric.drawCalls;
      }
      if (node.camera !== undefined) {
        if (!Number.isInteger(node.camera) || node.camera < 0 || !cameras[node.camera]) throw new Error('模型节点引用了无效的相机');
      }
      if (node.skin !== undefined) {
        if (!Number.isInteger(node.skin) || node.skin < 0 || !skins[node.skin]) throw new Error('模型节点引用了无效的骨骼');
      }
    });
    if (instanceTriangles > HAND_MODEL_MAX_TRIANGLES) throw new Error('模型实例化面数超过 ' + HAND_MODEL_MAX_TRIANGLES + ' 三角面');
    if (instanceDrawCalls > HAND_MODEL_MAX_DRAW_CALLS) throw new Error('模型实例化绘制分组超过 ' + HAND_MODEL_MAX_DRAW_CALLS + ' 个');
    return { triangles: triangles, drawCalls: drawCalls };
  }

  function inspectHandModelPayload(arrayBuffer, extension) {
    var ext = String(extension || '').toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf') throw new Error('只接受 .glb 或 .gltf 文件');
    var payload = ext === 'glb'
      ? handModelReadGlbPayload(arrayBuffer)
      : { document: handModelDecodeJson(new Uint8Array(arrayBuffer)), arrayBuffer: arrayBuffer, binaryOffset: -1, binaryLength: 0 };
    var doc = payload.document;
    var metrics = handModelValidateDocument(doc, ext, payload);
    return { format: ext, document: doc, triangles: metrics.triangles, drawCalls: metrics.drawCalls };
  }

  async function inspectHandModelFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('没有读取到模型文件');
    var name = handModelCleanName(file.name);
    var match = /\.([^.]+)$/.exec(name.toLowerCase());
    var extension = match ? match[1] : '';
    if (extension !== 'glb' && extension !== 'gltf') throw new Error('只接受 .glb 或 .gltf 文件');
    var size = Math.max(0, Number(file.size) || 0);
    if (size <= 0) throw new Error('模型文件为空');
    if (size > HAND_MODEL_MAX_FILE_BYTES) throw new Error('单个模型不能超过 32 MB');
    var arrayBuffer = await file.arrayBuffer();
    var inspection = inspectHandModelPayload(arrayBuffer, extension);
    inspection.arrayBuffer = arrayBuffer;
    inspection.name = name.replace(/\.(glb|gltf)$/i, '') || '自定义手部模型';
    inspection.size = size;
    return inspection;
  }

  function handModelFindRecord(id) {
    for (var i = 0; i < handModelRecords.length; i++) if (handModelRecords[i].id === id) return handModelRecords[i];
    return null;
  }

  function handModelFindBuiltin(id) {
    for (var i = 0; i < HAND_MODEL_BUILTINS.length; i++) if (HAND_MODEL_BUILTINS[i].id === id) return HAND_MODEL_BUILTINS[i];
    return null;
  }

  function handModelMakeCard(item, isCustom) {
    var card = document.createElement('div');
    card.className = 'hand-model-card';
    card.dataset.handModel = item.id;
    card.dataset.preview = isCustom ? 'custom' : item.style;
    card.setAttribute('role', 'radio');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-checked', item.id === handModelSelectedId ? 'true' : 'false');

    var preview = document.createElement('span');
    preview.className = 'hand-model-preview';
    preview.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 5; i++) preview.appendChild(document.createElement('i'));
    card.appendChild(preview);

    var copy = document.createElement('span');
    copy.className = 'hand-model-card-copy';
    var title = document.createElement('strong');
    title.textContent = item.name;
    var note = document.createElement('small');
    note.textContent = isCustom ? handModelFormatBytes(item.size) + ' · ' + String(item.format || '').toUpperCase() : item.note;
    copy.appendChild(title);
    copy.appendChild(note);
    card.appendChild(copy);

    if (isCustom) {
      var remove = document.createElement('button');
      remove.className = 'hand-model-delete';
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', '删除手部模型 ' + item.name);
      remove.addEventListener('click', function (event) {
        event.stopPropagation();
        deleteHandModel(item.id);
      });
      card.appendChild(remove);
    }

    function activate() { selectHandModelVisual(item.id); }
    card.addEventListener('click', activate);
    card.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
    return card;
  }

  function renderHandModelLibrary() {
    var grid = document.getElementById('hand-model-grid');
    if (!grid) return;
    grid.textContent = '';
    HAND_MODEL_BUILTINS.forEach(function (item) { grid.appendChild(handModelMakeCard(item, false)); });
    handModelRecords.slice().sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); }).forEach(function (item) {
      grid.appendChild(handModelMakeCard(item, true));
    });
    var total = handModelRecords.reduce(function (sum, item) { return sum + Math.max(0, Number(item.size) || 0); }, 0);
    if (!handModelBusy) {
      handModelSetStatus(handModelRecords.length
        ? '本机模型 ' + handModelRecords.length + '/' + HAND_MODEL_MAX_CUSTOM_COUNT + ' · ' + handModelFormatBytes(total) + '/96 MB'
        : '内置模型不占存储；自定义模型仅保存在本机。', false);
    }
  }

  function syncHandModelCardSelection() {
    document.querySelectorAll('[data-hand-model]').forEach(function (card) {
      var active = card.dataset.handModel === handModelSelectedId;
      card.classList.toggle('active', active);
      card.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function disposeHandModelMaterial(material) {
    if (!material) return;
    var materials = Array.isArray(material) ? material : [material];
    materials.forEach(function (item) {
      if (!item) return;
      Object.keys(item).forEach(function (key) {
        var value = item[key];
        if (value && value.isTexture && typeof value.dispose === 'function') value.dispose();
      });
      if (typeof item.dispose === 'function') item.dispose();
    });
  }

  function disposeHandModelObject(root) {
    if (!root || typeof root.traverse !== 'function') return;
    root.traverse(function (object) {
      if (object && object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
      if (object && object.material) disposeHandModelMaterial(object.material);
    });
  }

  function clearHandModelCustom() {
    handModelLoadGeneration++;
    handModelCustomObjects.forEach(function (object) {
      if (object && object.parent) object.parent.remove(object);
    });
    handModelCustomObjects = [];
    if (handModelCustomTemplate) disposeHandModelObject(handModelCustomTemplate);
    handModelCustomTemplate = null;
    handModelCustomReadyId = '';
  }

  function clearHandModelAsset() {
    handModelAssetGeneration++;
    handModelAssetObjects.forEach(function (object) {
      if (object && object.parent) object.parent.remove(object);
      disposeHandModelObject(object);
    });
    handModelAssetObjects = [];
    handModelAssetReadyStyle = '';
  }

  function clearHandModelBuiltIn() {
    handModelBuiltInRigs = [];
    handModelBuiltInStyle = '';
    if (!handModelBuiltInRoot) return;
    if (handModelBuiltInRoot.parent) handModelBuiltInRoot.parent.remove(handModelBuiltInRoot);
    disposeHandModelObject(handModelBuiltInRoot);
    handModelBuiltInRoot = null;
  }

  function handModelGestureRunning() {
    return typeof gestureActive !== 'undefined' && gestureActive === true;
  }

  function releaseHandModelRenderer() {
    clearHandModelCustom();
    clearHandModelAsset();
    clearHandModelBuiltIn();
    var oldCanvas = handModelCanvas || document.getElementById('hand-model-canvas');
    if (oldCanvas) oldCanvas.classList.remove('show');
    if (handModelRenderer) {
      try { handModelRenderer.dispose(); } catch (error) { }
      try { handModelRenderer.forceContextLoss(); } catch (error) { }
      // 丢失过的 WebGL context 不能可靠复用；换同 ID 的空 canvas，下一次开启再创建。
      if (oldCanvas && oldCanvas.parentNode) {
        var freshCanvas = oldCanvas.cloneNode(false);
        oldCanvas.parentNode.replaceChild(freshCanvas, oldCanvas);
        oldCanvas = freshCanvas;
      }
    }
    handModelCanvas = oldCanvas;
    handModelRenderer = null;
    handModelScene = null;
    handModelCamera = null;
    handModelSceneRoot = null;
    handModelRendererFailed = false;
    handModelLastWidth = 0;
    handModelLastHeight = 0;
    handModelMatrix = null;
    handModelQuaternion = null;
    handModelUpAxis = null;
    handModelPointA = null;
    handModelPointB = null;
    handModelDelta = null;
    handModelBox = null;
    handModelSize = null;
    handModelCenter = null;
  }

  function ensureHandModelRenderer() {
    if (handModelRenderer) return true;
    if (handModelRendererFailed || typeof THREE === 'undefined') return false;
    handModelCanvas = document.getElementById('hand-model-canvas');
    if (!handModelCanvas) return false;
    try {
      handModelRenderer = new THREE.WebGLRenderer({
        canvas: handModelCanvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        powerPreference: 'low-power',
      });
      handModelRenderer.setClearColor(0x000000, 0);
      handModelRenderer.outputEncoding = THREE.sRGBEncoding;
      handModelScene = new THREE.Scene();
      handModelCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
      handModelCamera.position.set(0, 0, 6);
      handModelCamera.lookAt(0, 0, 0);
      handModelSceneRoot = new THREE.Group();
      handModelScene.add(handModelSceneRoot);
      handModelScene.add(new THREE.HemisphereLight(0xe8f8ff, 0x15111b, 1.45));
      var key = new THREE.DirectionalLight(0xffffff, 1.8);
      key.position.set(-2, 3, 5);
      handModelScene.add(key);
      var rim = new THREE.PointLight(0x76ddff, 1.5, 14);
      rim.position.set(3, -2, 4);
      handModelScene.add(rim);
      handModelMatrix = new THREE.Matrix4();
      handModelQuaternion = new THREE.Quaternion();
      handModelUpAxis = new THREE.Vector3(0, 1, 0);
      handModelPointA = new THREE.Vector3();
      handModelPointB = new THREE.Vector3();
      handModelDelta = new THREE.Vector3();
      handModelBox = new THREE.Box3();
      handModelSize = new THREE.Vector3();
      handModelCenter = new THREE.Vector3();
      resizeHandModelRenderer();
      return true;
    } catch (error) {
      console.warn('[HandModel] WebGL overlay unavailable:', error);
      handModelRendererFailed = true;
      handModelRenderer = null;
      handModelSetStatus('3D 手部模型不可用，已保留流光骨架', true);
      return false;
    }
  }

  function resizeHandModelRenderer() {
    if (!handModelRenderer || !handModelCamera) return;
    var width = Math.max(1, Math.round(innerWidth));
    var height = Math.max(1, Math.round(innerHeight));
    if (width === handModelLastWidth && height === handModelLastHeight) return;
    handModelLastWidth = width;
    handModelLastHeight = height;
    var aspect = width / height;
    handModelCamera.left = -aspect;
    handModelCamera.right = aspect;
    handModelCamera.top = 1;
    handModelCamera.bottom = -1;
    handModelCamera.updateProjectionMatrix();
    handModelRenderer.setPixelRatio(Math.min(Number(devicePixelRatio) || 1, 1.5));
    handModelRenderer.setSize(width, height, false);
  }

  function createHandModelMaterial(style, handIndex) {
    var cool = handIndex === 0;
    if (style === 'chrome') {
      return new THREE.MeshStandardMaterial({
        color: cool ? 0xa8eaff : 0xffd9a0,
        emissive: cool ? 0x103846 : 0x4a2711,
        emissiveIntensity: 0.35,
        metalness: 0.94,
        roughness: 0.18,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });
    }
    if (style === 'stardust') {
      return new THREE.MeshBasicMaterial({
        color: cool ? 0x96ecff : 0xffd58f,
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: cool ? 0xb8f3ff : 0xffe0b2,
      emissive: cool ? 0x245466 : 0x5c3316,
      emissiveIntensity: 0.42,
      metalness: 0.18,
      roughness: 0.08,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    });
  }

  function ensureHandModelBuiltIn(style) {
    if (handModelBuiltInRoot && handModelBuiltInStyle === style) return true;
    if (!ensureHandModelRenderer()) return false;
    clearHandModelBuiltIn();
    handModelBuiltInStyle = style;
    handModelBuiltInRoot = new THREE.Group();
    handModelSceneRoot.add(handModelBuiltInRoot);
    var jointGeometry = new THREE.SphereBufferGeometry(1, style === 'stardust' ? 10 : 14, style === 'stardust' ? 7 : 10);
    var boneGeometry = new THREE.CylinderBufferGeometry(1, 1, 1, style === 'chrome' ? 10 : 8, 1, false);
    for (var handIndex = 0; handIndex < 2; handIndex++) {
      var material = createHandModelMaterial(style, handIndex);
      var boneMaterial = material.clone();
      boneMaterial.opacity *= style === 'stardust' ? 0.26 : 0.68;
      var joints = new THREE.InstancedMesh(jointGeometry, material, 21);
      var bones = new THREE.InstancedMesh(boneGeometry, boneMaterial, HAND_MODEL_BONES.length);
      joints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      bones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      joints.count = 0;
      bones.count = 0;
      bones.visible = style !== 'stardust';
      handModelBuiltInRoot.add(joints);
      handModelBuiltInRoot.add(bones);
      handModelBuiltInRigs.push({ joints: joints, bones: bones, material: material, boneMaterial: boneMaterial });
    }
    return true;
  }

  function handModelPointFromLandmark(landmark, target) {
    var aspect = Math.max(0.25, handModelLastWidth / Math.max(1, handModelLastHeight));
    target.set(
      (Number(landmark && landmark.x) - 0.5) * 2 * aspect,
      (0.5 - Number(landmark && landmark.y)) * 2,
      Math.max(-0.7, Math.min(0.7, -(Number(landmark && landmark.z) || 0) * 1.6))
    );
    return target;
  }

  function updateHandModelBuiltIn(slots, style, now) {
    if (!ensureHandModelBuiltIn(style)) return false;
    var visibleHands = 0;
    for (var handIndex = 0; handIndex < 2; handIndex++) {
      var slot = slots && slots[handIndex];
      var rig = handModelBuiltInRigs[handIndex];
      if (!slot || !slot.present || !slot.lm || slot.lm.length < 21) {
        rig.joints.count = 0;
        rig.bones.count = 0;
        continue;
      }
      visibleHands++;
      var points = [];
      for (var i = 0; i < 21; i++) points.push(handModelPointFromLandmark(slot.lm[i], new THREE.Vector3()));
      var palmSpan = Math.max(0.04, points[5].distanceTo(points[17]));
      var pulse = style === 'stardust' ? 1 + Math.sin((Number(now) || 0) * 0.006 + handIndex) * 0.13 : 1;
      var jointRadius = palmSpan * (style === 'stardust' ? 0.12 : style === 'chrome' ? 0.075 : 0.085) * handModelScale * pulse;
      for (var jointIndex = 0; jointIndex < 21; jointIndex++) {
        var tipBoost = jointIndex === 4 || jointIndex === 8 || jointIndex === 12 || jointIndex === 16 || jointIndex === 20 ? 1.34 : 1;
        handModelMatrix.compose(points[jointIndex], handModelQuaternion.identity(), new THREE.Vector3(jointRadius * tipBoost, jointRadius * tipBoost, jointRadius * tipBoost));
        rig.joints.setMatrixAt(jointIndex, handModelMatrix);
      }
      rig.joints.count = 21;
      rig.joints.instanceMatrix.needsUpdate = true;
      if (style !== 'stardust') {
        var boneRadius = palmSpan * (style === 'chrome' ? 0.038 : 0.032) * handModelScale;
        for (var boneIndex = 0; boneIndex < HAND_MODEL_BONES.length; boneIndex++) {
          var pair = HAND_MODEL_BONES[boneIndex];
          handModelPointA.copy(points[pair[0]]);
          handModelPointB.copy(points[pair[1]]);
          handModelDelta.subVectors(handModelPointB, handModelPointA);
          var length = Math.max(0.001, handModelDelta.length());
          handModelQuaternion.setFromUnitVectors(handModelUpAxis, handModelDelta.normalize());
          handModelPointA.add(handModelPointB).multiplyScalar(0.5);
          handModelMatrix.compose(handModelPointA, handModelQuaternion, new THREE.Vector3(boneRadius, length, boneRadius));
          rig.bones.setMatrixAt(boneIndex, handModelMatrix);
        }
        rig.bones.count = HAND_MODEL_BONES.length;
        rig.bones.instanceMatrix.needsUpdate = true;
      }
      if (style === 'stardust') rig.material.opacity = 0.72 + pulse * 0.12;
    }
    return visibleHands > 0;
  }

  function handModelLoadedMetrics(root) {
    var triangles = 0;
    var drawCalls = 0;
    var invalidTexture = false;
    root.traverse(function (object) {
      if (!object || !object.isMesh || !object.geometry) return;
      drawCalls++;
      var geometry = object.geometry;
      var count = geometry.index ? geometry.index.count : (geometry.attributes && geometry.attributes.position ? geometry.attributes.position.count : 0);
      triangles += Math.floor(Math.max(0, Number(count) || 0) / 3);
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(function (material) {
        if (!material) return;
        Object.keys(material).forEach(function (key) {
          var texture = material[key];
          var image = texture && texture.isTexture && texture.image;
          if (image && (Number(image.width) > HAND_MODEL_MAX_TEXTURE_EDGE || Number(image.height) > HAND_MODEL_MAX_TEXTURE_EDGE)) invalidTexture = true;
        });
      });
    });
    if (triangles > HAND_MODEL_MAX_TRIANGLES) throw new Error('模型实际面数超过 ' + HAND_MODEL_MAX_TRIANGLES + ' 三角面');
    if (drawCalls > HAND_MODEL_MAX_DRAW_CALLS) throw new Error('模型实际绘制分组超过 ' + HAND_MODEL_MAX_DRAW_CALLS + ' 个');
    if (invalidTexture) throw new Error('模型纹理边长不能超过 4096 像素');
    return { triangles: triangles, drawCalls: drawCalls };
  }

  function handModelParseGltf(arrayBuffer) {
    return new Promise(function (resolve, reject) {
      if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader !== 'function') {
        reject(new Error('GLTFLoader 未加载'));
        return;
      }
      try {
        new THREE.GLTFLoader().parse(arrayBuffer, '', resolve, function (error) {
          reject(error instanceof Error ? error : new Error('GLB/GLTF 解析失败'));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function applyHandModelAssetMaterial(root, style, handIndex) {
    root.traverse(function (object) {
      if (!object || !object.isMesh || !object.material) return;
      var sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      var nextMaterials = sourceMaterials.map(function (source) {
        var material = source && typeof source.clone === 'function' ? source.clone() : new THREE.MeshStandardMaterial();
        if (material.color && typeof material.color.setHex === 'function') material.color.setHex(handIndex === 0 ? 0xb9efff : 0xffdb9d);
        if (material.emissive && typeof material.emissive.setHex === 'function') material.emissive.setHex(handIndex === 0 ? 0x123744 : 0x42230e);
        material.emissiveIntensity = 0.34;
        material.metalness = 0.9;
        material.roughness = 0.16;
        material.transparent = true;
        material.opacity = style === 'chrome' ? 0.9 : 0.72;
        material.depthWrite = false;
        material.needsUpdate = true;
        return material;
      });
      object.material = Array.isArray(object.material) ? nextMaterials : nextMaterials[0];
      object.frustumCulled = false;
    });
  }

  var HAND_MODEL_PROXIMAL = ['index', 'middle', 'ring', 'pinky'];

  // 从 GLB 自身的 WebXR 关节名反推静止姿态：掌心锚点、指向轴、掌宽、左右手性。
  // 关节缺失时返回 null，调用方退回旧的包围盒对齐。
  function measureHandModelRest(root) {
    var wrist = root.getObjectByName('wrist');
    if (!wrist) return null;
    var joints = HAND_MODEL_PROXIMAL.map(function (name) {
      return root.getObjectByName(name + '-finger-phalanx-proximal');
    });
    if (joints.some(function (joint) { return !joint; })) return null;

    var wristPos = wrist.getWorldPosition(new THREE.Vector3());
    var knuckles = joints.map(function (joint) { return joint.getWorldPosition(new THREE.Vector3()); });
    var anchor = wristPos.clone();
    knuckles.forEach(function (point) { anchor.add(point); });
    anchor.multiplyScalar(1 / (knuckles.length + 1));

    var forward = knuckles[1].clone().sub(wristPos);
    var lateral = knuckles[0].clone().sub(knuckles[3]);
    if (forward.lengthSq() < 1e-12 || lateral.lengthSq() < 1e-12) return null;
    forward.normalize();
    lateral.addScaledVector(forward, -lateral.dot(forward));
    if (lateral.lengthSq() < 1e-12) return null;
    lateral.normalize();
    var normal = new THREE.Vector3().crossVectors(lateral, forward).normalize();

    var span = knuckles[0].distanceTo(knuckles[3]);
    if (!(span > 1e-6)) return null;

    var thumb = root.getObjectByName('thumb-tip');
    var chirality = 0;
    if (thumb) {
      chirality = thumb.getWorldPosition(new THREE.Vector3()).sub(anchor).dot(normal);
    }

    return {
      anchor: anchor,
      quaternionInverse: new THREE.Quaternion()
        .setFromRotationMatrix(new THREE.Matrix4().makeBasis(lateral, forward, normal))
        .conjugate(),
      knuckleSpan: span,
      chirality: chirality,
    };
  }

  async function loadHandModelAsset(style) {
    clearHandModelAsset();
    var gen = ++handModelAssetGeneration;
    handModelBusy = true;
    handModelSetStatus('正在加载 MIT Generic Hand 实体模型…', false);
    try {
      if (!ensureHandModelRenderer()) throw new Error('当前显卡无法创建透明模型层');
      var paths = [
        'assets/hand-models/generic-hand-left.glb',
        'assets/hand-models/generic-hand-right.glb',
      ];
      var loaded = await Promise.all(paths.map(async function (path) {
        var response = await fetch(path, { credentials: 'same-origin', cache: 'force-cache' });
        if (!response.ok) throw new Error('内置手模读取失败 (' + response.status + ')');
        var buffer = await response.arrayBuffer();
        inspectHandModelPayload(buffer, 'glb');
        return handModelParseGltf(buffer);
      }));
      if (gen !== handModelAssetGeneration || handModelSelectedId !== 'builtin:' + style) {
        loaded.forEach(function (gltf) { if (gltf && gltf.scene) disposeHandModelObject(gltf.scene); });
        return;
      }
      loaded.forEach(function (gltf, handIndex) {
        var root = gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]));
        if (!root) throw new Error('内置手模缺少场景');
        handModelLoadedMetrics(root);
        applyHandModelAssetMaterial(root, style, handIndex);
        root.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty()) throw new Error('内置手模没有可显示网格');
        var size = new THREE.Vector3();
        var center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        var maxDimension = Math.max(size.x, size.y, size.z);
        var rest = measureHandModelRest(root);
        var wrapper = new THREE.Group();
        wrapper.add(root);
        root.position.sub(rest ? rest.anchor : center);
        wrapper.userData.handModelNormalization = 1 / Math.max(1e-7, maxDimension);
        wrapper.userData.handModelRest = rest;
        wrapper.userData.handModelSmoothed = null;
        wrapper.scale.setScalar(wrapper.userData.handModelNormalization);
        wrapper.visible = false;
        handModelSceneRoot.add(wrapper);
        handModelAssetObjects.push(wrapper);
      });
      handModelAssetReadyStyle = style;
      handModelSetStatus('WebXR Generic Hand · MIT · 本地实体网格跟随', false);
      if (typeof markRenderInteraction === 'function') markRenderInteraction('hand-model-asset', 800);
    } catch (error) {
      console.warn('[HandModel] built-in asset unavailable:', error);
      if (gen === handModelAssetGeneration) {
        clearHandModelAsset();
        handModelBusy = false;
        handModelSetStatus('实体手加载失败，已保留流光骨架', true);
      }
    } finally {
      if (gen === handModelAssetGeneration) handModelBusy = false;
    }
  }

  async function loadHandModelRecord(record) {
    clearHandModelCustom();
    var gen = ++handModelLoadGeneration;
    handModelBusy = true;
    handModelSetStatus('正在校验并加载 ' + record.name + '…', false);
    var parsedRoot = null;
    try {
      if (!ensureHandModelRenderer()) throw new Error('当前显卡无法创建透明模型层');
      clearHandModelAsset();
      var actualBytes = Math.max(0, Number(record && record.blob && record.blob.size) || 0);
      if (!actualBytes || actualBytes > HAND_MODEL_MAX_FILE_BYTES) throw new Error('模型文件为空或超过 32 MB');
      var arrayBuffer = await record.blob.arrayBuffer();
      inspectHandModelPayload(arrayBuffer, record.format);
      var gltf = await handModelParseGltf(arrayBuffer);
      if (gen !== handModelLoadGeneration || handModelSelectedId !== record.id) {
        if (gltf && gltf.scene) disposeHandModelObject(gltf.scene);
        return;
      }
      var root = gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]));
      if (!root) throw new Error('模型没有可显示的场景');
      parsedRoot = root;
      var metrics = handModelLoadedMetrics(root);
      root.updateMatrixWorld(true);
      handModelBox.setFromObject(root);
      if (handModelBox.isEmpty()) throw new Error('模型没有可显示的网格');
      handModelBox.getSize(handModelSize);
      handModelBox.getCenter(handModelCenter);
      var maxDimension = Math.max(handModelSize.x, handModelSize.y, handModelSize.z);
      if (!isFinite(maxDimension) || maxDimension <= 1e-7) throw new Error('模型尺寸无效');
      var wrapper = new THREE.Group();
      wrapper.add(root);
      root.position.sub(handModelCenter);
      wrapper.userData.handModelNormalization = 1 / maxDimension;
      wrapper.scale.setScalar(wrapper.userData.handModelNormalization);
      wrapper.updateMatrixWorld(true);
      handModelCustomTemplate = wrapper;
      handModelCustomObjects = [wrapper.clone(true), wrapper.clone(true)];
      handModelCustomObjects.forEach(function (object) {
        object.userData.handModelNormalization = wrapper.userData.handModelNormalization;
        object.visible = false;
        handModelSceneRoot.add(object);
      });
      parsedRoot = null;
      handModelCustomReadyId = record.id;
      handModelSetStatus(record.name + ' · ' + metrics.triangles + ' 三角面 · 跟随掌心/方向/大小', false);
      if (typeof markRenderInteraction === 'function') markRenderInteraction('hand-model-load', 800);
    } catch (error) {
      if (parsedRoot) disposeHandModelObject(parsedRoot);
      console.warn('[HandModel] custom model rejected:', error);
      if (gen === handModelLoadGeneration) {
        handModelSetStatus('模型未加载：' + String(error && error.message || error), true);
        handModelSafeToast('手部模型未加载：' + String(error && error.message || '格式不兼容'));
      }
    } finally {
      if (gen === handModelLoadGeneration) handModelBusy = false;
    }
  }

  function updateHandModelCustom(slots) {
    if (!handModelCustomTemplate || handModelCustomReadyId !== handModelSelectedId) return false;
    var visibleHands = 0;
    var aspect = Math.max(0.25, handModelLastWidth / Math.max(1, handModelLastHeight));
    for (var handIndex = 0; handIndex < 2; handIndex++) {
      var slot = slots && slots[handIndex];
      var object = handModelCustomObjects[handIndex];
      if (!object) continue;
      if (!slot || !slot.present || !slot.lm || slot.lm.length < 21) {
        object.visible = false;
        continue;
      }
      visibleHands++;
      object.visible = true;
      var palm = slot.palm || { x: 0.5, y: 0.5 };
      var left = slot.lm[5];
      var right = slot.lm[17];
      var wrist = slot.lm[0];
      var middle = slot.lm[9];
      var span = Math.max(0.04, Math.hypot((left.x - right.x) * aspect, left.y - right.y) * 2);
      var dx = (middle.x - wrist.x) * aspect;
      var dy = -(middle.y - wrist.y);
      var angle = Math.atan2(dy, dx) - Math.PI * 0.5;
      var avgZ = ((Number(wrist.z) || 0) + (Number(middle.z) || 0)) * -0.8;
      object.position.set((palm.x - 0.5) * 2 * aspect, (0.5 - palm.y) * 2, Math.max(-0.5, Math.min(0.5, avgZ)));
      object.rotation.set(0, 0, angle);
      object.scale.setScalar(span * 2.35 * handModelScale * (Number(object.userData.handModelNormalization) || 1));
    }
    return visibleHands > 0;
  }

  function updateHandModelAsset(slots, style) {
    if (handModelAssetReadyStyle !== style || handModelAssetObjects.length !== 2) return false;
    var visibleHands = 0;
    var aspect = Math.max(0.25, handModelLastWidth / Math.max(1, handModelLastHeight));

    // ---- 双手 chirality 投票,带迟滞 ----
    var votes = [0, 0];
    for (var handIndex = 0; handIndex < 2; handIndex++) {
      var slot = slots && slots[handIndex];
      var object = handModelAssetObjects[handIndex];
      var rest = object.userData.handModelRest;
      if (!slot || !slot.present || !slot.lm || slot.lm.length < 21 || !rest) continue;
      var wrist = slot.lm[0];
      var middle = slot.lm[9];
      var index = slot.lm[5];
      var pinky = slot.lm[17];
      var thumb = slot.lm[4];
      var palmCenter = {
        x: (wrist.x + index.x + middle.x + slot.lm[13].x + pinky.x) / 5,
        y: (wrist.y + index.y + middle.y + slot.lm[13].y + pinky.y) / 5,
      };
      var forward = { x: (middle.x - wrist.x) * aspect, y: middle.y - wrist.y };
      var lateral = { x: (index.x - pinky.x) * aspect, y: index.y - pinky.y };
      var fLen = Math.hypot(forward.x, forward.y);
      var lLen = Math.hypot(lateral.x, lateral.y);
      if (fLen < 0.02 || lLen < 0.02) continue;
      forward.x /= fLen; forward.y /= fLen;
      lateral.x /= lLen; lateral.y /= lLen;
      var normalZ = lateral.x * forward.y - lateral.y * forward.x;
      var thumbDelta = { x: (thumb.x - palmCenter.x) * aspect, y: thumb.y - palmCenter.y };
      var thumbDotNormal = thumbDelta.x * (-forward.y) + thumbDelta.y * forward.x;
      thumbDotNormal *= Math.sign(normalZ);
      var obsChirality = thumbDotNormal;
      var meshChirality = rest.chirality;
      var match = obsChirality * meshChirality;
      if (Math.abs(match) > 0.005) votes[handIndex] = match > 0 ? 1 : -1;
    }

    var prevMap = handModelAssetObjects.map(function (obj) {
      var s = obj.userData.handModelSmoothed;
      return s ? s.assignedSlotIndex : -1;
    });
    var slotMap = [-1, -1];
    if (votes[0] !== 0 && votes[1] === 0) {
      slotMap[0] = votes[0] > 0 ? 0 : 1;
    } else if (votes[0] === 0 && votes[1] !== 0) {
      slotMap[1] = votes[1] > 0 ? 1 : 0;
    } else if (votes[0] !== 0 && votes[1] !== 0) {
      if (votes[0] === votes[1]) {
        slotMap[0] = votes[0] > 0 ? 0 : 1;
        slotMap[1] = votes[1] > 0 ? 1 : 0;
      } else {
        slotMap = prevMap[0] >= 0 && prevMap[1] >= 0 ? prevMap : [0, 1];
      }
    } else {
      slotMap = prevMap[0] >= 0 && prevMap[1] >= 0 ? prevMap : [0, 1];
    }

    for (var handIndex = 0; handIndex < 2; handIndex++) {
      var slotIndex = slotMap[handIndex];
      var slot = slotIndex >= 0 && slots ? slots[slotIndex] : null;
      var object = handModelAssetObjects[handIndex];
      var rest = object.userData.handModelRest;
      if (!slot || !slot.present || !slot.lm || slot.lm.length < 21 || !rest) {
        object.visible = false;
        object.userData.handModelSmoothed = null;
        continue;
      }
      visibleHands++;
      object.visible = true;

      var wrist = slot.lm[0];
      var middle = slot.lm[9];
      var index = slot.lm[5];
      var pinky = slot.lm[17];
      var palmPos = slot.palm || {
        x: (wrist.x + index.x + middle.x + slot.lm[13].x + pinky.x) / 5,
        y: (wrist.y + index.y + middle.y + slot.lm[13].y + pinky.y) / 5,
      };

      var forward = { x: (middle.x - wrist.x) * aspect, y: middle.y - wrist.y };
      var lateral = { x: (index.x - pinky.x) * aspect, y: index.y - pinky.y };
      var fLen = Math.hypot(forward.x, forward.y);
      var lLen = Math.hypot(lateral.x, lateral.y);
      forward.x /= Math.max(1e-9, fLen);
      forward.y /= Math.max(1e-9, fLen);
      lateral.x -= forward.x * (lateral.x * forward.x + lateral.y * forward.y);
      lateral.y -= forward.y * (lateral.x * forward.x + lateral.y * forward.y);
      lLen = Math.hypot(lateral.x, lateral.y);
      lateral.x /= Math.max(1e-9, lLen);
      lateral.y /= Math.max(1e-9, lLen);
      var normalZ = lateral.x * forward.y - lateral.y * forward.x;
      normalZ /= Math.max(1e-9, Math.abs(normalZ));

      handModelMatrix.makeBasis(
        new THREE.Vector3(lateral.x, lateral.y, 0),
        new THREE.Vector3(forward.x, forward.y, 0),
        new THREE.Vector3(0, 0, normalZ)
      );
      var qObs = handModelQuaternion.setFromRotationMatrix(handModelMatrix);
      var qTarget = qObs.clone().multiply(rest.quaternionInverse);

      var avgZ = ((Number(wrist.z) || 0) + (Number(middle.z) || 0)) * -0.8;
      avgZ = Math.max(-0.5, Math.min(0.5, avgZ));

      var span = Math.max(0.04, Math.hypot((index.x - pinky.x) * aspect, index.y - pinky.y) * 2);
      var targetScale = (span / rest.knuckleSpan) * handModelScale * (Number(object.userData.handModelNormalization) || 1);

      var smoothed = object.userData.handModelSmoothed;
      if (!smoothed || smoothed.assignedSlotIndex !== slotIndex) {
        object.userData.handModelSmoothed = smoothed = {
          assignedSlotIndex: slotIndex,
          quaternion: qTarget.clone(),
          z: avgZ,
          scale: targetScale,
        };
      } else {
        smoothed.quaternion.slerp(qTarget, 0.35);
        smoothed.z += (avgZ - smoothed.z) * 0.28;
        smoothed.scale += (targetScale - smoothed.scale) * 0.32;
      }

      object.quaternion.copy(smoothed.quaternion);
      object.position.set((palmPos.x - 0.5) * 2 * aspect, (0.5 - palmPos.y) * 2, smoothed.z);
      object.scale.setScalar(smoothed.scale);
    }
    return visibleHands > 0;
  }

  function hideHandModelCanvas(clear) {
    if (handModelCanvas) handModelCanvas.classList.remove('show');
    if (clear && handModelRenderer) handModelRenderer.clear(true, true, true);
    handModelCustomObjects.forEach(function (object) { if (object) object.visible = false; });
  }

  function renderHandModelFrame(_ctx, slots, _twoHand, now) {
    if ((typeof gestureActive !== 'undefined' && !gestureActive)
      || (document.body && document.body.classList.contains('render-deep-sleep'))) {
      hideHandModelCanvas(true);
      return true;
    }
    var builtin = handModelFindBuiltin(handModelSelectedId);
    if (builtin && builtin.style === 'aurora') {
      hideHandModelCanvas(true);
      return false;
    }
    if (builtin && builtin.style === 'none') {
      hideHandModelCanvas(true);
      return true;
    }
    if (!ensureHandModelRenderer()) return false;
    resizeHandModelRenderer();
    var visible = false;
    if (builtin) {
      if (handModelCustomTemplate) clearHandModelCustom();
      if (builtin.asset) {
        clearHandModelBuiltIn();
        visible = updateHandModelAsset(slots, builtin.style);
        if (!handModelAssetReadyStyle) return false;
      } else {
        if (handModelAssetObjects.length) clearHandModelAsset();
        visible = updateHandModelBuiltIn(slots, builtin.style, now);
      }
    } else {
      if (handModelBuiltInRoot) clearHandModelBuiltIn();
      if (handModelAssetObjects.length) clearHandModelAsset();
      visible = updateHandModelCustom(slots);
      if (!handModelCustomReadyId) return false;
    }
    handModelCanvas.classList.toggle('show', visible);
    handModelRenderer.render(handModelScene, handModelCamera);
    return true;
  }

  function clearHandModelFrame() {
    hideHandModelCanvas(true);
  }

  async function selectHandModelVisual(id, forceLoad) {
    var nextId = String(id || '');
    var builtin = handModelFindBuiltin(nextId);
    var record = handModelFindRecord(nextId);
    if (!builtin && !record) {
      nextId = 'builtin:aurora';
      builtin = handModelFindBuiltin(nextId);
      record = null;
    }
    handModelSelectedId = nextId;
    writeStoredSelection(nextId);
    syncHandModelCardSelection();
    if (!forceLoad && !handModelGestureRunning()) {
      releaseHandModelRenderer();
      handModelBusy = false;
      handModelSetStatus('已选择' + ((builtin && builtin.name) || (record && record.name) || '手部模型') + '；开启手势时再加载，不占用 GPU。', false);
      return;
    }
    if (record) {
      clearHandModelBuiltIn();
      clearHandModelAsset();
      await loadHandModelRecord(record);
    } else {
      clearHandModelCustom();
      if (builtin && builtin.asset) {
        clearHandModelBuiltIn();
        await loadHandModelAsset(builtin.style);
      } else {
        clearHandModelAsset();
        if (builtin && builtin.style !== 'aurora' && builtin.style !== 'none') ensureHandModelBuiltIn(builtin.style);
        else clearHandModelBuiltIn();
      }
      handModelBusy = false;
      if (!builtin || !builtin.asset) {
        handModelSetStatus(builtin && builtin.style === 'none'
          ? '手势控制继续工作，屏幕不显示手部模型。'
          : '已选择' + (builtin ? builtin.name : '流光骨架') + '。', false);
      }
    }
    if (typeof markRenderInteraction === 'function') markRenderInteraction('hand-model-select', 700);
  }

  function openHandModelPicker() {
    if (handModelBusy) return;
    var input = document.getElementById('hand-model-file-input');
    if (input) input.click();
  }

  async function importHandModelFile(file) {
    if (handModelBusy) return;
    handModelBusy = true;
    handModelSetStatus('正在检查模型安全边界…', false);
    try {
      var total = handModelRecords.reduce(function (sum, item) { return sum + Math.max(0, Number(item.size) || 0); }, 0);
      if (handModelRecords.length >= HAND_MODEL_MAX_CUSTOM_COUNT) throw new Error('最多保留 ' + HAND_MODEL_MAX_CUSTOM_COUNT + ' 个自定义模型，请先删除一个');
      var inspection = await inspectHandModelFile(file);
      if (total + inspection.size > HAND_MODEL_MAX_TOTAL_BYTES) throw new Error('自定义模型总空间不能超过 96 MB');
      var random = '';
      try { random = crypto.randomUUID().replace(/-/g, ''); } catch (e) { random = Math.random().toString(36).slice(2); }
      var id = 'custom:' + Date.now().toString(36) + random.slice(0, 10);
      var record = {
        id: id,
        name: handModelCleanName(inspection.name),
        format: inspection.format,
        size: inspection.size,
        triangles: inspection.triangles,
        drawCalls: inspection.drawCalls,
        createdAt: Date.now(),
        blob: file.slice(0, file.size, inspection.format === 'glb' ? 'model/gltf-binary' : 'model/gltf+json'),
      };
      await handModelPut(record);
      handModelRecords.push(record);
      handModelBusy = false;
      renderHandModelLibrary();
      await selectHandModelVisual(record.id);
      handModelSafeToast('已导入手部模型：' + record.name);
    } catch (error) {
      console.warn('[HandModel] import rejected:', error);
      handModelBusy = false;
      handModelSetStatus(String(error && error.message || '模型导入失败'), true);
      handModelSafeToast('模型导入失败：' + String(error && error.message || '格式不兼容'));
    }
  }

  async function deleteHandModel(id) {
    var record = handModelFindRecord(String(id || ''));
    if (!record || handModelBusy) return;
    if (typeof confirm === 'function' && !confirm('删除本机手部模型“' + record.name + '”？')) return;
    handModelBusy = true;
    try {
      await handModelDeleteRecord(record.id);
      handModelRecords = handModelRecords.filter(function (item) { return item.id !== record.id; });
      if (handModelSelectedId === record.id) await selectHandModelVisual('builtin:aurora');
      handModelBusy = false;
      renderHandModelLibrary();
      handModelSafeToast('已删除手部模型：' + record.name);
    } catch (error) {
      handModelBusy = false;
      handModelSetStatus('删除失败：' + String(error && error.message || error), true);
    }
  }

  function bindHandModelUi() {
    var input = document.getElementById('hand-model-file-input');
    if (input) input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (file) importHandModelFile(file);
    });
    var scale = document.getElementById('hand-model-scale');
    if (scale) {
      scale.value = String(handModelScale);
      var output = scale.parentElement && scale.parentElement.querySelector('output');
      if (output) output.textContent = Math.round(handModelScale * 100) + '%';
      scale.addEventListener('input', function () {
        handModelScale = Math.max(0.55, Math.min(2.2, Number(scale.value) || 1));
        writeStoredScale(handModelScale);
        if (output) output.textContent = Math.round(handModelScale * 100) + '%';
        if (typeof markRenderInteraction === 'function') markRenderInteraction('hand-model-scale', 500);
      });
    }
    window.addEventListener('resize', resizeHandModelRenderer);
  }

  async function initializeHandModelLibrary() {
    bindHandModelUi();
    renderHandModelLibrary();
    try {
      handModelRecords = (await handModelReadAll()).filter(function (item) {
        return item && /^custom:[a-zA-Z0-9_-]+$/.test(String(item.id || '')) && item.blob && item.size > 0 && item.size <= HAND_MODEL_MAX_FILE_BYTES;
      });
      if (handModelSelectedId.indexOf('custom:') === 0 && !handModelFindRecord(handModelSelectedId)) {
        handModelSelectedId = 'builtin:aurora';
        writeStoredSelection(handModelSelectedId);
      }
      renderHandModelLibrary();
      syncHandModelCardSelection();
      var selected = handModelFindBuiltin(handModelSelectedId) || handModelFindRecord(handModelSelectedId);
      handModelSetStatus('已选择' + (selected ? selected.name : '流光骨架') + '；开启手势时再加载，不占用 GPU。', false);
    } catch (error) {
      console.warn('[HandModel] local library unavailable:', error);
      handModelRecords = [];
      handModelSelectedId = 'builtin:aurora';
      renderHandModelLibrary();
      handModelSetStatus('本地模型库不可用，仍可使用内置模型。', true);
    }
  }

  async function activateHandModelVisual() {
    if (handModelInitializationPromise) {
      try { await handModelInitializationPromise; } catch (error) { }
    }
    if (!handModelGestureRunning()) return;
    await selectHandModelVisual(handModelSelectedId, true);
  }

  function deactivateHandModelVisual() {
    handModelBusy = false;
    releaseHandModelRenderer();
    var selected = handModelFindBuiltin(handModelSelectedId) || handModelFindRecord(handModelSelectedId);
    handModelSetStatus('已选择' + (selected ? selected.name : '流光骨架') + '；手势关闭时不占用 GPU。', false);
  }

  window.openHandModelPicker = openHandModelPicker;
  window.selectHandModelVisual = selectHandModelVisual;
  window.deleteHandModel = deleteHandModel;
  window.importHandModelFile = importHandModelFile;
  window.handModelVisuals = {
    activate: activateHandModelVisual,
    deactivate: deactivateHandModelVisual,
    renderFrame: renderHandModelFrame,
    clear: clearHandModelFrame,
    getSelection: function () { return handModelSelectedId; },
    getLimits: function () {
      return {
        maxFileBytes: HAND_MODEL_MAX_FILE_BYTES,
        maxTotalBytes: HAND_MODEL_MAX_TOTAL_BYTES,
        maxCustomCount: HAND_MODEL_MAX_CUSTOM_COUNT,
        maxTriangles: HAND_MODEL_MAX_TRIANGLES,
        maxDrawCalls: HAND_MODEL_MAX_DRAW_CALLS,
      };
    },
    inspectPayload: inspectHandModelPayload,
  };

  handModelInitializationPromise = initializeHandModelLibrary();
})();
