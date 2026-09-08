'use strict';

const assert = require('node:assert/strict');

const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9223';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cdpEvaluate(expression) {
  const targets = await (await fetch(cdpBase + '/json/list')).json();
  const page = targets.find((target) => target.type === 'page' && /Mineradio/.test(target.title || ''));
  assert.ok(page && page.webSocketDebuggerUrl, '未找到带 CDP 的 Mineradio Electron 页面');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const response = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP Runtime.evaluate 超时')), 15000);
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id !== 1) return;
      clearTimeout(timeout);
      resolve(payload);
    });
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true }
    }));
  });
  socket.close();
  if (response.result && response.result.exceptionDetails) throw new Error(response.result.exceptionDetails.text || 'Electron 页面执行失败');
  return response.result.result.value;
}

const probeExpression = `(() => {
  const savedFx = {
    particleLyrics: fx.particleLyrics,
    lyricDisplayMode: fx.lyricDisplayMode,
    lyricTransitionStyle: fx.lyricTransitionStyle,
    lyricTransitionSpeed: fx.lyricTransitionSpeed,
    lyricCustomLineCount: fx.lyricCustomLineCount,
    lyricVerticalFloat: fx.lyricVerticalFloat,
    lyricTranslationMode: fx.lyricTranslationMode
  };
  const savedStage = {
    current: stageLyrics.current,
    outgoing: stageLyrics.outgoing.slice(),
    currentText: stageLyrics.currentText,
    currentPayload: stageLyrics.currentPayload,
    currentDisplayKey: stageLyrics.currentDisplayKey,
    currentIdx: stageLyrics.currentIdx,
    transitionLineStep: stageLyrics.transitionLineStep
  };
  const originalBuild = buildLyricMesh;
  const detach = (mesh) => { if (mesh && mesh.parent) mesh.parent.remove(mesh); };
  const dispose = (mesh) => { if (!mesh) return; detach(mesh); disposeLyricMesh(mesh); };
  const resetProbeMeshes = () => {
    dispose(stageLyrics.current);
    (stageLyrics.outgoing || []).forEach(dispose);
    stageLyrics.current = null;
    stageLyrics.outgoing = [];
    stageLyrics.currentText = '';
    stageLyrics.currentPayload = null;
    stageLyrics.currentDisplayKey = '';
    stageLyrics.currentIdx = -1;
    stageLyrics.transitionLineStep = 1;
  };
  const trackEntries = ['Before transition', 'First transition', 'Second transition', 'After transition', 'Far context'].flatMap((text, lineIndex) => [
    { text: text + ' line', role: 'current', alpha: 1, scale: 1, lineIndex, virtualIndex: lyricPrimaryVirtualIndex(lineIndex) },
    { text: 'Translation ' + (lineIndex + 1), role: 'translation', parentRole: 'current', translationLine: true, alpha: 0.58, scale: 0.72, lineIndex, parentIndex: lineIndex, virtualIndex: lyricTranslationVirtualIndex(lineIndex) }
  ]);
  const payload = (mode, suffix, text, index) => ({
    mode,
    key: 'electron-transition-probe|' + mode + '|' + suffix,
    activeLine: index,
    entries: mode === 'single'
      ? [{ text, role: 'current', alpha: 1, scale: 1, lineIndex: index }]
      : trackEntries,
    trackIndex: index,
    trackKey: 'electron-transition-probe',
    trackEntries: mode === 'single' ? [] : trackEntries,
    trackStart: mode === 'single' ? index : 0,
    trackEnd: mode === 'single' ? index : 4
  });
  const materialOpacity = (mesh) => {
    const mat = mesh && mesh.userData && mesh.userData.lyric && mesh.userData.lyric.textMat;
    return mat && mat.uniforms && mat.uniforms.uOpacity ? Number(mat.uniforms.uOpacity.value) || 0 : 0;
  };
  const materialBlur = (mesh) => {
    const mat = mesh && mesh.userData && mesh.userData.lyric && mesh.userData.lyric.textMat;
    return mat && mat.uniforms && mat.uniforms.uTransitionBlur ? Number(mat.uniforms.uTransitionBlur.value) || 0 : 0;
  };
  const rowSnapshot = (mesh) => {
    const data = mesh && mesh.userData && mesh.userData.lyric;
    const rows = data && data.rowLayers || [];
    return rows.map((row) => ({
      lineIndex: row.lineIndex,
      active: !!row.isActive,
      focus: !!row.isActive || (!!row.isTranslation && Number(row.parentIndex) === Number(data.trackTargetLineIndex)),
      translation: !!row.isTranslation,
      x: row.mesh ? Number(row.mesh.position.x.toFixed(4)) : null,
      y: row.mesh ? Number(row.mesh.position.y.toFixed(4)) : null,
      z: row.mesh ? Number(row.mesh.position.z.toFixed(4)) : null,
      scale: row.mesh ? Number(row.mesh.scale.x.toFixed(4)) : null,
      blur: row.mat && row.mat.uniforms && row.mat.uniforms.uTransitionBlur ? Number(row.mat.uniforms.uTransitionBlur.value.toFixed(4)) : 0
    }));
  };
  const results = [];
  let builds = 0;
  try {
    fx.particleLyrics = true;
    fx.lyricTransitionSpeed = 1;
    fx.lyricCustomLineCount = 5;
    fx.lyricVerticalFloat = false;
    fx.lyricTranslationMode = 'multi';
    window.buildLyricMesh = function () { builds += 1; return originalBuild.apply(this, arguments); };
    ['original', 'crossfade', 'rise', 'slide', 'focus'].forEach((style) => {
      ['single', 'dual', 'triple', 'custom'].forEach((mode) => {
        resetProbeMeshes();
        fx.lyricDisplayMode = mode;
        fx.lyricTransitionStyle = style;
        showStageLine(payload(mode, style + '-a', 'First transition line', 1), false);
        updateStageLyrics3D(0.03);
        const firstMesh = stageLyrics.current;
        const buildsBeforeBoundary = builds;
        showStageLine(payload(mode, style + '-b', 'Second transition line', 2), false);
        const buildsBeforeFrames = builds;
        const createdIncomingRows = rowSnapshot(stageLyrics.current);
        updateStageLyrics3D(0.016);
        const firstFrameIncomingRows = rowSnapshot(stageLyrics.current);
        updateStageLyrics3D(0.016);
        updateStageLyrics3D(0.016);
        const outgoing = stageLyrics.outgoing[0];
        const current = stageLyrics.current;
        const transitionOutgoingOpacity = materialOpacity(outgoing);
        const transitionIncomingOpacity = materialOpacity(current);
        const transitionOutgoingBlur = materialBlur(outgoing);
        const transitionIncomingBlur = materialBlur(current);
        const transitionIncomingRows = rowSnapshot(current);
        const transitionOutgoingRows = rowSnapshot(outgoing);
        const trajectory = [];
        const meshSnapshot = (mesh) => {
          const data = mesh && mesh.userData && mesh.userData.lyric;
          const rows = data && data.rowLayers || [];
          const focus = rows.find((row) => row.isActive);
          const translation = rows.find((row) => row.isTranslation && Number(row.parentIndex) === Number(data.trackTargetLineIndex));
          const context = rows.find((row) => !row.isTranslation && !row.isActive);
          const read = (row) => row && row.mesh ? {
            x: Number(row.mesh.position.x.toFixed(6)),
            y: Number(row.mesh.position.y.toFixed(6)),
            z: Number(row.mesh.position.z.toFixed(6)),
            scale: Number(row.mesh.scale.x.toFixed(6))
          } : null;
          return { focus: read(focus), translation: read(translation), context: read(context) };
        };
        for (let frame = 0; frame < 30; frame += 1) {
          updateStageLyrics3D(0.016);
          trajectory.push({ incoming: meshSnapshot(current), outgoing: meshSnapshot(outgoing) });
        }
        const rootBefore = outgoing ? outgoing.position.clone() : null;
        updateStageLyrics3D(0.035);
        updateStageLyrics3D(0.035);
        const rootAfter = outgoing ? outgoing.position.clone() : null;
        results.push({
          style,
          mode,
          reusedCurrent: stageLyrics.current === firstMesh,
          outgoing: !!outgoing,
          incoming: !!current,
          outgoingOpacity: transitionOutgoingOpacity,
          incomingOpacity: transitionIncomingOpacity,
          outgoingBlur: transitionOutgoingBlur,
          incomingBlur: transitionIncomingBlur,
          incomingX: current ? Number(current.position.x.toFixed(4)) : null,
          incomingZ: current ? Number(current.position.z.toFixed(4)) : null,
          incomingRootY: current ? Number(current.position.y.toFixed(4)) : null,
          outgoingRootDrift: rootBefore && rootAfter ? Number(rootBefore.distanceTo(rootAfter).toFixed(5)) : null,
          incomingRows: transitionIncomingRows,
          outgoingRows: transitionOutgoingRows,
          createdIncomingRows,
          firstFrameIncomingRows,
          trajectory,
          buildsForBoundary: builds - buildsBeforeBoundary,
          builtDuringFrames: builds - buildsBeforeFrames
        });
      });
    });
  } finally {
    window.buildLyricMesh = originalBuild;
    resetProbeMeshes();
    stageLyrics.current = savedStage.current;
    stageLyrics.outgoing = savedStage.outgoing;
    stageLyrics.currentText = savedStage.currentText;
    stageLyrics.currentPayload = savedStage.currentPayload;
    stageLyrics.currentDisplayKey = savedStage.currentDisplayKey;
    stageLyrics.currentIdx = savedStage.currentIdx;
    stageLyrics.transitionLineStep = savedStage.transitionLineStep;
    [savedStage.current].concat(savedStage.outgoing).forEach((mesh) => {
      if (mesh && !mesh.parent && stageLyrics.group) stageLyrics.group.add(mesh);
    });
    Object.assign(fx, savedFx);
  }
  return results;
})()`;

