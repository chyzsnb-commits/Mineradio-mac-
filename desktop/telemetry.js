// 匿名用量心跳:首启生成随机安装 id 存本地,之后启动 + 每 5 分钟 POST 一次。
// 只上报 { 随机id, 版本号 },不带任何个人信息/账号。上报失败静默忽略(不影响 app)。
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATS_PING_URL = 'https://mineradio-stats.mineradio.workers.dev/api/ping';
const PING_INTERVAL_MS = 5 * 60 * 1000;

function getInstallId() {
  try {
    const p = path.join(app.getPath('userData'), 'install-id');
    let id = '';
    try { id = fs.readFileSync(p, 'utf8').trim(); } catch (e) {}
    if (!/^[a-f0-9]{32}$/.test(id)) { id = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(p, id); }
    return id;
  } catch (e) { return ''; }
}

function ping() {
  try {
    const id = getInstallId();
    if (!id || typeof fetch !== 'function') return;
    fetch(STATS_PING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, v: app.getVersion() }),
    }).catch(function () {});
  } catch (e) {}
}

function startTelemetry() {
  setTimeout(ping, 8000);            // 启动 8 秒后发首个(等网络就绪)
  setInterval(ping, PING_INTERVAL_MS);
}

module.exports = { startTelemetry };
