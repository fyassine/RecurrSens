/**
 * Cut the first `seconds` off a recording and return it as a 16-bit mono WAV.
 *
 * Used by the live demo to drop the button-press click and microphone start-up
 * noise at the beginning of each recording. Runs entirely in the browser, so
 * the demo's "nothing leaves the device untrimmed / nothing is stored" contract
 * is unchanged.
 */

export const DEMO_TRIM_START_SECONDS = 0.3;

/** Encode mono float samples (−1…1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Drop the first `skip` frames and average all channels into one. */
export function trimToMono(channels: Float32Array[], skip: number): Float32Array {
  const length = Math.max(0, (channels[0]?.length ?? 0) - skip);
  const out = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < length; i++) out[i] += channel[skip + i] / channels.length;
  }
  return out;
}

export async function trimAudioStart(
  blob: Blob,
  seconds: number = DEMO_TRIM_START_SECONDS,
): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const skip = Math.round(seconds * decoded.sampleRate);
    if (skip >= decoded.length) return blob; // nothing left to keep: send the original
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
      decoded.getChannelData(c),
    );
    return encodeWav(trimToMono(channels, skip), decoded.sampleRate);
  } finally {
    await ctx.close();
  }
}
