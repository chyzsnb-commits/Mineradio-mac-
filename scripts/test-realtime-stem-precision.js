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

test('实时人声轨压低中置鼓点且保留持续人声', () => {
  const fixture = createSyntheticMix();
  const levels = { accompaniment: 0, vocal: 1 };
  const vocalOnly = processStereo(fixture.vocalLeft, fixture.vocalRight, levels).left;
  const mixed = processStereo(fixture.mixLeft, fixture.mixRight, levels).left;
  const windows = fixture.drumStarts.map((start) => [
    start + PROCESSOR_DELAY - Math.round(SAMPLE_RATE * 0.012),
    start + PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 0.075),
  ]);
  const leakedDrum = differenceRms(mixed, vocalOnly, windows);
  const rawDrum = rms(fixture.drum, fixture.drumStarts[0], fixture.drumStarts[0] + Math.round(SAMPLE_RATE * 0.087));
  const steadyStart = Math.round(SAMPLE_RATE * 0.55) + PROCESSOR_DELAY;
  const steadyEnd = Math.round(SAMPLE_RATE * 2.75) + PROCESSOR_DELAY;
  const retainedVocal = rms(vocalOnly, steadyStart, steadyEnd)
    / rms(fixture.vocalLeft, steadyStart - PROCESSOR_DELAY, steadyEnd - PROCESSOR_DELAY);

  assert.ok(leakedDrum / rawDrum < 0.215, `鼓点泄漏过高: ${(leakedDrum / rawDrum).toFixed(3)}`);
  assert.ok(retainedVocal > 0.90, `人声保留过低: ${retainedVocal.toFixed(3)}`);
});

test('实时伴奏轨强力压低反复出现的中置人声', () => {
  const vocal = createSyllabicCenteredVocal();
  const accompaniment = processStereo(vocal.left, vocal.right, { accompaniment: 1, vocal: 0 }).left;
  const start = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 0.35);
  const end = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 2.8);
  const residual = rms(accompaniment, start, end)
    / rms(vocal.left, start - PROCESSOR_DELAY, end - PROCESSOR_DELAY);
  assert.ok(residual < 0.14, `伴奏轨人声残留过高: ${residual.toFixed(3)}`);
});

test('实时伴奏轨保留侧声道乐器', () => {
  const fixture = createSyntheticMix();
  const sideOnly = processStereo(fixture.side, fixture.side.map((value) => -value), { accompaniment: 1, vocal: 0 }).left;
  const start = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 0.35);
  const end = PROCESSOR_DELAY + Math.round(SAMPLE_RATE * 2.8);
  const retained = rms(sideOnly, start, end)
    / rms(fixture.side, start - PROCESSOR_DELAY, end - PROCESSOR_DELAY);
  assert.ok(retained > 0.85, `侧声道伴奏保留过低: ${retained.toFixed(3)}`);
});

test('实时伴奏轨保留居中的高频鼓点瞬态', () => {
  const percussion = createCenteredPercussion();
  const output = processStereo(percussion.signal, percussion.signal, { accompaniment: 1, vocal: 0 }).left;
  let retainedRms = 0;
  let retainedPeak = 0;
  for (const start of percussion.starts) {
    const duration = Math.round(SAMPLE_RATE * 0.075);
    const outputStart = start + PROCESSOR_DELAY;
    retainedRms += rms(output, outputStart, outputStart + duration)
      / rms(percussion.signal, start, start + duration);
    let inputPeak = 0;
    let outputPeak = 0;
    for (let i = 0; i < duration; i += 1) {
      inputPeak = Math.max(inputPeak, Math.abs(percussion.signal[start + i] || 0));
      outputPeak = Math.max(outputPeak, Math.abs(output[outputStart + i] || 0));
    }
    retainedPeak += outputPeak / Math.max(1e-9, inputPeak);
  }
  retainedRms /= percussion.starts.length;
  retainedPeak /= percussion.starts.length;
  assert.ok(retainedRms > 0.50, `中置鼓点能量保留过低: ${retainedRms.toFixed(3)}`);
  assert.ok(retainedPeak > 0.60, `中置鼓点冲击保留过低: ${retainedPeak.toFixed(3)}`);
});

test('实时分离仍只使用一套 FFT 且帧内零分配', () => {
  const processor = readProcessorSource();
  assert.equal((processor.match(/this\.fft\(this\.re1, this\.im1, false\)/g) || []).length, 1);
  assert.equal((processor.match(/this\.fft\(this\.re2, this\.im2, false\)/g) || []).length, 1);
  const frame = processor.slice(processor.indexOf('  frame() {'), processor.indexOf('  process(inputs'));
  assert.doesNotMatch(frame, /new (?:Float32Array|Uint32Array|Array|Object)\b/);
  assert.match(processor, /prevMidEnergy/);
  assert.match(processor, /phaseCoherence/);
  assert.match(processor, /accompanimentMaskPrev/);
});
