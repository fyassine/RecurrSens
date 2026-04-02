"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updatePatientData } from "@/lib/api";
import { useRouter } from "next/navigation";

interface DiagnosisSelectProps {
  token: string;
  currentDiagnosis: string;
  currentDiagnosisText?: string;
}

export function DiagnosisSelect({ token, currentDiagnosis, currentDiagnosisText }: DiagnosisSelectProps) {
  const [value, setValue] = useState(currentDiagnosis);
  const [textValue, setTextValue] = useState(currentDiagnosisText || "");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleChange = async (newValue: string) => {
    setValue(newValue);
    setLoading(true);
    try {
      await updatePatientData(token, { diagnosis: newValue as any });
      router.refresh();
    } catch (error) {
      console.error(error);
      setValue(value); // Revert on error
    } finally {
      setLoading(false);
    }
  };

  const handleTextBlur = async () => {
    if (textValue === currentDiagnosisText) return;
    
    setLoading(true);
    try {
      await updatePatientData(token, { diagnosisText: textValue });
      router.refresh();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Select value={value} onValueChange={handleChange} disabled={loading}>
        <SelectTrigger className="w-full bg-white">
          <SelectValue placeholder="Diagnose wählen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TODO">Ausstehend</SelectItem>
          <SelectItem value="LEFT">Linksseitige Recurrensparese</SelectItem>
          <SelectItem value="RIGHT">Rechtsseitige Recurrensparese</SelectItem>
          <SelectItem value="BOTH">Beidseitige Recurrensparese</SelectItem>
          <SelectItem value="HEALTHY">Keine Recurrensparese</SelectItem>
        </SelectContent>
      </Select>

      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Zusätzliche Anmerkungen
        </label>
        <Textarea
          placeholder="Geben Sie hier weitere Details zur Diagnose ein..."
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={handleTextBlur}
          disabled={loading}
          className="min-h-[100px] bg-white resize-none"
        />
      </div>
    </div>
  );
}
