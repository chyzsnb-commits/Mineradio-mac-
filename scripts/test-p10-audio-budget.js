'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('P10 专用 512-bin 分析以 30Hz 独立门控，不能随显示器刷新率无限加热', () => {
  const mainLoop = read('public/js/modules/11-main-loop.js');

  assert.match(mainLoop, /function targetMainVoxelAudioFps\(now\)/);
  assert.match(mainLoop, /return 30;/, 'P10 播放期间的分析预算必须为 30Hz');
  assert.match(mainLoop, /consumeFrameGate\(mainFrameGates\.voxelAudio, now, 0, targetMainVoxelAudioFps\(now\), false, 'voxel-audio-pump'\)/);
  assert.match(mainLoop, /audio\.voxel-analysis/, '必须能从性能探针确认 P10 分析实际消耗');
  assert.doesNotMatch(mainLoop, /if \(voxPumpCap > 0[\s\S]*?else \{\s*pumpVoxelAudioFrame\(\)/, '正常负载不能恢复满帧专用分析器');
});

test('P10 画面帧不被音频门控同步降频，门控帧之间保留上一次频谱状态', () => {
  const mainLoop = read('public/js/modules/11-main-loop.js');
  const voxel = read('public/js/modules/02-visual/16-voxel-echo.js');

  assert.match(mainLoop, /MineradioSonicTopography\.update\(dt/, 'P10 视觉更新必须仍以主帧 dt 驱动');
  assert.match(voxel, /if \(!_voxPumped\) updateVoxelBands\(\)/, '未采样帧应复用频谱状态，而非跳过城市画面');
});
