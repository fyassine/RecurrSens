import { Box, Card, CardContent, CardHeader, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function WaitingScreen() {
  return (
    <Card sx={{ maxWidth: 640, mx: 'auto', textAlign: 'center' }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                bgcolor: 'success.light',
                borderRadius: '50%',
                width: 80,
                height: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main' }} />
            </Box>
            <Typography variant="h4">Vielen Dank!</Typography>
          </Box>
        }
        subheader="Ihre Pre-OP Aufnahme wurde erfolgreich gespeichert."
      />
      <CardContent>
        <Box sx={{ bgcolor: '#e3f2fd', p: 3, borderRadius: 2, mb: 2 }}>
          <Typography variant="body2">
            Nach Ihrer Operation wird das Klinikpersonal die zweite Aufnahme für Sie
            freischalten. Sie können dann denselben Link verwenden, um die Post-OP Aufnahme
            durchzuführen.
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Sie können dieses Fenster nun schließen.
        </Typography>
      </CardContent>
    </Card>
  );
}
