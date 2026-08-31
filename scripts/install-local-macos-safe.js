'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn, spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const INSTALL_APP = '/Applications/Mineradio.app';
const USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'Mineradio');
const MIGRATION_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'Mineradio Migration');
const CONTROLLER_LOCK = path.join(MIGRATION_ROOT, '.installer-controller.lock');
const GUARD_PATH = path.join(MIGRATION_ROOT, '.installer-active.json');
const BACKUP_ROOT = path.join(MIGRATION_ROOT, 'backups.noindex');
const OLD_ASAR_SHA256 = 'a88eb92933e2718ac3e2c3c7135f4ab2ef773d1458e2ac7996f217686b3f7761';
const OLD_CDHASH = '2fc37115a5c7fd7eb8c140cb320256a06a502fd4';
const CANDIDATE_ASAR_SHA256 = '7dac0a781edf167689930d0ea050323fc9af38d005a83cba11f73eb40676c024';
const CANDIDATE_CDHASH = '96919e2fc469fa0ea4568bd794cdb8068633d1d7';
const HANDOFF_ADDON_SHA256 = 'ea421bf27e24501fa55e565254ab970bdd62a44191aa93f7b4abb553acebce9c';
const RECOVERY_ADDON_SHA256 = '6185d2a0f8716be185d2c95f3b489200cf4af297dee3fcdb19351c12d34462c8';
const RECOVERY_HOST_SHA256 = 'b4a04ac4109db0ca6eb2c23aa7d80a429274d888d83651dde1bc10873eb00f46';
const PIPELINE_SHA256 = '744a83eb92dbc6004099e60b9f704dc4c2378baffd32e214ca6fd02142410519';
const BOOTSTRAP_SHA256 = '88549d4a3f14bac8979b188d51b1d83e108a91715c48b6451662c42bc8dcb38d';
const REQUIRED_FUSES = Object.freeze({
  0: 48,
  1: 48,
  2: 48,
  3: 48,
  4: 49,
  5: 49,
  6: 48,
  7: 49,
  8: 49,
  version: '1',
});
const REQUIRED_ENTITLEMENTS = Object.freeze([
  'com.apple.security.device.camera',
  'com.apple.security.device.audio-input',
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-library-validation',
]);
const STATUS_PATHS = Object.freeze([
  '/api/login/status',
  '/api/qq/login/status',
  '/api/kugou/login/status',
  '/api/spotify/status',
]);
const STATUS_KEYS = Object.freeze([
  'provider',
  'loggedIn',
  'configured',
  'oauthConfigured',
  'tokenConfigured',
  'tokenFileExists',
  'credentialsFileExists',
  'playbackKeyReady',
  'playbackReady',
  'profileReady',
  'authorizationIncomplete',
  'stale',
]);

let lockOwned = false;
let activeJournal = null;
let activeJournalTrusted = false;
let interrupted = false;

