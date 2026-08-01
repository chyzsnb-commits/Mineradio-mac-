const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('音域回响不再把右侧歌架按体素预设强制隐藏', () => {
  const source = read('public/js/modules/04-shelf/01-manager-core.js');
  assert.match(source, /var shelfSuppressedByPreset = .*wallpaperMode/);
  assert.doesNotMatch(source, /shelfSuppressedByPreset = .*voxelCityActive\(\)/);
});

test('体素预设保留独立左侧歌单/队列面板，不再迁入 FX 控制台', () => {
  const source = read('public/js/modules/02-visual/16-voxel-echo.js');
  assert.match(source, /#playlist-panel/);
  assert.match(source, /独立.*左侧|通用.*侧栏|保留.*根层/);
  assert.doesNotMatch(source, /firstPage\.appendChild\(host\)/);
  assert.doesNotMatch(source, /host\.appendChild\(pl\)/);
});

test('歌架按钮使用通用右侧唤醒路径，旧 playlist 页名统一归一化到 shelf', () => {
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
  const workspace = read('public/js/modules/07-fx/09-console-workspace.js');
  assert.doesNotMatch(bindings, /setFxPanelTab\(['"]playlist['"]\)/);
  assert.match(bindings, /function toggleShelfFromControls\(\)[\s\S]*setShelfPinnedOpen/);
  assert.match(workspace, /playlist.*shelf|shelf.*playlist|normalize.*FxPanelTab/i);
});

test('界面页提供全局标准/极简密度控件', () => {
  const workspace = read('public/js/modules/07-fx/09-console-workspace.js');
  const html = read('public/index.html');
  assert.match(workspace, /fx-interface-density-seg/);
  assert.match(workspace, /uiDensity|ui-density/);
  assert.match(html, /id=["']fx-interface-density-seg["']/);
  assert.match(html, /data-ui-density=["']standard["']/);
  assert.match(html, /data-ui-density=["']minimal["']/);
});

test('界面密度模式只切换全局 class 并持久化，不改变预设', () => {
  const source = read('public/js/modules/00-state/02-preferences-ui-modes.js');
  assert.match(source, /UI_DENSITY_STORE_KEY/);
  assert.match(source, /function applyUiDensityMode\(/);
  assert.match(source, /function setUiDensityMode\(/);
  assert.match(source, /ui-density-minimal/);
  assert.match(source, /localStorage\.setItem\(UI_DENSITY_STORE_KEY/);
  assert.doesNotMatch(source, /setPreset\([^)]*uiDensity/);
});

test('界面密度读取非法值时回退标准', () => {
  const source = read('public/js/modules/00-state/02-preferences-ui-modes.js');
  const start = source.indexOf('function normalizeUiDensityMode');
  assert.notEqual(start, -1, '缺少界面密度归一化函数');
  const end = source.indexOf('\n}', start) + 2;
  const sandbox = {
    localStorage: {
      getItem() { return 'unexpected'; },
      setItem() {}
    }
  };
  vm.runInNewContext(source.slice(start, end) + '\nresult = normalizeUiDensityMode(localStorage.getItem("x"));', sandbox);
  assert.equal(sandbox.result, 'standard');
});

test('极简密度不会通过 display:none 删除核心侧栏入口', () => {
  const css = read('public/css/index.css');
  assert.match(css, /ui-density-minimal/);
  const minimalBlock = css.slice(css.indexOf('ui-density-minimal'));
  assert.doesNotMatch(minimalBlock, /ui-density-minimal[^\{]*\{[^}]*display\s*:\s*none/);
});

test('队列面板重新聚焦时取消失焦关闭竞态并复位冻结的 CSS 过渡', () => {
  const peek = read('public/js/modules/10-shell/02-peek-panels-upload.js');
  const shell = read('public/js/modules/06-lyrics/01-playlist-panel-shell.js');
  const power = read('public/js/modules/00-state/08-desktop-render-power.js');
  assert.match(peek, /playlistPanelWindowBlurTimer/);
  assert.match(peek, /function cancelPlaylistPanelCloseTimers\(\)/);
  assert.match(peek, /document\.addEventListener\(['"]visibilitychange['"]/);
  assert.match(peek, /window\.addEventListener\(['"]focus['"]/);
  assert.match(peek, /refreshPeekPanelsAfterResume/);
  assert.match(shell, /cancelPlaylistPanelCloseTimers\(\)/);
  assert.match(power, /refreshPeekPanelsAfterResume/);
});
