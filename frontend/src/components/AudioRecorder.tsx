import { useState, useRef, useEffect, useCallback } from 'react';
import { ActionIcon, Button, Progress, Text } from '@mantine/core';
import { Play, Square, Mic, RotateCcw } from 'lucide-react';
import AudioVisualizer from './AudioVisualizer';
import { formatTime } from '../utils';

interface AudioRecorderProps {
  exampleAudioUrl?: string;
  micStream?: MediaStream | null;
  hasQualityError?: boolean;
  onRecordingComplete: (blob: Blob) => void;
  onRecordingReset?: () => void;
  onRecordingError?: (message: string) => void;
}

export default function AudioRecorder({
  exampleAudioUrl,
  micStream: externalStream,
  hasQualityError = false,
  onRecordingComplete,
  onRecordingReset,
  onRecordingError,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [visualizerStream, setVisualizerStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const isStartingRef = useRef(false);
  const isPressingRef = useRef(false);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const capturedPointerIdRef = useRef<number | null>(null);

  const [examplePlaying, setExamplePlaying] = useState(false);
  const exampleRef = useRef<HTMLAudioElement | null>(null);

  const cleanupRecording = useCallback(
    (ownedStream?: MediaStream | null) => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (ownedStream) {
        ownedStream.getTracks().forEach((t) => t.stop());
      } else if (!externalStream && streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      mediaRecorderRef.current = null;
      isStartingRef.current = false;
      setIsRecording(false);
      setVisualizerStream(null);
    },
    [externalStream],
  );

  useEffect(() => {
    return () => {
      cleanupRecording();
      if (playbackAudioRef.current) playbackAudioRef.current.pause();
    };
  }, [cleanupRecording]);

  const playExample = () => {
    if (!exampleAudioUrl) return;
    if (!exampleRef.current) {
      exampleRef.current = new Audio(exampleAudioUrl);
      exampleRef.current.onended = () => setExamplePlaying(false);
      exampleRef.current.onerror = () => setExamplePlaying(false);
    }
    setExamplePlaying(true);
    exampleRef.current.play().catch(() => setExamplePlaying(false));
  };

  const startRecording = async () => {
    if (isRecording || isStartingRef.current) return;
    isStartingRef.current = true;
    isPressingRef.current = true;

    try {
      const mediaStream =
        externalStream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));

      if (!isPressingRef.current) {
        if (!externalStream) mediaStream.getTracks().forEach((t) => t.stop());
        isStartingRef.current = false;
        return;
      }

      streamRef.current = mediaStream;
      setVisualizerStream(mediaStream);

      let mimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      }
      mimeTypeRef.current = mimeType;

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(mediaStream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onerror = () => {
        cleanupRecording(externalStream ? undefined : mediaStream);
        onRecordingError?.('Mikrofonfehler während der Aufnahme. Bitte prüfen Sie das Mikrofon und versuchen Sie es erneut.');
      };

      mediaRecorder.onstop = () => {
        const duration = (Date.now() - recordingStartTimeRef.current) / 1000;
        setRecordingDuration(duration);

        if (chunksRef.current.length === 0) {
          cleanupRecording(externalStream ? undefined : mediaStream);
          onRecordingError?.('Die Aufnahme ist zu leise. Bitte sprechen Sie lauter oder näher am Mikrofon.');
          return;
        }

        const type = mimeTypeRef.current || mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });

        if (blob.size === 0) {
          cleanupRecording(externalStream ? undefined : mediaStream);
          onRecordingError?.('Die Aufnahme ist zu leise. Bitte sprechen Sie lauter oder näher am Mikrofon.');
          return;
        }

        setAudioBlob(blob);
        onRecordingComplete(blob);
        cleanupRecording(externalStream ? undefined : mediaStream);
      };

      mediaRecorder.start();
      isStartingRef.current = false;
      setIsRecording(true);
      setAudioBlob(null);
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((Date.now() - recordingStartTimeRef.current) / 1000);
      }, 100);
    } catch (err: unknown) {
      isStartingRef.current = false;
      cleanupRecording();

      let message = 'Mikrofon konnte nicht gefunden werden. Bitte stellen Sie sicher, dass ein Mikrofon angeschlossen ist.';
      const errName =
        err instanceof Error
          ? err.name
          : typeof err === 'object' && err && 'name' in err
            ? String((err as { name?: unknown }).name)
            : undefined;
      if (!window.isSecureContext) {
        message = 'Mikrofon erfordert eine sichere Verbindung (HTTPS). Bitte verwenden Sie https://recurrsens.eu';
      } else if (errName === 'NotAllowedError') {
        message = 'Zugriff auf das Mikrofon wurde verweigert. Bitte erlauben Sie den Zugriff in den Browser-Einstellungen.';
      }

      if (onRecordingError) onRecordingError(message);
      else alert(message);
    }
  };

  const stopRecording = useCallback(() => {
    isPressingRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      setIsRecording(false);
      return;
    }
    if (isStartingRef.current || streamRef.current) {
      cleanupRecording();
    }
  }, [cleanupRecording]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && isRecording) stopRecording();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isRecording, stopRecording]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const btn = buttonRef.current;
      if (btn) {
        btn.setPointerCapture(e.pointerId);
        capturedPointerIdRef.current = e.pointerId;
      }
      void startRecording();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isRecording, externalStream],
  );

  const handlePointerUp = useCallback(() => {
    capturedPointerIdRef.current = null;
    stopRecording();
  }, [stopRecording]);

  const handlePointerCancel = useCallback(() => {
    capturedPointerIdRef.current = null;
    stopRecording();
  }, [stopRecording]);

  useEffect(() => {
    const onBlur = () => {
      if (isRecording) stopRecording();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [isRecording, stopRecording]);

  const playRecording = () => {
    if (!audioBlob) return;
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
    }
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    playbackAudioRef.current = audio;
    setIsPlaying(true);
    audio.ontimeupdate = () => {
      const dur = Number.isFinite(audio.duration) ? audio.duration : recordingDuration;
      if (dur > 0) {
        setPlaybackTime(audio.currentTime);
        setPlaybackProgress((audio.currentTime / dur) * 100);
      }
    };
    audio.onended = () => {
      setIsPlaying(false);
      playbackAudioRef.current = null;
      setPlaybackProgress(0);
      setPlaybackTime(0);
      URL.revokeObjectURL(url);
    };
    audio.play().catch(() => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    });
  };

  const resetRecording = () => {
    setAudioBlob(null);
    setRecordingDuration(0);
    setPlaybackProgress(0);
    setPlaybackTime(0);
    onRecordingReset?.();
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Example */}
      {exampleAudioUrl && !audioBlob && (
        <div className="flex w-full max-w-[320px] items-center gap-4 rounded-lg bg-[var(--mantine-color-default-hover)] p-3">
          <ActionIcon
            variant="subtle"
            color="brand"
            size="lg"
            onClick={playExample}
            disabled={examplePlaying || isRecording}
          >
            {examplePlaying ? <Square size={20} /> : <Play size={20} />}
          </ActionIcon>
          <Text size="sm">Beispiel anhören</Text>
        </div>
      )}

      {/* Visualizer */}
      {!audioBlob && (
        <div className="flex h-[76px] w-full max-w-[320px] items-center justify-center">
          {visualizerStream && <AudioVisualizer stream={visualizerStream} />}
        </div>
      )}

      {/* Record button */}
      {!audioBlob && (
        <>
          <button
            ref={buttonRef}
            type="button"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-full border-0 transition-colors"
            style={{
              backgroundColor: isRecording
                ? 'var(--mantine-color-red-3)'
                : 'var(--mantine-color-brand-1)',
              color: isRecording ? 'var(--mantine-color-red-9)' : 'var(--mantine-color-brand-9)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
              touchAction: 'none',
            }}
          >
            {isRecording ? <Square size={40} /> : <Mic size={40} />}
          </button>
          <Text size="sm" c="dimmed" ta="center">
            {isRecording
              ? `Aufnahme läuft… (${formatTime(recordingDuration)})`
              : 'Gedrückt halten zum Aufnehmen'}
          </Text>
        </>
      )}

      {/* Playback */}
      {audioBlob && (
        <div className="flex w-full max-w-[320px] flex-col gap-3">
          <Progress value={playbackProgress} />
          <div className="flex justify-between">
            <Text size="xs">{formatTime(playbackTime)}</Text>
            <Text size="xs">{formatTime(recordingDuration)}</Text>
          </div>
          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              leftSection={isPlaying ? <Square size={16} /> : <Play size={16} />}
              onClick={playRecording}
              disabled={isPlaying}
            >
              Anhören
            </Button>
            <Button
              variant={hasQualityError ? 'filled' : 'outline'}
              color={hasQualityError ? 'brand' : 'gray'}
              leftSection={<RotateCcw size={16} />}
              onClick={resetRecording}
            >
              Neu aufnehmen
            </Button>
          </div>
          <Text
            size="sm"
            ta="center"
            fw={hasQualityError ? 600 : 400}
            c={hasQualityError ? 'red' : 'dimmed'}
          >
            {hasQualityError ? 'Aufnahme fehlgeschlagen' : 'Aufnahme bereit'}
          </Text>
        </div>
      )}
    </div>
  );
}
