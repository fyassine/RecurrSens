import { useState } from 'react';
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Alert,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { downloadPatientPdf } from '../api/client';

export default function PatientAccessOptions({
  patientId,
}: {
  patientId: string;
  patientLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const url = `${window.location.origin}/p/${patientId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
  };

  return (
    <>
      <List disablePadding>
        <ListItemButton onClick={() => downloadPatientPdf(patientId)}>
          <ListItemIcon>
            <PictureAsPdfIcon color="primary" />
          </ListItemIcon>
          <ListItemText
            primary="PDF öffnen"
            secondary="Enthält QR-Code für einfachen Zugang"
          />
        </ListItemButton>

        <ListItemButton onClick={handleCopy}>
          <ListItemIcon>
            {copied ? <CheckIcon color="success" /> : <ContentCopyIcon color="success" />}
          </ListItemIcon>
          <ListItemText
            primary={copied ? 'In Zwischenablage kopiert!' : 'Patienten-Link kopieren'}
            secondary="Direkten Link mit dem Patienten teilen"
          />
        </ListItemButton>

        <ListItemButton
          component="a"
          href={`/p/${patientId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ListItemIcon>
            <OpenInNewIcon color="secondary" />
          </ListItemIcon>
          <ListItemText
            primary="App öffnen"
            secondary="Patienten-Interface in neuem Tab öffnen"
          />
        </ListItemButton>
      </List>

      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled">
          Link kopiert!
        </Alert>
      </Snackbar>
    </>
  );
}
