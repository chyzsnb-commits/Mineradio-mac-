'use strict';
// Mineradio 本地用量监视器 · 聚合存储
//
// 只保存匿名字段:随机安装 ID、版本号、前台使用毫秒数。没有账号、歌曲、
// 播放行为、Cookie、Token。
//
// 按"天"聚合(每天每个 ID 一条),周/月/季/年全部由天桶汇总,所以文件大小
// 只随"活跃人数 × 天数"线性增长,心跳变密也不会膨胀。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = process.env.MINERADIO_MONITOR_DIR
  || path.join(os.homedir(), '.mineradio-monitor');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
// 客户端心跳间隔 120s;超过这个窗口没心跳就算已离线(用于"正在使用")。
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
// 单次心跳最多计入的使用时间,防止客户端时钟跳变把数字刷高。
const MAX_HEARTBEAT_MS = 10 * 60 * 1000;
// 趋势图保留的周期点数。
const TREND_POINTS = 14;

function emptyState() {
  return { days: {}, versions: {}, firstSeen: {}, lastSeen: {} };
}

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      days: raw.days || {},
      versions: raw.versions || {},
      firstSeen: raw.firstSeen || {},
      lastSeen: raw.lastSeen || {},
    };
  } catch (_) {
    return emptyState();
  }
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);   // 原子替换,避免读到半截文件
}

// ---- 本地日历分桶(按本机时区,和用户看表的直觉一致) ----
function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDayKey(key) {
  const parts = key.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// 周一为一周起点(ISO 习惯)。
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfQuarter(date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

const PERIOD_STARTS = {
  day: (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()),
  week: startOfWeek,
  month: startOfMonth,
  quarter: startOfQuarter,
  year: startOfYear,
};

// 上一个周期的起点(用于"环比"和趋势回溯)。
function previousStart(period, start) {
  const d = new Date(start.getTime());
  if (period === 'day') d.setDate(d.getDate() - 1);
  else if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') d.setMonth(d.getMonth() - 1);
  else if (period === 'quarter') d.setMonth(d.getMonth() - 3);
  else d.setFullYear(d.getFullYear() - 1);
  return PERIOD_STARTS[period](d);
}

// ---- 写入:一条心跳 ----
// body: { id, v, ms }  ms = 本次心跳覆盖的前台毫秒数(可缺省=只记活跃不记时长)
function recordPing(state, body, now) {
  const id = String(body && body.id || '');
  if (!/^[a-f0-9]{32}$/.test(id)) return { ok: false, error: 'bad_id' };

  const version = String(body && body.v || '').slice(0, 32) || 'unknown';
  let ms = Number(body && body.ms);
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  if (ms > MAX_HEARTBEAT_MS) ms = MAX_HEARTBEAT_MS;

  const key = dayKey(now);
  const day = state.days[key] || (state.days[key] = {});
  const entry = day[id] || (day[id] = { ms: 0, last: 0 });
  entry.ms += ms;
  entry.last = now.getTime();

  state.versions[id] = version;
  if (!state.firstSeen[id]) state.firstSeen[id] = now.getTime();
  state.lastSeen[id] = now.getTime();
  return { ok: true };
}

// ---- 读取:把天桶汇总成一个周期 ----
// 返回 { activeUsers, usageMs, sessionsDays } —— 活跃人数按去重 ID 计,
// 使用时间按毫秒累加。
function summarizeRange(state, fromTime, toTime) {
  const ids = new Set();
  let usageMs = 0;
  let dayCount = 0;
  for (const key of Object.keys(state.days)) {
    const dayStart = parseDayKey(key).getTime();
    if (dayStart < fromTime || dayStart >= toTime) continue;
    dayCount += 1;
    const day = state.days[key];
    for (const id of Object.keys(day)) {
      ids.add(id);
      usageMs += day[id].ms || 0;
    }
  }
  return { activeUsers: ids.size, usageMs: usageMs, days: dayCount };
}

// 每个周期:本期 + 上期 + 最近 TREND_POINTS 期趋势。
function summarizePeriod(state, period, now) {
  const start = PERIOD_STARTS[period](now);
  const current = summarizeRange(state, start.getTime(), Infinity);
  const prevStart = previousStart(period, start);
  const previous = summarizeRange(state, prevStart.getTime(), start.getTime());

  // 趋势 = 本期之前 TREND_POINTS 个"已结束"的周期,从早到晚。
  const trend = [];
  let cursorEnd = start;
  let cursorStart = prevStart;
  for (let i = 0; i < TREND_POINTS; i++) {
    const bucket = summarizeRange(state, cursorStart.getTime(), cursorEnd.getTime());
    trend.unshift({ start: dayKey(cursorStart), activeUsers: bucket.activeUsers, usageMs: bucket.usageMs });
    cursorEnd = cursorStart;
    cursorStart = previousStart(period, cursorStart);
  }
  // 末格是本期(还没结束),单独追加,保持"当前值"可见。
  trend.push({ start: dayKey(start), activeUsers: current.activeUsers, usageMs: current.usageMs, partial: true });

  return {
    start: dayKey(start),
    activeUsers: current.activeUsers,
    usageMs: current.usageMs,
    previousActiveUsers: previous.activeUsers,
    previousUsageMs: previous.usageMs,
    trend: trend,
  };
}

// 正在使用 = 最近 ONLINE_WINDOW_MS 内有心跳的去重 ID 数。
function countOnline(state, now) {
  const cutoff = now.getTime() - ONLINE_WINDOW_MS;
  let online = 0;
  for (const id of Object.keys(state.lastSeen)) {
    if (state.lastSeen[id] >= cutoff) online += 1;
  }
  return online;
}

function versionBreakdown(state, now) {
  // 只统计最近 30 天内出现过的安装,免得早已弃用的版本一直挂着。
  const cutoff = now.getTime() - 30 * 24 * 3600 * 1000;
  const counts = {};
  for (const id of Object.keys(state.versions)) {
    if ((state.lastSeen[id] || 0) < cutoff) continue;
    const v = state.versions[id];
    counts[v] = (counts[v] || 0) + 1;
  }
  return Object.keys(counts)
    .sort()
    .map((v) => ({ version: v, installs: counts[v] }));
}

function buildSummary(state, now) {
  const periods = {};
  for (const period of ['day', 'week', 'month', 'quarter', 'year']) {
    periods[period] = summarizePeriod(state, period, now);
  }
  return {
    generatedAt: now.toISOString(),
    online: countOnline(state, now),
    onlineWindowMs: ONLINE_WINDOW_MS,
    totalInstalls: Object.keys(state.firstSeen).length,
    periods: periods,
    versions: versionBreakdown(state, now),
  };
}

module.exports = {
  DATA_DIR,
  STATE_FILE,
  ONLINE_WINDOW_MS,
  MAX_HEARTBEAT_MS,
  TREND_POINTS,
  emptyState,
  loadState,
  saveState,
  dayKey,
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  previousStart,
  recordPing,
  summarizeRange,
  summarizePeriod,
  countOnline,
  versionBreakdown,
  buildSummary,
};
