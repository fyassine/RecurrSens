import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  Typography,
} from '@mui/material';
import AudioRecorder from '../AudioRecorder';
import { useExerciseSession } from '../../hooks/useExerciseSession';

export default function RecordingScreen({
  token,
  phase,
  micStream,
  completedExerciseIds = [],
  onComplete,
}: {
  token: string;
  phase: 'PRE_OP' | 'POST_OP';
  micStream?: MediaStream | null;
  completedExerciseIds?: string[];
  onComplete: () => void;
}) {
  const {
    exercises,
    currentIndex,
    currentExercise,
    currentBlob,
    audioQualityError,
    handleRecordingComplete,
    handleRecordingError,
    handleRecordingReset,
    handleNext,
    isLoading,
    isUploading,
  } = useExerciseSession(token, onComplete, completedExerciseIds);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!currentExercise) return null;

  const exampleUrl = currentExercise.example_audio_url;

  return (
    <Card sx={{ maxWidth: 640, mx: 'auto' }}>
      <CardHeader
        title={phase === 'PRE_OP' ? 'Pre-OP Aufnahme' : 'Post-OP Aufnahme'}
        subheader={`Übung ${currentIndex + 1} von ${exercises.length}`}
      />
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ p: 3, borderRadius: 2, bgcolor: '#e3f2fd' }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {currentExercise.title}
          </Typography>
          <Typography variant="body2">{currentExercise.description}</Typography>
        </Box>

        <AudioRecorder
          key={currentExercise.exercise_id}
          exampleAudioUrl={exampleUrl}
          micStream={micStream}
          onRecordingComplete={handleRecordingComplete}
          onRecordingError={handleRecordingError}
          onRecordingReset={handleRecordingReset}
        />

        {audioQualityError && (
          <Alert severity="error">
            <strong>Aufnahmequalität nicht ausreichend</strong>
            <br />
            {audioQualityError}
          </Alert>
        )}
        {currentBlob && !audioQualityError && (
          <Alert severity="success">Aufnahme in Ordnung</Alert>
        )}
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={!currentBlob || isUploading || !!audioQualityError}
          onClick={handleNext}
        >
          {isUploading ? (
            <CircularProgress size={24} />
          ) : currentIndex < exercises.length - 1 ? (
            'Nächste Übung'
          ) : (
            'Abschließen'
          )}
        </Button>
      </CardActions>
    </Card>
  );
}
