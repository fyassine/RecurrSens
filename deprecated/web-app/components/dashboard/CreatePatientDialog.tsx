"use client";

import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPatientAction } from "@/app/actions";
import { Loader2, CheckCircle2, Plus } from "lucide-react";
import { PatientAccessOptions } from "./PatientAccessOptions";

export function CreatePatientDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [createdPatient, setCreatedPatient] = useState<{ $id: string; patientId: string } | null>(null);

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setStep(1);
        setCreatedPatient(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createPatientAction(formData);

    setIsLoading(false);

    if (result?.success && result.patient) {
      setCreatedPatient(result.patient);
      setStep(2);
    }
  };

  const handleReset = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="mr-2 h-4 w-4" />
          Patient anlegen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        {step === 1 ? (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Patient erstellen</DialogTitle>
              <DialogDescription>
                Geben Sie die interne Patienten-ID ein, um einen neuen sicheren Token zu generieren.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="patientId" className="text-right">
                  ID
                </Label>
                <Input
                  id="patientId"
                  name="patientId"
                  placeholder="z.B. P-1234"
                  className="col-span-3"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Weiter
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-6 w-6" />
                Patient erstellt
              </DialogTitle>
              <DialogDescription>
                Patient <strong>{createdPatient?.patientId}</strong> ist bereit.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              {createdPatient && <PatientAccessOptions patient={createdPatient} />}
            </div>

            <DialogFooter>
              <Button onClick={handleReset}>Fertig</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

