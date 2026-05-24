import { useEffect, useState, useCallback, useMemo } from 'react';
import { Badge, Card, Text, Title, Tooltip, useMantineTheme } from '@mantine/core';
import { motion } from 'motion/react';
import { CalendarCheck, Mic, Hourglass, TimerOff, X } from 'lucide-react';
import { getPatients, exportPatients } from '../api/client';
import type { Patient } from '../types';
import PatientList, { type DashboardFilter } from '../components/PatientList';
import AblaufdatenPanel from '../components/AblaufdatenPanel';
import CreatePatientDialog from '../components/CreatePatientDialog';
import { useAppData } from '../context/AppDataContext';

type SemColor = 'brand' | 'red' | 'cyan' | 'gray';

const FILTER_LABELS: Record<DashboardFilter, string> = {
  ALL: 'Alle Patienten',
  PRE_OP: 'Prä-OP',
  POST_OP: 'Post-OP',
  RP: 'RP Vorhersagen',
  OVERDUE_DELETE: 'Zum Löschen',
};

function KPICard({
  title,
  value,
  displayValue,
  icon,
  color,
  alert = false,
  active = false,
  dimmed = false,
  tooltip,
  onClick,
}: {
  title: string;
  value: number;
  displayValue?: string;
  icon: React.ReactNode;
  color: SemColor;
  alert?: boolean;
  active?: boolean;
  dimmed?: boolean;
  tooltip?: string;
  onClick?: () => void;
}) {
  const theme = useMantineTheme();
  const resolved = color === 'gray' ? theme.colors.gray[5] : theme.colors[color][6];

  const card = (
    <motion.div
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
      animate={{ opacity: dimmed ? 0.45 : 1 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        withBorder
        radius="md"
        padding="md"
        onClick={onClick}
        className="flex min-h-[96px] cursor-pointer flex-col transition-colors hover:shadow-[0_4px_12px_rgba(26,36,53,0.10)]"
        style={{
          borderColor: active ? resolved : 'var(--mantine-color-default-border)',
          borderWidth: 2,
          backgroundColor: active ? `${resolved}0a` : undefined,
        }}
      >
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div
            className="flex rounded-md p-2 transition-colors"
            style={{
              backgroundColor: active ? `${resolved}25` : `${resolved}18`,
              color: resolved,
            }}
          >
            {icon}
          </div>
          <Text size="xs" fw={500} c="dimmed" lh={1.2}>{title}</Text>
          <Text
            size="xl"
            fw={700}
            lh={1}
            style={{ color: alert || active ? resolved : undefined }}
          >
            {displayValue ?? value}
          </Text>
        </div>
      </Card>
    </motion.div>
  );

  return tooltip ? (
    <Tooltip label={tooltip} position="bottom" withArrow>
      <div>{card}</div>
    </Tooltip>
  ) : card;
}

export default function DashboardPage() {
  const { setNotificationCount, setPatients: setGlobalPatients } = useAppData();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const data = await getPatients();
      setPatients(data);
      setGlobalPatients(data);
    } catch {
      // 401 interceptor will clear tokens → redirect
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Title order={3} fw={700} style={{ letterSpacing: '-0.02em' }} mb={4}>
            Klinikübersicht
          </Title>
          <Text size="sm" c="dimmed">
            Verwalten Sie aktive Patienten und Aufnahmen an einem Ort.
          </Text>
        </div>
        <div className="flex shrink-0 gap-2 pt-1">
          <CreatePatientDialog onCreated={fetchPatients} buttonSize="sm" />
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-4 grid gap-4" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <KPICard
          title="Alle Patienten"
          value={stats.total}
          icon={<CalendarCheck size={18} />}
          color="brand"
          active={activeFilter === 'ALL'}
          dimmed={!!activeFilter && activeFilter !== 'ALL'}
          tooltip="Alle aktiven Patienten in der Datenbank"
          onClick={() => handleCardClick('ALL')}
        />
        <KPICard
          title="Prä-OP"
          value={stats.waitingPre}
          icon={<Mic size={18} />}
          color="brand"
          active={activeFilter === 'PRE_OP'}
          dimmed={!!activeFilter && activeFilter !== 'PRE_OP'}
          tooltip="Patienten mit ausstehenden Prä-OP-Aufnahmen"
          onClick={() => handleCardClick('PRE_OP')}
        />
        <KPICard
          title="Post-OP"
          value={stats.waitingPost}
          icon={<Hourglass size={18} />}
          color="brand"
          active={activeFilter === 'POST_OP'}
          dimmed={!!activeFilter && activeFilter !== 'POST_OP'}
          tooltip="Patienten mit abgeschlossenen Post-OP-Aufnahmen"
          onClick={() => handleCardClick('POST_OP')}
        />
        <KPICard
          title="Zum Löschen"
          value={stats.expired}
          icon={<TimerOff size={18} />}
          color="red"
          alert
          active={activeFilter === 'OVERDUE_DELETE'}
          dimmed={!!activeFilter && activeFilter !== 'OVERDUE_DELETE'}
          tooltip="Patienten mit abgelaufener Datenfrist – Löschung erforderlich"
          onClick={() => handleCardClick('OVERDUE_DELETE')}
        />
      </div>

      {activeFilter === 'OVERDUE_DELETE' && (
        <div className="mb-4">
          <AblaufdatenPanel patients={patients} />
        </div>
      )}

      {activeFilter && activeFilter !== 'OVERDUE_DELETE' && (
        <div className="mb-4 flex items-center">
          <Badge
            color="brand"
            variant="outline"
            rightSection={
              <X size={12} className="cursor-pointer" onClick={() => setActiveFilter(null)} />
            }
          >
            Filter: {FILTER_LABELS[activeFilter]}
          </Badge>
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
