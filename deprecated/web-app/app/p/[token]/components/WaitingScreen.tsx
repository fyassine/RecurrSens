'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

export default function WaitingScreen() {
  return (
    <Card className="max-w-2xl mx-auto text-center">
      <CardHeader>
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-6">
            <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <CardTitle className="text-3xl">Vielen Dank!</CardTitle>
        <CardDescription className="text-lg">
          Ihre Pre-OP Aufnahme wurde erfolgreich gespeichert.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-950 p-6 rounded-lg">
          <p className="text-blue-900 dark:text-blue-100">
            Nach Ihrer Operation wird das Klinikpersonal die zweite Aufnahme für Sie 
            freischalten. Sie können dann denselben Link verwenden, um die Post-OP 
            Aufnahme durchzuführen.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Sie können dieses Fenster nun schließen.
        </p>
      </CardContent>
    </Card>
  );
}