function fail(message) {
  throw new Error(message);
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function throwIfInterrupted() {
  if (interrupted) fail('the migration was interrupted; starting deterministic recovery');
}

function runtimeTemporaryDirectory() {
  const base = activeJournal && typeof activeJournal.runDir === 'string'
    ? activeJournal.runDir
    : MIGRATION_ROOT;
  ensurePrivateDirectory(base);
  const temporary = path.join(base, 'runtime-tmp');
  ensurePrivateDirectory(temporary);
  return temporary;
}

function cleanEnvironment(extra = {}) {
  return {
    HOME: os.homedir(),
    USER: os.userInfo().username,
    LOGNAME: os.userInfo().username,
    TMPDIR: runtimeTemporaryDirectory(),
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    LANG: 'C',
    LC_ALL: 'C',
    ...extra,
  };
}

function spawnResult(file, args = [], options = {}) {
  const result = spawnSync(file, args, {
    cwd: options.cwd || REPO_ROOT,
    env: options.env || cleanEnvironment(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 120_000,
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    signal: result.signal,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function run(file, args = [], options = {}) {
  return execFileSync(file, args, {
    cwd: options.cwd || REPO_ROOT,
    env: options.env || cleanEnvironment(),
    encoding: options.encoding === null ? null : 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 120_000,
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
  });
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    buffer.fill(0);
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function assertPrivateDirectory(directory) {
  const metadata = fs.lstatSync(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
      || (metadata.mode & 0o077) !== 0) {
    fail(`private directory validation failed: ${directory}`);
  }
}

function ensurePrivateDirectory(directory) {
  const created = [];
  for (let cursor = directory; !fs.existsSync(cursor); cursor = path.dirname(cursor)) {
    created.push(cursor);
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  assertPrivateDirectory(directory);
  if (created.length === 0) {
    fsyncPath(directory);
    return;
  }
  for (const entry of created.reverse()) {
    fs.chmodSync(entry, 0o700);
    assertPrivateDirectory(entry);
    fsyncPath(entry);
    fsyncParent(entry);
  }
}

function fsyncPath(target) {
  const descriptor = fs.openSync(target, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function fsyncParent(target) {
  fsyncPath(path.dirname(target));
}

function durableWriteJson(target, value) {
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, target);
  fs.chmodSync(target, 0o600);
  fsyncParent(target);
}

function updateJournal(stage, patch = {}) {
  const next = { ...activeJournal, ...patch, stage, updatedAt: new Date().toISOString() };
  durableWriteJson(next.journalPath, next);
  activeJournal = next;
}

function checkpoint(stage, patch = {}) {
  updateJournal(stage, patch);
  throwIfInterrupted();
}

function treeDigest(root) {
  const hash = crypto.createHash('sha256');
  const visit = (entry, relative) => {
    const metadata = fs.lstatSync(entry);
    hash.update(`${relative}\0${metadata.mode}\0${metadata.uid}\0${metadata.gid}\0${metadata.size}\0`);
    if (metadata.isSymbolicLink()) {
      hash.update(`L\0${fs.readlinkSync(entry)}\0`);
      return;
    }
    if (metadata.isDirectory()) {
      hash.update('D\0');
      for (const name of fs.readdirSync(entry).sort()) {
        visit(path.join(entry, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    if (!metadata.isFile()) fail(`unsupported file type in durable snapshot: ${entry}`);
    hash.update('F\0');
    const descriptor = fs.openSync(entry, 'r');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
      while (true) {
        const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
        if (count === 0) break;
        hash.update(buffer.subarray(0, count));
      }
    } finally {
      buffer.fill(0);
      fs.closeSync(descriptor);
    }
  };
  visit(root, '');
  return hash.digest('hex');
}

function fsyncTree(root) {
  const metadata = fs.lstatSync(root);
  if (metadata.isSymbolicLink()) return;
  if (metadata.isDirectory()) {
    for (const name of fs.readdirSync(root)) fsyncTree(path.join(root, name));
    fsyncPath(root);
    return;
  }
  if (metadata.isFile()) fsyncPath(root);
}

function copyDirectoryDurable(source, target) {
  const parent = path.dirname(target);
  if (fs.realpathSync(parent) !== parent || fs.existsSync(target) || fs.lstatSync(parent).isSymbolicLink()) {
    fail(`durable copy target already exists or has an unsafe parent: ${target}`);
  }
  const partial = `${target}.partial-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  run('/usr/bin/ditto', ['--rsrc', '--extattr', '--acl', '--qtn', source, partial], {
    env: { ...cleanEnvironment(), DITTONORSRC: '' },
    timeout: 15 * 60_000,
  });
  const metadata = fs.lstatSync(partial);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail(`durable copy produced an unsafe partial: ${partial}`);
  fsyncTree(partial);
  fs.renameSync(partial, target);
  fsyncParent(target);
}

function bundleExecutable(app) {
  return path.join(app, 'Contents', 'MacOS', 'Mineradio');
}

function bundleAsar(app) {
  return path.join(app, 'Contents', 'Resources', 'app.asar');
}

function bundleFuseBinary(app) {
  return path.join(
    app, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework',
  );
}

function codesignDisplay(app) {
  const result = spawnResult('/usr/bin/codesign', ['-dv', '--verbose=4', app]);
  if (result.status !== 0 || result.signal) {
    fail(`could not inspect the code signature for ${app}: ${result.stderr.trim()}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

function extractCdHash(app) {
  const output = codesignDisplay(app);
  const match = output.match(/^CDHash=([a-f0-9]{40})$/m);
  if (!match) fail(`could not read CDHash for ${app}`);
  return match[1];
}

function assertEntitlements(app) {
  const result = spawnResult('/usr/bin/codesign', ['-d', '--entitlements', ':-', app]);
  if (result.status !== 0 || result.signal) fail(`could not inspect entitlements: ${app}`);
  const combined = `${result.stdout}\n${result.stderr}`;
  const xmlStart = combined.indexOf('<?xml');
  if (xmlStart < 0) fail(`codesign returned no entitlement plist: ${app}`);
  const output = combined.slice(xmlStart);
  for (const entitlement of REQUIRED_ENTITLEMENTS) {
    const escaped = entitlement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`<key>${escaped}</key>\\s*<true\\s*\\/>`).test(output)) {
      fail(`missing true entitlement ${entitlement}: ${app}`);
    }
  }
}

function assertSignedApp(app, expectedAsar, expectedCdHash) {
  const resolved = fs.realpathSync(app);
  if (resolved !== app) fail(`app path contains a symbolic-link alias: ${app}`);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  if (sha256File(bundleAsar(app)) !== expectedAsar) fail(`unexpected app.asar hash: ${app}`);
  if (extractCdHash(app) !== expectedCdHash) fail(`unexpected app CDHash: ${app}`);
  const info = run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Contents', 'Info.plist')]);
  const parsed = JSON.parse(info);
  if (parsed.CFBundleIdentifier !== 'com.mineradio.desktop' || parsed.CFBundleShortVersionString !== '2.0.0') {
    fail(`unexpected Mineradio bundle identity: ${app}`);
  }
  assertEntitlements(app);
  for (const name of [
    'Mineradio Helper.app',
    'Mineradio Helper (GPU).app',
    'Mineradio Helper (Plugin).app',
    'Mineradio Helper (Renderer).app',
  ]) {
    const helper = path.join(app, 'Contents', 'Frameworks', name);
    run('/usr/bin/codesign', ['--verify', '--strict', helper]);
    assertEntitlements(helper);
  }
}

function signedAppMatches(app, expectedAsar, expectedCdHash) {
  try {
    if (!fs.existsSync(app)) return false;
    assertSignedApp(app, expectedAsar, expectedCdHash);
    return true;
  } catch {
    return false;
  }
}

async function assertCandidate(app, options = {}) {
  const requireFrozenBuildRoot = options.requireFrozenBuildRoot !== false;
  if (requireFrozenBuildRoot && (!app.startsWith('/private/tmp/mineradio-final-handoff.')
      || !app.endsWith('/mac-arm64/Mineradio.app'))) {
    fail('candidate path is outside the frozen private build root');
  }
  assertSignedApp(app, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH);
  const { getCurrentFuseWire } = require('@electron/fuses');
  const asar = require('@electron/asar');
  const fuses = await getCurrentFuseWire(bundleFuseBinary(app));
  if (JSON.stringify(fuses) !== JSON.stringify(REQUIRED_FUSES)) fail('candidate Electron fuses do not match');
  const archive = bundleAsar(app);
  const rawHeader = asar.getRawHeader(archive);
  const headerHash = crypto.createHash('sha256').update(rawHeader.headerString).digest('hex');
  const info = JSON.parse(run('/usr/bin/plutil', [
    '-convert', 'json', '-o', '-', path.join(app, 'Contents', 'Info.plist'),
  ]));
  const integrity = info.ElectronAsarIntegrity && info.ElectronAsarIntegrity['Resources/app.asar'];
  if (!integrity || integrity.algorithm !== 'SHA256' || integrity.hash !== headerHash) {
    fail('candidate Electron ASAR integrity header does not match Info.plist');
  }
  const packagedMetadata = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
  if (packagedMetadata.main !== 'desktop/bootstrap.js') fail('candidate does not use the guarded bootstrap');
  const bootstrap = asar.extractFile(archive, 'desktop/bootstrap.js');
  const bootstrapText = bootstrap.toString('utf8');
  if (crypto.createHash('sha256').update(bootstrap).digest('hex') !== BOOTSTRAP_SHA256) {
    fail('candidate bootstrap does not match the reviewed migration guard');
  }
  const bootstrapPin = bootstrapText.match(/SAFE_STORAGE_HANDOFF_SHA256 = '([a-f0-9]{64})'/)?.[1];
  if (bootstrapPin !== HANDOFF_ADDON_SHA256 || !bootstrapText.includes('.installer-active.json')) {
    fail('candidate bootstrap does not pin the handoff addon and migration guard');
  }
  const handoffInfo = asar.statFile(archive, 'desktop/native/safe-storage-handoff.node');
  if (handoffInfo.unpacked === true) fail('Safe Storage handoff addon must remain packed in ASAR');
  const handoff = asar.extractFile(archive, 'desktop/native/safe-storage-handoff.node');
  try {
    if (crypto.createHash('sha256').update(handoff).digest('hex') !== HANDOFF_ADDON_SHA256) {
      fail('candidate handoff addon hash does not match the frozen binary');
    }
  } finally {
    handoff.fill(0);
  }
  const unpackedHandoff = path.join(
    app, 'Contents', 'Resources', 'app.asar.unpacked', 'desktop', 'native', 'safe-storage-handoff.node');
  if (fs.existsSync(unpackedHandoff)) fail('Safe Storage handoff addon must remain integrity-protected in ASAR');
  const handpose = path.join(
    app, 'Contents', 'Resources', 'app.asar.unpacked', 'desktop', 'native', 'handpose', 'handpose-helper');
  const unpackedRoot = path.join(app, 'Contents', 'Resources', 'app.asar.unpacked');
  const unpackedFiles = [];
  const collect = (entry) => {
    const metadata = fs.lstatSync(entry);
    if (metadata.isSymbolicLink()) fail(`candidate unpacked resource is a symbolic link: ${entry}`);
    if (metadata.isDirectory()) {
      for (const name of fs.readdirSync(entry).sort()) collect(path.join(entry, name));
    } else if (metadata.isFile()) {
      unpackedFiles.push(path.relative(unpackedRoot, entry));
    } else {
      fail(`unsupported unpacked candidate resource: ${entry}`);
    }
  };
  collect(unpackedRoot);
  if (JSON.stringify(unpackedFiles) !== JSON.stringify(['desktop/native/handpose/handpose-helper'])) {
    fail('candidate contains unexpected unpacked resources');
  }
  const description = run('/usr/bin/file', [handpose]);
  if (!/universal binary/.test(description) || !/arm64/.test(description) || !/x86_64/.test(description)) {
    fail('packaged handpose helper is not universal');
  }
  run('/usr/bin/codesign', ['--verify', '--strict', handpose]);
  for (const architecture of ['arm64', 'x86_64']) {
    const commands = run('/usr/bin/otool', ['-arch', architecture, '-l', handpose]);
    if (!/LC_BUILD_VERSION[\s\S]{0,160}\bminos 12\.0\b/.test(commands)) {
      fail(`packaged handpose helper does not target macOS 12 for ${architecture}`);
    }
  }
}

function processTextExecutable(pid) {
  const result = spawnResult('/usr/sbin/lsof', [
    '-nP', '-a', '-p', String(pid), '-d', 'txt', '-Fn',
  ]);
  if (result.status === 1 && !result.stdout.trim() && !result.stderr.trim()) return '';
  if (result.status !== 0 || result.signal) {
    fail(`could not resolve the executable for PID ${pid}`);
  }
  const executable = result.stdout.split('\n').find((line) => line.startsWith('n'));
  return executable ? executable.slice(1) : '';
}

function processRows() {
  const output = run('/bin/ps', ['-axo', 'pid=,command=']);
  return output.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    return match ? [{ pid: Number(match[1]), command: match[2] }] : [];
  });
}

function appPids(app) {
  const prefix = `${app}/`;
  const pids = [];
  for (const { pid, command } of processRows()) {
    if (!command.includes(prefix)) continue;
    const executable = processTextExecutable(pid);
    if (executable.startsWith(prefix)) pids.push(pid);
  }
  return [...new Set(pids)];
}

function allMineradioPids() {
  const userDataArgument = `--user-data-dir=${USER_DATA}`;
  const knownRoots = [
    INSTALL_APP,
    activeJournal && activeJournal.oldAppBackup,
    activeJournal && activeJournal.candidateBackup,
    activeJournal && activeJournal.stagedApp,
  ].filter(Boolean);
  const pids = [];
  for (const { pid, command } of processRows()) {
    const referencesMineradio = command.includes('Mineradio')
      || command.includes(userDataArgument)
      || knownRoots.some((root) => command.includes(`${root}/`));
    if (!referencesMineradio) continue;
    const executable = processTextExecutable(pid);
    const belongsToKnownBundle = knownRoots.some((root) => executable.startsWith(`${root}/`));
    const belongsToNamedBundle = /\/Mineradio(?: [^/]*)?\.app(?:\.backup)?\/Contents\//.test(executable);
    const isRenamedMineradioMain = /\/Contents\/MacOS\/Mineradio$/.test(executable);
    const isMineradioHelper = /\/Mineradio Helper(?: \([^)]*\))?\.app\/Contents\/MacOS\//.test(executable);
    if (belongsToKnownBundle || belongsToNamedBundle || isRenamedMineradioMain || isMineradioHelper) {
      pids.push(pid);
    }
  }
  return [...new Set(pids)];
}

function assertOnlyExpectedMineradioProcesses(app) {
  const prefix = `${app}/`;
  const unexpected = [];
  for (const pid of allMineradioPids()) {
    const executable = processTextExecutable(pid);
    if (executable && !executable.startsWith(prefix)) unexpected.push(`${pid}:${executable}`);
  }
  if (unexpected.length > 0) {
    fail(`another Mineradio copy is running from an unexpected path: ${unexpected.join(',')}`);
  }
}

function pidCommand(pid) {
  try {
    return run('/bin/ps', ['-p', String(pid), '-o', 'command=']).trim();
  } catch {
    return '';
  }
}

function waitForNoAppProcesses(app, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (appPids(app).length === 0) return;
    sleep(100);
  }
  fail(`Mineradio processes did not exit: ${appPids(app).join(',')}`);
}

function stopApp(app) {
  try {
    run('/usr/bin/osascript', ['-e', 'tell application id "com.mineradio.desktop" to quit'], { timeout: 8_000 });
  } catch {}
  const waitUntil = Date.now() + 8_000;
  while (Date.now() < waitUntil && appPids(app).length > 0) sleep(100);
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    const pids = appPids(app);
    if (pids.length === 0) break;
    for (const pid of pids) {
      if (pidCommand(pid).includes(`${app}/`)) {
        try { process.kill(pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
    const deadline = Date.now() + (signal === 'SIGTERM' ? 5_000 : 2_000);
    while (Date.now() < deadline && appPids(app).length > 0) sleep(100);
  }
  waitForNoAppProcesses(app);
}

function portOwnerPids(port) {
  const result = spawnResult('/usr/sbin/lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN']);
  if (result.status === 1 && result.stdout.trim() === '' && result.stderr.trim() === '') return [];
  if (result.status !== 0 || result.signal) fail(`could not determine ownership of TCP ${port}`);
  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
}

function assertPortFree(port) {
  const owners = portOwnerPids(port);
  if (owners.length > 0) fail(`TCP ${port} is still owned by PID ${owners.join(',')}`);
}

function assertPortOwnedByApp(port, app) {
  const owners = portOwnerPids(port);
  const running = appPids(app);
  if (owners.length === 0 || owners.some((pid) => !running.includes(pid))) {
    fail(`TCP ${port} is not exclusively owned by ${app}`);
  }
  assertOnlyExpectedMineradioProcesses(app);
  return owners;
}

function requestJson(port, requestPath) {
  const script = `
    const http=require('http');
    const [port,p]=process.argv.slice(1);
    const request=http.get({host:'127.0.0.1',port:Number(port),path:p,timeout:7000},response=>{
      let value='';
      response.on('data',chunk=>{value+=chunk;if(value.length>1048576)request.destroy();});
      response.on('end',()=>{if(response.statusCode!==200)process.exit(72);process.stdout.write(value);});
    });
    request.on('timeout',()=>request.destroy(new Error('timeout')));
    request.on('error',()=>process.exit(73));
  `;
  const raw = run(process.execPath, ['-e', script, String(port), requestPath], { timeout: 10_000 });
  return JSON.parse(raw);
}

function captureProviderStatus(port) {
  const snapshot = {};
  for (const requestPath of STATUS_PATHS) {
    const value = requestJson(port, `${requestPath}?migration=${Date.now()}`);
    const publicValue = {};
    for (const key of STATUS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(value, key)) publicValue[key] = value[key];
    }
    snapshot[requestPath] = publicValue;
  }
  return snapshot;
}

function captureProviderStatusForApp(port, app) {
  assertPortOwnedByApp(port, app);
  const snapshot = captureProviderStatus(port);
  assertPortOwnedByApp(port, app);
  assertNoInspectors(app);
  return snapshot;
}

function assertProviderStatusPreserved(expected, actual) {
  for (const requestPath of STATUS_PATHS) {
    for (const [key, value] of Object.entries(expected[requestPath] || {})) {
      if (actual[requestPath]?.[key] !== value) {
        fail(`provider state changed at ${requestPath}.${key}`);
      }
    }
  }
  const qq = actual['/api/qq/login/status'] || {};
  if (qq.loggedIn !== true || qq.playbackKeyReady !== true) {
    fail('QQ login or playback key is not ready after the update');
  }
}

function assertSingleIndexedMineradioApp() {
  const deadline = Date.now() + 10_000;
  let results = [];
  while (Date.now() < deadline) {
    results = run('/usr/bin/mdfind', [
      'kMDItemCFBundleIdentifier == "com.mineradio.desktop"',
    ]).trim().split('\n').filter(Boolean);
    if (results.length === 1 && results[0] === INSTALL_APP) return;
    sleep(250);
  }
  fail(`Spotlight does not expose exactly one installed Mineradio App: ${results.join(',')}`);
}

function waitForProviderStatus(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try { return captureProviderStatus(port); } catch (error) { lastError = error; }
    sleep(250);
  }
  throw lastError || new Error('Mineradio provider API did not become ready');
}

function acquireControllerLock() {
  ensurePrivateDirectory(MIGRATION_ROOT);
  ensurePrivateDirectory(path.join(MIGRATION_ROOT, 'runtime-tmp'));
  run('/usr/bin/shlock', ['-p', String(process.pid), '-f', CONTROLLER_LOCK], {
    env: cleanEnvironment(),
  });
  lockOwned = true;
}

function releaseControllerLock() {
  if (!lockOwned) return;
  try {
    if (fs.readFileSync(CONTROLLER_LOCK, 'utf8').trim() === String(process.pid)) {
      fs.renameSync(CONTROLLER_LOCK, `${CONTROLLER_LOCK}.released-${process.pid}`);
      fs.unlinkSync(`${CONTROLLER_LOCK}.released-${process.pid}`);
      fsyncPath(MIGRATION_ROOT);
    }
  } catch {}
  lockOwned = false;
}

function installGuard(nonce) {
  if (fs.existsSync(GUARD_PATH)) fail('a Mineradio migration guard already exists');
  durableWriteJson(GUARD_PATH, { nonce });
  const metadata = fs.lstatSync(GUARD_PATH);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
      || metadata.nlink !== 1 || (metadata.mode & 0o177) !== 0) {
    fail('the Mineradio migration guard failed validation');
  }
}

function guardNonce() {
  const metadata = fs.lstatSync(GUARD_PATH);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
      || metadata.nlink !== 1 || (metadata.mode & 0o177) !== 0 || metadata.size > 256) {
    fail('the Mineradio migration guard failed validation');
  }
  const value = JSON.parse(fs.readFileSync(GUARD_PATH, 'utf8'));
  const nonce = value && typeof value.nonce === 'string' ? value.nonce : '';
  if (!/^[a-f0-9]{64}$/.test(nonce)) fail('the Mineradio migration guard nonce is invalid');
  return nonce;
}

function removeGuard() {
  if (!fs.existsSync(GUARD_PATH)) return;
  const expected = activeJournal && activeJournal.guardNonce;
  if (!expected || guardNonce() !== expected) fail('refusing to remove an unrelated migration guard');
  const moved = `${GUARD_PATH}.released-${process.pid}`;
  fs.renameSync(GUARD_PATH, moved);
  fs.unlinkSync(moved);
  fsyncPath(MIGRATION_ROOT);
}

function securityAgentPids() {
  const output = run('/bin/ps', ['-axo', 'pid=,command=']);
  return output.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.*SecurityAgent\.app\/Contents\/MacOS\/SecurityAgent.*)$/);
    return match ? [Number(match[1])] : [];
  });
}

