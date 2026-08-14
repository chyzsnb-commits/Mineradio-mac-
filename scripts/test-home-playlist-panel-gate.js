'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'public/js/modules/10-shell/02-peek-panels-upload.js'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/01-playlist-panel-shell.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/04-home-empty-wallpaper.js'), 'utf8');

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  let depth = 0;
  let opened = false;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') { depth += 1; opened = true; }
    if (source[i] === '}' && opened && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} must be complete`);
}

test('歌单面板只允许在听歌页唤起', () => {
  const source = readFunction(home, 'canOpenPlaylistPanel');
  const context = { emptyHomeActive: true, document: { body: { classList: { contains: () => false } } } };
  vm.runInNewContext(`${source}; this.canOpenPlaylistPanel = canOpenPlaylistPanel;`, context);
  assert.equal(context.canOpenPlaylistPanel(), false, '主页不允许歌单面板');
  context.emptyHomeActive = false;
  assert.equal(context.canOpenPlaylistPanel(), true, '进入听歌页后恢复歌单面板');
});

test('所有歌单唤起入口都经过主页守卫', () => {
  assert.match(readFunction(shell, 'setPeek'), /key === 'pl'[\s\S]*canOpenPlaylistPanel\(\)/);
  assert.match(readFunction(panel, 'togglePlaylistPanel'), /canOpenPlaylistPanel\(\)/);
  assert.match(readFunction(panel, 'applyPlaylistPanelPinState'), /canOpenPlaylistPanel\(\)/);
  assert.match(readFunction(panel, 'openPlaylistPanelTab'), /canOpenPlaylistPanel\(\)/);
  assert.match(readFunction(home, 'updateEmptyHomeVisibility'), /hidePlaylistPanelOutsideListeningPage\(\)/);
});
