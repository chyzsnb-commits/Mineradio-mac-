'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createGroup(key) {
  const classes = new Set();
  return {
    getAttribute(name) { return name === 'data-fx-console-group' ? key : ''; },
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) { return classes.has(name); }
    }
  };
}

test('可用预设的动效 tab 只保留基础组和所属专属组', () => {
  const source = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const visibilitySource = source.slice(0, source.indexOf('function ensureHomeWaveTrackBars()'));
  const keys = ['base', 'particles', 'rain-mood', 'vox-echo', 'audio-spectrum', 'sonic-terrain', 'sonic-audio', 'sonic-blocks', 'sonic-we'];
  const groups = keys.map(createGroup);
  const sandbox = {
    fx: { preset: 0 },
    SONIC_PRESET_INDEX: 12,
    SONIC_WORKSHOP_PRESET_INDEX: 13,
    document: { querySelectorAll() { return groups; } }
  };
  vm.runInNewContext(visibilitySource, sandbox);

  const expected = {
    0: ['base', 'particles', 'audio-spectrum'], 1: ['base', 'particles', 'audio-spectrum'], 2: ['base', 'particles', 'audio-spectrum'], 3: ['base', 'particles', 'audio-spectrum'],
    4: ['base', 'particles', 'audio-spectrum'], 5: ['base', 'particles', 'audio-spectrum'], 6: ['base', 'particles', 'audio-spectrum'], 7: ['base', 'particles', 'audio-spectrum'], 8: ['base', 'particles', 'audio-spectrum'],
    9: ['base', 'rain-mood', 'audio-spectrum'],
    10: ['base', 'vox-echo', 'audio-spectrum'],
    11: ['base', 'particles', 'audio-spectrum'],
    12: ['base', 'audio-spectrum', 'sonic-terrain', 'sonic-audio', 'sonic-blocks'],
    13: ['base', 'sonic-we', 'audio-spectrum']
  };

  Object.entries(expected).forEach(([preset, visible]) => {
    sandbox.fx.preset = Number(preset);
    sandbox.updateMineradioMotionGroupVisibility();
    groups.forEach((group, index) => {
      assert.equal(group.classList.contains('fx-sonic-hidden'), !visible.includes(keys[index]), `preset ${preset}: ${keys[index]}`);
    });
  });
});

test('首次归位、输入刷新和切预设都同步动效组显隐，旧体素 CSS 不再覆盖控制台', () => {
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const consoleWorkspace = read('public/js/modules/07-fx/09-console-workspace.js');
  const presetGrid = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');
  const css = read('public/css/index.css');

  assert.match(panel, /function updateFxInputs\(\)[\s\S]*?updateMineradioMotionGroupVisibility\(\)/);
  assert.match(consoleWorkspace, /panel\.setAttribute\('data-console-layout', 'task-first-v2'\);[\s\S]*?updateMineradioMotionGroupVisibility\(\)/);

  const setPresetSource = presetGrid.slice(presetGrid.indexOf('function setPreset('), presetGrid.indexOf('function syncFxUniforms('));
  assert.equal((setPresetSource.match(/updateMineradioMotionGroupVisibility\(\)/g) || []).length, 1, '切预设只能触发一次动效组刷新');
  assert.doesNotMatch(css, /body\.vox-on \[data-fx-page="motion"\] > \*:not\(#vox-fx-section\)/, '旧体素 CSS 不能按控制台动效页直接子节点隐藏分组');
});

test('频谱面板是通用动效组，声波地形八段权重仍保持预设 12 专属', () => {
  const workspace = read('public/js/modules/07-fx/09-console-workspace.js');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');

  assert.match(workspace, /\{ key: 'audio-spectrum', title: '频谱面板'/);
  ['t-sonicAudioMonitorEnabled', 't-sonicAudioAutoTrack', 'sonic-audio-monitor-toggle',
    'fx-sonicaudiosensitivity', 'fx-sonicaudiobandstart', 'fx-sonicaudiobandend',
    'fx-sonicaudiothreshold', 'fx-sonicaudiopulse'].forEach((id) => {
    assert.match(workspace, new RegExp("fxConsoleItem\\('" + id + "'"));
  });
  assert.match(panel, /'audio-spectrum': true/);
  assert.doesNotMatch(panel, /SONIC_ORIGINAL_FX_CONTROL_IDS = \[[\s\S]*fx-sonic-audio-section/);
});

test('三个音域回响在视觉预设入口合并为同一张三选一卡片', () => {
  const grid = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');
  const css = read('public/css/index.css');

  assert.match(grid, /SONIC_SERIES_PRESET_INDICES/);
  assert.match(grid, /SONIC_SERIES_PRESET_INDICES = \[10, 12, 13\]/);
  assert.match(grid, /preset-series-card/);
  assert.match(grid, /pc-series-option/);
  assert.match(grid, /data-preset="' \+ i/);
  assert.match(grid, /setPreset\(' \+ i/);
  assert.match(grid, /data-preset-group="sonic-series"/);
  assert.match(grid, /pc-series-option[\s\S]*classList\.toggle\('active'/);
  assert.match(css, /\.preset-series-card/);
  assert.match(css, /\.pc-series-option/);
});

test('体素预设保留普通左侧歌单和统一 3D 歌架入口', () => {
  const voxel = read('public/js/modules/02-visual/16-voxel-echo.js');
  const shelfManager = read('public/js/modules/04-shelf/01-manager-core.js');
  const shelfInteractions = read('public/js/modules/04-shelf/05-card-interactions.js');

  assert.doesNotMatch(voxel, /_voxDockPlaylist/);
  assert.doesNotMatch(shelfManager, /shelfSuppressedByPreset\s*=\s*\(typeof voxelCityActive/);
  assert.match(shelfInteractions, /var shouldOpen = shelfHardHidden \|\| !shelfPinnedOpen/);
  assert.match(shelfInteractions, /if \(shouldOpen\)\s*\{\s*shelfHardHidden = false/);
  assert.match(shelfInteractions, /setShelfPinnedOpen\(shouldOpen, true\)/);
});

test('遗留的歌词动画和渲染性能控件归入职责分组，颜色弹窗不生成其他设置', () => {
  const workspace = read('public/js/modules/07-fx/09-console-workspace.js');

  assert.match(workspace, /\{ key: 'motion', title: '歌词动画'[\s\S]*?fxConsoleItem\('fx-lyricscalepulse', '缩放脉动'/);
  assert.match(workspace, /\{ key: 'performance', title: '性能与后台'[\s\S]*?fxConsoleItem\('fx-renderscale', '渲染分辨率'/);
  assert.match(workspace, /control\.closest\('\.cover-color-pop,\.color-lab-pop,\.cover-color-loupe'\)/);
});
