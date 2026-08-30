// Mineradio 软件内更新检查（自研轻量实现，不使用 electron-updater）。
//
// 背景：当前 app 为 adhoc/Apple Development 签名，无 Developer ID 证书，
// macOS 无法后台静默替换应用（系统限制）。本模块实现现实可行的方案：
//   1. 启动后延迟 + 定时（每 6 小时）拉取公开 version.json 清单
//   2. 与当前版本 semver 对比，发现新版通过 IPC 通知渲染层提示用户
//   3. 用户点击后主进程流式下载 dmg 到 ~/Downloads，完成后自动打开安装器
//
// 清单格式（公开仓库 Mineradio-release 的 raw 直链）：
//   { "version": "2.0.0", "notes": "...", "url": "https://.../Mineradio-2.0.0-arm64.dmg", "pub_date": "ISO8601" }
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
// 注意：不在此处 require('electron')——本模块需可在纯 node 测试环境加载，
// shell 仅在 openDownloadedDmg（真实 Electron 运行时）内惰性获取。

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;   // 每 6 小时
const FIRST_CHECK_DELAY_MS = 30 * 1000;          // 启动 30 秒后首查
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;      // 下载硬超时 30 分钟

// 默认 fetch：优先 Electron net.fetch（走 Chromium 网络栈，自动遵循系统代理——
// 国内网络直连 raw.githubusercontent.com 通常不通，必须走系统代理）。纯 node
// 测试环境无 electron，回退全局 fetch；两者都无则返回 null。
function getDefaultFetch() {
  try {
    const { net } = require('electron');
    if (net && typeof net.fetch === 'function') return net.fetch.bind(net);
  } catch (_) {}
  return typeof fetch === 'function' ? fetch : null;
}

// semver 比较：返回 1 / -1 / 0。忽略非数字后缀（v 前缀、-beta 等）。
function isNewerVersion(latest, current) {
  const parse = (v) => String(v || '').trim().replace(/^v/i, '').split('-')[0]
    .split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  const len = Math.max(a.length, b.length, 3);
  for (let i = 0; i < len; i++) {
    const l = a[i] || 0;
    const r = b[i] || 0;
    if (l > r) return true;
    if (l < r) return false;
  }
  return false;
}

