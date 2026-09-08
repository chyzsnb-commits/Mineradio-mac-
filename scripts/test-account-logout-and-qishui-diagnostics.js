'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} 函数未闭合`);
}

function createNoticeDom() {
  const byId = Object.create(null);
  function node(tagName) {
    return {
      tagName,
      children: [],
      dataset: {},
      classList: {
        values: new Set(),
        add(...values) { values.forEach(value => this.values.add(value)); },
        remove(...values) { values.forEach(value => this.values.delete(value)); },
      },
      parentNode: null,
      textContent: '',
      setAttribute() {},
      get lastElementChild() { return this.children[this.children.length - 1] || null; },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      insertBefore(child, before) {
        child.parentNode = this;
        const index = before ? this.children.indexOf(before) : -1;
        if (index >= 0) this.children.splice(index, 0, child);
        else this.children.push(child);
        return child;
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentNode = null;
        return child;
      },
    };
  }
  const body = node('body');
  return {
    document: {
      body,
      getElementById(id) { return byId[id] || body.children.find(child => child.id === id) || null; },
      createElement: node,
      register(id, value) { byId[id] = value; },
    },
  };
}

test('登录接入页为已连接平台提供明确的退出入口', () => {
  const html = read('public/index.html');
  const flows = read('public/js/modules/08-account/03-login-modal-flows.js');
  const css = read('public/css/index.css');

  assert.match(html, /id="login-session-logout"[\s\S]*?onclick="logoutLoginProvider\(\)"/);
  assert.match(flows, /function updateLoginSessionLogoutAction\(\)/);
  assert.match(flows, /providerHasLiveLogin\(loginProvider\)/);
  assert.match(flows, /var providerLabel = platformMeta\(logoutProvider\)\.label/);
  assert.doesNotMatch(flows, /loginProviderDisplayName/);
  assert.match(css, /\.login-panel-head\s*>\s*div:first-child\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /\.login-panel-head\s*>\s*div\s*\{\s*display:\s*none/);
});

test('当前选中平台未登录时，登录页仍显示其他已登录平台的退出入口', () => {
  const flows = read('public/js/modules/08-account/03-login-modal-flows.js');

  assert.match(flows, /var logoutProvider = providerHasLiveLogin\(loginProvider\) \? loginProvider : firstLoggedProvider\(\)/);
  assert.match(flows, /button\.dataset\.logoutProvider = logoutProvider/);
  assert.match(flows, /var provider = button && button\.dataset\.logoutProvider \|\| loginProvider/);
});

test('登录弹窗开场不会模糊整块玻璃面板导致短暂发白', () => {
  const modalUtils = read('public/js/modules/08-account/01-login-modal-utils.js');

  assert.match(modalUtils, /var isLoginPanel = panel && panel\.classList\.contains\('dual-login-modal'\)/);
  assert.match(modalUtils, /isLoginPanel\s*\?\s*\{ autoAlpha: 0, y: 18, scale: 0\.985, filter: 'none' \}/);
  assert.match(modalUtils, /filter:\s*isLoginPanel\s*\?\s*'none'\s*:\s*'blur\(0px\)'/);
});

test('汽水退出清理汽水服务与桌面会话，不会误退网易云', () => {
  const logout = read('public/js/modules/08-account/04-user-modal-logout.js');

  assert.match(logout, /if \(activeAccountProvider === 'qishui'\)[\s\S]*?\/api\/qishui\/logout[\s\S]*?clearQishuiMusicLogin/);
  assert.match(logout, /qishuiLoginStatus\s*=\s*\{\s*provider:\s*'qishui',\s*loggedIn:\s*false/);
  assert.match(logout, /qishuiPlaylists\s*=\s*\[\]/);
});

test('汽水取流失败后自动换源会展示脱敏的失败证据', () => {
  const api = read('qishui-api.js');
  const fallback = read('public/js/modules/05-playback/11-provider-fallback.js');

  assert.match(api, /function qishuiPlaybackDiagnostic\(/);
  assert.match(api, /requestHost/);
  assert.match(api, /responseType/);
  assert.match(api, /sourceId/);
  assert.match(fallback, /function qishuiPlaybackFailureDetail\(/);
  assert.match(fallback, /汽水未返回可播放流/);
  assert.match(fallback, /qishuiPlaybackFailureDetail\(data\)/);
});

test('汽水仅作为匹配源时明确说明不能证明可播放，并把自动换源作为可选动作', () => {
  const fallback = read('public/js/modules/05-playback/11-provider-fallback.js');

  assert.match(fallback, /当前只提供搜索\/匹配信息，不能证明该平台可播放/);
  assert.match(fallback, /可以选择自动换源/);
  assert.doesNotMatch(fallback, /当前只提供搜索\/匹配信息，播放会自动寻找其它可播版本/);
});

test('一次音源切换只保留一个状态卡，并在替代音频实际启动后才确认成功', () => {
  const fallback = read('public/js/modules/05-playback/11-provider-fallback.js');
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const search = read('public/js/modules/05-playback/07-search.js');

  assert.match(fallback, /function showSourceSwitchNotice\(title, body\)[\s\S]*?kind: 'source-switch', replace: true/);
  assert.match(search, /showSourceSwitchNotice\('正在切换音源'/);
  assert.match(fallback, /var fallbackStarted = await playQueueAt\(idx, fallbackPlaybackOpts\)/);
  assert.match(fallback, /if \(fallbackStarted\)[\s\S]{0,240}showSourceSwitchNotice\('已自动切换音源'/);
  assert.match(playback, /if \(!confirmQueuePlaybackStarted\(idx, token\)\) return false;/);
  assert.match(playback, /if \(!qualitySwitch\) safePlaybackStep\('shelf-preview-suppress-end'[\s\S]{0,160}return true;/);
});

test('音源状态会替换同次失败卡，不会在右上角堆出多张旧卡', () => {
  const fallback = read('public/js/modules/05-playback/11-provider-fallback.js');
  const dom = createNoticeDom();
  const sandbox = {
    document: dom.document,
    Date: { now: () => 1000 },
    requestAnimationFrame: fn => fn(),
    setTimeout: () => 0,
    _lastFallbackNotice: '',
    _lastFallbackNoticeAt: 0,
    sourceFallbackNoticeTimer: null,
  };
  vm.runInNewContext([
    readFunction(fallback, 'ensureSourceFallbackStack'),
    readFunction(fallback, 'removeSourceFallbackCard'),
    readFunction(fallback, 'showSourceFallbackNotice'),
    readFunction(fallback, 'showSourceSwitchNotice'),
  ].join('\n'), sandbox);

  sandbox.showSourceFallbackNotice('取流失败', '汽水没有返回播放地址。');
  sandbox.showSourceSwitchNotice('正在切换音源', '正在查找网易云版本。');
  sandbox.showSourceSwitchNotice('已自动切换音源', '已经开始播放网易云版本。');

  const stack = dom.document.body.children[0];
  assert.equal(stack.children.length, 1);
  assert.equal(stack.children[0].children[0].children[0].textContent, '已自动切换音源');
});

test('普通播放状态通知也只保留当前一张卡', () => {
  const fallback = read('public/js/modules/05-playback/11-provider-fallback.js');
  const dom = createNoticeDom();
  const sandbox = {
    document: dom.document,
    Date: { now: () => 1000 },
    requestAnimationFrame: fn => fn(),
    setTimeout: () => 0,
    _lastFallbackNotice: '',
    _lastFallbackNoticeAt: 0,
    sourceFallbackNoticeTimer: null,
  };
  vm.runInNewContext([
    readFunction(fallback, 'ensureSourceFallbackStack'),
    readFunction(fallback, 'removeSourceFallbackCard'),
    readFunction(fallback, 'showSourceFallbackNotice'),
  ].join('\n'), sandbox);

  sandbox.showSourceFallbackNotice('正在切换音源', '正在查找网易云版本。');
  sandbox.showSourceFallbackNotice('汽水未返回可播放流', '汽水接口没有返回可播放流。');
  sandbox.showSourceFallbackNotice('已自动切换音源', '已经开始播放网易云版本。');

  const stack = dom.document.body.children[0];
  assert.equal(stack.children.length, 1);
  assert.equal(stack.children[0].children[0].children[0].textContent, '已自动切换音源');
});
