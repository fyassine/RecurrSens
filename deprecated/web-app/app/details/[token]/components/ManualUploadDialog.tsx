'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { uploadAudioFile, advancePatientStep, type Patient } from '@/lib/api';
import { EXERCISES } from '@/lib/exercises';
import { UploadCloud } from 'lucide-react';

type Phase = 'PRE_OP' | 'POST_OP';

interface ManualUploadDialogProps {
  token: string;
  phase: Phase;
  currentStatus: Patient['status'];
  triggerLabel: string;
}

export function ManualUploadDialog({ token, phase, currentStatus, triggerLabel }: ManualUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isUploading, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileMap, setFileMap] = useState<Record<string, File | null>>({});

  const exercises = useMemo(() => EXERCISES, []);

  const handleFileChange = (exerciseId: string, file: File | null) => {
    setFileMap((prev) => ({ ...prev, [exerciseId]: file }));
  };

  const convertToWebm = async (exerciseId: string, file: File): Promise<File> => {
    try {
      const buffer = await file.arrayBuffer();
      const webmBlob = new Blob([buffer], { type: 'audio/webm' });
      return new File([webmBlob], `${exerciseId}.webm`, { type: 'audio/webm' });
    } catch (err) {
      console.warn('Conversion to webm failed, uploading original file.', err);
      return new File([file], `${exerciseId}.${file.name.split('.').pop() || 'dat'}`, { type: file.type });
    }
  };

  const handleUpload = () => {
    setError(null);
    startTransition(async () => {
      try {
        // Ensure all exercises have a file
        const missing = exercises.filter((ex) => !fileMap[ex.id]);
        if (missing.length > 0) {
          setError('Bitte für jede Übung eine Datei auswählen.');
          return;
        }

        // For Post-Op manual uploads, move into POST_OP_STARTED first so files are tagged correctly.
        if (phase === 'POST_OP' && currentStatus === 'PRE_OP_DONE') {
          await advancePatientStep(token); // moves to POST_OP_STARTED
        }

        for (const exercise of exercises) {
          const file = fileMap[exercise.id];
          if (!file) continue;

          const uploadFile =
            file.type.startsWith('audio/') ? await convertToWebm(exercise.id, file) : file;

          const formData = new FormData();
          formData.append('file', uploadFile);
          formData.append('exerciseId', exercise.id);

          await uploadAudioFile(token, formData);
        }

        // Advance once after all uploads are done.
        await advancePatientStep(token);
        setOpen(false);
        router.refresh();
      } catch (err) {
        console.error('Manual upload failed', err);
        setError('Hochladen fehlgeschlagen. Bitte erneut versuchen.');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-white/80 hover:bg-white">
          <UploadCloud className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dateien hochladen ({phase === 'PRE_OP' ? 'Prä-OP' : 'Post-OP'})</DialogTitle>
          <DialogDescription>
            Laden Sie für jede Übung eine Audiodatei hoch. Wir konvertieren sie zu WebM und speichern sie wie bei einer Aufnahme.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {exercises.map((exercise) => (
            <div key={exercise.id} className="space-y-2">
              <Label htmlFor={`file-${exercise.id}`} className="font-semibold text-sm">
                {exercise.title}
              </Label>
              <Input
                id={`file-${exercise.id}`}
                type="file"
                accept="audio/*"
                onChange={(e) => handleFileChange(exercise.id, e.target.files?.[0] || null)}
              />
              <p className="text-xs text-gray-500">{exercise.description}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md p-2">
            {error}
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isUploading}>
            Abbrechen
          </Button>
          <Button onClick={handleUpload} disabled={isUploading}>
            {isUploading ? 'Wird hochgeladen...' : 'Hochladen und fortfahren'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
