const defaultFs = require('node:fs');
const defaultPath = require('node:path');

const CRASH_DUMPS_DIR = 'CrashDumps';
const CRASH_DIAGNOSTICS_FILE = 'crash-diagnostics.json';
const MAX_DIAGNOSTIC_RECORDS = 50;

function createCrashDiagnostics(options) {
  options = options || {};
  const app = options.app;
  const crashReporter = options.crashReporter;
  const fs = options.fs || defaultFs;
  const path = options.path || defaultPath;
  const packageInfo = options.packageInfo || {};
  const appName = String(options.appName || packageInfo.productName || 'Mineradio');
  let enabled = false;

  function getCrashDumpsPath() {
    try {
      const configured = app.getPath('crashDumps');
      if (configured) return configured;
    } catch (_) {}
    return path.join(app.getPath('userData'), CRASH_DUMPS_DIR);
  }

  function getDiagnosticsPath() {
    return path.join(getCrashDumpsPath(), CRASH_DIAGNOSTICS_FILE);
  }

  function listRecentCrashDumpFiles(limit) {
    const crashDumpsPath = getCrashDumpsPath();
    const files = [];
    const maxFiles = Math.max(1, Number(limit) || 12);

    function visit(dir, depth) {
      if (depth > 4 || !fs.existsSync(dir)) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      entries.forEach((entry) => {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          visit(filePath, depth + 1);
          return;
        }
        if (!entry.isFile() || !/\.dmp$/i.test(entry.name)) return;
        try {
          const stat = fs.statSync(filePath);
          files.push({
            name: entry.name,
            path: filePath,
            relativePath: path.relative(crashDumpsPath, filePath),
            size: stat.size,
            mtime: stat.mtime.toISOString(),
            mtimeMs: stat.mtimeMs,
          });
        } catch (_) {}
      });
    }

    visit(crashDumpsPath, 0);
    return files
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, maxFiles)
      .map(({ mtimeMs, ...file }) => file);
  }

  function readRecords() {
    try {
      const diagnosticsPath = getDiagnosticsPath();
      if (!fs.existsSync(diagnosticsPath)) return [];
      const parsed = JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8'));
      return Array.isArray(parsed) ? parsed.slice(-MAX_DIAGNOSTIC_RECORDS) : [];
    } catch (_) {
      return [];
    }
  }

  function safeDetails(details) {
    if (!details || typeof details !== 'object') return { value: String(details || '') };
    try { return JSON.parse(JSON.stringify(details)); } catch (_) { return { value: String(details) }; }
  }

  function capture(kind, details) {
    try {
      const crashDumpsPath = getCrashDumpsPath();
      fs.mkdirSync(crashDumpsPath, { recursive: true });
      const record = {
        at: new Date().toISOString(),
        kind: String(kind || 'unknown'),
        appVersion: String(packageInfo.version || ''),
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        details: safeDetails(details),
        crashDumpsPath,
        recentDumpFiles: listRecentCrashDumpFiles(12),
      };
      const records = readRecords();
      records.push(record);
      fs.writeFileSync(getDiagnosticsPath(), JSON.stringify(records.slice(-MAX_DIAGNOSTIC_RECORDS), null, 2), 'utf8');
      return record;
    } catch (error) {
      console.warn('[CrashDiagnostics] 写入崩溃记录失败:', error && error.message);
      return null;
    }
  }

  function uploadEnabled() {
    try {
      return !!(crashReporter && crashReporter.getUploadToServer && crashReporter.getUploadToServer());
    } catch (_) {
      return false;
    }
  }

  function configure() {
    try {
      const crashDumpsPath = path.join(app.getPath('userData'), CRASH_DUMPS_DIR);
      fs.mkdirSync(crashDumpsPath, { recursive: true });
      app.setPath('crashDumps', crashDumpsPath);
      crashReporter.start({
        uploadToServer: false,
        compress: false,
        ignoreSystemCrashHandler: false,
        productName: appName,
        globalExtra: {
          appName,
          appVersion: String(packageInfo.version || ''),
          platform: process.platform,
          arch: process.arch,
        },
      });
      enabled = true;
      console.log('[CrashDiagnostics] 本机崩溃记录已启用:', crashDumpsPath);
      return true;
    } catch (error) {
      console.warn('[CrashDiagnostics] 崩溃记录启用失败:', error && error.message);
      return false;
    }
  }

  function snapshot() {
    return {
      ok: true,
      enabled,
      uploadToServer: uploadEnabled(),
      crashDumpsPath: getCrashDumpsPath(),
      diagnosticsPath: getDiagnosticsPath(),
      recentDumpFiles: listRecentCrashDumpFiles(12),
      records: readRecords(),
    };
  }

  return {
    capture,
    configure,
    getCrashDumpsPath,
    getDiagnosticsPath,
    listRecentCrashDumpFiles,
    snapshot,
  };
}

module.exports = { createCrashDiagnostics };
