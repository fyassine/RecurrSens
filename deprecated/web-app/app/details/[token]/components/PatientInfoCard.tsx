'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/dashboard/Badges';
import { CompleteCaseButton } from './CompleteCaseButton';
import { updatePatientData, type Patient } from '@/lib/api';
import { Calendar, Pencil, User } from 'lucide-react';

interface PatientInfoCardProps {
  token: string;
  patientId: string;
  status: Patient['status'];
  gender: Patient['gender'];
  birthDate?: string;
  createdAt: string;
  showCompleteCase: boolean;
}

export function PatientInfoCard({
  token,
  patientId,
  status,
  gender,
  birthDate,
  createdAt,
  showCompleteCase,
}: PatientInfoCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [patientIdInput, setPatientIdInput] = useState(patientId);
  const [birthDateInput, setBirthDateInput] = useState(
    birthDate ? new Date(birthDate).toISOString().split('T')[0] : ''
  );
  const [genderInput, setGenderInput] = useState<Patient['gender'] | ''>(gender || '');

  const createdAtFormatted = useMemo(
    () => new Date(createdAt).toLocaleDateString('de-DE'),
    [createdAt]
  );

  const birthDateFormatted = useMemo(() => {
    if (!birthDate) return '-';
    return new Date(birthDate).toLocaleDateString('de-DE');
  }, [birthDate]);

  const genderLabel = useMemo(() => {
    const map: Record<Patient['gender'], string> = {
      M: 'Männlich',
      W: 'Weiblich',
      D: 'Divers',
      '?': 'Unbekannt',
    };
    return map[gender] || gender || '-';
  }, [gender]);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const patientIdValue = formData.get('patientId') as string;
    const dateValue = formData.get('birthDate') as string;
    
    console.log('Form submitted - patientId:', patientIdValue, 'birthDate:', dateValue, 'gender:', genderInput);
    
    if (!patientIdValue || !dateValue || genderInput === '') {
      setError(`Bitte alle Felder ausfüllen. (patientId: "${patientIdValue}", birthDate: "${dateValue}", gender: "${genderInput}")`);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const payload: any = {
          patientId: patientIdValue || undefined,
          birthDate: dateValue ? new Date(dateValue) : undefined,
          gender: genderInput || undefined,
        };

        // If demographics were missing/early in the flow, mark them as done.
        if ((status === 'NEW' || status === 'CONSENT_GIVEN') && dateValue && genderInput) {
          payload.status = 'DEMOGRAPHICS_DONE';
        }

        await updatePatientData(token, payload);
        setIsEditing(false);
        router.refresh();
      } catch (err) {
        console.error('Failed to update patient demographics', err);
        setError('Konnte nicht gespeichert werden. Bitte erneut versuchen.');
      }
    });
  };

  return (
    <Card className="border-none shadow-md bg-white/80 backdrop-blur">
      <CardHeader className="pb-4 border-b border-gray-100 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-xl text-gray-800">
          <User className="h-5 w-5 text-blue-600" />
          Patienten Details
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          onClick={() => setIsEditing((prev) => !prev)}
          aria-label={isEditing ? 'Abbrechen' : 'Bearbeiten'}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="pt-4 space-y-5">
        {isEditing ? (
          <form onSubmit={handleSave}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-gray-100 bg-gray-50/70 p-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="patientId">Patienten-ID</Label>
                <Input
                  id="patientId"
                  name="patientId"
                  defaultValue={patientIdInput}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">Geburtsdatum</Label>
                <input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  defaultValue={birthDateInput}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Geschlecht</Label>
                <Select value={genderInput || undefined} onValueChange={(val) => setGenderInput(val as Patient['gender'])} required>
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Bitte wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Männlich</SelectItem>
                    <SelectItem value="W">Weiblich</SelectItem>
                    <SelectItem value="D">Divers</SelectItem>
                    <SelectItem value="?">Unbekannt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving ? 'Speichern...' : 'Speichern'}
                </Button>
              </div>
              {error && (
                <div className="md:col-span-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md p-2">
                  {error}
                </div>
              )}
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Patienten-ID
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {patientId}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</div>
              <div className="font-medium text-gray-900">
                <StatusBadge status={status} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Geburtstag</div>
              <div className="font-medium text-gray-900">{birthDateFormatted}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Geschlecht</div>
              <div className="font-medium text-gray-900">{genderLabel}</div>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Erstellt am</div>
          <div className="flex items-center gap-2 text-gray-700">
            <Calendar className="h-4 w-4 text-gray-400" />
            {createdAtFormatted}
          </div>
        </div>

        {showCompleteCase && (
          <div className="pt-4 border-t border-gray-100">
            <CompleteCaseButton token={token} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
