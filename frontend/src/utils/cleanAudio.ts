/**
 * Gentle noise reduction for the live demo, applied to mono float samples.
 *
 * Deliberately conservative: a high-pass for low-frequency rumble and a
 * soft gate for stretches that are clearly just background noise. No spectral
 * subtraction — it leaves "musical noise" artefacts the model has never seen.
 * Voiced frames are never attenuated: the gate only acts when the recording
 * actually contains noise-only stretches (a clear level gap between the
 * quietest and loudest frames).
 */

/** Second-order Butterworth high-pass (RBJ biquad), applied forwards only. */
export function highPass(samples: Float32Array, sampleRate: number, cutoffHz = 80): Float32Array {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;

  const out = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

export type GateOptions = {
  frameSeconds?: number;
  /** Maximum attenuation of noise-only frames, in dB (positive number). */
  maxReductionDb?: number;
  /** Frames below floor × this are treated as noise-only. */
  thresholdRatio?: number;
  /** Skip the gate unless loud frames exceed quiet ones by at least this ratio. */
  minDynamicRatio?: number;
};

export function softGate(
  samples: Float32Array,
  sampleRate: number,
  {
    frameSeconds = 0.02,
    maxReductionDb = 12,
    thresholdRatio = 2,
    minDynamicRatio = 3,
  }: GateOptions = {},
): Float32Array {
  const frame = Math.max(1, Math.round(frameSeconds * sampleRate));
  const frames = Math.floor(samples.length / frame);
  if (frames < 10) return samples;

  const rms: number[] = [];
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i] * samples[i];
    rms.push(Math.sqrt(sum / frame));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = Math.max(percentile(sorted, 0.1), 1e-6);
  const loud = percentile(sorted, 0.9);
  if (loud / floor < minDynamicRatio) return samples; // no clear noise-only stretch: leave untouched

  const minGain = 10 ** (-maxReductionDb / 20);
  const threshold = floor * thresholdRatio;
  const attack = 1 - Math.exp(-1 / (0.005 * sampleRate));
  const release = 1 - Math.exp(-1 / (0.05 * sampleRate));

  const out = new Float32Array(samples.length);
  let gain = 1;
  for (let i = 0; i < samples.length; i++) {
    const f = Math.min(frames - 1, Math.floor(i / frame));
    const target = rms[f] < threshold ? minGain : 1;
    gain += (target - gain) * (target > gain ? attack : release);
    out[i] = samples[i] * gain;
  }
  return out;
}

export function cleanSamples(samples: Float32Array, sampleRate: number): Float32Array {
  return softGate(highPass(samples, sampleRate), sampleRate);
}
