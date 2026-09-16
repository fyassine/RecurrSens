export interface AudioTrackSettingsInfo {
  label?: string;
  sample_rate?: number;
  channel_count?: number;
  echo_cancellation?: boolean;
  auto_gain_control?: boolean;
  noise_suppression?: boolean;
  latency?: number;
}

export interface ClientDeviceEnvironment {
  type?: 'Mobil' | 'Tablet' | 'Desktop' | 'Unbekannt';
  family?: string;
  model?: string;
  platform?: string;
  vendor?: string;
  screen_width?: number;
  screen_height?: number;
  device_pixel_ratio?: number;
  max_touch_points?: number;
  hardware_concurrency?: number;
  device_memory_gb?: number;
}

export interface ClientBrowserInfo {
  name?: string;
  version?: string;
  os?: string;
  os_version?: string;
  language?: string;
  raw_user_agent?: string;
}

export interface ParsedDeviceInfo {
  browser?: string | null;
  browser_version?: string | null;
  os?: string | null;
  os_version?: string | null;
  device_type?: 'Mobil' | 'Tablet' | 'Desktop' | 'Unbekannt';
  device_family?: string | null;
}

export interface RecordingDeviceInfo {
  microphone?: AudioTrackSettingsInfo;
  audio_format?: {
    mime_type?: string;
  };
  device?: ClientDeviceEnvironment;
  browser?: ClientBrowserInfo;
  parsed?: ParsedDeviceInfo;
}

/**
 * Capture available audio input track settings and client device telemetry.
 */
export function getRecordingDeviceInfo(
  stream?: MediaStream | null,
  mimeType?: string
): RecordingDeviceInfo {
  const info: RecordingDeviceInfo = {
    microphone: {},
    audio_format: { mime_type: mimeType || undefined },
    device: {},
    browser: {},
  };

  // 1. Microphone Hardware / Track settings
  if (stream) {
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      info.microphone = {
        label: audioTrack.label || 'Standard-Mikrofon',
      };
      if (typeof audioTrack.getSettings === 'function') {
        const settings = audioTrack.getSettings() as MediaTrackSettings & { latency?: number };
        if (settings.sampleRate) info.microphone.sample_rate = settings.sampleRate;
        if (settings.channelCount) info.microphone.channel_count = settings.channelCount;
        if (settings.echoCancellation !== undefined) {
          info.microphone.echo_cancellation = settings.echoCancellation;
        }
        if (settings.autoGainControl !== undefined) {
          info.microphone.auto_gain_control = settings.autoGainControl;
        }
        if (settings.noiseSuppression !== undefined) {
          info.microphone.noise_suppression = settings.noiseSuppression;
        }
        if (settings.latency !== undefined) {
          info.microphone.latency = settings.latency;
        }
      }
    }
  }

  // 2. Client Device & Display Environment
  if (typeof window !== 'undefined') {
    if (window.screen) {
      info.device!.screen_width = window.screen.width;
      info.device!.screen_height = window.screen.height;
    }
    info.device!.device_pixel_ratio = window.devicePixelRatio || 1;
  }

  // 3. Navigator environment
  if (typeof navigator !== 'undefined') {
    info.browser!.language = navigator.language;
    info.browser!.raw_user_agent = navigator.userAgent;
    info.device!.platform = navigator.platform;
    info.device!.vendor = navigator.vendor;
    info.device!.max_touch_points = navigator.maxTouchPoints || 0;
    if (navigator.hardwareConcurrency) {
      info.device!.hardware_concurrency = navigator.hardwareConcurrency;
    }
    const navAny = navigator as unknown as {
      deviceMemory?: number;
      userAgentData?: { mobile?: boolean; platform?: string };
    };
    if (navAny.deviceMemory) {
      info.device!.device_memory_gb = navAny.deviceMemory;
    }
  }

  return info;
}

/**
 * Format a human-readable summary string for device info badges/tooltips.
 */
export function formatDeviceSummary(info?: RecordingDeviceInfo | null): string {
  if (!info) return '';
  const parsed = info.parsed;
  const dev = info.device;
  const browser = info.browser;
  const mic = info.microphone;

  const parts: string[] = [];

  const deviceType = parsed?.device_type || dev?.type;
  if (deviceType && deviceType !== 'Unbekannt') {
    parts.push(deviceType);
  }

  const deviceFamily = parsed?.device_family || dev?.family || dev?.model;
  if (
    deviceFamily &&
    !['Generic Smartphone', 'Generic Feature Phone', 'Other'].includes(deviceFamily)
  ) {
    if (!parts.includes(deviceFamily)) {
      parts.push(deviceFamily);
    }
  }

  const browserName = parsed?.browser || browser?.name;
  if (browserName) {
    parts.push(browserName);
  }

  if (mic?.label) {
    parts.push(mic.label);
  }

  return parts.join(' · ');
}
