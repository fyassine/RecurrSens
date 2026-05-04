import { useState, useEffect } from 'react';
import { uploadAudio, advancePublicPatient, getExercises, skipExercise } from '../api/client';
import { calculateRMS } from '../utils';
import type { Exercise } from '../types';

const THRESHOLDS = { MIN_DBFS: -30, MAX_DBFS: -6 };
const LOW_QUALITY_MESSAGE = 'Die Aufnahme ist zu leise. Bitte sprechen Sie lauter oder näher am Mikrofon.';

export function useExerciseSession(
  token: string,
  phase: 'PRE_OP' | 'POST_OP',
  onComplete: () => void,
  completedExerciseIds: string[] = [],
) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [audioQualityError, setAudioQualityError] = useState<string | null>(null);
  const [skipError, setSkipError] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<string[]>(completedExerciseIds);

  useEffect(() => {
    getExercises().then((data) => {
      setExercises(data);
      const firstIncomplete = data.findIndex(
        (ex) => !completedExerciseIds.includes(ex.exercise_id)
      );
      setCurrentIndex(firstIncomplete >= 0 ? firstIncomplete : 0);
      setIsLoading(false);
    });
  // completedExerciseIds is stable (set once from the API response on page load)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRecordingComplete = async (blob: Blob) => {
    if (blob.size === 0) {
      setCurrentBlob(null);
      setAudioQualityError(LOW_QUALITY_MESSAGE);
      return;
    }

    setCurrentBlob(blob);
    setAudioQualityError(null);

    try {
      const dbfs = await calculateRMS(blob);
      if (dbfs < THRESHOLDS.MIN_DBFS) {
        setAudioQualityError(LOW_QUALITY_MESSAGE);
      } else if (dbfs > THRESHOLDS.MAX_DBFS) {
        setAudioQualityError('Die Aufnahme ist zu laut und übersteuert. Bitte etwas mehr Abstand zum Mikrofon.');
      }
    } catch {
      setAudioQualityError(LOW_QUALITY_MESSAGE);
    }
  };

  const handleRecordingError = (message: string) => {
    setCurrentBlob(null);
    setAudioQualityError(message);
  };

  const handleRecordingReset = () => {
    setCurrentBlob(null);
    setAudioQualityError(null);
    setSkipError(null);
  };

  const getNextIncompleteIndex = (startIndex: number, completedSet: Set<string>) => {
    for (let i = startIndex; i < exercises.length; i += 1) {
      if (!completedSet.has(exercises[i].exercise_id)) return i;
    }
    return -1;
  };

  const moveToNextIncomplete = async (completedSet: Set<string>) => {
    const nextIndex = getNextIncompleteIndex(currentIndex + 1, completedSet);

    if (nextIndex === -1) {
      await advancePublicPatient(token);
      onComplete();
      return;
    }

    setCurrentIndex(nextIndex);
    handleRecordingReset();
  };

  const hasNextIncomplete =
    getNextIncompleteIndex(currentIndex + 1, new Set(completedIds)) !== -1;

  const handleNext = async () => {
    if (!currentBlob || audioQualityError || exercises.length === 0) return;

    setSkipError(null);
    setIsUploading(true);
    try {
      const exerciseId = exercises[currentIndex].exercise_id;
      await uploadAudio(token, currentBlob, exerciseId);

      const nextCompleted = new Set(completedIds);
      nextCompleted.add(exerciseId);
      setCompletedIds(Array.from(nextCompleted));
      await moveToNextIncomplete(nextCompleted);
    } catch {
      alert('Fehler beim Hochladen. Bitte versuchen Sie es erneut.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSkip = async () => {
    if (exercises.length === 0) return;

    const exerciseId = exercises[currentIndex].exercise_id;
    setIsSkipping(true);
    setSkipError(null);

    try {
      await skipExercise(token, { phase, exercise_id: exerciseId });
    } catch {
      setSkipError('Überspringen fehlgeschlagen. Bitte prüfen Sie Ihre Verbindung.');
    }

    const nextCompleted = new Set(completedIds);
    nextCompleted.add(exerciseId);
    setCompletedIds(Array.from(nextCompleted));

    try {
      await moveToNextIncomplete(nextCompleted);
    } finally {
      setIsSkipping(false);
    }
  };

  return {
    exercises,
    currentIndex,
    currentExercise: exercises[currentIndex] ?? null,
    currentBlob,
    audioQualityError,
    skipError,
    handleRecordingComplete,
    handleRecordingError,
    handleRecordingReset,
    handleNext,
    handleSkip,
    hasNextIncomplete,
    isLoading,
    isUploading,
    isSkipping,
  };
}
