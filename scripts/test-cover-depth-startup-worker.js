'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} 未闭合`);
}

test('切歌时的封面深度在 Worker 中生成，不能在启动帧同步遍历像素', () => {
  const source = read('public/js/modules/02-visual/15-ripples-cover-depth.js');
  const heavyWork = readFunction(source, 'runHeavyCoverWork');

  assert.match(source, /function buildCoverEdgeAndDepthAsync\(/,
    '封面深度需要异步 Worker 通道，避免 runHeavyCoverWork 占用播放启动帧');
  assert.match(source, /new Worker\(['"]\/js\/cover-depth-worker\.js['"]\)/,
    'Worker 必须是可打包的同源静态资源，而不是 data URL');
  assert.match(heavyWork, /buildCoverEdgeAndDepthAsync\(cv\)/,
    'deferHeavy 的切歌路径必须委派给 Worker');
  assert.doesNotMatch(heavyWork, /var edgeCv\s*=\s*buildEdgeAndDepth\(cv\);/,
    '切歌的重型处理不能直接在主线程调用 buildEdgeAndDepth');
});

test('Worker 输出的是可直接上传的 ImageBitmap，不回传大块 RGBA 数据', () => {
  const worker = read('public/js/cover-depth-worker.js');
  assert.match(worker, /new OffscreenCanvas\(SIZE, SIZE\)/);
  assert.match(worker, /transferToImageBitmap\(\)/,
    '回传 ImageBitmap 可避免把 256×256 像素数组复制回渲染线程');
  assert.match(worker, /postMessage\(\{ id: data\.id, bitmap \}, \[bitmap\]\)/,
    'ImageBitmap 必须按 transferable 返回');
  assert.doesNotMatch(worker, /postMessage\([^\n]*imgOut\.data/,
    '不能把 RGBA 数组复制回主线程');
});

test('Worker 位图在主线程只落地为小画布，保留 AI 深度后续可写能力', () => {
  const source = read('public/js/modules/02-visual/15-ripples-cover-depth.js');
  const applyResult = readFunction(source, 'applyCoverDepthResult');
  assert.match(source, /function materializeCoverDepthCanvas\(/,
    'ImageBitmap 进入原有缓存与 AI 深度管线前需要转为画布');
  assert.match(applyResult, /materializeCoverDepthCanvas\(edgeCv\)/,
    '封面结果必须经小画布落地，不能让 AI 合并直接读取 ImageBitmap');
});
