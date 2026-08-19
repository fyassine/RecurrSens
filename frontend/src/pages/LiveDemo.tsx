/**
 * Live demonstration page (QR-code booth flow).
 *
 * ===========================================================================
 * PRIVACY EXCEPTION — DO NOT "FIX" THIS INTO THE NORMAL PATIENT WIZARD
 * ===========================================================================
 * The patient wizard (PatientWizardPage) walks a real patient through the full
 * exercise set and uploads every recording to MinIO/S3 against a Patient
 * record. THIS PAGE DOES NEITHER.
 *
 * It takes one short sustained-vowel recording, posts it to an endpoint that
 * classifies it in memory and stores nothing, and shows the result. There is no
 * patient record, no upload, no persistence — on the client or the server. The
 * `token` in the URL is an opaque booth id printed on the QR poster; it
 * identifies no one and is never looked up in the database.
 *
 * Design constraint: the whole interaction — scan to result — must fit inside
 * one minute, which is why there is a single exercise, no demographics form and
 * no consent flow. See docs/research/live-demo-qr-flow.md.
 * ===========================================================================
 */

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Card, Loader, Progress, Stack, Text, Title } from '@mantine/core';
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck, Timer } from 'lucide-react';
import AudioRecorder from '../components/AudioRecorder';
import { analyzeDemoRecording, type DemoAnalysis } from '../api/client';
import { calculateRMS, getAudioDuration } from '../utils';

// The single exercise the demo asks for. Mirrors the `a_n` entry in
// backend/patients/fixtures/exercises.json — copied rather than fetched from
// /api/exercises/ to save a round trip inside the sub-minute budget.
const DEMO_EXERCISE = {
  title: 'Vokal A (normale Tonlage)',
  description: 'Sagen Sie ca. 3 Sekunden lang ein klares "Aaaaa" in normaler Tonlage.',
  minSeconds: 2,
};

// Same thresholds as the patient wizard (useExerciseSession), so a demo
// recording is held to the same signal quality as a clinical one.
const THRESHOLDS = { MIN_DBFS: -30, MAX_DBFS: -6 };
const TOO_QUIET = 'Die Aufnahme ist zu leise. Bitte sprechen Sie lauter oder näher am Mikrofon.';

type Phase = 'record' | 'analyzing' | 'result';

export default function LiveDemo() {
  const { token: tokenFromUrl } = useParams<{ token?: string }>();

  // A booth token normally arrives in the QR-encoded URL (/demo/{uuid}), the
  // same shape as a patient link. When the page is opened without one we mint a
  // throwaway id so the demo still works; it is never stored either.
  const token = useMemo(
    () => tokenFromUrl ?? crypto.randomUUID(),
    [tokenFromUrl],
  );

  const [phase, setPhase] = useState<Phase>('record');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoAnalysis | null>(null);

  const handleRecordingComplete = async (recorded: Blob) => {
    setRequestError(null);

    if (recorded.size === 0) {
      setBlob(null);
      setQualityError(TOO_QUIET);
      return;
    }

    setBlob(recorded);
    setQualityError(null);

    try {
      const dbfs = await calculateRMS(recorded);
      if (dbfs < THRESHOLDS.MIN_DBFS) {
        setQualityError(TOO_QUIET);
        return;
      }
      if (dbfs > THRESHOLDS.MAX_DBFS) {
        setQualityError('Die Aufnahme ist zu laut und übersteuert. Bitte etwas mehr Abstand zum Mikrofon.');
        return;
      }

      const duration = await getAudioDuration(recorded);
      if (duration < DEMO_EXERCISE.minSeconds) {
        setQualityError(
          `Die Aufnahme ist zu kurz (${duration.toFixed(1)}s). Bitte mindestens ${DEMO_EXERCISE.minSeconds} Sekunden aufnehmen.`,
        );
      }
    } catch {
      setQualityError(TOO_QUIET);
    }
  };

  const handleAnalyze = async () => {
    if (!blob) return;
    setPhase('analyzing');
    setRequestError(null);
    try {
      const analysis = await analyzeDemoRecording(token, blob);
      setResult(analysis);
      setPhase('result');
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Die Analyse ist fehlgeschlagen. Bitte versuchen Sie es erneut.';
      setRequestError(detail);
      setPhase('record');
    } finally {
      // The recording is dropped as soon as it has been sent — the browser tab
      // keeps no copy either.
      setBlob(null);
    }
  };

  const restart = () => {
    setPhase('record');
    setBlob(null);
    setResult(null);
    setQualityError(null);
    setRequestError(null);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col justify-center p-4">
      <Card withBorder radius="md" p="lg">
        <Title order={3} mb={4}>
          RecurrSens — Live-Demo
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Eine kurze Aufnahme, ein Ergebnis. Ihre Stimme wird nicht gespeichert.
        </Text>

        {phase === 'record' && (
          <RecordStep
            qualityError={qualityError}
            requestError={requestError}
            canAnalyze={!!blob && !qualityError}
            onRecordingComplete={handleRecordingComplete}
            onRecordingError={(message) => {
              setBlob(null);
              setQualityError(message);
            }}
            onRecordingReset={() => {
              setBlob(null);
              setQualityError(null);
            }}
            onAnalyze={handleAnalyze}
          />
        )}

        {phase === 'analyzing' && (
          <Stack align="center" gap="md" py="xl">
            <Loader />
            <Text size="sm" c="dimmed">
              Aufnahme wird analysiert…
            </Text>
          </Stack>
        )}

        {phase === 'result' && result && <ResultStep result={result} onRestart={restart} />}

        <PrivacyFooter />
      </Card>
    </div>
  );
}

