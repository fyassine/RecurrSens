'use client';

import { useState, useRef, useEffect } from 'react';
import { ExamplePlayer } from './audio-recorder/ExamplePlayer';
import { RecordingControls } from './audio-recorder/RecordingControls';
import { PlaybackControls } from './audio-recorder/PlaybackControls';

interface AudioRecorderProps {
  exampleAudioUrl?: string;
  onRecordingComplete: (blob: Blob) => void;
  onRecordingReset?: () => void;
}

export default function AudioRecorder({ exampleAudioUrl, onRecordingComplete, onRecordingReset }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // Timers
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number>(0);



  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);
      
      // Determine supported MIME type
      let mimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }
      
      mimeTypeRef.current = mimeType;
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(mediaStream, options);
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const type = mimeTypeRef.current || mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setAudioBlob(blob);
        onRecordingComplete(blob);
        
        // Calculate precise duration
        const duration = (Date.now() - recordingStartTimeRef.current) / 1000;
        setRecordingDuration(duration);

        mediaStream.getTracks().forEach(track => track.stop());
        setStream(null);
        
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioBlob(null);
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((Date.now() - recordingStartTimeRef.current) / 1000);
      }, 100);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Zugriff auf das Mikrofon fehlgeschlagen. Bitte erlauben Sie den Zugriff.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleReset = () => {
    setAudioBlob(null);
    setRecordingDuration(0);
    if (onRecordingReset) {
      onRecordingReset();
    }
  };

  return (
    <div className="space-y-6">
      {/* Example Audio Player */}
      {exampleAudioUrl && (
        <ExamplePlayer
          url={exampleAudioUrl}
          onListenComplete={() => {}}
          disabled={isRecording}
          isRecording={isRecording}
        />
      )}

      {/* Recorder Controls */}
      {!audioBlob ? (
        <RecordingControls
          isRecording={isRecording}
          recordingDuration={recordingDuration}
          onStart={startRecording}
          onStop={stopRecording}
          stream={stream}
        />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <PlaybackControls 
            audioBlob={audioBlob}
            recordingDuration={recordingDuration}
            onReset={handleReset}
          />
        </div>
      )}
    </div>
  );
}
