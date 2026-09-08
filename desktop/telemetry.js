// 匿名用量心跳（opt-in）。
//
// 只有测试版（mineradio.internalBeta）或显式打开统计的构建
// （mineradio.usageStatsEnabled）才会启动；两者都不是就完全不启动、不发任何请求。
// 之所以不复用 internalBeta 当开关：那是发布通道标志，一并放开了凭据导入/导出
// 并去掉了正式版的 UI 标记，不能为了收统计而翻它。
// 启用后：首启弹窗询问用户是否允许匿名统计。同意后启动上报一次，之后每
// HEARTBEAT_INTERVAL_MS 上报一次有界前台心跳（仅 { 随机id, 版本号, 前台毫秒数 }，
// 无个人信息）。窗口隐藏/最小化时不计时间，机器睡眠造成的时间空洞不计入。
// 拒绝/未询问：不发请求。用户偏好持久化在 userData/telemetry-consent。
//
// 上报失败静默忽略，不影响 app；未送达的时间下次心跳补报（有上限）。
const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATS_PING_URL = process.env.MINERADIO_STATS_URL
  || 'https://mineradio-stats.mineradio.workers.dev/api/ping';
const CONSENT_FILE = 'telemetry-consent';
// 启动后延迟上报，等网络就绪
const PING_DELAY_MS = 8000;
// 心跳间隔。后端把"最近 5 分钟有心跳"算作正在使用，所以这里必须明显小于 5 分钟。
const HEARTBEAT_INTERVAL_MS = 120 * 1000;
// 单次上报的前台时间上限，防止时钟跳变或积压把数字刷高。
const MAX_HEARTBEAT_MS = 10 * 60 * 1000;

function getPackageMetadata() {
  try {
    return require('../package.json').mineradio || {};
  } catch (_) {
    return {};
  }
}

function isInternalBeta() {
  return getPackageMetadata().internalBeta === true;
}

// 统计总闸：测试版天然开启；正式版要显式打开 mineradio.usageStatsEnabled 才收。
// 打开也只是"允许询问"，真正是否上报仍然取决于用户在弹窗里的选择。
function usageStatsAllowed() {
  return isInternalBeta() || getPackageMetadata().usageStatsEnabled === true;
}

function consentPath() {
  return path.join(app.getPath('userData'), CONSENT_FILE);
}

// 读取用户偏好：'accepted' | 'declined' | '' (未询问)
function readConsent() {
  try {
    const v = fs.readFileSync(consentPath(), 'utf8').trim();
    if (v === 'accepted' || v === 'declined') return v;
  } catch (_) {}
  return '';
}

function writeConsent(value) {
  try {
    fs.writeFileSync(consentPath(), value);
  } catch (_) {}
}

function getInstallId() {
  try {
    const p = path.join(app.getPath('userData'), 'install-id');
    let id = '';
    try { id = fs.readFileSync(p, 'utf8').trim(); } catch (e) {}
    if (!/^[a-f0-9]{32}$/.test(id)) {
      id = crypto.randomBytes(16).toString('hex');
      fs.writeFileSync(p, id);
    }
    return id;
  } catch (e) {
    return '';
  }
}

// 前台 = 有窗口存在、可见且没最小化。壁纸模式也算前台（窗口仍在渲染）。
function isForeground() {
  try {
    return BrowserWindow.getAllWindows().some(function (win) {
      return !win.isDestroyed() && win.isVisible() && !win.isMinimized();
    });
  } catch (_) {
    return false;
  }
}

// 累计但还没成功上报的前台毫秒数。只在内存里，退出即丢弃（不写盘）。
let pendingMs = 0;
let lastTickAt = 0;

// 按真实经过时间累加前台时长。空洞（睡眠/挂起）超过一个心跳间隔就不计，
// 避免把合盖 8 小时算成使用时间。
function accumulate(now) {
  const previous = lastTickAt;
  lastTickAt = now;
  if (!previous) return;
  const elapsed = now - previous;
  if (elapsed <= 0 || elapsed > HEARTBEAT_INTERVAL_MS * 2) return;
  if (!isForeground()) return;
  pendingMs += elapsed;
  if (pendingMs > MAX_HEARTBEAT_MS) pendingMs = MAX_HEARTBEAT_MS;
}

function ping() {
  try {
    const id = getInstallId();
    if (!id || typeof fetch !== 'function') return;
    const ms = Math.round(pendingMs);
    fetch(STATS_PING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, v: app.getVersion(), ms: ms }),
    }).then(function (res) {
      // 只有确认送达才清账；失败留着下次补报。
      if (res && res.ok) pendingMs = Math.max(0, pendingMs - ms);
    }).catch(function () {});
  } catch (e) {}
}

// 启动一次上报 + 之后的周期心跳。
function startHeartbeat() {
  lastTickAt = Date.now();
  setTimeout(ping, PING_DELAY_MS);
  const timer = setInterval(function () {
    accumulate(Date.now());
    ping();
  }, HEARTBEAT_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

// 询问用户是否允许匿名统计。返回 'accepted' | 'declined'。
function askConsent() {
  try {
    const choice = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['允许', '不，谢谢'],
      defaultId: 1,
      title: '匿名用量统计',
      message: '是否允许 Mineradio 收集匿名用量统计？',
      detail: '我们只收集一个随机 ID、软件版本号，以及窗口在前台的使用时长，用于了解有多少人在用、用多久、用哪个版本。不会收集任何个人信息、账号、歌曲或播放行为。这个选择会被记住；想改的话，删除应用数据目录里的 telemetry-consent 文件即可重新询问。',
    });
    const result = choice === 0 ? 'accepted' : 'declined';
    writeConsent(result);
    return result;
  } catch (_) {
    return 'declined';
  }
}

// 主入口：决定是否上报。
function startTelemetry() {
  // 统计没打开（正式版且未显式开启）：完全不启动
  if (!usageStatsAllowed()) {
    return;
  }

  let consent = readConsent();

  // 测试版首启：未询问过则弹窗询问（延迟到窗口就绪后，避免阻塞启动）
  if (!consent) {
    setTimeout(() => {
      consent = askConsent();
      if (consent === 'accepted') startHeartbeat();
    }, 3000);
    return;
  }

  // 已询问过：只有同意才上报（启动一次 + 之后的有界前台心跳）
  if (consent === 'accepted') {
    startHeartbeat();
  }
}

module.exports = { startTelemetry };
