'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const rendering = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js'), 'utf8');

test('跨句交叉窗口不安排下一个歌词纹理预热', () => {
  assert.match(rendering, /function stageLyricCrossfadePrewarmDelay\(\)/,
    '需要用一个明确的过渡后预热延迟，不能把固定 24ms 建图塞进交叉动画');
  assert.match(rendering, /scheduleStageLyricPrewarmForIndex\(nextIndex,\s*'track-demand-light',\s*stageLyricCrossfadePrewarmDelay\(\)\)/,
    '当前句切换后预热下一句必须等待交叉退出窗口结束');
  assert.doesNotMatch(rendering, /scheduleStageLyricPrewarmForIndex\(nextIndex,\s*'track-demand-light',\s*24\)/,
    '24ms 会在 incoming/outgoing 同屏时同步栅格化，不能保留');
});
