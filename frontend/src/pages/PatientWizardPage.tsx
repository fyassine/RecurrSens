import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader, Text } from '@mantine/core';
import { motion, AnimatePresence } from 'motion/react';
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
  const [postOpSessionNumber, setPostOpSessionNumber] = useState<number>(1);

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
        setPostOpSessionNumber(data.current_post_op_session_number ?? 1);

        if (data.status === 'PRE_OP_DONE' && !data.feedback_submitted_pre) {
          setStatus('PRE_OP_FEEDBACK');
        } else if (data.status === 'POST_OP_DONE' && !data.feedback_submitted_post) {
          setStatus('POST_OP_FEEDBACK');
        } else {
          setStatus(data.status);
        }
      })
      .catch(() => setError('Patient nicht gefunden.'))
      .finally(() => setLoading(false));
  }, [token]);

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
      <div className="flex min-h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (error || !token || !status) {
    return (
      <div className="p-8 text-center">
        <Text c="red">{error || 'Unbekannter Fehler'}</Text>
      </div>
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
            onComplete={() => setStatus(feedbackSubmittedPre ? 'PRE_OP_DONE' : 'PRE_OP_FEEDBACK')}
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
            sessionNumber={postOpSessionNumber}
            micStream={micStream}
            completedExerciseIds={postOpCompletedIds}
            onComplete={() => setStatus(feedbackSubmittedPost ? 'POST_OP_DONE' : 'POST_OP_FEEDBACK')}
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
        return <CompletedScreen />;
      default:
        return <Text>Unbekannter Status: {status}</Text>;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--mantine-color-body)] px-4 py-12">
      <AnimatePresence mode="wait">
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
