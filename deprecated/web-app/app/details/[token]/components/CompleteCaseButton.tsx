'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { advancePatientStepAction } from '@/app/actions';
import { CheckCircle } from 'lucide-react';

export function CompleteCaseButton({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('token', token);
      const result = await advancePatientStepAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    } catch (error) {
      console.error("Failed to complete case", error);
      setError("Konnte nicht abgeschlossen werden.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full bg-green-600 hover:bg-green-700 text-white shadow-sm gap-2">
          <CheckCircle className="h-4 w-4" />
          Fall abschließen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fall abschließen?</DialogTitle>
          <DialogDescription>
            Möchten Sie diesen Fall wirklich als abgeschlossen markieren? 
            Dies bestätigt, dass alle Schritte durchlaufen wurden.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md p-2">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleComplete} 
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={isLoading}
          >
            {isLoading ? 'Wird abgeschlossen...' : 'Ja, abschließen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
