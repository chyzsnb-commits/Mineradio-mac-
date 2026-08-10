const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function readFunctionSource(source, name, nextName) {
  var start = source.indexOf('async function ' + name + '(');
  if (start === -1) start = source.indexOf('function ' + name + '(');
  var end = nextName ? source.indexOf('function ' + nextName + '(', start) : source.length;
  assert.notEqual(start, -1, 'missing ' + name);
  assert.notEqual(end, -1, 'missing boundary after ' + name);
  return source.slice(start, end);
}

test('Mac 设置不再暴露关闭窗口行为，启动与退出分组保留播放恢复选项', () => {
  const html = read('public/index.html');
  const workspace = read('public/js/modules/07-fx/09-console-workspace.js');
  const bindings = read('public/js/modules/07-fx/07-bindings-shelf-immersive.js');

  assert.equal(html.includes('id="close-behavior-seg"'), false);
  assert.equal(html.includes('data-close-behavior'), false);
  assert.equal(workspace.includes("fxConsoleItem('close-behavior-seg'"), false);
  assert.equal(bindings.includes('bindCloseBehaviorControls();'), false);
  assert.match(html, /id="startup-resume-mode-seg"/);
});

test('播放输出的路由入口有实际弹窗承载设备选择', () => {
  const html = read('public/index.html');
  const output = read('public/js/modules/05-playback/00-api-quality-output.js');

  assert.match(html, /id="audio-output-workflow-modal"/);
  assert.match(html, /id="audio-output-workflow-body"/);
  assert.match(output, /function openAudioOutputWorkflowPanel\(\)/);
});

