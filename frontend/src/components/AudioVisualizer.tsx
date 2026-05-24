import { useRef, useEffect } from 'react';

export default function AudioVisualizer({ stream }: { stream: MediaStream }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !stream) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 1024;
    source.connect(analyser);
    audioContextRef.current = audioContext;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const smoothedArray = new Float32Array(bufferLength).fill(128);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = '#1565c0';
      canvasCtx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      const smoothingFactor = 0.5;

      for (let i = 0; i < bufferLength; i++) {
        smoothedArray[i] += (dataArray[i] - smoothedArray[i]) * smoothingFactor;
        const v = (smoothedArray[i] - 128) / 128.0;
        const y = ((v * 0.5 + 1) * canvas.height) / 2;

        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      audioContext.close();
    };
  }, [stream]);

  return (
    <div className="flex justify-center">
      <canvas
        ref={canvasRef}
        width={300}
        height={60}
        className="rounded-lg bg-gray-100 dark:bg-gray-800"
        style={{ width: 300, height: 60 }}
      />
    </div>
  );
}
