import { logDemoVisit, type DemoVisitEvent } from '../api/client';
import { getRecordingDeviceInfo } from './deviceInfo';

const STORAGE_KEY = 'demo_visit_id';
let fallbackId: string | null = null;

/** One id per browser tab, so a reload does not count as a new visit. */
function visitId(): string {
  try {
    let id = sessionStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    fallbackId ??= crypto.randomUUID();
    return fallbackId;
  }
}

/** Fire-and-forget: logging must never get in the way of the demo. */
export function trackDemoVisit(token: string, event: DemoVisitEvent): void {
  try {
    const { device, browser } = getRecordingDeviceInfo();
    void logDemoVisit(token, {
      visit_id: visitId(),
      event,
      device: {
        screen_width: device?.screen_width,
        screen_height: device?.screen_height,
        device_pixel_ratio: device?.device_pixel_ratio,
        max_touch_points: device?.max_touch_points,
        platform: device?.platform,
        language: browser?.language,
      },
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
