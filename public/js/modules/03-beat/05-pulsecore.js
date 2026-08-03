// PulseCore 律动引擎(融合层)
// 把三种拍源(普通 beatmap / 播客 DJ beatmap / 实时引擎 rtBeat)统一成一份
// 每帧原地更新的律动状态 pulseCore,供渲染层读取。全帧率无关:所有包络用
// value *= Math.pow(0.5, dt/halflife) 的半衰期形式驱动。每帧路径不分配对象/数组。
//
// —— 手动自测(120BPM, gridStep=0.5, 不需要跑,给 review 用) ——
// 设 conf=0.9(music-tempo),连续两拍 downbeat:
//   1) pulseCoreTrigger(0.9, 0.9, 0.1, 0.05, 'downbeat', 10.0)
//      环形数组只有 1 个样本 → p75≈0.9 → norm≈0.9/0.9=1.0,downbeat ×1.15 → ~1.15
//      kind=low(0.9×1.2 最大) → pulseCore.kick↑≈1.15, pulseCore.punch↑≈1.15
//   2) 半拍后(t=10.25)phase≈0.5 → pump=pow(1-0.5,2.2)*0.9*strengthEMA≈0.22*strengthEMA
//      kick 半衰期=clamp(0.5*0.35,0.09,0.28)=0.175s,10.25 时 kick 已衰减 ~pow(.5,.25/.175)≈0.37×
//   3) pulseCoreTrigger(0.9, 0.9, 0.1, 0.05, 'downbeat', 10.5)
//      kick 再次抬到 ~1.15;punch 同步;跨拍瞬间 phase 回 0,pump 归 0 后随 phase 增长重新爬升。
// 期望走向:kick/punch 在每拍瞬间跳到 ~1.15 再指数衰减;pump 在拍间从 0 平滑升到拍末峰值(锯齿形)。

var pulseCore = { ready:false, source:'none', bpm:0, phase:0, conf:0, kick:0, snare:0, hat:0, punch:0, pump:0, swell:0, lastPulseAt:0, lastPulseKind:'', lastPulseStrength:0, lastPulseSustained:false };

// 可调参数集中在这里(半衰期/系数全放这,便于运行时调)
var PULSECORE_TUNING = {
  ringSize: 24,
  normFloor: 0.15,        // norm 归一化时 p75 的下限,防止极弱段落爆表
  normMax: 1.6,           // norm 上限
  downbeatBoost: 1.15,    // downbeat 额外增益
  lowWeight: 1.2,         // low 签名分类优先权重
  cooldownSec: 0.08,      // 同 kind 冷却
  sustainDelay: 0.25,     // 长短判定延迟
  sustainRatio: 0.6,      // 当前签名 ≥ 峰值×此比例 → 长音
  sustainSwellGain: 0.4,  // 长音注入 swell 的系数
  sustainHalfMul: 2.2,    // 长音把该包络半衰期放大倍数
  // 2026-07-05 用户反馈"跳得很急":衰减尾巴整体拉长(节拍还在,落下去是呼吸不是抽搐)
  kickHalfFactor: 0.3, kickHalfMin: 0.10, kickHalfMax: 0.24,   // 收短:EDM 下过长会把低频钉在封顶不回落,泵感全无
  snareHalf: 0.2,
  hatHalf: 0.12,
  punchHalfBase: 0.24,
  strengthEmaTau: 2.0,    // pump 用的最近拍强度 EMA 衰减
  strengthEmaBlend: 0.35, // 触发时 EMA 向新 norm 靠拢比例
  swellAttackTau: 0.9, swellReleaseTau: 1.6, swellInjectTau: 1.8,
  swellPunchClean: 0.5,   // swell 目标 = audioEnergy - punch×此系数
  pumpPhaseExp: 2.2,
  confMusicTempo: 0.95, confMap: 0.75, confPartial: 0.5,
  confLiveScale: 0.8, liveConfMin: 0.25,
  seekBack: 1.5, seekFwd: 3.0, // 换歌/seek 突变阈值(秒)
  maxCrossTrigger: 2       // 一帧跨拍超过此数视为跳播,不触发脉冲
};