function RecordStep({
  qualityError,
  requestError,
  canAnalyze,
  onRecordingComplete,
  onRecordingError,
  onRecordingReset,
  onAnalyze,
}: {
  qualityError: string | null;
  requestError: string | null;
  canAnalyze: boolean;
  onRecordingComplete: (blob: Blob) => void;
  onRecordingError: (message: string) => void;
  onRecordingReset: () => void;
  onAnalyze: () => void;
}) {
  return (
    <Stack gap="lg">
      <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30">
        <Text fw={600} size="md" mb="xs">
          {DEMO_EXERCISE.title}
        </Text>
        <Text size="sm">{DEMO_EXERCISE.description}</Text>
        <div className="mt-3 flex items-center gap-2">
          <Timer size={14} />
          <Text size="xs" c="dimmed">
            Mind. {DEMO_EXERCISE.minSeconds} Sek. · Aufnahmetaste gedrückt halten
          </Text>
        </div>
      </div>

      <AudioRecorder
        hasQualityError={!!qualityError}
        onRecordingComplete={onRecordingComplete}
        onRecordingError={onRecordingError}
        onRecordingReset={onRecordingReset}
      />

      {qualityError && (
        <Alert color="red" title="Aufnahmequalität nicht ausreichend">
          {qualityError}
        </Alert>
      )}
      {requestError && <Alert color="red">{requestError}</Alert>}

      <Button size="lg" fullWidth disabled={!canAnalyze} onClick={onAnalyze}>
        Auswerten
      </Button>
    </Stack>
  );
}

function ResultStep({ result, onRestart }: { result: DemoAnalysis; onRestart: () => void }) {
  // Green means favourable/normal; anything else uses amber rather than red.
  // This is a booth demo with no clinical validity, so a result that reads as
  // an alarming diagnosis would be both misleading and unkind.
  const favorable = result.favorable;
  const accent = favorable ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-orange-6)';
  const surface = favorable
    ? 'bg-green-50 dark:bg-green-950/30'
    : 'bg-orange-50 dark:bg-orange-950/30';

  return (
    <Stack gap="lg">
      <div className={`flex flex-col items-center gap-3 rounded-lg p-6 text-center ${surface}`}>
        {favorable ? (
          <CheckCircle2 size={48} color={accent} />
        ) : (
          <AlertTriangle size={48} color={accent} />
        )}

        <Text fw={700} size="xl" style={{ color: accent }}>
          {favorable ? 'Unauffälliger Befund' : 'Auffälliger Befund'}
        </Text>

        {/* The numeric confidence, displayed prominently. */}
        <Text fw={800} style={{ fontSize: '3rem', lineHeight: 1.1, color: accent }}>
          {result.confidence.toFixed(0)}%
        </Text>
        <Text size="sm" c="dimmed">
          Konfidenz des Modells
        </Text>

        <Progress
          value={result.confidence}
          color={favorable ? 'green' : 'orange'}
          size="lg"
          w="100%"
          mt="xs"
        />
      </div>

      {/* Framing borrowed from the reference paper ("Identifying bias in models
          that detect vocal fold paralysis from audio recordings using
          explainable machine learning and clinician ratings"): a model's
          confidence is not the same thing as a clinician's judgement, and
          presenting it as one is exactly the failure mode that work documents. */}
      <Text size="xs" c="dimmed" ta="center">
        Der Konfidenzwert beschreibt, wie sicher sich das Modell bei dieser Aufnahme ist. Er
        ersetzt keine ärztliche Beurteilung und ist nicht mit ihr gleichzusetzen.
      </Text>

      <Alert color="gray" icon={<ShieldCheck size={18} />}>
        Ihre Aufnahme wurde ausschließlich im Arbeitsspeicher verarbeitet und ist bereits
        gelöscht. Es wurde nichts gespeichert.
      </Alert>

      <Button
        size="lg"
        fullWidth
        variant="outline"
        leftSection={<RotateCcw size={16} />}
        onClick={onRestart}
      >
        Nochmal
      </Button>
    </Stack>
  );
}

function PrivacyFooter() {
  return (
    <Text size="xs" c="dimmed" ta="center" mt="lg">
      Demonstration ohne diagnostische Aussagekraft. Es werden keine Aufnahmen und keine
      personenbezogenen Daten gespeichert.
    </Text>
  );
}
