import { Box, Card, CardContent, CardHeader, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function CompletedScreen() {
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
            <Typography variant="h4">Vielen Dank für Ihre Teilnahme!</Typography>
          </Box>
        }
        subheader="Beide Aufnahmen wurden erfolgreich gespeichert."
      />
      <CardContent>
        <Box sx={{ bgcolor: '#e8f5e9', p: 3, borderRadius: 2, border: '1px solid #c8e6c9', mb: 2 }}>
          <Typography variant="body2" fontWeight={500}>
            ✓ Pre-OP Aufnahme: Gespeichert
            <br />
            ✓ Post-OP Aufnahme: Gespeichert
          </Typography>
        </Box>
        <Box sx={{ bgcolor: '#e3f2fd', p: 3, borderRadius: 2, mb: 2 }}>
          <Typography variant="body2">
            Ihre Daten tragen zur medizinischen Forschung bei und helfen bei der Entwicklung
            von KI-Modellen zur automatisierten Erkennung von Stimmbandlähmungen.
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Sie können dieses Fenster nun schließen.
        </Typography>
      </CardContent>
    </Card>
  );
}
