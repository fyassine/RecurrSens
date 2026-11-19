import { describe, it, expect } from 'vitest';
import { encodeWav, trimToMono } from './trimAudio';

describe('trimToMono', () => {
  it('drops the first `skip` frames', () => {
    const out = trimToMono([Float32Array.of(1, 2, 3, 4, 5)], 2);
    expect(Array.from(out)).toEqual([3, 4, 5]);
  });

  it('averages channels into mono', () => {
    const out = trimToMono([Float32Array.of(0, 1, 1), Float32Array.of(0, 0, 1)], 1);
    expect(Array.from(out)).toEqual([0.5, 1]);
  });

  it('returns an empty array when skip exceeds the length', () => {
    expect(trimToMono([Float32Array.of(1, 2)], 5)).toHaveLength(0);
  });
});

describe('encodeWav', () => {
  it('writes a valid 16-bit mono PCM header and payload', async () => {
    const blob = encodeWav(Float32Array.of(0, 1, -1), 16000);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 3 * 2);

    const view = new DataView(await blob.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(o + i)));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });
});
