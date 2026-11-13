/**
 * Spectrogram + highlighted region (Grad-CAM) per demo vowel.
 *
 * The inference service sends two small byte grids per recording: the log-mel
 * spectrogram the model saw and the Grad-CAM map (where the decision came
 * from). Both are drawn client-side on canvas, so no image ever exists on a
 * server or in storage: the demo's "nothing is kept" promise still holds.
 *
 * Both grids have row 0 = lowest mel bin (drawn at the bottom). The map spans
 * the clip's full time axis, so it is stretched over the whole spectrogram.
 */
import { useEffect, useRef } from 'react';
import { Stack, Text } from '@mantine/core';
import type { DemoExplanation } from '../api/client';
import {
  CAM_ALPHA,
  CIVIDIS_LUT,
  FREQUENCY_TICKS_HZ,
  VIRIDIS_LUT,
  colorizeGrid,
  decodeGrid,
  frequencyFraction,
  greyLut,
} from '../utils/spectrogram';

function toCanvas(pixels: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

function SpectrogramCanvas({
  explanation,
  overlay,
  label,
}: {
  explanation: DemoExplanation;
  overlay: boolean;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const target = ref.current;
    const ctx = target?.getContext('2d');
    if (!target || !ctx) return; // no canvas support (or jsdom): axes and captions still render

    const { n_mels: rows, n_frames: cols } = explanation.mel;
    const melGrid = decodeGrid(explanation.mel.data, rows * cols);
    if (!melGrid) return;
    const lut = overlay ? greyLut : CIVIDIS_LUT;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(toCanvas(colorizeGrid(melGrid, cols, rows, lut), cols, rows), 0, 0, target.width, target.height);

    if (overlay) {
      const size = explanation.cam.size;
      const camGrid = decodeGrid(explanation.cam.data, size * size);
      if (!camGrid) return;
      ctx.globalAlpha = CAM_ALPHA;
      ctx.drawImage(toCanvas(colorizeGrid(camGrid, size, size, VIRIDIS_LUT), size, size), 0, 0, target.width, target.height);
      ctx.globalAlpha = 1;
    }
  }, [explanation, overlay]);

  return (
    <div className="flex gap-1">
      <div className="relative w-8 shrink-0" aria-hidden="true">
        {FREQUENCY_TICKS_HZ.map((hz) => (
          <span
            key={hz}
            className="absolute right-0 -translate-y-1/2 text-[10px] leading-none text-[var(--mantine-color-dimmed)]"
            style={{ bottom: `${frequencyFraction(hz) * 100}%` }}
          >
            {hz / 1000}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <canvas
          ref={ref}
          width={320}
          height={160}
          role="img"
          aria-label={label}
          className="block h-28 w-full rounded-sm border border-[var(--mantine-color-default-border)]"
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-[var(--mantine-color-dimmed)]" aria-hidden="true">
          <span>0</span>
          <span>{explanation.duration_s.toFixed(1)} s</span>
        </div>
      </div>
    </div>
  );
}

export type SaliencyLabel = { exerciseId: string; short: string };

export default function DemoSaliency({
  explanations,
  labels,
}: {
  explanations: DemoExplanation[];
  labels: SaliencyLabel[];
}) {
  return (
    <Stack gap="sm" data-testid="demo-saliency">
      <div>
        <Text fw={600} size="sm">
          Worauf das Modell geachtet hat
        </Text>
        <Text size="xs" c="dimmed">
          Links das Spektrogramm Ihrer Aufnahme (Frequenz in kHz über der Zeit), rechts dieselbe
          Aufnahme mit den Bereichen, die die Entscheidung des Modells am stärksten beeinflusst
          haben (hell = stärker).
        </Text>
      </div>

      {explanations.map((explanation, i) => {
        const label = labels[i]?.short ?? `Aufnahme ${i + 1}`;
        return (
          <div key={labels[i]?.exerciseId ?? i}>
            <Text size="xs" fw={600} mb={4}>
              {label}
              <Text span size="xs" c="dimmed" fw={400}>
                {' '}
                · Modellwert dieser Aufnahme: {(explanation.probability * 100).toFixed(0)} %
              </Text>
            </Text>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SpectrogramCanvas
                explanation={explanation}
                overlay={false}
                label={`Spektrogramm ${label}`}
              />
              <SpectrogramCanvas
                explanation={explanation}
                overlay
                label={`Spektrogramm ${label} mit hervorgehobenen Bereichen`}
              />
            </div>
          </div>
        );
      })}

      <Text size="xs" c="dimmed">
        Die Hervorhebung zeigt, welche Teile des Signals das Modell berücksichtigt hat. Sie ist
        keine ärztliche Aussage und kein Hinweis auf eine bestimmte Ursache.
      </Text>
    </Stack>
  );
}
