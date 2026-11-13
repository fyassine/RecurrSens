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
 *
 * Phone layout: vowel tabs show one full-size plot at a time. The plot shows
 * the model's highlighted regions over the spectrogram; holding the button
 * swaps back to the unmodified original, so before and after stay comparable
 * at full resolution.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Collapse, SegmentedControl, Stack, Text, UnstyledButton } from '@mantine/core';
import { ChevronDown, Fingerprint, HelpCircle } from 'lucide-react';
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
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-1.5">
      <div className="relative" aria-hidden="true">
        {FREQUENCY_TICKS_HZ.map((hz) => (
          <span
            key={hz}
            className="absolute right-0 translate-y-1/2 text-xs leading-none text-[var(--mantine-color-dimmed)]"
            style={{ bottom: `${frequencyFraction(hz) * 100}%` }}
          >
            {hz / 1000}
          </span>
        ))}
        <span className="absolute right-0 top-0 text-xs leading-none text-[var(--mantine-color-dimmed)]">kHz</span>
      </div>
      <canvas
        ref={ref}
        width={640}
        height={320}
        role="img"
        aria-label={label}
        style={{ aspectRatio: '2 / 1' }}
        className="block h-auto w-full rounded-md border border-[var(--mantine-color-default-border)]"
      />
      <div />
      <div className="mt-1 flex justify-between text-xs text-[var(--mantine-color-dimmed)]" aria-hidden="true">
        <span>0 s</span>
        <span>{explanation.duration_s.toFixed(1)} s</span>
      </div>
    </div>
  );
}

export type SaliencyLabel = { exerciseId: string; short: string };

function Legend() {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--mantine-color-dimmed)]" aria-hidden="true">
      <span>weniger wichtig</span>
      <span
        className="h-2 flex-1 rounded-full"
        style={{ background: 'linear-gradient(to right,#440154,#3b528b,#21908d,#5dc863,#fde725)' }}
      />
      <span>wichtiger</span>
    </div>
  );
}

function HowToRead() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 text-[var(--mantine-color-brand-filled)]"
      >
        <HelpCircle size={16} />
        <Text size="sm" fw={600} inherit>
          Wie lese ich das?
        </Text>
        <ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </UnstyledButton>
      <Collapse in={open}>
        <Stack gap="xs" pb="xs">
          <Text size="sm" c="dimmed">
            Das Spektrogramm zeigt Ihre Stimme: Zeit von links nach rechts, Frequenz (kHz) von unten
            nach oben. Helle Bereiche im Bild markieren, was die Entscheidung des Modells am stärksten
            beeinflusst hat. Halten Sie die Taste gedrückt, um das unveränderte Original zu sehen.
          </Text>
        </Stack>
      </Collapse>
    </div>
  );
}

function Disclaimer() {
  return (
    <Text size="xs" c="dimmed">
      Die Hervorhebung zeigt, welche Teile des Signals das Modell berücksichtigt hat. Sie ist keine
      ärztliche Aussage und kein Hinweis auf eine bestimmte Ursache.
    </Text>
  );
}

const labelOf = (labels: SaliencyLabel[], i: number) => labels[i]?.short ?? `Aufnahme ${i + 1}`;

export default function DemoSaliency({
  explanations,
  labels,
}: {
  explanations: DemoExplanation[];
  labels: SaliencyLabel[];
}) {
  const [index, setIndex] = useState('0');
  const [holding, setHolding] = useState(false);
  const i = Number(index);
  const explanation = explanations[i] ?? explanations[0];
  const label = labelOf(labels, i);
  const release = () => setHolding(false);

  return (
    <Stack gap="sm" data-testid="demo-saliency">
      <Text fw={600} size="md">
        Worauf das Modell geachtet hat
      </Text>

      <SegmentedControl
        fullWidth
        size="md"
        value={index}
        onChange={setIndex}
        data={explanations.map((_, k) => ({
          value: String(k),
          label: labelOf(labels, k).replace('Vokal ', ''),
        }))}
        aria-label="Aufnahme wählen"
      />

      <SpectrogramCanvas
        explanation={explanation}
        overlay={!holding}
        label={`Spektrogramm ${label}${holding ? '' : ' mit hervorgehobenen Bereichen'}`}
      />

      <div className="flex items-center justify-between gap-2">
        <Text size="sm" fw={600}>
          {label}
          <Text span size="sm" c="dimmed" fw={400}>
            {' '}
            · Modellwert dieser Aufnahme: {(explanation.probability * 100).toFixed(0)} %
          </Text>
        </Text>
      </div>

      {holding ? (
        <Text size="xs" c="dimmed" aria-live="polite">
          Original: Spektrogramm Ihrer Aufnahme ohne Hervorhebung
        </Text>
      ) : (
        <Legend />
      )}

      <Button
        variant="light"
        size="md"
        fullWidth
        leftSection={<Fingerprint size={16} />}
        onPointerDown={() => setHolding(true)}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') setHolding(true);
        }}
        onKeyUp={release}
        onBlur={release}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'manipulation', userSelect: 'none', WebkitTouchCallout: 'none' }}
      >
        Original gedrückt halten
      </Button>

      <HowToRead />
      <Disclaimer />
    </Stack>
  );
}
