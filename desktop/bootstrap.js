'use strict';

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SAFE_STORAGE_HANDOFF_SHA256 = 'f6287f804e6eac153457902cfdbb733fbaa15caa060a87624edd590b18d7e273';

const HANDOFF_MODES = new Set([
  '--mineradio-safe-storage-install',
  '--mineradio-safe-storage-rollback-delete',
  '--mineradio-safe-storage-commit',
  '--mineradio-safe-storage-cleanup',
  '--mineradio-safe-storage-export-commit-proof',
  '--mineradio-safe-storage-state',
]);

const MIGRATION_GUARD_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Mineradio Migration',
  '.installer-active.json',
);

function enforceMigrationGuardForNormalLaunch() {
  const suppliedNonce = process.env.MINERADIO_MIGRATION_VERIFY_NONCE || '';
  delete process.env.MINERADIO_MIGRATION_VERIFY_NONCE;
  let metadata;
  try {
    metadata = fs.lstatSync(MIGRATION_GUARD_PATH);
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
      || metadata.nlink !== 1 || (metadata.mode & 0o177) !== 0 || metadata.size > 256) {
    throw new Error('the Mineradio migration guard is not a private regular file');
  }
  const guard = JSON.parse(fs.readFileSync(MIGRATION_GUARD_PATH, 'utf8'));
  const expectedNonce = guard && typeof guard.nonce === 'string' ? guard.nonce : '';
  if (!/^[a-f0-9]{64}$/.test(expectedNonce) || !/^[a-f0-9]{64}$/.test(suppliedNonce)) {
    throw new Error('Mineradio is temporarily locked for a safe local update');
  }
  const expected = Buffer.from(expectedNonce, 'hex');
  const supplied = Buffer.from(suppliedNonce, 'hex');
  const matches = crypto.timingSafeEqual(expected, supplied);
  expected.fill(0);
  supplied.fill(0);
  if (!matches) throw new Error('Mineradio is temporarily locked for a safe local update');
}

function runSafeStorageHandoff(mode) {
  if (process.platform !== 'darwin') throw new Error('Safe Storage handoff is only available on macOS');
  const appBundle = path.resolve(path.dirname(process.execPath), '..', '..');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appBundle], {
    env: { PATH: '/usr/bin:/bin' },
    stdio: 'ignore',
  });
  const addonPath = path.join(__dirname, 'native', 'safe-storage-handoff.node');
  const addonHash = crypto.createHash('sha256').update(fs.readFileSync(addonPath)).digest('hex');
  if (addonHash !== SAFE_STORAGE_HANDOFF_SHA256) {
    throw new Error('Safe Storage handoff addon integrity check failed');
  }
  const handoff = require(addonPath);
  if (mode === '--mineradio-safe-storage-install') return handoff.installFromFd(3);
  if (mode === '--mineradio-safe-storage-rollback-delete') return handoff.rollbackFromFd(3);
  if (mode === '--mineradio-safe-storage-commit') return handoff.commitFromFd(3);
  if (mode === '--mineradio-safe-storage-cleanup') return handoff.cleanupCommittedState();
  if (mode === '--mineradio-safe-storage-export-commit-proof') {
    return handoff.exportCommitProofToFd(3);
  }
  return handoff.state();
}

const requestedModes = process.argv.filter((argument) => HANDOFF_MODES.has(argument));
if (requestedModes.length > 1) {
  fs.writeSync(2, '[safe-storage-handoff] conflicting modes\n');
  process.exit(64);
} else if (requestedModes.length === 1) {
  try {
    const result = runSafeStorageHandoff(requestedModes[0]);
    fs.writeSync(1, `${JSON.stringify(result)}\n`);
    process.exit(0);
  } catch (error) {
    fs.writeSync(2, `[safe-storage-handoff] ${String(error && error.message || error)}\n`);
    process.exit(1);
  }
} else {
  try {
    enforceMigrationGuardForNormalLaunch();
    require('./main');
  } catch (error) {
    fs.writeSync(2, `[mineradio-bootstrap] ${String(error && error.message || error)}\n`);
    process.exit(75);
  }
}
