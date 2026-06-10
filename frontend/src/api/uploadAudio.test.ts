import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios so module import (axios.create) is safe. uploadAudio posts via the
// `publicApi` instance, whose `.post` is the mocked instance method below.
vi.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: { create: () => instance, post: vi.fn(), isAxiosError: () => false },
    isAxiosError: () => false,
  };
});

import axios from 'axios';
import { uploadAudio } from './client';

// The shared mocked instance returned by axios.create(); publicApi.post === this.
const instancePost = vi.mocked(axios.create()).post;

function uploadedFilename(): string {
  const form = vi.mocked(instancePost).mock.calls.at(-1)![1] as FormData;
  const file = form.get('file') as File;
  return file.name;
}

describe('uploadAudio — filename extension matches blob MIME type', () => {
  beforeEach(() => {
    vi.mocked(instancePost).mockClear();
  });

  it('names an iOS MP4 recording .mp4 (not the hardcoded .webm)', async () => {
    const blob = new Blob([new Uint8Array(16)], { type: 'audio/mp4' });
    await uploadAudio('tok', blob, 'vowel_i');
    expect(uploadedFilename()).toBe('recording.mp4');
  });

  it('names a Chrome WebM recording .webm', async () => {
    const blob = new Blob([new Uint8Array(16)], { type: 'audio/webm;codecs=opus' });
    await uploadAudio('tok', blob, 'vowel_i');
    expect(uploadedFilename()).toBe('recording.webm');
  });

  it('falls back to .webm for an unknown/empty blob type', async () => {
    const blob = new Blob([new Uint8Array(16)], { type: '' });
    await uploadAudio('tok', blob, 'vowel_i');
    expect(uploadedFilename()).toBe('recording.webm');
  });

  it('preserves the original name when given a File', async () => {
    const file = new File([new Uint8Array(16)], 'clinical.wav', { type: 'audio/wav' });
    await uploadAudio('tok', file, 'vowel_i');
    expect(uploadedFilename()).toBe('clinical.wav');
  });
});
