'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'public/js/modules/10-shell/01-hand-model-visuals.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const loaderSource = fs.readFileSync(path.join(root, 'public/js/index-loader.js'), 'utf8');
const gestureSource = fs.readFileSync(path.join(root, 'public/js/modules/10-shell/00-gesture-control.js'), 'utf8');

function createInspector() {
  const localStorage = { getItem() { return null; }, setItem() {} };
  const document = {
    getElementById() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { appendChild() {}, addEventListener() {}, setAttribute() {}, classList: { toggle() {} } }; },
  };
  const window = { addEventListener() {} };
  const context = {
    window,
    document,
    localStorage,
    indexedDB: undefined,
    console: { warn() {}, log() {}, error() {} },
    TextDecoder,
    ArrayBuffer,
    Uint8Array,
    DataView,
    Promise,
    Number,
    Math,
    Date,
    Object,
    String,
    RegExp,
    Error,
    isFinite,
    atob,
  };
  vm.runInNewContext(moduleSource, context, { filename: modulePath });
  return window.handModelVisuals.inspectPayload;
}

function jsonBuffer(doc) {
  const bytes = Buffer.from(JSON.stringify(doc), 'utf8');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function glbBuffer(doc) {
  const source = Buffer.from(JSON.stringify(doc), 'utf8');
  const paddedLength = Math.ceil(source.length / 4) * 4;
  const out = Buffer.alloc(12 + 8 + paddedLength, 0x20);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(paddedLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  source.copy(out, 20);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

function glbBufferWithChunks(chunks) {
  const normalized = chunks.map((chunk) => {
    const source = Buffer.isBuffer(chunk.data) ? chunk.data : Buffer.from(String(chunk.data), 'utf8');
    const paddedLength = Math.ceil(source.length / 4) * 4;
    const data = Buffer.alloc(paddedLength, chunk.type === 0x4e4f534a ? 0x20 : 0);
    source.copy(data);
    return { type: chunk.type, data };
  });
  const total = 12 + normalized.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let offset = 12;
  normalized.forEach((chunk) => {
    out.writeUInt32LE(chunk.data.length, offset);
    out.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(out, offset + 8);
    offset += 8 + chunk.data.length;
  });
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

function minimalDocument() {
  const byteLength = 36;
  return {
    asset: { version: '2.0' },
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.alloc(byteLength).toString('base64')}`, byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
}

function pngHeaderDataUri(width, height) {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

test('hand model payload accepts self-contained glTF 2 and GLB 2', () => {
  const inspect = createInspector();
  assert.equal(inspect(jsonBuffer(minimalDocument()), 'gltf').triangles, 1);
  const glbDoc = { asset: { version: '2.0' }, buffers: [{ byteLength: 0 }], nodes: [], scenes: [{ nodes: [] }], scene: 0 };
  assert.equal(inspect(glbBuffer(glbDoc), 'glb').format, 'glb');
});

test('hand model payload rejects external paths and remote textures', () => {
  const inspect = createInspector();
  const externalBuffer = minimalDocument();
  externalBuffer.buffers[0].uri = './hand.bin';
  assert.throws(() => inspect(jsonBuffer(externalBuffer), 'gltf'), /外部文件|data URI/);

  const remoteTexture = minimalDocument();
  remoteTexture.images = [{ uri: 'https://example.com/hand.png' }];
  assert.throws(() => inspect(jsonBuffer(remoteTexture), 'gltf'), /纹理必须内嵌/);

  const imageAsBuffer = minimalDocument();
  imageAsBuffer.buffers[0].uri = pngHeaderDataUri(32, 32);
  assert.throws(() => inspect(jsonBuffer(imageAsBuffer), 'gltf'), /外部文件|data URI/);
});

test('hand model payload enforces compression and geometry budgets', () => {
  const inspect = createInspector();
  const compressed = minimalDocument();
  compressed.extensionsRequired = ['KHR_draco_mesh_compression'];
  assert.throws(() => inspect(jsonBuffer(compressed), 'gltf'), /暂不支持压缩扩展/);

  const oversized = minimalDocument();
  const vertexCount = 6000;
  const byteLength = vertexCount * 12;
  oversized.buffers[0] = { uri: `data:application/octet-stream;base64,${Buffer.alloc(byteLength).toString('base64')}`, byteLength };
  oversized.bufferViews[0].byteLength = byteLength;
  oversized.accessors[0].count = vertexCount;
  oversized.meshes[0].primitives = Array.from({ length: 176 }, () => ({ attributes: { POSITION: 0 } }));
  assert.throws(() => inspect(jsonBuffer(oversized), 'gltf'), /模型面数超过 350000/);
});

test('hand model payload rejects sparse, non-triangle, animated, cyclic, and oversized declarations before parsing', () => {
  const inspect = createInspector();

  const sparse = minimalDocument();
  sparse.accessors[0].sparse = { count: 1, indices: {}, values: {} };
  assert.throws(() => inspect(jsonBuffer(sparse), 'gltf'), /sparse accessor/);

  const lines = minimalDocument();
  lines.meshes[0].primitives[0].mode = 1;
  assert.throws(() => inspect(jsonBuffer(lines), 'gltf'), /只支持三角形网格/);

  const animated = minimalDocument();
  animated.animations = [{ channels: [], samplers: [] }];
  assert.throws(() => inspect(jsonBuffer(animated), 'gltf'), /不加载模型动画/);

  const cyclic = minimalDocument();
  cyclic.nodes = [{ mesh: 0, children: [1] }, { children: [0] }];
  cyclic.scenes = [{ nodes: [0] }];
  assert.throws(() => inspect(jsonBuffer(cyclic), 'gltf'), /不能循环引用/);

  const declared = minimalDocument();
  declared.accessors = [{ componentType: 5121, count: 4000001, type: 'SCALAR' }];
  declared.meshes = [];
  assert.throws(() => inspect(jsonBuffer(declared), 'gltf'), /超过安全预算/);
});

test('hand model texture dimensions and aggregate decoded pixels are rejected before GLTFLoader', () => {
  const inspect = createInspector();
  const oversizedTexture = minimalDocument();
  oversizedTexture.images = [{ uri: pngHeaderDataUri(8192, 8192) }];
  assert.throws(() => inspect(jsonBuffer(oversizedTexture), 'gltf'), /边长不能超过 4096/);

  const aggregate = minimalDocument();
  aggregate.images = [
    { uri: pngHeaderDataUri(4096, 4096) },
    { uri: pngHeaderDataUri(4096, 4096) },
  ];
  assert.throws(() => inspect(jsonBuffer(aggregate), 'gltf'), /纹理总像素超过安全预算/);
});

test('hand model payload rejects malformed GLB headers and unsupported formats', () => {
  const inspect = createInspector();
  assert.throws(() => inspect(new ArrayBuffer(24), 'glb'), /GLB_MAGIC_INVALID/);
  assert.throws(() => inspect(jsonBuffer(minimalDocument()), 'obj'), /只接受/);
});

test('hand model GLB preflight rejects duplicate or reordered chunks so loader cannot see different content', () => {
  const inspect = createInspector();
  const safe = JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 0 }], nodes: [], scenes: [{ nodes: [] }], scene: 0 });
  const unsafe = JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'https://example.com/evil.bin', byteLength: 1 }] });
  const duplicateJson = glbBufferWithChunks([
    { type: 0x4e4f534a, data: safe },
    { type: 0x4e4f534a, data: unsafe },
  ]);
  assert.throws(() => inspect(duplicateJson, 'glb'), /GLB_JSON_DUPLICATE/);

  const duplicateBin = glbBufferWithChunks([
    { type: 0x4e4f534a, data: safe },
    { type: 0x004e4942, data: Buffer.alloc(4) },
    { type: 0x004e4942, data: Buffer.alloc(4) },
  ]);
  assert.throws(() => inspect(duplicateBin, 'glb'), /GLB_BIN_DUPLICATE_OR_OUT_OF_ORDER/);

  const binFirst = glbBufferWithChunks([
    { type: 0x004e4942, data: Buffer.alloc(4) },
    { type: 0x4e4f534a, data: safe },
  ]);
  assert.throws(() => inspect(binFirst, 'glb'), /GLB_JSON_MUST_BE_FIRST/);
});

test('hand model GLB 不能在 buffer[0] 使用 data URI，否则与 BIN 来源冲突', () => {
  const inspect = createInspector();
  const badBufferUri = {
    asset: { version: '2.0' },
    buffers: [{ uri: 'data:application/octet-stream;base64,AAAA', byteLength: 8 }],
    bufferViews: [],
    scenes: [{ nodes: [] }],
    scene: 0,
  };
  const buf = glbBufferWithChunks([
    { type: 0x4e4f534a, data: JSON.stringify(badBufferUri) },
    { type: 0x004e4942, data: Buffer.alloc(8) },
  ]);
  assert.throws(() => inspect(buf, 'glb'), /GLB 不允许 buffer 使用 uri|buffer.*uri/);
});

test('hand model payload rejects scenes/cameras 数量越界', () => {
  const inspect = createInspector();
  const manyScenes = {
    asset: { version: '2.0' },
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.alloc(16).toString('base64')}`, byteLength: 16 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 16 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: Array.from({ length: 5 }, () => ({ nodes: [0] })),
    scene: 0,
  };
  assert.throws(() => inspect(jsonBuffer(manyScenes), 'gltf'), /模型场景数量必须为 1 至/);

  const manyCameras = minimalDocument();
  manyCameras.cameras = Array.from({ length: 17 }, function () {
    return { type: 'perspective', perspective: { yfov: 0.8, aspectRatio: 1.778, znear: 0.1, zfar: 100 } };
  });
  assert.throws(() => inspect(jsonBuffer(manyCameras), 'gltf'), /模型相机超过 16 个/);
});

test('hand model payload rejects 多父节点导致 DAG 指针膨胀风险', () => {
  const inspect = createInspector();
  const shared = minimalDocument();
  shared.nodes = [{ mesh: 0, children: [2] }, { mesh: 0, children: [2] }, { mesh: 0 }];
  shared.scenes = [{ nodes: [0, 1] }];
  assert.throws(() => inspect(jsonBuffer(shared), 'gltf'), /不能被多个父节点复用/);
});

test('hand model 节点实例化会计入绘制预算，避免复用节点导致的对象数膨胀', () => {
  const inspect = createInspector();
  const repeated = {
    asset: { version: '2.0' },
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.alloc(512).toString('base64')}`, byteLength: 512 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 512 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: Array.from({ length: 100 }, () => ({ attributes: { POSITION: 0 } })) }],
    nodes: [{ mesh: 0 }, { mesh: 0 }],
    scenes: [{ nodes: [0, 1] }],
    scene: 0,
  };
  assert.throws(() => inspect(jsonBuffer(repeated), 'gltf'), /实例化绘制分组/);
});

test('hand model UI, persistence hooks, and official local assets are packaged', () => {
  assert.match(indexSource, /vendor\/GLTFLoader\.r128\.js/);
  assert.match(indexSource, /id="hand-model-grid"/);
  assert.match(indexSource, /id="hand-model-file-input"[^>]*[\s\S]*?\.glb,\.gltf/);
  assert.match(indexSource, /id="hand-model-canvas"/);
  assert.match(loaderSource, /10-shell\/01-hand-model-visuals\.js/);
  assert.ok(fs.statSync(path.join(root, 'public/vendor/GLTFLoader.r128.js')).size > 90000);
  assert.ok(fs.statSync(path.join(root, 'public/assets/hand-models/generic-hand-left.glb')).size > 90000);
  assert.ok(fs.statSync(path.join(root, 'public/assets/hand-models/generic-hand-right.glb')).size > 90000);
  assert.ok(fs.existsSync(path.join(root, 'public/assets/hand-models/LICENSE.md')));
});

test('hand model overlay consumes filtered landmarks without owning camera or background', () => {
  assert.match(gestureSource, /handModelVisuals\.renderFrame\(ctx, gestureHandSlots, gestureTwoHand/);
  assert.match(gestureSource, /handModelVisuals\.activate\(\)/);
  assert.match(gestureSource, /handModelVisuals\.deactivate\(\)/);
  assert.doesNotMatch(moduleSource, /getUserMedia|acquireSharedCameraStream|releaseSharedCameraStream/);
  assert.doesNotMatch(moduleSource, /scene\.background|perspective-bg-video/);
  assert.match(moduleSource, /HAND_MODEL_MAX_FILE_BYTES = 32 \* 1024 \* 1024/);
  assert.match(moduleSource, /HAND_MODEL_MAX_TOTAL_BYTES = 96 \* 1024 \* 1024/);
  assert.match(moduleSource, /HAND_MODEL_MAX_CUSTOM_COUNT = 8/);
  assert.match(moduleSource, /indexedDB\.open\(HAND_MODEL_DB, 1\)/);
});

test('hand model renderer is lazy and releases its WebGL context when gestures stop', () => {
  assert.match(moduleSource, /if \(!forceLoad && !handModelGestureRunning\(\)\)/);
  assert.match(moduleSource, /handModelRenderer\.forceContextLoss\(\)/);
  assert.match(moduleSource, /replaceChild\(freshCanvas, oldCanvas\)/);
  assert.match(moduleSource, /handModelInitializationPromise = initializeHandModelLibrary\(\)/);
  const initialization = moduleSource.slice(
    moduleSource.indexOf('async function initializeHandModelLibrary()'),
    moduleSource.indexOf('async function activateHandModelVisual()'),
  );
  assert.doesNotMatch(initialization, /selectHandModelVisual\(/);
});
