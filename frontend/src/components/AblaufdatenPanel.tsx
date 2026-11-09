import { useMemo } from 'react';
import type { Patient } from '../types';

const WEEK_MS = 7 * 86400000;

function Segment({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 border-r border-[var(--app-border)] px-3 py-2 last:border-r-0">
      <span className="truncate text-[13px]" style={{ color }}>{label}</span>
      <span className="text-base font-semibold tabular-nums" style={{ color }}>
        {count}
      </span>
    </div>
  );
}

export default function AblaufdatenPanel({ patients }: { patients: Patient[] }) {
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
    <div className="section" aria-label="Ablaufdaten – Details">
      <div className="flex flex-wrap">
        <Segment label="Bereits abgelaufen" count={stats.expired} color="var(--app-danger)" />
        <Segment label="Läuft diese Woche ab" count={stats.thisWeek} color="var(--app-warning)" />
        <Segment label="Läuft nächste Woche ab" count={stats.nextWeek} color="var(--app-warning)" />
        <Segment label="Aktiv & gültig" count={stats.valid} color="var(--app-success)" />
      </div>
    </div>
  );
}
