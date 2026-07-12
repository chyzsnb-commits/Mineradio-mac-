// macOS 内存监控与清理（参考腾讯柠檬清理逻辑）。
//
// 与 Windows 版（system-memory.js）提供相同接口，但用 Mac 原生机制：
//   - vm_stat：页面统计（free/active/inactive/wired/speculative/purgeable）
//   - sysctl hw.memsize：物理内存总量
//   - purge：释放系统未使用内存（需管理员权限，会弹授权）
//   - process.memoryUsage()：Node/Electron 进程自身内存
//
// 注意：Mac 没有 Windows 的"工作集/修改页/待机页"概念，面板上的那些开关
// 在 Mac 上映射为：inactive(待激活) + purgeable(可清除) + free(空闲)。
// 清理动作统一用 purge 命令（粗粒度系统级释放，腾讯柠檬也是这么做的）。
'use strict';

const { execFile } = require('child_process');
const os = require('os');

// Mac 的 purge 命令在（/usr/sbin/purge），需要管理员权限
const SYSTEM_PURGE_AVAILABLE = true;
// 是否启用自动清理：默认关，由面板开关控制（和 Windows 行为对齐）
const SYSTEM_PURGE_ENABLED = false;

// MEMORY_MASK 在 Mac 上没有实际语义（那是 Windows 的），保留接口兼容
const MEMORY_MASK = {
  workingSet: 1,
  modifiedList: 4,
  standbyList: 8,
  standbyLow: 16,
};
const MEMORY_MASK_DEFAULT = MEMORY_MASK.workingSet | MEMORY_MASK.modifiedList | MEMORY_MASK.standbyList | MEMORY_MASK.standbyLow;

// 缓存页面大小（vm_stat 输出里有，运行时从输出第一行解析，这里只是 fallback）
function getPageSize() {
  return 16384;  // Mac arm64 默认 16384；实际用 vm_stat 输出里的值为准
}

// 解析 vm_stat 输出，返回各类型页数。page size 从输出第一行提取。
function parseVmStat(output) {
  const lines = output.split('\n');
  let pageSize = 16384;
  const m = lines[0].match(/page size of (\d+)/);
  if (m) pageSize = parseInt(m[1], 10);

  const result = { pageSize };
  // Mac vm_stat 的字段名（注意 wired down、occupied by compressor）
  const fieldPatterns = [
    ['free', /Pages\s+free:\s+(\d+)/],
    ['active', /Pages\s+active:\s+(\d+)/],
    ['inactive', /Pages\s+inactive:\s+(\d+)/],
    ['speculative', /Pages\s+speculative:\s+(\d+)/],
    ['wired', /Pages\s+wired\s+down:\s+(\d+)/],
    ['purgeable', /Pages\s+purgeable:\s+(\d+)/],
    ['throttled', /Pages\s+throttled:\s+(\d+)/],
    // 被压缩存储的页（数据被压缩了）+ 压缩器自身占用的页
    ['storedInCompressor', /Pages\s+stored\s+in\s+compressor:\s+(\d+)/],
    ['occupiedByCompressor', /Pages\s+occupied\s+by\s+compressor:\s+(\d+)/],
  ];
  fieldPatterns.forEach(([key]) => { result[key] = 0; });

  lines.forEach((line) => {
    fieldPatterns.forEach(([key, re]) => {
      const mm = line.match(re);
      if (mm) result[key] = parseInt(mm[1], 10);
    });
  });
  return result;
}

// 把页数转成 MB
function pagesToMB(pages, pageSize) {
  return Math.round((pages * pageSize) / 1024 / 1024);
}

// 同步快照：进程自身内存（不等系统命令，立即可用）
function getMemorySnapshot() {
  try {
    const mu = process.memoryUsage();
    return {
      ok: true,
      platform: 'darwin',
      process: {
        rssMB: Math.round(mu.rss / 1024 / 1024),
        heapUsedMB: Math.round(mu.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mu.heapTotal / 1024 / 1024),
        externalMB: Math.round(mu.external / 1024 / 1024),
      },
    };
  } catch (e) {
    return { ok: false, reason: 'snapshot-failed', error: e.message };
  }
}

