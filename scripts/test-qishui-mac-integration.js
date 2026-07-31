'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const policy = require(path.join(root, 'desktop', 'release-policy'));

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('Mac internal build packages and enables Qishui playback bridge', () => {
  assert.equal(policy.qishuiEnabled, true);
  assert.equal(policy.allowCredentialImport, true);
  const files = JSON.stringify(pkg.build.files || []);
  assert.match(files, /qishui-api\.js/);
  assert.match(files, /qishui-audio-decryptor/);
  assert.ok(fs.existsSync(path.join(root, 'qishui-api.js')));
  assert.ok(fs.existsSync(path.join(root, 'qishui-audio-decryptor', 'track-decryptor.js')));
});

test('Qishui decryption stays in the local server and uses safeStorage-backed credentials', () => {
  const server = read('server.js');
  assert.match(server, /qishui-audio-decryptor\/track-decryptor/);
  assert.match(server, /getQishuiDecryptedAudio/);
  assert.match(server, /SAFE_STORAGE_PREFIX/);
  assert.match(server, /#auth=/);
  assert.doesNotMatch(read('desktop/preload.js'), /qishui.*decrypt|decrypt.*qishui/i);
});

test('Mac startup remains guarded when Qishui credentials or source are unavailable', () => {
  const start = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const fallback = read('public/js/modules/05-playback/11-provider-fallback.js');
  assert.match(start, /tryAutoPlaybackFallback/);
  assert.match(fallback, /qishui/);
  assert.match(read('desktop/release-policy.js'), /process\.platform/);
});

test('Qishui manual authorization posts only to its local endpoints', () => {
  const flows = read('public/js/modules/08-account/03-login-modal-flows.js');
  assert.match(flows, /function submitQishuiManualLogin\(/);
  assert.match(flows, /\/api\/qishui\/login\/cookie/);
  assert.match(flows, /\/api\/qishui\/login\/token/);
  assert.match(flows, /if \(loginProvider === 'qishui'\) return submitQishuiManualLogin\(\)/);
});
