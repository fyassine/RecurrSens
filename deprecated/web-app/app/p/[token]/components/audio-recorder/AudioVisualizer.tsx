'use client';

import { useRef, useEffect } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream;
}

export function AudioVisualizer({ stream }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !stream) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    // Setup Audio Context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 1024;
    source.connect(analyser);
    audioContextRef.current = audioContext;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    // Use Float32Array for smoother interpolation
    const smoothedArray = new Float32Array(bufferLength).fill(128);

    // Get color from CSS variable
    const primaryColorVar = getComputedStyle(document.documentElement).getPropertyValue('--primary');
    // Ensure we have a valid color string, fallback to black if needed
    const strokeColor = primaryColorVar ? `hsl(${primaryColorVar})` : 'rgb(0, 0, 0)';

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = strokeColor;
      canvasCtx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;
      
      // Lower value = slower/smoother response (0.1 to 0.3 is usually good)
      const smoothingFactor = 0.5;

      for (let i = 0; i < bufferLength; i++) {
        // Interpolate between previous smoothed value and current value
        smoothedArray[i] = smoothedArray[i] + (dataArray[i] - smoothedArray[i]) * smoothingFactor;

        // Normalize to -1..1 and dampen sensitivity
        const v = (smoothedArray[i] - 128) / 128.0;
        const y = (v * 0.5 + 1) * canvas.height / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={60} 
      className="w-full max-w-[300px] h-[60px] rounded-md bg-muted"
    />
  );
}
