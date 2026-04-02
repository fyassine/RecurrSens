import { getPatientByToken, getPatientAudioUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileAudio, Calendar, Activity } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiagnosisBadge } from "@/components/dashboard/Badges";
import { DiagnosisSelect } from "@/components/dashboard/DiagnosisSelect";
import { PatientInfoCard } from "./components/PatientInfoCard";
import { ManualUploadDialog } from "./components/ManualUploadDialog";

interface PatientDetailsPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function PatientDetailsPage({ params }: PatientDetailsPageProps) {
  const { token } = await params;
  const patient = await getPatientByToken(token);

  if (!patient) {
    notFound();
  }

  // Fetch audio URLs
  const preOpAudioUrls = await Promise.all(
    patient.audioFileIdsPre.map(async (id) => ({
      id,
      url: await getPatientAudioUrl(id).catch(() => null),
    }))
  );

  const postOpAudioUrls = await Promise.all(
    patient.audioFileIdPost.map(async (id) => ({
      id,
      url: await getPatientAudioUrl(id).catch(() => null),
    }))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild className="gap-2 hover:bg-white/50">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Zurück zur Übersicht
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Patient Info */}
          <div className="lg:col-span-1 space-y-6">
            <PatientInfoCard
              token={patient.$id}
              patientId={patient.patientId}
              status={patient.status}
              birthDate={patient.birthDate ? patient.birthDate.toISOString() : undefined}
              gender={patient.gender}
              createdAt={patient.createdAt}
              showCompleteCase={patient.status === 'POST_OP_DONE'}
            />

            <Card className="border-none shadow-md bg-white/80 backdrop-blur">
              <CardHeader className="pb-4 border-b border-gray-100">
                <CardTitle className="flex items-center gap-2 text-xl text-gray-800">
                  <Activity className="h-5 w-5 text-indigo-600" />
                  Diagnose & KI
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Ärztliche Diagnose</div>
                  <DiagnosisSelect 
                    token={patient.$id} 
                    currentDiagnosis={patient.diagnosis} 
                    currentDiagnosisText={patient.diagnosisText}
                  />
                </div>
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">KI (Prä-OP)</div>
                    <div className="space-y-1">
                      <DiagnosisBadge 
                        value={patient.predictionPre} 
                        type="prediction" 
                        percentage={patient.aiPercentageRPPre}
                        gradcamPrediction={patient.gradcamPredictionPre}
                      />
                      {patient.aiReasoningPre && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-500 mb-1">Begründung:</p>
                          <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                            {patient.aiReasoningPre}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">KI (Post-OP)</div>
                    <div className="space-y-1">
                      <DiagnosisBadge 
                        value={patient.predictionPost} 
                        type="prediction" 
                        percentage={patient.aiPercentageRPPost}
                        gradcamPrediction={patient.gradcamPredictionPost}
                      />
                      {patient.aiReasoningPost && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-500 mb-1">Begründung:</p>
                          <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                            {patient.aiReasoningPost}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Audio Files */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-none shadow-md bg-white/80 backdrop-blur">
              <CardHeader className="pb-4 border-b border-gray-100">
                <CardTitle className="flex items-center gap-2 text-xl text-gray-800 justify-between w-full">
                  <span className="flex items-center gap-2">
                    <FileAudio className="h-5 w-5 text-blue-600" />
                    Prä-OP Aufnahmen
                  </span>
                  <div className="flex items-center gap-2">
                    {patient.status === 'DEMOGRAPHICS_DONE' && (
                      <ManualUploadDialog
                        token={patient.$id}
                        currentStatus={patient.status}
                        phase="PRE_OP"
                        triggerLabel="Dateien hochladen"
                      />
                    )}
                    {patient.preOpDate && (
                      <span className="flex items-center gap-1 text-sm text-gray-500">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {new Date(patient.preOpDate).toLocaleDateString('de-DE')}
                      </span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {preOpAudioUrls.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    Keine Prä-OP Aufnahmen vorhanden.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {preOpAudioUrls.map((file, index) => (
                      <div key={file.id} className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-sm font-medium text-gray-700">Aufnahme {index + 1}</div>
                        </div>
                        {file.url ? (
                          <audio
                            controls
                            src={`/api/audio/${file.id}`}
                            className="w-full h-8"
                          />
                        ) : (
                          <div className="text-sm text-red-500">Fehler beim Laden</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-white/80 backdrop-blur">
              <CardHeader className="pb-4 border-b border-gray-100">
                <CardTitle className="flex items-center gap-2 text-xl text-gray-800 justify-between w-full">
                  <span className="flex items-center gap-2">
                    <FileAudio className="h-5 w-5 text-orange-600" />
                    Post-OP Aufnahmen
                  </span>
                  <div className="flex items-center gap-2">
                    {(patient.status === 'PRE_OP_DONE' || patient.status === 'POST_OP_STARTED') && (
                      <ManualUploadDialog
                        token={patient.$id}
                        currentStatus={patient.status}
                        phase="POST_OP"
                        triggerLabel="Dateien hochladen"
                      />
                    )}
                    {patient.postOpDate && (
                      <span className="flex items-center gap-1 text-sm text-gray-500">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {new Date(patient.postOpDate).toLocaleDateString('de-DE')}
                      </span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {postOpAudioUrls.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    Keine Post-OP Aufnahmen vorhanden.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {postOpAudioUrls.map((file, index) => (
                      <div key={file.id} className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-sm font-medium text-gray-700">Aufnahme {index + 1}</div>
                          {/* Spectrogram button removed */}
                        </div>
                        {file.url ? (
                          <audio
                            controls
                            src={`/api/audio/${file.id}`}
                            className="w-full h-8"
                          />
                        ) : (
                          <div className="text-sm text-red-500">Fehler beim Laden</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
