import { useState, useRef, useEffect } from 'react';
import { Box, IconButton, Typography, Button, LinearProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import MicIcon from '@mui/icons-material/Mic';
import ReplayIcon from '@mui/icons-material/Replay';
import AudioVisualizer from './AudioVisualizer';
import { formatTime } from '../utils';

interface AudioRecorderProps {
  exampleAudioUrl?: string;
  onRecordingComplete: (blob: Blob) => void;
  onRecordingReset?: () => void;
}

export default function AudioRecorder({
  exampleAudioUrl,
  onRecordingComplete,
  onRecordingReset,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
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
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAnimRef = useRef<number | null>(null);

  // Example playback
  const [examplePlaying, setExamplePlaying] = useState(false);
  const exampleRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (playbackAudioRef.current) playbackAudioRef.current.pause();
      if (playbackAnimRef.current) cancelAnimationFrame(playbackAnimRef.current);
    };
  }, []);

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
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);

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

      mediaRecorder.onstop = () => {
        const type = mimeTypeRef.current || mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setAudioBlob(blob);
        onRecordingComplete(blob);
        const duration = (Date.now() - recordingStartTimeRef.current) / 1000;
        setRecordingDuration(duration);
        mediaStream.getTracks().forEach((t) => t.stop());
        setStream(null);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioBlob(null);
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((Date.now() - recordingStartTimeRef.current) / 1000);
      }, 100);
    } catch (err: any) {
      if (!window.isSecureContext) {
        alert('Mikrofon erfordert eine sichere Verbindung (HTTPS). '
            + 'Bitte verwenden Sie https://recurrsens.eu');
      } else if (err?.name === 'NotAllowedError') {
        alert('Zugriff auf das Mikrofon wurde verweigert. '
            + 'Bitte erlauben Sie den Zugriff in den Browser-Einstellungen.');
      } else {
        alert('Mikrofon konnte nicht gefunden werden. '
            + 'Bitte stellen Sie sicher, dass ein Mikrofon angeschlossen ist.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }
  };

  // ---- Playback ----
  const updateProgress = () => {
    if (!playbackAudioRef.current) return;
    const current = playbackAudioRef.current.currentTime;
    const dur = Number.isFinite(playbackAudioRef.current.duration)
      ? playbackAudioRef.current.duration
      : recordingDuration;
    if (dur > 0) {
      setPlaybackTime(current);
      setPlaybackProgress((current / dur) * 100);
    }
    playbackAnimRef.current = requestAnimationFrame(updateProgress);
  };

  const playRecording = () => {
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    playbackAudioRef.current = audio;
    setIsPlaying(true);
    audio.play().catch(() => setIsPlaying(false));
    playbackAnimRef.current = requestAnimationFrame(updateProgress);
    audio.onended = () => {
      setIsPlaying(false);
      playbackAudioRef.current = null;
      if (playbackAnimRef.current) cancelAnimationFrame(playbackAnimRef.current);
      setPlaybackProgress(0);
      setPlaybackTime(0);
      URL.revokeObjectURL(url);
    };
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

      {/* Visualizer */}
      {isRecording && stream && <AudioVisualizer stream={stream} />}

      {/* Record button – push-to-talk */}
      {!audioBlob && (
        <>
          <IconButton
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => { if (isRecording) stopRecording(); }}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            onContextMenu={(e) => e.preventDefault()}
            color={isRecording ? 'error' : 'primary'}
            sx={{
              width: 96,
              height: 96,
              bgcolor: isRecording ? 'error.light' : 'primary.light',
              '&:hover': { bgcolor: isRecording ? 'error.main' : 'primary.main' },
              userSelect: 'none',
              WebkitTouchCallout: 'none',
            }}
          >
            {isRecording ? <StopIcon sx={{ fontSize: 40 }} /> : <MicIcon sx={{ fontSize: 40 }} />}
          </IconButton>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {isRecording
              ? `Aufnahme läuft… (${formatTime(recordingDuration)})`
              : 'Gedrückt halten zum Aufnehmen'}
          </Typography>
          {!isRecording && (
            <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ maxWidth: 300 }}>
              Falls Sie versehentlich losgelassen haben, halten Sie den Button erneut gedrückt.
            </Typography>
          )}
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
