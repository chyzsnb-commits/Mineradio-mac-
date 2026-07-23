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

test('2.0 uses formal public identity', () => {
  assert.equal(pkg.name, 'mineradio');
  assert.equal(pkg.version, '2.0.0');
  assert.equal(pkg.build.appId, 'com.mineradio.desktop');
  assert.equal(pkg.mineradio.internalBeta, false);
  assert.equal(pkg.mineradio.publicRelease, true);
  assert.equal(pkg.mineradio.appUserModelId, 'com.mineradio.desktop');
});

test('public package excludes Qishui implementation and credential export', () => {
  const files = JSON.stringify(pkg.build.files || []);
  assert.doesNotMatch(files, /qishui-api|qishui-audio-decryptor/i);
  assert.equal(policy.qishuiEnabled, false);
  assert.equal(policy.allowCredentialImport, false);
  assert.equal(policy.allowCredentialExport, false);
  assert.deepEqual(policy.disabledProviders, ['qishui']);
});

test('Qishui backend, login bridge and decryptor are deleted from public source', () => {
  const removed = [
    'qishui-api.js',
    'qishui-audio-decryptor/decrypt-utils.js',
    'qishui-audio-decryptor/mp4-box.js',
    'qishui-audio-decryptor/track-decryptor.js',
    'desktop/qishui-disabled.js',
  ];
  removed.forEach((file) => assert.equal(fs.existsSync(path.join(root, file)), false, file));
  ['desktop/main.js', 'desktop/preload.js', 'server.js'].forEach((file) => {
    assert.doesNotMatch(read(file), /qishui|汽水|sodamusic|spade/i, file);
  });
});

test('public renderer and server enforce release boundary', () => {
  const preload = read('desktop/preload.js');
  const server = read('server.js');
  const index = read('public/index.html');
  const rendererModules = fs.readdirSync(path.join(root, 'public', 'js', 'modules'), { recursive: true })
    .filter((file) => String(file).endsWith('.js'))
    .map((file) => read(path.join('public', 'js', 'modules', file)))
    .join('\n');
  assert.match(preload, /RELEASE_POLICY\.allowCredentialExport/);
  assert.match(server, /UNTRUSTED_ORIGIN/);
  assert.match(server, /sec-fetch-site/);
  assert.match(server, /mineradio-safe-storage-v1/);
  assert.doesNotMatch(index, /qishui|汽水/i);
  assert.doesNotMatch(rendererModules, /\/api\/qishui|openQishuiMusicLogin|clearQishuiMusicLogin/i);
});

test('privacy-sensitive macOS purpose strings and public notices are packaged', () => {
  assert.match(pkg.build.mac.extendInfo.NSCameraUsageDescription, /本机处理/);
  assert.match(pkg.build.mac.extendInfo.NSMicrophoneUsageDescription, /本机处理/);
  assert.ok(fs.existsSync(path.join(root, 'PRIVACY.md')));
  assert.ok(fs.existsSync(path.join(root, 'THIRD_PARTY_NOTICES.md')));
});

test('public cookie path migrates plaintext and rejects silent write failure', () => {
  const server = read('server.js');
  assert.match(server, /migrated plaintext cookie to safeStorage/);
  assert.match(server, /SAFE_STORAGE_UNAVAILABLE/);
  assert.match(server, /localHost \? expectedPort/);
  const playback = read('public/js/modules/05-playback/00-api-quality-output.js');
  assert.match(playback, /function isPlaybackProviderDisabled/);
  assert.match(playback, /PROVIDER_DISABLED/);
  const start = read('public/js/modules/05-playback/13-playback-start-audio.js');
  assert.match(start, /isPlaybackProviderDisabled\(playbackProvider\)/);
});