// —— 模块内状态(全部预建,禁止每帧分配)——
var pcActiveMap = null;          // 当前跟踪的 beatmap 对象(引用变化=换歌)
var pcActiveBeats = null;        // 其 .beats 数组
var pcCursor = -1;               // 上一拍索引(顺播 O(1) 前进)
var pcGridStep = 0.5;            // 当前每拍秒数(map 用 gridStep/中位,live 用 tempoGap)
var pcLastT = 0;                 // 上一帧 audio.currentTime(seek 检测)
var pcHalfKick = 0.175, pcHalfSnare = 0.12, pcHalfHat = 0.05; // 当前生效半衰期(长音会放大)
var pcStrengthEMA = 0;
var pcSwellBase = 0;             // swell 主体(attack/release 趋近 audioEnergy)
var pcSwellInject = 0;           // 长音注入的额外 swell(τ=1.8 自然衰减)

var pcRing = [];                 // 最近 strengthRaw 环形数组
var pcRingHead = 0, pcRingCount = 0;
for (var _i = 0; _i < PULSECORE_TUNING.ringSize; _i++) pcRing.push(0);
var pcSortScratch = [];          // percentile 排序用暂存(复用,不每帧分配)
for (var _i2 = 0; _i2 < PULSECORE_TUNING.ringSize; _i2++) pcSortScratch.push(0);
var pcStepScratch = [];          // 计算中位拍距用(复用)
for (var _i3 = 0; _i3 < 33; _i3++) pcStepScratch.push(0);

// 待长短判定队列(最多 4,复用对象)
var pcPending = [];
for (var _i4 = 0; _i4 < 4; _i4++) pcPending.push({ active:false, kind:'', env:'', norm:0, peak:0, dueAt:0 });

function pcNumCompare(a, b) { return a - b; }
function pcClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function pcBeatTime(ev) {
  if (typeof beatEventTime === 'function') return beatEventTime(ev);
  return typeof ev === 'number' ? ev : (ev && isFinite(ev.time) ? ev.time : Infinity);
}
// 当前签名值(长短判定用):low→bass, body→mid, snap→treble(全局每帧更新的频段能量)
function pcCurrentSignature(kind) {
  if (kind === 'low') return (typeof bass === 'number') ? bass : 0;
  if (kind === 'body') return (typeof mid === 'number') ? mid : 0;
  return (typeof treble === 'number') ? treble : 0;
}

// 二分定位 cursor 到 <=t 的最大拍;zeroEnv 时清空包络
function pcRelocate(beats, t, zeroEnv) {
  var lo = 0, hi = beats.length - 1, res = -1;
  while (lo <= hi) {
    var midi = (lo + hi) >> 1;
    if (pcBeatTime(beats[midi]) <= t) { res = midi; lo = midi + 1; } else hi = midi - 1;
  }
  pcCursor = res;
  if (zeroEnv) {
    pulseCore.kick = pulseCore.snare = pulseCore.hat = pulseCore.punch = pulseCore.pump = 0;
    pcSwellBase = pcSwellInject = 0; pulseCore.swell = 0;
    for (var i = 0; i < pcPending.length; i++) pcPending[i].active = false;
  }
}

// 换歌:重定位游标、清零包络、算 gridStep(环形数组保留)
function pcResetForMap(map, t) {
  pcActiveMap = map;
  pcActiveBeats = map.beats;
  if (map.gridStep && map.gridStep > 0) {
    pcGridStep = map.gridStep;
  } else {
    // 无 gridStep:取相邻拍差中位数
    var n = 0, beats = pcActiveBeats;
    for (var i = 1; i < beats.length && n < 32; i++) {
      var d = pcBeatTime(beats[i]) - pcBeatTime(beats[i - 1]);
      if (d > 0.05 && d < 4) pcStepScratch[n++] = d;
    }
    if (n > 0) {
      for (var k = n; k < pcStepScratch.length; k++) pcStepScratch[k] = Infinity;
      pcStepScratch.sort(pcNumCompare);
      pcGridStep = pcStepScratch[(n >> 1)];
    } else pcGridStep = 0.5;
  }
  pcStrengthEMA = 0;
  pcRelocate(pcActiveBeats, t, true);
}

