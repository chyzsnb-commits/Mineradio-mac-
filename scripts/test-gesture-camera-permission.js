'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function loadController() {
  const modulePath = path.join(root, 'desktop', 'camera-permission.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath).createCameraPermissionController;
}

function createSystemPreferences(statuses, answer = true) {
  const queue = statuses.slice();
  const calls = { get: 0, ask: 0 };
  return {
    calls,
    getMediaAccessStatus(type) {
      assert.equal(type, 'camera');
      calls.get += 1;
      return queue.length > 1 ? queue.shift() : queue[0];
    },
    async askForMediaAccess(type) {
      assert.equal(type, 'camera');
      calls.ask += 1;
      return answer;
    },
  };
}

test('macOS 首次点击手势会主动请求摄像头权限', async () => {
  const systemPreferences = createSystemPreferences(['not-determined', 'granted']);
  const controller = loadController()({ platform: 'darwin', systemPreferences, shell: null });
  const result = await controller.requestCameraAccess();

  assert.deepEqual(result, {
    ok: true,
    status: 'granted',
    requested: true,
    settingsRequired: false,
  });
  assert.equal(systemPreferences.calls.ask, 1);
  assert.equal(systemPreferences.calls.get, 2);
});

test('已拒绝或受限时不反复请求，并可打开摄像头系统设置', async () => {
  for (const status of ['denied', 'restricted', 'unknown']) {
    const systemPreferences = createSystemPreferences([status]);
    const opened = [];
    const controller = loadController()({
      platform: 'darwin',
      systemPreferences,
      shell: { openExternal: async (url) => opened.push(url) },
    });

    const result = await controller.requestCameraAccess();
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.equal(result.settingsRequired, status === 'denied' || status === 'restricted');
    assert.equal(systemPreferences.calls.ask, 0);

    if (result.settingsRequired) {
      const settingsResult = await controller.openCameraPrivacySettings();
      assert.equal(settingsResult.ok, true);
      assert.match(opened[0], /^x-apple\.systempreferences:.*Privacy_Camera/);
    }
  }
});

test('已允许时直接进入采集，不重复弹系统权限', async () => {
  const systemPreferences = createSystemPreferences(['granted']);
  const controller = loadController()({ platform: 'darwin', systemPreferences, shell: null });
  const result = await controller.requestCameraAccess();

  assert.equal(result.ok, true);
  assert.equal(result.status, 'granted');
  assert.equal(result.requested, false);
  assert.equal(systemPreferences.calls.ask, 0);
});

test('打包给主 App 与 Helper 同时声明摄像头和麦克风 entitlement', () => {
  const pkg = require(path.join(root, 'package.json'));
  assert.equal(pkg.build.mac.entitlements, 'build/entitlements.mac.plist');
  assert.equal(pkg.build.mac.entitlementsInherit, 'build/entitlements.mac.plist');

  const entitlements = fs.readFileSync(path.join(root, 'build', 'entitlements.mac.plist'), 'utf8');
  assert.match(entitlements, /<key>com\.apple\.security\.device\.camera<\/key>\s*<true\/>/);
  assert.match(entitlements, /<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/);
});

test('渲染层先走原生权限 gate，且不会把所有启动错误误报成权限', () => {
  const main = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8');
  const gesture = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '10-shell', '00-gesture-control.js'), 'utf8');

  assert.match(main, /systemPreferences/);
  assert.match(main, /mineradio-camera-permission-request/);
  assert.match(preload, /requestCameraAccess:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('mineradio-camera-permission-request'\)/);
  assert.match(preload, /openCameraPrivacySettings/);

  const gateAt = gesture.indexOf('await requestGestureCameraAccess()');
  const captureAt = gesture.indexOf('navigator.mediaDevices.getUserMedia');
  assert.ok(gateAt >= 0 && gateAt < captureAt, '必须先通过 macOS 权限 gate 再采集摄像头');
  assert.match(gesture, /系统设置[^'\n]*隐私与安全性[^'\n]*摄像头/);
  assert.match(gesture, /GESTURE_CAMERA_FRAME_TIMEOUT[\s\S]*摄像头没有画面或正被其他应用占用/);
  assert.doesNotMatch(gesture, /showToast\('手势启动失败 \(需要摄像头权限\)'\)/);
});
