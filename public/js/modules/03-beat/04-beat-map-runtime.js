function smoothBeatMapHandoff(songId, map, token, song) {
  if (!map) return;
  showBeatChip('节奏缓冲中…');
  var wait = Math.max(260, Math.min(720, 340 + (beatPulse + beatCam.punch) * 260));
  var apply = function () {
    if (token !== beatMapToken) return;
    if (map.partial) {
      // 前30秒半图只装到当前播放, 不进内存缓存不落盘; 全曲图已进缓存时直接丢弃;
      // chip/toast 留给还在跑的全曲流程
      if (beatMapCache[songId]) return;
      currentBeatMap = map;
      applyCinemaProfileFromBeatMap(map);
      syncBeatMapPlaybackCursor(audio ? audio.currentTime : 0, true);
      notifyDesktopLyricsBeatMapReady();
      return;
    }
    beatMapCache[songId] = map;
    currentBeatMap = map;
    applyCinemaProfileFromBeatMap(map);
    var t = audio ? audio.currentTime : 0;
    syncBeatMapPlaybackCursor(t, true);
    hideBeatChip();
    notifyDesktopLyricsBeatMapReady();
    showToast('节奏分析完成: ' + (map.visualBeatCount || (map.cameraBeats && map.cameraBeats.length) || 0) + ' 个视觉主拍');
    writeBeatDiskCache(songId, map, song, 'mr');
    scheduleQueueBeatPrefetch(currentIdx, 1000);
  };
  scheduleVisualApply(apply, wait, 460);
}

function applyBeatMapCacheForCurrent(songId, map, token, message) {
  if (!songId || !map || token !== beatMapToken) return false;
  beatMapCache[songId] = map;
  currentBeatMap = map;
  applyCinemaProfileFromBeatMap(map);
  syncBeatMapPlaybackCursor(audio ? audio.currentTime : 0, true);
  hideBeatChip();
  notifyDesktopLyricsBeatMapReady();
  if (message) console.log(message, songId, map.visualBeatCount || 0);
  scheduleQueueBeatPrefetch(currentIdx, 1000);
  return true;
}

// 每帧调用 — 按 beatMap 触发预演鼓点
function syncBeatMapPlaybackCursor(t, preserveVisualState) {
  if (djMode.active) {
    syncPodcastDjMapCursor(t, preserveVisualState);
    return;
  }
  t = isFinite(t) ? t : 0;
  beatMapNextIdx = 0;
  beatGridExtraMap = null; // seek/换图后外推游标作废, 下次越过末尾时重新初始化
  var pulseEvents = currentBeatMap && (currentBeatMap.pulseBeats || currentBeatMap.kicks);
  if (pulseEvents) {
    while (beatMapNextIdx < pulseEvents.length && beatEventTime(pulseEvents[beatMapNextIdx]) < t) beatMapNextIdx++;
  }
  if (preserveVisualState) alignBeatCameraCursorToTime(t);
  else syncBeatCameraToTime(t);
}

function syncPodcastDjMapCursor(t, preserveVisualState) {
  t = isFinite(t) ? t : 0;
  djBeatMapNextIdx = 0;
  djBeatPulseNextIdx = 0;
  if (currentDjBeatMap) {
    var beatEvents = currentDjBeatMap.cameraBeats || currentDjBeatMap.beats || currentDjBeatMap.kicks || [];
    var camSyncTime = Math.max(0, t - 0.025);
    while (djBeatMapNextIdx < beatEvents.length && beatEventTime(beatEvents[djBeatMapNextIdx]) < camSyncTime) djBeatMapNextIdx++;
    var pulseEvents = currentDjBeatMap.pulseBeats || currentDjBeatMap.kicks || [];
    var pulseSyncTime = Math.max(0, t - 0.035);
    while (djBeatPulseNextIdx < pulseEvents.length && beatEventTime(pulseEvents[djBeatPulseNextIdx]) < pulseSyncTime) djBeatPulseNextIdx++;
  }
  if (!preserveVisualState) resetBeatCameraSync(t);
}

function tickPodcastDjBeatMap() {
  if (!djMode.active || !currentDjBeatMap || !audio || audio.paused) return;
  var t = audio.currentTime || 0;
  if (currentDjBeatMap.partialUntilSec && t > currentDjBeatMap.partialUntilSec + beatCam.lookahead) return;
  var beatEvents = currentDjBeatMap.cameraBeats || currentDjBeatMap.beats || currentDjBeatMap.kicks || [];
  var pulseEvents = currentDjBeatMap.pulseBeats || currentDjBeatMap.kicks || [];
  while (djBeatMapNextIdx < beatEvents.length) {
    var beat = beatEvents[djBeatMapNextIdx];
    var beatTime = beatEventTime(beat);
    if (beatTime > t + beatCam.lookahead) break;
    scheduleBeatCamera(beat, 'djmap');
    djBeatMapNextIdx++;
  }
  while (djBeatPulseNextIdx < pulseEvents.length && beatEventTime(pulseEvents[djBeatPulseNextIdx]) <= t) {
    triggerScheduledBeat(pulseEvents[djBeatPulseNextIdx]);
    djBeatPulseNextIdx++;
  }
}

