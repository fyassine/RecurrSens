import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/render';
import type { DemoExplanation } from '../api/client';
import { colorizeGrid, decodeGrid, frequencyFraction } from '../utils/spectrogram';
import DemoSaliency from './DemoSaliency';

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

function explanation(overrides: Partial<DemoExplanation> = {}): DemoExplanation {
  return {
    duration_s: 3.2,
    probability: 0.31,
    mel: { n_mels: 2, n_frames: 3, data: b64([0, 10, 20, 30, 40, 50]) },
    cam: { size: 2, data: b64([0, 255, 255, 0]) },
    phonation_overlap: 0.9,
    glottal_band_overlap: 0.6,
    formant_band_overlap: 0.4,
    ...overrides,
  };
}

const labels = [
  { exerciseId: 'i_n', short: 'Vokal I' },
  { exerciseId: 'a_n', short: 'Vokal A' },
  { exerciseId: 'u_n', short: 'Vokal U' },
];

describe('decodeGrid', () => {
  it('decodes base64 into bytes of the expected length', () => {
    expect(Array.from(decodeGrid(b64([1, 2, 3, 4]), 4) ?? [])).toEqual([1, 2, 3, 4]);
  });

  it('rejects a wrong length or invalid base64', () => {
    expect(decodeGrid(b64([1, 2, 3]), 4)).toBeNull();
    expect(decodeGrid('!!not base64!!', 4)).toBeNull();
  });
});

describe('colorizeGrid', () => {
  const lut = Array.from({ length: 256 }, (_, i) => Uint8ClampedArray.of(i, 0, 0));

  it('puts row 0 (lowest frequency) at the bottom of the image', () => {
    // 1 column, 2 rows: row 0 = 10, row 1 = 200
    const pixels = colorizeGrid(Uint8Array.of(10, 200), 1, 2, lut, 128);
    expect(Array.from(pixels)).toEqual([200, 0, 0, 128, 10, 0, 0, 128]);
  });
});

describe('frequencyFraction', () => {
  it('follows the Slaney mel axis of the spectrogram and stays inside the plot', () => {
    expect(frequencyFraction(0)).toBe(0);
    expect(frequencyFraction(8000)).toBe(1);
    // 1 kHz is mel 15 of 45.2 in total: about a third of the way up, well above linear (1/8).
    expect(frequencyFraction(1000)).toBeCloseTo(0.33, 2);
    const ticks = [500, 1000, 2000, 4000, 8000].map(frequencyFraction);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });
});

describe('DemoSaliency', () => {
  beforeEach(() => {
    // jsdom has no canvas; the component must still render its axes and captions.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('renders a spectrogram and a highlighted version for every recording', () => {
    renderWithProviders(
      <DemoSaliency explanations={[explanation(), explanation(), explanation()]} labels={labels} />,
    );

    expect(screen.getByLabelText('Spektrogramm Vokal I')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Spektrogramm Vokal U mit hervorgehobenen Bereichen'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(6);
    expect(screen.getAllByText(/Modellwert dieser Aufnahme: 31 %/)).toHaveLength(3);
    expect(screen.getByText(/keine ärztliche Aussage/)).toBeInTheDocument();
  });

  it('survives a malformed grid without throwing', () => {
    renderWithProviders(
      <DemoSaliency
        explanations={[explanation({ mel: { n_mels: 2, n_frames: 3, data: 'AAAA' } })]}
        labels={labels}
      />,
    );
    expect(screen.getByTestId('demo-saliency')).toBeInTheDocument();
  });
});
