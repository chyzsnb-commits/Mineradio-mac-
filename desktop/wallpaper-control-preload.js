// 壁纸控制面板(液态玻璃)preload:向主进程发控制指令 + 接收状态
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wpctl', {
  send: (action, value) => ipcRenderer.send('mineradio-wallpaper-control', { action, value }),
  onState: (cb) => {
    const listener = (_e, st) => { try { cb(st); } catch (e) {} };
    ipcRenderer.on('mineradio-wallpaper-panel-state', listener);
    return () => ipcRenderer.removeListener('mineradio-wallpaper-panel-state', listener);
  },
});
