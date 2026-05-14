export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export async function getAudioDuration(blob: Blob): Promise<number> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();
  return buffer.duration;
}

export async function calculateRMS(blob: Blob): Promise<number> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioCtx();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const channelData = audioBuffer.getChannelData(0);

  let sumOfSquares = 0;
  for (let i = 0; i < channelData.length; i++) {
    sumOfSquares += channelData[i] * channelData[i];
  }
  const rms = Math.sqrt(sumOfSquares / channelData.length);
  await audioContext.close();

  if (rms === 0) return -Infinity;
  return 20 * Math.log10(rms);
}
