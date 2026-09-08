'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('雨境玻璃逐 pass 记录 CPU 代价，GPU 计时能带上真实 pass 标签', () => {
  const glass = read('public/js/modules/02-visual/19-rain-glass.js');
  const rendererQuality = read('public/js/modules/01-scene/00-renderer-quality.js');

  ['scene', 'blur-horizontal', 'blur-vertical', 'field', 'composite'].forEach((pass) => {
    assert.match(glass, new RegExp("rain-glass\\." + pass), '缺少雨境 ' + pass + ' CPU 探针');
    assert.match(glass, new RegExp("rain-glass\\." + pass), '缺少雨境 ' + pass + ' GPU 标签');
  });
  assert.match(rendererQuality, /function beginRendererGpuSample\(label\)/);
  assert.match(rendererQuality, /rendererGpuTimer\.begin\([^,]+, label\)/);
  assert.match(rendererQuality, /gpuMsByLabel/);
  assert.match(rendererQuality, /item\.label === 'renderer\.main'/, '普通主场景仍必须更新负载面板的总 GPU 占比');
  assert.match(rendererQuality, /rendererGpuUsageLabel !== 'renderer\.main'/, '雨境分项采样时不能沿用旧的整帧 GPU 百分比');
  assert.match(glass, /RAIN_GLASS_GPU_PASS_LABELS = \[/);
  assert.match(glass, /rainGlassGpuPassCursor/);
  assert.match(glass, /label === gpuSampleLabel/, '每帧只能为轮转选中的一个 pass 启动 GPU 查询');
});

test('雨境玻璃只分频模糊输入，主画面、滴场和合成仍按每帧运行', () => {
  const glass = read('public/js/modules/02-visual/19-rain-glass.js');

  assert.match(glass, /RAIN_GLASS_BLUR_FPS = 30/);
  assert.match(glass, /RAIN_GLASS_BLUR_INTERVAL_MS = 1000 \/ RAIN_GLASS_BLUR_FPS/);
  assert.match(glass, /!state\.blurValid \|\| now - state\.lastBlurAt >= RAIN_GLASS_BLUR_INTERVAL_MS/);
  assert.match(glass, /state\.blurValid = true/);
  assert.match(glass, /rainGlassState\.blurValid = false/, '尺寸变化后必须强制下一帧刷新模糊纹理');
  assert.match(glass, /rain-glass\.scene[\s\S]*rain-glass\.field[\s\S]*rain-glass\.composite/, '三条全帧 pass 不得被模糊分频条件包住');
});
