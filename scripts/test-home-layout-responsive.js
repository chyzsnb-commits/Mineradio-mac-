'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.resolve(__dirname, '../public/css/index.css'), 'utf8');

function mediaBlocks(query) {
  const blocks = [];
  for (let start = css.indexOf(query); start !== -1; start = css.indexOf(query, start + query.length)) {
    let depth = 0;
    for (let index = css.indexOf('{', start); index < css.length; index += 1) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push(css.slice(start, index + 1));
          break;
        }
      }
    }
  }
  assert.ok(blocks.length, `missing media query: ${query}`);
  return blocks;
}

function mediaBlockContaining(query, snippet) {
  const block = mediaBlocks(query).find((candidate) => candidate.includes(snippet));
  assert.ok(block, `missing ${snippet} inside ${query}`);
  return block;
}

test('首页中等宽度不产生洞察 dock 的隐式第二列', () => {
  const tablet = mediaBlockContaining('@media (max-width:1120px)', '#empty-home .home-insight-dock');
  const tabletGrid = mediaBlockContaining('@media (max-width:1120px)', '.home-grid');

  assert.match(tabletGrid, /\.home-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(tablet, /\.home-listen-card\s*\{[\s\S]*?grid-column:\s*1[\s\S]*?grid-row:\s*1/);
  assert.match(tablet, /\.home-next-card\s*\{[\s\S]*?grid-column:\s*2[\s\S]*?grid-row:\s*1/);
  assert.match(tablet, /\.home-discovery-strip\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1[\s\S]*?grid-row:\s*2/);
  assert.match(tablet, /\.home-ranking-entry:not\(\.home-radio-entry\)\s*\{[\s\S]*?grid-column:\s*1[\s\S]*?grid-row:\s*3/);
  assert.match(tablet, /\.home-radio-entry\s*\{[\s\S]*?grid-column:\s*2[\s\S]*?grid-row:\s*3/);
});

test('首页极窄宽度将所有首页区块和洞察卡归回单列顺序', () => {
  const narrow = mediaBlockContaining('@media (max-width:760px)', '.home-grid');
  const narrowDock = mediaBlockContaining('@media (max-width:760px)', '#empty-home .home-insight-dock');

  assert.match(narrow, /\.home-grid\s*\{[\s\S]*?grid-column:\s*1[\s\S]*?grid-row:\s*2/);
  assert.match(narrow, /\.home-rail\.home-insight-rail\s*\{[\s\S]*?grid-column:\s*1[\s\S]*?grid-row:\s*3/);
  assert.match(narrowDock, /\.home-insight-dock\s+\.home-listen-card,[\s\S]*?\.home-insight-dock\s+\.home-next-card,[\s\S]*?\.home-insight-dock\s+\.home-ranking-entry:not\(\.home-radio-entry\),[\s\S]*?\.home-insight-dock\s+\.home-ranking-entry\.home-radio-entry,[\s\S]*?\.home-insight-dock\s+\.home-discovery-strip\s*\{[\s\S]*?grid-column:\s*1[\s\S]*?grid-row:\s*auto/);
});

test('最近播放 hero 的固定内容块不被 flex 压扁到内部内容之外', () => {
  assert.match(css, /\.home-recent-inner \.home-kicker,[\s\S]*?\.home-recent-inner \.home-quick-row\s*\{\s*flex:\s*0\s+0\s+auto/);
  assert.match(css, /\.home-recent-inner \.home-next-up\s*\{[\s\S]*?flex:\s*0\s+0\s+auto[\s\S]*?min-height:\s*96px/);
  assert.match(css, /\.home-recent-inner \.home-daily-review\s*\{[\s\S]*?flex:\s*0\s+0\s+auto[\s\S]*?min-height:\s*84px/);
  assert.match(css, /\.home-recent-inner \.home-recent-list\s*\{[\s\S]*?flex:\s*1\s+1\s+auto[\s\S]*?min-height:\s*48px/);
});

test('常见桌面高度优先保留最近播放扫描区和完整的洞察首屏', () => {
  const desktopCompact = mediaBlockContaining('@media (min-width:1121px) and (max-width:1500px)', '.empty-home-shell');
  const heightCompact = mediaBlockContaining('@media (min-width:761px) and (max-height:900px)', '.home-recent-inner .home-recent-list');
  const shortWindow = mediaBlockContaining('@media (max-height:760px)', '.home-recent-inner .home-recent-list');

  assert.match(desktopCompact, /\.home-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    '1366 级桌面需要把入口收为 3x2，不能继续挤占洞察区');
  assert.match(desktopCompact, /\.empty-home-shell\s*\{[\s\S]*?grid-template-rows:\s*minmax\(260px,\s*\.84fr\)\s+minmax\(320px,\s*1\.16fr\)/,
    '右侧洞察必须取得稳定的可用高度');
  assert.match(heightCompact, /min-height:\s*190px/,
    '常见桌面至少需要约三行最近播放的可视高度');
  assert.match(heightCompact, /\.home-insight-dock\s*\{[\s\S]*?gap:\s*9px/,
    '洞察 dock 在中矮窗口应紧凑而不裁切');
  assert.match(shortWindow, /min-height:\s*168px/,
    '1247x702 / 1000x700 仍要保留至少三行最近播放');
});
