// lib/audioUtils.ts

export async function calculateRMS(blob: Blob): Promise<number> {
  const arrayBuffer = await blob.arrayBuffer();

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);    
    let totalSumSquared = 0;
    let totalSamples = 0;

    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        totalSumSquared += channelData[j] * channelData[j];
      }
      totalSamples += channelData.length;
    }

    const meanSquared = totalSumSquared / totalSamples;
    const rms = Math.sqrt(meanSquared);

    const dbfs = 20 * Math.log10(rms + 1e-10);

    return dbfs;

  } finally {
    await audioCtx.close();
  }
}