import { useState } from 'react';
import {
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  Typography,
} from '@mui/material';
import { advancePublicPatient } from '../../api/client';

export default function LandingScreen({
  token,
  onStart,
}: {
  token: string;
  onStart: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      await advancePublicPatient(token);
      onStart();
    } catch {
      alert('Fehler beim Starten. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 640, mx: 'auto' }}>
      <CardHeader title="Willkommen zur RecurrSens Stimmprobenerfassung" />
      <CardContent>
        <Typography variant="body1" paragraph>
          Vielen Dank, dass Sie an unserer Studie zur Erfassung von Stimmproben teilnehmen.
        </Typography>
        <Typography variant="body1" paragraph>
          Sie werden gleich einige kurze Sprachaufnahmen machen. Halten Sie dazu
          den Aufnahme-Button gedrückt und lassen Sie ihn los, wenn Sie fertig sind.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Ihr Betreuer wird Ihnen bei der ersten Aufnahme helfen.
        </Typography>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={loading}
          onClick={handleStart}
        >
          {loading ? <CircularProgress size={24} /> : 'Aufnahme starten'}
        </Button>
      </CardActions>
    </Card>
  );
}
