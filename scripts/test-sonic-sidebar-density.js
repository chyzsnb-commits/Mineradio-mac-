const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('右键唤醒歌架会主动标记渲染交互并请求主循环', () => {
  const source = read('public/js/modules/04-shelf/05-card-interactions.js');
  assert.match(source, /contextmenu[\s\S]*markRenderInteraction\(['"]shelf-context['"]/);
  assert.match(source, /contextmenu[\s\S]*(requestMainLoopAnimationFrame|wakeMainLoopFromBackground)/);
});

test('音域回响远景相机会给歌架单独的布局尺度', () => {
  const layout = read('public/js/modules/04-shelf/00-layout-hover.js');
  assert.match(layout, /voxelCityActive\(\)/);
  assert.match(layout, /voxelShelfScale/);
  assert.match(layout, /sideX:[^\n]*shelfOffsetScale/);
  assert.match(layout, /sideScale:[^\n]*sideScaleFactor/);
});

test('界面密度功能已从界面页移除', () => {
  const workspace = read('public/js/modules/07-fx/09-console-workspace.js');
  const html = read('public/index.html');
  assert.doesNotMatch(workspace, /fx-interface-density-seg|uiDensity|ui-density/);
  assert.doesNotMatch(html, /fx-interface-density-seg|data-ui-density|界面密度/);
});

test('界面密度状态与启动应用逻辑已移除', () => {
  const source = read('public/js/modules/00-state/02-preferences-ui-modes.js');
  const stores = read('public/js/modules/00-state/00-core-stores.js');
  const startup = read('public/js/modules/10-shell/05-startup-bindings.js');
  assert.doesNotMatch(source, /UI_DENSITY_STORE_KEY|normalizeUiDensityMode|readUiDensityPreference|saveUiDensityPreference|applyUiDensityMode|setUiDensityMode|bindUiDensityControls/);
  assert.doesNotMatch(stores, /UI_DENSITY_STORE_KEY|uiDensityMode/);
  assert.doesNotMatch(startup, /applyUiDensityMode|uiDensityMode/);
});

test('界面密度专用 CSS 已移除', () => {
  const css = read('public/css/index.css');
  assert.doesNotMatch(css, /ui-density-minimal|ui-density-gap|ui-density-panel-pad/);
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
