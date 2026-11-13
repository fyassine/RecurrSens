/**
 * Pure helpers for drawing the demo's Grad-CAM spectrograms: colour tables,
 * the mel-frequency axis and decoding of the service's base64 byte grids.
 */

// Anchor colours of the perceptually uniform maps (matplotlib's cividis and
// viridis, 9 stops each), linearly interpolated into a 256-entry table.
const CIVIDIS = [
  [0, 32, 77], [0, 54, 110], [60, 76, 108], [95, 99, 108], [124, 123, 120],
  [155, 148, 119], [189, 175, 108], [224, 204, 87], [255, 234, 70],
] as const;
const VIRIDIS = [
  [68, 1, 84], [71, 44, 122], [59, 81, 139], [44, 113, 142], [33, 144, 141],
  [39, 173, 129], [92, 200, 99], [170, 220, 50], [253, 231, 37],
] as const;

export const CAM_ALPHA = 0.55;
export const FMAX_HZ = 8000;
export const FREQUENCY_TICKS_HZ = [500, 1000, 2000, 4000, 8000];

const N_MELS = 128;

// Slaney mel scale (librosa's default, the one the spectrogram is built with): linear below 1 kHz,
// logarithmic above.
const F_SP = 200 / 3;
const LOG_STEP = Math.log(6.4) / 27;
const mel = (hz: number) => (hz < 1000 ? hz / F_SP : 1000 / F_SP + Math.log(hz / 1000) / LOG_STEP);

function buildLut(stops: readonly (readonly number[])[]): Uint8ClampedArray[] {
  return Array.from({ length: 256 }, (_, i) => {
    const pos = (i / 255) * (stops.length - 1);
    const lo = Math.min(Math.floor(pos), stops.length - 2);
    const t = pos - lo;
    return Uint8ClampedArray.from(stops[lo].map((c, k) => c + (stops[lo + 1][k] - c) * t));
  });
}

export const CIVIDIS_LUT = buildLut(CIVIDIS);
export const VIRIDIS_LUT = buildLut(VIRIDIS);

/**
 * Vertical position of a frequency as a fraction of the axis height (0 = bottom). Row r of the
 * spectrogram is centred on the (r + 1)-th of N_MELS + 2 mel-spaced points between 0 and FMAX_HZ.
 */
export function frequencyFraction(hz: number): number {
  const point = (mel(hz) / mel(FMAX_HZ)) * (N_MELS + 1);
  return Math.min(1, Math.max(0, (point - 0.5) / N_MELS));
}

export function decodeGrid(encoded: string, expectedLength: number): Uint8Array | null {
  try {
    const binary = atob(encoded);
    if (binary.length !== expectedLength) return null;
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

/** RGBA pixels of a `width x height` grid whose row 0 is the bottom row. */
export function colorizeGrid(
  grid: Uint8Array,
  width: number,
  height: number,
  lut: Uint8ClampedArray[],
  alpha = 255,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let row = 0; row < height; row++) {
    const y = height - 1 - row; // canvas y grows downwards
    for (let col = 0; col < width; col++) {
      const rgb = lut[grid[row * width + col]];
      const o = (y * width + col) * 4;
      out[o] = rgb[0];
      out[o + 1] = rgb[1];
      out[o + 2] = rgb[2];
      out[o + 3] = alpha;
    }
  }
  return out;
}

export const greyLut = Array.from({ length: 256 }, (_, i) => Uint8ClampedArray.of(i, i, i));
