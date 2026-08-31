'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('壁纸库渲染层面板与入口已接线', () => {
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  const preload = read('desktop/preload.js');
  const indexHtml = read('public/index.html');
  const loader = read('public/js/index-loader.js');
  const css = read('public/css/index.css');

  assert.match(loader, /07-fx\/10-wallpaper-library-panel\.js/);
  assert.match(preload, /wallpaperWindowsDiscover:/);
  assert.match(preload, /wallpaperWindowsConnect:/);
  assert.match(preload, /wallpaperWindowsExportDownload:/);
  assert.match(panel, /function discoverWindowsWallpaperSources\(/);
  assert.match(panel, /function connectWindowsWallpaperSource\(/);
  assert.match(panel, /function selectWallpaperLibraryRecord\(/);
  assert.match(panel, /wallpaper-live-preview/);
  assert.match(panel, /wallpaperLibraryStopLivePreview/);
  assert.doesNotMatch(panel, /getDisplayMedia/);
  assert.ok(indexHtml.includes('id="wallpaper-library-modal"'), 'index.html 应包含壁纸库面板');
  assert.ok(indexHtml.includes('onclick="openWallpaperLibraryPanel()"'), '应有壁纸库入口');
  assert.ok(indexHtml.includes('Windows 壁纸库'), '应明确标识 Windows 壁纸库入口');
  assert.match(css, /\.wallpaper-library-modal/);
  assert.match(css, /\.wallpaper-library-list/);
  assert.match(css, /\.wallpaper-library-preview/);
  assert.match(css, /\.wallpaper-live-preview/);
});
