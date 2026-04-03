import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  MenuItem,
  TextField,
} from '@mui/material';
import { updatePublicPatient } from '../../api/client';

export default function DemographicsScreen({
  token,
  onComplete,
}: {
  token: string;
  onComplete: () => void;
}) {
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthDate || !gender) {
      alert('Bitte füllen Sie alle Felder aus.');
      return;
    }

    setLoading(true);
    try {
      await updatePublicPatient(token, {
        birth_date: birthDate,
        gender,
        status: 'DEMOGRAPHICS_DONE',
      });
      onComplete();
    } catch {
      alert('Fehler beim Speichern. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 640, mx: 'auto' }}>
      <CardHeader
        title="Persönliche Angaben"
        subheader="Bitte geben Sie Ihr Geburtsdatum und Geschlecht an."
      />
      <Box component="form" onSubmit={handleSubmit}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            label="Geburtsdatum"
            type="date"
            required
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Geschlecht"
            select
            required
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          >
            <MenuItem value="M">Männlich</MenuItem>
            <MenuItem value="W">Weiblich</MenuItem>
            <MenuItem value="D">Divers</MenuItem>
          </TextField>
        </CardContent>
        <CardActions sx={{ px: 2, pb: 2 }}>
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Weiter'}
          </Button>
        </CardActions>
      </Box>
    </Card>
  );
}
