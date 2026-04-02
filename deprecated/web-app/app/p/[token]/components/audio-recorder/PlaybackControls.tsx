'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw } from 'lucide-react';
import { formatTime } from '@/lib/utils';

interface PlaybackControlsProps {
  audioBlob: Blob;
  recordingDuration: number;
  onReset: () => void;
}

export function PlaybackControls({ audioBlob, recordingDuration, onReset }: PlaybackControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
        playbackAudioRef.current = null;
      }
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
    };
  }, []);

  const updatePlaybackProgress = () => {
    if (playbackAudioRef.current) {
      const current = playbackAudioRef.current.currentTime;
      const audioDuration = playbackAudioRef.current.duration;
      // Use recordingDuration as fallback if audio.duration is Infinity (common with MediaRecorder blobs)
      const duration = Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : recordingDuration;
      
      if (duration > 0) {
        setPlaybackTime(current);
        setPlaybackProgress((current / duration) * 100);
      }
      playbackAnimationRef.current = requestAnimationFrame(updatePlaybackProgress);
    }
  };

  const playRecording = () => {
    if (!audioBlob) return;
    
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    playbackAudioRef.current = audio;
    
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      // If duration is Infinity or NaN, use the recorded duration
      const validDuration = Number.isFinite(d) && d > 0 ? d : recordingDuration;
      setPlaybackDuration(validDuration);
    };

    setIsPlaying(true);
    audio.play().catch(e => {
      console.error("Playback failed", e);
      setIsPlaying(false);
    });
    
    playbackAnimationRef.current = requestAnimationFrame(updatePlaybackProgress);

    audio.onended = () => {
      setIsPlaying(false);
      playbackAudioRef.current = null;
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
      setPlaybackProgress(0);
      setPlaybackTime(0);
      URL.revokeObjectURL(url);
    };
  };

  return (
    <div className="w-full max-w-xs space-y-4">
      {/* Playback Progress Bar */}
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-100 ease-linear"
          style={{ width: `${playbackProgress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatTime(playbackTime)}</span>
        <span>{formatTime(playbackDuration || recordingDuration)}</span>
      </div>

      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={playRecording} disabled={isPlaying}>
          {isPlaying ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Anhören
        </Button>
        <Button variant="outline" onClick={onReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Neu aufnehmen
        </Button>
      </div>
      
      <p className="text-sm text-muted-foreground mt-2 text-center">
        Aufnahme bereit
      </p>
    </div>
  );
}
