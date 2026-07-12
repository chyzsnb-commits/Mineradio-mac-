// macOS Touch Bar 基础播放控制。
//
// 适配机型：2016-2019 Intel MacBook Pro（带 Touch Bar 的机型）。
// 在没有 Touch Bar 的机器（M 芯片 Mac、无 Touch Bar 的 Intel Mac）上，
// setTouchBar 是安全的 no-op（不显示但不崩溃），所以无需检测硬件。
//
// 布局：[歌曲名]  [<<上一首]  [▶/⏸ 播放暂停]  [>>下一首]
// 播放控制复用主进程已有的 sendGlobalHotkeyAction（和 Dock 菜单/全局快捷键同源）。
// 歌曲名由渲染进程通过 IPC 'touchbar-update-track' 动态推送更新。
'use strict';

const { TouchBar } = require('electron');
const { TouchBarLabel, TouchBarButton, TouchBarSpacer } = TouchBar;

let titleLabel = null;
let playPauseBtn = null;
let currentWindow = null;
let sendActionFn = null;
let isPlaying = false;

function buildTouchBar() {
  // 歌曲名标签
  titleLabel = new TouchBarLabel({
    label: 'Mineradio',
    textColor: '#fac900',  // 用 Mineradio 的高亮色
  });

  // 上一首
  const prevBtn = new TouchBarButton({
    label: '<<',
    click: () => {
      if (sendActionFn) sendActionFn('prevTrack');
    },
  });

  // 播放/暂停（标签会根据播放状态切换 ▶ / ⏸）
  playPauseBtn = new TouchBarButton({
    label: '▶',
    click: () => {
      if (sendActionFn) sendActionFn('togglePlay');
    },
  });

  // 下一首
  const nextBtn = new TouchBarButton({
    label: '>>',
    click: () => {
      if (sendActionFn) sendActionFn('nextTrack');
    },
  });

  return new TouchBar({
    items: [
      titleLabel,
      new TouchBarSpacer({ size: 'flexible' }),
      prevBtn,
      playPauseBtn,
      nextBtn,
    ],
  });
}

// 初始化 Touch Bar，挂到指定窗口。
// opts:
//   window: BrowserWindow 主窗口
//   sendAction: function(action) 发送播放控制指令（通常 = sendGlobalHotkeyAction）
//   ipcMain: electron 的 ipcMain，用于监听渲染进程的歌曲名/播放状态更新
function init({ window, sendAction, ipcMain }) {
  if (process.platform !== 'darwin') return;  // 仅 macOS
  if (!window || window.isDestroyed()) return;

  currentWindow = window;
  sendActionFn = sendAction || function () {};

  try {
    const touchBar = buildTouchBar();
    window.setTouchBar(touchBar);
  } catch (e) {
    // setTouchBar 在无 Touch Bar 机器上理论上不会抛错，但保险起见 catch
    console.log('[TouchBar] 初始化跳过:', e.message);
    return;
  }

  // 监听渲染进程推送的歌曲名更新
  if (ipcMain) {
    ipcMain.on('touchbar-update-track', (_event, payload) => {
      updateTrack(payload);
    });
  }

  // 窗口关闭时清理
  window.on('closed', () => {
    try {
      if (currentWindow && !currentWindow.isDestroyed()) {
        currentWindow.setTouchBar(null);
      }
    } catch (e) {}
    currentWindow = null;
  });
}

// 渲染进程推送更新：{ title, artist, isPlaying }
function updateTrack(payload) {
  if (!payload) return;
  try {
    if (payload.title && titleLabel) {
      // 歌名 + 艺术家，超长截断（Touch Bar 空间有限）
      var display = payload.title;
      if (payload.artist) display += ' - ' + payload.artist;
      if (display.length > 32) display = display.slice(0, 31) + '…';
      titleLabel.label = display;
    }
    if (typeof payload.isPlaying === 'boolean' && playPauseBtn) {
      isPlaying = payload.isPlaying;
      playPauseBtn.label = isPlaying ? '⏸' : '▶';
    }
  } catch (e) {}
}

module.exports = { init, updateTrack };
