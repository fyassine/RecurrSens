import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { getPublicPatient } from '../api/client';
import type { PatientStatus } from '../types';
import LandingScreen from '../components/wizard/LandingScreen';
import RecordingScreen from '../components/wizard/RecordingScreen';
import WaitingScreen from '../components/wizard/WaitingScreen';
import CompletedScreen from '../components/wizard/CompletedScreen';

export default function PatientWizardPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<PatientStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pre-warmed mic stream, acquired on the LandingScreen's "Start" click.
  // Kept alive across exercises so every record-press is instant (no getUserMedia).
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!token) return;
    getPublicPatient(token)
      .then((data) => {
        setStatus(data.status);
      })
      .catch(() => setError('Patient nicht gefunden.'))
      .finally(() => setLoading(false));
  }, [token]);

  // Clean up the mic stream when the wizard unmounts (user leaves page, etc.)
  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleLandingStart = (stream: MediaStream) => {
    micStreamRef.current = stream;
    setMicStream(stream);
    setStatus('CONSENT_GIVEN');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !token || !status) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">{error || 'Unbekannter Fehler'}</Typography>
      </Box>
    );
  }

  const renderScreen = () => {
    switch (status) {
      case 'NEW':
        return <LandingScreen token={token} onStart={handleLandingStart} />;

      case 'CONSENT_GIVEN':
        return (
          <RecordingScreen
            token={token}
            phase="PRE_OP"
            micStream={micStream}
            onComplete={() => setStatus('PRE_OP_DONE')}
          />
        );

      case 'PRE_OP_DONE':
        return <WaitingScreen />;

      case 'POST_OP_STARTED':
        return (
          <RecordingScreen
            token={token}
            phase="POST_OP"
            micStream={micStream}
            onComplete={() => setStatus('POST_OP_DONE')}
          />
        );

      case 'POST_OP_DONE':
      case 'COMPLETED':
        return <CompletedScreen />;

      default:
        return <Typography>Unbekannter Status: {status}</Typography>;
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 6, px: 2 }}>
      {renderScreen()}
    </Box>
  );
}
