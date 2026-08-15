'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'scripts', 'native', 'safe-storage-recovery.cc'),
  'utf8',
);
const host = fs.readFileSync(path.join(root, 'scripts', 'safe-storage-recovery-host.js'), 'utf8');
const build = fs.readFileSync(path.join(root, 'scripts', 'build-macos-native-helpers.sh'), 'utf8');
const pipeline = fs.readFileSync(path.join(root, 'scripts', 'run-safe-storage-pipeline.sh'), 'utf8');

test('recovery helper pins the old signer and never exposes Safe Storage bytes to JS', () => {
  assert.match(source, /0x2f, 0xc3, 0x71, 0x15, 0xa5, 0xc7, 0xfd, 0x7e, 0xb8, 0xc1,/);
  assert.match(source, /0x40, 0xcb, 0x32, 0x02, 0x56, 0xa0, 0x6a, 0x50, 0x2f, 0xd4,/);
  assert.match(source, /SecCodeCopySelf/);
  assert.match(source, /SecCodeCheckValidity/);
  assert.match(source, /kSecCodeInfoIdentifier/);
  assert.match(source, /kSecCodeInfoUnique/);
  assert.match(source, /CFSTR\("com\.mineradio\.desktop"\)/);
  assert.doesNotMatch(source, /napi_create_(?:external_)?buffer/);
  assert.doesNotMatch(source, /napi_set_named_property\([^\n]+(?:secret|nonce|cdhash)/i);
  assert.doesNotMatch(host, /safeStorage|decryptString|decrypt|Buffer\./);
  assert.match(host, /publicResult = \{[\s\S]*ok:[\s\S]*recovery:/);
  assert.match(host, /hasOwnProperty\.call\(result \|\| \{\}, 'target'\)/);
  const binary = path.join(root, 'scripts', 'native', 'safe-storage-recovery.node');
  const pinnedHash = host.match(/RECOVERY_ADDON_SHA256 = '([a-f0-9]{64})'/)?.[1];
  assert.equal(pinnedHash, crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'));
});

test('recovery state machine is add-only, idempotent, and verifies before destructive steps', () => {
  assert.match(source, /kRecoveryBlobLength == 76/);
  assert.match(source, /kFramePayloadLength == 76/);
  assert.match(source, /recovery-v2/);
  assert.match(source, /expected\.cdhash\(\), newCdHash/);
  assert.match(source, /SecRandomCopyBytes\(kSecRandomDefault, kNonceLength, expected\.nonce\(\)\)/);
  assert.match(source, /ReadRecovery\(recovery, &readback\)/);
  assert.match(source, /ConstantTimeEqual\(readback\.bytes, expected\.bytes/);
  assert.match(source, /CompareTargetWithRecovery\(target, expected\)[\s\S]*SecKeychainItemDelete\(target\)/);
  assert.match(source, /status == errSecDuplicateItem\) status = errSecSuccess/);
  assert.match(source, /CompareTargetWithRecovery\(target, expected\)[\s\S]*SecKeychainItemDelete\(recovery\)/);
  assert.doesNotMatch(source, /SecKeychainItemModify|SecItemUpdate|SecItemDelete/);
  for (const exportedName of [
    'prepare',
    'exportFrameToFd',
    'deleteTargetIfMatchesRecovery',
    'restoreTargetIfAbsent',
    'cleanupRecoveryIfTargetMatches',
    'cleanupRecoveryIfCommitProofMatches',
    'recoveryState',
  ]) {
    assert.match(source, new RegExp(`napi_set_named_property\\([\\s\\S]{0,120}"${exportedName}"`));
  }
});

test('all Keychain access is fail-closed, unique across the search list, and default-only', () => {
  assert.match(source, /SecKeychainGetUserInteractionAllowed/);
  assert.match(source, /SecKeychainSetUserInteractionAllowed\(false\)/);
  assert.match(source, /SecKeychainCopyDefault/);
  assert.match(source, /SecKeychainCopySearchList/);
  assert.match(source, /for \(SecKeychainRef keychain : universe\.keychains\(\)\)/);
  assert.match(source, /count > 1[\s\S]*errSecDuplicateItem/);
  assert.match(source, /ItemBelongsToKeychain\(match, defaultKeychain/);
  assert.match(source, /SecKeychainItemCopyKeychain/);
  assert.match(source, /SecKeychainAddGenericPassword\([\s\S]*keychain,/);
});

test('helper uses the shared crash-released lock and bounded binary fd3 framing', () => {
  assert.match(source, /\/Library\/Application Support\/Mineradio Migration/);
  assert.match(source, /mkdir\(lockDirectory\.c_str\(\), 0700\)/);
  assert.match(source, /lstat\(lockDirectory\.c_str\(\), &directoryStat\)/);
  assert.match(source, /directoryStat\.st_uid != getuid\(\)/);
  assert.match(source, /open\(lockPath\.c_str\(\), O_RDWR \| O_CREAT \| O_CLOEXEC \| O_NOFOLLOW, 0600\)/);
  assert.match(source, /S_ISREG\(lockStat\.st_mode\)/);
  assert.match(source, /lockStat\.st_nlink != 1/);
  assert.match(source, /flock\(fd_, LOCK_EX \| LOCK_NB\)/);
  assert.match(source, /S_ISFIFO\(descriptorStat\.st_mode\).*S_ISSOCK\(descriptorStat\.st_mode\)/);
  assert.match(source, /fd != 3/);
  assert.match(source, /htonl\(static_cast<uint32_t>\(kFramePayloadLength\)\)/);
  assert.match(source, /poll\(&descriptor, 1, waitMilliseconds\)/);
  assert.match(source, /SIGPIPE/);
  assert.match(source, /operation == Operation::kExport[\s\S]*close\(fd\)/);
  assert.match(source, /SecureZero\(wire, sizeof\(wire\)\)/);
  assert.match(source, /ReadCommitProof\(fd, commitProof\)[\s\S]*MigrationLock migrationLock/);
  assert.match(source, /kCommitProofMagic/);
  assert.match(source, /CCHmac\(/);
  assert.match(source, /ConstantTimeEqual\(expectedProof, proof/);
  assert.match(source, /SecKeychainItemDelete\(recovery\)/);
});

test('native timeout, core-dump suppression, host validation, and universal build stay enforced', () => {
  assert.match(source, /setrlimit\(RLIMIT_CORE, &limit\)/);
  assert.match(source, /setitimer\(ITIMER_REAL, &timer/);
  assert.match(source, /_exit\(124\)/);
  assert.match(source, /pthread_sigmask\(SIG_UNBLOCK/);
  assert.match(host, /ELECTRON_RUN_AS_NODE !== '1'/);
  assert.match(host, /NODE_OPTIONS.*NODE_PATH.*DYLD_.*LD_/s);
  assert.match(host, /metadata\.isSymbolicLink\(\)/);
  assert.match(host, /addonHash !== RECOVERY_ADDON_SHA256/);
  assert.match(host, /cleanup-recovery-from-proof/);
  assert.match(host, /recovery\.prepare\(argumentsForAction\[0\]\)/);
  assert.match(host, /recovery\.exportFrameToFd\(3\)/);
  assert.match(host, /fs\.writeSync\(1,/);
  assert.match(host, /process\.exit\(0\)/);
  assert.match(build, /for architecture in arm64 x86_64/);
  assert.match(build, /-mmacosx-version-min=12\.0/);
  assert.match(build, /xcrun lipo -create/);
  assert.match(build, /codesign --force --sign - --timestamp=none/);
});

test('recovery addon compiles universally without ever loading it', { skip: process.platform !== 'darwin' }, () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-recovery-build-test-'));
  const output = path.join(temporaryDirectory, 'safe-storage-recovery.node');
  try {
    execFileSync('/bin/bash', [path.join(root, 'scripts', 'build-macos-native-helpers.sh'), output], {
      cwd: root,
      env: { ...process.env },
      stdio: 'pipe',
      timeout: 120_000,
    });
    const description = execFileSync('/usr/bin/file', [output], { encoding: 'utf8' });
    assert.match(description, /universal binary/);
    assert.match(description, /arm64/);
    assert.match(description, /x86_64/);
    assert.deepEqual(
      fs.readFileSync(output),
      fs.readFileSync(path.join(root, 'scripts', 'native', 'safe-storage-recovery.node')),
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('the POSIX fd3 pipeline keeps binary frames separate from JSON stdout', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-pipe-test-'));
  const writer = path.join(temporaryDirectory, 'writer.js');
  const reader = path.join(temporaryDirectory, 'reader.js');
  const expectedHex = '0001020300fffefd';
  try {
    fs.writeFileSync(writer, [
      "const fs = require('node:fs');",
      `fs.writeSync(3, Buffer.from('${expectedHex}', 'hex'));`,
      "fs.writeSync(1, '{\"writer\":true}\\n');",
    ].join('\n'), { mode: 0o600 });
    fs.writeFileSync(reader, [
      "const fs = require('node:fs');",
      "const value = fs.readFileSync(3).toString('hex');",
      `if (value !== '${expectedHex}') process.exit(71);`,
      "fs.writeSync(1, '{\"reader\":true}\\n');",
    ].join('\n'), { mode: 0o600 });
    execFileSync('/bin/bash', [
      '-c',
      '"$1" "$2" 3>&1 1>"$4/writer.json" | "$1" "$3" 3<&0 0</dev/null 1>"$4/reader.json"',
      'mineradio-pipe-test',
      process.execPath,
      writer,
      reader,
      temporaryDirectory,
    ], { stdio: 'pipe', timeout: 10_000 });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temporaryDirectory, 'writer.json'))), { writer: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temporaryDirectory, 'reader.json'))), { reader: true });
    assert.match(pipeline, /3>&1 1>"\$\{old_stdout\}"/);
    assert.match(pipeline, /3<&0 0<\/dev\/null 1>"\$\{new_stdout\}"/);
    assert.match(pipeline, /\/usr\/bin\/env -i/);
    assert.doesNotMatch(pipeline, /set -x/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
