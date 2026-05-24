import { Card, Stack, Text, Title } from '@mantine/core';
import { CheckCircle2 } from 'lucide-react';

export default function CompletedScreen() {
  return (
    <Card withBorder radius="md" maw={640} mx="auto" p="lg">
      <Stack gap="md" align="center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/40">
          <CheckCircle2 size={48} className="text-green-600" />
        </div>
        <Title order={3} ta="center">Vielen Dank für Ihre Teilnahme!</Title>
        <Text c="dimmed" ta="center">Beide Aufnahmen wurden erfolgreich gespeichert.</Text>
      </Stack>
      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
        <Text size="sm" fw={500}>
          ✓ Pre-OP Aufnahme: Gespeichert
          <br />
          ✓ Post-OP Aufnahme: Gespeichert
        </Text>
      </div>
      <div className="mt-3 rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30">
        <Text size="sm">
          Ihre Daten tragen zur medizinischen Forschung bei und helfen bei der Entwicklung
          von KI-Modellen zur automatisierten Erkennung von Stimmbandlähmungen.
        </Text>
      </div>
      <Text size="sm" c="dimmed" ta="center" mt="md">
        Sie können dieses Fenster nun schließen.
      </Text>
    </Card>
  );
}
