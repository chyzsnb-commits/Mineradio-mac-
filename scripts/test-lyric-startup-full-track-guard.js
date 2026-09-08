'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js'), 'utf8');

function readFunction(name) {
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

test('完整轨道歌词只在真正空闲时建模，不能挤占新歌启动和交互帧', () => {
  const sandbox = {
    fx: { particleLyrics: true },
    audio: { src: 'track.mp3', paused: false, ended: false },
    stageLyricTrackSwitchBootstrapUntil: 0,
    stageLyricNowMs: () => 1000,
    isRenderInteractionActive: () => false,
    isDocumentScrollActive: () => false,
  };
  vm.runInNewContext(readFunction('stageLyricCanBuildFullTrackNow'), sandbox);

  assert.equal(sandbox.stageLyricCanBuildFullTrackNow({ timeRemaining: () => 100 }), false,
    '新歌正在播放时必须保留轻量歌词，不能同步创建完整轨道');

  sandbox.audio.paused = true;
  assert.equal(sandbox.stageLyricCanBuildFullTrackNow({ timeRemaining: () => 20 }), false,
    '空闲回调预算不足时不能以 timeout 强制执行重建');
  assert.equal(sandbox.stageLyricCanBuildFullTrackNow({ timeRemaining: () => 100 }), true,
    '暂停且有足够空闲预算时允许预热完整轨道');

  sandbox.stageLyricTrackSwitchBootstrapUntil = 5800;
  assert.equal(sandbox.stageLyricCanBuildFullTrackNow({ timeRemaining: () => 100 }), false,
    '音频尚未起播的切歌启动窗口也必须禁止完整轨道抢占');
  sandbox.stageLyricTrackSwitchBootstrapUntil = 0;

  sandbox.isRenderInteractionActive = () => true;
  assert.equal(sandbox.stageLyricCanBuildFullTrackNow({ timeRemaining: () => 100 }), false,
    '镜头、歌架等交互期间不能抢占主线程');
});

test('完整轨道预热不再用 idle timeout 强制闯入播放期', () => {
  const warmup = readFunction('scheduleStageLyricFullTrackWarmup');
  assert.doesNotMatch(warmup, /requestIdleCallback\(run,\s*\{\s*timeout\s*:/,
    '带 timeout 的 idle callback 会在繁忙播放期强制执行 76ms 网格创建');
  assert.match(warmup, /stageLyricCanBuildFullTrackNow\(deadline\)/,
    '执行前必须重新核对播放、交互和 idle 预算');
  assert.match(readFunction('scheduleStageLyricPrewarmForIndex'), /stageLyricCanBuildFullTrackNow\(\)/,
    'P10 和工坊的 lyrics-ready 入口也必须统一降到轻量预热');
  assert.doesNotMatch(readFunction('markStageLyricsPlaybackResume'), /stageLyricTrackSwitchBootstrapUntil\s*=\s*0/,
    '音频刚起播不能提前解除切歌窗口守卫');
});

test('高密度多行歌词的轻量轨道不能反向扩大成二十多行', () => {
  const sandbox = {
    lyricsLines: Array.from({ length: 60 }, () => ({ text: '一段用于压力测试的歌词' })),
    fx: { lyricTranslationMode: 'multi' },
    normalizeLyricDisplayMode: (value) => value,
    lyricDisplayLineCountForMode: () => 3,
    normalizeLyricTranslationMode: (value) => value,
    stageLyricPreferLightweightTrack: () => true,
    Math,
  };
  vm.runInNewContext(readFunction('lyricMeshTrackWindow'), sandbox);
  const windowInfo = sandbox.lyricMeshTrackWindow(0, 'cinema', { lightweightTrack: true });
  assert.ok(windowInfo.end - windowInfo.start + 1 <= 8,
    '轻量轨道只保留当前可见上下文，不能因中文密度扩到 20-38 行');
});
