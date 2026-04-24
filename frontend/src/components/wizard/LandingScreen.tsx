import { useState } from 'react';
import {
  Alert,
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
  onStart: (micStream: MediaStream) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [micError, setMicError] = useState('');

  const handleStart = async () => {
    setLoading(true);
    setMicError('');

    try {
      // Acquire microphone permission NOW — inside a click handler, which is a
      // valid "user activation" on ALL platforms including iOS Safari.
      // This pre-warms the stream so the record button never calls getUserMedia.
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      await advancePublicPatient(token);
      onStart(micStream);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setMicError(
          'Zugriff auf das Mikrofon wurde verweigert. Bitte erlauben Sie den Zugriff in den Browser-Einstellungen und versuchen Sie es erneut.'
        );
      } else if (err?.name === 'NotFoundError') {
        setMicError(
          'Kein Mikrofon gefunden. Bitte stellen Sie sicher, dass ein Mikrofon angeschlossen ist.'
        );
      } else if (!window.isSecureContext) {
        setMicError(
          'Mikrofon erfordert eine sichere Verbindung (HTTPS). Bitte verwenden Sie https://recurrsens.eu'
        );
      } else {
        alert('Fehler beim Starten. Bitte versuchen Sie es erneut.');
      }
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
        {micError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {micError}
          </Alert>
        )}
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
