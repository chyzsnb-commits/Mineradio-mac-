'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');

test('macOS 命令行启动和恢复窗口必须显式激活 Electron 应用', () => {
  assert.match(main, /function activateMainWindow\(\)/);
  assert.match(main, /activateMainWindow\(\);[\s\S]{0,260}mainWindow\.show\(\);/);
  assert.match(main, /function activateMainWindow\(\)[\s\S]{0,240}app\.focus\(\{\s*steal:\s*true\s*\}\)/);
  assert.match(main, /function focusMainWindow\(\)[\s\S]{0,320}activateMainWindow\(\);/);
});

test('主窗口加载完成后必须再次激活并提升窗口层级', () => {
  assert.match(main, /function scheduleMainWindowActivation\(\)/,
    '启动时需要独立的延迟激活序列，不能只依赖 ready-to-show 的单次调用');
  assert.match(main, /mainWindow\.moveTop\(\)/,
    'macOS 窗口需要提升到前台应用的窗口层级');
  assert.match(main, /await mainWindow\.loadURL\([\s\S]*?scheduleMainWindowActivation\(/,
    'loadURL 完成后必须触发一次激活');
});
