'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';

interface ExamplePlayerProps {
  url: string;
  onListenComplete: () => void;
  disabled?: boolean;
  isRecording?: boolean;
}

export function ExamplePlayer({ url, onListenComplete, disabled, isRecording }: ExamplePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isRecording && mediaRef.current) {
      mediaRef.current.pause();
      setIsPlaying(false);
    }
  }, [isRecording]);

  const handlePlay = () => {
    if (mediaRef.current) {
      setIsPlaying(true);
      onListenComplete();
      mediaRef.current.play().catch((error) => {
        console.error("Playback failed:", error);
        setIsPlaying(false);
      });
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  const handleError = (e: any) => {
    const error = mediaRef.current?.error;
    console.error("Media load error:", error?.code, error?.message, e);
    setIsPlaying(false);
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
      <Button
        variant="outline"
        size="icon"
        onClick={handlePlay}
        disabled={isPlaying || disabled}
      >
        {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="flex flex-col">
        <span className="text-sm font-medium">Beispiel anhören</span>
      </div>
      <video 
        ref={mediaRef} 
        src={url} 
        className="hidden" 
        onEnded={handleEnded}
        onError={handleError}
        playsInline
      />
    </div>
  );
}