function assertNoSecurityAgent() {
  const pids = securityAgentPids();
  if (pids.length > 0) fail(`SecurityAgent is active during the no-prompt migration: ${pids.join(',')}`);
}

function assertMigrationQuiescent() {
  if (!activeJournal || guardNonce() !== activeJournal.guardNonce) {
    fail('the authenticated migration guard is not active');
  }
  waitForNoAppProcesses(INSTALL_APP);
  const unexpected = allMineradioPids();
  if (unexpected.length > 0) {
    fail(`a Mineradio process is still active during migration: ${unexpected.join(',')}`);
  }
  assertPortFree(3000);
  assertNoSecurityAgent();
}

function recoveryEnvironment() {
  return cleanEnvironment({ ELECTRON_RUN_AS_NODE: '1' });
}

function runRecovery(action, args = []) {
  assertMigrationQuiescent();
  const output = run(activeJournal.oldExecutable, [activeJournal.recoveryHost, action, ...args], {
    env: recoveryEnvironment(),
    timeout: 30_000,
  });
  const result = JSON.parse(output);
  assertMigrationQuiescent();
  return result;
}

function runNewSpecial(mode) {
  assertMigrationQuiescent();
  const output = run(bundleExecutable(INSTALL_APP), [mode], {
    env: cleanEnvironment(),
    timeout: 30_000,
  });
  const result = JSON.parse(output);
  assertMigrationQuiescent();
  return result;
}

