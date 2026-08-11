'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('节拍全量分析不会占用新歌的启动窗口', () => {
  const state = read('public/js/modules/00-state/03-beat-dj-state.js');
  const prefetch = read('public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js');

  assert.match(state, /minPlaybackSec:\s*(?:1[2-9]|[2-9]\\d)/,
    '当前歌曲必须至少稳定播放 12 秒后才允许全量节拍分析');
  assert.match(state, /prefetchMinPlaybackSec:\s*(?:2[4-9]|[3-9]\\d)/,
    '下一首节拍预热必须避开切歌后至少 24 秒');
  assert.match(prefetch, /function beatAnalysisPlaybackIsStable\(/,
    '需要集中判断播放是否已稳定，避免两个分析入口各自漂移');
  assert.match(prefetch, /scheduleStableBeatAnalysis\(startAnalysis, token\)/,
    '当前歌曲的分析必须在稳定窗口前持续等待');
  assert.match(prefetch, /if \(!beatAnalysisPlaybackIsStable\(token, beatAnalysisConfig\.prefetchMinPlaybackSec\)\) \{[\s\S]*scheduleQueueBeatPrefetch/,
    '队列预热必须在稳定窗口前重新排队，而不能直接解码');
  assert.doesNotMatch(prefetch, /scheduleAnalysisTask\(startAnalysis, beatAnalysisConfig\.idleTimeout\)/,
    '不能依赖带超时的 idle callback 强制在繁忙帧启动重任务');
});
