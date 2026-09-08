const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/09-console-workspace.js'), 'utf8');
const presetGrid = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/04-preset-grid-uniforms.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/index.css'), 'utf8');

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{[\\s\\S]*?\n\\}'));
  assert.ok(match, selector + ' requires a CSS rule');
  return match[0];
}

test('底栏歌单架和歌词按钮不会被视觉控制台搬走', () => {
  assert.doesNotMatch(workspace, /fxConsoleItem\('shelf-toggle-btn'/, '歌单架开关只能留在底栏');
  assert.doesNotMatch(workspace, /fxConsoleItem\('lyrics-toggle-btn'/, '歌词校准按钮只能留在底栏');
  const modesStart = html.indexOf('<div class="control-cluster modes">');
  const shelf = html.indexOf('id="shelf-toggle-btn"', modesStart);
  const lyrics = html.indexOf('id="lyrics-toggle-btn"', modesStart);
  const volume = html.indexOf('id="volume-control"', modesStart);
  assert.ok(modesStart >= 0 && shelf > modesStart && lyrics > shelf && volume > lyrics, '两个入口需要依序留在底栏模式按钮组');
  assert.match(html.slice(shelf, shelf + 260), /onclick="toggleShelfFromControls\(\)"/, '底栏必须保留 3D 歌单架按钮');
  assert.match(html.slice(lyrics, lyrics + 220), /onclick="toggleLyricsPanel\(\)"/, '底栏必须保留歌词校准按钮');
});

test('桌面歌词在设置中保留独立控制，且不复用底栏歌词按钮', () => {
  assert.match(workspace, /fxConsoleItem\('t-desktopLyrics', '桌面歌词'/, '设置页需要引用真正的桌面歌词开关');
  assert.match(html, /id="t-desktopLyrics"[^>]*onclick="toggleFx\('desktopLyrics'\)"/, '桌面歌词开关需要保留独立事件');
  assert.match(html, /id="t-desktopLyricsClickThrough"[^>]*onclick="toggleFx\('desktopLyricsClickThrough'\)"/, '桌面歌词锁定开关需要保留');
});

test('音域回响系列卡只保留标题与三选一，并让选项更易读', () => {
  assert.doesNotMatch(presetGrid, /三个音域场景，选择一个作为当前视觉/, '系列卡不应保留冗余说明');
  const optionRule = cssBlock('.pc-series-option');
  assert.match(optionRule, /height:\s*36px\b/, '三个版本按钮需要放大到 36px');
  assert.match(optionRule, /min-height:\s*36px\b/, '三个版本按钮需要固定等高');
  assert.match(cssBlock('.pc-series-option-name'), /text-overflow:\s*ellipsis/, '版本标题必须截断');
  assert.match(cssBlock('.pc-series-option-desc'), /text-overflow:\s*ellipsis/, '版本说明必须截断');
});