function freshOperationDirectory(name) {
  const directory = path.join(
    activeJournal.runDir,
    'operations',
    `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${name}`,
  );
  fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  assertPrivateDirectory(directory);
  return directory;
}

function parsePipelineResult(directory, side) {
  const status = fs.readFileSync(path.join(directory, `${side}.status`), 'utf8').trim();
  if (status !== '0') fail(`${side} side of the Safe Storage pipeline failed`);
  const raw = fs.readFileSync(path.join(directory, `${side}.stdout.json`), 'utf8').trim();
  if (!raw) fail(`${side} side of the Safe Storage pipeline returned no state`);
  return JSON.parse(raw);
}

function runFramePipeline(mode, label) {
  assertMigrationQuiescent();
  const directory = freshOperationDirectory(label);
  run('/bin/bash', [
    activeJournal.pipeline,
    'frame-to-new',
    activeJournal.oldExecutable,
    activeJournal.recoveryHost,
    bundleExecutable(INSTALL_APP),
    directory,
    mode,
  ], { timeout: 60_000 });
  const result = { old: parsePipelineResult(directory, 'old'), new: parsePipelineResult(directory, 'new') };
  assertMigrationQuiescent();
  return result;
}

function runProofPipeline() {
  assertMigrationQuiescent();
  const directory = freshOperationDirectory('commit-proof');
  run('/bin/bash', [
    activeJournal.pipeline,
    'proof-to-old',
    activeJournal.oldExecutable,
    activeJournal.recoveryHost,
    bundleExecutable(INSTALL_APP),
    directory,
  ], { timeout: 60_000 });
  const result = { old: parsePipelineResult(directory, 'old'), new: parsePipelineResult(directory, 'new') };
  assertMigrationQuiescent();
  return result;
}

function assertNoInspectors(app) {
  for (const pid of appPids(app)) {
    const command = pidCommand(pid);
    if (/--inspect(?:-brk)?(?:=|\s)|--remote-debugging-port/.test(command)) {
      fail(`debug port detected in normal Mineradio process ${pid}`);
    }
  }
}

function launchForVerification(guardNonce) {
  assertPortFree(3000);
  const logDirectory = freshOperationDirectory('normal-launch');
  const stdout = fs.openSync(path.join(logDirectory, 'stdout.log'), 'wx', 0o600);
  const stderr = fs.openSync(path.join(logDirectory, 'stderr.log'), 'wx', 0o600);
  const child = spawn(bundleExecutable(INSTALL_APP), [], {
    cwd: '/',
    env: cleanEnvironment({ MINERADIO_MIGRATION_VERIFY_NONCE: guardNonce }),
    stdio: ['ignore', stdout, stderr],
  });
  child.on('error', () => {});
  fs.closeSync(stdout);
  fs.closeSync(stderr);
  waitForProviderStatus(3000);
  const snapshot = captureProviderStatusForApp(3000, INSTALL_APP);
  return snapshot;
}

function launchNormallyAndVerify(expected) {
  assertPortFree(3000);
  run('/usr/bin/open', ['-na', INSTALL_APP], { timeout: 15_000 });
  waitForProviderStatus(3000);
  const snapshot = captureProviderStatusForApp(3000, INSTALL_APP);
  assertProviderStatusPreserved(expected, snapshot);
  if (activeJournal && activeJournal.stagedApp && fs.existsSync(activeJournal.stagedApp)) {
    fail('a hidden staged Mineradio App remains in /Applications');
  }
  assertSingleIndexedMineradioApp();
  return snapshot;
}

function disabledProviderStatePaths() {
  const relative = [
    '.qishui-cookie',
    '.qishui-token',
    '.qishui-oauth.json',
    'qishui-token.json',
    'qishui-oauth.json',
    path.join('Partitions', 'mineradio-qishui-oauth-login'),
  ];
  for (const name of fs.readdirSync(USER_DATA)) {
    if (/^\.(?:qq-|kugou-)?cookie\.bak-\d+$/.test(name)) relative.push(name);
  }
  return [...new Set(relative)].filter((entry) => fs.existsSync(path.join(USER_DATA, entry))).sort();
}

