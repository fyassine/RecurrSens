import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom doesn't implement these browser APIs that Mantine / media components
// rely on at render time.
if (!window.HTMLMediaElement.prototype.load) {
  window.HTMLMediaElement.prototype.load = () => {};
}

window.matchMedia =
  window.matchMedia ||
  ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = window.ResizeObserver || (ResizeObserverStub as typeof ResizeObserver);
