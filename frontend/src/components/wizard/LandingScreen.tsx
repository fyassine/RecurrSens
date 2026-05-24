import { useState, useEffect } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Divider,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { CheckCircle2, Mic, MicOff } from 'lucide-react';
import { advancePublicPatient } from '../../api/client';

type PermState = 'granted' | 'prompt' | 'denied' | 'unknown';

function MicPermissionBadge({ state }: { state: PermState }) {
  if (state === 'granted') {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle2 size={16} />
        <Text size="sm">Mikrofonzugriff erlaubt</Text>
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <MicOff size={16} />
        <Text size="sm" fw={600}>Mikrofonzugriff verweigert</Text>
      </div>
    );
  }
  if (state === 'prompt') {
    return (
      <div className="flex items-center gap-2 text-[var(--mantine-color-dimmed)]">
        <Mic size={16} />
        <Text size="sm">Mikrofon-Erlaubnis wird beim Start abgefragt</Text>
      </div>
    );
  }
  return null;
}

function MicDeniedInstructions() {
  return (
    <Alert color="red" mt="md" title="Mikrofonzugriff verweigert">
      <Text size="sm" mb="xs">
        Ihr Browser blockiert den Mikrofonzugriff. So aktivieren Sie ihn:
      </Text>

      <Text size="sm" fw={600} mb={4}>Samsung Internet</Text>
      <Text size="sm" component="ol" className="mb-3 pl-4">
        <li>Tippen Sie auf das <strong>Dreistrich-Menü</strong> (☰) unten rechts</li>
        <li>Gehen Sie zu <strong>Einstellungen → Datenschutz → Website-Berechtigungen</strong></li>
        <li>Wählen Sie <strong>Mikrofon</strong> und suchen Sie diese Website</li>
        <li>Setzen Sie die Berechtigung auf <strong>Erlauben</strong></li>
        <li>Laden Sie die Seite neu</li>
      </Text>

      <Divider my="xs" />

      <Text size="sm" fw={600} mb={4}>Chrome (Android)</Text>
      <Text size="sm" component="ol" className="mb-3 pl-4">
        <li>Tippen Sie auf das <strong>Schloss-Symbol</strong> in der Adressleiste</li>
        <li>Wählen Sie <strong>Berechtigungen</strong></li>
        <li>Setzen Sie <strong>Mikrofon</strong> auf <strong>Erlauben</strong></li>
        <li>Laden Sie die Seite neu</li>
      </Text>

      <Divider my="xs" />

      <Text size="sm" fw={600} mb={4}>Safari (iPhone/iPad)</Text>
      <Text size="sm" component="ol" className="pl-4">
        <li>Öffnen Sie <strong>Einstellungen</strong> auf Ihrem Gerät</li>
        <li>Scrollen Sie zu <strong>Safari</strong></li>
        <li>Tippen Sie auf <strong>Mikrofonzugriff</strong> → <strong>Fragen</strong> oder <strong>Erlauben</strong></li>
        <li>Kommen Sie zurück und laden Sie die Seite neu</li>
      </Text>
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
        // Permissions API not supported
      });

    return () => {
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  const handleStart = async () => {
    setLoading(true);
    setMicError('');

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await advancePublicPatient(token);
      onStart(micStream);
    } catch (err: unknown) {
      const errName =
        err instanceof Error
          ? err.name
          : typeof err === 'object' && err && 'name' in err
            ? String((err as { name?: unknown }).name)
            : undefined;
      if (errName === 'NotAllowedError' || permState === 'denied') {
        setPermState('denied');
      } else if (errName === 'NotFoundError') {
        setMicError('Kein Mikrofon gefunden. Bitte stellen Sie sicher, dass ein Mikrofon angeschlossen ist.');
      } else if (!window.isSecureContext) {
        setMicError('Mikrofon erfordert eine sichere Verbindung (HTTPS). Bitte verwenden Sie https://recurrsens.eu');
      } else {
        setMicError('Fehler beim Starten. Bitte versuchen Sie es erneut.');
      }
    } finally {
      setLoading(false);
    }
  };

  const showDeniedInstructions = permState === 'denied';

  return (
    <Card withBorder radius="md" maw={640} mx="auto" p="lg">
      <Title order={4} mb="md">Willkommen zur RecurrSens Stimmprobenerfassung</Title>
      <Stack gap="md">
        <Text>Vielen Dank, dass Sie an unserer Studie zur Erfassung von Stimmproben teilnehmen.</Text>
        <Text>
          Sie werden gleich einige kurze Sprachaufnahmen machen. Halten Sie dazu
          den Aufnahme-Button gedrückt und lassen Sie ihn los, wenn Sie fertig sind.
        </Text>
        <Text size="sm" c="dimmed">Ihr Betreuer wird Ihnen bei der ersten Aufnahme helfen.</Text>

        <MicPermissionBadge state={permState} />

        <Collapse in={showDeniedInstructions}>
          <MicDeniedInstructions />
        </Collapse>

        {micError && !showDeniedInstructions && (
          <Alert color="red">{micError}</Alert>
        )}

        <Button
          fullWidth
          size="lg"
          loading={loading}
          disabled={permState === 'denied'}
          onClick={handleStart}
        >
          Aufnahme starten
        </Button>
      </Stack>
    </Card>
  );
}
