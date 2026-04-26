import { useState, useEffect } from 'react';
import { uploadAudio, advancePublicPatient, getExercises } from '../api/client';
import { calculateRMS } from '../utils';
import type { Exercise } from '../types';

const THRESHOLDS = { MIN_DBFS: -30, MAX_DBFS: -6 };
const LOW_QUALITY_MESSAGE = 'Die Aufnahme ist zu leise. Bitte sprechen Sie lauter oder näher am Mikrofon.';

export function useExerciseSession(
  token: string,
  onComplete: () => void,
  completedExerciseIds: string[] = [],
) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [audioQualityError, setAudioQualityError] = useState<string | null>(null);

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
  };

  const handleNext = async () => {
    if (!currentBlob || audioQualityError || exercises.length === 0) return;

    setIsUploading(true);
    try {
      await uploadAudio(token, currentBlob, exercises[currentIndex].exercise_id);

      if (currentIndex < exercises.length - 1) {
        setCurrentIndex((i) => i + 1);
        handleRecordingReset();
      } else {
        await advancePublicPatient(token);
        onComplete();
      }
    } catch {
      alert('Fehler beim Hochladen. Bitte versuchen Sie es erneut.');
    } finally {
      setIsUploading(false);
    }
  };

  return {
    exercises,
    currentIndex,
    currentExercise: exercises[currentIndex] ?? null,
    currentBlob,
    audioQualityError,
    handleRecordingComplete,
    handleRecordingError,
    handleRecordingReset,
    handleNext,
    isLoading,
    isUploading,
  };
}
