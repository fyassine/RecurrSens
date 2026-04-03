import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Typography,
} from '@mui/material';
import { updatePublicPatient } from '../../api/client';

export default function ConsentScreen({
  token,
  onAccept,
}: {
  token: string;
  onAccept: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      await updatePublicPatient(token, { status: 'CONSENT_GIVEN' });
      onAccept();
    } catch {
      alert('Fehler beim Speichern. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 640, mx: 'auto' }}>
      <CardHeader
        title="Willkommen zur TUM Stimmprobenerfassung"
        subheader="Bitte lesen Sie die folgende Einwilligungserklärung sorgfältig durch."
      />
      <CardContent>
        <Box
          sx={{
            bgcolor: 'grey.100',
            p: 3,
            borderRadius: 2,
            maxHeight: 380,
            overflow: 'auto',
            mb: 3,
          }}
        >
          <Typography variant="body2" paragraph>
            Sehr geehrte Patientin, sehr geehrter Patient,
          </Typography>
          <Typography variant="body2" paragraph>
            wir möchten Sie bitten, an dieser wissenschaftlichen Studie zur Erfassung von
            Stimmproben teilzunehmen. Die Daten werden ausschließlich zu Forschungszwecken
            verwendet und dienen der Entwicklung von KI-Modellen zur automatisierten
            Erkennung von Recurrensparesen.
          </Typography>
          <Typography variant="body2" paragraph>
            <strong>Datenerfassung:</strong> Es werden zwei Audioaufnahmen Ihrer Stimme
            erstellt (vor und nach der Operation) sowie demografische Daten (Alter und
            Geschlecht).
          </Typography>
          <Typography variant="body2" paragraph>
            <strong>Datenschutz:</strong> Alle Daten werden pseudonymisiert gespeichert und
            ausschließlich auf Servern der TUM verarbeitet.
          </Typography>
          <Typography variant="body2">
            <strong>Freiwilligkeit:</strong> Die Teilnahme ist freiwillig und kann jederzeit
            ohne Angabe von Gründen widerrufen werden.
          </Typography>
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
          }
          label="Ich habe die Einwilligungserklärung gelesen und akzeptiere diese."
        />
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={!accepted || loading}
          onClick={handleAccept}
        >
          {loading ? <CircularProgress size={24} /> : 'Akzeptieren und fortfahren'}
        </Button>
      </CardActions>
    </Card>
  );
}
