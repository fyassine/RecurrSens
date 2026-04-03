import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { getPublicPatient } from '../api/client';
import type { PatientPublic, PatientStatus } from '../types';
import ConsentScreen from '../components/wizard/ConsentScreen';
import DemographicsScreen from '../components/wizard/DemographicsScreen';
import RecordingScreen from '../components/wizard/RecordingScreen';
import WaitingScreen from '../components/wizard/WaitingScreen';
import CompletedScreen from '../components/wizard/CompletedScreen';

export default function PatientWizardPage() {
  const { token } = useParams<{ token: string }>();
  const [patient, setPatient] = useState<PatientPublic | null>(null);
  const [status, setStatus] = useState<PatientStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    getPublicPatient(token)
      .then((data) => {
        setPatient(data);
        setStatus(data.status);
      })
      .catch(() => setError('Patient nicht gefunden.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !patient || !token || !status) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">{error || 'Unbekannter Fehler'}</Typography>
      </Box>
    );
  }

  const refreshPatient = async () => {
    const updated = await getPublicPatient(token);
    setPatient(updated);
  };

  const renderScreen = () => {
    switch (status) {
      case 'NEW':
        return <ConsentScreen token={token} onAccept={() => setStatus('CONSENT_GIVEN')} />;

      case 'CONSENT_GIVEN':
        return (
          <DemographicsScreen
            token={token}
            onComplete={async () => {
              await refreshPatient();
              setStatus('DEMOGRAPHICS_DONE');
            }}
          />
        );

      case 'DEMOGRAPHICS_DONE':
        return (
          <RecordingScreen
            token={token}
            patient={patient}
            phase="PRE_OP"
            onComplete={() => setStatus('PRE_OP_DONE')}
          />
        );

      case 'PRE_OP_DONE':
        return <WaitingScreen />;

      case 'POST_OP_STARTED':
        return (
          <RecordingScreen
            token={token}
            patient={patient}
            phase="POST_OP"
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
