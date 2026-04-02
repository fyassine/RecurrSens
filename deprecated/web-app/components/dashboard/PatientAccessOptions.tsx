"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Copy, Check, ExternalLink } from "lucide-react";
import Link from "next/link";

interface PatientAccessOptionsProps {
  patient: {
    $id: string;
    patientId: string;
  };
}

export function PatientAccessOptions({ patient }: PatientAccessOptionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/p/${patient.$id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3">
      <Button 
        variant="outline" 
        className="w-full justify-start h-auto py-4" 
        asChild
      >
        <a href={`/api/patient/${patient.$id}/pdf`} target="_blank" rel="noopener noreferrer">
          <div className="bg-blue-100 p-2 rounded-full mr-4">
            <FileDown className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-left">
            <div className="font-semibold">PDF öffnen</div>
            <div className="text-xs text-gray-500">Enthält QR-Code für einfachen Zugang</div>
          </div>
        </a>
      </Button>

      <Button 
        variant="outline" 
        className="w-full justify-start h-auto py-4"
        onClick={handleCopyLink}
      >
        <div className="bg-green-100 p-2 rounded-full mr-4">
          {copied ? (
            <Check className="h-5 w-5 text-green-600" />
          ) : (
            <Copy className="h-5 w-5 text-green-600" />
          )}
        </div>
        <div className="text-left">
          <div className="font-semibold">
            {copied ? "In Zwischenablage kopiert!" : "Patienten-Link kopieren"}
          </div>
          <div className="text-xs text-gray-500">Direkten Link mit dem Patienten teilen</div>
        </div>
      </Button>

      <Button 
        variant="outline" 
        className="w-full justify-start h-auto py-4"
        asChild
      >
        <Link href={`/p/${patient.$id}`} target="_blank">
          <div className="bg-purple-100 p-2 rounded-full mr-4">
            <ExternalLink className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-left">
            <div className="font-semibold">App öffnen</div>
            <div className="text-xs text-gray-500">Patienten-Interface in neuem Tab öffnen</div>
          </div>
        </Link>
      </Button>
    </div>
  );
}
