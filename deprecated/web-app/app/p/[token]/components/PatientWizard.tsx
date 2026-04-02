'use client';

import { useState } from 'react';
import { PublicPatient, getPatientByToken } from '@/lib/api';
import ConsentScreen from './ConsentScreen';
import DemographicsScreen from './DemographicsScreen';
import PreOpScreen from './PreOpScreen';
import WaitingScreen from './WaitingScreen';
import PostOpScreen from './PostOpScreen';
import CompletedScreen from './CompletedScreen';
import { RecoveryScreen } from './RecoveryScreen';

interface PatientWizardProps {
  patient: PublicPatient;
  token: string;
}

export default function PatientWizard({ patient, token }: PatientWizardProps) {
  // Initialize status, upgrading legacy state if needed
  const [currentStatus, setCurrentStatus] = useState(patient.status);
  const [currentPatient, setCurrentPatient] = useState<PublicPatient>(patient);

  const renderScreen = () => {
    switch (currentStatus) {
      case 'NEW':
        return <ConsentScreen token={token} onAccept={() => setCurrentStatus('CONSENT_GIVEN')} />;

      case 'CONSENT_GIVEN':
        return <DemographicsScreen token={token} onComplete={async () => {
          // After demographics are saved, fetch updated patient
          const updated = await getPatientByToken(token);
          if (updated) setCurrentPatient(updated);
          setCurrentStatus('DEMOGRAPHICS_DONE');
        }} />;

      case 'DEMOGRAPHICS_DONE':
        return <PreOpScreen token={token} patient={currentPatient} onComplete={() => setCurrentStatus('PRE_OP_DONE')} />;
      
      case 'PRE_OP_DONE':
        return <WaitingScreen />;
      
      case 'POST_OP_STARTED':
        return <PostOpScreen token={token} patient={currentPatient} onComplete={() => setCurrentStatus('POST_OP_DONE')} />;
      
      case 'POST_OP_DONE':
      case 'COMPLETED':
        if (currentPatient.diagnosis === "HEALTHY" || currentPatient.diagnosis === "TODO") {
          return <CompletedScreen />;
        }
        else {
          return <RecoveryScreen />;
        }
      default:
        return <div>Unbekannter Status: {currentStatus}</div>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {renderScreen()}
    </div>
  );
}
