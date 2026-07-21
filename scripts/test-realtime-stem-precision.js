const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const SAMPLE_RATE = 44100;
const BLOCK_SIZE = 128;
const PROCESSOR_DELAY = 2048;

function readProcessorSource() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '05-playback', '08-audio-graph-controls.js'), 'utf8');
  const match = source.match(/var VOCAL_REMOVER_PROCESSOR_SRC = `([\s\S]*?)`;\nvar _vocalWorkletCtx/);
  assert.ok(match, '缺少实时分离 Worklet 源码');
  return match[1];
}

function createProcessor(levels) {
  let Processor = null;
  class AudioWorkletProcessor {
    constructor() { this.port = { onmessage: null }; }
  }
  const sandbox = {
    AudioWorkletProcessor,
    Float32Array,
    Uint32Array,
    Math,
    sampleRate: SAMPLE_RATE,
    registerProcessor(name, ClassRef) {
      assert.equal(name, 'vocal-remover-processor');
      Processor = ClassRef;
    },
  };
  vm.runInNewContext(readProcessorSource(), sandbox);
  assert.ok(Processor, '实时分离处理器未注册');
  return new Processor({ processorOptions: levels });
}

function processStereo(left, right, levels) {
  const processor = createProcessor(levels);
  const tail = 8192;
  const length = left.length + tail;
  const outputLeft = new Float32Array(length);
  const outputRight = new Float32Array(length);
  for (let offset = 0; offset < length; offset += BLOCK_SIZE) {
    const inLeft = new Float32Array(BLOCK_SIZE);
    const inRight = new Float32Array(BLOCK_SIZE);
    const outLeft = new Float32Array(BLOCK_SIZE);
    const outRight = new Float32Array(BLOCK_SIZE);
    for (let i = 0; i < BLOCK_SIZE && offset + i < left.length; i += 1) {
      inLeft[i] = left[offset + i];
      inRight[i] = right[offset + i];
    }
    processor.process([[inLeft, inRight]], [[outLeft, outRight]]);
    outputLeft.set(outLeft.subarray(0, Math.min(BLOCK_SIZE, length - offset)), offset);
    outputRight.set(outRight.subarray(0, Math.min(BLOCK_SIZE, length - offset)), offset);
  }
  return { left: outputLeft, right: outputRight };
}

function deterministicNoise(index) {
  let value = (index * 1664525 + 1013904223) >>> 0;
  value ^= value >>> 15;
  return (value / 0xffffffff) * 2 - 1;
}

function createSyntheticMix() {
  const length = SAMPLE_RATE * 3;
  const vocalLeft = new Float32Array(length);
  const vocalRight = new Float32Array(length);
  const drum = new Float32Array(length);
  const side = new Float32Array(length);
  const drumStarts = [0.9, 1.5, 2.1].map((seconds) => Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < length; i += 1) {
    const time = i / SAMPLE_RATE;
    const fade = Math.min(1, Math.max(0, (time - 0.12) / 0.18));
    const vocal = fade * 0.16 * (
      Math.sin(2 * Math.PI * 220 * time)
      + 0.48 * Math.sin(2 * Math.PI * 440 * time)
      + 0.26 * Math.sin(2 * Math.PI * 660 * time)
      + 0.16 * Math.sin(2 * Math.PI * 1320 * time)
      + 0.10 * Math.sin(2 * Math.PI * 2200 * time)
    );
    vocalLeft[i] = vocal;
    vocalRight[i] = vocal;
    side[i] = 0.08 * Math.sin(2 * Math.PI * 330 * time);
  }
  for (const start of drumStarts) {
    const duration = Math.round(SAMPLE_RATE * 0.055);
    for (let j = 0; j < duration && start + j < length; j += 1) {
      const envelope = Math.exp(-j / (SAMPLE_RATE * 0.012));
      drum[start + j] += envelope * (0.26 * deterministicNoise(start + j) + 0.18 * Math.sin(2 * Math.PI * 1800 * j / SAMPLE_RATE));
    }
  }
  const mixLeft = new Float32Array(length);
  const mixRight = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    mixLeft[i] = vocalLeft[i] + drum[i] + side[i];
    mixRight[i] = vocalRight[i] + drum[i] - side[i];
  }
  return { vocalLeft, vocalRight, drum, side, mixLeft, mixRight, drumStarts };
}

function createSyllabicCenteredVocal() {
  const length = SAMPLE_RATE * 3;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const time = i / SAMPLE_RATE;
    const syllableTime = time % 0.28;
    const envelope = syllableTime < 0.18
      ? Math.min(1, syllableTime / 0.018) * Math.exp(-syllableTime * 2.4)
      : 0;
    const vocal = envelope * 0.18 * (
      Math.sin(2 * Math.PI * 230 * time)
      + 0.42 * Math.sin(2 * Math.PI * 690 * time)
      + 0.20 * Math.sin(2 * Math.PI * 8200 * time)
    );
    left[i] = vocal;
    right[i] = vocal;
  }
  return { left, right };
}

