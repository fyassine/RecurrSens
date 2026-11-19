import { describe, it, expect } from 'vitest';
import { cleanSamples, highPass, softGate } from './cleanAudio';

const SR = 16000;

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

const rms = (x: Float32Array, from = 0, to = x.length) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (to - from));
};
const db = (a: number, b: number) => 20 * Math.log10(a / b);

function tone(freq: number, amp: number, seconds: number, noiseAmp = 0, seed = 1) {
  const rand = lcg(seed);
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR) + noiseAmp * rand();
  }
  return out;
}

const concat = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe('highPass', () => {
  it('removes 20 Hz rumble but keeps a 200 Hz voice component', () => {
    const rumble = highPass(tone(20, 0.3, 2), SR);
    const voice = highPass(tone(200, 0.3, 2), SR);
    // Skip the filter's start-up transient.
    expect(db(rms(rumble, SR), rms(tone(20, 0.3, 2), SR))).toBeLessThan(-20);
    expect(Math.abs(db(rms(voice, SR), rms(tone(200, 0.3, 2), SR)))).toBeLessThan(1);
  });
});

describe('softGate', () => {
  it('attenuates noise-only stretches and leaves the voiced part within 1 dB', () => {
    const noiseOnly = tone(0, 0, 1, 0.02, 7);
    const voiced = tone(200, 0.3, 2, 0.02, 8);
    const input = concat(noiseOnly, voiced);
    const out = softGate(input, SR);

    const noiseBefore = rms(input, SR / 4, SR);
    const noiseAfter = rms(out, SR / 4, SR);
    expect(db(noiseAfter, noiseBefore)).toBeLessThan(-8);

    const voicedBefore = rms(input, SR + SR / 2, 3 * SR);
    const voicedAfter = rms(out, SR + SR / 2, 3 * SR);
    expect(Math.abs(db(voicedAfter, voicedBefore))).toBeLessThan(1);
  });

  it('never alters a recording that is voiced throughout', () => {
    const input = tone(200, 0.3, 2, 0.02, 3);
    const out = softGate(input, SR);
    expect(out).toBe(input);
  });

  it('keeps silence silent and does not produce NaN', () => {
    const out = cleanSamples(new Float32Array(SR), SR);
    expect(out.every((v) => v === 0)).toBe(true);
  });
});
