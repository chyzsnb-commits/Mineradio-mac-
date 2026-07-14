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
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`${name} 函数未闭合`);
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
  const loop = read('public/js/modules/11-main-loop.js');
  assert.match(main, /require\(['"]\.\/gpu-usage['"]\)/);
  assert.match(main, /sysGpuPct:\s*null/);
  assert.match(main, /out\.sysGpuPct\s*=\s*await\s+readSystemGpuUsage\(\)/);
  assert.match(hud, /var gpuLine\s*=\s*'系统 '\s*\+\s*fmtPct\(d \? d\.sysGpuPct : null\)\s*\+\s*' · 播放器 '\s*\+\s*fmtPct\(appGpuPct\)/);
  assert.match(hud, /rendererGpuUsagePct\(\)/);
  assert.equal((loop.match(/renderMainSceneWithGpuSample\(scene, camera\)/g) || []).length, 2, '启动页和主画面都应统一采样');
  const cpuRow = hud.indexOf('<span>CPU</span>');
  const gpuRow = hud.indexOf('<span>GPU</span>');
  const memoryRow = hud.indexOf('<span>内存</span>');
  assert.ok(cpuRow >= 0 && gpuRow > cpuRow && memoryRow > gpuRow, 'GPU 行必须位于 CPU 与内存之间');
});

test('播放器 GPU 采样使用非阻塞 WebGL 计时并换算占用率', () => {
  const rendererSource = read('public/js/modules/01-scene/00-renderer-quality.js');
  const source = readFunction(rendererSource, 'createRendererGpuTimer');
  const sandbox = {};
  vm.runInNewContext(source, sandbox);

  const queries = [];
  let resultReads = 0;
  const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const gl = {
    QUERY_RESULT_AVAILABLE: 3,
    QUERY_RESULT: 4,
    getExtension(name) { return name === 'EXT_disjoint_timer_query_webgl2' ? extension : null; },
    createQuery() {
      const query = { available: false, nanoseconds: 0, deleted: false };
      queries.push(query);
      return query;
    },
    beginQuery(_target, query) { query.started = true; },
    endQuery() {},
    getQueryParameter(query, key) {
      if (key === this.QUERY_RESULT_AVAILABLE) return query.available;
      if (key === this.QUERY_RESULT) { resultReads += 1; return query.nanoseconds; }
      return 0;
    },
    getParameter() { return false; },
    deleteQuery(query) { query.deleted = true; },
  };
  let now = 0;
  const timer = sandbox.createRendererGpuTimer(gl, () => now);
  assert.ok(timer, '支持 WebGL2 计时时应创建采样器');
  assert.equal(timer.begin(), true);
  timer.end();
  assert.equal(resultReads, 0, '结果未就绪时不能同步等待');

  queries[0].available = true;
  queries[0].nanoseconds = 2_000_000;
  now = 20;
  assert.equal(timer.begin(), true);
  timer.end();
  assert.equal(resultReads, 1);
  assert.equal(Math.round(timer.value()), 10, '2ms GPU 耗时 / 20ms 帧间隔应为 10%');
  assert.equal(queries[0].deleted, true, '已读取的查询必须释放');
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
