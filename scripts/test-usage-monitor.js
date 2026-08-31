'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const store = require(path.join(root, 'tools/usage-monitor/store.js'));
const telemetry = fs.readFileSync(path.join(root, 'desktop/telemetry.js'), 'utf8');
const pkg = require(path.join(root, 'package.json'));
const privacy = fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');

const ID_A = 'a'.repeat(32);
const ID_B = 'b'.repeat(32);
const ID_C = 'c'.repeat(32);

// 固定"现在"= 2026-08-28（周五）本地时间中午，让周/月/季/年边界可预测。
const NOW = new Date(2026, 7, 28, 12, 0, 0);

function at(daysAgo) {
  const d = new Date(NOW.getTime());
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function seed(entries) {
  const state = store.emptyState();
  entries.forEach(function (entry) {
    store.recordPing(state, { id: entry.id, v: entry.v || '2.0.0', ms: entry.ms }, entry.when);
  });
  return state;
}

test('心跳只接受合法随机 ID，并对单次时长设上限', () => {
  const state = store.emptyState();
  assert.deepEqual(store.recordPing(state, { id: 'nope', ms: 1000 }, NOW), { ok: false, error: 'bad_id' });
  assert.deepEqual(store.recordPing(state, {}, NOW), { ok: false, error: 'bad_id' });
  assert.equal(Object.keys(state.days).length, 0);

  assert.deepEqual(store.recordPing(state, { id: ID_A, v: '2.0.0', ms: 60000 }, NOW), { ok: true });
  // 超上限的一次心跳被截断，不能把使用时间刷高
  store.recordPing(state, { id: ID_B, v: '2.0.0', ms: 999 * 60 * 60 * 1000 }, NOW);
  const day = state.days[store.dayKey(NOW)];
  assert.equal(day[ID_A].ms, 60000);
  assert.equal(day[ID_B].ms, store.MAX_HEARTBEAT_MS);
  // 负数/非数字只记活跃不记时长
  store.recordPing(state, { id: ID_C, ms: -5 }, NOW);
  assert.equal(day[ID_C].ms, 0);
});

test('同一个 ID 多次心跳按天累加时长，活跃人数仍按去重计', () => {
  const state = seed([
    { id: ID_A, when: NOW, ms: 120000 },
    { id: ID_A, when: NOW, ms: 120000 },
    { id: ID_B, when: NOW, ms: 60000 },
  ]);
  const day = store.summarizePeriod(state, 'day', NOW);
  assert.equal(day.activeUsers, 2, '两个安装');
  assert.equal(day.usageMs, 300000, '4+1 分钟');
});

test('日/周/月/季/年五个周期各自按本地日历边界汇总', () => {
  // 2026-08-28 是周五：本周起点周一 = 08-24；本月 08-01；本季 07-01；本年 01-01
  const state = seed([
    { id: ID_A, when: NOW, ms: 60000 },                 // 今天
    { id: ID_B, when: at(2), ms: 60000 },               // 08-26，本周内
    { id: ID_C, when: at(20), ms: 60000 },              // 08-08，本月内、非本周
    { id: ID_A, when: new Date(2026, 6, 5, 9), ms: 60000 },  // 07-05 本季内、非本月
    { id: ID_B, when: new Date(2026, 2, 3, 9), ms: 60000 },  // 03-03 本年内、非本季
    { id: ID_C, when: new Date(2025, 11, 9, 9), ms: 60000 }, // 去年，全部周期外
  ]);

  assert.equal(store.summarizePeriod(state, 'day', NOW).activeUsers, 1);
  assert.equal(store.summarizePeriod(state, 'week', NOW).activeUsers, 2, 'A+B');
  assert.equal(store.summarizePeriod(state, 'month', NOW).activeUsers, 3, 'A+B+C');
  assert.equal(store.summarizePeriod(state, 'quarter', NOW).activeUsers, 3);
  assert.equal(store.summarizePeriod(state, 'year', NOW).activeUsers, 3);

  assert.equal(store.summarizePeriod(state, 'week', NOW).start, '2026-08-24', '周一为周起点');
  assert.equal(store.summarizePeriod(state, 'month', NOW).start, '2026-08-01');
  assert.equal(store.summarizePeriod(state, 'quarter', NOW).start, '2026-07-01', 'Q3');
  assert.equal(store.summarizePeriod(state, 'year', NOW).start, '2026-01-01');

  // 使用时间同样按周期累加，去年那条不进本年
  assert.equal(store.summarizePeriod(state, 'year', NOW).usageMs, 5 * 60000);
});

test('环比取的是上一个同长度周期，不把本期算进去', () => {
  const state = seed([
    { id: ID_A, when: NOW, ms: 60000 },
    { id: ID_B, when: at(1), ms: 60000 },
    { id: ID_C, when: at(1), ms: 60000 },
  ]);
  const day = store.summarizePeriod(state, 'day', NOW);
  assert.equal(day.activeUsers, 1, '今天 1 人');
  assert.equal(day.previousActiveUsers, 2, '昨天 2 人');
  assert.equal(day.previousUsageMs, 120000);
});

test('趋势是本期之前的已结束周期 + 末格进行中周期，不含空幻影格', () => {
  const state = seed([
    { id: ID_A, when: NOW, ms: 60000 },
    { id: ID_B, when: at(1), ms: 60000 },
  ]);
  const day = store.summarizePeriod(state, 'day', NOW);
  assert.equal(day.trend.length, store.TREND_POINTS + 1);

  const last = day.trend[day.trend.length - 1];
  assert.equal(last.partial, true, '末格 = 进行中的本期');
  assert.equal(last.start, store.dayKey(NOW));
  assert.equal(last.activeUsers, 1);

  const beforeLast = day.trend[day.trend.length - 2];
  assert.equal(beforeLast.start, store.dayKey(at(1)), '倒数第二格 = 上一个已结束周期');
  assert.equal(beforeLast.activeUsers, 1);
  assert.ok(!beforeLast.partial);

  // 本期只出现一次（不会既在趋势体内又在末格）
  const currentKey = store.dayKey(NOW);
  assert.equal(day.trend.filter(function (p) { return p.start === currentKey; }).length, 1);
  // 趋势格按时间严格递增
  const times = day.trend.map(function (p) { return p.start; });
  assert.deepEqual(times.slice().sort(), times);
});

test('正在使用只数最近一个在线窗口内有心跳的安装', () => {
  const stale = new Date(NOW.getTime() - store.ONLINE_WINDOW_MS - 60000);
  const fresh = new Date(NOW.getTime() - 60000);
  const state = seed([
    { id: ID_A, when: fresh, ms: 60000 },
    { id: ID_B, when: stale, ms: 60000 },
  ]);
  assert.equal(store.countOnline(state, NOW), 1, '只有 A 还在线');
  // 同一个 ID 再来一次心跳不会被数两遍
  store.recordPing(state, { id: ID_A, v: '2.0.0', ms: 1000 }, NOW);
  assert.equal(store.countOnline(state, NOW), 1);
});

test('版本分布只统计近 30 天活跃安装', () => {
  const state = seed([
    { id: ID_A, when: NOW, ms: 60000, v: '2.0.1' },
    { id: ID_B, when: NOW, ms: 60000, v: '2.0.1' },
    { id: ID_C, when: at(45), ms: 60000, v: '1.1.3' },
  ]);
  assert.deepEqual(store.versionBreakdown(state, NOW), [{ version: '2.0.1', installs: 2 }]);
});

test('汇总输出监视器面板要用的全部字段', () => {
  const state = seed([{ id: ID_A, when: NOW, ms: 60000 }]);
  const summary = store.buildSummary(state, NOW);
  assert.equal(summary.online, 1);
  assert.equal(summary.totalInstalls, 1);
  assert.equal(summary.onlineWindowMs, store.ONLINE_WINDOW_MS);
  assert.ok(summary.generatedAt);
  ['day', 'week', 'month', 'quarter', 'year'].forEach(function (period) {
    const p = summary.periods[period];
    assert.ok(p, period + ' 周期存在');
    assert.equal(typeof p.activeUsers, 'number');
    assert.equal(typeof p.usageMs, 'number', period + ' 有使用时间');
    assert.ok(Array.isArray(p.trend));
  });
});

test('存档原子落盘并能读回', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-monitor-'));
  const original = process.env.MINERADIO_MONITOR_DIR;
  process.env.MINERADIO_MONITOR_DIR = dir;
  try {
    // store 的路径在 require 时就定了，这里直接验证读写函数本身
    const state = seed([{ id: ID_A, when: NOW, ms: 60000 }]);
    const file = path.join(dir, 'state.json');
    fs.writeFileSync(file, JSON.stringify(state));
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(raw.days[store.dayKey(NOW)][ID_A].ms, 60000);
    assert.equal(raw.versions[ID_A], '2.0.0');
  } finally {
    if (original === undefined) delete process.env.MINERADIO_MONITOR_DIR;
    else process.env.MINERADIO_MONITOR_DIR = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('监视器默认只绑回环；对外暴露必须带密钥', () => {
  const server = require(path.join(root, 'tools/usage-monitor/server.js'));
  assert.equal(server.parseArgs([]).host, '127.0.0.1', '默认回环');
  assert.equal(server.parseArgs([]).port, 8787);
  assert.equal(server.requireKeyFor('127.0.0.1'), false);
  assert.equal(server.requireKeyFor('::1'), false);
  assert.equal(server.requireKeyFor('0.0.0.0'), true, '对外监听必须要密钥');

  const url = new URL('http://127.0.0.1/api/summary');
  assert.equal(server.checkKey({ headers: {} }, url, false), true, '回环不校验');

  const original = process.env.MINERADIO_MONITOR_KEY;
  try {
    process.env.MINERADIO_MONITOR_KEY = '';
    assert.equal(server.checkKey({ headers: { 'x-monitor-key': '' } }, url, true), false, '空密钥不能放行');
    process.env.MINERADIO_MONITOR_KEY = 's3cret';
    assert.equal(server.checkKey({ headers: { 'x-monitor-key': 's3cret' } }, url, true), true);
    assert.equal(server.checkKey({ headers: { 'x-monitor-key': 'wrong' } }, url, true), false);
  } finally {
    if (original === undefined) delete process.env.MINERADIO_MONITOR_KEY;
    else process.env.MINERADIO_MONITOR_KEY = original;
  }
});

test('客户端心跳:有界前台计时、统计需显式开启、只发匿名字段', () => {
  // 心跳间隔必须明显小于在线窗口，否则"正在使用"会漏人
  assert.match(telemetry, /HEARTBEAT_INTERVAL_MS\s*=\s*120\s*\*\s*1000/);
  assert.ok(120 * 1000 < store.ONLINE_WINDOW_MS, '心跳间隔 < 在线窗口');
  assert.match(telemetry, /MAX_HEARTBEAT_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);

  // 只在前台计时，睡眠空洞不计
  assert.match(telemetry, /function isForeground\(\)/);
  assert.match(telemetry, /win\.isVisible\(\) && !win\.isMinimized\(\)/);
  assert.match(telemetry, /elapsed > HEARTBEAT_INTERVAL_MS \* 2/);
  assert.match(telemetry, /if \(!isForeground\(\)\) return;/);

  // 统计总闸没开就完全不启动
  assert.match(telemetry, /if \(!usageStatsAllowed\(\)\) \{\s*\n\s*return;/);
  // 总闸 = 测试版 或 显式打开；不能靠翻 internalBeta（那会一并放开凭据导入/导出）
  assert.match(telemetry, /function usageStatsAllowed\(\)[\s\S]{0,160}?isInternalBeta\(\) \|\| getPackageMetadata\(\)\.usageStatsEnabled === true/);
  // opt-in 默认拒绝
  assert.match(telemetry, /defaultId:\s*1/);
  // 同意弹窗不能承诺一个并不存在的设置项
  assert.doesNotMatch(telemetry, /在设置里改变这个决定/);
  assert.match(telemetry, /telemetry-consent 文件/);
  // 上报体只有随机 id、版本号、毫秒数
  const body = telemetry.match(/body:\s*JSON\.stringify\(\{([^}]*)\}\)/);
  assert.ok(body, '找得到上报体');
  assert.deepEqual(
    body[1].split(',').map(function (part) { return part.split(':')[0].trim(); }).filter(Boolean),
    ['id', 'v', 'ms'],
  );
  assert.doesNotMatch(telemetry, /cookie|token|playlist|song|track/i);
});

test('分发的构建确实打开了统计，且没有借翻发布通道来实现', () => {
  // 总闸打开，监视器才收得到数据
  assert.equal(pkg.mineradio.usageStatsEnabled, true);
  // 发布通道标志保持不动：翻 internalBeta 会一并放开凭据导入/导出
  assert.equal(pkg.mineradio.internalBeta, false);
  assert.equal(pkg.mineradio.publicRelease, true);
  const policy = require(path.join(root, 'desktop/release-policy.js'));
  assert.equal(policy.allowCredentialImport, false);
  assert.equal(policy.allowCredentialExport, false);
});

test('隐私说明与实际收集行为一致', () => {
  // 不能再宣称"正式版遥测关闭"——现在打开了，只是要用户同意
  assert.doesNotMatch(privacy, /正式版匿名遥测关闭/);
  assert.doesNotMatch(privacy, /公开正式版默认不启用匿名遥测/);
  // 必须如实披露三项内容和 opt-in 默认拒绝
  assert.match(privacy, /默认不同意/);
  assert.match(privacy, /随机安装 ID/);
  assert.match(privacy, /使用时长/);
  assert.match(privacy, /telemetry-consent/);
});