function assertNoDisabledProviderCookiesOutsideDedicatedPartition() {
  const cookieDatabases = [];
  const visit = (entry) => {
    const metadata = fs.lstatSync(entry);
    if (metadata.isSymbolicLink()) return;
    if (!metadata.isDirectory()) return;
    for (const name of fs.readdirSync(entry)) {
      const child = path.join(entry, name);
      const childMetadata = fs.lstatSync(child);
      if (childMetadata.isDirectory() && !childMetadata.isSymbolicLink()) visit(child);
      else if (childMetadata.isFile() && name === 'Cookies') cookieDatabases.push(child);
    }
  };
  visit(USER_DATA);
  const dedicated = `${path.join(USER_DATA, 'Partitions', 'mineradio-qishui-oauth-login')}${path.sep}`;
  const query = [
    'SELECT COUNT(*) FROM cookies WHERE',
    "lower(host_key) LIKE '%qishui%' OR lower(host_key) LIKE '%douyin%'",
    "OR lower(host_key) LIKE '%iesdouyin%' OR lower(host_key) LIKE '%amemv%';",
  ].join(' ');
  for (const database of cookieDatabases) {
    if (`${database}${path.sep}`.startsWith(dedicated)) continue;
    const count = Number(run('/usr/bin/sqlite3', ['-readonly', database, query]).trim());
    if (!Number.isSafeInteger(count) || count !== 0) {
      fail('Qishui/Douyin cookies exist outside the dedicated opaque partition');
    }
  }
}

function quarantineDisabledProviderState(relativePaths) {
  const quarantine = activeJournal.legacyQuarantine;
  ensurePrivateDirectory(quarantine);
  for (const relative of relativePaths) {
    const source = path.join(USER_DATA, relative);
    if (!fs.existsSync(source)) continue;
    const target = path.join(quarantine, relative);
    ensurePrivateDirectory(path.dirname(target));
    if (fs.existsSync(target)) fail(`legacy-state quarantine target already exists: ${target}`);
    fs.renameSync(source, target);
    fsyncParent(source);
    fsyncParent(target);
  }
  for (const relative of relativePaths) {
    if (fs.existsSync(path.join(USER_DATA, relative))) {
      fail(`legacy provider state remains active after quarantine: ${relative}`);
    }
  }
  fsyncTree(quarantine);
}

function assertProfileSnapshotCurrent() {
  if (!activeJournal.migratingUserDataDigest) fail('the migrating profile digest is unavailable');
  if (treeDigest(USER_DATA) !== activeJournal.migratingUserDataDigest) {
    fail('the live Mineradio profile changed after the final migration snapshot');
  }
}

function restoreProfileSnapshot() {
  if (!fs.existsSync(activeJournal.userDataBackup)) fail('the full userData snapshot is missing');
  if (!/^[a-f0-9]{64}$/.test(activeJournal.userDataDigest || '')
      || treeDigest(activeJournal.userDataBackup) !== activeJournal.userDataDigest) {
    fail('the full userData snapshot is incomplete or does not match its durable digest');
  }
  if (fs.existsSync(USER_DATA)) {
    const failed = path.join(
      activeJournal.runDir,
      `failed-userdata-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.backup`,
    );
    fs.renameSync(USER_DATA, failed);
    fsyncParent(USER_DATA);
  }
  copyDirectoryDurable(activeJournal.userDataBackup, USER_DATA);
  if (treeDigest(USER_DATA) !== activeJournal.userDataDigest) fail('restored userData digest mismatch');
}

function moveInstalledAppAside(label) {
  if (!fs.existsSync(INSTALL_APP)) return null;
  const target = path.join(
    activeJournal.runDir,
    `${label}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.app.backup`,
  );
  if (fs.existsSync(target)) fail(`App quarantine target already exists: ${target}`);
  fs.renameSync(INSTALL_APP, target);
  fsyncParent(INSTALL_APP);
  fsyncParent(target);
  return target;
}

function quarantineMigrationPath(source, label) {
  if (!source || !fs.existsSync(source)) return null;
  const metadata = fs.lstatSync(source);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail(`refusing to quarantine an unsafe migration path: ${source}`);
  }
  const target = path.join(
    activeJournal.runDir,
    `${label}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.app.backup`,
  );
  fs.renameSync(source, target);
  fsyncParent(source);
  fsyncParent(target);
  return target;
}

function quarantineStagePartials(stage, label) {
  const parent = path.dirname(stage);
  const prefix = `${path.basename(stage)}.partial-`;
  for (const name of fs.readdirSync(parent).filter((entry) => entry.startsWith(prefix))) {
    quarantineMigrationPath(path.join(parent, name), label);
  }
}

function restoreOldApp() {
  stopApp(INSTALL_APP);
  quarantineMigrationPath(activeJournal.stagedApp, 'rollback-candidate-stage');
  quarantineStagePartials(activeJournal.stagedApp, 'rollback-candidate-partial');
  const stage = `/Applications/.Mineradio.restore-${activeJournal.runId}.app.backup`;
  quarantineStagePartials(stage, 'rollback-restore-partial');
  if (signedAppMatches(INSTALL_APP, OLD_ASAR_SHA256, OLD_CDHASH)) return;
  moveInstalledAppAside('failed-new-app');
  if (!fs.existsSync(activeJournal.oldAppBackup)) fail('the old App backup is missing');
  assertSignedApp(activeJournal.oldAppBackup, OLD_ASAR_SHA256, OLD_CDHASH);
  if (fs.existsSync(stage)) {
    if (!signedAppMatches(stage, OLD_ASAR_SHA256, OLD_CDHASH)) {
      fail('an unexpected old-App restore stage already exists');
    }
  } else {
    copyDirectoryDurable(activeJournal.oldAppBackup, stage);
  }
  fs.renameSync(stage, INSTALL_APP);
  fsyncParent(INSTALL_APP);
  assertSignedApp(INSTALL_APP, OLD_ASAR_SHA256, OLD_CDHASH);
}

function installCandidateFromBackup() {
  stopApp(INSTALL_APP);
  quarantineStagePartials(activeJournal.stagedApp, 'stale-candidate-partial');
  if (signedAppMatches(INSTALL_APP, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH)) {
    if (activeJournal.stagedApp && fs.existsSync(activeJournal.stagedApp)) {
      quarantineMigrationPath(activeJournal.stagedApp, 'stale-candidate-stage');
    }
    return;
  }
  moveInstalledAppAside('displaced-installed-app');
  if (!fs.existsSync(activeJournal.candidateBackup)) fail('the durable candidate App backup is missing');
  assertSignedApp(activeJournal.candidateBackup, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH);
  const staged = activeJournal.stagedApp;
  if (fs.existsSync(staged)) {
    assertSignedApp(staged, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH);
  } else {
    copyDirectoryDurable(activeJournal.candidateBackup, staged);
    assertSignedApp(staged, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH);
  }
  fs.renameSync(staged, INSTALL_APP);
  fsyncParent(INSTALL_APP);
  assertSignedApp(INSTALL_APP, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH);
}

