import { useMemo } from 'react';
import type { Patient } from '../types';
import type { DashboardFilter } from './PatientList';

const WEEK_MS = 7 * 86400000;

function Segment({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-3 border-0 border-b-2 border-r border-solid border-b-transparent border-r-[var(--app-border)] bg-transparent px-3 py-2 text-left last:border-r-0 hover:bg-[var(--app-header-bg)]"
      style={{
        borderBottomColor: active ? color : 'transparent',
        background: active ? 'var(--app-header-bg)' : undefined,
        font: 'inherit',
      }}
    >
      <span className="truncate text-[13px]" style={{ color, fontWeight: active ? 600 : 400 }}>{label}</span>
      <span className="text-base font-semibold tabular-nums" style={{ color }}>
        {count}
      </span>
    </button>
  );
}

export default function AblaufdatenPanel({
  patients,
  activeFilter,
  onSelect,
}: {
  patients: Patient[];
  activeFilter: DashboardFilter | null;
  onSelect: (filter: DashboardFilter) => void;
}) {
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
        <Segment
          label="Bereits abgelaufen"
          count={stats.expired}
          color="var(--app-danger)"
          active={activeFilter === 'OVERDUE_DELETE'}
          onClick={() => onSelect('OVERDUE_DELETE')}
        />
        <Segment
          label="Läuft diese Woche ab"
          count={stats.thisWeek}
          color="var(--app-warning)"
          active={activeFilter === 'EXPIRES_THIS_WEEK'}
          onClick={() => onSelect('EXPIRES_THIS_WEEK')}
        />
        <Segment
          label="Läuft nächste Woche ab"
          count={stats.nextWeek}
          color="var(--app-warning)"
          active={activeFilter === 'EXPIRES_NEXT_WEEK'}
          onClick={() => onSelect('EXPIRES_NEXT_WEEK')}
        />
        <Segment
          label="Aktiv & gültig"
          count={stats.valid}
          color="var(--app-success)"
          active={activeFilter === 'EXPIRES_VALID'}
          onClick={() => onSelect('EXPIRES_VALID')}
        />
      </div>
    </div>
  );
}
