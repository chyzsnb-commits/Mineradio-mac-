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

test('14 个预设的动效 tab 只保留基础组和所属专属组', () => {
  const source = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const visibilitySource = source.slice(0, source.indexOf('function ensureHomeWaveTrackBars()'));
  const keys = ['base', 'particles', 'rain-mood', 'rain-resonance', 'vox-echo', 'sonic-terrain', 'sonic-audio', 'sonic-blocks', 'sonic-we'];
  const groups = keys.map(createGroup);
  const sandbox = {
    fx: { preset: 0 },
    SONIC_PRESET_INDEX: 12,
    SONIC_WORKSHOP_PRESET_INDEX: 13,
    document: { querySelectorAll() { return groups; } }
  };
  vm.runInNewContext(visibilitySource, sandbox);

  const expected = {
    0: ['base', 'particles'], 1: ['base', 'particles'], 2: ['base', 'particles'], 3: ['base', 'particles'],
    4: ['base', 'particles'], 5: ['base', 'particles'], 6: ['base', 'particles'], 7: ['base', 'particles'], 8: ['base', 'particles'],
    9: ['base', 'rain-mood'],
    10: ['base', 'vox-echo'],
    11: ['base', 'rain-resonance'],
    12: ['base', 'sonic-terrain', 'sonic-audio', 'sonic-blocks'],
    13: ['base', 'sonic-we']
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