function tickBeatMap() {
  if (djMode.active) return;
  if (!currentBeatMap || !audio || audio.paused) return;
  var t = audio.currentTime;
  var beatEvents = currentBeatMap.cameraBeats || currentBeatMap.beats || currentBeatMap.kicks || [];
  var pulseEvents = currentBeatMap.pulseBeats || currentBeatMap.kicks || [];
  var gridTimingLocked = currentBeatMap.tempoSource === 'music-tempo' && beatEvents.length >= 4;
  var liveFreshWindow = Math.max(0.50, rtBeat.tempoGap ? rtBeat.tempoGap * 1.18 : 0.50);
  var realtimeHasLock = rtBeat.lastHitAt > 0 && (t - rtBeat.lastHitAt) < liveFreshWindow;
  while (beatCam.nextIdx < beatEvents.length) {
    var beat = beatEvents[beatCam.nextIdx];
    var beatTime = typeof beat === 'number' ? beat : beat.time;
    if (beatTime > t + beatCam.lookahead) break;
    if (gridTimingLocked || !realtimeHasLock) scheduleBeatCamera(beat, 'map');
    beatCam.nextIdx++;
  }
  while (beatMapNextIdx < pulseEvents.length && beatEventTime(pulseEvents[beatMapNextIdx]) <= t) {
    // 触发预演冲击
    if (gridTimingLocked || !realtimeHasLock) triggerScheduledBeat(pulseEvents[beatMapNextIdx]);
    beatMapNextIdx++;
  }
  // —— 半图网格外推: 前30秒 partial 图播过最后一个拍点后, 按 gridStep 合成幽灵拍续上律动, 直到全曲图 handoff 换掉 currentBeatMap 自然停止 ——
  if (BEAT_GRID_EXTRAPOLATE && currentBeatMap.partial === true && currentBeatMap.gridStep > 0 &&
      pulseEvents.length && beatMapNextIdx >= pulseEvents.length) {
    if (beatGridExtraMap !== currentBeatMap) {
      beatGridExtraMap = currentBeatMap;
      beatGridExtraN = 0;
      beatGridExtraNextTime = beatEventTime(pulseEvents[pulseEvents.length - 1]) + currentBeatMap.gridStep;
      var geSum = 0, geCount = 0;
      for (var ge = Math.max(0, pulseEvents.length - 5); ge < pulseEvents.length; ge++) {
        var geBeat = pulseEvents[ge];
        geSum += typeof geBeat === 'number' ? 0.42 : (geBeat && geBeat.strength != null ? geBeat.strength : 0.42);
        geCount++;
      }
      beatGridExtraStrength = (geCount ? geSum / geCount : 0.42) * 0.85;
    }
    // seek/页面隐藏恢复后游标落后一大截: 相位不变快进, 不在同一帧补发陈旧幽灵拍
    if (t - beatGridExtraNextTime > currentBeatMap.gridStep * 1.5) {
      var geSkip = Math.floor((t - beatGridExtraNextTime) / currentBeatMap.gridStep);
      beatGridExtraNextTime += geSkip * currentBeatMap.gridStep;
      beatGridExtraN += geSkip;
    }
    while (beatGridExtraNextTime <= t && beatGridExtraN < 24) {   // 硬上限: 盲网格最多外推 24 拍, 防节奏变化后无限偏拍
      beatGridExtraN++;
      // 实时引擎正锁拍时让位(与上方防双触发规则一致), 幽灵拍时间照常推进保持相位
      if (!realtimeHasLock) {
        var geConf = Math.pow(0.92, beatGridExtraN);
        // strength 也随置信衰减(若只衰减 impact, 强律动歌 strength≥0.52 会永远过入口门, 淡不出去)
        var geStrength = beatGridExtraStrength * Math.max(0.45, geConf);
        triggerScheduledBeat({
          time: beatGridExtraNextTime,
          strength: geStrength,
          impact: geStrength * geConf,
          confidence: geConf,
          ghost: true
        });
      }
      beatGridExtraNextTime += currentBeatMap.gridStep;
    }
  }
}
// 半图网格外推总开关, 出问题置 false 即完全回退到外推前行为
var BEAT_GRID_EXTRAPOLATE = true;
var beatGridExtraMap = null;      // 绑定的 partial 图对象, 换图/seek 后重新初始化
var beatGridExtraNextTime = 0;    // 下一个幽灵拍时间
var beatGridExtraN = 0;           // 已外推拍数(置信 0.92^n 衰减)
var beatGridExtraStrength = 0.42; // 最近5个真拍 strength 均值 * 0.85

function triggerScheduledBeat(beat) {
  var strength = typeof beat === 'number' ? 0.42 : Math.max(0, Math.min(1, beat && beat.strength != null ? beat.strength : 0.42));
  var impact = typeof beat === 'number' ? strength : Math.max(0, Math.min(1, beat && beat.impact != null ? beat.impact : strength));
  if (impact < 0.18 && strength < 0.52) return;
  if ((cinemaTrackProfile.scale || 1) < 0.52 && impact < 0.46 && strength < 0.74) return;
  var body = typeof beat === 'number' ? 0 : Math.max(0, Math.min(1, beat && beat.body != null ? beat.body : 0));
  var combo = typeof beat === 'number' ? null : beat && beat.combo;
  var comboLift = combo === 'downbeat' ? 0.08 : (combo === 'drop' ? 0.04 : 0);
  var dynScale = cameraDynamicsScale(0.88 + impact * 0.16);
  var djPulse = beat && beat.dj;
  var pulse = (0.14 + strength * 0.46 + impact * 0.18 + body * 0.08 + comboLift) * dynScale;
  if (djPulse) pulse = (0.12 + strength * 0.50 + impact * 0.28 + comboLift * 0.70) * clampRange(dynScale, 0.78, 1.18);
  pulse = Math.min(djPulse ? 0.92 : 0.78, pulse);
  scheduledBeatPulse = Math.max(scheduledBeatPulse, pulse);
  scheduledBeatFlag = true;
}
var scheduledBeatPulse = 0;
var scheduledBeatFlag = false;

