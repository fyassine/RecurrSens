import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/render';

vi.mock('../api/client', () => ({
  getAudioStreamUrl: vi.fn(),
}));

import { getAudioStreamUrl } from '../api/client';
import { AudioPlayer } from './AudioPlayer';

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.mocked(getAudioStreamUrl).mockReset();
  });

  it('renders the audio element with the fetched signed URL', async () => {
    vi.mocked(getAudioStreamUrl).mockResolvedValue('/api/audio/abc/?t=signed');

    const { container } = renderWithProviders(<AudioPlayer fileId="abc" />);

    await waitFor(() => {
      const audio = container.querySelector('audio');
      expect(audio).toHaveAttribute('src', '/api/audio/abc/?t=signed');
    });
    expect(getAudioStreamUrl).toHaveBeenCalledWith('abc');
  });

  it('shows an error message when the signed URL cannot be fetched', async () => {
    vi.mocked(getAudioStreamUrl).mockRejectedValue(new Error('403'));

    renderWithProviders(<AudioPlayer fileId="abc" />);

    expect(await screen.findByText(/konnte nicht geladen werden/i)).toBeInTheDocument();
  });
});
