'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('移除云瀑共振的运行时链路，但旧预设 11 必须回退到雨境', () => {
  const loader = read('public/js/index-loader.js');
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const persistence = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
  const archives = read('public/js/modules/07-fx/00-preset-archive-data.js');
  const mainLoop = read('public/js/modules/11-main-loop.js');
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');
  const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const workspace = read('public/js/modules/07-fx/09-console-workspace.js');
  const html = read('public/index.html');

  assert.equal(fs.existsSync(path.join(root, 'public/js/modules/02-visual/20-rainfall-resonance.js')), false,
    '完整删除后不应保留可加载的云瀑实现文件');
  assert.doesNotMatch(loader, /20-rainfall-resonance\.js/, '加载器不得请求已删除模块');
  assert.doesNotMatch(mainLoop, /rainResonance|updateRainResonance|rain-resonance/, '主循环不得保留云瀑每帧分支');
  assert.doesNotMatch(bindings, /rainResonance|rain-resonance/, '滑块绑定不得保留云瀑字段');
  assert.doesNotMatch(panel, /rainResonance|rain-resonance|云瀑共振/, '视觉控制台不得保留云瀑分组');
  assert.doesNotMatch(workspace, /rainResonance|rain-resonance|云瀑共振/, '控制台搜索索引不得保留云瀑项');
  assert.doesNotMatch(html, /rainResonance|rain-resonance|云瀑共振/, '页面不得保留云瀑控件');
  assert.doesNotMatch(defaults, /rainResonance/, '默认设置不得保留已删除功能字段');
  assert.doesNotMatch(archives, /云瀑共振/, '预设网格不得展示已删除预设');
  // 预设 11 已被词境穿行复用（用户拍板：双含义保留），允许出现在展示顺序中。
  // 旧云瀑存档仍由 HIDDEN_PRESET_INDICES + HIDDEN_PRESET_FALLBACK 迁移到雨境 9。

  assert.match(defaults, /HIDDEN_PRESET_INDICES\s*=\s*\[11\]/, '旧预设索引必须保留迁移识别');
  assert.match(defaults, /HIDDEN_PRESET_FALLBACK\s*=\s*9/, '旧云瀑预设必须回退至雨境');
  assert.match(persistence, /if\s*\(isPresetHidden\(savedPreset\)\)\s*savedPreset\s*=\s*HIDDEN_PRESET_FALLBACK/, '当前自动存档也必须迁移旧预设');
  assert.match(archives, /if\s*\(isPresetHidden\(savedPreset\)\)\s*savedPreset\s*=\s*HIDDEN_PRESET_FALLBACK/, 'DIY 存档与导入必须迁移旧预设');
});

test('移除云瀑后普通雨境和 P10 音域回响仍保留独立运行入口', () => {
  const loader = read('public/js/index-loader.js');
  const mainLoop = read('public/js/modules/11-main-loop.js');
  const presets = read('public/js/modules/07-fx/00-preset-archive-data.js');

  assert.match(loader, /18-rain-mood\.js/, '雨境模块必须保留');
  assert.match(loader, /16-voxel-echo\.js/, 'P10 音域回响模块必须保留');
  assert.match(mainLoop, /updateRainMood\(dt\)/, '雨境主循环入口必须保留');
  assert.match(mainLoop, /updateVoxelCity\(dt\)/, 'P10 主循环入口必须保留');
  assert.match(presets, /name: '雨境'/, '预设网格必须保留雨境');
  assert.match(presets, /name: '音域回响'/, '预设网格必须保留音域回响');
});
