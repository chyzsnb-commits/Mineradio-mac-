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

function asyncFunctionBlock(source, name, nextName) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, name);
  const end = source.indexOf(`async function ${nextName}(`, start + 1);
  assert.notEqual(end, -1, nextName);
  return source.slice(start, end);
}

test('2.0 uses formal public identity', () => {
  assert.equal(pkg.name, 'mineradio');
  assert.equal(pkg.version, '2.0.0');
  assert.equal(pkg.build.appId, 'com.mineradio.desktop');
  assert.equal(pkg.mineradio.internalBeta, false);
  assert.equal(pkg.mineradio.publicRelease, true);
  assert.equal(pkg.mineradio.appUserModelId, 'com.mineradio.desktop');
  assert.equal(pkg.mineradio.update && pkg.mineradio.update.disabled, true);
});

test('public package keeps Qishui disabled', () => {
  const files = JSON.stringify(pkg.build.files || []);
  assert.doesNotMatch(files, /qishui-audio-decryptor/i);
  assert.match(files, /qishui-catalog-api\.js/);
  assert.equal(policy.qishuiCatalogEnabled, false);
  assert.equal(policy.qishuiEnabled, false);
  assert.equal(policy.allowCredentialImport, false);
  assert.equal(policy.allowCredentialExport, false);
  assert.deepEqual(policy.disabledProviders, ['qishui']);
});

test('Qishui direct-session backend, login bridge and decryptor stay deleted', () => {
  const removed = [
    'qishui-api.js',
    'qishui-audio-decryptor/decrypt-utils.js',
    'qishui-audio-decryptor/mp4-box.js',
    'qishui-audio-decryptor/track-decryptor.js',
    'desktop/qishui-disabled.js',
  ];
  removed.forEach((file) => assert.equal(fs.existsSync(path.join(root, file)), false, file));
  assert.doesNotMatch(read('desktop/main.js'), /qishui|汽水|sodamusic|spade/i);
  assert.doesNotMatch(read('desktop/preload.js'), /openQishui|clearQishui|qishui.*(?:cookie|token|login)/i);
  const catalog = read('qishui-catalog-api.js');
  assert.doesNotMatch(catalog, /sessionid|cookie|authorization|track_v2|decrypt|safeStorage/i);
  assert.match(catalog, /playable:\s*false/);
  assert.match(catalog, /recommend-match/);
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
  assert.doesNotMatch(index, /search-mode-qishui/);
  assert.match(server, /\/api\/qishui\/search/);
  assert.doesNotMatch(rendererModules, /\/api\/qishui\/search/);
  assert.doesNotMatch(preload, /openQishuiMusicLogin|clearQishuiMusicLogin|qishui.*(?:cookie|token|decrypt)/i);
  assert.doesNotMatch(server, /qishui.*(?:cookie|token|decrypt|sessionid)/i);
});

test('official provider login bypasses blocked manual import without exposing cookies', () => {
  const main = read('desktop/main.js');
  const server = read('server.js');
  const loginFlows = read('public/js/modules/08-account/03-login-modal-flows.js');
  const css = read('public/css/index.css');
  const bridge = read('desktop/official-login-bridge.js');
  const officialFunctions = [
    asyncFunctionBlock(loginFlows, 'openNeteaseWebLogin', 'openQQWebLogin'),
    asyncFunctionBlock(loginFlows, 'openQQWebLogin', 'openKugouWebLogin'),
    asyncFunctionBlock(loginFlows, 'openKugouWebLogin', 'submitQQCookieLogin'),
  ].join('\n');

  assert.match(main, /applyOfficialProviderLogin/);
  assert.match(main, /applyOfficialProviderLogin\(localServer,\s*'netease'/);
  assert.match(main, /applyOfficialProviderLogin\(localServer,\s*'qq'/);
  assert.match(main, /applyOfficialProviderLogin\(localServer,\s*'kugou'/);
  assert.match(server, /server\.acceptOfficialLoginCookie\s*=\s*acceptOfficialLoginCookie/);
  assert.match(bridge, /server\.acceptOfficialLoginCookie/);
  assert.doesNotMatch(bridge, /cookie\s*:/);
  assert.match(officialFunctions, /result\.sessionApplied/);
  assert.match(officialFunctions, /result\.loginInfo/);
  assert.doesNotMatch(officialFunctions, /result\.cookie|\/api\/(?:qq\/|kugou\/)?login\/cookie/);
  assert.match(css, /mineradio-public-release #login-mode-cookie/);
  assert.match(loginFlows, /MINERADIO_ALLOW_CREDENTIAL_IMPORT && isManualCookieProvider/);
});

test('privacy-sensitive macOS purpose strings and public notices are packaged', () => {
  assert.match(pkg.build.mac.extendInfo.NSCameraUsageDescription, /本机处理/);
  assert.match(pkg.build.mac.extendInfo.NSMicrophoneUsageDescription, /本机处理/);
  assert.ok(fs.existsSync(path.join(root, 'PRIVACY.md')));
  assert.ok(fs.existsSync(path.join(root, 'THIRD_PARTY_NOTICES.md')));
});

test('public cookie path migrates plaintext and rejects silent write failure', () => {
  const server = read('server.js');
  const spotify = read('spotify-api.js');
  assert.match(server, /migrated plaintext cookie to safeStorage/);
  assert.match(server, /SAFE_STORAGE_UNAVAILABLE/);
  assert.match(server, /String\(parsed\.port \|\| '80'\) === expectedPort/);
  assert.doesNotMatch(server, /localHost \? expectedPort/);
  assert.match(server, /plaintext cookie migration unavailable; login state ignored/);
  assert.match(spotify, /SAFE_STORAGE_MIGRATION_FAILED/);
  const playback = read('public/js/modules/05-playback/00-api-quality-output.js');
  assert.match(playback, /function isPlaybackProviderDisabled/);
  assert.match(playback, /PROVIDER_DISABLED/);
  const start = read('public/js/modules/05-playback/13-playback-start-audio.js');
  assert.match(start, /isPlaybackProviderDisabled\(playbackProvider\)/);
});
