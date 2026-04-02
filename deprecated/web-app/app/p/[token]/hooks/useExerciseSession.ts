import { useState } from 'react';
import { uploadAudioFile, advancePatientStep } from '@/lib/api';
import { EXERCISES } from '@/lib/exercises';
import { calculateRMS } from '@/lib/audio-utils';

const THRESHOLDS = {
  MIN_DBFS: -30,
  MAX_DBFS: -6 
};

export function useExerciseSession(
  token: string,
  onComplete: () => void
) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [currentDbfs, setCurrentDbfs] = useState<number | null>(null);
  const [audioQualityError, setAudioQualityError] = useState<string | null>(null);
  
  const handleRecordingComplete = async (blob: Blob) => {
    setCurrentBlob(blob);
    setAudioQualityError(null);

    try {
      const dbfs = await calculateRMS(blob);
      setCurrentDbfs(dbfs);
      console.log(`Gemessener Pegel: ${dbfs.toFixed(2)} dBFS`);

      // VALIDIERUNGSLOGIK
      if (dbfs < THRESHOLDS.MIN_DBFS) {
        setAudioQualityError("Die Aufnahme ist zu leise. Bitte sprechen Sie lauter oder näher am Mikrofon.");
      } else if (dbfs > THRESHOLDS.MAX_DBFS) {
        setAudioQualityError("Die Aufnahme ist zu laut und übersteuert. Bitte etwas mehr Abstand zum Mikrofon.");
      } 
      
    } catch (err) {
      console.error("Fehler bei Audio-Analyse:", err);
    }
  };

  const handleRecordingReset = () => {
    setCurrentBlob(null);
    setCurrentDbfs(null);
    setAudioQualityError(null);
  };

  const handleNext = async () => {
    if (!currentBlob || audioQualityError) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', currentBlob, 'audio.webm');
      formData.append('exerciseId', EXERCISES[currentIndex].id);
      
      // Upload and automatically add to patient record
      await uploadAudioFile(token, formData);

      if (currentIndex < EXERCISES.length - 1) {
        setCurrentIndex(prev => prev + 1);
        handleRecordingReset();
      } else {
        // Advance step at the end
        await advancePatientStep(token);
        onComplete();
      }
    } catch (error) {
      console.error('Error uploading audio:', error);
      alert('Fehler beim Hochladen. Bitte versuchen Sie es erneut.');
    } finally {
      setIsUploading(false);
    }
  };

  return {
    exercises: EXERCISES,
    currentIndex,
    currentExercise: EXERCISES[currentIndex],
    currentBlob,
    audioQualityError,
    handleRecordingComplete,
    handleRecordingReset,
    handleNext,
    isLoading: false,
    isUploading
  };
}
