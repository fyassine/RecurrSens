import type { CSSProperties } from 'react';
import type { PatientStatus, PredictionStatus } from '../types';

type Tone = 'neutral' | 'success' | 'info' | 'danger';

const TONE_COLOR: Record<Tone, string> = {
  neutral: 'var(--app-text-secondary)',
  success: 'var(--app-success)',
  info: 'var(--app-primary)',
  danger: 'var(--app-danger)',
};

/** Compact semantic label: colored dot + text, no filled pill. */
function StatusLabel({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className="status-label"
      style={{ ['--status-color' as string]: TONE_COLOR[tone], color: 'var(--app-text)' } as CSSProperties}
    >
      {children}
    </span>
  );
}

export function PostOpSessionBadge({ sessionNumber, complete }: { sessionNumber: number; complete: boolean }) {
  return (
    <StatusLabel tone={complete ? 'success' : 'info'}>
      Post-OP {sessionNumber} {complete ? 'vollständig' : 'unvollständig'}
    </StatusLabel>
  );
}

const STATUS_CONFIG: Record<PatientStatus, { label: string; tone: Tone }> = {
  NEW: { label: 'Prä-OP unvollständig', tone: 'neutral' },
  CONSENT_GIVEN: { label: 'Prä-OP unvollständig', tone: 'neutral' },
  PRE_OP_DONE: { label: 'Prä-OP vollständig', tone: 'success' },
  POST_OP_STARTED: { label: 'Post-OP unvollständig', tone: 'neutral' },
  POST_OP_DONE: { label: 'Post-OP vollständig', tone: 'success' },
};

export function StatusBadge({ status }: { status: PatientStatus }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.NEW;
  return <StatusLabel tone={c.tone}>{c.label}</StatusLabel>;
}

const PREDICTION_CONFIG: Record<PredictionStatus, { label: string; tone: Tone }> = {
  TODO: { label: 'Ausstehend...', tone: 'neutral' },
  INFECTED: { label: 'RP', tone: 'danger' },
  HEALTHY: { label: 'Keine RP', tone: 'success' },
};

export function PredictionBadge({
  value,
  percentage,
  gradcamPrediction,
  gradcamPercentage,
}: {
  value: PredictionStatus;
  percentage?: number | null;
  gradcamPrediction?: string | null;
  gradcamPercentage?: number | null;
}) {
  const c = PREDICTION_CONFIG[value] ?? PREDICTION_CONFIG.TODO;
  const label =
    value === 'TODO'
      ? c.label
      : `${c.label}${percentage != null && percentage > 0 ? ` (${percentage.toFixed(2)}%)` : ''}`;

  const gcKey = (gradcamPrediction?.toUpperCase() ?? 'TODO') as PredictionStatus;
  const gc = PREDICTION_CONFIG[gcKey] ?? PREDICTION_CONFIG.TODO;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
      <StatusLabel tone={c.tone}>{label}</StatusLabel>
      {gradcamPrediction && (
        <StatusLabel tone={gc.tone}>
          GC: {gc.label}
          {gradcamPercentage != null && gradcamPercentage > 0 ? ` (${gradcamPercentage.toFixed(2)}%)` : ''}
        </StatusLabel>
      )}
    </span>
  );
}
