import { useState, useEffect } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  Collapse,
  Divider,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import { advancePublicPatient } from '../../api/client';

type PermState = 'granted' | 'prompt' | 'denied' | 'unknown';

function MicPermissionBadge({ state }: { state: PermState }) {
  if (state === 'granted') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
        <CheckCircleIcon fontSize="small" />
        <Typography variant="body2">Mikrofonzugriff erlaubt</Typography>
      </Box>
    );
  }
  if (state === 'denied') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
        <MicOffIcon fontSize="small" />
        <Typography variant="body2" fontWeight={600}>Mikrofonzugriff verweigert</Typography>
      </Box>
    );
  }
  if (state === 'prompt') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        <MicIcon fontSize="small" />
        <Typography variant="body2">Mikrofon-Erlaubnis wird beim Start abgefragt</Typography>
      </Box>
    );
  }
  return null;
}

function MicDeniedInstructions() {
  return (
    <Alert severity="error" sx={{ mt: 2 }}>
      <AlertTitle>Mikrofonzugriff verweigert</AlertTitle>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Ihr Browser blockiert den Mikrofonzugriff. So aktivieren Sie ihn:
      </Typography>

      <Typography variant="body2" fontWeight={600} gutterBottom>
        Samsung Internet
      </Typography>
      <Typography variant="body2" component="ol" sx={{ pl: 2, mb: 1.5 }}>
        <li>Tippen Sie auf das <strong>Dreistrich-Menü</strong> (☰) unten rechts</li>
        <li>Gehen Sie zu <strong>Einstellungen → Datenschutz → Website-Berechtigungen</strong></li>
        <li>Wählen Sie <strong>Mikrofon</strong> und suchen Sie diese Website</li>
        <li>Setzen Sie die Berechtigung auf <strong>Erlauben</strong></li>
        <li>Laden Sie die Seite neu</li>
      </Typography>

      <Divider sx={{ my: 1 }} />

      <Typography variant="body2" fontWeight={600} gutterBottom>
        Chrome (Android)
      </Typography>
      <Typography variant="body2" component="ol" sx={{ pl: 2, mb: 1.5 }}>
        <li>Tippen Sie auf das <strong>Schloss-Symbol</strong> in der Adressleiste</li>
        <li>Wählen Sie <strong>Berechtigungen</strong></li>
        <li>Setzen Sie <strong>Mikrofon</strong> auf <strong>Erlauben</strong></li>
        <li>Laden Sie die Seite neu</li>
      </Typography>

      <Divider sx={{ my: 1 }} />

      <Typography variant="body2" fontWeight={600} gutterBottom>
        Safari (iPhone/iPad)
      </Typography>
      <Typography variant="body2" component="ol" sx={{ pl: 2 }}>
        <li>Öffnen Sie <strong>Einstellungen</strong> auf Ihrem Gerät</li>
        <li>Scrollen Sie zu <strong>Safari</strong></li>
        <li>Tippen Sie auf <strong>Mikrofonzugriff</strong> → <strong>Fragen</strong> oder <strong>Erlauben</strong></li>
        <li>Kommen Sie zurück und laden Sie die Seite neu</li>
      </Typography>
    </Alert>
  );
}

export default function LandingScreen({
  token,
  onStart,
}: {
  token: string;
  onStart: (micStream: MediaStream) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [micError, setMicError] = useState('');
  const [permState, setPermState] = useState<PermState>('unknown');

  useEffect(() => {
    if (!navigator.permissions) return;
    let permStatus: PermissionStatus | null = null;

    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        permStatus = status;
        setPermState(status.state as PermState);
        status.onchange = () => setPermState(status.state as PermState);
      })
      .catch(() => {
        // Permissions API not supported (e.g. some Samsung Browser versions)
      });

    return () => {
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

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
      if (err?.name === 'NotAllowedError' || permState === 'denied') {
        setPermState('denied');
      } else if (err?.name === 'NotFoundError') {
        setMicError(
          'Kein Mikrofon gefunden. Bitte stellen Sie sicher, dass ein Mikrofon angeschlossen ist.'
        );
      } else if (!window.isSecureContext) {
        setMicError(
          'Mikrofon erfordert eine sichere Verbindung (HTTPS). Bitte verwenden Sie https://recurrsens.eu'
        );
      } else {
        setMicError('Fehler beim Starten. Bitte versuchen Sie es erneut.');
      }
    } finally {
      setLoading(false);
    }
  };

  const showDeniedInstructions = permState === 'denied';

  return (
    <Card sx={{ maxWidth: 640, mx: 'auto' }}>
      <CardHeader title="Willkommen zur RecurrSens Stimmprobenerfassung" />
      <CardContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Vielen Dank, dass Sie an unserer Studie zur Erfassung von Stimmproben teilnehmen.
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Sie werden gleich einige kurze Sprachaufnahmen machen. Halten Sie dazu
          den Aufnahme-Button gedrückt und lassen Sie ihn los, wenn Sie fertig sind.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ihr Betreuer wird Ihnen bei der ersten Aufnahme helfen.
        </Typography>

        <MicPermissionBadge state={permState} />

        <Collapse in={showDeniedInstructions}>
          <MicDeniedInstructions />
        </Collapse>

        {micError && !showDeniedInstructions && (
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
          disabled={loading || permState === 'denied'}
          onClick={handleStart}
        >
          {loading ? <CircularProgress size={24} /> : 'Aufnahme starten'}
        </Button>
      </CardActions>
    </Card>
  );
}
