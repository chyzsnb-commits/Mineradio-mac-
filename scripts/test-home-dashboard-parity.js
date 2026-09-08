'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Mac 首页保留现有入口并提供 Windows 风格的下一首与每日内容', () => {
  const html = read('public/index.html');
  const home = read('public/js/modules/05-playback/03-home-discover-weather.js');

  assert.match(html, /id="home-recent-list"/);
  assert.match(html, /id="home-next-up"/);
  assert.match(html, /id="home-daily-brief"/);
  assert.match(home, /function renderHomeNextUp\(/);
  assert.match(home, /function renderHomeDailyBrief\(/);
  assert.match(home, /playQueue/);
  assert.match(home, /homeDiscoverState\.songs/);
});
