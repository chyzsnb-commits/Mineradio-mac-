'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RECOVERY_ADDON_SHA256 = '6185d2a0f8716be185d2c95f3b489200cf4af297dee3fcdb19351c12d34462c8';

const ACTIONS = new Set([
  'prepare',
  'export-frame',
  'delete-target',
  'restore-target',
  'cleanup-recovery',
  'cleanup-recovery-from-proof',
  'state',
]);

function fail(message, exitCode = 1) {
  fs.writeSync(2, `[safe-storage-recovery] ${message}\n`);
  process.exit(exitCode);
}

function rejectUnsafeEnvironment() {
  if (process.platform !== 'darwin') fail('this helper is only available on macOS', 69);
  if (process.env.ELECTRON_RUN_AS_NODE !== '1') {
    fail('the fixed old Mineradio host must run with ELECTRON_RUN_AS_NODE=1', 64);
  }
  for (const name of Object.keys(process.env)) {
    if (name === 'NODE_OPTIONS' || name === 'NODE_PATH' || name.startsWith('DYLD_') || name.startsWith('LD_')) {
      fail(`unsafe loader environment variable is set: ${name}`, 64);
    }
  }
  if (!process.versions.napi) fail('the old Mineradio host does not expose N-API', 69);
}

function loadRecoveryAddon() {
  const addonPath = path.join(__dirname, 'native', 'safe-storage-recovery.node');
  let metadata;
  try {
    metadata = fs.lstatSync(addonPath);
  } catch {
    fail('the native recovery addon is missing', 69);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
      || metadata.nlink !== 1 || (metadata.mode & 0o022) !== 0) {
    fail('the native recovery addon failed ownership or mode validation', 77);
  }
  const addonHash = crypto.createHash('sha256').update(fs.readFileSync(addonPath)).digest('hex');
  if (addonHash !== RECOVERY_ADDON_SHA256) fail('the native recovery addon hash is not frozen', 77);
  // The native module independently pins the old process CDHash before any Keychain access.
  return require(addonPath);
}

function validateInterface(recovery) {
  const expected = [
    'prepare',
    'exportFrameToFd',
    'deleteTargetIfMatchesRecovery',
    'restoreTargetIfAbsent',
    'cleanupRecoveryIfTargetMatches',
    'cleanupRecoveryIfCommitProofMatches',
    'recoveryState',
  ];
  for (const name of expected) {
    if (typeof recovery[name] !== 'function') fail(`native recovery interface is missing ${name}`, 69);
  }
}

function run() {
  process.umask(0o077);
  rejectUnsafeEnvironment();
  const [action, ...argumentsForAction] = process.argv.slice(2);
  if (!ACTIONS.has(action)) fail('exactly one supported recovery action is required', 64);
  const recovery = loadRecoveryAddon();
  validateInterface(recovery);

  let result;
  if (action === 'prepare') {
    if (argumentsForAction.length !== 1 || !/^[a-fA-F0-9]{40}$/.test(argumentsForAction[0])) {
      fail('prepare requires exactly one 40-character new CDHash', 64);
    }
    result = recovery.prepare(argumentsForAction[0]);
  } else if (action === 'export-frame') {
    if (argumentsForAction.length !== 0) fail('export-frame accepts no additional arguments', 64);
    result = recovery.exportFrameToFd(3);
  } else if (action === 'cleanup-recovery-from-proof') {
    if (argumentsForAction.length !== 0) {
      fail('cleanup-recovery-from-proof accepts no additional arguments', 64);
    }
    result = recovery.cleanupRecoveryIfCommitProofMatches(3);
  } else {
    if (argumentsForAction.length !== 0) fail(`${action} accepts no additional arguments`, 64);
    if (action === 'delete-target') result = recovery.deleteTargetIfMatchesRecovery();
    else if (action === 'restore-target') result = recovery.restoreTargetIfAbsent();
    else if (action === 'cleanup-recovery') result = recovery.cleanupRecoveryIfTargetMatches();
    else result = recovery.recoveryState();
  }

  const publicResult = {
    ok: result && result.ok === true,
    recovery: result && result.recovery === true,
  };
  if (Object.prototype.hasOwnProperty.call(result || {}, 'target')) {
    publicResult.target = result.target === true;
  }
  if (!publicResult.ok) fail('native recovery operation returned an invalid state', 70);
  fs.writeSync(1, `${JSON.stringify(publicResult)}\n`);
  process.exit(0);
}

try {
  run();
} catch (error) {
  fail(String(error && error.message || error));
}
