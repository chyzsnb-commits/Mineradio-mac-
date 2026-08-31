'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const afterPack = fs.readFileSync(path.join(root, 'build', 'after-pack.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'desktop', 'bootstrap.js'), 'utf8');
const handoffSource = fs.readFileSync(path.join(root, 'desktop', 'native', 'safe-storage-handoff.cc'), 'utf8');
const desktopMain = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');

test('macOS packages flip every Electron 42 fuse before signing', () => {
  assert.equal(pkg.devDependencies['@electron/fuses'], '^2.1.3');
  assert.match(afterPack, /strictlyRequireAllFuses:\s*true/);
  for (const [name, value] of [
    ['RunAsNode', 'false'],
    ['EnableCookieEncryption', 'false'],
    ['EnableNodeOptionsEnvironmentVariable', 'false'],
    ['EnableNodeCliInspectArguments', 'false'],
    ['EnableEmbeddedAsarIntegrityValidation', 'true'],
    ['OnlyLoadAppFromAsar', 'true'],
    ['LoadBrowserProcessSpecificV8Snapshot', 'false'],
    ['GrantFileProtocolExtraPrivileges', 'true'],
    ['WasmTrapHandlers', 'true'],
  ]) {
    assert.match(afterPack, new RegExp(`FuseV1Options\\.${name}\\]:\\s*${value}`));
  }
});

test('Safe Storage handoff runs before the normal desktop entrypoint', () => {
  assert.equal(pkg.main, 'desktop/bootstrap.js');
  assert.match(bootstrap, /--mineradio-safe-storage-install/);
  assert.match(bootstrap, /installFromFd\(3\)/);
  assert.match(bootstrap, /rollbackFromFd\(3\)/);
  assert.match(bootstrap, /commitFromFd\(3\)/);
  assert.match(bootstrap, /cleanupCommittedState\(\)/);
  assert.match(bootstrap, /exportCommitProofToFd\(3\)/);
  assert.match(bootstrap, /\/usr\/bin\/codesign'.*--verify.*--deep.*--strict/s);
  assert.match(bootstrap, /fs\.writeSync\(1,.*JSON\.stringify/s);
  assert.match(bootstrap, /process\.exit\(0\)/);
  assert.match(bootstrap, /\.installer-active\.json/);
  assert.match(bootstrap, /MINERADIO_MIGRATION_VERIFY_NONCE/);
  assert.match(bootstrap, /crypto\.timingSafeEqual/);
  assert.match(bootstrap, /delete process\.env\.MINERADIO_MIGRATION_VERIFY_NONCE/);
  assert.match(bootstrap, /require\('\.\/main'\)/);
  assert.doesNotMatch(bootstrap, /BrowserWindow|server\.js|safeStorage\.decrypt/);
});

test('handoff native code is add-if-absent and never exports the Safe Storage key', () => {
  assert.match(handoffSource, /kPendingAccount\[\] = "pending-v2"/);
  assert.match(handoffSource, /SecKeychainSetUserInteractionAllowed\(false\)/);
  assert.match(handoffSource, /S_ISFIFO.*S_ISSOCK/);
  assert.match(handoffSource, /flock\(fd_, LOCK_EX \| LOCK_NB\)/);
  assert.match(handoffSource, /Mineradio Migration/);
  assert.match(handoffSource, /\.safe-storage-handoff\.lock/);
  assert.match(handoffSource, /kInstalledExecutable\[\] = "\/Applications\/Mineradio\.app\/Contents\/MacOS\/Mineradio"/);
  assert.match(handoffSource, /kSafeStoragePasswordLength = 24/);
  assert.match(handoffSource, /BuildMarker\(frame, marker\)/);
  assert.match(handoffSource, /kCommitProofMagic/);
  assert.match(handoffSource, /CCHmac\(/);
  assert.match(handoffSource, /ExportCommitProof/);
  assert.match(handoffSource, /CleanupCommittedState/);
  assert.match(handoffSource, /pending != nullptr\) status = errSecAuthFailed/);
  assert.match(handoffSource, /recovery != nullptr\) status = errSecAuthFailed/);
  assert.match(handoffSource, /ComparePassword\(target, frame\.secret/);
  const installBody = handoffSource.slice(
    handoffSource.indexOf('OSStatus Install('),
    handoffSource.indexOf('OSStatus Rollback('),
  );
  assert.ok(
    installBody.indexOf('keychain, kStateService, kPendingAccount')
      < installBody.indexOf('keychain, kTargetService, kTargetAccount, frame.secret'),
  );
  assert.doesNotMatch(handoffSource, /SecKeychainItemModify|SecItemUpdate/);
  assert.doesNotMatch(handoffSource, /napi_set_named_property\([^\n]+"read"/);

  const binary = path.join(root, 'desktop', 'native', 'safe-storage-handoff.node');
  assert.equal(fs.existsSync(binary), true);
  const pinnedHash = bootstrap.match(/SAFE_STORAGE_HANDOFF_SHA256 = '([a-f0-9]{64})'/)?.[1];
  assert.equal(pinnedHash, crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'));
  if (process.platform === 'darwin') {
    const file = execFileSync('/usr/bin/file', [binary], { encoding: 'utf8' });
    assert.match(file, /universal binary|arm64/);
    assert.match(file, /x86_64/);
  }
});

test('packaged native helpers are unpacked and macOS-compatible', () => {
  assert.deepEqual(pkg.build.asarUnpack, [
    'desktop/native/handpose/handpose-helper',
  ]);
  assert.match(desktopMain, /process\.resourcesPath, 'app\.asar\.unpacked', 'desktop', 'native', 'handpose'/);

  const handpose = path.join(root, 'desktop', 'native', 'handpose', 'handpose-helper');
  assert.equal(fs.existsSync(handpose), true);
  if (process.platform === 'darwin') {
    const file = execFileSync('/usr/bin/file', [handpose], { encoding: 'utf8' });
    assert.match(file, /universal binary/);
    assert.match(file, /x86_64/);
    assert.match(file, /arm64/);
    for (const arch of ['x86_64', 'arm64']) {
      const loadCommands = execFileSync('/usr/bin/otool', ['-arch', arch, '-l', handpose], { encoding: 'utf8' });
      assert.match(loadCommands, /minos 12\.0/);
    }
  }
});

test('handoff addon rebuilds byte-for-byte from the reviewed source', { skip: process.platform !== 'darwin' }, () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-handoff-build-test-'));
  const output = path.join(temporaryDirectory, 'safe-storage-handoff.node');
  try {
    execFileSync('/bin/bash', [
      path.join(root, 'scripts', 'build-macos-native-helpers.sh'),
      '--handoff',
      output,
    ], {
      cwd: root,
      env: { ...process.env },
      stdio: 'pipe',
      timeout: 120_000,
    });
    assert.deepEqual(
      fs.readFileSync(output),
      fs.readFileSync(path.join(root, 'desktop', 'native', 'safe-storage-handoff.node')),
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
