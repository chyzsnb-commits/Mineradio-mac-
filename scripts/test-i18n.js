const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/i18n.js'), 'utf8');

test('中英文切换层提供持久化语言开关和动态节点观察', () => {
  assert.match(source, /localStorage\.setItem\('mineradio-language'/);
  assert.match(source, /toggleMineradioLanguage/);
  assert.match(source, /document\.documentElement\.lang/);
  assert.match(source, /childList:\s*true,\s*subtree:\s*true/);
  assert.match(source, /Switch to English/);
  assert.match(source, /Search songs, artists/);
});

test('英文翻译不会改写歌曲标题等用户内容节点', () => {
  assert.match(source, /\.song-title,\.search-result-title,\.artist-name,\.track-name,\.song-name/);
});
