'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
const wallpaper = fs.readFileSync(path.join(root, 'desktop/wallpaper-mode.js'), 'utf8');

test('macOS 主窗口允许壁纸模式覆盖菜单栏后的完整屏幕', () => {
  assert.match(main, /process\.platform === 'darwin'[\s\S]*enableLargerThanScreen:\s*true/);
});

test('壁纸主体使用 display.bounds 而不是避开菜单栏的 workArea', () => {
  const targetBounds = wallpaper.match(/function targetBounds\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(targetBounds, '缺少 targetBounds');
  assert.match(targetBounds[1], /display\.bounds/);
  assert.doesNotMatch(targetBounds[1], /workArea/);
  assert.match(wallpaper, /win\.setBounds\(targetBounds\(\), false\)/);
});

test('壁纸菜单栏状态项只保留 MR 图标以减少被系统挤掉的概率', () => {
  assert.match(wallpaper, /wallpaperTray\.setTitle\(''\)/);
  assert.doesNotMatch(wallpaper, /wallpaperTray\.setTitle\('[^']+'\)/);
});