// 环形数组 p75(触发时才算,非每帧路径)
function pcStrengthP75() {
  var count = pcRingCount;
  if (count <= 0) return PULSECORE_TUNING.normFloor;
  for (var i = 0; i < count; i++) pcSortScratch[i] = pcRing[i];
  for (var j = count; j < pcSortScratch.length; j++) pcSortScratch[j] = Infinity;
  pcSortScratch.sort(pcNumCompare);
  var idx = Math.floor(count * 0.75);
  if (idx >= count) idx = count - 1;
  return pcSortScratch[idx];
}

// 脉冲触发:统一入口(map 跨拍 / live hit 都走这)
function pulseCoreTrigger(strengthRaw, low, body, snap, combo, tSec) {
  var T = PULSECORE_TUNING;
  // 1) 入环形数组
  pcRing[pcRingHead] = strengthRaw;
  pcRingHead = (pcRingHead + 1) % T.ringSize;
  if (pcRingCount < T.ringSize) pcRingCount++;
  // 2) 轻重归一
  var p75 = pcStrengthP75();
  var norm = pcClamp(strengthRaw / Math.max(p75, T.normFloor), 0, T.normMax);
  if (combo === 'downbeat') norm *= T.downbeatBoost;
  // 3) 分类(low 优先)
  var wLow = low * T.lowWeight, wBody = body, wSnap = snap;
  var kind, env;
  if (wLow >= wBody && wLow >= wSnap) { kind = 'low'; env = 'kick'; }
  else if (wBody >= wSnap) { kind = 'body'; env = 'snare'; }
  else { kind = 'snap'; env = 'hat'; }
  // 4) 冷却:同 kind 80ms 内不重复
  // seek 回跳/重播后 lastPulseAt 落在"未来", 冷却差恒为负会整轨压死脉冲 —— 回跳即重置
  if (tSec < pulseCore.lastPulseAt - 0.25) pulseCore.lastPulseAt = tSec - 10;
  if (kind === pulseCore.lastPulseKind && (tSec - pulseCore.lastPulseAt) < T.cooldownSec) return;
  // 5) 抬包络
  if (env === 'kick') { pulseCore.kick = Math.max(pulseCore.kick, norm); pcHalfKick = pcClamp(pcGridStep * T.kickHalfFactor, T.kickHalfMin, T.kickHalfMax); }
  else if (env === 'snare') { pulseCore.snare = Math.max(pulseCore.snare, norm); pcHalfSnare = T.snareHalf; }
  else { pulseCore.hat = Math.max(pulseCore.hat, norm); pcHalfHat = T.hatHalf; }
  pulseCore.punch = Math.max(pulseCore.punch, norm);
  // 6) pump 的最近拍强度 EMA
  pcStrengthEMA += (norm - pcStrengthEMA) * T.strengthEmaBlend;
  // 7) 记录最近脉冲
  pulseCore.lastPulseAt = tSec;
  pulseCore.lastPulseKind = kind;
  pulseCore.lastPulseStrength = norm;
  pulseCore.lastPulseSustained = false;
  // 8) 入待长短判定队列(复用槽)
  var sig = pcCurrentSignature(kind);
  for (var s = 0; s < pcPending.length; s++) {
    if (!pcPending[s].active) {
      pcPending[s].active = true;
      pcPending[s].kind = kind; pcPending[s].env = env;
      pcPending[s].norm = norm; pcPending[s].peak = sig;
      pcPending[s].dueAt = tSec + T.sustainDelay;
      break;
    }
  }
}

