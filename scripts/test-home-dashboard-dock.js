'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('首页洞察 dock:HTML 结构包含今日聆听/下一首/为你挑选/音乐发现/平台推荐', () => {
  const html = read('public/index.html');

  assert.match(html, /id="home-insight-dock"/);
  assert.match(html, /id="home-listen-heading"/);
  assert.match(html, /id="home-today-time"/);
  assert.match(html, /id="home-today-count"/);
  assert.match(html, /id="home-today-artist"/);
  assert.match(html, /id="home-today-streak"/);
  assert.match(html, /id="home-next-card"/);
  assert.match(html, /id="home-next-cover"/);
  assert.match(html, /id="home-discovery-list"/);
  assert.match(html, /home-ranking-entry/);
  assert.match(html, /home-radio-entry/);
  assert.match(html, /id="home-platform-recommend-mask"/);
  assert.match(html, /data-home-recommend-source="netease"/);
  assert.match(html, /data-home-recommend-source="qishui"/);
  assert.match(html, /data-home-recommend-source="qq"/);
  assert.match(html, /data-home-recommend-source="kugou"/);
  assert.match(html, /data-home-recommend-source="spotify"/);
  // Mac 保留「为你准备」旧入口,不能像 Windows 一样被隐藏
  assert.match(html, /class="home-legacy-rail"/);
  assert.match(html, /id="home-tile-row"/);
});

test('首页洞察 dock:前端模块实现指标/下一首/为你挑选/平台推荐与刷新调度', () => {
  const moduleFile = read('public/js/modules/05-playback/03a-home-dashboard-insight.js');

  assert.match(moduleFile, /function renderHomeInsightDock\(/);
  assert.match(moduleFile, /function homeDashboardTodayListenMetrics\(/);
  assert.match(moduleFile, /function homeDashboardListenDurationText\(/);
  assert.match(moduleFile, /function homeDashboardNextQueueInfo\(/);
  assert.match(moduleFile, /function playHomeNextFromDock\(/);
  assert.match(moduleFile, /function homeDashboardDiscoverySongs\(/);
  assert.match(moduleFile, /function renderHomeDashboardDiscovery\(/);
  assert.match(moduleFile, /function playHomeDashboardDiscoverySong\(/);
  assert.match(moduleFile, /function openHomePlatformRecommendations\(/);
  assert.match(moduleFile, /function openHomeDashboardRadio\(/);
  assert.match(moduleFile, /function openHomeDashboardCharts\(/);
  assert.match(moduleFile, /function scheduleHomeDashboardRefresh\(/);
  assert.match(moduleFile, /function loadHomePlatformFeedRecommendations\(/);
  assert.match(moduleFile, /function loadHomePlatformNeteaseRecommendations\(/);
  // 必须挂到既有 renderHomeDiscover 之后,不替换 Mac 原有首页
  assert.match(moduleFile, /homeDashboardInsightBaseRenderHomeDiscover/);
  assert.match(moduleFile, /renderHomeDashboard\(\)/);
});

test('首页洞察 dock:index-loader 按顺序加载新模块', () => {
  const loader = read('public/js/index-loader.js');
  const index = loader.indexOf('js/modules/05-playback/03-home-discover-weather.js');
  const insightIndex = loader.indexOf('js/modules/05-playback/03a-home-dashboard-insight.js');
  const wallpaperIndex = loader.indexOf('js/modules/05-playback/04-home-empty-wallpaper.js');

  assert.ok(index >= 0, '03-home-discover-weather 必须在加载列表');
  assert.ok(insightIndex > index, '03a 洞察模块必须排在 03 之后');
  assert.ok(wallpaperIndex > insightIndex, '04 壁纸模块必须排在 03a 之后');
});

test('首页洞察 dock:服务端提供酷狗/Spotify 推荐接口并导出实现', () => {
  const server = read('server.js');
  const spotify = read('spotify-api.js');

  assert.match(server, /\/api\/kugou\/recommendations/);
  assert.match(server, /\/api\/spotify\/recommendations/);
  assert.match(server, /handleSpotifyRecommendations/);
  assert.match(spotify, /async function handleSpotifyRecommendations\(/);
  assert.match(spotify, /handleSpotifyRecommendations,/);
});

test('首页洞察 dock:CSS 提供 dock 与平台推荐弹窗样式且保留 Mac legacy rail', () => {
  const css = read('public/css/index.css');

  assert.match(css, /\.home-insight-dock/);
  assert.match(css, /\.home-insight-card/);
  assert.match(css, /\.home-listen-card/);
  assert.match(css, /\.home-next-card/);
  assert.match(css, /\.home-discovery-strip/);
  assert.match(css, /\.home-discovery-song/);
  assert.match(css, /\.home-ranking-entry/);
  assert.match(css, /\.home-radio-entry/);
  assert.match(css, /\.home-platform-recommend-modal/);
  assert.match(css, /\.home-platform-recommend-list/);
  assert.match(css, /\.home-platform-recommend-grid/);
  // Mac 保留 legacy rail 显示,不允许被 Win 的 display:none 规则覆盖
  assert.match(css, /\.home-legacy-rail[\s\S]*?display:\s*block/);
});
