import { notFound } from 'next/navigation';
import { isValidToken, getPatientByToken } from '@/lib/api';
import PatientWizard from './components/PatientWizard';

interface PatientPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function PatientPage({ params }: PatientPageProps) {
  const { token } = await params;

  // Step 1: Validate token
  const isValid = await isValidToken(token);
  
  if (!isValid) {
    notFound();
  }

  // Step 2: Get patient data
  const patient = await getPatientByToken(token);
  
  if (!patient) {
    notFound();
  }

  // Filter out sensitive data before sending to client
  const publicPatient = {
    status: patient.status,
    diagnosis: patient.diagnosis,
    gender: patient.gender,
    birthDate: patient.birthDate,
    patientId: patient.patientId,
    audioFileIdsPre: patient.audioFileIdsPre,
    audioFileIdPost: patient.audioFileIdPost,
    createdAt: patient.createdAt,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <PatientWizard patient={publicPatient} token={token} />
    </div>
  );
}
