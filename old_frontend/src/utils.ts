export const NO_RECORDING_DATE = 'Kein Aufnahmedatum vorhanden';

const DE_DATE_OPTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
const DE_DATETIME_OPTS: Intl.DateTimeFormatOptions = { ...DE_DATE_OPTS, hour: '2-digit', minute: '2-digit' };

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('de-DE', DE_DATE_OPTS);
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('de-DE', DE_DATETIME_OPTS);
}

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
