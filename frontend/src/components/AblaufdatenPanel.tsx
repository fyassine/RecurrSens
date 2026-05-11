import { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import type { Patient } from '../types';

const WEEK_MS = 7 * 86400000;

function StatBox({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <Box
      sx={{
        flex: '1 1 0',
        minWidth: 0,
        px: 2,
        py: 1.5,
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      <Typography fontSize="0.75rem" color="text.secondary" fontWeight={500} lineHeight={1.3}>
        {label}
      </Typography>
      <Typography fontSize="1.75rem" fontWeight={700} lineHeight={1} sx={{ color }}>
        {count}
      </Typography>
    </Box>
  );
}

export default function AblaufdatenPanel({ patients }: { patients: Patient[] }) {
  const theme = useTheme();
  const p = theme.palette;
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
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <CalendarTodayIcon sx={{ fontSize: 14, color: 'error.main' }} />
        <Typography fontWeight={700} fontSize="0.8125rem" color="error.main">
          Ablaufdaten – Details
        </Typography>
      </Box>

      <Box sx={{ p: 2, display: 'flex', gap: 1.5 }}>
        <StatBox label="Bereits abgelaufen" count={stats.expired} color={p.error.main} />
        <StatBox label="Läuft diese Woche ab" count={stats.thisWeek} color={p.warning.main} />
        <StatBox label="Läuft nächste Woche ab" count={stats.nextWeek} color={p.info.main} />
        <StatBox label="Aktiv & gültig" count={stats.valid} color={p.success.main} />
      </Box>
    </Box>
  );
}
