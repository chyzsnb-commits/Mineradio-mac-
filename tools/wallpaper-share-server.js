'use strict';
// Wallpaper Engine 壁纸库共享服务（运行在 Windows 电脑上，供 Mac 版 Mineradio 拉取壁纸）
// 用法（Windows 电脑，装有 Node.js）：
//   node wallpaper-share-server.js "D:\SteamLibrary\steamapps\workshop\content\431960" [端口]
// 默认端口 8123。启动后 Mac 版 Mineradio 首页「壁纸库」→ 输入 http://<本机IP>:8123 → 连接源。
//
// 只读扫描 WE 壁纸库目录：列出图片/视频壁纸，按需提供文件流。Scene 场景壁纸（.pkg）标注不可用。
const http = require('http');
const fs = require('fs');
const path = require('path');

const LIBRARY_ROOT = process.argv[2] || '';
const PORT = Number(process.argv[3]) || 8123;
const MAX_LIST_BYTES = 4 * 1024 * 1024;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.m4v', '.mov']);
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
};

if (!LIBRARY_ROOT || !fs.existsSync(LIBRARY_ROOT)) {
  console.error('请提供有效的 Wallpaper Engine 壁纸库目录。');
  console.error('示例: node wallpaper-share-server.js "D:\\SteamLibrary\\steamapps\\workshop\\content\\431960"');
  process.exit(1);
}

function walkMedia(root) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return out; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    let files = [];
    try { files = fs.readdirSync(dir); } catch (_) { continue; }
    const project = files.find(f => f.toLowerCase() === 'project.json');
    let title = '';
    let projectType = '';
    if (project) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, project), 'utf8'));
        title = String(data.title || data.name || '');
        projectType = String(data.type || data.projectType || '');
      } catch (_) {}
    }
    // 找图片/视频文件
    const media = files.filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()) || VIDEO_EXT.has(path.extname(f).toLowerCase()));
    const hasScenePkg = files.some(f => /\.(pkg|pak)$/i.test(f));
    for (const f of media.slice(0, 3)) {
      const ext = path.extname(f).toLowerCase();
      out.push({
        id: entry.name + '/' + f,
        title: title || f,
        type: VIDEO_EXT.has(ext) ? 'video' : 'image',
        url: '/api/wallpaper-file?id=' + encodeURIComponent(entry.name + '/' + f),
        previewUrl: '/api/wallpaper-file?id=' + encodeURIComponent(entry.name + '/' + f),
        projectType,
        enginePlayable: false,
        sceneNeedsEngine: hasScenePkg && projectType === 'scene',
      });
    }
  }
  return out;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/wallpapers') {
    const records = walkMedia(LIBRARY_ROOT);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, records }));
    return;
  }
  if (url.pathname === '/api/wallpaper-file') {
    const id = String(url.searchParams.get('id') || '');
    const safe = path.normalize(id).replace(/^(\.\.(\/|\\|$))+/, '');
    const file = path.join(LIBRARY_ROOT, safe);
    if (!file.startsWith(path.resolve(LIBRARY_ROOT)) || !fs.existsSync(file)) {
      res.writeHead(404); res.end('Not Found'); return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404); res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Mineradio 壁纸库共享服务已启动: http://0.0.0.0:' + PORT);
  console.log('壁纸库目录: ' + LIBRARY_ROOT);
  console.log('Mac 版 Mineradio 连接地址: http://<本机IP>:' + PORT);
});