function rollbackBeforeCommit() {
  updateJournal('rollback-started');
  stopApp(INSTALL_APP);
  assertMigrationQuiescent();
  if (signedAppMatches(INSTALL_APP, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH)) {
    const state = runNewSpecial('--mineradio-safe-storage-state');
    if (state.completed === true) return finishCommittedNew();
    if (state.pending === true) {
      const rolledBack = runFramePipeline(
        '--mineradio-safe-storage-rollback-delete', 'rollback-new-target');
      if (rolledBack.new.target || rolledBack.new.pending || rolledBack.new.completed) {
        fail('new Safe Storage rollback did not remove its pending target and marker');
      }
    }
  }
  if (fs.existsSync(activeJournal.oldExecutable) && fs.existsSync(activeJournal.recoveryHost)) {
    const recovery = runRecovery('state');
    if (recovery.recovery === true) {
      const restoredTarget = runRecovery('restore-target');
      if (restoredTarget.target !== true || restoredTarget.recovery !== true) {
        fail('old Safe Storage target was not restored from durable recovery');
      }
      const cleanedRecovery = runRecovery('cleanup-recovery');
      if (cleanedRecovery.target !== true || cleanedRecovery.recovery !== false) {
        fail('old Safe Storage recovery item did not clean after target restoration');
      }
    } else {
      const verifiedOldTarget = runRecovery('cleanup-recovery');
      if (verifiedOldTarget.target !== true || verifiedOldTarget.recovery !== false) {
        fail('the old Safe Storage target is unavailable after rollback');
      }
    }
  }
  if (activeJournal.userDataDigest && activeJournal.userDataBackup
      && fs.existsSync(activeJournal.userDataBackup)) {
    restoreProfileSnapshot();
  }
  restoreOldApp();
  removeGuard();
  const restored = launchNormallyAndVerify(activeJournal.providerBaseline);
  updateJournal('rolled-back', { providerRestored: restored, committedTarget: 'old' });
  return activeJournal;
}

function finishCommittedNew() {
  installCandidateFromBackup();
  assertMigrationQuiescent();
  let state = runNewSpecial('--mineradio-safe-storage-state');
  let recovery = runRecovery('state');
  if (state.pending === true) {
    if (recovery.recovery !== true) {
      fail('the pending new Safe Storage target has no durable recovery item');
    }
    const committed = runFramePipeline('--mineradio-safe-storage-commit', 'resume-commit-new-target');
    if (!committed.new.target || committed.new.pending || !committed.new.completed) {
      fail('resumed new Safe Storage commit did not converge');
    }
    updateJournal('new-success-committed', { committedTarget: 'new' });
    state = committed.new;
  }
  if (state.completed === true) {
    if (activeJournal.committedTarget !== 'new') {
      updateJournal('new-success-committed', { committedTarget: 'new' });
    }
    recovery = runRecovery('state');
    if (recovery.recovery === true) {
      const proof = runProofPipeline();
      if (proof.old.recovery !== false || proof.new.completed !== true) {
        fail('commit proof did not clean the durable old recovery item');
      }
      updateJournal('recovery-cleaned', { committedTarget: 'new' });
    }
    const cleaned = runNewSpecial('--mineradio-safe-storage-cleanup');
    if (!cleaned.target || cleaned.pending || cleaned.completed) {
      fail('committed new Safe Storage markers did not clean');
    }
    updateJournal('markers-cleaned', { committedTarget: 'new' });
  }
  const finalState = runNewSpecial('--mineradio-safe-storage-state');
  recovery = runRecovery('state');
  if (finalState.target !== true || finalState.pending || finalState.completed) {
    fail('committed new Safe Storage state did not converge');
  }
  if (recovery.recovery !== false) fail('old Safe Storage recovery remains after new commit');
  removeGuard();
  const status = launchNormallyAndVerify(activeJournal.providerBaseline);
  updateJournal('complete', { committedTarget: 'new', providerFinal: status });
  return activeJournal;
}

function recoverNonDestructiveFailure() {
  if (activeJournal.userDataDigest && activeJournal.userDataBackup
      && fs.existsSync(activeJournal.userDataBackup)) {
    stopApp(INSTALL_APP);
    restoreProfileSnapshot();
  }
  restoreOldApp();
  removeGuard();
  const restored = launchNormallyAndVerify(activeJournal.providerBaseline);
  updateJournal('rolled-back', { providerRestored: restored, committedTarget: 'old' });
  return activeJournal;
}

const DEFINITELY_PRE_RECOVERY_STAGES = new Set([
  'created',
  'guard-active',
  'old-stopped',
  'backups-durable',
  'legacy-quarantine-intent',
  'legacy-quarantined',
  'new-app-installed',
]);

function decideRecoveryAction({ candidateInstalled, completed, committedTarget, recoveryToolsReady, stage }) {
  if (completed === true || committedTarget === 'new') return 'finish-new';
  if (recoveryToolsReady) return 'rollback-old';
  if (DEFINITELY_PRE_RECOVERY_STAGES.has(stage)) return 'unwind-nondestructive';
  return 'fail-missing-recovery-tools';
}

function reconcileMigration() {
  if (!fs.existsSync(GUARD_PATH)) installGuard(activeJournal.guardNonce);
  stopApp(INSTALL_APP);
  assertMigrationQuiescent();

  if ((activeJournal.stage === 'legacy-quarantined'
      || activeJournal.stage === 'new-app-installed')
      && activeJournal.committedTarget !== 'new') {
    return recoverNonDestructiveFailure();
  }

  const recoveryToolsReady = activeJournal.oldExecutable && activeJournal.recoveryHost
    && fs.existsSync(activeJournal.oldExecutable) && fs.existsSync(activeJournal.recoveryHost);
  const candidateInstalled = signedAppMatches(
    INSTALL_APP, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH);
  const state = candidateInstalled
    ? runNewSpecial('--mineradio-safe-storage-state')
    : { completed: false };
  const action = decideRecoveryAction({
    candidateInstalled,
    completed: state.completed,
    committedTarget: activeJournal.committedTarget,
    recoveryToolsReady,
    stage: activeJournal.stage,
  });
  if (action === 'finish-new') {
    if (!recoveryToolsReady) fail('durable recovery tools are missing after new commit');
    return finishCommittedNew();
  }
  if (action === 'rollback-old') return rollbackBeforeCommit();
  if (action === 'unwind-nondestructive') return recoverNonDestructiveFailure();
  fail('durable Keychain recovery tools are missing after recovery preparation may have begun');
}

