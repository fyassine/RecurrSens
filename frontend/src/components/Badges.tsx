import { Badge, useMantineColorScheme } from '@mantine/core';
import type { PatientStatus, PredictionStatus } from '../types';

export function PostOpSessionBadge({ sessionNumber, complete }: { sessionNumber: number; complete: boolean }) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const color = complete
    ? isDark ? '#4ade80' : '#2e7d32'
    : isDark ? '#60a5fa' : '#1565c0';
  const bg = complete
    ? isDark ? 'rgba(74,222,128,0.12)' : '#e8f5e9'
    : isDark ? 'rgba(96,165,250,0.12)' : '#e3f2fd';
  return (
    <Badge
      variant="filled"
      size="lg"
      radius="sm"
      style={{ backgroundColor: bg, color, fontWeight: 500, textTransform: 'none' }}
    >
      Post-OP {sessionNumber} {complete ? 'vollständig' : 'unvollständig'}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: PatientStatus }) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const config: Record<PatientStatus, { label: string; color: string; bg: string }> = {
    NEW: {
      label: 'Prä-OP unvollständig',
      color: isDark ? '#9aafc4' : '#616161',
      bg: isDark ? 'rgba(154,175,196,0.15)' : '#f5f5f5',
    },
    CONSENT_GIVEN: {
      label: 'Prä-OP unvollständig',
      color: isDark ? '#9aafc4' : '#616161',
      bg: isDark ? 'rgba(154,175,196,0.15)' : '#f5f5f5',
    },
    PRE_OP_DONE: {
      label: 'Prä-OP vollständig',
      color: isDark ? '#4ade80' : '#2e7d32',
      bg: isDark ? 'rgba(74,222,128,0.12)' : '#e8f5e9',
    },
    POST_OP_STARTED: {
      label: 'Post-OP unvollständig',
      color: isDark ? '#9aafc4' : '#616161',
      bg: isDark ? 'rgba(154,175,196,0.15)' : '#f5f5f5',
    },
    POST_OP_DONE: {
      label: 'Post-OP vollständig',
      color: isDark ? '#4ade80' : '#2e7d32',
      bg: isDark ? 'rgba(74,222,128,0.12)' : '#e8f5e9',
    },
  };

  const c = config[status] ?? config.NEW;
  return (
    <Badge
      variant="filled"
      size="lg"
      radius="sm"
      style={{ backgroundColor: c.bg, color: c.color, fontWeight: 500, textTransform: 'none' }}
    >
      {c.label}
    </Badge>
  );
}

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
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const config: Record<PredictionStatus, { label: string; color: string; bg: string }> = {
    TODO: {
      label: 'Ausstehend...',
      color: isDark ? '#7a90a8' : '#9e9e9e',
      bg: isDark ? 'rgba(122,144,168,0.12)' : '#f5f5f5',
    },
    INFECTED: {
      label: 'RP',
      color: isDark ? '#f87171' : '#c62828',
      bg: isDark ? 'rgba(248,113,113,0.12)' : '#ffebee',
    },
    HEALTHY: {
      label: 'Keine RP',
      color: isDark ? '#4ade80' : '#2e7d32',
      bg: isDark ? 'rgba(74,222,128,0.12)' : '#e8f5e9',
    },
  };

  const c = config[value] ?? config.TODO;
  const label =
    value === 'TODO'
      ? c.label
      : `${c.label}${percentage != null && percentage > 0 ? ` (${percentage.toFixed(2)}%)` : ''}`;

  const gcKey = (gradcamPrediction?.toUpperCase() ?? 'TODO') as PredictionStatus;
  const gcConfig = config[gcKey] ?? config.TODO;

  return (
    <>
      <Badge
        variant="filled"
        radius="sm"
        style={{ backgroundColor: c.bg, color: c.color, fontWeight: 500, textTransform: 'none' }}
      >
        {label}
      </Badge>
      {gradcamPrediction && (
        <Badge
          variant="filled"
          radius="sm"
          ml={4}
          style={{
            backgroundColor: gcConfig.bg,
            color: gcConfig.color,
            fontWeight: 500,
            textTransform: 'none',
          }}
        >
          GC: {gcConfig.label}
          {gradcamPercentage != null && gradcamPercentage > 0
            ? ` (${gradcamPercentage.toFixed(2)}%)`
            : ''}
        </Badge>
      )}
    </>
  );
}
