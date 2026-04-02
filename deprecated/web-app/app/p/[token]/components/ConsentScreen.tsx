'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { updatePatientData } from '@/lib/api';

interface ConsentScreenProps {
  token: string;
  onAccept: () => void;
}

export default function ConsentScreen({ token, onAccept }: ConsentScreenProps) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      await updatePatientData(token, {
        status: 'CONSENT_GIVEN'
      });
      onAccept();
    } catch (error) {
      console.error('Error updating consent status:', error);
      alert('Fehler beim Speichern. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Willkommen zur TUM Stimmprobenerfassung</CardTitle>
        <CardDescription>
          Bitte lesen Sie die folgende Einwilligungserklärung sorgfältig durch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted p-6 rounded-lg max-h-96 overflow-y-auto text-sm text-muted-foreground space-y-4">
          <p>
            Sehr geehrte Patientin, sehr geehrter Patient,
          </p>
          
          <p>
            wir möchten Sie bitten, an dieser wissenschaftlichen Studie zur Erfassung von 
            Stimmproben teilzunehmen. Die Daten werden ausschließlich zu Forschungszwecken 
            verwendet und dienen der Entwicklung von KI-Modellen zur automatisierten 
            Erkennung von Recurrensparesen.
          </p>
          
          <p>
            <strong className="text-foreground">Datenerfassung:</strong> Es werden zwei Audioaufnahmen Ihrer Stimme 
            erstellt (vor und nach der Operation) sowie demografische Daten (Alter und Geschlecht).
          </p>
          
          <p>
            <strong className="text-foreground">Datenschutz:</strong> Alle Daten werden pseudonymisiert gespeichert und 
            ausschließlich auf Servern der TUM verarbeitet.
          </p>
          
          <p>
            <strong className="text-foreground">Freiwilligkeit:</strong> Die Teilnahme ist freiwillig und kann jederzeit 
            ohne Angabe von Gründen widerrufen werden.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="consent" 
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked as boolean)}
          />
          <Label htmlFor="consent" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Ich habe die Einwilligungserklärung gelesen und akzeptiere diese.
          </Label>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          size="lg" 
          onClick={handleAccept} 
          disabled={!accepted || loading}
        >
          {loading ? 'Wird gespeichert...' : 'Akzeptieren und fortfahren'}
        </Button>
      </CardFooter>
    </Card>
  );
}
