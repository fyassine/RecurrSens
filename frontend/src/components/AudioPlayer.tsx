import { useEffect, useState } from 'react';
import { Text } from '@mantine/core';
import { getAudioStreamUrl } from '../api/client';

/**
 * Plays an audio file via a short-lived signed stream URL.
 *
 * The backend stream proxy is authorised by a signed token (not the JWT header,
 * which <audio> elements can't send), so we fetch the signed URL first and only
 * then mount the native player.
 */
export function AudioPlayer({ fileId }: { fileId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAudioStreamUrl(fileId)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (error) {
    return (
      <Text size="xs" c="red">
        Aufnahme konnte nicht geladen werden.
      </Text>
    );
  }

  return (
    <audio
      controls
      src={url ?? undefined}
      className="w-full"
      style={{ height: 32 }}
    />
  );
}
