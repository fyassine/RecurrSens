import { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import type { Patient } from '../types';

function PanelCard({ title, icon, children, action }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: string;
}) {
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.primary' }}>
          <Box sx={{ color: 'info.main', display: 'flex' }}>{icon}</Box>
          <Typography fontWeight={700} fontSize="0.875rem">
            {title}
          </Typography>
        </Box>
        {action && (
          <Typography
            component="span"
            fontSize="0.75rem"
            fontWeight={600}
            color="info.main"
            sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
          >
            {action}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}

function formatActivityTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  if (date >= todayStart) {
    return `Heute, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (date >= yesterdayStart) {
    return `Gestern, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface ActivityEvent {
  text: React.ReactNode;
  time: string;
  dotColor: string;
  sortDate: Date;
}

export default function RightPanel({ patients }: { patients: Patient[] }) {
  const theme = useTheme();
  const nowMs = Date.now();
  const weekMs = 7 * 86400000;

  const expiryStats = useMemo(() => {
    const active = patients.filter((p) => !p.deleted_at);
    return {
      expired: active.filter((p) => new Date(p.expires_at).getTime() <= nowMs).length,
      thisWeek: active.filter((p) => {
        const t = new Date(p.expires_at).getTime();
        return t > nowMs && t <= nowMs + weekMs;
      }).length,
      nextWeek: active.filter((p) => {
        const t = new Date(p.expires_at).getTime();
        return t > nowMs + weekMs && t <= nowMs + 2 * weekMs;
      }).length,
      valid: active.filter((p) => new Date(p.expires_at).getTime() > nowMs + 2 * weekMs).length,
    };
  }, [patients, nowMs]);

  const activities = useMemo((): ActivityEvent[] => {
    const events: ActivityEvent[] = [];

    for (const p of patients) {
      // Post-OP completed
      if (p.status === 'POST_OP_DONE') {
        events.push({
          text: <>Patient <strong>{p.patient_id}</strong> Post-OP abgeschlossen</>,
          time: formatActivityTime(p.updated_at),
          dotColor: theme.palette.success.main,
          sortDate: new Date(p.updated_at),
        });
      }
      // KI prediction ready
      if (p.prediction_pre !== 'TODO') {
        events.push({
          text: <>KI-Prä-OP Vorhersage <strong>{p.patient_id}</strong> bereit</>,
          time: formatActivityTime(p.updated_at),
          dotColor: theme.palette.info.main,
          sortDate: new Date(p.updated_at),
        });
      }
      // Deleted
      if (p.deleted_at) {
        events.push({
          text: <>Patient <strong>{p.patient_id}</strong> gelöscht</>,
          time: formatActivityTime(p.deleted_at),
          dotColor: theme.palette.error.main,
          sortDate: new Date(p.deleted_at),
        });
      }
      // Expired
      if (!p.deleted_at && new Date(p.expires_at).getTime() <= nowMs) {
        events.push({
          text: <>Ablaufdatum <strong>{p.patient_id}</strong> überschritten</>,
          time: formatActivityTime(p.expires_at),
          dotColor: theme.palette.error.main,
          sortDate: new Date(p.expires_at),
        });
      }
      // Created
      events.push({
        text: <>Patient <strong>{p.patient_id}</strong> angelegt</>,
        time: formatActivityTime(p.created_at),
        dotColor: theme.palette.info.main,
        sortDate: new Date(p.created_at),
      });
    }

    return events.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime()).slice(0, 8);
  }, [patients, nowMs, theme]);

  const expiryRows = [
    { label: 'Bereits abgelaufen', count: expiryStats.expired, color: theme.palette.error.main },
    { label: 'Läuft diese Woche ab', count: expiryStats.thisWeek, color: theme.palette.warning.main },
    { label: 'Läuft nächste Woche ab', count: expiryStats.nextWeek, color: theme.palette.warning.main },
    { label: 'Aktiv & gültig', count: expiryStats.valid, color: theme.palette.success.main },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Ablaufdaten */}
      <PanelCard title="Ablaufdaten" icon={<CalendarTodayIcon sx={{ fontSize: 15 }} />} action="Details">
        <Box sx={{ px: 2 }}>
          {expiryRows.map((row, i) => (
            <Box
              key={row.label}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                py: 1,
                borderBottom: i < expiryRows.length - 1 ? '1px solid' : 'none',
                borderColor: 'divider',
              }}
            >
              <Typography fontSize="0.8125rem" color="text.secondary">
                {row.label}
              </Typography>
              <Typography
                fontSize="0.875rem"
                fontWeight={700}
                sx={{ color: row.count > 0 ? row.color : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
              >
                {row.count}
              </Typography>
            </Box>
          ))}
        </Box>
      </PanelCard>

      {/* Letzte Aktivität */}
      <PanelCard title="Letzte Aktivität" icon={<ShowChartIcon sx={{ fontSize: 15 }} />} action="Alle">
        <Box sx={{ p: 1, maxHeight: 260, overflowY: 'auto' }}>
          {activities.length === 0 ? (
            <Typography fontSize="0.8125rem" color="text.secondary" sx={{ p: 1.5 }}>
              Keine Aktivitäten vorhanden.
            </Typography>
          ) : (
            activities.map((ev, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  p: 1,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: ev.dotColor,
                    flexShrink: 0,
                    mt: '5px',
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontSize="0.78rem" color="text.primary" lineHeight={1.4}>
                    {ev.text}
                  </Typography>
                  <Typography fontSize="0.68rem" color="text.disabled" mt="1px">
                    {ev.time}
                  </Typography>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </PanelCard>
    </Box>
  );
}
