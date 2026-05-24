import { Text, Title } from '@mantine/core';
import { Settings } from 'lucide-react';

export default function EinstellungenPage() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-[var(--mantine-color-dimmed)]">
      <Settings size={48} className="text-[var(--mantine-color-default-border)]" />
      <Title order={5} c="dark">Einstellungen</Title>
      <Text size="sm" c="dimmed">Demnächst verfügbar.</Text>
    </div>
  );
}
