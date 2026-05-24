import { useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmColor = 'brand',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  confirmColor?: 'brand' | 'red' | 'yellow' | 'green';
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={open} onClose={onCancel} title={title} size="sm" centered>
      <Stack gap="md">
        <Text size="sm">{message}</Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onCancel} disabled={loading}>
            Abbrechen
          </Button>
          <Button color={confirmColor} onClick={handleConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
