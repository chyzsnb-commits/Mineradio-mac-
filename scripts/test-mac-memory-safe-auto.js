const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readFunction(source, name) {
  const functionStart = source.indexOf(`function ${name}(`);
  assert.ok(functionStart >= 0, `缺少 ${name}`);
  const start = source.slice(Math.max(0, functionStart - 6), functionStart) === 'async '
    ? functionStart - 6
    : functionStart;
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

function loadMacMemory(execFile) {
  const source = read('desktop/system-memory-mac.js');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    process,
    console,
    require(id) {
      if (id === 'child_process') return { execFile };
      return require(id);
    },
  };
  vm.runInNewContext(source, sandbox, { filename: 'desktop/system-memory-mac.js' });
  return sandbox.module.exports;
}

test('Mac 允许用户开启系统级定时释放', () => {
  const memory = loadMacMemory(() => {});
  assert.equal(memory.SYSTEM_PURGE_AVAILABLE, true);
  assert.equal(memory.SYSTEM_PURGE_ENABLED, true);
});

test('管理员开关关闭时只提示权限不足且不弹密码框', async () => {
  const commands = [];
  const memory = loadMacMemory((file, args, callback) => {
    commands.push(file);
    if (file === '/usr/bin/sudo') callback(new Error('password required'), '', '');
    else callback(null, '', '');
  });
  const result = await memory.purgeSystemMemorySmart(29, { autoElevate: false });
  assert.equal(result.ok, false);
  assert.equal(result.needAdmin, true);
  assert.deepEqual(commands, ['/usr/bin/sudo']);
});

test('管理员开关开启时免密失败才请求 macOS 授权', async () => {
  const commands = [];
  const memory = loadMacMemory((file, args, callback) => {
    commands.push(file);
    if (file === '/usr/bin/sudo') callback(new Error('password required'), '', '');
    else callback(null, '', '');
  });
  const result = await memory.purgeSystemMemorySmart(29, { autoElevate: true });
  assert.equal(result.ok, true);
  assert.deepEqual(commands, ['/usr/bin/sudo', '/usr/bin/osascript']);
});

test('播放中达到阈值只软清理并延期系统级释放', async () => {
  const source = read('desktop/main.js');
  let softTrimCount = 0;
  let purgeCount = 0;
  const sandbox = {
    memoryPlaybackActive: true,
    memoryAutoState: {
      enabled: true,
      thresholdPercent: 78,
      mask: 29,
      autoElevate: false,
      pendingSystemPurge: false,
      lastRunAt: 0,
      lastReason: '',
      lastResult: null,
      lastError: '',
    },
    isMainWindowForegroundVisible() { return false; },
    trimAppMemoryNow() {
      softTrimCount += 1;
      return Promise.resolve({ ok: true, soft: true });
    },
    systemMemory: {
      getMemorySnapshotExtended() { return Promise.resolve({ usedPercent: 91 }); },
      purgeSystemMemorySmart() { purgeCount += 1; return Promise.resolve({ ok: true }); },
      getMemorySnapshot() { return { usedPercent: 91 }; },
    },
    Date,
    Number,
    Promise,
  };
  vm.runInNewContext(`${readFunction(source, 'runMemoryAutoTick')};`, sandbox);
  const result = await vm.runInNewContext(`runMemoryAutoTick('timer')`, sandbox);
  assert.equal(softTrimCount, 1);
  assert.equal(purgeCount, 0);
  assert.equal(sandbox.memoryAutoState.pendingSystemPurge, true);
  assert.equal(result.result.reason, 'playback-active');
});

test('关闭播放器自动压缩后播放中只延期不软清理', async () => {
  const source = read('desktop/main.js');
  let softTrimCount = 0;
  const sandbox = {
    memoryPlaybackActive: true,
    memoryAutoState: {
      enabled: true,
      appTrimEnabled: false,
      thresholdPercent: 78,
      mask: 29,
      autoElevate: false,
      pendingSystemPurge: false,
      lastRunAt: 0,
      lastReason: '',
      lastResult: null,
      lastError: '',
    },
    isMainWindowForegroundVisible() { return false; },
    trimAppMemoryNow() { softTrimCount += 1; return Promise.resolve({ ok: true }); },
    systemMemory: {
      getMemorySnapshotExtended() { return Promise.resolve({ usedPercent: 91 }); },
      purgeSystemMemorySmart() { throw new Error('播放中不应执行系统释放'); },
      getMemorySnapshot() { return { usedPercent: 91 }; },
    },
    Date,
    Number,
    Promise,
  };
  vm.runInNewContext(`${readFunction(source, 'runMemoryAutoTick')};`, sandbox);
  await vm.runInNewContext(`runMemoryAutoTick('timer')`, sandbox);
  assert.equal(softTrimCount, 0);
  assert.equal(sandbox.memoryAutoState.pendingSystemPurge, true);
});

test('没有播放且窗口在后台时才执行系统级释放', async () => {
  const source = read('desktop/main.js');
  let purgeCount = 0;
  const sandbox = {
    memoryPlaybackActive: false,
    memoryAutoState: {
      enabled: true,
      thresholdPercent: 78,
      mask: 29,
      autoElevate: false,
      pendingSystemPurge: true,
      lastRunAt: 0,
      lastReason: '',
      lastResult: null,
      lastError: '',
    },
    isMainWindowForegroundVisible() { return false; },
    trimAppMemoryNow() { return Promise.resolve({ ok: true }); },
    systemMemory: {
      getMemorySnapshotExtended() { return Promise.resolve({ usedPercent: 91 }); },
      purgeSystemMemorySmart() { purgeCount += 1; return Promise.resolve({ ok: false, needAdmin: true }); },
      getMemorySnapshot() { return { usedPercent: 91 }; },
    },
    Date,
    Number,
    Promise,
  };
  vm.runInNewContext(`${readFunction(source, 'runMemoryAutoTick')};`, sandbox);
  await vm.runInNewContext(`runMemoryAutoTick('playback-idle')`, sandbox);
  assert.equal(purgeCount, 1);
  assert.equal(sandbox.memoryAutoState.pendingSystemPurge, false);
});

test('播放事件把状态同步给 Electron 主进程', () => {
  const preload = read('desktop/preload.js');
  const playback = read('public/js/modules/05-playback/12-playback-switch-core.js');
  assert.match(preload, /setMemoryPlaybackState:\s*\(payload\)\s*=>\s*ipcRenderer\.send\('mineradio-memory-playback-state'/);
  assert.match(playback, /function syncPlaybackStateFromAudioEvent[\s\S]*setMemoryPlaybackState\([\s\S]*playing:/);
});
