// 匿名用量心跳（opt-in）。
//
// 正式版（mineradio.internalBeta 非 true）：完全不启动，不发任何请求。
// 测试版：首启弹窗询问用户是否允许匿名统计。同意后每次启动上报一次
// （仅 { 随机id, 版本号 }，无个人信息），不再每 5 分钟轮询。
// 拒绝/未询问：不发请求。用户偏好持久化在 userData/telemetry-consent。
//
// 上报失败静默忽略，不影响 app。
const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATS_PING_URL = 'https://mineradio-stats.mineradio.workers.dev/api/ping';
const CONSENT_FILE = 'telemetry-consent';
// 启动后延迟上报，等网络就绪
const PING_DELAY_MS = 8000;

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

// 询问用户是否允许匿名统计。返回 'accepted' | 'declined'。
function askConsent() {
  try {
    const choice = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['允许', '不，谢谢'],
      defaultId: 1,
      title: '匿名用量统计',
      message: '是否允许 Mineradio 收集匿名用量统计？',
      detail: '我们只收集一个随机 ID 和软件版本号，用于了解有多少人在用、他们用哪个版本。不会收集任何个人信息、账号或使用行为。你可以随时在设置里改变这个决定。',
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
  // 正式版：完全不启动
  if (!isInternalBeta()) {
    return;
  }

  let consent = readConsent();

  // 测试版首启：未询问过则弹窗询问（延迟到窗口就绪后，避免阻塞启动）
  if (!consent) {
    setTimeout(() => {
      consent = askConsent();
      if (consent === 'accepted') {
        setTimeout(ping, 1000);
      }
    }, 3000);
    return;
  }

  // 已询问过：只有同意才上报，且每次启动只报一次（不再每 5 分钟轮询）
  if (consent === 'accepted') {
    setTimeout(ping, PING_DELAY_MS);
  }
}

module.exports = { startTelemetry };
