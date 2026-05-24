import { Box, Typography } from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';

export default function AnalytikPage() {
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
      <BarChartIcon sx={{ fontSize: 48, color: 'divider' }} />
      <Typography variant="h6" fontWeight={600} color="text.primary">
        Analytik
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Demnächst verfügbar.
      </Typography>
    </Box>
  );
}
