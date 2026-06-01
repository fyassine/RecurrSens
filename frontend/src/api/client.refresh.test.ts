import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios so module import (axios.create) is safe and we can observe the
// refresh POST. The api-instance interceptors are no-ops here; we test the
// single-flight refreshAccessToken directly.
vi.mock('axios', () => {
  const post = vi.fn();
  const instance = {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: { create: () => instance, post, isAxiosError: () => false },
    isAxiosError: () => false,
  };
});

import axios from 'axios';
import { refreshAccessToken } from './client';

describe('refreshAccessToken (single-flight)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('refresh_token', 'refresh-1');
    vi.mocked(axios.post).mockReset();
  });

  it('issues only one refresh request for concurrent callers', async () => {
    let resolvePost!: (v: unknown) => void;
    vi.mocked(axios.post).mockReturnValue(
      new Promise((r) => {
        resolvePost = r;
      }),
    );

    const p1 = refreshAccessToken();
    const p2 = refreshAccessToken();

    resolvePost({ data: { access: 'new-access' } });
    const [a, b] = await Promise.all([p1, p2]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(a).toBe('new-access');
    expect(b).toBe('new-access');
    expect(localStorage.getItem('access_token')).toBe('new-access');
  });

  it('clears tokens and returns null when refresh fails', async () => {
    localStorage.setItem('access_token', 'stale');
    vi.mocked(axios.post).mockRejectedValue(new Error('401'));

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
});
