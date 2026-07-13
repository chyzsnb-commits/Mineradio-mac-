const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const modulePath = path.join(root, 'desktop/gpu-usage.js');
const gpuUsage = fs.existsSync(modulePath) ? require(modulePath) : null;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

test('解析 macOS 真实 GPU 占用并对多显卡取最高值', () => {
  assert.ok(gpuUsage, '缺少 desktop/gpu-usage.js');
  const sample = [
    '"PerformanceStatistics" = {"Device Utilization %"=17}',
    '"PerformanceStatistics" = {"Device Utilization %"=68}',
  ].join('\n');
  assert.equal(gpuUsage.parseMacGpuUsage(sample), 68);
  assert.equal(gpuUsage.parseMacGpuUsage('"Device Utilization %"=135'), 100);
  assert.equal(gpuUsage.parseMacGpuUsage('"Device Utilization %"=-4'), 0);
  assert.equal(gpuUsage.parseMacGpuUsage('没有 GPU 指标'), null);
});

test('GPU 读取器只在 macOS 调用 ioreg 并复用进行中的采样', async () => {
  assert.ok(gpuUsage, '缺少 desktop/gpu-usage.js');
  let calls = 0;
  let finish = null;
  const fakeExecFile = (command, args, options, callback) => {
    calls += 1;
    assert.equal(command, '/usr/sbin/ioreg');
    assert.deepEqual(args, ['-r', '-l', '-d', '1', '-c', 'IOAccelerator']);
    assert.equal(options.timeout, 1000);
    finish = callback;
  };
  const readGpu = gpuUsage.createGpuUsageReader({ platform: 'darwin', execFileImpl: fakeExecFile });
  const first = readGpu();
  const second = readGpu();
  assert.strictEqual(second, first);
  assert.equal(calls, 1);
  finish(null, '"Device Utilization %"=42', '');
  assert.equal(await first, 42);

  let nonMacCalled = false;
  const readNonMac = gpuUsage.createGpuUsageReader({
    platform: 'win32',
    execFileImpl: () => { nonMacCalled = true; },
  });
  assert.equal(await readNonMac(), null);
  assert.equal(nonMacCalled, false);

  const readFailed = gpuUsage.createGpuUsageReader({
    platform: 'darwin',
    execFileImpl: (_command, _args, _options, callback) => callback(new Error('ioreg failed'), '', ''),
  });
  assert.equal(await readFailed(), null);

  const readThrew = gpuUsage.createGpuUsageReader({
    platform: 'darwin',
    execFileImpl: () => { throw new Error('spawn failed'); },
  });
  assert.equal(await readThrew(), null);
});

test('主进程返回 GPU 指标且 HUD 在 CPU 下方显示对称 GPU 行', () => {
  const main = read('desktop/main.js');
  const hud = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  assert.match(main, /require\(['"]\.\/gpu-usage['"]\)/);
  assert.match(main, /sysGpuPct:\s*null/);
  assert.match(main, /out\.sysGpuPct\s*=\s*await\s+readSystemGpuUsage\(\)/);
  assert.match(hud, /var gpuLine\s*=\s*'系统 '\s*\+\s*fmtPct\(d \? d\.sysGpuPct : null\)/);
  const cpuRow = hud.indexOf('<span>CPU</span>');
  const gpuRow = hud.indexOf('<span>GPU</span>');
  const memoryRow = hud.indexOf('<span>内存</span>');
  assert.ok(cpuRow >= 0 && gpuRow > cpuRow && memoryRow > gpuRow, 'GPU 行必须位于 CPU 与内存之间');
});

test('壁纸模式隐藏 HUD 时停止全部采样并在退出后恢复', () => {
  const hud = read('public/js/modules/07-fx/05-fx-panel-performance.js');
  const wallpaper = read('public/js/modules/10-shell/04-desktop-overlay-fullscreen.js');
  const calls = { fetches: 0, updates: 0, intervals: [], clears: 0 };
  const sandbox = {
    document: {
      body: { classList: { contains: () => false } },
      getElementById: () => ({ style: {} }),
    },
    perfHudOn: () => true,
    fetchDeviceStats() { calls.fetches += 1; },
    updatePerfHud() { calls.updates += 1; },
    setInterval(fn, delay) {
      const timer = { fn, delay };
      calls.intervals.push(timer);
      return timer;
    },
    clearInterval() { calls.clears += 1; },
  };
  vm.runInNewContext(`
    var _perfHudTimer = null;
    var _devStatsTimer = null;
    var _devStats = { ready: true };
    ${readFunction(hud, 'suspendPerfHudSampling')}
    ${readFunction(hud, 'resumePerfHudSampling')}
    resumePerfHudSampling();
    resumePerfHudSampling();
    suspendPerfHudSampling();
  `, sandbox);
  assert.equal(calls.fetches, 1, '连续恢复只能立即采样一次');
  assert.equal(calls.updates, 1, '连续恢复只能启动一次 HUD 刷新');
  assert.equal(calls.intervals.length, 2, '只创建 HUD 与设备指标两个定时器');
  assert.equal(calls.clears, 2, '暂停时两个定时器都要停止');
  assert.match(wallpaper, /payload\.enabled\s*\?\s*suspendPerfHudSampling\(\)\s*:\s*resumePerfHudSampling\(\)/);
  assert.match(wallpaper, /active\s*\?\s*suspendPerfHudSampling\(\)\s*:\s*resumePerfHudSampling\(\)/);
  assert.match(wallpaper, /onWallpaperForceOff[\s\S]*resumePerfHudSampling\(\)/);
});
