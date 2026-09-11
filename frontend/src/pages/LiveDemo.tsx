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
 * It takes three short sustained-vowel recordings (i_n, a_n, u_n — the same
 * neutral pitch the real model averages over), posts them together to an
 * endpoint that classifies them in memory and stores nothing, and shows the
 * result. There is no patient record, no upload, no persistence — on the
 * client or the server. The `token` in the URL is an opaque booth id printed
 * on the QR poster; it identifies no one and is never looked up in the
 * database.
 *
 * Design constraint: the whole interaction — scan to result — must fit inside
 * roughly one minute, which is why there are only three exercises (not the
 * wizard's full fifteen), no demographics form and no consent flow. See
 * docs/research/live-demo-qr-flow.md.
 * ===========================================================================
 */

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Button,
  Card,
  Chip,
  Group,
  Loader,
  Progress,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck, Timer } from 'lucide-react';
import AudioRecorder from '../components/AudioRecorder';
import { analyzeDemoRecording, type DemoAnalysis, type DemoRecording } from '../api/client';
import { calculateRMS, getAudioDuration } from '../utils';

// Representative ages sent to the FiLM model for each age-band chip — the demo
// only has budget for a coarse band, not an exact age (see the design doc's
// §3.2 call-out: wrong conditioning produces a confidently wrong number, so
// this must be collected, just cheaply).
const AGE_BANDS: { label: string; age: number }[] = [
  { label: '18–35', age: 27 },
  { label: '36–55', age: 46 },
  { label: '56–70', age: 63 },
  { label: '70+', age: 75 },
];

// The three exercises the demo asks for, in the same order as the patient
// wizard. Mirrors the `i_n`/`a_n`/`u_n` entries in
// backend/patients/fixtures/exercises.json — copied rather than fetched from
// /api/exercises/ to save a round trip inside the sub-minute budget. The real
// model averages its verdict over every recording it receives, so asking for
// all three neutral-pitch vowels (instead of just `a_n`) gives it the input
// shape it was designed for.
type DemoExercise = { exerciseId: string; title: string; description: string; minSeconds: number };

