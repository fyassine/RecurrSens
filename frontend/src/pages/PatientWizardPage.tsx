import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { getPublicPatient } from '../api/client';
import type { PatientStatus } from '../types';
import LandingScreen from '../components/wizard/LandingScreen';
import RecordingScreen from '../components/wizard/RecordingScreen';
import WaitingScreen from '../components/wizard/WaitingScreen';
import CompletedScreen from '../components/wizard/CompletedScreen';
import FeedbackScreen from '../components/wizard/FeedbackScreen';

type LocalStatus = PatientStatus | 'PRE_OP_FEEDBACK' | 'POST_OP_FEEDBACK';

export default function PatientWizardPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completedExerciseIdsPre, setCompletedExerciseIdsPre] = useState<string[]>([]);
  const [completedExerciseIdsPost, setCompletedExerciseIdsPost] = useState<string[]>([]);
  const [skippedExerciseIdsPre, setSkippedExerciseIdsPre] = useState<string[]>([]);
  const [skippedExerciseIdsPost, setSkippedExerciseIdsPost] = useState<string[]>([]);
  const [feedbackSubmittedPre, setFeedbackSubmittedPre] = useState(false);
  const [feedbackSubmittedPost, setFeedbackSubmittedPost] = useState(false);

  // Pre-warmed mic stream, acquired on the LandingScreen's "Start" click.
  // Kept alive across exercises so every record-press is instant (no getUserMedia).
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!token) return;
    getPublicPatient(token)
      .then((data) => {
        setCompletedExerciseIdsPre(data.completed_exercise_ids_pre);
        setCompletedExerciseIdsPost(data.completed_exercise_ids_post);
        setSkippedExerciseIdsPre(data.skipped_exercise_ids_pre);
        setSkippedExerciseIdsPost(data.skipped_exercise_ids_post);
        setFeedbackSubmittedPre(data.feedback_submitted_pre);
        setFeedbackSubmittedPost(data.feedback_submitted_post);

        if (data.status === 'PRE_OP_DONE' && !data.feedback_submitted_pre) {
          setStatus('PRE_OP_FEEDBACK');
        } else if (
          (data.status === 'POST_OP_DONE' || data.status === 'COMPLETED')
          && !data.feedback_submitted_post
        ) {
          setStatus('POST_OP_FEEDBACK');
        } else {
          setStatus(data.status);
        }
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
    const preOpCompletedIds = [...completedExerciseIdsPre, ...skippedExerciseIdsPre];
    const postOpCompletedIds = [...completedExerciseIdsPost, ...skippedExerciseIdsPost];

    switch (status) {
      case 'NEW':
        return <LandingScreen token={token} onStart={handleLandingStart} />;

      case 'CONSENT_GIVEN':
        return (
          <RecordingScreen
            token={token}
            phase="PRE_OP"
            micStream={micStream}
            completedExerciseIds={preOpCompletedIds}
            onComplete={() =>
              setStatus(feedbackSubmittedPre ? 'PRE_OP_DONE' : 'PRE_OP_FEEDBACK')
            }
          />
        );

      case 'PRE_OP_FEEDBACK':
        return (
          <FeedbackScreen
            token={token}
            phase="PRE_OP"
            onComplete={() => {
              setFeedbackSubmittedPre(true);
              setStatus('PRE_OP_DONE');
            }}
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
            completedExerciseIds={postOpCompletedIds}
            onComplete={() =>
              setStatus(feedbackSubmittedPost ? 'POST_OP_DONE' : 'POST_OP_FEEDBACK')
            }
          />
        );

      case 'POST_OP_FEEDBACK':
        return (
          <FeedbackScreen
            token={token}
            phase="POST_OP"
            onComplete={() => {
              setFeedbackSubmittedPost(true);
              setStatus('POST_OP_DONE');
            }}
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
