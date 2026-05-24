import { Text, Title } from '@mantine/core';
import { BarChart3 } from 'lucide-react';

export default function AnalytikPage() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-[var(--mantine-color-dimmed)]">
      <BarChart3 size={48} className="text-[var(--mantine-color-default-border)]" />
      <Title order={5} c="dark">Analytik</Title>
      <Text size="sm" c="dimmed">Demnächst verfügbar.</Text>
    </div>
  );
}