(async () => {
  await cdpEvaluate('location.reload()');
  await wait(1500);
  const results = await cdpEvaluate(probeExpression);
  assert.equal(results.length, 20, '原始切换与四种新增效果必须各覆盖单行、双行、三行和自定义多行');
  const baselineRows = new Map(results.filter((result) => result.style === 'crossfade').map((result) => [result.mode, result.incomingRows]));
  const baselineTrajectories = new Map(results.filter((result) => result.style === 'crossfade').map((result) => [result.mode, result.trajectory]));
  for (const result of results) {
    const isMulti = result.mode !== 'single';
    if (result.style === 'original' && isMulti) {
      assert.equal(result.reusedCurrent, true, '原始/多行必须复用 #111 当前轨道 mesh');
      assert.equal(result.outgoing, false, '原始/多行不得被新增动效强制创建 outgoing mesh');
      assert.equal(result.buildsForBoundary, 0, '原始/多行换句不得重新构建歌词 mesh');
      assert.equal(result.builtDuringFrames, 0, '原始/多行逐帧不得重建歌词 mesh');
      continue;
    }
    assert.equal(result.outgoing, true, result.style + '/' + result.mode + ' 缺少 outgoing mesh');
    assert.equal(result.incoming, true, result.style + '/' + result.mode + ' 缺少 incoming mesh');
    assert.ok(result.outgoingOpacity > 0 && result.incomingOpacity > 0, result.style + '/' + result.mode + ' 未形成可见交叉窗口');
    assert.equal(result.builtDuringFrames, 0, result.style + '/' + result.mode + ' 在逐帧转场中重建了 mesh');
    if (result.style === 'original' || result.style === 'crossfade') {
      assert.equal(result.outgoingBlur, 0, result.style + ' 不应增加新失焦');
      assert.equal(result.incomingBlur, 0, result.style + ' 不应增加新失焦');
    } else {
      assert.ok(result.outgoingBlur > 0 || result.incomingBlur > 0, result.style + '/' + result.mode + ' 未应用转场失焦');
    }
    if (isMulti) {
      assert.ok(result.outgoingRootDrift <= 0.001, result.style + '/' + result.mode + ' 多行 outgoing root 不得与轨道滚动叠加移动');
      for (const row of result.incomingRows.concat(result.outgoingRows)) {
        if (!row.focus) assert.equal(row.blur, 0, result.style + '/' + result.mode + ' 上下文行不得继承焦点行 blur');
      }
      if (result.style !== 'crossfade') {
        assert.ok(result.incomingRows.some((row) => row.active && row.blur > 0), result.style + '/' + result.mode + ' 多行焦点行必须保留可辨识的局部动效');
        const primaryFocus = result.incomingRows.find((row) => row.active);
        const primaryBaseline = (baselineRows.get(result.mode) || []).find((row) => row.active);
        assert.ok(primaryFocus && primaryBaseline, result.style + '/' + result.mode + ' 必须保留当前原文焦点层');
        const baseTrajectory = baselineTrajectories.get(result.mode) || [];
        const createdFocus = result.createdIncomingRows.find((row) => row.active);
        const firstFrameFocus = result.firstFrameIncomingRows.find((row) => row.active);
        const createdTranslation = result.createdIncomingRows.find((row) => row.translation && row.focus);
        const firstFrameTranslation = result.firstFrameIncomingRows.find((row) => row.translation && row.focus);
        assert.ok(createdFocus && firstFrameFocus, result.style + '/' + result.mode + ' 必须有创建态与首帧焦点原文');
        assert.ok(createdTranslation && firstFrameTranslation, result.style + '/' + result.mode + ' 必须有创建态与首帧当前译文');
        const initialJump = (axis) => Math.abs(Number(firstFrameFocus[axis]) - Number(createdFocus[axis]));
        if (result.style === 'rise') {
          assert.ok(initialJump('y') <= 0.012, result.style + '/' + result.mode + ' 上浮焦点原文首帧不能从基础位置跳到转场起始位置');
        } else if (result.style === 'slide') {
          assert.ok(initialJump('x') <= 0.015, result.style + '/' + result.mode + ' 分层焦点原文首帧不能突然横移: ' + initialJump('x').toFixed(6) + ' ' + JSON.stringify({ created: createdFocus, first: firstFrameFocus }));
        } else if (result.style === 'focus') {
          assert.ok(initialJump('scale') <= 0.006 && initialJump('z') <= 0.008,
            result.style + '/' + result.mode + ' 镜头推进首帧不能突然缩放或推近');
        }
        const localTrajectoryDelta = (axis) => Math.max(...result.trajectory.map((frame, index) => {
          const actual = frame.incoming && frame.incoming.focus && Number(frame.incoming.focus[axis]);
          const baseline = baseTrajectory[index] && baseTrajectory[index].incoming && baseTrajectory[index].incoming.focus && Number(baseTrajectory[index].incoming.focus[axis]);
          return Number.isFinite(actual) && Number.isFinite(baseline) ? Math.abs(actual - baseline) : 0;
        }));
        if (result.style === 'rise') {
          assert.ok(localTrajectoryDelta('y') >= 0.07,
            '上浮淡入的多行焦点原文整段轨迹必须有可辨识的纵向位移，不能只剩肉眼不可见的参数差');
        } else if (result.style === 'slide') {
          assert.ok(localTrajectoryDelta('x') >= 0.11,
            '分层掠过的多行焦点原文整段轨迹必须有可辨识的横向位移，不能退化为普通叠化');
        } else if (result.style === 'focus') {
          assert.ok(localTrajectoryDelta('scale') >= 0.025 || localTrajectoryDelta('z') >= 0.04,
            '镜头推进的多行焦点原文整段轨迹必须有可辨识的缩放或景深推进，不能退化为普通叠化');
        }
        const translatedFocus = result.incomingRows.find((row) => row.translation && row.focus);
        const baselineTranslation = (baselineRows.get(result.mode) || []).find((row) => row.translation && row.focus);
        assert.ok(translatedFocus && baselineTranslation, result.style + '/' + result.mode + ' 必须保留当前译文焦点层');
        const translationMotion = Math.abs(translatedFocus.x - baselineTranslation.x) + Math.abs(translatedFocus.y - baselineTranslation.y) + Math.abs(translatedFocus.z - baselineTranslation.z) + Math.abs(translatedFocus.scale - baselineTranslation.scale);
        assert.ok(translationMotion > 0.001, result.style + '/' + result.mode + ' 当前译文必须跟随焦点行，不得作为上下文硬跳');

        const rowFrameDistance = (before, after) => {
          if (!before || !after) return 0;
          return Math.hypot(
            Number(after.x) - Number(before.x),
            Number(after.y) - Number(before.y),
            Number(after.z) - Number(before.z),
            Number(after.scale) - Number(before.scale)
          );
        };
        const maxRowFrameDistance = (role) => {
          const samples = [{ incoming: {
            focus: createdFocus,
            translation: createdTranslation,
            context: result.createdIncomingRows.find((row) => !row.translation && !row.active)
          } }, { incoming: {
            focus: firstFrameFocus,
            translation: firstFrameTranslation,
            context: result.firstFrameIncomingRows.find((row) => !row.translation && !row.active)
          } }].concat(result.trajectory);
          const distances = samples.slice(1).map((frame, index) => rowFrameDistance(samples[index].incoming[role], frame.incoming[role]));
          const index = distances.indexOf(Math.max(...distances));
          return { distance: distances[index], index, from: samples[index].incoming[role], to: samples[index + 1].incoming[role] };
        };
        const focusFrameDistance = maxRowFrameDistance('focus');
        const translationFrameDistance = maxRowFrameDistance('translation');
        const contextFrameDistance = maxRowFrameDistance('context');
        assert.ok(focusFrameDistance.distance <= 0.016,
          result.style + '/' + result.mode + ' 焦点原文的逐帧轨迹出现抢位跳变: ' + JSON.stringify(focusFrameDistance));
        assert.ok(translationFrameDistance.distance <= 0.016,
          result.style + '/' + result.mode + ' 当前译文的逐帧轨迹出现抢位跳变: ' + JSON.stringify(translationFrameDistance));
        assert.ok(contextFrameDistance.distance <= 0.030,
          result.style + '/' + result.mode + ' 上下文行不应在一次 16ms 调度内偏离既有轨道漂移上限: ' + JSON.stringify(contextFrameDistance));
      }
    }
  }
  console.log(JSON.stringify({ ok: true, cdpBase, results }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
