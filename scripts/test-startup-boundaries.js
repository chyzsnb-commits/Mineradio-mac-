'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '07-fx', '02-accent-background-controls.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const loginFlows = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '08-account', '03-login-modal-flows.js'), 'utf8');

test('主窗口外链处理必须拒绝非法 URL 并消费 shell.openExternal rejection', () => {
  const handler = main.slice(main.indexOf('mainWindow.webContents.setWindowOpenHandler'), main.indexOf('mainWindow.webContents.once', main.indexOf('mainWindow.webContents.setWindowOpenHandler')));
  assert.match(main, /function safeOpenExternalUrl\(value\)/);
  assert.match(handler, /safeOpenExternalUrl\(url\)/);
  assert.doesNotMatch(handler, /shell\.openExternal\(url\)\s*;/);
});

test('无封面时不得把 img.src 解析出的当前页面根地址送进封面代理', () => {
  const functions = [
    ['customBackgroundAlbumCoverSource', 'function customBackgroundActiveMedia()'],
    ['sonicWorkshopCurrentCoverDomSource', 'function sonicWorkshopCurrentCoverSampleSrc()'],
  ];
  functions.forEach(([name, next]) => {
    const sourceStart = background.indexOf('function ' + name + '()');
    const sourceEnd = background.indexOf('\n' + next, sourceStart);
    const source = background.slice(sourceStart, sourceEnd);
    assert.match(source, /getAttribute\(['"]src['"]\)/, name);
    assert.doesNotMatch(source, /currentSrc\s*\|\|\s*thumb\.src\s*\|\|/, name);
  });
});

test('启动页面不得创建空资源计时项，清空二维码图片必须移除 src 属性', () => {
  assert.doesNotMatch(html, /<img\b[^>]*\bsrc\s*=\s*["']["']/i);
  assert.doesNotMatch(loginFlows, /\.(?:src)\s*=\s*["']["']/);
  assert.match(loginFlows, /removeAttribute\(['"]src['"]\)/);
});

test('源码 Electron 启动必须规避 Electron 42 空资源安全警告异常，打包版不改动', () => {
  assert.match(main, /if \(!app\.isPackaged\) process\.env\.ELECTRON_DISABLE_SECURITY_WARNINGS\s*=\s*['"]1['"];/);
});

test('创建主窗口时不得在 loadURL 前无条件清空 Chromium 缓存', () => {
  const start = main.indexOf('async function createWindowInternal()');
  const end = main.indexOf('\napp.setName', start);
  assert.ok(start >= 0 && end > start, 'createWindowInternal() must remain discoverable');
  const startup = main.slice(start, end);
  const loadAt = startup.indexOf('await mainWindow.loadURL');
  assert.ok(loadAt >= 0, 'startup must load the local app URL');
  assert.doesNotMatch(
    startup.slice(0, loadAt),
    /(?:webContents\.session|session\.defaultSession)\.clearCache\s*\(/,
    'startup cache clearing forces every launch into a cold resource load'
  );
  assert.match(main, /session\.defaultSession\.clearCache\s*\(\)/, 'user-triggered cache cleanup must remain available');
});
