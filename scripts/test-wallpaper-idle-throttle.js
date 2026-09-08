'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

function readVarBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `缺少 ${marker}`);
  const end = source.indexOf('\nfunction ', start);
  return source.slice(start, end >= 0 ? end : source.length);
}

test('壁纸模式不进深睡眠，也不走失焦 15fps 后台', () => {
  const source = read('public/js/modules/00-state/08-desktop-render-power.js');
  const sandbox = {
    document: { hidden: false },
    desktopRuntimeState: {
      minimized: false,
      visible: true,
      focused: false,
      occluded: true,
    },
    fx: { wallpaperMode: true },
    isLiveBackgroundKeepMode() { return false; },
    currentPerformanceBackgroundMode() { return 'auto'; },
  };
  vm.runInNewContext(
    `${readFunction(source, 'isDeepBackgroundMode')};`
      + `${readFunction(source, 'isVisibleBackgroundMode')};`
      + 'deep = isDeepBackgroundMode(); visibleBg = isVisibleBackgroundMode();',
    sandbox,
  );
  assert.equal(sandbox.deep, false, '壁纸模式即便 occluded/失焦也不能深睡眠');
  assert.equal(sandbox.visibleBg, false, '壁纸模式不能走可见后台 15fps');

  sandbox.fx.wallpaperMode = false;
  sandbox.document.hidden = true;
  vm.runInNewContext('deep = isDeepBackgroundMode();', sandbox);
  assert.equal(sandbox.deep, true, '非壁纸 + document.hidden 仍应深睡眠');

  sandbox.document.hidden = false;
  sandbox.desktopRuntimeState.focused = false;
  sandbox.desktopRuntimeState.occluded = false;
  vm.runInNewContext('visibleBg = isVisibleBackgroundMode();', sandbox);
  assert.equal(sandbox.visibleBg, true, '非壁纸失焦仍应可见后台降帧');
});

test('暂停后等舞台歌词褪去再计 3 秒才空闲降帧', () => {
  const source = read('public/js/modules/11-main-loop.js');
  assert.match(source, /IDLE_AFTER_LYRIC_FADE_MS\s*=\s*3000/);

  const sandbox = {
    IDLE_AFTER_LYRIC_FADE_MS: 3000,
    idleLyricClearSince: 0,
    playing: false,
    audio: { paused: true },
    playToggleBusy: false,
    fx: { particleLyrics: true, desktopLyrics: false, wallpaperMode: false },
    stageLyrics: {
      outgoing: [],
      current: { userData: { globalOpacity: 0 } },
    },
    shelfManager: { hasOpenContent() { return false; } },
    shelfPreviewIsVisible() { return false; },
    isRenderInteractionActive() { return false; },
    performance: { now() { return 10000; } },
  };

  vm.runInNewContext(
    `${readVarBlock(source, 'var IDLE_AFTER_LYRIC_FADE_MS')}`
      + `${readFunction(source, 'stageLyricsStillVisible')};`
      + `${readFunction(source, 'isForegroundIdleForRender')};`,
    sandbox,
  );

  assert.equal(sandbox.isForegroundIdleForRender(10000), false, '歌词刚清零时未满 3s 不降帧');
  assert.equal(sandbox.idleLyricClearSince, 10000);
  assert.equal(sandbox.isForegroundIdleForRender(12999), false, '2.999s 仍不降帧');
  assert.equal(sandbox.isForegroundIdleForRender(13000), true, '满 3s 后才空闲降帧');

  sandbox.stageLyrics.current.userData.globalOpacity = 0.4;
  sandbox.idleLyricClearSince = 0;
  assert.equal(sandbox.isForegroundIdleForRender(20000), false, '字幕仍可见时不降帧');
  assert.equal(sandbox.idleLyricClearSince, 0);

  sandbox.stageLyrics.current.userData.globalOpacity = 0;
  sandbox.fx.wallpaperMode = true;
  assert.equal(sandbox.isForegroundIdleForRender(20000), false, '壁纸模式可在字幕清零后开始计时');
  assert.equal(sandbox.isForegroundIdleForRender(23000), true, '壁纸模式同样在 3s 后允许空闲降帧省电');

  sandbox.fx.desktopLyrics = true;
  sandbox.idleLyricClearSince = 0;
  assert.equal(sandbox.isForegroundIdleForRender(30000), false, '桌面歌词始终不进前台空闲降帧');
});
