'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const utils = fs.readFileSync(path.join(root, 'public/js/modules/08-account/01-login-modal-utils.js'), 'utf8');
const status = fs.readFileSync(path.join(root, 'public/js/modules/08-account/02-login-status.js'), 'utf8');
const flows = fs.readFileSync(path.join(root, 'public/js/modules/08-account/03-login-modal-flows.js'), 'utf8');
const modal = fs.readFileSync(path.join(root, 'public/js/modules/08-account/04-user-modal-logout.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/index.css'), 'utf8');

function functionBlock(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(end, -1, nextName);
  return source.slice(start, end);
}

test('账号界面不显示不可靠的普通/VIP/SVIP 等级徽标', () => {
  const badge = functionBlock(utils, 'providerVipBadge', 'renderTopAccountPill');
  const providerCard = functionBlock(flows, 'updateLoginProviderCapsuleStatus', 'bindLoginWorkflowPointerEvents');
  const qqText = functionBlock(status, 'qqLoginStatusText', 'refreshQQLoginStatus');
  const userModal = functionBlock(modal, 'updateUserModalUi', 'showUserModal');

  assert.match(badge, /return '';/);
  assert.doesNotMatch(providerCard, /className\s*=\s*'login-provider-state-badge'/);
  assert.doesNotMatch(providerCard, /badge\.textContent\s*=/);
  assert.match(providerCard, /if \(badge\) badge\.remove\(\)/);
  assert.doesNotMatch(qqText, /SVIP|VIP|普通账号|会员/);
  assert.doesNotMatch(userModal, /SVIP|VIP|普通用户|Premium|Free|会员待同步/);
  assert.doesNotMatch(css, /\.login-provider-state-badge\s*\{/);
  assert.match(css, /grid-template-columns:\s*18px 35px minmax\(0,\s*1fr\) 56px/);
  assert.match(css, /\.login-provider-external-switch\s*\{\s*grid-column:\s*4/);
});

test('会员权限判断仍保留给播放能力使用', () => {
  assert.match(utils, /function providerVipLevel\(/);
  assert.match(utils, /function hasProviderVip\(/);
  assert.match(utils, /function hasProviderSvip\(/);
});
