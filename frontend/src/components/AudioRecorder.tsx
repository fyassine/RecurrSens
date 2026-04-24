import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, IconButton, Typography, Button, LinearProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import MicIcon from '@mui/icons-material/Mic';
import ReplayIcon from '@mui/icons-material/Replay';
import AudioVisualizer from './AudioVisualizer';
import { formatTime } from '../utils';

interface AudioRecorderProps {
  exampleAudioUrl?: string;
  /** Pre-warmed mic stream — if provided, getUserMedia is skipped on press. */
  micStream?: MediaStream | null;
  onRecordingComplete: (blob: Blob) => void;
  onRecordingReset?: () => void;
  onRecordingError?: (message: string) => void;
}

export default function AudioRecorder({
  exampleAudioUrl,
  micStream: externalStream,
  onRecordingComplete,
  onRecordingReset,
  onRecordingError,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [visualizerStream, setVisualizerStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Playback
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

  // Ref to the button DOM element for setPointerCapture
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Track the captured pointerId so we can release it
  const capturedPointerIdRef = useRef<number | null>(null);

  // Example playback
  const [examplePlaying, setExamplePlaying] = useState(false);
  const exampleRef = useRef<HTMLAudioElement | null>(null);

  /** Clean up MediaRecorder and optionally the stream (only if we own it). */
  const cleanupRecording = useCallback((ownedStream?: MediaStream | null) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    // Only stop tracks if we created the stream ourselves (no external stream).
    // If an external stream was provided, the parent owns its lifecycle.
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
  }, [externalStream]);

  useEffect(() => {
    return () => {
      cleanupRecording();
      if (playbackAudioRef.current) playbackAudioRef.current.pause();
    };
  }, []); // stable: cleanupRecording identity doesn't matter for unmount

  // ---- Example playback ----
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

  // ---- Recording ----
  const startRecording = async () => {
    if (isRecording || isStartingRef.current) return;
    isStartingRef.current = true;
    isPressingRef.current = true;

    try {
      // Use the pre-warmed external stream if available; otherwise acquire one.
      const mediaStream = externalStream ?? await navigator.mediaDevices.getUserMedia({ audio: true });

      // User released before mic was ready — silently abort, not an error
      if (!isPressingRef.current) {
        // Only stop tracks if we created them ourselves
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
    } catch (err: any) {
      isStartingRef.current = false;
      cleanupRecording();

      let message = 'Mikrofon konnte nicht gefunden werden. Bitte stellen Sie sicher, dass ein Mikrofon angeschlossen ist.';
      if (!window.isSecureContext) {
        message = 'Mikrofon erfordert eine sichere Verbindung (HTTPS). Bitte verwenden Sie https://recurrsens.eu';
      } else if (err?.name === 'NotAllowedError') {
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

  // Stop recording if the tab becomes hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && isRecording) stopRecording();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isRecording, stopRecording]);

  // ---- Pointer Event handlers (unified mouse + touch) ----
  //
  // Using Pointer Events + setPointerCapture guarantees that `pointerup`
  // fires on the SAME element even if:
  //  - the finger/cursor moves off the button
  //  - the DOM is modified mid-touch (React re-render changing icon/color)
  //  - iOS would otherwise silently swallow touchend
  //
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    // Capture this pointer so pointerup is guaranteed to fire on this element
    const btn = buttonRef.current;
    if (btn) {
      btn.setPointerCapture(e.pointerId);
      capturedPointerIdRef.current = e.pointerId;
    }

    void startRecording();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, externalStream]);

  const handlePointerUp = useCallback((_e: React.PointerEvent<HTMLButtonElement>) => {
    capturedPointerIdRef.current = null;
    stopRecording();
  }, [stopRecording]);

  const handlePointerCancel = useCallback((_e: React.PointerEvent<HTMLButtonElement>) => {
    // Pointer was interrupted (e.g. incoming call, OS gesture, etc.)
    capturedPointerIdRef.current = null;
    stopRecording();
  }, [stopRecording]);

  // Safety: also stop on window blur (e.g. iOS app switcher)
  useEffect(() => {
    const onBlur = () => {
      if (isRecording) stopRecording();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [isRecording, stopRecording]);

  // ---- Playback ----
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
    // ontimeupdate fires ~4x/sec — smooth for a progress bar without the
    // 60fps re-render storm that requestAnimationFrame caused.
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
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      {/* Example */}
      {exampleAudioUrl && !audioBlob && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 2,
            bgcolor: 'grey.100',
            borderRadius: 2,
            width: '100%',
            maxWidth: 320,
          }}
        >
          <IconButton onClick={playExample} disabled={examplePlaying || isRecording}>
            {examplePlaying ? <StopIcon /> : <PlayArrowIcon />}
          </IconButton>
          <Typography variant="body2">Beispiel anhören</Typography>
        </Box>
      )}

      {/* Visualizer — fixed-height slot so button never shifts */}
      {!audioBlob && (
        <Box sx={{ height: 76, width: '100%', maxWidth: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {visualizerStream && <AudioVisualizer stream={visualizerStream} />}
        </Box>
      )}

      {/* Record button – press and hold to record */}
      {!audioBlob && (
        <>
          <IconButton
            ref={buttonRef}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            color={isRecording ? 'error' : 'primary'}
            sx={{
              width: 96,
              height: 96,
              bgcolor: isRecording ? 'error.light' : 'primary.light',
              '&:hover': { bgcolor: isRecording ? 'error.main' : 'primary.main' },
              userSelect: 'none',
              WebkitUserSelect: 'none',
              // Prevent iOS long-press callout & magnifying glass
              WebkitTouchCallout: 'none',
              // Prevent browser from hijacking the touch for scroll/zoom.
              // Critical for setPointerCapture to work correctly on mobile.
              touchAction: 'none',
            }}
          >
            {isRecording ? <StopIcon sx={{ fontSize: 40 }} /> : <MicIcon sx={{ fontSize: 40 }} />}
          </IconButton>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {isRecording
              ? `Aufnahme läuft… (${formatTime(recordingDuration)})`
              : 'Gedrückt halten zum Aufnehmen'}
          </Typography>
        </>
      )}

      {/* Playback */}
      {audioBlob && (
        <Box sx={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <LinearProgress variant="determinate" value={playbackProgress} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption">{formatTime(playbackTime)}</Typography>
            <Typography variant="caption">{formatTime(recordingDuration)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={isPlaying ? <StopIcon /> : <PlayArrowIcon />}
              onClick={playRecording}
              disabled={isPlaying}
            >
              Anhören
            </Button>
            <Button variant="outlined" startIcon={<ReplayIcon />} onClick={resetRecording}>
              Neu aufnehmen
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Aufnahme bereit
          </Typography>
        </Box>
      )}
    </Box>
  );
}
