'use strict';

// 壁纸库缩略图媒体类型回归：
// Windows 端 record.type 可能为 video，但 previewUrl 是服务端生成的静态图片预览
// （preview.jpg / preview.gif / png / webp）。缩略图标签必须按 previewUrl 的实际
// 媒体类型决定，不能只看 record.type——否则图片被塞进 <video>，readyState=0、
// videoWidth=0，缩略图黑屏（真实 Electron 已复现）。
// 详情页仍按 record.type 用 record.fileUrl 播放真实视频；Scene 仍用 img 实时 MJPEG。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createPanelSandbox() {
  const fakeElement = () => ({
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    dataset: {},
    style: {},
  });
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    IntersectionObserver: function () { return { observe() {}, unobserve() {}, disconnect() {} }; },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => fakeElement(),
      addEventListener() {},
      body: { appendChild() {} },
    },
    window: { addEventListener() {}, IntersectionObserver: sandboxIntersectionObserver() },
  };
  function sandboxIntersectionObserver() {
    return function () { return { observe() {}, unobserve() {}, disconnect() {} }; };
  }
  sandbox.window.IntersectionObserver = sandboxIntersectionObserver();
  vm.createContext(sandbox);
  vm.runInContext(read('public/js/modules/07-fx/10-wallpaper-library-panel.js'), sandbox, {
    filename: '10-wallpaper-library-panel.js',
  });
  return sandbox;
}

test('缩略图标签必须按 previewUrl 实际媒体类型输出，不能只看 record.type', () => {
  const sandbox = createPanelSandbox();
  const thumb = sandbox.wallpaperLibraryThumb;

  // record.type=video 但预览是静态图片（真实 Windows 服务常见形态）→ 必须 img
  for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'webp']) {
    const html = thumb({ id: 't', title: 't', type: 'video', previewUrl: 'http://win:8130/preview.' + ext });
    assert.match(html, /^<img\b/, 'type=video + previewUrl=.' + ext + ' 必须输出 img，实际: ' + html.slice(0, 60));
  }

  // previewUrl 本身是视频文件 → 才输出 video
  for (const ext of ['mp4', 'webm', 'ogg']) {
    const html = thumb({ id: 't', title: 't', type: 'video', previewUrl: 'http://win:8130/preview.' + ext });
    assert.match(html, /^<video\b/, 'previewUrl=.' + ext + ' 应输出 video，实际: ' + html.slice(0, 60));
  }

  // 纯图片 record 仍是 img
  const imageHtml = thumb({ id: 't', title: 't', type: 'image', previewUrl: 'http://win:8130/preview.jpg' });
  assert.match(imageHtml, /^<img\b/);

  // scene 缩略图仍用 img 承载 MJPEG 实时流
  const sceneHtml = thumb({ id: 't', title: 't', type: 'scene', previewUrl: 'http://win:8130/api/live/scene1' });
  assert.match(sceneHtml, /^<img\b/, 'scene 的 MJPEG 实时预览必须是 img');

  // 无 previewUrl 仍输出占位
  assert.match(thumb({ id: 't', title: 't', type: 'video' }), /wallpaper-thumb-empty/);
});

test('详情页仍按 record.type 使用 record.fileUrl 播放真实视频或显示图片', () => {
  const panel = read('public/js/modules/07-fx/10-wallpaper-library-panel.js');
  // 详情：video 记录用 fileUrl 的 video 标签（不能用 previewUrl 替代）
  assert.match(
    panel,
    /record\.type === 'video'\) \{\s*\n\s*preview\.innerHTML = '<video controls muted playsinline preload="metadata" src="' \+ wallpaperLibraryEsc\(record\.fileUrl\)/,
    'video 详情必须用 record.fileUrl 的 video 标签'
  );
  // 详情：图片记录用 fileUrl 的 img
  assert.match(panel, /<img src="' \+ wallpaperLibraryEsc\(record\.fileUrl\)/, '图片详情必须用 record.fileUrl 的 img');
});