function createCenteredPercussion() {
  const length = SAMPLE_RATE * 3;
  const signal = new Float32Array(length);
  const starts = [0.9, 1.5, 2.1].map((seconds) => Math.round(seconds * SAMPLE_RATE));
  for (const start of starts) {
    const duration = Math.round(SAMPLE_RATE * 0.06);
    for (let j = 0; j < duration; j += 1) {
      const attack = Math.min(1, j / (SAMPLE_RATE * 0.002));
      const envelope = attack * Math.exp(-j / (SAMPLE_RATE * 0.018));
      signal[start + j] = envelope * (
        0.28 * Math.sin(2 * Math.PI * 1800 * j / SAMPLE_RATE)
        + 0.16 * Math.sin(2 * Math.PI * 4700 * j / SAMPLE_RATE)
      );
    }
  }
  return { signal, starts };
}

function createStereoInstrument() {
  const length = SAMPLE_RATE * 3;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const time = i / SAMPLE_RATE;
    const noteTime = time % 0.5;
    const envelope = noteTime < 0.34
      ? Math.min(1, noteTime / 0.01) * Math.exp(-noteTime * 4)
      : 0;
    const center = envelope * 0.13 * (
      Math.sin(2 * Math.PI * 330 * time)
      + 0.5 * Math.sin(2 * Math.PI * 990 * time)
    );
    const side = envelope * 0.08 * (
      Math.sin(2 * Math.PI * 410 * time)
      + 0.4 * Math.sin(2 * Math.PI * 1230 * time)
    );
    left[i] = center + side;
    right[i] = center - side;
  }
  return { left, right };
}

function createLowMaleVocal() {
  const length = SAMPLE_RATE * 3;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const time = i / SAMPLE_RATE;
    let vocal = 0;
    for (let harmonic = 1; harmonic <= 24; harmonic += 1) {
      const frequency = 110 * harmonic;
      const formant = 0.85 * Math.exp(-Math.pow((frequency - 520) / 260, 2))
        + 0.62 * Math.exp(-Math.pow((frequency - 1050) / 360, 2))
        + 0.38 * Math.exp(-Math.pow((frequency - 2350) / 520, 2));
      vocal += (0.035 + formant) / Math.sqrt(harmonic)
        * Math.sin(2 * Math.PI * frequency * time);
    }
    left[i] = Math.min(1, time / 0.08) * 0.06 * vocal;
    right[i] = left[i];
  }
  return { left, right };
}

function createCenteredSibilance() {
  const length = SAMPLE_RATE * 3;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const time = i / SAMPLE_RATE;
    const localTime = time % 0.42;
    const envelope = localTime < 0.18
      ? Math.min(1, localTime / 0.018) * Math.exp(-localTime * 2.2)
      : 0;
    const vocal = envelope * 0.08 * (
      Math.sin(2 * Math.PI * 3200 * time)
      + 0.7 * Math.sin(2 * Math.PI * 4700 * time + 0.4)
      + 0.45 * Math.sin(2 * Math.PI * 6100 * time + 1.1)
    );
    left[i] = vocal;
    right[i] = vocal;
  }
  return { left, right };
}

function rms(values, start, end) {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(0, start); i < Math.min(values.length, end); i += 1) {
    sum += values[i] * values[i];
    count += 1;
  }
  return Math.sqrt(sum / Math.max(1, count));
}

function differenceRms(first, second, windows) {
  let sum = 0;
  let count = 0;
  for (const [start, end] of windows) {
    for (let i = start; i < end; i += 1) {
      const difference = first[i] - second[i];
      sum += difference * difference;
      count += 1;
    }
  }
  return Math.sqrt(sum / Math.max(1, count));
}

test('实时人声轨保留持续中置人声', () => {
  // mac-port 基线: applied = vocal + (acc-vocal)*mask; 纯人声轨 mask≈0 → 接近完整保留
  const fixture = createSyntheticMix();
  const levels = { accompaniment: 0, vocal: 1 };
  const vocalOnly = processStereo(fixture.vocalLeft, fixture.vocalRight, levels).left;
  const steadyStart = Math.round(SAMPLE_RATE * 0.55) + PROCESSOR_DELAY;
  const steadyEnd = Math.round(SAMPLE_RATE * 2.75) + PROCESSOR_DELAY;
  const retainedVocal = rms(vocalOnly, steadyStart, steadyEnd)
    / rms(fixture.vocalLeft, steadyStart - PROCESSOR_DELAY, steadyEnd - PROCESSOR_DELAY);
  assert.ok(retainedVocal > 0.70, `人声保留过低: ${retainedVocal.toFixed(3)}`);
});

