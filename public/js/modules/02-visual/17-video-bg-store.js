// 视频背景网格:复用 06-custom-background-colorlab 的 IndexedDB(mineradio-custom-background-v1 / store 'media')
// 与 07-fx/02 的 #custom-bg-video DOM 层。这里只补 list/delete + 网格 UI;上传/存储/循环播放/重启恢复都走现成的 custom-bg 系统。
function listVideoBackgrounds() {
  if (typeof openCustomBackgroundDb !== 'function') return Promise.resolve([]);
  return openCustomBackgroundDb().then(function (db) {
    return new Promise(function (resolve) {
      var out = [];
      var tx = db.transaction(CUSTOM_BG_STORE, 'readonly');
      var req = tx.objectStore(CUSTOM_BG_STORE).openCursor();
      req.onsuccess = function () {
        var cur = req.result;
        if (cur) {
          var v = cur.value || {};
          if (v.id) out.push({ id: v.id, name: v.name || '', size: v.size || 0, savedAt: v.savedAt || 0, mime: v.mime || '' });
          cur.continue();
        } else {
          out.sort(function (a, b) { return (a.savedAt || 0) - (b.savedAt || 0); });
          resolve(out);
        }
      };
      req.onerror = function () { resolve(out); };
      tx.oncomplete = function () { db.close(); };
    });
  }).catch(function () { return []; });
}
function deleteVideoBackgroundEntry(id) {
  if (typeof openCustomBackgroundDb !== 'function') return Promise.reject(new Error('db unavailable'));
  return openCustomBackgroundDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(CUSTOM_BG_STORE, 'readwrite');
      tx.objectStore(CUSTOM_BG_STORE).delete(id);
      tx.oncomplete = function () { db.close(); resolve(); };
      tx.onerror = function () { db.close(); reject(tx.error || new Error('delete failed')); };
    });
  });
}
function videoBgCurrentId() {
  var m = (typeof fx !== 'undefined' && fx) ? fx.backgroundMedia : null;
  return (m && (m.type === 'video' || m.type === 'image') && m.id) ? m.id : '';
}
function renderVideoBgGrid() {
  var grid = document.getElementById('video-bg-grid');
  if (!grid) return;
  listVideoBackgrounds().then(function (items) {
    var activeId = videoBgCurrentId();
    var esc = (typeof escHtml === 'function') ? escHtml : function (s) { return String(s == null ? '' : s); };
    var cellBase = 'position:relative;width:90px;height:54px;border-radius:8px;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:5px 7px;box-sizing:border-box;';
    var html = '';
    items.forEach(function (it) {
      var active = it.id === activeId;
      var isImage = /^image\//i.test(it.mime || '');
      var name = esc(it.name || (isImage ? '图片' : '视频'));
      var border = active ? 'border:1px solid var(--fc-accent,#00f5d4);box-shadow:0 0 0 1px var(--fc-accent,#00f5d4) inset;'
                          : 'border:1px solid rgba(255,255,255,.18);';
      html += '<div class="video-bg-cell" data-bgid="' + it.id + '" data-bgkind="' + (isImage ? 'image' : 'video') + '" title="' + name + '" onclick="applyVideoBg(\'' + it.id + '\',\'' + (isImage ? 'image' : 'video') + '\')"'
        + ' style="' + cellBase + border + 'background:linear-gradient(160deg,' + (isImage ? 'rgba(122,215,194,.26)' : 'rgba(58,123,213,.28)') + ',rgba(0,0,0,.55));">'
        + '<span style="position:absolute;top:5px;left:7px;font-size:12px;color:rgba(255,255,255,.85)">' + (isImage ? '🖼' : '▶') + '</span>'
        + '<span style="font-size:10px;line-height:1.2;color:rgba(255,255,255,.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + name + '</span>'
        + '<button type="button" title="删除" onclick="event.stopPropagation();deleteVideoBg(\'' + it.id + '\')"'
        + ' style="position:absolute;top:2px;right:2px;width:18px;height:18px;line-height:16px;padding:0;border:none;border-radius:50%;'
        + 'background:rgba(0,0,0,.55);color:#fff;font-size:13px;cursor:pointer">×</button>'
        + '</div>';
    });
    html += '<div class="video-bg-cell" title="上传图片或视频背景" onclick="videoBgPick()"'
      + ' style="' + cellBase + 'align-items:center;justify-content:center;border:1px dashed rgba(255,255,255,.28);'
      + 'background:rgba(255,255,255,.04);color:rgba(255,255,255,.55);font-size:22px">+</div>';
    grid.innerHTML = html;
    ensureVideoBgThumbs(grid);
  });
}
// 视频/图片格子封面:视频抓第一秒的帧当封面,图片用自身;生成一次缓存,应用为格子背景图
var videoBgThumbCache = {};
var videoBgThumbPending = {};
function drawVideoBgThumb(src, sw, sh) {
  var W = 180, H = Math.max(1, Math.round(W * ((sh / sw) || 0.6)));
  var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  try { cv.getContext('2d').drawImage(src, 0, 0, W, H); return cv.toDataURL('image/jpeg', 0.72); } catch (e) { return ''; }
}
function applyVideoBgThumb(id, thumb) {
  if (!thumb) return;
  var cell = document.querySelector('.video-bg-cell[data-bgid="' + id + '"]');
  if (!cell) return;
  cell.style.backgroundImage = 'linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,.05)), url("' + thumb + '")';
  cell.style.backgroundSize = 'cover';
  cell.style.backgroundPosition = 'center';
}
function generateVideoBgThumb(id, kind) {
  if (typeof getCustomBackgroundBlob !== 'function' || videoBgThumbPending[id]) return;
  videoBgThumbPending[id] = true;
  getCustomBackgroundBlob(id).then(function (blob) {
    if (!blob) { videoBgThumbPending[id] = false; return; }
    var url = URL.createObjectURL(blob);
    if (kind === 'image') {
      var img = new Image();
      img.onload = function () { var t = drawVideoBgThumb(img, img.naturalWidth || 160, img.naturalHeight || 90); URL.revokeObjectURL(url); videoBgThumbPending[id] = false; if (t) { videoBgThumbCache[id] = t; applyVideoBgThumb(id, t); } };
      img.onerror = function () { URL.revokeObjectURL(url); videoBgThumbPending[id] = false; };
      img.src = url;
    } else {
      var v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.src = url;
      var done = false;
      var grab = function () {
        if (done) return; done = true;
        var t = drawVideoBgThumb(v, v.videoWidth || 160, v.videoHeight || 90);
        if (t) { videoBgThumbCache[id] = t; applyVideoBgThumb(id, t); }
        videoBgThumbPending[id] = false;
        try { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); } catch (e) {}
      };
      v.addEventListener('loadeddata', function () { try { v.currentTime = Math.min(1, (v.duration || 2) * 0.25); } catch (e) { grab(); } });
      v.addEventListener('seeked', grab);
      v.addEventListener('error', function () { videoBgThumbPending[id] = false; try { URL.revokeObjectURL(url); } catch (e) {} });
      setTimeout(grab, 2500);   // 兜底:seeked 不触发也抓一帧
    }
  }).catch(function () { videoBgThumbPending[id] = false; });
}
function ensureVideoBgThumbs(grid) {
  if (!grid) return;
  var cells = grid.querySelectorAll('.video-bg-cell[data-bgid]');
  Array.prototype.forEach.call(cells, function (cell) {
    var id = cell.getAttribute('data-bgid'); if (!id) return;
    if (videoBgThumbCache[id]) { applyVideoBgThumb(id, videoBgThumbCache[id]); return; }
    generateVideoBgThumb(id, cell.getAttribute('data-bgkind') || 'video');
  });
}
function videoBgPick() {
  var inp = document.getElementById('video-bg-file');
  if (inp) inp.click();
}
function videoBgOnFile(input) {
  var f = input && input.files && input.files[0];
  if (input) input.value = '';
  if (f) videoBgAddFile(f);
}
function videoBgAddFile(file) {
  if (!file || !/^(image|video)\//i.test(file.type || '')) { if (typeof showToast === 'function') showToast('请选择图片或视频文件'); return; }
  if (typeof putCustomBackgroundBlob !== 'function') return;
  var kind = /^image\//i.test(file.type || '') ? 'image' : 'video';
  var id = 'bg-' + kind + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  putCustomBackgroundBlob(id, file, { name: file.name || '', mime: file.type || '', size: file.size || 0 }).then(function () {
    if (typeof setCustomBackgroundMedia === 'function') setCustomBackgroundMedia({ type: kind, id: id, name: file.name || '', mime: file.type || '', size: file.size || 0 });
    renderVideoBgGrid();
  }).catch(function (err) {
    console.warn('bg media store failed:', err);
    if (typeof showToast === 'function') showToast((kind === 'image' ? '图片' : '视频') + '较大或当前环境无法保存，请换小一点的文件');
  });
}
function applyVideoBg(id, kind) {
  if (!id) return;
  var type = kind === 'image' ? 'image' : 'video';
  if (typeof setCustomBackgroundMedia === 'function') setCustomBackgroundMedia({ type: type, id: id });
  renderVideoBgGrid();
}
function deleteVideoBg(id) {
  if (!id) return;
  var wasActive = (videoBgCurrentId() === id);
  deleteVideoBackgroundEntry(id).then(function () {
    if (wasActive && typeof setCustomBackgroundMedia === 'function') setCustomBackgroundMedia(null, true);
    renderVideoBgGrid();
  }).catch(function (err) { console.warn('video bg delete failed:', err); });
}
(function initVideoBgGrid() {
  function run() { renderVideoBgGrid(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  // 重启恢复:loadLyricLayout 之后 fx.backgroundMedia 才就位,window load 再刷一次高亮
  window.addEventListener('load', run);
})();
