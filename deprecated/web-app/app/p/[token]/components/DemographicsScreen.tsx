'use client';

import { useState } from 'react';
import { updatePatientData, type Patient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface DemographicsScreenProps {
  token: string;
  onComplete: () => void;
}

export default function DemographicsScreen({ token, onComplete }: DemographicsScreenProps) {
  const [gender, setGender] = useState<Patient['gender'] | ''>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const dateValue = formData.get('birthDate') as string;
    
    console.log('[CLIENT] Form submitted');
    console.log('[CLIENT] birthDate from FormData:', dateValue);
    console.log('[CLIENT] gender:', gender);
    
    if (!dateValue || gender === '') {
      alert(`Bitte füllen Sie alle Felder aus.\n\nbirthDate: "${dateValue}"\ngender: "${gender}"`);
      return;
    }

    setLoading(true);
    try {
      console.log('[CLIENT] Sending data to server:', { birthDate: dateValue, gender });
      await updatePatientData(token, {
        birthDate: new Date(dateValue),
        gender: gender as Patient['gender'],
        status: 'DEMOGRAPHICS_DONE'
      });
      onComplete();
    } catch (error) {
      console.error('Error saving demographics:', error);
      alert('Fehler beim Speichern. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Persönliche Angaben</CardTitle>
        <CardDescription>
          Bitte geben Sie Ihr Geburtsdatum und Geschlecht an. Diese Daten werden für die Auswertung benötigt.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="birthDate">Geburtsdatum</Label>
            <input
              id="birthDate"
              name="birthDate"
              type="date"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gender">Geschlecht</Label>
            <Select value={gender || undefined} onValueChange={(val) => setGender(val as Patient['gender'])} required>
              <SelectTrigger id="gender">
                <SelectValue placeholder="Bitte wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Männlich</SelectItem>
                <SelectItem value="W">Weiblich</SelectItem>
                <SelectItem value="D">Divers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            type="submit"
            className="w-full" 
            size="lg" 
            disabled={loading}
          >
            {loading ? 'Wird gespeichert...' : 'Weiter'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
