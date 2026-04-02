'use client';

import { Button } from '@/components/ui/button';
import { Square, Mic } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import { formatTime } from '@/lib/utils';

interface RecordingControlsProps {
  isRecording: boolean;
  recordingDuration: number;
  onStart: () => void;
  onStop: () => void;
  stream: MediaStream | null;
}

export function RecordingControls({
  isRecording,
  recordingDuration,
  onStart,
  onStop,
  stream
}: RecordingControlsProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      {isRecording && stream && (
        <AudioVisualizer stream={stream} />
      )}

      <div className="relative flex flex-col items-center gap-4">
        <div className="relative">
          <Button
            size="lg"
            variant={isRecording ? "destructive" : "default"}
            className="w-24 h-24 rounded-full transition-all"
            onClick={isRecording ? onStop : onStart}
          >
            {isRecording ? (
              <Square className="h-8 w-8" />
            ) : (
              <Mic className="h-8 w-8" />
            )}
          </Button>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground mt-2">
        {isRecording 
          ? `Aufnahme läuft... (${formatTime(recordingDuration)})` 
          : 'Tippen zum Starten'}
      </p>
    </div>
  );
}