const DEMO_EXERCISES: DemoExercise[] = [
  {
    exerciseId: 'i_n',
    title: 'Vokal I (normale Tonlage)',
    description: 'Sagen Sie ca. 2 Sekunden lang ein klares "Iiiii" in normaler Tonlage.',
    minSeconds: 2,
  },
  {
    exerciseId: 'a_n',
    title: 'Vokal A (normale Tonlage)',
    description: 'Sagen Sie ca. 2 Sekunden lang ein klares "Aaaaa" in normaler Tonlage.',
    minSeconds: 2,
  },
  {
    exerciseId: 'u_n',
    title: 'Vokal U (normale Tonlage)',
    description: 'Sagen Sie ca. 2 Sekunden lang ein klares "Uuuuu" in normaler Tonlage.',
    minSeconds: 2,
  },
];

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [blobs, setBlobs] = useState<(Blob | null)[]>(() => DEMO_EXERCISES.map(() => null));
  const [qualityError, setQualityError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoAnalysis | null>(null);
  const [sex, setSex] = useState<'M' | 'F' | null>(null);
  const [ageBand, setAgeBand] = useState<string | null>(null);

  const currentExercise = DEMO_EXERCISES[currentIndex];
  const isLastExercise = currentIndex === DEMO_EXERCISES.length - 1;
  const currentBlob = blobs[currentIndex];

  const handleRecordingComplete = async (recorded: Blob) => {
    setRequestError(null);

    if (recorded.size === 0) {
      setQualityError(TOO_QUIET);
      return;
    }

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
      if (duration < currentExercise.minSeconds) {
        setQualityError(
          `Die Aufnahme ist zu kurz (${duration.toFixed(1)}s). Bitte mindestens ${currentExercise.minSeconds} Sekunden aufnehmen.`,
        );
        return;
      }
    } catch {
      setQualityError(TOO_QUIET);
      return;
    }

    setBlobs((prev) => {
      const next = [...prev];
      next[currentIndex] = recorded;
      return next;
    });
  };

  const handleNext = () => {
    if (isLastExercise) return;
    setCurrentIndex((i) => i + 1);
    setQualityError(null);
  };

  const handleBack = () => {
    if (currentIndex === 0) return;
    setCurrentIndex((i) => i - 1);
    setQualityError(null);
  };

  const handleAnalyze = async () => {
    if (blobs.some((b) => !b) || !sex || !ageBand) return;
    setPhase('analyzing');
    setRequestError(null);
    try {
      const recordings: DemoRecording[] = DEMO_EXERCISES.map((exercise, i) => ({
        exerciseId: exercise.exerciseId,
        blob: blobs[i] as Blob,
      }));
      const age = AGE_BANDS.find((band) => band.label === ageBand)?.age;
      const analysis = await analyzeDemoRecording(
        token,
        recordings,
        age !== undefined ? { gender: sex, age } : undefined,
      );
      setResult(analysis);
      setPhase('result');
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Die Analyse ist fehlgeschlagen. Bitte versuchen Sie es erneut.';
      setRequestError(detail);
      setPhase('record');
    } finally {
      // The recordings are dropped as soon as they have been sent — the
      // browser tab keeps no copy either.
      setBlobs(DEMO_EXERCISES.map(() => null));
      setCurrentIndex(0);
    }
  };

  const restart = () => {
    setPhase('record');
    setCurrentIndex(0);
    setBlobs(DEMO_EXERCISES.map(() => null));
    setResult(null);
    setQualityError(null);
    setRequestError(null);
    setSex(null);
    setAgeBand(null);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col justify-center p-4">
      <Card withBorder radius="md" p="lg">
        <Title order={3} mb={4}>
          RecurrSens — Live-Demo
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Drei kurze Aufnahmen, ein Ergebnis. Ihre Stimme wird nicht gespeichert.
        </Text>

        {phase === 'record' && (
          <RecordStep
            exercise={currentExercise}
            stepNumber={currentIndex + 1}
            stepCount={DEMO_EXERCISES.length}
            isLastExercise={isLastExercise}
            hasBlob={!!currentBlob}
            canGoBack={currentIndex > 0}
            qualityError={qualityError}
            requestError={requestError}
            sex={sex}
            ageBand={ageBand}
            onSexChange={setSex}
            onAgeBandChange={setAgeBand}
            onRecordingComplete={handleRecordingComplete}
            onRecordingError={(message) => setQualityError(message)}
            onRecordingReset={() => {
              setBlobs((prev) => {
                const next = [...prev];
                next[currentIndex] = null;
                return next;
              });
              setQualityError(null);
            }}
            onBack={handleBack}
            onNext={handleNext}
            onAnalyze={handleAnalyze}
          />
        )}

        {phase === 'analyzing' && (
          <Stack align="center" gap="md" py="xl">
            <Loader />
            <Text size="sm" c="dimmed">
              Aufnahmen werden analysiert…
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
  exercise,
  stepNumber,
  stepCount,
  isLastExercise,
  hasBlob,
  canGoBack,
  qualityError,
  requestError,
  sex,
  ageBand,
  onSexChange,
  onAgeBandChange,
  onRecordingComplete,
  onRecordingError,
  onRecordingReset,
  onBack,
  onNext,
  onAnalyze,
}: {
  exercise: DemoExercise;
  stepNumber: number;
  stepCount: number;
  isLastExercise: boolean;
  hasBlob: boolean;
  canGoBack: boolean;
  qualityError: string | null;
  requestError: string | null;
  sex: 'M' | 'F' | null;
  ageBand: string | null;
  onSexChange: (sex: 'M' | 'F') => void;
  onAgeBandChange: (band: string) => void;
  onRecordingComplete: (blob: Blob) => void;
  onRecordingError: (message: string) => void;
  onRecordingReset: () => void;
  onBack: () => void;
  onNext: () => void;
  onAnalyze: () => void;
}) {
  const isFirstStep = stepNumber === 1;
  const demographicsComplete = !!sex && !!ageBand;
  const canAdvance = hasBlob && !qualityError && (!isFirstStep || demographicsComplete);

  return (
    <Stack gap="lg">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Text size="xs" c="dimmed" fw={600}>
            Aufnahme {stepNumber} von {stepCount}
          </Text>
          {canGoBack && (
            <Anchor size="xs" component="button" type="button" onClick={onBack}>
              Zurück
            </Anchor>
          )}
        </div>
        <Progress value={(stepNumber / stepCount) * 100} size="xs" mb="md" />
      </div>

      {isFirstStep && (
        <Stack gap="xs">
          <Text size="xs" c="dimmed" fw={600}>
            Für eine genauere Analyse: Geschlecht und Altersgruppe
          </Text>
          <Group gap="xs">
            <Chip checked={sex === 'M'} onChange={() => onSexChange('M')} size="sm">
              Männlich
            </Chip>
            <Chip checked={sex === 'F'} onChange={() => onSexChange('F')} size="sm">
              Weiblich
            </Chip>
          </Group>
          <Group gap="xs">
            {AGE_BANDS.map((band) => (
              <Chip
                key={band.label}
                checked={ageBand === band.label}
                onChange={() => onAgeBandChange(band.label)}
                size="sm"
              >
                {band.label}
              </Chip>
            ))}
          </Group>
        </Stack>
      )}

      <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30">
        <Text fw={600} size="md" mb="xs">
          {exercise.title}
        </Text>
        <Text size="sm">{exercise.description}</Text>
        <div className="mt-3 flex items-center gap-2">
          <Timer size={14} />
          <Text size="xs" c="dimmed">
            Mind. {exercise.minSeconds} Sek. · Aufnahmetaste gedrückt halten
          </Text>
        </div>
      </div>

      <AudioRecorder
        key={exercise.exerciseId}
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

      <Button
        size="lg"
        fullWidth
        disabled={!canAdvance}
        onClick={isLastExercise ? onAnalyze : onNext}
      >
        {isLastExercise ? 'Auswerten' : 'Weiter'}
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

        <Text size="xs" c="dimmed" mt={4}>
          Gemittelt über {result.recordings} Aufnahmen (I, A, U)
        </Text>
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
        Ihre Aufnahmen wurden ausschließlich im Arbeitsspeicher verarbeitet und sind bereits
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
