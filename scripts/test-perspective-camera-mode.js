'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createCameraManagerHarness(permissionResult) {
  const calls = { permission: 0, capture: 0, stop: 0, constraints: [] };
  const track = {
    readyState: 'live',
    stop() { calls.stop += 1; this.readyState = 'ended'; },
    async applyConstraints(value) { calls.constraints.push(value); },
    addEventListener() {},
  };
  const stream = {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  };
  const context = vm.createContext({
    window: {
      desktopWindow: {
        async requestCameraAccess() {
          calls.permission += 1;
          return permissionResult || { ok: true, status: 'granted' };
        },
      },
      dispatchEvent() {},
    },
    navigator: {
      mediaDevices: {
        async getUserMedia() { calls.capture += 1; return stream; },
      },
    },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    Set,
    Array,
    Object,
    Promise,
    Error,
    String,
    console: { warn() {} },
    setTimeout,
    clearTimeout,
    fx: { performanceQuality: 'high' },
  });
  vm.runInContext(read('public/js/modules/10-shell/00-camera-stream-manager.js'), context);
  return { context, calls, stream };
}

test('透视模式替代六枚快捷色并提供独立摄像头背景层', () => {
  const html = read('public/index.html');
  const backgroundSection = html.slice(
    html.indexOf('<div id="app-bg-section">'),
    html.indexOf('<div class="fx-advanced"', html.indexOf('<div id="app-bg-section">')),
  );

  assert.match(backgroundSection, /id="t-perspectiveMode"/);
  assert.match(backgroundSection, /透视模式/);
  assert.match(html, /id="perspective-bg-video"/);
  assert.doesNotMatch(backgroundSection, /onclick="voxSetBg\('#(?:05080d|1a1030|0d1f1a|2a0e12|000000|f5f1e6)'\)"/);
});

test('手势与透视模式共享同一条摄像头流', () => {
  const manager = read('public/js/modules/10-shell/00-camera-stream-manager.js');
  const perspective = read('public/js/modules/02-visual/19-perspective-camera.js');
  const gesture = read('public/js/modules/10-shell/00-gesture-control.js');
  const loader = read('public/js/index-loader.js');

  assert.match(manager, /cameraStreamOwners|sharedCameraOwners/);
  assert.match(manager, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(manager, /requestCameraAccess/);
  assert.match(manager, /function acquireSharedCameraStream/);
  assert.match(manager, /function releaseSharedCameraStream/);
  assert.match(perspective, /acquireSharedCameraStream\(['"]perspective['"]/);
  assert.match(gesture, /acquireSharedCameraStream\(['"]gesture['"]/);
  assert.doesNotMatch(gesture, /navigator\.mediaDevices\.getUserMedia/);
  assert.doesNotMatch(gesture, /gestureStream\.getTracks\(\)\.forEach/);
  assert.ok(loader.indexOf('00-camera-stream-manager.js') < loader.indexOf('00-gesture-control.js'));
});

test('透视只在真实视频可用后接管背景并让 WebGL 透明', () => {
  const perspective = read('public/js/modules/02-visual/19-perspective-camera.js');
  const voxel = read('public/js/modules/02-visual/16-voxel-echo.js');
  const depth = read('public/js/modules/02-visual/18-lyric-depth-flight.js');
  const css = read('public/css/index.css');

  assert.match(perspective, /perspectiveCameraBackgroundActive/);
  assert.match(perspective, /loadeddata|canplay|readyState/);
  assert.match(perspective, /classList\.(?:add|toggle)\(['"]perspective-mode/);
  assert.match(voxel, /perspectiveCameraBackgroundActive/);
  assert.match(depth, /perspectiveCameraBackgroundActive/);
  assert.match(css, /body\.perspective-mode/);
  assert.match(css, /#perspective-bg-video/);
});

test('透视模式持久化且打包说明明确覆盖该用途', () => {
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const persistence = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
  const pkg = require(path.join(root, 'package.json'));

  assert.match(defaults, /perspectiveMode:\s*false/);
  assert.match(persistence, /perspectiveMode/);
  assert.match(pkg.build.mac.extendInfo.NSCameraUsageDescription, /透视模式/);
  assert.match(pkg.build.mac.extendInfo.NSCameraUsageDescription, /手势/);
});

test('双消费者并发只采集一次，最后一个消费者释放才停止轨道', async () => {
  const { context, calls, stream } = createCameraManagerHarness();
  const [gestureStream, perspectiveStream] = await Promise.all([
    context.acquireSharedCameraStream('gesture'),
    context.acquireSharedCameraStream('perspective'),
  ]);

  assert.equal(gestureStream, stream);
  assert.equal(perspectiveStream, stream);
  assert.equal(calls.permission, 1);
  assert.equal(calls.capture, 1);
  await context.releaseSharedCameraStream('perspective');
  assert.equal(calls.stop, 0);
  await context.releaseSharedCameraStream('gesture');
  assert.equal(calls.stop, 1);
});

test('原生权限拒绝时不会调用 getUserMedia', async () => {
  const { context, calls } = createCameraManagerHarness({
    ok: false,
    status: 'denied',
    settingsRequired: true,
  });

  await assert.rejects(context.acquireSharedCameraStream('perspective'), /CAMERA_PERMISSION_DENIED/);
  assert.equal(calls.permission, 1);
  assert.equal(calls.capture, 0);
  assert.equal(context.getSharedCameraState().owners.length, 0);
});
