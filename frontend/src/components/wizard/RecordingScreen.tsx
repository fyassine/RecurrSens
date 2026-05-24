import { Alert, Badge, Button, Card, Loader, Progress, Stack, Text, Title } from '@mantine/core';
import { Timer, Volume2 } from 'lucide-react';
import AudioRecorder from '../AudioRecorder';
import { useExerciseSession, getMinDuration } from '../../hooks/useExerciseSession';

export default function RecordingScreen({
  token,
  phase,
  sessionNumber = 1,
  micStream,
  completedExerciseIds = [],
  onComplete,
}: {
  token: string;
  phase: 'PRE_OP' | 'POST_OP';
  sessionNumber?: number;
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
      <div className="flex justify-center py-16">
        <Loader />
      </div>
    );
  }

  if (!currentExercise) return null;

  const exampleUrl = currentExercise.example_audio_url;
  const totalExercises = exercises.length;
  const progressPct = totalExercises > 0 ? (completedCount / totalExercises) * 100 : 0;
  const showCannotDo = qualityFailCount >= 2 && !!audioQualityError;

  const title =
    phase === 'PRE_OP'
      ? 'Prä-OP Aufnahme'
      : sessionNumber > 1
        ? `Post-OP Aufnahme (Sitzung ${sessionNumber})`
        : 'Post-OP Aufnahme';

  return (
    <Card withBorder radius="md" maw={640} mx="auto" p="lg">
      <Title order={4} mb={4}>{title}</Title>
      <Text size="xs" c="dimmed" mb={6}>
        Übung {currentIndex + 1} von {totalExercises}
      </Text>
      <Progress value={progressPct} size="sm" mb="lg" />

      <Stack gap="lg">
        <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30">
          <Text fw={600} size="md" mb="xs">{currentExercise.title}</Text>
          <Text size="sm">{currentExercise.description}</Text>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge color="cyan" variant="outline" leftSection={<Timer size={12} />}>
              Mind. {getMinDuration(currentExercise.exercise_id)} Sek.
            </Badge>
            <Badge color="cyan" variant="outline" leftSection={<Volume2 size={12} />}>
              Angemessene Lautstärke
            </Badge>
          </div>
        </div>

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
          <Alert color="red" title="Aufnahmequalität nicht ausreichend">
            {audioQualityError}
          </Alert>
        )}
        {skipError && <Alert color="yellow">{skipError}</Alert>}
        {currentBlob && !audioQualityError && (
          <Alert color="green">Aufnahme in Ordnung</Alert>
        )}

        {showCannotDo ? (
          <Button
            variant="outline"
            color="yellow"
            size="lg"
            fullWidth
            onClick={handleSkip}
            loading={isSkipping}
          >
            Ich kann diese Übung nicht machen
          </Button>
        ) : (
          <Button
            size="lg"
            fullWidth
            disabled={!currentBlob || isSkipping || !!audioQualityError}
            loading={isUploading}
            onClick={handleNext}
          >
            {hasNextIncomplete ? 'Nächste Übung' : 'Abschließen'}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
