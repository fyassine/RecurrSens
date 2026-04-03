import { Chip } from '@mui/material';
import type { PatientStatus, Diagnosis, PredictionStatus } from '../types';

const STATUS_CONFIG: Record<PatientStatus, { label: string; color: string; bg: string }> = {
  NEW: { label: 'Einwilligung', color: '#616161', bg: '#f5f5f5' },
  CONSENT_GIVEN: { label: 'Demografie', color: '#1565c0', bg: '#e3f2fd' },
  DEMOGRAPHICS_DONE: { label: 'Prä-OP', color: '#283593', bg: '#e8eaf6' },
  PRE_OP_DONE: { label: 'Freigabe', color: '#6a1b9a', bg: '#f3e5f5' },
  POST_OP_STARTED: { label: 'Post-OP', color: '#e65100', bg: '#fff3e0' },
  POST_OP_DONE: { label: 'Aufnahmen fertig', color: '#00695c', bg: '#e0f2f1' },
  COMPLETED: { label: 'Abgeschlossen', color: '#2e7d32', bg: '#e8f5e9' },
};

export function StatusBadge({ status }: { status: PatientStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: '#616161', bg: '#f5f5f5' };
  return (
    <Chip
      label={config.label}
      size="small"
      sx={{ bgcolor: config.bg, color: config.color, fontWeight: 500 }}
    />
  );
}

const DIAGNOSIS_CONFIG: Record<Diagnosis, { label: string; color: string; bg: string }> = {
  TODO: { label: 'Ausstehend', color: '#9e9e9e', bg: '#f5f5f5' },
  LEFT: { label: 'Linksseitige RP', color: '#1565c0', bg: '#e3f2fd' },
  RIGHT: { label: 'Rechtsseitige RP', color: '#c62828', bg: '#fce4ec' },
  BOTH: { label: 'Beidseitige RP', color: '#6a1b9a', bg: '#f3e5f5' },
  HEALTHY: { label: 'Keine RP', color: '#2e7d32', bg: '#e8f5e9' },
};

export function DiagnosisBadge({ value }: { value: Diagnosis }) {
  const config = DIAGNOSIS_CONFIG[value] ?? DIAGNOSIS_CONFIG.TODO;
  return (
    <Chip
      label={config.label}
      size="small"
      sx={{ bgcolor: config.bg, color: config.color, fontWeight: 500 }}
    />
  );
}

const PREDICTION_CONFIG: Record<PredictionStatus, { label: string; color: string; bg: string }> = {
  TODO: { label: 'Ausstehend', color: '#9e9e9e', bg: '#f5f5f5' },
  INFECTED: { label: 'RP', color: '#c62828', bg: '#ffebee' },
  HEALTHY: { label: 'keine RP', color: '#2e7d32', bg: '#e8f5e9' },
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
  const filmConfig = PREDICTION_CONFIG[value] ?? PREDICTION_CONFIG.TODO;
  const filmLabel = `FiLM: ${filmConfig.label}${
    percentage != null && percentage > 0 ? ` (${percentage.toFixed(2)}%)` : ''
  }`;

  const gcKey = (gradcamPrediction?.toUpperCase() ?? 'TODO') as PredictionStatus;
  const gcConfig = PREDICTION_CONFIG[gcKey] ?? PREDICTION_CONFIG.TODO;

  return (
    <>
      <Chip
        label={filmLabel}
        size="small"
        sx={{ bgcolor: filmConfig.bg, color: filmConfig.color, fontWeight: 500 }}
      />
      {gradcamPrediction && (
        <Chip
          label={`GC: ${gcConfig.label}${
            gradcamPercentage != null && gradcamPercentage > 0
              ? ` (${gradcamPercentage.toFixed(2)}%)`
              : ''
          }`}
          size="small"
          sx={{ bgcolor: gcConfig.bg, color: gcConfig.color, fontWeight: 500, ml: 0.5 }}
        />
      )}
    </>
  );
}
