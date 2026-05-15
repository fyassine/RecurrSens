import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { createPatient } from '../api/client';
import PatientAccessOptions from './PatientAccessOptions';

type ApiError = {
  response?: {
    data?: {
      patient_id?: string[];
      detail?: string;
    };
  };
};

export default function CreatePatientDialog({
  onCreated,
  buttonSx,
  buttonSize = 'small',
}: {
  onCreated: () => void;
  buttonSx?: SxProps<Theme>;
  buttonSize?: 'small' | 'medium' | 'large';
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [patientId, setPatientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string; patient_id: string } | null>(null);

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setStep(1);
      setPatientId('');
      setError('');
      setCreated(null);
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const patient = await createPatient(patientId);
      setCreated({ id: patient.id, patient_id: patient.patient_id });
      setStep(2);
      onCreated();
    } catch (err: unknown) {
      const data = (err as ApiError).response?.data;
      const detail = data?.patient_id?.[0] ?? data?.detail ?? 'Fehler beim Erstellen.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="contained"
        size={buttonSize}
        startIcon={<AddIcon />}
        onClick={() => setOpen(true)}
        sx={buttonSx}
      >
        Patient anlegen
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        {step === 1 ? (
          <form onSubmit={handleSubmit}>
            <DialogTitle>Patient erstellen</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Geben Sie die interne Patienten-ID ein, um einen neuen sicheren Token zu generieren.
              </Typography>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <TextField
                label="Patienten-ID"
                placeholder="z.B. P-1234"
                fullWidth
                required
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                autoFocus
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose}>Abbrechen</Button>
              <Button type="submit" variant="contained" disabled={loading}>
                {loading ? <CircularProgress size={20} /> : 'Weiter'}
              </Button>
            </DialogActions>
          </form>
        ) : (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
              <CheckCircleIcon />
              Patient erstellt
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Patient <strong>{created?.patient_id}</strong> ist bereit.
              </Typography>
              {created && <PatientAccessOptions patientId={created.id} patientLabel={created.patient_id} />}
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose} variant="contained">
                Fertig
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}
