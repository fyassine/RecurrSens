import { useMemo } from 'react';
import { Paper, Text, useMantineTheme } from '@mantine/core';
import { Calendar } from 'lucide-react';
import type { Patient } from '../types';

const WEEK_MS = 7 * 86400000;

function StatBox({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-md border border-[var(--mantine-color-default-border)] bg-[var(--mantine-color-body)] px-4 py-3">
      <Text size="xs" fw={500} c="dimmed" lh={1.3}>
        {label}
      </Text>
      <div className="text-3xl font-bold leading-none" style={{ color }}>
        {count}
      </div>
    </div>
  );
}

export default function AblaufdatenPanel({ patients }: { patients: Patient[] }) {
  const theme = useMantineTheme();
  const error = theme.colors.red[6];
  const warning = theme.colors.yellow[6];
  const info = theme.colors.cyan[6];
  const success = theme.colors.green[6];
  const nowMs = Date.now();

  const stats = useMemo(() => {
    const active = patients.filter((pt) => !pt.deleted_at);
    return {
      expired: active.filter((pt) => new Date(pt.expires_at).getTime() <= nowMs).length,
      thisWeek: active.filter((pt) => {
        const t = new Date(pt.expires_at).getTime();
        return t > nowMs && t <= nowMs + WEEK_MS;
      }).length,
      nextWeek: active.filter((pt) => {
        const t = new Date(pt.expires_at).getTime();
        return t > nowMs + WEEK_MS && t <= nowMs + 2 * WEEK_MS;
      }).length,
      valid: active.filter((pt) => new Date(pt.expires_at).getTime() > nowMs + 2 * WEEK_MS).length,
    };
  }, [patients, nowMs]);

  return (
    <Paper withBorder radius="md" className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--mantine-color-default-border)] bg-[var(--mantine-color-default-hover)] px-4 py-2">
        <Calendar size={14} color={error} />
        <Text fw={700} size="sm" style={{ color: error }}>
          Ablaufdaten – Details
        </Text>
      </div>
      <div className="flex gap-3 p-4">
        <StatBox label="Bereits abgelaufen" count={stats.expired} color={error} />
        <StatBox label="Läuft diese Woche ab" count={stats.thisWeek} color={warning} />
        <StatBox label="Läuft nächste Woche ab" count={stats.nextWeek} color={info} />
        <StatBox label="Aktiv & gültig" count={stats.valid} color={success} />
      </div>
    </Paper>
  );
}
