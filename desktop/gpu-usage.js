const { execFile } = require('child_process');

const IOREG_PATH = '/usr/sbin/ioreg';
const IOREG_ARGS = ['-r', '-l', '-d', '1', '-c', 'IOAccelerator'];

function parseMacGpuUsage(output) {
  const values = [];
  const pattern = /"Device Utilization %"\s*=\s*(-?\d+(?:\.\d+)?)/g;
  const text = String(output || '');
  let match = null;
  while ((match = pattern.exec(text))) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }
  if (!values.length) return null;
  return Math.round(Math.max(0, Math.min(100, Math.max(...values))));
}

function createGpuUsageReader(options = {}) {
  const platform = options.platform || process.platform;
  const execFileImpl = options.execFileImpl || execFile;
  let inFlight = null;

  return function readGpuUsage() {
    if (platform !== 'darwin') return Promise.resolve(null);
    if (inFlight) return inFlight;

    inFlight = new Promise((resolve) => {
      try {
        execFileImpl(IOREG_PATH, IOREG_ARGS, {
          encoding: 'utf8',
          timeout: 1000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        }, (error, stdout) => {
          resolve(error ? null : parseMacGpuUsage(stdout));
        });
      } catch (_) {
        resolve(null);
      }
    }).finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}

const readSystemGpuUsage = createGpuUsageReader();

module.exports = {
  parseMacGpuUsage,
  createGpuUsageReader,
  readSystemGpuUsage,
};