// live 模式:主循环把 rtBeat 命中事件转发过来。只在 source==='live' 时生效,map 模式忽略避免双触发。
function pulseCoreNotifyHit(beat) {
  if (pulseCore.source !== 'live' || !beat) return;
  var s = beat.strength != null ? beat.strength : 0.42;
  var low = beat.low != null ? beat.low : 0;
  var body = beat.body != null ? beat.body : 0;
  var snap = beat.snap != null ? beat.snap : 0;
  var tSec = (typeof audio !== 'undefined' && audio && isFinite(audio.currentTime)) ? audio.currentTime : (beat.time || 0);
  pulseCoreTrigger(s, low, body, snap, beat.combo || null, tSec);
}

// map 模式:从一个 beat 对象触发
function pcTriggerFromMapBeat(beat, tSec) {
  if (!beat || typeof beat === 'number') { pulseCoreTrigger(0.42, 0.42, 0, 0, null, tSec); return; }
  var s = beat.strength != null ? beat.strength : 0.42;
  var low = beat.low != null ? beat.low : 0;
  var body = beat.body != null ? beat.body : 0;
  var snap = beat.snap != null ? beat.snap : 0;
  pulseCoreTrigger(s, low, body, snap, beat.combo || null, tSec);
}

// 主入口:每帧调用(包络平滑要求每帧跑)
function pulseCoreStep(dt) {
  var T = PULSECORE_TUNING;
  var t = (typeof audio !== 'undefined' && audio && isFinite(audio.currentTime)) ? audio.currentTime : 0;

  // —— f) 换歌/seek 突变检测 ——
  var dj = (typeof djMode !== 'undefined' && djMode && djMode.active);
  var map = null;
  if (dj && typeof currentDjBeatMap !== 'undefined' && currentDjBeatMap && currentDjBeatMap.beats && currentDjBeatMap.beats.length) map = currentDjBeatMap;
  else if (typeof currentBeatMap !== 'undefined' && currentBeatMap && currentBeatMap.beats && currentBeatMap.beats.length) map = currentBeatMap;

  if (map && map !== pcActiveMap) {
    pcResetForMap(map, t);
  } else if (map && (t < pcLastT - T.seekBack || t > pcLastT + T.seekFwd)) {
    pcRelocate(pcActiveBeats, t, true); // 同歌内 seek:重定位不触发
  } else if (!map) {
    pcActiveMap = null; pcActiveBeats = null;
  }

  // —— 每帧先衰减包络(再让本帧新脉冲抬满)——
  pulseCore.kick = pulseCore.kick * Math.pow(0.5, dt / Math.max(1e-3, pcHalfKick));
  pulseCore.snare = pulseCore.snare * Math.pow(0.5, dt / Math.max(1e-3, pcHalfSnare));
  pulseCore.hat = pulseCore.hat * Math.pow(0.5, dt / Math.max(1e-3, pcHalfHat));
  var punchHalf = T.punchHalfBase * (0.7 + 0.6 * pulseCore.lastPulseStrength);
  pulseCore.punch = pulseCore.punch * Math.pow(0.5, dt / Math.max(1e-3, punchHalf));
  pcStrengthEMA = pcStrengthEMA * Math.pow(0.5, dt / T.strengthEmaTau);
  pcSwellInject = pcSwellInject * Math.pow(0.5, dt / T.swellInjectTau);

  // —— 选源 + 拍钟 ——
  var source = 'none', conf = 0, phase = pulseCore.phase, bpm = 0;
  if (map) {
    source = 'map';
    var beats = pcActiveBeats;
    // 顺播前进游标,跨拍触发脉冲(跨太多视为跳播,不触发)
    var crossed = 0;
    while (pcCursor + 1 < beats.length && pcBeatTime(beats[pcCursor + 1]) <= t) { pcCursor++; crossed++; }
    if (crossed > 0 && crossed <= T.maxCrossTrigger) {
      for (var c = pcCursor - crossed + 1; c <= pcCursor; c++) pcTriggerFromMapBeat(beats[c], t);
    }
    // phase
    var prevT = pcCursor >= 0 ? pcBeatTime(beats[pcCursor]) : t;
    var nextT = (pcCursor + 1 < beats.length) ? pcBeatTime(beats[pcCursor + 1]) : prevT + pcGridStep;
    phase = pcClamp((t - prevT) / Math.max(1e-3, nextT - prevT), 0, 1);
    // bpm(优先 gridStep,否则相邻拍差)
    var step = (map.gridStep && map.gridStep > 0) ? map.gridStep : pcGridStep;
    bpm = step > 0 ? 60 / step : 0;
    // conf
    conf = (map.tempoSource === 'music-tempo') ? T.confMusicTempo : T.confMap;
    if (map.partialUntilSec && t > map.partialUntilSec) conf = T.confPartial;
  } else if (typeof rtBeat !== 'undefined' && rtBeat && rtBeat.tempoGap > 0 && rtBeat.tempoConfidence > T.liveConfMin) {
    source = 'live';
    var gap = rtBeat.tempoGap;
    var frac = (t - rtBeat.lastHitAt) / gap;
    frac = frac - Math.floor(frac);
    phase = pcClamp(frac, 0, 1);
    bpm = 60 / gap;
    conf = rtBeat.tempoConfidence * T.confLiveScale;
    pcGridStep = gap;
  } else {
    source = 'none';
    conf = 0;
  }

  // —— 长短判定(到期检查签名是否保持)——
  for (var pI = 0; pI < pcPending.length; pI++) {
    var pd = pcPending[pI];
    if (!pd.active) continue;
    var cur = pcCurrentSignature(pd.kind);
    if (cur > pd.peak) pd.peak = cur; // 追踪窗口内峰值
    if (t >= pd.dueAt) {
      if (pd.peak > 0.06 && cur >= T.sustainRatio * pd.peak) {   // peak 下限:静音段 0>=0 恒真会把一切误判成延音
        pcSwellInject += pd.norm * T.sustainSwellGain;
        if (pd.env === 'kick') pcHalfKick *= T.sustainHalfMul;
        else if (pd.env === 'snare') pcHalfSnare *= T.sustainHalfMul;
        else pcHalfHat *= T.sustainHalfMul;
        if (pulseCore.lastPulseKind === pd.kind) pulseCore.lastPulseSustained = true;
      }
      pd.active = false;
    }
  }

  // —— pump:拍内爬升,拍瞬间归零(锯齿)——
  pulseCore.pump = Math.pow(1 - phase, T.pumpPhaseExp) * conf * pcStrengthEMA;

  // —— swell:清洗后的持续能量,attack/release 单极点 + 注入自然衰减 ——
  var ae = (typeof audioEnergy === 'number') ? audioEnergy : 0;
  var swellTarget = pcClamp(ae - pulseCore.punch * T.swellPunchClean, 0, 1);
  var swellTau = swellTarget > pcSwellBase ? T.swellAttackTau : T.swellReleaseTau;
  pcSwellBase += (swellTarget - pcSwellBase) * (1 - Math.pow(0.5, dt / swellTau));
  pulseCore.swell = pcClamp(pcSwellBase + pcSwellInject, 0, 1);

  // —— 写状态 ——
  pulseCore.source = source;
  pulseCore.conf = conf;
  pulseCore.phase = phase;
  pulseCore.bpm = bpm;
  pulseCore.ready = source !== 'none';
  pcLastT = t;
}

// g) 调试出口(允许分配,不在每帧路径)
window.__pulseCoreDebug = function () {
  return JSON.parse(JSON.stringify({
    pulseCore: pulseCore,
    tuning: PULSECORE_TUNING,
    source: pulseCore.source,
    gridStep: pcGridStep,
    cursor: pcCursor,
    strengthEMA: pcStrengthEMA,
    swellBase: pcSwellBase,
    swellInject: pcSwellInject,
    ringCount: pcRingCount,
    halflives: { kick: pcHalfKick, snare: pcHalfSnare, hat: pcHalfHat },
    activeMap: !!pcActiveMap,
    beats: pcActiveBeats ? pcActiveBeats.length : 0
  }));
};