test('主输出与虚拟麦克风桥接只在真实路由成功后报告已连接', () => {
  const output = read('public/js/modules/05-playback/00-api-quality-output.js');

  assert.match(output, /audioOutputRuntime/);
  assert.match(output, /if \(ok === true\) \{[\s\S]{0,220}已连接到虚拟麦克风桥接/);
  assert.match(output, /连接虚拟麦克风桥接失败/);
  assert.match(output, /当前输出接口暂不可用，未切换成功/);
});

test('主输出切换被输出接口拒绝时恢复原输出和相关路由偏好', async () => {
  const output = read('public/js/modules/05-playback/00-api-quality-output.js');
  const setOutputSource = readFunctionSource(output, 'setAudioOutputDevice', 'toggleAudioOutputMirrorDevice');
  const calls = [];
  const context = {
    Promise,
    audio: {},
    audioReady: true,
    audioCtx: { setSinkId: function () {} },
    audioOutputDeviceId: 'old-output',
    audioInputBridgeState: { enabled: true, deviceId: 'old-output' },
    audioOutputMirrorDeviceIds: ['new-output', 'mirror-output'],
    normalizeAudioOutputIdList: function (ids) { return Array.from(new Set(ids || [])); },
    saveAudioOutputMirrorPreference: function () { calls.push(['save-mirror']); },
    saveAudioOutputDevicePreference: function () { calls.push(['save-output']); },
    saveAudioInputBridgePreference: function () { calls.push(['save-bridge']); },
    markAudioOutputRuntime: function (state, message) { calls.push(['runtime', state, message]); },
    renderAudioOutputDeviceUi: function () { calls.push(['render']); },
    applyAudioOutputDevice: function () { calls.push(['apply', context.audioOutputDeviceId]); return false; },
    showToast: function (message) { calls.push(['toast', message]); }
  };
  vm.createContext(context);
  vm.runInContext(setOutputSource + '\nthis.setAudioOutputDevice = setAudioOutputDevice;', context);

  context.setAudioOutputDevice('new-output', true);
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(context.audioOutputDeviceId, 'old-output');
  assert.equal(context.audioInputBridgeState.enabled, true);
  assert.equal(context.audioInputBridgeState.deviceId, 'old-output');
  assert.equal(JSON.stringify(context.audioOutputMirrorDeviceIds), JSON.stringify(['new-output', 'mirror-output']));
  assert.deepEqual(calls.filter(function (item) { return item[0] === 'apply'; }), [
    ['apply', 'new-output'],
    ['apply', 'old-output']
  ]);
  assert.ok(calls.some(function (item) { return item[0] === 'runtime' && item[1] === 'failed' && /恢复原输出/.test(item[2]); }));
  assert.ok(calls.some(function (item) { return item[0] === 'toast' && /恢复原输出/.test(item[1]); }));
});

test('没有播放器时保存主输出为待播放连接，而不是误报失败或回退', async () => {
  const output = read('public/js/modules/05-playback/00-api-quality-output.js');
  const setOutputSource = readFunctionSource(output, 'setAudioOutputDevice', 'toggleAudioOutputMirrorDevice');
  const calls = [];
  const context = {
    Promise,
    audio: null,
    audioReady: false,
    audioCtx: null,
    audioOutputDeviceId: 'old-output',
    audioInputBridgeState: { enabled: false, deviceId: '' },
    audioOutputMirrorDeviceIds: [],
    normalizeAudioOutputIdList: function (ids) { return Array.from(new Set(ids || [])); },
    saveAudioOutputMirrorPreference: function () { calls.push(['save-mirror']); },
    saveAudioOutputDevicePreference: function () { calls.push(['save-output']); },
    saveAudioInputBridgePreference: function () { calls.push(['save-bridge']); },
    markAudioOutputRuntime: function (state, message) { calls.push(['runtime', state, message]); },
    renderAudioOutputDeviceUi: function () { calls.push(['render']); },
    applyAudioOutputDevice: function () { calls.push(['apply']); return null; },
    showToast: function (message) { calls.push(['toast', message]); }
  };
  vm.createContext(context);
  vm.runInContext(setOutputSource + '\nthis.setAudioOutputDevice = setAudioOutputDevice;', context);

  context.setAudioOutputDevice('later-output', true);
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(context.audioOutputDeviceId, 'later-output');
  assert.deepEqual(calls.filter(function (item) { return item[0] === 'apply'; }), [['apply']]);
  assert.ok(calls.some(function (item) { return item[0] === 'toast' && /播放时自动启用/.test(item[1]); }));
});

test('虚拟麦克风桥接被输出接口拒绝时恢复原输出', async () => {
  const output = read('public/js/modules/05-playback/00-api-quality-output.js');
  const setBridgeSource = readFunctionSource(output, 'setAudioInputBridgeDevice');
  const calls = [];
  const context = {
    Promise,
    audio: {},
    audioOutputDeviceId: 'old-output',
    audioInputBridgeState: { enabled: false, deviceId: '' },
    audioOutputMirrorDeviceIds: ['bridge-output'],
    normalizeAudioOutputIdList: function (ids) { return Array.from(new Set(ids || [])); },
    saveAudioOutputMirrorPreference: function () { calls.push(['save-mirror']); },
    saveAudioOutputDevicePreference: function () { calls.push(['save-output']); },
    saveAudioInputBridgePreference: function () { calls.push(['save-bridge']); },
    markAudioOutputRuntime: function (state, message) { calls.push(['runtime', state, message]); },
    renderAudioOutputDeviceUi: function () { calls.push(['render']); },
    applyAudioOutputDevice: function () { calls.push(['apply', context.audioOutputDeviceId]); return false; },
    showToast: function (message) { calls.push(['toast', message]); }
  };
  vm.createContext(context);
  vm.runInContext(setBridgeSource + '\nthis.setAudioInputBridgeDevice = setAudioInputBridgeDevice;', context);

  context.setAudioInputBridgeDevice('bridge-output', true);
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(context.audioOutputDeviceId, 'old-output');
  assert.equal(context.audioInputBridgeState.enabled, false);
  assert.equal(context.audioInputBridgeState.deviceId, '');
  assert.deepEqual(calls.filter(function (item) { return item[0] === 'apply'; }), [
    ['apply', 'bridge-output'],
    ['apply', 'old-output']
  ]);
  assert.ok(calls.some(function (item) { return item[0] === 'toast' && /桥接失败.*恢复原输出/.test(item[1]); }));
});

test('设备权限未授予时不把空 deviceId 重复渲染为系统默认输出', async () => {
  const output = read('public/js/modules/05-playback/00-api-quality-output.js');
  const refreshSource = readFunctionSource(output, 'refreshAudioOutputDevices', 'bindAudioOutputMirrorEvents');
  const context = {
    Promise,
    navigator: {
      mediaDevices: {
        enumerateDevices: async function () {
          return [
            { kind: 'audiooutput', deviceId: '', label: '' },
            { kind: 'audiooutput', deviceId: 'default', label: 'Default' },
            { kind: 'audiooutput', deviceId: 'speaker-1', label: 'Speaker' },
            { kind: 'audioinput', deviceId: '', label: '' },
            { kind: 'audioinput', deviceId: 'mic-1', label: 'Microphone' }
          ];
        }
      }
    },
    audioOutputDevices: [],
    audioInputDevices: [],
    audioInputBridgeState: { enabled: false, deviceId: '' },
    audioOutputDeviceById: function () { return null; },
    saveAudioInputBridgePreference: function () {},
    renderAudioOutputDeviceUi: function () {},
    showToast: function () {}
  };
  vm.createContext(context);
  vm.runInContext(refreshSource + '\nthis.refreshAudioOutputDevices = refreshAudioOutputDevices;', context);

  await context.refreshAudioOutputDevices(false);

  assert.equal(JSON.stringify(context.audioOutputDevices.map(function (device) { return device.deviceId; })), JSON.stringify(['speaker-1']));
  assert.equal(JSON.stringify(context.audioInputDevices.map(function (device) { return device.deviceId; })), JSON.stringify(['mic-1']));
});

test('Mac 发布配置继续禁用软件内自动更新，升级介质为 DMG', () => {
  const packageInfo = JSON.parse(read('package.json'));
  const packageText = read('package.json');

  assert.equal(packageInfo.mineradio.update.provider, 'none');
  assert.equal(packageText.includes('electron-updater'), false);
  assert.equal(packageInfo.build.mac.target[0].target, 'dmg');
});
