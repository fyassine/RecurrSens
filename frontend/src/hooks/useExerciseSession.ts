import { useState, useEffect } from 'react';
import { uploadAudio, advancePublicPatient, getExercises } from '../api/client';
import { calculateRMS } from '../utils';
import type { Exercise } from '../types';

const THRESHOLDS = { MIN_DBFS: -30, MAX_DBFS: -6 };

export function useExerciseSession(token: string, onComplete: () => void) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [audioQualityError, setAudioQualityError] = useState<string | null>(null);

  useEffect(() => {
    getExercises().then((data) => {
      setExercises(data);
      setIsLoading(false);
    });
  }, []);

  const handleRecordingComplete = async (blob: Blob) => {
    setCurrentBlob(blob);
    setAudioQualityError(null);

    try {
      const dbfs = await calculateRMS(blob);
      if (dbfs < THRESHOLDS.MIN_DBFS) {
        setAudioQualityError('Die Aufnahme ist zu leise. Bitte sprechen Sie lauter oder näher am Mikrofon.');
      } else if (dbfs > THRESHOLDS.MAX_DBFS) {
        setAudioQualityError('Die Aufnahme ist zu laut und übersteuert. Bitte etwas mehr Abstand zum Mikrofon.');
      }
    } catch {
      // Analysis failed — allow upload anyway
    }
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
    handleRecordingReset,
    handleNext,
    isLoading,
    isUploading,
  };
}
