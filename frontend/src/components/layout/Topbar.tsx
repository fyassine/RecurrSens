import { useState, useMemo } from 'react';
import {
  Badge,
  Box,
  IconButton,
  Popover,
  Typography,
  useTheme,
} from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { useLocation, useParams } from 'react-router-dom';
import { useColorMode } from '../../context/ColorModeContext';
import { useAppData } from '../../context/AppDataContext';

function getBreadcrumb(pathname: string, patientLabel?: string, token?: string): string {
  if (pathname === '/') return 'Übersicht';
  if (pathname.startsWith('/details/')) {
    const label = patientLabel || token;
    return label ? `Übersicht / ${label}` : 'Übersicht';
  }
  if (pathname.startsWith('/analytik')) return 'Analytik';
  if (pathname.startsWith('/einstellungen')) return 'Einstellungen';
  return 'Übersicht';
}

function formatTime(dateStr: string): string {
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

export default function Topbar() {
  const theme = useTheme();
  const { toggleMode } = useColorMode();
  const { patients, notificationCount } = useAppData();
  const location = useLocation();
  const { token } = useParams<{ token?: string }>();
  const [bellAnchor, setBellAnchor] = useState<null | HTMLElement>(null);

  const patientLabel = (location.state as { patientLabel?: string } | null)?.patientLabel;
  const crumb = getBreadcrumb(location.pathname, patientLabel, token);
  const isDark = theme.palette.mode === 'dark';
  const parts = crumb.split(' / ');
  const p = theme.palette;

  const activities = useMemo(() => {
    const nowMs = Date.now();
    const events: { text: React.ReactNode; time: string; dotColor: string; sort: number }[] = [];
    for (const pt of patients) {
      if (pt.status === 'POST_OP_DONE') {
        events.push({ text: <>Patient <strong>{pt.patient_id}</strong> Post-OP abgeschlossen</>, time: formatTime(pt.updated_at), dotColor: p.success.main, sort: new Date(pt.updated_at).getTime() });
      }
      if (pt.prediction_pre !== 'TODO') {
        events.push({ text: <>KI-Prä-OP Vorhersage <strong>{pt.patient_id}</strong> bereit</>, time: formatTime(pt.updated_at), dotColor: p.info.main, sort: new Date(pt.updated_at).getTime() });
      }
      if (pt.deleted_at) {
        events.push({ text: <>Patient <strong>{pt.patient_id}</strong> gelöscht</>, time: formatTime(pt.deleted_at), dotColor: p.error.main, sort: new Date(pt.deleted_at).getTime() });
      } else if (new Date(pt.expires_at).getTime() <= nowMs) {
        events.push({ text: <>Ablaufdatum <strong>{pt.patient_id}</strong> überschritten</>, time: formatTime(pt.expires_at), dotColor: p.error.main, sort: new Date(pt.expires_at).getTime() });
      }
      events.push({ text: <>Patient <strong>{pt.patient_id}</strong> angelegt</>, time: formatTime(pt.created_at), dotColor: p.info.main, sort: new Date(pt.created_at).getTime() });
    }
    return events.sort((a, b) => b.sort - a.sort).slice(0, 15);
  }, [patients, p]);

  return (
    <Box
      sx={{
        gridArea: 'topbar',
        height: 56,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        px: 3,
        gap: 2,
        position: 'sticky',
        top: 0,
        zIndex: 20,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1 }}>
        <Typography variant="body2" color="text.secondary" fontSize="0.875rem">MRI</Typography>
        {parts.map((part, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography color="text.disabled" fontSize="0.875rem">/</Typography>
            <Typography variant="body2" fontSize="0.875rem" fontWeight={i === parts.length - 1 ? 600 : 400} color={i === parts.length - 1 ? 'text.primary' : 'text.secondary'}>
              {part}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Notification bell */}
      <IconButton
        size="small"
        onClick={(e) => setBellAnchor(e.currentTarget)}
        sx={{ width: 36, height: 36, borderRadius: 1, color: 'text.secondary' }}
        title="Letzte Aktivität"
      >
        <Badge badgeContent={notificationCount > 0 ? notificationCount : undefined} color="error" max={9}
          sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', minWidth: 16, height: 16, p: '0 4px' } }}>
          <NotificationsNoneIcon sx={{ fontSize: 20 }} />
        </Badge>
      </IconButton>

      {/* Activity popover */}
      <Popover
        open={!!bellAnchor}
        anchorEl={bellAnchor}
        onClose={() => setBellAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 400, borderRadius: 2, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', mt: 0.5, border: '1px solid', borderColor: 'divider' } } }}
      >
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShowChartIcon sx={{ fontSize: 15, color: 'info.main' }} />
          <Typography fontWeight={700} fontSize="0.875rem">Letzte Aktivität</Typography>
        </Box>
        <Box sx={{ maxHeight: 480, overflowY: 'auto', p: 0.75 }}>
          {activities.length === 0 ? (
            <Typography fontSize="0.8125rem" color="text.secondary" sx={{ p: 1.5 }}>Keine Aktivitäten vorhanden.</Typography>
          ) : activities.map((ev, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5, p: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: ev.dotColor, flexShrink: 0, mt: '5px' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontSize="0.78rem" color="text.primary" lineHeight={1.4}>{ev.text}</Typography>
                <Typography fontSize="0.68rem" color="text.disabled" mt="1px">{ev.time}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Popover>

      {/* Dark / light toggle */}
      <IconButton size="small" onClick={toggleMode} title={isDark ? 'Hellmodus' : 'Dunkelmodus'}
        sx={{ width: 36, height: 36, borderRadius: 1, color: 'text.secondary' }}>
        {isDark ? <LightModeIcon sx={{ fontSize: 20 }} /> : <DarkModeIcon sx={{ fontSize: 20 }} />}
      </IconButton>
    </Box>
  );
}
