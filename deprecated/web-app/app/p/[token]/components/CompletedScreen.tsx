'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

export default function CompletedScreen() {
  return (
    <Card className="max-w-2xl mx-auto text-center">
      <CardHeader>
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-6">
            <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <CardTitle className="text-3xl">Vielen Dank für Ihre Teilnahme!</CardTitle>
        <CardDescription className="text-lg">
          Beide Aufnahmen wurden erfolgreich gespeichert. Der Prozess ist nun vollständig 
          abgeschlossen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-green-50 dark:bg-green-950/30 p-6 rounded-lg border border-green-200 dark:border-green-900">
          <p className="text-green-900 dark:text-green-100 font-medium">
            ✓ Pre-OP Aufnahme: Gespeichert<br />
            ✓ Post-OP Aufnahme: Gespeichert
          </p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950 p-6 rounded-lg">
          <p className="text-blue-900 dark:text-blue-100">
            Ihre Daten tragen zur medizinischen Forschung bei und helfen bei der Entwicklung 
            von KI-Modellen zur automatisierten Erkennung von Stimmbandlähmungen.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Sie können dieses Fenster nun schließen.
        </p>
      </CardContent>
    </Card>
  );
}
