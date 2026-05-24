import { Card, Stack, Text, Title } from '@mantine/core';
import { CheckCircle2 } from 'lucide-react';

export default function WaitingScreen() {
  return (
    <Card withBorder radius="md" maw={640} mx="auto" p="lg">
      <Stack gap="md" align="center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/40">
          <CheckCircle2 size={48} className="text-green-600" />
        </div>
        <Title order={3}>Vielen Dank!</Title>
        <Text c="dimmed" ta="center">Ihre Pre-OP Aufnahme wurde erfolgreich gespeichert.</Text>
      </Stack>
      <div className="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30">
        <Text size="sm">
          Nach Ihrer Operation wird das Klinikpersonal die zweite Aufnahme für Sie
          freischalten. Sie können dann denselben Link verwenden, um die Post-OP Aufnahme
          durchzuführen.
        </Text>
      </div>
      <Text size="sm" c="dimmed" ta="center" mt="md">
        Sie können dieses Fenster nun schließen.
      </Text>
    </Card>
  );
}
