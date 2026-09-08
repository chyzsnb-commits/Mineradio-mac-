const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('崩溃记录只存本机并能找到 Crashpad 子目录里的 dmp', () => {
  const { createCrashDiagnostics } = require('../desktop/crash-diagnostics');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-crash-test-'));
  const paths = { userData: tempDir };
  let startOptions = null;
  const app = {
    getPath(name) {
      if (!paths[name]) throw new Error(`Unknown path: ${name}`);
      return paths[name];
    },
    setPath(name, value) { paths[name] = value; },
    getGPUFeatureStatus() { return { webgl: 'enabled' }; },
  };
  const crashReporter = {
    start(options) { startOptions = options; },
    getUploadToServer() { return false; },
  };

  try {
    const diagnostics = createCrashDiagnostics({
      app,
      crashReporter,
      appName: 'Mineradio Test',
      packageInfo: { version: '1.2.3' },
    });
    assert.equal(diagnostics.configure(), true);
    assert.equal(paths.crashDumps, path.join(tempDir, 'CrashDumps'));
    assert.equal(startOptions.uploadToServer, false);
    assert.equal(startOptions.globalExtra.appVersion, '1.2.3');

    const pendingDir = path.join(paths.crashDumps, 'pending');
    const completedDir = path.join(paths.crashDumps, 'completed');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.mkdirSync(completedDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, 'new-crash.dmp'), 'new');
    fs.writeFileSync(path.join(completedDir, 'old-crash.dmp'), 'old');
    fs.writeFileSync(path.join(pendingDir, 'metadata.txt'), 'ignore');

    const record = diagnostics.capture('render-process-gone', { reason: 'crashed', exitCode: 5 });
    assert.equal(record.kind, 'render-process-gone');
    assert.equal(record.details.exitCode, 5);
    assert.deepEqual(record.recentDumpFiles.map((item) => item.name).sort(), ['new-crash.dmp', 'old-crash.dmp']);

    const snapshot = diagnostics.snapshot();
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.uploadToServer, false);
    assert.equal(snapshot.records.length, 1);
    assert.equal(snapshot.recentDumpFiles.length, 2);
    assert.equal(fs.existsSync(snapshot.diagnosticsPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('崩溃诊断记录最多保留最近 50 条', () => {
  const { createCrashDiagnostics } = require('../desktop/crash-diagnostics');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-crash-limit-'));
  const paths = { userData: tempDir };
  const diagnostics = createCrashDiagnostics({
    app: {
      getPath(name) { return paths[name]; },
      setPath(name, value) { paths[name] = value; },
    },
    crashReporter: { start() {}, getUploadToServer() { return false; } },
    appName: 'Mineradio Test',
    packageInfo: { version: '1.2.3' },
  });

  try {
    diagnostics.configure();
    for (let i = 0; i < 55; i += 1) diagnostics.capture('test', { index: i });
    const records = diagnostics.snapshot().records;
    assert.equal(records.length, 50);
    assert.equal(records[0].details.index, 5);
    assert.equal(records[49].details.index, 54);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('主进程在创建窗口前启用记录并监听渲染器与 GPU 异常', () => {
  const source = read('desktop/main.js');
  const configureAt = source.indexOf('crashDiagnostics.configure()');
  const lockAt = source.indexOf('app.requestSingleInstanceLock()');
  assert.ok(configureAt >= 0 && configureAt < lockAt, 'crashReporter 必须在创建任何渲染进程前启用');
  assert.match(source, /render-process-gone[\s\S]*?crashDiagnostics\.capture\(['"]render-process-gone['"]/);
  assert.match(source, /child-process-gone[\s\S]*?crashDiagnostics\.capture\(['"]child-process-gone['"]/);
  assert.match(source, /ipcMain\.handle\(['"]mineradio-get-crash-diagnostics['"][\s\S]*?crashDiagnostics\.snapshot\(\)/);
});
