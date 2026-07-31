'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }

test('汽水登录恢复 PR56 的主进程官方客户端桥接', () => {
  const main = read('desktop/main.js');
  const preload = read('desktop/preload.js');
  assert.match(main, /openQishuiMusicLoginWindow/);
  assert.match(main, /qishui-music-open-login/);
  assert.match(main, /Containers', 'com\.soda\.music'/);
  assert.match(preload, /openQishuiMusicLogin:\s*\(\) => ipcRenderer\.invoke\('qishui-music-open-login'\)/);
});

test('汽水官方会话只由主进程交给本地服务加密保存', () => {
  const main = read('desktop/main.js');
  const server = read('server.js');
  const bridge = read('desktop/official-login-bridge.js');
  assert.match(main, /applyOfficialProviderLogin\(localServer, 'qishui'/);
  assert.match(bridge, /'qishui'/);
  assert.match(server, /if \(provider === 'qishui'\)/);
  assert.match(server, /saveQishuiCookie\(normalized\)/);
});

test('汽水登录页面不再依赖渲染层二维码轮询', () => {
  const flows = read('public/js/modules/08-account/03-login-modal-flows.js');
  assert.match(flows, /function openQishuiWebLogin\(/);
  assert.match(flows, /window\.desktopWindow\.openQishuiMusicLogin/);
  assert.doesNotMatch(flows, /\/api\/qishui\/login\/qr\/(?:create|check)/);
});
