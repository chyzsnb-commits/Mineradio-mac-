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
  // 场景壁纸导出视频: 列出已录制的 mp4（放 LIBRARY_ROOT/_exported/）
  if (url.pathname === '/api/exported-videos') {
    const dir = path.join(LIBRARY_ROOT, '_exported');
    const out = [];
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch (_) {}
    for (const name of entries.filter(n => /\.(mp4|webm)$/i.test(n))) {
      const file = path.join(dir, name);
      let size = 0;
      try { size = fs.statSync(file).size; } catch (_) {}
      out.push({ name, size, url: '/api/exported-file?name=' + encodeURIComponent(name) });
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, records: out }));
    return;
  }
  if (url.pathname === '/api/exported-file') {
    const name = String(url.searchParams.get('name') || '');
    const safe = path.basename(name);
    if (!/\.(mp4|webm)$/i.test(safe)) { res.writeHead(404); res.end('Not Found'); return; }
    const file = path.join(LIBRARY_ROOT, '_exported', safe);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'video/mp4', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  // 录制引导页: Win 端浏览器打开,用桌面捕获抓 WE 窗口并录制成 mp4 保存
  if (url.pathname === '/export.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(EXPORT_PAGE_HTML);
    return;
  }
  res.writeHead(404); res.end('Not Found');
});

// 导出录制页: Win 端浏览器打开 http://<IP>:<port>/export.html
// 选择 WE 壁纸窗口 → 录 15/30/60 秒 → 保存 mp4 到壁纸库 _exported/ 目录（Mac 端即可拉取播放）
const EXPORT_PAGE_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Mineradio 场景壁纸导出</title>
<style>body{font-family:system-ui,sans-serif;background:#0d0f13;color:#e8eef2;max-width:640px;margin:40px auto;padding:0 20px}
h1{font-size:18px}button{background:#2442ff;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer;margin:4px}
button:disabled{opacity:.5;cursor:default}video{width:100%;max-height:320px;background:#000;border-radius:8px;margin:10px 0}
label{display:block;margin:10px 0 4px;font-size:13px;color:#9aa4b2}input,select{width:100%;padding:8px;border-radius:8px;border:1px solid #333;background:#161a20;color:#fff}
.note{font-size:12px;color:#6b7ba9}</style></head>
<body>
<h1>Mineradio 场景壁纸导出</h1>
<p style="font-size:13px;color:#9aa4b2">用桌面捕获录制 Wallpaper Engine 场景窗口，保存为 mp4 供 Mac 版播放。</p>
<label>录制时长（秒）</label><select id="duration"><option value="15">15 秒</option><option value="30" selected>30 秒</option><option value="60">60 秒</option></select>
<label>WE 窗口标题（留空自动选 Wallpaper Engine 窗口）</label><input id="title" placeholder="Wallpaper Engine 或场景窗口标题">
<div><button id="start">开始录制</button><button id="stop" disabled>停止</button><button id="save" disabled>保存 mp4</button></div>
<video id="preview" autoplay muted playsinline></video>
<div id="status" style="font-size:12px;color:#7fe08a;min-height:18px"></div>
<script>
var stream=null, recorder=null, chunks=[], preview=document.getElementById('preview');
var titleEl=document.getElementById('title'), statusEl=document.getElementById('status');
var startBtn=document.getElementById('start'), stopBtn=document.getElementById('stop'), saveBtn=document.getElementById('save');
async function pick(){
  var opts={video:{displaySurface:'window',cursor:'never'},audio:false};
  try{ return await navigator.mediaDevices.getDisplayMedia(opts); }
  catch(e){ return null; }
}
startBtn.onclick=async function(){
  var s=await pick(); if(!s){ statusEl.textContent='无法捕获屏幕/窗口（需要 Win10+ 且授权）'; return; }
  stream=s; chunks=[]; preview.srcObject=s;
  recorder=new MediaRecorder(s,{mimeType:'video/mp4'});
  recorder.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
  recorder.onstop=saveVideo;
  var sec=Number(document.getElementById('duration').value)||30;
  recorder.start();
  startBtn.disabled=true; stopBtn.disabled=false; saveBtn.disabled=true;
  statusEl.textContent='录制中 '+sec+' 秒（点“停止”提前结束）...';
  setTimeout(function(){ if(recorder&&recorder.state==='recording') recorder.stop(); }, sec*1000);
};
stopBtn.onclick=function(){ if(recorder&&recorder.state==='recording'){ recorder.stop(); } };
function saveVideo(){
  var blob=new Blob(chunks,{type:'video/mp4'});
  preview.srcObject=null;
  if(stream){ stream.getTracks().forEach(function(t){t.stop();}); stream=null; }
  var name='scene-' + new Date().toISOString().replace(/[:.]/g,'-') + '.mp4';
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  // 同时把文件发到共享服务保存(若同机脚本运行中)
  var xhr=new XMLHttpRequest();
  xhr.open('POST','/api/upload-video?name='+encodeURIComponent(name),true);
  xhr.onload=function(){ statusEl.textContent = xhr.status===200 ? '已保存到壁纸库 _exported/ 目录，Mac 端刷新即可看到' : '已下载到本机（保存到服务失败：'+xhr.status+'）'; };
  xhr.onerror=function(){ statusEl.textContent='已下载到本机（服务不可达）'; };
  xhr.send(blob);
  startBtn.disabled=false; stopBtn.disabled=true;
}
</script></body></html>`;

// 接收录制上传（Win 端导出页 POST）
server.on('request', (req, res) => {
  if (req.method !== 'POST' || req.url.indexOf('/api/upload-video') !== 0) return;
  const u = new URL(req.url, 'http://localhost');
  const name = path.basename(String(u.searchParams.get('name') || ''));
  if (!/\.(mp4|webm)$/i.test(name)) { res.writeHead(400); res.end('Bad name'); return; }
  const dir = path.join(LIBRARY_ROOT, '_exported');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const ws = fs.createWriteStream(file);
  req.pipe(ws);
  ws.on('finish', () => { res.writeHead(200); res.end('ok'); });
  ws.on('error', () => { res.writeHead(500); res.end('err'); });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Mineradio 壁纸库共享服务已启动: http://0.0.0.0:' + PORT);
  console.log('壁纸库目录: ' + LIBRARY_ROOT);
  console.log('Mac 版 Mineradio 连接地址: http://<本机IP>:' + PORT);
  console.log('场景壁纸导出页（Win 端浏览器打开）: http://<本机IP>:' + PORT + '/export.html');
});
