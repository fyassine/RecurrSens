"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Unlock, Loader2 } from "lucide-react";
import { advancePatientStepAction } from "@/app/actions";

interface UnlockPatientDialogProps {
  patient: {
    $id: string;
    patientId: string;
  };
}

export function UnlockPatientDialog({ patient }: UnlockPatientDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleUnlock = async () => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("token", patient.$id);
    await advancePatientStepAction(formData);
    setIsLoading(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="sm" 
          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-sm"
        >
          <Unlock className="mr-2 h-4 w-4" />
          Freischalten
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <Unlock className="h-5 w-5" />
            Patient freischalten?
          </DialogTitle>
          <DialogDescription>
            Möchten Sie den Patienten <strong>{patient.patientId}</strong> für die Post-OP Phase freischalten?
            <br /><br />
            Der Patient kann anschließend die Post-OP Aufnahmen durchführen.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Abbrechen
          </Button>
          <Button onClick={handleUnlock} disabled={isLoading} className="bg-orange-500 hover:bg-orange-600 text-white">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Jetzt freischalten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
