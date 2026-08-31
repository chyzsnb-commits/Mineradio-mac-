'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'public/js/modules/10-shell/00-camera-stream-manager.js'),
  'utf8',
);

function createManager(options = {}) {
  const order = [];
  const constraints = [];
  const listeners = new Map();
  let getUserMediaCalls = 0;
  let stopCalls = 0;
  const track = {
    readyState: 'live',
    async applyConstraints(value) {
      constraints.push(value);
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    stop() {
      stopCalls += 1;
      track.readyState = 'ended';
    },
  };
  const stream = {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  };
  const window = {
    desktopWindow: {
      async requestCameraAccess() {
        order.push('permission');
        if (options.permissionPromise) return options.permissionPromise;
        return options.permissionResult || { ok: true, status: 'granted' };
      },
    },
    dispatchEvent() {},
  };
  const context = vm.createContext({
    window,
    navigator: {
      mediaDevices: {
        async getUserMedia(value) {
          order.push('capture');
          getUserMediaCalls += 1;
          constraints.push(value.video);
          return stream;
        },
      },
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    console,
    Set,
    Promise,
    Array,
    Object,
    String,
    Error,
    fx: { performanceQuality: 'high' },
  });
  vm.runInContext(source, context, { filename: '00-camera-stream-manager.js' });
  return {
    api: window.__mineradioCameraStreamManager,
    order,
    constraints,
    stream,
    track,
    listeners,
    getUserMediaCalls: () => getUserMediaCalls,
    stopCalls: () => stopCalls,
  };
}

test('手势和透视并发开启时只创建一条摄像头流', async () => {
  const env = createManager();
  const [gestureStream, perspectiveStream] = await Promise.all([
    env.api.acquire('gesture'),
    env.api.acquire('perspective'),
  ]);

  assert.equal(gestureStream, env.stream);
  assert.equal(perspectiveStream, env.stream);
  assert.equal(env.getUserMediaCalls(), 1);
  assert.deepEqual(env.order.slice(0, 2), ['permission', 'capture']);
  assert.deepEqual([...env.api.getState().owners].sort(), ['gesture', 'perspective']);

  await env.api.release('gesture');
  assert.equal(env.stopCalls(), 0, '关闭手势不得停止透视正在使用的 track');
  await env.api.release('perspective');
  assert.equal(env.stopCalls(), 1, '最后一个 owner 退出时才停止 track');
});

test('原生权限 gate 拒绝时不调用 getUserMedia', async () => {
  const env = createManager({
    permissionResult: { ok: false, status: 'denied', settingsRequired: true },
  });

  await assert.rejects(env.api.acquire('perspective'), (error) => {
    assert.equal(error.name, 'NotAllowedError');
    assert.equal(error.cameraPermissionStatus, 'denied');
    assert.equal(error.cameraSettingsRequired, true);
    return true;
  });
  assert.equal(env.getUserMediaCalls(), 0);
});

test('透视 owner 加入时升级画质，退出后为仍在运行的手势降档', async () => {
  const env = createManager();
  await env.api.acquire('gesture');
  assert.equal(env.constraints[0].width.ideal, 320);
  assert.equal(env.constraints[0].height.ideal, 240);

  await env.api.acquire('perspective');
  assert.ok(env.constraints.some((value) => value.width && value.width.ideal === 1280));
  await env.api.release('perspective');

  const last = env.constraints[env.constraints.length - 1];
  assert.equal(last.width.ideal, 320);
  assert.equal(last.height.ideal, 240);
  assert.equal(env.stopCalls(), 0);
  await env.api.release('gesture');
});

test('采集尚未完成时关闭唯一 owner，返回后立即停流且不残留', async () => {
  let resolvePermission;
  const permissionPromise = new Promise((resolve) => { resolvePermission = resolve; });
  const env = createManager({ permissionPromise });
  const acquiring = env.api.acquire('perspective');
  await env.api.release('perspective');
  resolvePermission({ ok: true, status: 'granted' });

  await assert.rejects(acquiring, (error) => error && error.name === 'AbortError');
  assert.equal(env.getUserMediaCalls(), 1);
  assert.equal(env.stopCalls(), 1);
  assert.equal(env.api.getState().active, false);
  assert.deepEqual([...env.api.getState().owners], []);
});
