import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center px-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-6">
              <AlertTriangle className="w-12 h-12 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <CardTitle className="text-2xl">Link ungültig oder abgelaufen</CardTitle>
          <CardDescription>
            Der von Ihnen verwendete Link ist entweder ungültig oder bereits abgelaufen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Bitte wenden Sie sich an Ihre Klinik, um einen neuen Link zu erhalten.
            </p>
          </div>

          <div className="text-xs text-muted-foreground/50">
            Fehler: Token nicht gefunden oder abgelaufen
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
