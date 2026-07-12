const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, '..', 'desktop', 'main.js');
const source = fs.readFileSync(mainPath, 'utf8');

function requireMatch(pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

function extractHandler(channel) {
  const marker = `ipcMain.handle('${channel}'`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing handler: ${channel}`);
  const next = source.indexOf('ipcMain.handle(', start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

requireMatch(/async function runWithRendererAudioMuted\(/, 'missing renderer audio mute guard');

const trimHandler = extractHandler('mineradio-memory-trim-app');
const purgeHandler = extractHandler('mineradio-memory-purge-system');

if (!/runWithRendererAudioMuted\(/.test(trimHandler)) {
  throw new Error('app memory trim must use renderer audio mute guard');
}

if (!/runWithRendererAudioMuted\(/.test(purgeHandler)) {
  throw new Error('system memory purge must use renderer audio mute guard');
}

if (/sendGlobalHotkeyAction\('togglePlay'\)/.test(purgeHandler)) {
  throw new Error('system memory purge must not pause/resume via togglePlay');
}

console.log('memory audio guard checks passed');
