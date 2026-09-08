'use strict';

const fs = require('fs');
const path = require('path');

async function scanDirectoryUsage(directory) {
  const root = path.resolve(String(directory || ''));
  let bytes = 0;
  let files = 0;

  async function visit(folder) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(folder, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const target = path.join(folder, entry.name);
      let stat;
      try {
        stat = await fs.promises.lstat(target);
      } catch (_) {
        continue;
      }
      if (stat.isFile()) {
        bytes += Math.max(0, Number(stat.size) || 0);
        files += 1;
      } else if (stat.isDirectory()) {
        await visit(target);
      }
    }
  }

  await visit(root);
  return { bytes, files };
}

async function clearDirectoryContents(directory) {
  const root = path.resolve(String(directory || ''));
  const usage = await scanDirectoryUsage(root);
  let entries = [];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch (_) {
    return { bytes: 0, files: 0 };
  }
  for (const entry of entries) {
    try {
      await fs.promises.rm(path.join(root, entry.name), { recursive: true, force: true, maxRetries: 2 });
    } catch (_) {}
  }
  return usage;
}

function safeWallpaperLibraryFileName(name, mime, id) {
  const rawId = String(id || 'wallpaper').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'wallpaper';
  const rawName = path.basename(String(name || '')).replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '');
  const mimeType = String(mime || '').toLowerCase();
  const fallbackExt = /^video\/webm/.test(mimeType) ? '.webm'
    : /^video\/quicktime/.test(mimeType) ? '.mov'
      : /^video\//.test(mimeType) ? '.mp4'
        : /^image\/png/.test(mimeType) ? '.png'
          : /^image\/jpe?g/.test(mimeType) ? '.jpg'
            : '.webp';
  const ext = path.extname(rawName).toLowerCase() || fallbackExt;
  const stem = path.basename(rawName, path.extname(rawName)) || 'wallpaper';
  return `${rawId}-${stem.slice(0, 96)}${ext.slice(0, 12)}`;
}

module.exports = {
  clearDirectoryContents,
  safeWallpaperLibraryFileName,
  scanDirectoryUsage,
};