// 解析并校验清单。无效字段一律视为无更新，不抛错（更新检查绝不影响主功能）。
function parseUpdateManifest(text) {
  let data;
  try {
    data = JSON.parse(String(text || ''));
  } catch (_) {
    return { ok: false, reason: 'invalid-json' };
  }
  const version = String(data.version || '').trim();
  const url = String(data.url || '').trim();
  if (!/^v?\d+(\.\d+){1,3}(-[\w.]+)?$/.test(version)) return { ok: false, reason: 'invalid-version' };
  // url 允许为空（占位清单/仅提示版本而无下载包），此时上游按"无更新"静默处理；
  // 非空时必须 https。
  if (url && !/^https:\/\//i.test(url)) return { ok: false, reason: 'invalid-url' };
  return {
    ok: true,
    version,
    url,
    notes: String(data.notes || ''),
    pubDate: String(data.pub_date || ''),
  };
}

// 拉取清单并对比。fetchImpl 可注入（测试用）。
async function checkForUpdate({ manifestUrl, currentVersion, fetchImpl } = {}) {
  if (!manifestUrl) return { ok: false, reason: 'no-manifest-url' };
  const doFetch = fetchImpl || getDefaultFetch();
  if (!doFetch) return { ok: false, reason: 'no-fetch' };
  try {
    const res = await doFetch(manifestUrl, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res || !res.ok) return { ok: false, reason: 'http-' + (res ? res.status : 'unknown') };
    const text = await res.text();
    const manifest = parseUpdateManifest(text);
    if (!manifest.ok) return manifest;
    const hasUpdate = isNewerVersion(manifest.version, currentVersion) && !!manifest.url;   // 无下载包的新版本只提示版本号，不引导下载
    return {
      ok: true,
      hasUpdate,
      currentVersion,
      latestVersion: manifest.version,
      notes: manifest.notes,
      downloadUrl: manifest.url,
      pubDate: manifest.pubDate,
    };
  } catch (e) {
    return { ok: false, reason: 'network', error: String(e && e.message || e).slice(0, 160) };
  }
}

// 从 URL 提取下载文件名（带版本号，避免覆盖旧包）。
function downloadFileNameFor(url, fallbackVersion) {
  try {
    const u = new URL(url);
    const base = path.basename(decodeURIComponent(u.pathname)) || '';
    if (/\.dmg$/i.test(base)) return base;
  } catch (_) {}
  return 'Mineradio-' + (fallbackVersion || 'update') + '.dmg';
}

// 流式下载 dmg 到目标目录（默认 ~/Downloads），返回 { ok, filePath }。
// onProgress(loadedBytes, totalBytes) 可选。
function downloadUpdateDmg({ url, destDir, onProgress, fetchImpl } = {}) {
  return new Promise((resolve) => {
    if (!/^https:\/\//i.test(String(url || ''))) {
      resolve({ ok: false, reason: 'invalid-url' });
      return;
    }
    const dir = destDir || path.join(os.homedir(), 'Downloads');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    const fileName = downloadFileNameFor(url);
    const filePath = path.join(dir, fileName);
    const tmpPath = filePath + '.part';   // 半截文件不冒充完整 dmg

    const doFetch = fetchImpl || getDefaultFetch();
    if (!doFetch) {
      resolve({ ok: false, reason: 'no-fetch' });
      return;
    }
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const abortController = new AbortController();
    const hardTimer = setTimeout(() => {
      try { abortController.abort(); } catch (_) {}
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      finish({ ok: false, reason: 'timeout' });
    }, DOWNLOAD_TIMEOUT_MS);

    let req;
    try {
      req = doFetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: abortController.signal });
    } catch (e) {
      clearTimeout(hardTimer);
      finish({ ok: false, reason: 'fetch-error', error: String(e && e.message || e).slice(0, 160) });
      return;
    }
    Promise.resolve(req).then((res) => {
      if (!res || !res.ok || !res.body) {
        clearTimeout(hardTimer);
        finish({ ok: false, reason: 'http-' + (res ? res.status : 'unknown') });
        return;
      }
      const total = Number(res.headers.get && res.headers.get('content-length')) || 0;
      let loaded = 0;
      let lastNotify = 0;
      const stream = fs.createWriteStream(tmpPath);
      res.body.on('data', (chunk) => {
        loaded += chunk.length;
        const now = Date.now();
        if (onProgress && now - lastNotify > 400) {   // 进度节流 400ms
          lastNotify = now;
          try { onProgress(loaded, total); } catch (_) {}
        }
      });
      // 源流错误（网络中断/socket reset）必须清理并结束，否则下载永久挂起
      res.body.on('error', (e) => {
        clearTimeout(hardTimer);
        try { stream.destroy(); } catch (_) {}
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        finish({ ok: false, reason: 'network', error: String(e && e.message || e).slice(0, 160) });
      });
      res.body.pipe(stream);
      stream.on('finish', () => {
        clearTimeout(hardTimer);
        try {
          fs.renameSync(tmpPath, filePath);
          finish({ ok: true, filePath, bytes: loaded, total });
        } catch (e) {
          finish({ ok: false, reason: 'rename-failed', error: String(e && e.message || e).slice(0, 160) });
        }
      });
      stream.on('error', (e) => {
        clearTimeout(hardTimer);
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        finish({ ok: false, reason: 'write-failed', error: String(e && e.message || e).slice(0, 160) });
      });
    }).catch((e) => {
      clearTimeout(hardTimer);
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      finish({ ok: false, reason: 'network', error: String(e && e.message || e).slice(0, 160) });
    });
  });
}

// 常驻定时检查。返回控制器（测试/关闭用）。
function startUpdateChecker({ mainWindow, manifestUrl, currentVersion, onEvent } = {}) {
  if (!manifestUrl || !currentVersion) return { stop() {}, checkNow() { return Promise.resolve(null); } };
  let timer = null;
  let stopped = false;
  const notify = (payload) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mineradio-update-event', payload);
      }
      if (typeof onEvent === 'function') onEvent(payload);
    } catch (_) {}
  };
  const run = async (manual) => {
    if (stopped) return null;
    const result = await checkForUpdate({ manifestUrl, currentVersion });
    notify({ type: manual ? 'manual-check' : 'auto-check', ok: result.ok, hasUpdate: !!result.hasUpdate, ...result });
    return result;
  };
  timer = setTimeout(() => { run(false).catch(() => {}); }, FIRST_CHECK_DELAY_MS);
  const interval = setInterval(() => { run(false).catch(() => {}); }, CHECK_INTERVAL_MS);
  return {
    stop() { stopped = true; clearTimeout(timer); clearInterval(interval); },
    checkNow() { return run(true); },
  };
}

// 下载完成后的打开动作（独立导出便于测试注入）。
function openDownloadedDmg(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      // 惰性 require：仅真实 Electron 运行时可用（纯 node 测试不触发本路径）
      const { shell } = require('electron');
      shell.openPath(filePath);
      return { ok: true };
    }
    return { ok: false, reason: 'file-missing' };
  } catch (e) {
    return { ok: false, reason: 'open-failed', error: String(e && e.message || e).slice(0, 160) };
  }
}

module.exports = {
  isNewerVersion,
  parseUpdateManifest,
  checkForUpdate,
  downloadFileNameFor,
  downloadUpdateDmg,
  startUpdateChecker,
  openDownloadedDmg,
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
};
