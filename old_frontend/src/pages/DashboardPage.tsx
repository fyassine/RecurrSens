import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import MicIcon from '@mui/icons-material/Mic';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TimerOffIcon from '@mui/icons-material/TimerOff';
import { getPatients, exportPatients } from '../api/client';
import type { Patient } from '../types';
import PatientList, { type DashboardFilter } from '../components/PatientList';
import AblaufdatenPanel from '../components/AblaufdatenPanel';
import CreatePatientDialog from '../components/CreatePatientDialog';
import { useAppData } from '../context/AppDataContext';

type PaletteColorKey = 'primary' | 'info' | 'secondary' | 'error' | 'success' | 'neutral';

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
  color: PaletteColorKey;
  alert?: boolean;
  active?: boolean;
  dimmed?: boolean;
  tooltip?: string;
  onClick?: () => void;
}) {
  const theme = useTheme();

  const resolvedColor = (() => {
    if (color === 'neutral') return theme.palette.grey[500];
    return theme.palette[color].main;
  })();

  const card = (
    <Card
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 96,
        border: active ? `2px solid ${resolvedColor}` : '2px solid transparent',
        bgcolor: active ? `${resolvedColor}0a` : 'background.paper',
        opacity: dimmed ? 0.45 : 1,
        transition: 'border-color 0.2s, background-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s',
        '&:hover': { boxShadow: '0 4px 12px rgba(26,36,53,0.10)', transform: 'translateY(-1px)', opacity: dimmed ? 0.7 : 1 },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ flex: 1 }}>
        <CardContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 0.75,
            py: '14px !important',
            px: '12px !important',
          }}
        >
          <Box
            sx={{
              bgcolor: active ? `${resolvedColor}25` : `${resolvedColor}18`,
              color: resolvedColor,
              p: 1,
              borderRadius: 1.5,
              display: 'flex',
              transition: 'background-color 0.15s',
            }}
          >
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500} lineHeight={1.2} fontSize="0.75rem">
            {title}
          </Typography>
          <Typography
            variant="h5"
            fontWeight={700}
            color={(alert || active) ? resolvedColor : 'text.primary'}
            lineHeight={1}
          >
            {displayValue ?? value}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );

  return tooltip ? <Tooltip title={tooltip} arrow placement="bottom">{card}</Tooltip> : card;
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
    setActiveFilter((prev: DashboardFilter | null) => (prev === filter ? null : filter));
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
      rpPredictions: patients.filter(
        (p) => p.prediction_pre === 'INFECTED' || p.prediction_post === 'INFECTED',
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
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
            Klinikübersicht
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Verwalten Sie aktive Patienten und Aufnahmen an einem Ort.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, pt: 0.5, flexShrink: 0 }}>
          <CreatePatientDialog onCreated={fetchPatients} buttonSize="medium" />
        </Box>
      </Box>

      {/* KPI strip */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: 2,
          mb: 2,
        }}
      >
        <KPICard
          title="Alle Patienten"
          value={stats.total}
          icon={<EventAvailableIcon fontSize="small" />}
          color="primary"
          active={activeFilter === 'ALL'}
          dimmed={!!activeFilter && activeFilter !== 'ALL'}
          tooltip="Alle aktiven Patienten in der Datenbank"
          onClick={() => handleCardClick('ALL')}
        />
        <KPICard
          title="Prä-OP"
          value={stats.waitingPre}
          icon={<MicIcon fontSize="small" />}
          color="primary"
          active={activeFilter === 'PRE_OP'}
          dimmed={!!activeFilter && activeFilter !== 'PRE_OP'}
          tooltip="Patienten mit ausstehenden Prä-OP-Aufnahmen"
          onClick={() => handleCardClick('PRE_OP')}
        />
        <KPICard
          title="Post-OP"
          value={stats.waitingPost}
          icon={<HourglassEmptyIcon fontSize="small" />}
          color="primary"
          active={activeFilter === 'POST_OP'}
          dimmed={!!activeFilter && activeFilter !== 'POST_OP'}
          tooltip="Patienten mit abgeschlossenen Post-OP-Aufnahmen"
          onClick={() => handleCardClick('POST_OP')}
        />
        <KPICard
          title="KI Vorhersagen"
          value={stats.rpPredictions}
          displayValue="..."
          icon={<WarningAmberIcon fontSize="small" />}
          color="error"
          alert
          active={activeFilter === 'RP'}
          dimmed={!!activeFilter && activeFilter !== 'RP'}
          tooltip="Patienten mit KI-Vorhersage für rezidivierende Parotitis – sofortige Überprüfung erforderlich"
          onClick={() => handleCardClick('RP')}
        />
        <KPICard
          title="Zum Löschen"
          value={stats.expired}
          icon={<TimerOffIcon fontSize="small" />}
          color="error"
          alert
          active={activeFilter === 'OVERDUE_DELETE'}
          dimmed={!!activeFilter && activeFilter !== 'OVERDUE_DELETE'}
          tooltip="Patienten mit abgelaufener Datenfrist – Löschung erforderlich"
          onClick={() => handleCardClick('OVERDUE_DELETE')}
        />
      </Box>

      {/* Ablaufdaten expanded panel — shown when Zum Löschen is active */}
      {activeFilter === 'OVERDUE_DELETE' && (
        <Box sx={{ mb: 2 }}>
          <AblaufdatenPanel patients={patients} />
        </Box>
      )}

      {/* Active filter chip (for other filters) */}
      {activeFilter && activeFilter !== 'OVERDUE_DELETE' && (
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Chip
            label={`Filter: ${FILTER_LABELS[activeFilter]}`}
            onDelete={() => setActiveFilter(null)}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>
      )}

      {/* Patient table — full width */}
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
    </Box>
  );
}
