'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  clearDirectoryContents,
  safeWallpaperLibraryFileName,
  scanDirectoryUsage,
} = require('../desktop/cache-manager');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('缓存统计只计算目录内普通文件，清理后保留根目录且不越界', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-cache-manager-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-cache-manager-outside-'));
  t.after(() => {
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(fixture, 'nested'));
  fs.writeFileSync(path.join(fixture, 'a.bin'), Buffer.alloc(11));
  fs.writeFileSync(path.join(fixture, 'nested', 'b.bin'), Buffer.alloc(17));
  fs.writeFileSync(path.join(outside, 'keep.bin'), Buffer.alloc(23));
  fs.symlinkSync(outside, path.join(fixture, 'linked-outside'));

  const before = await scanDirectoryUsage(fixture);
  assert.deepEqual(before, { bytes: 28, files: 2 });

  const removed = await clearDirectoryContents(fixture);
  assert.equal(removed.files, 2);
  assert.equal(fs.existsSync(fixture), true);
  assert.equal(fs.existsSync(path.join(outside, 'keep.bin')), true);
  assert.deepEqual(await scanDirectoryUsage(fixture), { bytes: 0, files: 0 });
});

test('壁纸镜像文件名不会携带路径或危险字符，并保留可识别扩展名', () => {
  assert.equal(safeWallpaperLibraryFileName('../A\\B:测试?.mp4', 'video/mp4', 'bg-1'), 'bg-1-A_B_.mp4');
  assert.equal(safeWallpaperLibraryFileName('', 'image/webp', 'bg-2'), 'bg-2-wallpaper.webp');
});

test('壁纸文件夹、缓存分类和安全清理通过受限 IPC 暴露', () => {
  const main = read('desktop/main.js');
  const preload = read('desktop/preload.js');
  assert.match(main, /function wallpaperLibraryDirectoryPath\(/);
  assert.match(main, /ipcMain\.handle\('mineradio-wallpaper-local-open'/);
  assert.match(main, /ipcMain\.handle\('mineradio-wallpaper-local-store'/);
  assert.match(main, /ipcMain\.handle\('mineradio-cache-clear-selected'/);
  assert.match(main, /session\.defaultSession\.clearCache\(\)/);
  assert.match(preload, /openLocalWallpaperFolder:/);
  assert.match(preload, /storeLocalWallpaperMedia:/);
  assert.match(preload, /clearCacheCategories:/);
});

test('右侧背景媒体和缓存面板提供打开、全清与自定义清理入口', () => {
  const html = read('public/index.html');
  const cacheUi = read('public/js/modules/07-fx/08-cache-storage-settings.js');
  assert.match(html, /打开壁纸文件夹/);
  assert.match(html, /清理安全缓存/);
  assert.match(html, /自定义清理/);
  assert.match(cacheUi, /openMineradioWallpaperFolder/);
  assert.match(cacheUi, /clearMineradioSafeCaches/);
  assert.match(cacheUi, /openMineradioCacheCleanupDialog/);
});

test('裁切拖动只更新轻量预览，停止拖动后才保存，不重载背景媒体', () => {
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
  const controls = read('public/js/modules/07-fx/02-accent-background-controls.js');
  assert.match(bindings, /updateCustomBackgroundCropPreview\(\)/);
  assert.match(bindings, /scheduleCustomBackgroundCropPersist\(\)/);
  assert.match(controls, /function updateCustomBackgroundCropPreview\(/);
  assert.match(controls, /function scheduleCustomBackgroundCropPersist\(/);
  assert.match(controls, /performance\.mark\('mineradio-bg-crop-input'\)/);
  assert.match(controls, /updateCustomBackgroundControls\(\{ cropOnly: true \}\)/);
  assert.match(controls, /function updateCustomBackgroundControls\(\) \{\s+var options = arguments\[0\];\s+if \(options && options\.cropOnly === true\) \{[\s\S]*?applyCustomBackgroundCropVars\([\s\S]*?\);\s+return;\s+\}\s+applyCustomBackground\(\);/);
  assert.match(bindings, /backgroundMediaCropX'[\s\S]*?updateCustomBackgroundCropPreview\(\);\s+scheduleCustomBackgroundCropPersist\(\);\s+return;/);
});
