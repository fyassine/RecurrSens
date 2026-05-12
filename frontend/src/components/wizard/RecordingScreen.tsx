import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  LinearProgress,
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
    skipError,
    qualityFailCount,
    completedCount,
    handleRecordingComplete,
    handleRecordingError,
    handleRecordingReset,
    handleNext,
    handleSkip,
    hasNextIncomplete,
    isLoading,
    isUploading,
    isSkipping,
  } = useExerciseSession(token, phase, onComplete, completedExerciseIds);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!currentExercise) return null;

  const exampleUrl = currentExercise.example_audio_url;
  const totalExercises = exercises.length;
  const progressPct = totalExercises > 0 ? (completedCount / totalExercises) * 100 : 0;
  const showCannotDo = qualityFailCount >= 2 && !!audioQualityError;

  return (
    <Card sx={{ maxWidth: 640, mx: 'auto' }}>
      <CardHeader
        title={phase === 'PRE_OP' ? 'Pre-OP Aufnahme' : 'Post-OP Aufnahme'}
        subheader={
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.75}>
              Übung {currentIndex + 1} von {totalExercises}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progressPct}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        }
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
          hasQualityError={!!audioQualityError}
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
        {skipError && (
          <Alert severity="warning">{skipError}</Alert>
        )}
        {currentBlob && !audioQualityError && (
          <Alert severity="success">Aufnahme in Ordnung</Alert>
        )}
      </CardContent>

      <CardActions sx={{ px: 2, pb: 2 }}>
        {showCannotDo ? (
          <Button
            variant="outlined"
            color="warning"
            size="large"
            onClick={handleSkip}
            disabled={isSkipping}
            startIcon={isSkipping ? <CircularProgress size={20} /> : undefined}
            fullWidth
          >
            Ich kann diese Übung nicht machen
          </Button>
        ) : (
          <Button
            variant="contained"
            size="large"
            disabled={!currentBlob || isUploading || isSkipping || !!audioQualityError}
            onClick={handleNext}
            fullWidth
          >
            {isUploading ? (
              <CircularProgress size={24} />
            ) : hasNextIncomplete ? (
              'Nächste Übung'
            ) : (
              'Abschließen'
            )}
          </Button>
        )}
      </CardActions>
    </Card>
  );
}
