import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Alert, Title, Tooltip } from '@mantine/core';
import { getPatients, exportPatients } from '../api/client';
import type { Patient } from '../types';
import PatientList, { type DashboardFilter } from '../components/PatientList';
import AblaufdatenPanel from '../components/AblaufdatenPanel';
import CreatePatientDialog from '../components/CreatePatientDialog';
import { useAppData } from '../context/AppDataContext';

const FILTER_LABELS: Record<DashboardFilter, string> = {
  ALL: 'Alle Patienten',
  PRE_OP: 'Prä-OP',
  POST_OP: 'Post-OP',
  RP: 'RP Vorhersagen',
  OVERDUE_DELETE: 'Zum Löschen',
  EXPIRES_THIS_WEEK: 'Läuft diese Woche ab',
  EXPIRES_NEXT_WEEK: 'Läuft nächste Woche ab',
  EXPIRES_VALID: 'Aktiv & gültig',
};

const EXPIRY_FILTERS: DashboardFilter[] = ['OVERDUE_DELETE', 'EXPIRES_THIS_WEEK', 'EXPIRES_NEXT_WEEK', 'EXPIRES_VALID'];

function SummarySegment({
  title,
  value,
  alert = false,
  active = false,
  tooltip,
  onClick,
}: {
  title: string;
  value: number;
  alert?: boolean;
  active?: boolean;
  tooltip?: string;
  onClick: () => void;
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-3 border-0 border-b-2 border-r border-solid bg-transparent px-3 py-2 text-left last:border-r-0 hover:bg-[var(--app-header-bg)]"
      style={{
        borderBottomColor: active ? (alert ? 'var(--app-danger)' : 'var(--app-primary)') : 'transparent',
        borderRightColor: 'var(--app-border)',
        font: 'inherit',
      }}
    >
      <span
        className="truncate text-[13px]"
        style={{ color: alert ? 'var(--app-danger)' : active ? 'var(--app-primary)' : 'var(--app-text-secondary)', fontWeight: active ? 600 : 400 }}
      >
        {title}
      </span>
      <span
        className="text-base font-semibold tabular-nums"
        style={{ color: alert ? 'var(--app-danger)' : 'var(--app-text)' }}
      >
        {value}
      </span>
    </button>
  );
  return tooltip ? (
    <Tooltip label={tooltip} position="bottom" withArrow openDelay={400}>
      {btn}
    </Tooltip>
  ) : (
    btn
  );
}

export default function DashboardPage() {
  const { setNotificationCount, setPatients: setGlobalPatients } = useAppData();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<DashboardFilter | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const ids = selectedIds.size > 0 ? [...selectedIds] : undefined;
      await exportPatients(ids);
      if (selectedIds.size > 0) setSelectedIds(new Set());
    } finally {
      setExporting(false);
    }
  };

  const fetchPatients = useCallback(async () => {
    setFetchError('');
    try {
      const data = await getPatients();
      setPatients(data);
      setGlobalPatients(data);
    } catch (err) {
      // 401 is handled by the interceptor (refresh / redirect); surface anything
      // else so the user isn't shown a silently-empty dashboard.
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setFetchError('Patienten konnten nicht geladen werden. Bitte laden Sie die Seite neu.');
      }
    } finally {
      setLoading(false);
    }
  }, [setGlobalPatients]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleCardClick = (filter: DashboardFilter) => {
    setActiveFilter((prev) => (prev === filter ? null : filter));
  };

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: patients.length,
      waitingPre: patients.filter(
        (p) => p.status === 'NEW' || p.status === 'CONSENT_GIVEN' || p.status === 'PRE_OP_DONE',
      ).length,
      waitingPost: patients.filter(
        (p) => p.status === 'POST_OP_STARTED' || p.status === 'POST_OP_DONE',
      ).length,
      expired: patients.filter((p) => !p.deleted_at && new Date(p.expires_at).getTime() <= now).length,
    };
  }, [patients]);

  const todayNotifications = useMemo(() => {
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const now = Date.now();
    const notifiedIds = new Set<string>();
    for (const p of patients) {
      const updatedMs = new Date(p.updated_at).getTime();
      const hasEvent =
        (p.status === 'POST_OP_DONE' && updatedMs >= todayMs) ||
        (p.prediction_pre !== 'TODO' && updatedMs >= todayMs) ||
        (!!p.deleted_at && new Date(p.deleted_at).getTime() >= todayMs) ||
        (!p.deleted_at && new Date(p.expires_at).getTime() >= todayMs && new Date(p.expires_at).getTime() <= now) ||
        (new Date(p.created_at).getTime() >= todayMs);
      if (hasEvent) notifiedIds.add(p.id);
    }
    return notifiedIds.size;
  }, [patients]);

  useEffect(() => {
    setNotificationCount(todayNotifications);
  }, [todayNotifications, setNotificationCount]);

  return (
    <div>
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <Title order={3} fz={20} fw={600}>
          Patienten
        </Title>
        <CreatePatientDialog onCreated={fetchPatients} buttonSize="sm" />
      </div>

      {fetchError && (
        <Alert color="red" mb="md" withCloseButton onClose={() => setFetchError('')}>
          {fetchError}
        </Alert>
      )}

      {/* Compact summary strip (also acts as filter) */}
      <div className="section mb-3 flex flex-wrap" role="group" aria-label="Filter nach Status">
        <SummarySegment
          title="Alle Patienten"
          value={stats.total}
          active={activeFilter === 'ALL'}
          tooltip="Alle aktiven Patienten in der Datenbank"
          onClick={() => handleCardClick('ALL')}
        />
        <SummarySegment
          title="Prä-OP"
          value={stats.waitingPre}
          active={activeFilter === 'PRE_OP'}
          tooltip="Patienten mit ausstehenden Prä-OP-Aufnahmen"
          onClick={() => handleCardClick('PRE_OP')}
        />
        <SummarySegment
          title="Post-OP"
          value={stats.waitingPost}
          active={activeFilter === 'POST_OP'}
          tooltip="Patienten mit abgeschlossenen Post-OP-Aufnahmen"
          onClick={() => handleCardClick('POST_OP')}
        />
        <SummarySegment
          title="Zum Löschen"
          value={stats.expired}
          alert
          active={activeFilter !== null && EXPIRY_FILTERS.includes(activeFilter)}
          tooltip="Patienten mit abgelaufener Datenfrist – Löschung erforderlich"
          onClick={() => handleCardClick('OVERDUE_DELETE')}
        />
      </div>

      {activeFilter && EXPIRY_FILTERS.includes(activeFilter) && (
        <div className="mb-3">
          <AblaufdatenPanel
            patients={patients}
            activeFilter={activeFilter}
            onSelect={(f) => setActiveFilter(f === activeFilter ? 'OVERDUE_DELETE' : f)}
          />
        </div>
      )}

      {activeFilter && !EXPIRY_FILTERS.includes(activeFilter) && (
        <div className="mb-3 flex items-center gap-2 text-[13px] text-[var(--app-text-secondary)]">
          Filter: <strong className="font-semibold text-[var(--app-text)]">{FILTER_LABELS[activeFilter]}</strong>
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-[var(--app-primary)] underline"
          >
            zurücksetzen
          </button>
        </div>
      )}

      <PatientList
        patients={patients}
        loading={loading}
        onRefresh={fetchPatients}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        activeFilter={activeFilter}
        onExport={handleExport}
        exporting={exporting}
        exportCount={selectedIds.size}
      />
    </div>
  );
}