test('纯侧声道在人声轨被压、在伴奏轨被保留', () => {
  // 纯反相侧信号: mask≈1 → applied(人声轨)=1-mask≈0; applied(伴奏轨)=mask≈1
  const length = SAMPLE_RATE * 2;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const s = 0.12 * Math.sin(2 * Math.PI * 660 * t);
    left[i] = s;
    right[i] = -s;
  }
  const vocalTrack = processStereo(left, right, { accompaniment: 0, vocal: 1 }).left;
  const accTrack = processStereo(left, right, { accompaniment: 1, vocal: 0 }).left;
  const start = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 0.3);
  const end = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 1.7);
  const raw = rms(left, start - PROCESSOR_DELAY, end - PROCESSOR_DELAY);
  const leakedToVocal = rms(vocalTrack, start, end) / Math.max(1e-9, raw);
  const retainedInAcc = rms(accTrack, start, end) / Math.max(1e-9, raw);
  assert.ok(leakedToVocal < 0.25, `侧声道漏进人声轨过高: ${leakedToVocal.toFixed(3)}`);
  assert.ok(retainedInAcc > 0.80, `侧声道伴奏保留过低: ${retainedInAcc.toFixed(3)}`);
});
test('实时人声轨保留低沉男声主体', () => {
  const vocal = createLowMaleVocal();
  const output = processStereo(vocal.left, vocal.right, { accompaniment: 0, vocal: 1 }).left;
  const start = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 0.45);
  const end = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 2.8);
  const retained = rms(output, start, end)
    / rms(vocal.left, start - PROCESSOR_DELAY, end - PROCESSOR_DELAY);
  assert.ok(retained > 0.70, `低沉男声保留过低: ${retained.toFixed(3)}`);
});

test('实时人声轨保留女声齿音', () => {
  const vocal = createCenteredSibilance();
  const output = processStereo(vocal.left, vocal.right, { accompaniment: 0, vocal: 1 }).left;
  const start = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 0.45);
  const end = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 2.8);
  const retained = rms(output, start, end)
    / rms(vocal.left, start - PROCESSOR_DELAY, end - PROCESSOR_DELAY);
  assert.ok(retained > 0.50, `女声齿音保留过低: ${retained.toFixed(3)}`);
});

test('实时伴奏轨强力压低反复出现的中置人声', () => {
  const vocal = createSyllabicCenteredVocal();
  const accompaniment = processStereo(vocal.left, vocal.right, { accompaniment: 1, vocal: 0 }).left;
  const start = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 0.35);
  const end = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 2.8);
  const residual = rms(accompaniment, start, end)
    / rms(vocal.left, start - PROCESSOR_DELAY, end - PROCESSOR_DELAY);
  // mac-port ^1.4 掩码对纯中置很狠; 允许略松于旧双掩码 0.14
  assert.ok(residual < 0.22, `伴奏轨人声残留过高: ${residual.toFixed(3)}`);
});

test('实时伴奏轨保留侧声道乐器', () => {
  const fixture = createSyntheticMix();
  const sideOnly = processStereo(fixture.side, fixture.side.map((value) => -value), { accompaniment: 1, vocal: 0 }).left;
  const start = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 0.35);
  const end = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 2.8);
  const retained = rms(sideOnly, start, end)
    / rms(fixture.side, start - PROCESSOR_DELAY, end - PROCESSOR_DELAY);
  assert.ok(retained > 0.80, `侧声道伴奏保留过低: ${retained.toFixed(3)}`);
});

test('双 100% 原声旁路不改写波形量级', () => {
  const fixture = createSyntheticMix();
  const out = processStereo(fixture.mixLeft, fixture.mixRight, { accompaniment: 1, vocal: 1 }).left;
  const start = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 0.4);
  const end = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 2.6);
  const retained = rms(out, start, end)
    / rms(fixture.mixLeft, start - PROCESSOR_DELAY, end - PROCESSOR_DELAY);
  assert.ok(retained > 0.90 && retained < 1.12, `双 100% 量级偏移: ${retained.toFixed(3)}`);
});

test('实时分离仍只使用一套 FFT 且帧内零分配', () => {
  const processor = readProcessorSource();
  // 双 100% 路径不进 FFT; 处理路径各一次正变换
  assert.ok((processor.match(/this\.fft\(this\.re1, this\.im1, false\)/g) || []).length >= 1);
  assert.ok((processor.match(/this\.fft\(this\.re2, this\.im2, false\)/g) || []).length >= 1);
  const frame = processor.slice(processor.indexOf('  frame() {'), processor.indexOf('  process(inputs'));
  assert.equal((frame.match(/for \(var b = 0; b < N; b\+\+\)/g) || []).length, 1, '每帧只能扫描一次完整频谱');
  assert.doesNotMatch(frame, /new (?:Float32Array|Uint32Array|Array|Object)\b/);
  assert.match(processor, /maskAlpha/);
  assert.match(processor, /Math\.pow\(ratio,\s*1\.4\)/);
  assert.match(processor, /applied = vocal \+ \(accompaniment - vocal\) \* mask/);
});