// 异步扩展快照：系统内存（调 vm_stat + sysctl，有命令开销）
async function getMemorySnapshotExtended() {
  return new Promise((resolve) => {
    let vmOutput = '';
    let totalBytes = os.totalmem();  // fallback 用 Node 的 os.totalmem()

    const vmStat = execFile('/usr/bin/vm_stat', [], (err, stdout) => {
      if (err) {
        resolve({ ok: false, reason: 'vm_stat-failed', error: err.message, totalMB: Math.round(totalBytes / 1024 / 1024) });
        return;
      }
      const stat = parseVmStat(stdout.trim());
      const ps = stat.pageSize;
      const freeMB = pagesToMB(stat.free, ps);
      const activeMB = pagesToMB(stat.active, ps);
      const inactiveMB = pagesToMB(stat.inactive, ps);
      const speculativeMB = pagesToMB(stat.speculative, ps);
      const wiredMB = pagesToMB(stat.wired, ps);
      const purgeableMB = pagesToMB(stat.purgeable, ps);
      // 被压缩的内存：只算"压缩器实际占用的物理页"（occupiedByCompressor）。
      // storedInCompressor 是压缩前的逻辑大小，会虚高（压缩率 2-3 倍），不算入物理占用。
      const compressedMB = pagesToMB(stat.occupiedByCompressor, ps);
      const totalMB = Math.round(totalBytes / 1024 / 1024);
      // Mac 的物理内存占用 = wired（内核锁定）+ active（活跃）+ compressed（压缩器占用）
      // "可用"≈ free + inactive + speculative + purgeable（这些可被回收/重用）
      const usedMB = wiredMB + activeMB + compressedMB;
      const availableMB = freeMB + inactiveMB + speculativeMB + purgeableMB;
      const usedPercent = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;

      resolve({
        ok: true,
        platform: 'darwin',
        totalMB,
        usedMB,
        availableMB,
        // freeMB：前端面板"可用 X MB"读的就是这个字段。
        // 语义上等于 availableMB（free + inactive + speculative + purgeable，即可被回收重用的内存）。
        // 注意：不要和 detail.freeMB 混淆——后者是 vm_stat 的 Pages free（完全空闲），数值很小。
        freeMB: availableMB,
        usedPercent,
        detail: {
          freeMB, activeMB, inactiveMB, speculativeMB, wiredMB, purgeableMB, compressedMB,
          // 面板兼容字段（映射到 Windows 概念，让前端不用改）
          workingSetMB: activeMB + wiredMB,        // 活跃占用 ≈ 工作集
          modifiedListMB: compressedMB,             // 压缩 ≈ 修改页
          standbyListMB: inactiveMB + purgeableMB,  // 待激活/可清除 ≈ 待办页
        },
        process: getMemorySnapshot().process,
      });
    });
  });
}

// 清理系统内存：调用 purge（腾讯柠檬的做法）。需要管理员权限。
// 优先用 sudo 免密（需一次性配置 sudoers），失败回退 osascript 弹授权框。
async function purgeSystemMemorySmart(_mask, _opts) {
  // 方式 1：sudo purge（免密，靠 sudoers 配置。配置方法见 mac-porting 或下方注释）
  var sudoResult = await new Promise(function (resolve) {
    execFile('/usr/bin/sudo', ['-n', '/usr/sbin/purge'], function (err, stdout, stderr) {
      if (err) {
        resolve({ ok: false, error: err });
        return;
      }
      resolve({ ok: true });
    });
  });
  if (sudoResult.ok) {
    return { ok: true, purged: true, method: 'sudo-nopass' };
  }
  // 方式 2（回退）：osascript 弹管理员授权框
  return new Promise(function (resolve) {
    var script = 'do shell script "/usr/sbin/purge" with administrator privileges';
    execFile('/usr/bin/osascript', ['-e', script], function (err, stdout, stderr) {
      if (err) {
        resolve({ ok: false, reason: 'purge-failed-or-cancelled', error: (err.stderr || err.message || '').slice(0, 200) });
        return;
      }
      resolve({ ok: true, purged: true, method: 'osascript-prompt' });
    });
  });
}

// Mac 上没有"修剪工作集"概念，但提供接口兼容。返回进程内存信息。
async function trimAppWorkingSets() {
  // Electron 没有 Windows 的 SetProcessWorkingSetSize 等价物。
  // 近似做法：触发垃圾回收（仅在显式调用时，不频繁）
  if (global.gc) {
    try { global.gc(); } catch (e) {}
  }
  return { ok: true, reason: 'mac-gc-only', snapshot: getMemorySnapshot() };
}

function normalizeMask(mask) {
  return mask || MEMORY_MASK_DEFAULT;
}

async function isProcessElevated() {
  // Mac 上 purge 通过 osascript 弹框授权，不关心是否常驻 root
  return false;
}

module.exports = {
  MEMORY_MASK,
  MEMORY_MASK_DEFAULT,
  SYSTEM_PURGE_AVAILABLE,
  SYSTEM_PURGE_ENABLED,
  getMemorySnapshot,
  getMemorySnapshotExtended,
  trimAppWorkingSets,
  purgeSystemMemorySmart,
  normalizeMask,
  isProcessElevated,
};
