'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const installerPath = path.join(root, 'scripts', 'install-local-macos-safe.js');
const source = fs.readFileSync(installerPath, 'utf8');
const { decideRecoveryAction, DEFINITELY_PRE_RECOVERY_STAGES } = require(installerPath);

test('recovery decisions follow physical commit state before journal intent', () => {
  assert.equal(decideRecoveryAction({
    candidateInstalled: true,
    completed: true,
    committedTarget: null,
    recoveryToolsReady: true,
    stage: 'new-verified',
  }), 'finish-new');
  assert.equal(decideRecoveryAction({
    candidateInstalled: true,
    completed: false,
    committedTarget: 'new',
    recoveryToolsReady: true,
    stage: 'new-success-committed',
  }), 'finish-new');
  assert.equal(decideRecoveryAction({
    candidateInstalled: true,
    completed: false,
    committedTarget: null,
    recoveryToolsReady: true,
    stage: 'new-target-installed',
  }), 'rollback-old');
  assert.equal(decideRecoveryAction({
    candidateInstalled: false,
    completed: false,
    committedTarget: null,
    recoveryToolsReady: false,
    stage: 'old-stopped',
  }), 'unwind-nondestructive');
  assert.equal(decideRecoveryAction({
    candidateInstalled: false,
    completed: false,
    committedTarget: null,
    recoveryToolsReady: false,
    stage: 'recovery-prepared',
  }), 'fail-missing-recovery-tools');
  assert.equal(DEFINITELY_PRE_RECOVERY_STAGES.has('legacy-quarantined'), true);
  assert.equal(DEFINITELY_PRE_RECOVERY_STAGES.has('new-app-installed'), true);
  assert.equal(DEFINITELY_PRE_RECOVERY_STAGES.has('new-helper-verified'), false);
  const reconcile = source.slice(
    source.indexOf('function reconcileMigration('),
    source.indexOf('function copyRecoveryTools('),
  );
  assert.ok(reconcile.indexOf("activeJournal.stage === 'legacy-quarantined'")
    < reconcile.indexOf("runNewSpecial('--mineradio-safe-storage-state')"));
  assert.ok(reconcile.indexOf("activeJournal.stage === 'new-app-installed'")
    < reconcile.indexOf("runNewSpecial('--mineradio-safe-storage-state')"));
  assert.match(reconcile, /new-app-installed[^]*recoverNonDestructiveFailure\(\)/);
});

test('durable copies publish only after a synced partial directory is complete', () => {
  const body = source.slice(
    source.indexOf('function copyDirectoryDurable('),
    source.indexOf('function bundleExecutable('),
  );
  assert.match(body, /\.partial-/);
  assert.ok(body.indexOf('fsyncTree(partial)') < body.indexOf('fs.renameSync(partial, target)'));
  assert.ok(body.indexOf('fs.renameSync(partial, target)') < body.indexOf('fsyncParent(target)'));
  assert.doesNotMatch(body, /ditto[^\n]+source, target/);
});

test('every newly created recovery directory durably publishes its parent link', () => {
  const ensure = source.slice(
    source.indexOf('function ensurePrivateDirectory('),
    source.indexOf('function fsyncPath('),
  );
  assert.match(ensure, /created\.reverse\(\)/);
  assert.ok(ensure.indexOf('fsyncPath(entry)') < ensure.indexOf('fsyncParent(entry)'));
  const start = source.slice(
    source.indexOf('async function startMigration('),
    source.indexOf('async function preflightCandidate('),
  );
  assert.match(start, /ensurePrivateDirectory\(BACKUP_ROOT\)/);
  assert.match(start, /ensurePrivateDirectory\(runDir\)/);
  assert.ok(start.indexOf('ensurePrivateDirectory(runDir)') < start.indexOf('installGuard(guardNonce)'));
});

test('rollback never swallows a failed new-signer rollback', () => {
  const body = source.slice(
    source.indexOf('function rollbackBeforeCommit('),
    source.indexOf('function finishCommittedNew('),
  );
  assert.match(body, /--mineradio-safe-storage-rollback-delete/);
  assert.match(body, /rolledBack\.new\.target/);
  assert.doesNotMatch(body, /rollback-delete[^]*catch\s*\{\s*\}/);
  assert.match(body, /restore-target/);
  assert.match(body, /cleanup-recovery/);
});

test('commit, proof cleanup, and marker cleanup remain ordered and replayable', () => {
  const finish = source.slice(
    source.indexOf('function finishCommittedNew('),
    source.indexOf('function recoverNonDestructiveFailure('),
  );
  assert.ok(finish.indexOf('--mineradio-safe-storage-commit') < finish.indexOf('runProofPipeline()'));
  assert.ok(finish.indexOf('runProofPipeline()') < finish.indexOf('--mineradio-safe-storage-cleanup'));
  assert.match(finish, /recovery\.recovery !== false/);
  assert.match(finish, /if \(state\.pending === true\)/);
  assert.doesNotMatch(finish, /completed !== true && state\.pending === true/);
  assert.match(source, /reconcileMigration\(\)/);
  assert.match(source, /completed === true \|\| committedTarget === 'new'/);
});

