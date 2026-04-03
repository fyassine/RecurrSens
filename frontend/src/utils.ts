export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getAge(birthDate: string | null | undefined): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function formatGender(gender: string): string {
  const map: Record<string, string> = {
    M: 'Männlich',
    W: 'Weiblich',
    D: 'Divers',
    '?': '-',
  };
  return map[gender] || gender;
}

export async function calculateRMS(blob: Blob): Promise<number> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
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
