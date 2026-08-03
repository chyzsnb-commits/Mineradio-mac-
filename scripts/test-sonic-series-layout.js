const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/index.css'), 'utf8');
const presetGrid = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/04-preset-grid-uniforms.js'), 'utf8');
const lyricStage = fs.readFileSync(path.join(root, 'public/js/modules/02-visual/14-stage-lyrics-rendering.js'), 'utf8');
const lyricActions = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/06-track-detail-lyrics-actions.js'), 'utf8');

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{[\\s\\S]*?\\n\\}'));
  assert.ok(match, selector + ' 需要独立 CSS 规则');
  return match[0];
}

test('所有视觉预设卡固定同一尺寸，音域系列按钮压缩到卡片内', () => {
  const cardRule = cssBlock('.preset-card');
  const seriesRule = cssBlock('.preset-series-card');
  const optionsRule = cssBlock('.pc-series-options');
  const optionRule = cssBlock('.pc-series-option');
  assert.match(cardRule, /(?:^|\n)\s*height:\s*94px\b/, '普通预设卡需要固定高度');
  assert.match(cardRule, /box-sizing:\s*border-box/, '预设卡高度需要包含边框和内边距');
  assert.match(seriesRule, /(?:^|\n)\s*height:\s*94px\b/, '音域系列外卡必须与普通预设卡同高');
  assert.match(optionsRule, /grid-template-columns:\s*repeat\(3\s*,\s*minmax\(0,\s*1fr\)\)/, '三个音域版本需要横向压缩排列');
  assert.match(optionRule, /min-height:\s*30px\b/, '音域版本按钮需要使用紧凑高度');
  assert.match(optionRule, /height:\s*30px\b/, '三个音域版本按钮需要固定同高');
});

test('音域回响系列卡在桌面预设网格中与 emily 并列', () => {
  const cardRule = css.match(/\.preset-series-card\s*\{[\s\S]*?\n\}/);
  assert.ok(cardRule, '系列卡需要独立 CSS 规则');
  assert.match(cardRule[0], /grid-column:\s*auto\b/, '系列卡不能继续占满整行');
  assert.doesNotMatch(cardRule[0], /grid-column:\s*1\s*\/\s*-1/, '桌面系列卡不能固定为整行');
});

test('音域回响系列卡在窄面板自动回到整行且选项不溢出', () => {
  assert.match(css, /@media[^{]*\{[\s\S]*?\.preset-series-card\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/, '窄面板需要整行回退');
  assert.match(cssBlock('.pc-series-options'), /grid-template-columns:\s*repeat\(3/, '系列选项需要保留三选一结构');
});

test('切入音域回响后会主动唤醒已有歌词舞台但不强开用户关闭的歌词', () => {
  assert.match(lyricStage, /function\s+refreshVoxelLyricStageAfterPresetChange\s*\(/, '需要 p10 歌词唤醒函数');
  assert.match(presetGrid, /refreshVoxelLyricStageAfterPresetChange\s*\(/, '切换预设必须调用歌词唤醒函数');
  assert.match(lyricStage, /particleLyrics\s*===\s*false/, '歌词唤醒不能覆盖用户关闭状态');
});

test('歌词异步到达时会重新唤醒已切入的音域回响', () => {
  const helper = lyricStage.match(/function\s+refreshVoxelLyricStageAfterLyricsReady\s*\([\s\S]*?\n\}/);
  assert.ok(helper, '需要歌词就绪后的 p10 唤醒入口');
  const calls = [];
  const sandbox = {
    fx: { preset: 10, particleLyrics: true },
    VOXEL_PRESET_INDEX: 10,
    lyricsLines: [{ text: 'ready' }],
    refreshVoxelLyricStageAfterPresetChange(reason) {
      calls.push(reason);
      return true;
    }
  };
  vm.runInNewContext(helper[0], sandbox);
  assert.equal(sandbox.refreshVoxelLyricStageAfterLyricsReady('lyrics-ready'), true);
  assert.deepEqual(calls, ['lyrics-ready']);
  const applyBlock = lyricActions.match(/function\s+applyLyricsState\([\s\S]*?\n\}\nfunction\s+applyOriginalLyricsState/);
  assert.ok(applyBlock, '需要定位歌词状态应用入口');
  assert.match(applyBlock[0], /refreshVoxelLyricStageAfterLyricsReady\(['"]lyrics-ready['"]\)/, '歌词状态应用后必须通知 p10 唤醒');
});
