import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  IconButton,
  Tooltip,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { Patient } from '../types';
import PatientAccessOptions from './PatientAccessOptions';

export default function PatientAccessDialog({ patient }: { patient: Patient }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip title="Zugangsoptionen">
        <IconButton size="small" onClick={() => setOpen(true)}>
          <OpenInNewIcon fontSize="small" color="primary" />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Patienten-Zugang</DialogTitle>
        <DialogContent>
          <PatientAccessOptions patientId={patient.id} patientLabel={patient.patient_id} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Schließen</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
