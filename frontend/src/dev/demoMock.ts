/**
 * DEV-ONLY: synthetic demo result so the result screen and Grad-CAM layouts can
 * be previewed without recording or a backend (`/demo?mock=1`).
 * Imported dynamically behind `import.meta.env.DEV`, so it is not part of
 * production bundles.
 */
import type { DemoAnalysis, DemoExplanation } from '../api/client';

const b64 = (bytes: Uint8Array) => {
  let s = '';
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s);
};

function melGrid(rows: number, cols: number, seed: number): Uint8Array {
  const out = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Harmonic ridges that decay with frequency, a little vibrato and noise.
      const vib = Math.sin((c / cols) * Math.PI * 6 + seed) * 1.2;
      const ridges = Math.pow(Math.max(0, Math.cos(((r + vib) / (5 + seed)) * Math.PI)), 6);
      const tilt = 1 - r / rows;
      const envelope = Math.min(1, c / 8, (cols - c) / 8);
      const noise = ((Math.sin(r * 12.9898 + c * 78.233 + seed) * 43758.5453) % 1 + 1) % 1;
      out[r * cols + c] = Math.round(255 * Math.min(1, (0.15 + 0.7 * ridges * tilt + 0.15 * noise * tilt) * envelope));
    }
  }
  return out;
}

function camGrid(size: number, cx: number, cy: number): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const d = Math.hypot((c / size - cx) * 1.4, r / size - cy);
      out[r * size + c] = Math.round(255 * Math.exp(-d * d * 18));
    }
  }
  return out;
}

function explanation(seed: number, probability: number, cx: number, cy: number): DemoExplanation {
  const rows = 128;
  const cols = 100;
  const size = 14;
  return {
    duration_s: 3.2 + seed * 0.2,
    probability,
    mel: { n_mels: rows, n_frames: cols, data: b64(melGrid(rows, cols, seed)) },
    cam: { size, data: b64(camGrid(size, cx, cy)) },
    phonation_overlap: 0.8,
    glottal_band_overlap: 0.5,
    formant_band_overlap: 0.4,
  };
}

export function mockDemoAnalysis(favorable = false): DemoAnalysis {
  return {
    prediction: favorable ? 'normal' : 'abnormal',
    confidence: favorable ? 91 : 78,
    favorable,
    gradcam: null,
    explanations: [
      explanation(1, favorable ? 0.12 : 0.74, 0.3, 0.25),
      explanation(2, favorable ? 0.08 : 0.81, 0.55, 0.4),
      explanation(3, favorable ? 0.15 : 0.69, 0.7, 0.2),
    ],
    backend: 'mock',
    recordings: 3,
    stored: false,
  };
}
