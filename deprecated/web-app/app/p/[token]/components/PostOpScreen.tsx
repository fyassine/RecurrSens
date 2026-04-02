'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import AudioRecorder from './AudioRecorder';
import { useExerciseSession } from '../hooks/useExerciseSession';


import { PublicPatient } from '@/lib/api';

interface PostOpScreenProps {
  token: string;
  patient: PublicPatient;
  onComplete: () => void;
}

export default function PostOpScreen({ token, patient, onComplete }: PostOpScreenProps) {
  const {
    exercises,
    currentIndex,
    currentExercise,
    currentBlob,
    audioQualityError,
    handleRecordingComplete,
    handleRecordingReset,
    handleNext,
    isLoading,
    isUploading
  } = useExerciseSession(token, onComplete);

  if (isLoading) {
    return <div>Lade Übungen...</div>;
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Post-OP Aufnahme</CardTitle>
        <CardDescription>
          Übung {currentIndex + 1} von {exercises.length}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-950 p-6 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            {currentExercise.title}
          </h3>
          <p className="text-blue-800 dark:text-blue-200">
            {currentExercise.description}
          </p>
        </div>

        <AudioRecorder 
          key={currentExercise.id} // Reset recorder on exercise change
          exampleAudioUrl={patient.gender === 'M' ? currentExercise.exampleAudioUrlMale : currentExercise.exampleAudioUrlFemale}
          onRecordingComplete={handleRecordingComplete}
          onRecordingReset={handleRecordingReset}
        />

        {currentBlob && (
          <div className="mt-4">
            {audioQualityError ? (
              <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded-md flex flex-col gap-1">
                <strong>Aufnahmequalität nicht ausreichend</strong>
                <span>{audioQualityError}</span>
              </div>
            ) : (
              <div className="p-3 bg-green-100 border border-green-300 text-green-700 rounded-md">
                <strong>Aufnahme in Ordnung</strong>
              </div>
            )}
          </div>
        )}

      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          size="lg" 
          onClick={handleNext}
          disabled={!currentBlob || isUploading}
        >
          {isUploading ? 'Wird hochgeladen...' : (currentIndex < exercises.length - 1 ? 'Nächste Übung' : 'Abschließen')}
        </Button>
      </CardFooter>
    </Card>
  );
}
