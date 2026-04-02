"use client";

import { useState, useMemo } from "react";
import { Patient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Search, ArrowUpDown, Filter } from "lucide-react";
import { PatientAccessDialog } from "./PatientAccessDialog";
import { DeletePatientButton } from "./DeletePatientButton";
import { UnlockPatientDialog } from "./UnlockPatientDialog";
import Link from "next/link";
import { StatusBadge, DiagnosisBadge } from "./Badges";

type SortConfig = {
  key: keyof Patient | 'age_gender';
  direction: 'asc' | 'desc';
} | null;

function getAge(birthDate: string | Date | undefined): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function PatientList({ patients }: { patients: Patient[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [diagnosisFilter, setDiagnosisFilter] = useState<string>("ALL");
  const [predictionFilter, setPredictionFilter] = useState<string>("ALL");
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const matchesSearch = patient.patientId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || patient.status === statusFilter;
      const matchesDiagnosis =
        diagnosisFilter === "ALL"
        || patient.diagnosis === diagnosisFilter
        || (diagnosisFilter === "INFECTED" && ["LEFT", "RIGHT", "BOTH"].includes(patient.diagnosis));
      const matchesPrediction = predictionFilter === "ALL" || 
        patient.predictionPre === predictionFilter || 
        patient.predictionPost === predictionFilter;

      return matchesSearch && matchesStatus && matchesDiagnosis && matchesPrediction;
    });
  }, [patients, searchTerm, statusFilter, diagnosisFilter, predictionFilter]);

  const sortedPatients = useMemo(() => {
    if (!sortConfig) return filteredPatients;

    return [...filteredPatients].sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof Patient];
      let bValue: any = b[sortConfig.key as keyof Patient];

      if (sortConfig.key === 'age_gender') {
        aValue = getAge(a.birthDate);
        bValue = getAge(b.birthDate);
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredPatients, sortConfig]);

  const handleSort = (key: keyof Patient | 'age_gender') => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return current.direction === 'asc' 
          ? { key, direction: 'desc' } 
          : null;
      }
      return { key, direction: 'asc' };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Suche nach Patienten-ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 bg-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle Status</SelectItem>
            <SelectItem value="NEW">Neu</SelectItem>
            <SelectItem value="CONSENT_GIVEN">Einwilligung erteilt</SelectItem>
            <SelectItem value="DEMOGRAPHICS_DONE">Demografie erfasst</SelectItem>
            <SelectItem value="PRE_OP_DONE">Prä-OP fertig</SelectItem>
            <SelectItem value="POST_OP_STARTED">Post-OP gestartet</SelectItem>
            <SelectItem value="POST_OP_DONE">Post-OP fertig</SelectItem>
            <SelectItem value="COMPLETED">Abgeschlossen</SelectItem>
          </SelectContent>
        </Select>
        <Select value={diagnosisFilter} onValueChange={setDiagnosisFilter}>
          <SelectTrigger className="w-[180px] bg-white">
            <SelectValue placeholder="Diagnose" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle Diagnosen</SelectItem>
            <SelectItem value="TODO">Ausstehend</SelectItem>
            <SelectItem value="INFECTED">RP (alle)</SelectItem>
            <SelectItem value="LEFT">Links (RP)</SelectItem>
            <SelectItem value="RIGHT">Rechts (RP)</SelectItem>
            <SelectItem value="BOTH">Beidseitig (RP)</SelectItem>
            <SelectItem value="HEALTHY">keine RP</SelectItem>
          </SelectContent>
        </Select>
        <Select value={predictionFilter} onValueChange={setPredictionFilter}>
          <SelectTrigger className="w-[180px] bg-white">
            <SelectValue placeholder="Vorhersage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle Vorhersagen</SelectItem>
            <SelectItem value="TODO">Ausstehend</SelectItem>
            <SelectItem value="INFECTED">RP</SelectItem>
            <SelectItem value="HEALTHY">keine RP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Aktive Patienten ({sortedPatients.length})</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-medium">
              <tr>
                <SortableHeader label="Patienten-ID" sortKey="patientId" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="Status" sortKey="status" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="Alter / Geschlecht" sortKey="age_gender" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="Diagnose" sortKey="diagnosis" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="KI (Prä)" sortKey="predictionPre" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="KI (Post)" sortKey="predictionPost" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="Erstellt am" sortKey="createdAt" currentSort={sortConfig} onSort={handleSort} />
                <th className="px-6 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedPatients.map((patient) => (
                <tr key={patient.$id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {patient.patientId}
                  </td>
                  <td className="px-6 py-4">
                    {patient.status === 'PRE_OP_DONE' ? (
                      <UnlockPatientDialog patient={patient} />
                    ) : (
                      <StatusBadge status={patient.status} />
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {getAge(patient.birthDate) > 0 ? getAge(patient.birthDate) : '-'} / {formatGender(patient.gender)}
                  </td>
                  <td className="px-6 py-4">
                    <DiagnosisBadge value={patient.diagnosis} />
                  </td>
                  <td className="px-6 py-4">
                    <DiagnosisBadge
                      value={patient.predictionPre}
                      type="prediction"
                      percentage={patient.aiPercentageRPPre}
                      gradcamPrediction={patient.gradcamPredictionPre}
                      gradcamPercentage={patient.gradcamPercentagePre}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <DiagnosisBadge
                      value={patient.predictionPost}
                      type="prediction"
                      percentage={patient.aiPercentageRPPost}
                      gradcamPrediction={patient.gradcamPredictionPost}
                      gradcamPercentage={patient.gradcamPercentagePost}
                    />
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(patient.createdAt).toLocaleDateString('de-DE')}
                  </td>
                  <td className="px-6 py-4 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Details anzeigen" asChild>
                      <Link href={`/details/${patient.$id}`}>
                        <Search className="h-4 w-4 text-gray-600" />
                      </Link>
                    </Button>

                    <PatientAccessDialog 
                      patient={patient}
                      trigger={
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Zugangsoptionen öffnen">
                          <ExternalLink className="h-4 w-4 text-blue-600" />
                        </Button>
                      }
                    />
                    
                    <DeletePatientButton patientId={patient.$id} />
                  </td>
                </tr>
              ))}
              {sortedPatients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    Keine Patienten gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({ 
  label, 
  sortKey, 
  currentSort, 
  onSort 
}: { 
  label: string, 
  sortKey: keyof Patient | 'age_gender', 
  currentSort: SortConfig, 
  onSort: (key: keyof Patient | 'age_gender') => void 
}) {
  return (
    <th 
      className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors group"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 transition-opacity ${currentSort?.key === sortKey ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
      </div>
    </th>
  );
}

function formatGender(gender: string) {
  const map: Record<string, string> = {
    'M': 'Männlich',
    'W': 'Weiblich',
    'D': 'Divers',
    '?': '-'
  };
  return map[gender] || gender;
}

