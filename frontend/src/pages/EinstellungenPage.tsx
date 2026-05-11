import { Box, Typography } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';

export default function EinstellungenPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 2,
        color: 'text.secondary',
      }}
    >
      <SettingsIcon sx={{ fontSize: 48, color: 'divider' }} />
      <Typography variant="h6" fontWeight={600} color="text.primary">
        Einstellungen
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Demnächst verfügbar.
      </Typography>
    </Box>
  );
}
