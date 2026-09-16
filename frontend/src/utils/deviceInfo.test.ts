import { describe, it, expect } from 'vitest';
import { getRecordingDeviceInfo, formatDeviceSummary, type RecordingDeviceInfo } from './deviceInfo';

describe('deviceInfo utility', () => {
  it('collects device info with null stream', () => {
    const info = getRecordingDeviceInfo(null, 'audio/webm;codecs=opus');
    expect(info.audio_format?.mime_type).toBe('audio/webm;codecs=opus');
    expect(info.browser?.language).toBeDefined();
    expect(info.device?.platform).toBeDefined();
  });

  it('collects microphone track settings when stream is present', () => {
    const mockTrack = {
      label: 'MacBook Pro Microphone (Built-in)',
      getSettings: () => ({
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        latency: 0.01,
      }),
    };
    const mockStream = {
      getAudioTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const info = getRecordingDeviceInfo(mockStream, 'audio/webm');
    expect(info.microphone?.label).toBe('MacBook Pro Microphone (Built-in)');
    expect(info.microphone?.sample_rate).toBe(48000);
    expect(info.microphone?.channel_count).toBe(1);
    expect(info.microphone?.echo_cancellation).toBe(true);
    expect(info.microphone?.noise_suppression).toBe(true);
    expect(info.microphone?.latency).toBe(0.01);
  });

  it('formats device summary correctly', () => {
    const sampleInfo: RecordingDeviceInfo = {
      parsed: {
        device_type: 'Mobil',
        device_family: 'iPhone',
        browser: 'Mobile Safari',
      },
      microphone: {
        label: 'AirPods Pro',
      },
    };

    const summary = formatDeviceSummary(sampleInfo);
    expect(summary).toBe('Mobil · iPhone · Mobile Safari · AirPods Pro');
  });

  it('handles empty or missing info gracefully in formatDeviceSummary', () => {
    expect(formatDeviceSummary(null)).toBe('');
    expect(formatDeviceSummary(undefined)).toBe('');
    expect(formatDeviceSummary({})).toBe('');
  });
});