function copyRecoveryTools(runDir) {
  const tools = path.join(runDir, 'recovery-tools');
  const native = path.join(tools, 'native');
  fs.mkdirSync(native, { recursive: true, mode: 0o700 });
  fs.chmodSync(tools, 0o700);
  fs.chmodSync(native, 0o700);
  const host = path.join(tools, 'safe-storage-recovery-host.js');
  const addon = path.join(native, 'safe-storage-recovery.node');
  const pipeline = path.join(tools, 'run-safe-storage-pipeline.sh');
  const controller = path.join(tools, 'install-local-macos-safe.js');
  if (sha256File(path.join(REPO_ROOT, 'scripts', 'safe-storage-recovery-host.js')) !== RECOVERY_HOST_SHA256
      || sha256File(path.join(REPO_ROOT, 'scripts', 'run-safe-storage-pipeline.sh')) !== PIPELINE_SHA256
      || sha256File(path.join(REPO_ROOT, 'scripts', 'native', 'safe-storage-recovery.node'))
        !== RECOVERY_ADDON_SHA256) {
    fail('repository recovery tools no longer match the reviewed hashes');
  }
  fs.copyFileSync(path.join(REPO_ROOT, 'scripts', 'safe-storage-recovery-host.js'), host, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(REPO_ROOT, 'scripts', 'native', 'safe-storage-recovery.node'), addon, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(REPO_ROOT, 'scripts', 'run-safe-storage-pipeline.sh'), pipeline, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(__filename, controller, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(host, 0o500);
  fs.chmodSync(addon, 0o500);
  fs.chmodSync(pipeline, 0o500);
  fs.chmodSync(controller, 0o500);
  if (sha256File(addon) !== RECOVERY_ADDON_SHA256) fail('copied recovery addon hash mismatch');
  if (sha256File(host) !== RECOVERY_HOST_SHA256 || sha256File(pipeline) !== PIPELINE_SHA256) {
    fail('copied recovery host or pipeline hash mismatch');
  }
  fsyncTree(tools);
  return {
    host,
    addon,
    pipeline,
    controller,
    controllerSha256: sha256File(controller),
  };
}

async function startMigration(candidateApp) {
  acquireControllerLock();
  if (fs.existsSync(GUARD_PATH)) fail('a prior Mineradio migration guard needs explicit recovery');
  assertNoSecurityAgent();
  assertSingleIndexedMineradioApp();
  assertSignedApp(INSTALL_APP, OLD_ASAR_SHA256, OLD_CDHASH);
  await assertCandidate(candidateApp);
  if (appPids(INSTALL_APP).length === 0) {
    assertPortFree(3000);
    run('/usr/bin/open', ['-na', INSTALL_APP], { timeout: 15_000 });
    waitForProviderStatus(3000);
  }
  const providerBaseline = captureProviderStatusForApp(3000, INSTALL_APP);
  const qq = providerBaseline['/api/qq/login/status'] || {};
  if (qq.loggedIn !== true || qq.playbackKeyReady !== true) {
    fail('the existing QQ session must be fully playable before the update');
  }

  ensurePrivateDirectory(BACKUP_ROOT);
  const runId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const runDir = path.join(BACKUP_ROOT, `before-final-fusion-${runId}`);
  ensurePrivateDirectory(runDir);
  ensurePrivateDirectory(path.join(runDir, 'runtime-tmp'));
  ensurePrivateDirectory(path.join(runDir, 'operations'));
  const userDataBackup = path.join(runDir, 'userdata-before-install.backup');
  const candidateBackup = path.join(runDir, 'candidate.app.backup');
  const oldAppBackup = path.join(runDir, 'old-installed.app.backup');
  const legacyQuarantine = path.join(runDir, 'quarantined-legacy-state');
  const stagedApp = `/Applications/.Mineradio.migration-${runId}.app.backup`;
  const recoveryTools = copyRecoveryTools(runDir);
  const guardNonce = crypto.randomBytes(32).toString('hex');
  activeJournal = {
    schema: 2,
    runId,
    runDir,
    journalPath: path.join(runDir, 'journal.json'),
    stage: 'created',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    installApp: INSTALL_APP,
    userData: USER_DATA,
    candidateSource: candidateApp,
    candidateAsarSha256: CANDIDATE_ASAR_SHA256,
    candidateCdHash: CANDIDATE_CDHASH,
    oldAsarSha256: OLD_ASAR_SHA256,
    oldCdHash: OLD_CDHASH,
    providerBaseline,
    guardNonce,
    committedTarget: null,
    userDataBackup,
    candidateBackup,
    oldAppBackup,
    legacyQuarantine,
    stagedApp,
    oldExecutable: bundleExecutable(oldAppBackup),
    recoveryHost: recoveryTools.host,
    recoveryAddon: recoveryTools.addon,
    pipeline: recoveryTools.pipeline,
    controller: recoveryTools.controller,
    controllerSha256: recoveryTools.controllerSha256,
  };
  durableWriteJson(activeJournal.journalPath, activeJournal);
  activeJournalTrusted = true;
  installGuard(guardNonce);
  checkpoint('guard-active');

  stopApp(INSTALL_APP);
  assertPortFree(3000);
  checkpoint('old-stopped');

  assertNoDisabledProviderCookiesOutsideDedicatedPartition();
  const liveDigest = treeDigest(USER_DATA);
  copyDirectoryDurable(USER_DATA, userDataBackup);
  const backupDigest = treeDigest(userDataBackup);
  if (liveDigest !== backupDigest) fail('full userData snapshot digest mismatch');
  copyDirectoryDurable(candidateApp, candidateBackup);
  await assertCandidate(candidateBackup, { requireFrozenBuildRoot: false });
  copyDirectoryDurable(INSTALL_APP, oldAppBackup);
  assertSignedApp(oldAppBackup, OLD_ASAR_SHA256, OLD_CDHASH);
  checkpoint('backups-durable', {
    userDataDigest: liveDigest,
  });

  if (treeDigest(USER_DATA) !== liveDigest || appPids(INSTALL_APP).length !== 0) {
    fail('live profile changed after its final snapshot');
  }
  const legacyState = disabledProviderStatePaths();
  checkpoint('legacy-quarantine-intent', { legacyState });
  quarantineDisabledProviderState(legacyState);
  const migratingUserDataDigest = treeDigest(USER_DATA);
  checkpoint('legacy-quarantined', { migratingUserDataDigest });

  assertProfileSnapshotCurrent();
  installCandidateFromBackup();
  checkpoint('new-app-installed');

  const helperState = runNewSpecial('--mineradio-safe-storage-state');
  if (!helperState.target || helperState.pending || helperState.completed) {
    fail('the signed candidate could not inspect the untouched Safe Storage state');
  }
  checkpoint('new-helper-verified');

  const prepared = runRecovery('prepare', [CANDIDATE_CDHASH]);
  if (!prepared.target || !prepared.recovery) fail('old Safe Storage recovery item was not prepared');
  checkpoint('recovery-prepared');

  assertProfileSnapshotCurrent();
  const deleted = runRecovery('delete-target');
  if (deleted.target || !deleted.recovery) fail('old Safe Storage target was not removed safely');
  checkpoint('old-target-deleted');

  const installed = runFramePipeline('--mineradio-safe-storage-install', 'install-new-target');
  if (!installed.new.target || !installed.new.pending || installed.new.completed) {
    fail('new Safe Storage target did not enter the pending state');
  }
  checkpoint('new-target-installed');

  const verified = launchForVerification(guardNonce);
  assertProviderStatusPreserved(providerBaseline, verified);
  checkpoint('new-verified', { providerVerified: verified });
  stopApp(INSTALL_APP);
  assertPortFree(3000);

  const committed = runFramePipeline('--mineradio-safe-storage-commit', 'commit-new-target');
  if (!committed.new.target || committed.new.pending || !committed.new.completed) {
    fail('new Safe Storage target did not commit');
  }
  checkpoint('new-success-committed', { committedTarget: 'new' });

  const proof = runProofPipeline();
  if (proof.old.recovery !== false || proof.new.completed !== true) {
    fail('commit proof did not clean the old recovery item');
  }
  checkpoint('recovery-cleaned', { committedTarget: 'new' });

  const cleaned = runNewSpecial('--mineradio-safe-storage-cleanup');
  if (!cleaned.target || cleaned.pending || cleaned.completed) fail('new migration markers were not cleaned');
  checkpoint('markers-cleaned', { committedTarget: 'new' });

  removeGuard();
  const finalStatus = launchNormallyAndVerify(providerBaseline);
  updateJournal('complete', { committedTarget: 'new', providerFinal: finalStatus });
  releaseControllerLock();
  return activeJournal;
}

async function preflightCandidate(candidateApp) {
  if (fs.existsSync(GUARD_PATH)) fail('a prior Mineradio migration guard needs explicit recovery');
  assertNoSecurityAgent();
  assertSignedApp(INSTALL_APP, OLD_ASAR_SHA256, OLD_CDHASH);
  await assertCandidate(candidateApp);
  assertSingleIndexedMineradioApp();
  const status = captureProviderStatusForApp(3000, INSTALL_APP);
  const qq = status['/api/qq/login/status'] || {};
  if (qq.loggedIn !== true || qq.playbackKeyReady !== true) {
    fail('the existing QQ session must be fully playable before the update');
  }
  return { stage: 'preflight-ok', runDir: null };
}

function loadAndValidateJournal(runDirArgument) {
  const resolvedRoot = fs.realpathSync(BACKUP_ROOT);
  const resolvedRunDir = fs.realpathSync(runDirArgument);
  if (!resolvedRunDir.startsWith(`${resolvedRoot}${path.sep}`)
      || !/^before-final-fusion-\d+-[a-f0-9]{12}$/.test(path.basename(resolvedRunDir))) {
    fail('recovery run directory is outside the private Mineradio backup root');
  }
  assertPrivateDirectory(resolvedRoot);
  assertPrivateDirectory(resolvedRunDir);
  const journalPath = path.join(resolvedRunDir, 'journal.json');
  const journalMetadata = fs.lstatSync(journalPath);
  if (!journalMetadata.isFile() || journalMetadata.isSymbolicLink()
      || journalMetadata.uid !== process.getuid() || journalMetadata.nlink !== 1
      || (journalMetadata.mode & 0o177) !== 0) {
    fail('recovery journal is not a private regular file');
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const expected = {
    schema: 2,
    runDir: resolvedRunDir,
    journalPath,
    installApp: INSTALL_APP,
    userData: USER_DATA,
    candidateAsarSha256: CANDIDATE_ASAR_SHA256,
    candidateCdHash: CANDIDATE_CDHASH,
    oldAsarSha256: OLD_ASAR_SHA256,
    oldCdHash: OLD_CDHASH,
    userDataBackup: path.join(resolvedRunDir, 'userdata-before-install.backup'),
    candidateBackup: path.join(resolvedRunDir, 'candidate.app.backup'),
    oldAppBackup: path.join(resolvedRunDir, 'old-installed.app.backup'),
    legacyQuarantine: path.join(resolvedRunDir, 'quarantined-legacy-state'),
    stagedApp: `/Applications/.Mineradio.migration-${journal.runId}.app.backup`,
    recoveryHost: path.join(resolvedRunDir, 'recovery-tools', 'safe-storage-recovery-host.js'),
    recoveryAddon: path.join(resolvedRunDir, 'recovery-tools', 'native', 'safe-storage-recovery.node'),
    pipeline: path.join(resolvedRunDir, 'recovery-tools', 'run-safe-storage-pipeline.sh'),
    controller: path.join(resolvedRunDir, 'recovery-tools', 'install-local-macos-safe.js'),
  };
  for (const [key, value] of Object.entries(expected)) {
    if (journal[key] !== value) fail(`recovery journal field mismatch: ${key}`);
  }
  if (journal.oldExecutable !== bundleExecutable(journal.oldAppBackup)
      || !/^[a-f0-9]{64}$/.test(journal.guardNonce || '')
      || !/^\d+-[a-f0-9]{12}$/.test(journal.runId || '')
      || typeof journal.stage !== 'string' || !journal.providerBaseline) {
    fail('recovery journal contains an invalid identity or state');
  }
  journal.journalPath = journalPath;
  if (fs.existsSync(journal.controller)
      && sha256File(journal.controller) !== journal.controllerSha256) {
    fail('durable recovery controller hash mismatch');
  }
  if (!fs.existsSync(journal.controller)
      || !/^[a-f0-9]{64}$/.test(journal.controllerSha256 || '')) {
    fail('durable recovery controller is missing or unpinned');
  }
  for (const [file, expectedHash] of [
    [journal.recoveryHost, RECOVERY_HOST_SHA256],
    [journal.recoveryAddon, RECOVERY_ADDON_SHA256],
    [journal.pipeline, PIPELINE_SHA256],
  ]) {
    if (!fs.existsSync(file) || sha256File(file) !== expectedHash) {
      fail(`durable recovery tool hash mismatch: ${file}`);
    }
    const metadata = fs.lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
        || metadata.nlink !== 1 || (metadata.mode & 0o022) !== 0) {
      fail(`durable recovery tool shape mismatch: ${file}`);
    }
  }
  if (fs.existsSync(journal.oldAppBackup)) {
    assertSignedApp(journal.oldAppBackup, OLD_ASAR_SHA256, OLD_CDHASH);
  }
  if (fs.existsSync(journal.candidateBackup)) {
    assertSignedApp(journal.candidateBackup, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH);
  }
  if (sha256File(__filename) !== journal.controllerSha256) {
    fail(`recovery must run the frozen controller copy: ${journal.controller}`);
  }
  activeJournal = journal;
  activeJournalTrusted = true;
  return activeJournal;
}

async function recoverMigration(runDir) {
  acquireControllerLock();
  loadAndValidateJournal(runDir);
  if (activeJournal.stage === 'complete') {
    if (fs.existsSync(GUARD_PATH)) fail('a completed migration unexpectedly retains its launch guard');
    assertSignedApp(INSTALL_APP, CANDIDATE_ASAR_SHA256, CANDIDATE_CDHASH);
    const status = appPids(INSTALL_APP).length > 0
      ? captureProviderStatusForApp(3000, INSTALL_APP)
      : launchNormallyAndVerify(activeJournal.providerBaseline);
    assertProviderStatusPreserved(activeJournal.providerBaseline, status);
    assertSingleIndexedMineradioApp();
    releaseControllerLock();
    return activeJournal;
  }
  if (activeJournal.stage === 'rolled-back') {
    if (fs.existsSync(GUARD_PATH)) fail('a rolled-back migration unexpectedly retains its launch guard');
    assertSignedApp(INSTALL_APP, OLD_ASAR_SHA256, OLD_CDHASH);
    const status = appPids(INSTALL_APP).length > 0
      ? captureProviderStatusForApp(3000, INSTALL_APP)
      : launchNormallyAndVerify(activeJournal.providerBaseline);
    assertProviderStatusPreserved(activeJournal.providerBaseline, status);
    assertSingleIndexedMineradioApp();
    releaseControllerLock();
    return activeJournal;
  }
  const result = reconcileMigration();
  releaseControllerLock();
  return result;
}

function installSignalHandlers() {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => { interrupted = true; });
  }
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') fail('this installer is for the current Apple Silicon Mac only');
  process.umask(0o077);
  installSignalHandlers();
  const [command, value] = process.argv.slice(2);
  let result;
  try {
    if (command === '--recover' && value) result = await recoverMigration(value);
    else if (command === '--preflight' && value) result = await preflightCandidate(fs.realpathSync(value));
    else if (command && !value) result = await startMigration(fs.realpathSync(command));
    else fail('usage: node scripts/install-local-macos-safe.js <candidate.app> | --preflight <candidate.app> | --recover <run-dir>');
    fs.writeSync(1, `${JSON.stringify({ ok: true, stage: result.stage, runDir: result.runDir })}\n`);
  } catch (error) {
    fs.writeSync(2, `[mineradio-safe-install] ${String(error && error.stack || error)}\n`);
    if (activeJournalTrusted && lockOwned && activeJournal
        && activeJournal.stage !== 'complete' && activeJournal.stage !== 'rolled-back') {
      try {
        reconcileMigration();
      } catch (recoveryError) {
        fs.writeSync(2, `[mineradio-safe-install] automatic recovery needs --recover: ${String(recoveryError && recoveryError.stack || recoveryError)}\n`);
      }
    }
    releaseControllerLock();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    decideRecoveryAction,
    DEFINITELY_PRE_RECOVERY_STAGES,
  };
}
