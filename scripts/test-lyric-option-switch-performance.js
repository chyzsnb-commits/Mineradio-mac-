const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `缺少 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`${name} 函数未闭合`);
}

test('行数和翻译跳过重复选择并把刷新合并到下一帧', () => {
  const source = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const counts = { controls: 0, queued: 0, refresh: 0, save: 0, toast: 0 };
  const sandbox = {
    fx: { lyricDisplayMode: 'single', lyricTranslationMode: 'off' },
    normalizeLyricDisplayMode(value) { return value; },
    normalizeLyricTranslationMode(value) { return value; },
    updateLyricDisplayModeControls() { counts.controls += 1; },
    updateLyricTranslationModeControls() { counts.controls += 1; },
    scheduleStageLyricOptionRefresh() { counts.queued += 1; },
    refreshStageLyricDisplayMode() { counts.refresh += 1; },
    saveLyricLayout() { counts.save += 1; },
    showToast() { counts.toast += 1; },
  };
  vm.runInNewContext([
    readFunction(source, 'setLyricDisplayMode'),
    readFunction(source, 'setLyricTranslationMode'),
  ].join(';'), sandbox);

  vm.runInNewContext(`
    setLyricDisplayMode('single');
    setLyricTranslationMode('off');
    setLyricDisplayMode('cinema');
    setLyricTranslationMode('multi');
  `, sandbox);

  assert.deepEqual(counts, { controls: 2, queued: 2, refresh: 0, save: 2, toast: 2 });
  assert.equal(sandbox.fx.lyricDisplayMode, 'cinema');
  assert.equal(sandbox.fx.lyricTranslationMode, 'multi');
});

test('歌词动画原地更新参数而不重建歌词网格', () => {
  const source = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const counts = { controls: 0, apply: 0, refresh: 0, save: 0, toast: 0 };
  const sandbox = {
    fx: { lyricMotionStyle: 'float' },
    normalizeLyricMotionStyle(value) { return value; },
    updateLyricMotionStyleControls() { counts.controls += 1; },
    applyStageLyricMotionStyleInPlace() { counts.apply += 1; },
    refreshStageLyricDisplayMode() { counts.refresh += 1; },
    saveLyricLayout() { counts.save += 1; },
    showToast() { counts.toast += 1; },
  };
  vm.runInNewContext(readFunction(source, 'setLyricMotionStyle'), sandbox);

  vm.runInNewContext(`
    setLyricMotionStyle('float');
    setLyricMotionStyle('glass');
  `, sandbox);

  assert.deepEqual(counts, { controls: 1, apply: 1, refresh: 0, save: 1, toast: 1 });
  assert.equal(sandbox.fx.lyricMotionStyle, 'glass');
});

test('连续刷新只执行最后一次并为多行模式使用轻量轨道', () => {
  const source = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const frameCallbacks = new Map();
  const payloadCalls = [];
  const shown = [];
  const warmups = [];
  let nextFrameId = 1;
  const currentMesh = { userData: { lastLyricProgress: 0.42, age: 0.2 } };
  const sandbox = {
    fx: { lyricDisplayMode: 'cinema' },
    stageLyrics: { currentIdx: 12, current: currentMesh, transitionLineStep: 1 },
    lyricsLines: [{ text: 'a' }],
    stageLyricOptionRefreshFrame: 0,
    stageLyricOptionApplyFrame: 0,
    stageLyricOptionRefreshToken: 0,
    requestAnimationFrame(fn) {
      const id = nextFrameId++;
      frameCallbacks.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) { frameCallbacks.delete(id); },
    normalizeLyricDisplayMode(value) { return value; },
    buildStageLyricDisplayPayload(index, options) {
      payloadCalls.push({ index, options });
      return { key: 'light', trackLightweight: !!(options && options.lightweightTrack) };
    },
    showStageLine(payload, redrawOnly) {
      shown.push({ payload, redrawOnly });
      sandbox.stageLyrics.current = { userData: { age: 0 } };
      return true;
    },
    updateLyricMeshProgress(_mesh, progress) { sandbox.progress = progress; },
    scheduleStageLyricFullTrackWarmup(reason, delay) { warmups.push({ reason, delay }); },
  };
  const functions = [
    'cancelStageLyricOptionRefresh',
    'flushStageLyricOptionRefresh',
    'scheduleStageLyricOptionRefresh',
  ].map((name) => readFunction(source, name));
  vm.runInNewContext(functions.join(';'), sandbox);

  vm.runInNewContext('scheduleStageLyricOptionRefresh(); scheduleStageLyricOptionRefresh();', sandbox);
  assert.equal(frameCallbacks.size, 1, '快速连点只能保留最后一次刷新');
  const paintFrame = [...frameCallbacks.values()][0];
  frameCallbacks.clear();
  paintFrame();
  assert.equal(frameCallbacks.size, 1, '先让按钮完成一帧绘制，再重建轻量歌词');
  const applyFrame = [...frameCallbacks.values()][0];
  frameCallbacks.clear();
  applyFrame();

  assert.equal(payloadCalls.length, 1);
  assert.equal(payloadCalls[0].index, 12);
  assert.equal(payloadCalls[0].options.lightweightTrack, true);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].redrawOnly, true);
  assert.equal(sandbox.progress, 0.42);
  assert.deepEqual(warmups, [{ reason: 'option-switch-upgrade', delay: 120 }]);
});

test('动画参数更新覆盖当前、过渡和预热歌词材质', () => {
  const source = read('public/js/modules/02-visual/14-stage-lyrics-rendering.js');
  const profile = {
    style: 'glitch', sweep: 0.54, shimmer: 0.28, glitch: 1,
    glitchSlice: 0.72, glitchChroma: 0.86, glitchRate: 1.2, edgeBoost: 1.18,
  };
  function material() {
    return { uniforms: {
      uSweep: { value: 0 }, uShimmer: { value: 0 }, uGlitch: { value: 0 },
      uGlitchSlice: { value: 0 }, uGlitchChroma: { value: 0 },
      uGlitchRate: { value: 1 }, uEdgeBoost: { value: 1 }, uGlitchBurst: { value: 0.8 },
    } };
  }
  function mesh() {
    const textMat = material();
    const rowMat = material();
    return {
      userData: {
        motionStyle: 'float', glitchBurst: 0.9, glitchHold: 1,
        lyric: { textMat, rowLayers: [{ mat: rowMat }] },
      },
      textMat,
      rowMat,
    };
  }
  const current = mesh();
  const outgoing = mesh();
  const prewarm = mesh();
  const singlePrewarm = mesh();
  singlePrewarm.userData.payload = { key: 'next-line' };
  const sandbox = {
    stageLyrics: { current, outgoing: [outgoing], parked: null },
    stageLyricPrewarm: { mesh: prewarm },
    stageLyricSingleLinePrewarm: {
      items: { 'old-style-key': { mesh: singlePrewarm, payload: singlePrewarm.userData.payload } },
      order: ['old-style-key'],
    },
    lyricMotionProfile() { return profile; },
    stageLyricPreparedKey(payload) { return `new-style:${payload.key}`; },
  };
  vm.runInNewContext([
    readFunction(source, 'applyLyricMotionProfileToMaterial'),
    readFunction(source, 'applyLyricMotionProfileToMesh'),
    readFunction(source, 'applyStageLyricMotionStyleInPlace'),
  ].join(';'), sandbox);
  vm.runInNewContext('updated = applyStageLyricMotionStyleInPlace()', sandbox);

  assert.equal(sandbox.updated, 4);
  for (const target of [current, outgoing, prewarm, singlePrewarm]) {
    assert.equal(target.userData.motionStyle, 'glitch');
    assert.equal(target.userData.glitchBurst, 0);
    assert.equal(target.textMat.uniforms.uGlitch.value, 1);
    assert.equal(target.rowMat.uniforms.uSweep.value, 0.54);
    assert.equal(target.rowMat.uniforms.uGlitchBurst.value, 0);
  }
  assert.ok(sandbox.stageLyricSingleLinePrewarm.items['new-style:next-line']);
  assert.deepEqual(Array.from(sandbox.stageLyricSingleLinePrewarm.order), ['new-style:next-line']);
});