test('controller freezes complete rollback material before Keychain mutation', () => {
  const start = source.slice(source.indexOf('async function startMigration('), source.indexOf('function loadAndValidateJournal('));
  for (const token of [
    'userDataBackup',
    'candidateBackup',
    'oldAppBackup',
    'oldExecutable',
    'recoveryHost',
    'recoveryAddon',
    'pipeline',
    'controllerSha256',
  ]) assert.ok(start.indexOf(token) < start.indexOf("runRecovery('prepare'"), token);
  assert.ok(start.indexOf("checkpoint('backups-durable'") < start.indexOf("runRecovery('prepare'"));
  assert.ok(start.indexOf("runNewSpecial('--mineradio-safe-storage-state')")
    < start.indexOf("runRecovery('prepare'"));
  assert.ok(start.indexOf("checkpoint('new-helper-verified'") < start.indexOf("runRecovery('delete-target'"));
  assert.ok(start.indexOf('assertProfileSnapshotCurrent()') < start.indexOf("runRecovery('delete-target'"));
  assert.match(start, /quarantineDisabledProviderState/);
});

test('journal validation completes before recovery becomes authorized', () => {
  const load = source.slice(
    source.indexOf('function loadAndValidateJournal('),
    source.indexOf('async function recoverMigration('),
  );
  assert.ok(load.lastIndexOf('activeJournal = journal') > load.indexOf('durable recovery tool hash mismatch'));
  assert.ok(load.lastIndexOf('activeJournal = journal') > load.indexOf('sha256File(__filename)'));
  assert.match(source, /activeJournalTrusted && lockOwned/);
  assert.match(source, /acquireControllerLock\(\);\s*loadAndValidateJournal/);
});

test('normal App launch is guarded and provider status is bound to its PID', () => {
  assert.match(source, /\.installer-active\.json/);
  assert.match(source, /assertMigrationQuiescent\(\)/);
  assert.match(source, /allMineradioPids\(\)/);
  assert.match(source, /processTextExecutable\(pid\)/);
  assert.match(source, /activeJournal && activeJournal\.oldAppBackup/);
  const processGate = source.slice(
    source.indexOf('function assertOnlyExpectedMineradioProcesses('),
    source.indexOf('function pidCommand('),
  );
  assert.match(processGate, /processTextExecutable\(pid\)/);
  assert.match(processGate, /executable\.startsWith\(prefix\)/);
  assert.doesNotMatch(processGate, /new Set\(appPids/);
  assert.match(source, /captureProviderStatusForApp\(3000, INSTALL_APP\)/);
  assert.match(source, /assertSingleIndexedMineradioApp\(\)/);
});

test('migration backups stay private and rollback quarantines every App stage', () => {
  assert.match(source, /BACKUP_ROOT = path\.join\(MIGRATION_ROOT, 'backups\.noindex'\)/);
  const restore = source.slice(
    source.indexOf('function quarantineMigrationPath('),
    source.indexOf('function rollbackBeforeCommit('),
  );
  assert.match(restore, /quarantineMigrationPath\(activeJournal\.stagedApp/);
  assert.match(restore, /quarantineStagePartials\(activeJournal\.stagedApp/);
  assert.match(restore, /rollback-restore-partial/);
});

test('the locked migration repeats the one-App gate before any durable mutation', () => {
  const start = source.slice(
    source.indexOf('async function startMigration('),
    source.indexOf('async function preflightCandidate('),
  );
  assert.ok(start.indexOf('acquireControllerLock()') < start.indexOf('assertSingleIndexedMineradioApp()'));
  assert.ok(start.indexOf('assertSingleIndexedMineradioApp()') < start.indexOf('installGuard(guardNonce)'));
  assert.ok(start.indexOf('assertSingleIndexedMineradioApp()') < start.indexOf("runRecovery('prepare'"));
});

test('the local controller is frozen to one signed candidate and has a read-only preflight', () => {
  assert.match(source, /CANDIDATE_ASAR_SHA256 = '[a-f0-9]{64}'/);
  assert.match(source, /CANDIDATE_CDHASH = '[a-f0-9]{40}'/);
  assert.doesNotMatch(source, /__CANDIDATE/);
  assert.match(source, /getCurrentFuseWire\(bundleFuseBinary\(app\)\)/);
  const preflight = source.slice(
    source.indexOf('async function preflightCandidate('),
    source.indexOf('function loadAndValidateJournal('),
  );
  assert.match(preflight, /assertCandidate\(candidateApp\)/);
  assert.match(preflight, /captureProviderStatusForApp/);
  assert.doesNotMatch(preflight, /runRecovery|runFramePipeline|installGuard|copyDirectoryDurable/);
});
