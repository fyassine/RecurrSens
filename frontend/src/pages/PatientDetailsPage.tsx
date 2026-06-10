import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  ArrowLeft,
  Check,
  Download,
  Pencil,
  User,
  AudioLines,
  Upload,
  ArrowLeftRight,
  X,
} from 'lucide-react';
import { DateInput } from '@mantine/dates';
import type { PatientDetail, PatientStatus, RecordingSession } from '../types';
import {
  getPatient,
  updatePatient,
  advancePatient,
  uploadAudio,
  getExercises,
  advancePublicPatient,
  exportPatients,
  reassignAudioFile,
  createSession,
  AUDIO_ACCEPT_ATTR,
  isAllowedAudioFile,
} from '../api/client';
import { StatusBadge, FollowUpBadge } from '../components/Badges';
import ConfirmDialog from '../components/ConfirmDialog';
import { AudioPlayer } from '../components/AudioPlayer';
import { formatDate, formatDateTime, NO_RECORDING_DATE } from '../utils';
import type { Exercise, AudioFile as AudioFileType } from '../types';
import PatientHistorySidebar from '../components/PatientHistorySidebar';

export default function PatientDetailsPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPatient = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getPatient(token);
      setPatient(data);
    } catch {
      setError('Patient nicht gefunden.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="p-4">
        <Alert color="red">{error || 'Unbekannter Fehler'}</Alert>
      </div>
    );
  }

  const noRecordings = patient.audio_files_pre.length === 0 && patient.audio_files_post.length === 0;

  return (
    <div className="min-h-screen pb-4">
      <Button
        variant="subtle"
        leftSection={<ArrowLeft size={16} />}
        onClick={() => navigate('/')}
        mb={noRecordings ? 'sm' : 'md'}
      >
        Zurück zur Übersicht
      </Button>

      <div
        className="mx-auto flex flex-col md:flex-row gap-6 items-start"
        style={{ maxWidth: noRecordings ? 1440 : 1320 }}
      >
        <div className="flex-1 w-full min-w-0">
          <PatientInfoCard patient={patient} onUpdated={fetchPatient} compact={noRecordings} />
          {noRecordings ? (
            <div className="grid gap-4 md:grid-cols-2">
              <AudioSection
                title="Prä-OP Aufnahmen"
                audioFiles={patient.audio_files_pre}
                sessions={patient.sessions}
                phase="PRE_OP"
                date={patient.pre_op_date}
                patientId={patient.id}
                patientStatus={patient.status}
                showUpload
                onUploaded={fetchPatient}
                compact
              />
              <AudioSection
                title="Post-OP Aufnahmen"
                audioFiles={patient.audio_files_post}
                sessions={patient.sessions}
                phase="POST_OP"
                date={patient.post_op_date}
                patientId={patient.id}
                patientStatus={patient.status}
                showUpload
                onUploaded={fetchPatient}
                compact
              />
            </div>
          ) : (
            <>
              <AudioSection
                title="Prä-OP Aufnahmen"
                audioFiles={patient.audio_files_pre}
                sessions={patient.sessions}
                phase="PRE_OP"
                date={patient.pre_op_date}
                patientId={patient.id}
                patientStatus={patient.status}
                showUpload
                onUploaded={fetchPatient}
              />
              <AudioSection
                title="Post-OP Aufnahmen"
                audioFiles={patient.audio_files_post}
                sessions={patient.sessions}
                phase="POST_OP"
                date={patient.post_op_date}
                patientId={patient.id}
                patientStatus={patient.status}
                showUpload
                onUploaded={fetchPatient}
              />
            </>
          )}
        </div>
        <PatientHistorySidebar patientId={patient.id} refreshTrigger={patient.updated_at} />
      </div>
    </div>
  );
}

function PatientInfoCard({
  patient,
  onUpdated,
  compact = false,
}: {
  patient: PatientDetail;
  onUpdated: () => void;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pid, setPid] = useState(patient.patient_id);
  const [createdAt, setCreatedAt] = useState(patient.created_at.slice(0, 10));
  const [status, setStatus] = useState<PatientStatus>(patient.status);

  useEffect(() => {
    setPid(patient.patient_id);
    setCreatedAt(patient.created_at.slice(0, 10));
    setStatus(patient.status);
  }, [patient]);

  const derivedExpiresAt = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await exportPatients([patient.id]);
    } finally {
      setDownloading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePatient(patient.id, {
        patient_id: pid,
        status: status,
        created_at: createdAt,
        expires_at: derivedExpiresAt(createdAt),
      });
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card withBorder radius="md" mb={compact ? 'sm' : 'md'} p="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <User size={20} color="var(--mantine-color-brand-7)" />
          <Title order={5}>Patienten Details</Title>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setEditing(!editing)}>
            <Pencil size={14} />
          </ActionIcon>
        </Group>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<Download size={14} />}
          onClick={handleDownload}
          loading={downloading}
        >
          Herunterladen
        </Button>
      </Group>

      {patient.deleted_at && (
        <Alert color="red" mb="sm">
          Gelöscht am {formatDateTime(patient.deleted_at)}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <InfoField label="Patienten-ID">
          {editing ? (
            <TextInput
              value={pid}
              onChange={(e) => setPid(e.currentTarget.value)}
              size="xs"
              styles={{ input: { fontFamily: 'ui-monospace, Consolas, monospace', fontWeight: 600 } }}
            />
          ) : (
            <div className="text-[0.9375rem] font-semibold" style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>
              {patient.patient_id}
            </div>
          )}
        </InfoField>
        <InfoField label="Status">
          {editing ? (
            <Select
              value={status}
              onChange={(val) => setStatus(val as PatientStatus)}
              data={[
                { value: 'NEW', label: 'Neu (Prä-OP unvollständig)' },
                { value: 'CONSENT_GIVEN', label: 'Einwilligung erteilt (Prä-OP unvollständig)' },
                { value: 'PRE_OP_DONE', label: 'Prä-OP abgeschlossen (Prä-OP vollständig)' },
                { value: 'POST_OP_STARTED', label: 'Post-OP begonnen (Post-OP unvollständig)' },
                { value: 'POST_OP_DONE', label: 'Post-OP abgeschlossen (Post-OP vollständig)' },
              ]}
              size="xs"
              allowDeselect={false}
            />
          ) : patient.current_post_op_session_number != null && patient.current_post_op_session_number >= 2 ? (
            <FollowUpBadge
              sessionNumber={patient.current_post_op_session_number - 1}
              complete={patient.status === 'POST_OP_DONE'}
            />
          ) : (
            <StatusBadge status={patient.status as PatientStatus} />
          )}
        </InfoField>
        <InfoField label="Erstellt am">
          {editing ? (
            <DateInput
              value={createdAt ? new Date(createdAt) : null}
              onChange={(val) => setCreatedAt(val ? val.toISOString().slice(0, 10) : createdAt)}
              valueFormat="DD.MM.YYYY"
              size="xs"
              clearable={false}
            />
          ) : (
            <div className="text-[0.9375rem] font-semibold">{formatDate(patient.created_at)}</div>
          )}
        </InfoField>
        <InfoField
          label="Ablaufdatum"
          value={editing ? formatDate(derivedExpiresAt(createdAt)) : formatDate(patient.expires_at)}
        />
      </div>
      {editing && (
        <Group justify="flex-end" gap="sm" mt="sm">
          <Button size="xs" variant="default" onClick={() => { setEditing(false); setPid(patient.patient_id); setCreatedAt(patient.created_at.slice(0, 10)); setStatus(patient.status); }}>Abbrechen</Button>
          <Button size="xs" onClick={handleSave} loading={saving}>Speichern</Button>
        </Group>
      )}

    </Card>
  );
}

function AudioSection({
  title,
  audioFiles,
  sessions,
  phase,
  date,
  patientId,
  patientStatus,
  showUpload,
  onUploaded,
  compact = false,
}: {
  title: string;
  audioFiles: AudioFileType[];
  sessions: RecordingSession[];
  phase: 'PRE_OP' | 'POST_OP';
  date: string | null;
  patientId: string;
  patientStatus: string;
  showUpload: boolean;
  onUploaded: () => void;
  compact?: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState(toDatetimeLocal(date));
  const [savingDate, setSavingDate] = useState(false);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDone = () => {
    setSelectedIds(new Set());
    setBulkOpen(false);
    onUploaded();
  };

  const handleSaveDate = async () => {
    setSavingDate(true);
    try {
      const field = phase === 'PRE_OP' ? 'pre_op_date' : 'post_op_date';
      const iso = dateValue ? new Date(dateValue).toISOString() : new Date().toISOString();
      await updatePatient(patientId, { [field]: iso });
      setEditingDate(false);
      onUploaded();
    } finally {
      setSavingDate(false);
    }
  };

  return (
    <Card withBorder radius="md" mb={compact ? 0 : 'md'} p="md" h={compact ? '100%' : undefined}>
      <Stack gap={4} align="center" mb="md">
        <Group gap="xs">
          <AudioLines size={20} color="var(--mantine-color-brand-7)" />
          <Title order={6}>{title}</Title>
        </Group>
        {editingDate ? (
          <Group gap="xs">
            <TextInput
              type="datetime-local"
              value={dateValue}
              onChange={(e) => setDateValue(e.currentTarget.value)}
              size="xs"
              style={{ width: 200 }}
            />
            <ActionIcon size="xs" variant="subtle" color="green" loading={savingDate} onClick={handleSaveDate}>
              <Check size={12} />
            </ActionIcon>
            <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setEditingDate(false)}>
              <X size={12} />
            </ActionIcon>
          </Group>
        ) : (
          <Group gap={4}>
            <Text size="xs" c="dimmed">{date ? formatDateTime(date) : NO_RECORDING_DATE}</Text>
            {showUpload && (
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => { setDateValue(toDatetimeLocal(date) || toDatetimeLocal(new Date().toISOString())); setEditingDate(true); }}
              >
                <Pencil size={11} />
              </ActionIcon>
            )}
          </Group>
        )}
      </Stack>

      {showUpload && audioFiles.length > 0 && (
        <Group justify="space-between" mb="xs">
          <Group gap={0}>
            <Checkbox
              size="xs"
              checked={selectedIds.size === audioFiles.length}
              indeterminate={selectedIds.size > 0 && selectedIds.size < audioFiles.length}
              onChange={() => {
                if (selectedIds.size === audioFiles.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(audioFiles.map((f) => f.id)));
              }}
            />
            <Button
              size="xs"
              variant="subtle"
              onClick={() => {
                if (selectedIds.size === audioFiles.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(audioFiles.map((f) => f.id)));
              }}
            >
              {selectedIds.size === audioFiles.length ? 'Auswahl aufheben' : 'Alle auswählen'}
            </Button>
            {selectedIds.size > 0 && (
              <Button
                size="xs"
                variant="outline"
                leftSection={<ArrowLeftRight size={14} />}
                onClick={() => setBulkOpen(true)}
              >
                Zuordnung ändern ({selectedIds.size})
              </Button>
            )}
          </Group>
          <ManualUpload
            patientId={patientId}
            phase={phase}
            patientStatus={patientStatus}
            onDone={onUploaded}
            buttonLabel="Hochladen"
            existingFiles={audioFiles}
          />
        </Group>
      )}

      {audioFiles.length === 0 ? (
        <div
          className="rounded-md border border-dashed border-[var(--mantine-color-default-border)] bg-[var(--mantine-color-default-hover)] text-center"
          style={{ padding: compact ? '20px' : '32px', color: 'var(--mantine-color-dimmed)' }}
        >
          <Text size="sm" c="dimmed">
            Keine {phase === 'PRE_OP' ? 'Prä-OP' : 'Post-OP'} Aufnahmen vorhanden.
          </Text>
          {showUpload && (
            <div className="mt-2">
              <ManualUpload
                patientId={patientId}
                phase={phase}
                patientStatus={patientStatus}
                onDone={onUploaded}
                buttonLabel="Dateien hochladen"
                existingFiles={audioFiles}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {audioFiles.map((f, i) => (
            <div
              key={f.id}
              className="rounded-md border p-3 transition-colors"
              style={{
                borderColor: selectedIds.has(f.id)
                  ? 'var(--mantine-color-brand-6)'
                  : 'var(--mantine-color-default-border)',
              }}
            >
              <Group gap={4} mb="xs">
                <Checkbox size="xs" checked={selectedIds.has(f.id)} onChange={() => toggleSelect(f.id)} />
                <Text size="sm" fw={500}>
                  Aufnahme {i + 1}
                  {f.exercise_id && <Badge ml="xs" size="sm" variant="light">{f.exercise_id}</Badge>}
                </Text>
              </Group>
              <AudioPlayer fileId={f.id} />
            </div>
          ))}
        </div>
      )}

      <BulkReassignDialog
        open={bulkOpen}
        fileIds={Array.from(selectedIds)}
        sessions={sessions}
        patientId={patientId}
        defaultPhase={phase}
        onClose={() => setBulkOpen(false)}
        onDone={handleDone}
      />
    </Card>
  );
}

function sessionLabel(s: RecordingSession): string {
  if (s.phase === 'PRE_OP') return `Prä-OP (Sitzung ${s.session_number})`;
  if (s.session_number === 1) return 'Post-OP';
  return `Follow-up ${s.session_number - 1} (Post-OP Sitzung ${s.session_number})`;
}

function BulkReassignDialog({
  open,
  fileIds,
  sessions,
  patientId,
  defaultPhase,
  onClose,
  onDone,
}: {
  open: boolean;
  fileIds: string[];
  sessions: RecordingSession[];
  patientId: string;
  defaultPhase: 'PRE_OP' | 'POST_OP';
  onClose: () => void;
  onDone: () => void;
}) {
  const [selectedPhase, setSelectedPhase] = useState<'PRE_OP' | 'POST_OP'>(
    defaultPhase === 'PRE_OP' ? 'POST_OP' : 'PRE_OP',
  );
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedPhase(defaultPhase === 'PRE_OP' ? 'POST_OP' : 'PRE_OP');
      setSelectedSession('');
      setError('');
    }
  }, [open, defaultPhase]);

  const filteredSessions = sessions.filter((s) => s.phase === selectedPhase);

  const nextPostOpSessionNumber = useMemo(() => {
    const nums = sessions.filter((s) => s.phase === 'POST_OP').map((s) => s.session_number);
    return (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  }, [sessions]);

  const nextFollowUpNumber = nextPostOpSessionNumber - 1;
  const isNewFollowup = selectedSession === 'NEW_FOLLOWUP';
  const showSessionDropdown =
    selectedPhase === 'POST_OP' && nextPostOpSessionNumber >= 2;

  const sessionOptions = [
    { value: '', label: 'Keine Sitzung' },
    ...filteredSessions.map((s) => ({ value: s.id, label: sessionLabel(s) })),
    ...(selectedPhase === 'POST_OP' && nextPostOpSessionNumber >= 2
      ? [{ value: 'NEW_FOLLOWUP', label: '+ Neue Follow-up Sitzung anlegen' }]
      : []),
  ];

  const handleSave = async () => {
    setSaving(true);
    setError('');
    let done = 0;
    try {
      let targetSessionId: string | null = null;
      if (isNewFollowup) {
        const s = await createSession(patientId, 'POST_OP');
        targetSessionId = s.id;
      } else if (!showSessionDropdown) {
        targetSessionId = filteredSessions[0]?.id ?? null;
      } else {
        targetSessionId = selectedSession || null;
      }
      // Reassign sequentially, stopping at the first failure. There is no
      // backend batch endpoint, so a mid-loop failure leaves earlier files
      // already reassigned — tell the admin to re-check rather than silently
      // reporting a generic error.
      for (const fileId of fileIds) {
        await reassignAudioFile(fileId, selectedPhase, targetSessionId);
        done += 1;
      }
      onDone();
    } catch {
      setError(
        done > 0
          ? `Zuordnung teilweise fehlgeschlagen (${done} von ${fileIds.length} übernommen). Bitte prüfen Sie die Zuordnung.`
          : 'Zuordnung konnte nicht gespeichert werden.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={`Zuordnung ändern (${fileIds.length} ${fileIds.length === 1 ? 'Aufnahme' : 'Aufnahmen'})`}
      size="sm"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Wählen Sie die neue Phase und Sitzung für {fileIds.length === 1 ? 'diese Aufnahme' : 'alle ausgewählten Aufnahmen'}.
        </Text>
        <Select
          label="Phase"
          value={selectedPhase}
          onChange={(v) => {
            setSelectedPhase((v as 'PRE_OP' | 'POST_OP') || 'PRE_OP');
            setSelectedSession('');
          }}
          data={[
            { value: 'PRE_OP', label: 'Prä-OP' },
            { value: 'POST_OP', label: 'Post-OP' },
          ]}
          allowDeselect={false}
        />
        {showSessionDropdown && (
          <>
            <Select
              label="Sitzung"
              value={selectedSession}
              onChange={(v) => setSelectedSession(v ?? '')}
              data={sessionOptions}
            />
            {isNewFollowup && (
              <Alert color="cyan">
                Es wird automatisch <strong>Post-OP Sitzung {nextPostOpSessionNumber}</strong>
                {nextFollowUpNumber >= 1 ? ` (Follow-up ${nextFollowUpNumber})` : ''} angelegt.
              </Alert>
            )}
          </>
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button onClick={handleSave} loading={saving}>Speichern</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

const EXERCISE_GROUPS = [
  { label: 'Vokal I', prefix: 'i_' },
  { label: 'Vokal A', prefix: 'a_' },
  { label: 'Vokal U', prefix: 'u_' },
  { label: 'Sonstiges', ids: ['iau', 'phrase', 'happy_birthday'] as string[] },
] as const;

function shortExerciseLabel(title: string): string {
  return title.replace(/^Vokal [IiAaUu]\s*/i, '').replace(/^Vokalfolge\s*/i, '');
}

function ManualUpload({
  patientId,
  phase,
  patientStatus,
  onDone,
  buttonLabel = 'Hochladen',
  existingFiles = [],
}: {
  patientId: string;
  phase: 'PRE_OP' | 'POST_OP';
  patientStatus: string;
  onDone: () => void;
  buttonLabel?: string;
  existingFiles?: AudioFileType[];
}) {
  const [open, setOpen] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<Exercise[]>([]);
  const confirmedRef = useRef(false);

  const handleOpen = async () => {
    setOpen(true);
    const ex = await getExercises();
    setExercises(ex);
  };

  const handleUpload = async () => {
    const selected = Object.values(files);
    if (selected.length === 0) {
      setError('Bitte mindestens eine Datei auswählen.');
      return;
    }
    const invalid = selected.find((f) => !isAllowedAudioFile(f.name));
    if (invalid) {
      setError(`Nicht unterstütztes Audioformat: ${invalid.name}`);
      return;
    }

    if (!confirmedRef.current) {
      const conflicts = exercises.filter(
        (ex) => files[ex.exercise_id] && existingFiles.some((f) => f.exercise_id === ex.exercise_id),
      );
      if (conflicts.length > 0) {
        setPendingConflicts(conflicts);
        setConfirmOpen(true);
        return;
      }
    }
    confirmedRef.current = false;

    setError('');
    setUploading(true);
    try {
      if (phase === 'POST_OP' && patientStatus === 'PRE_OP_DONE') {
        await advancePatient(patientId);
      }
      for (const exercise of exercises) {
        const file = files[exercise.exercise_id];
        if (!file) continue;
        await uploadAudio(patientId, file, exercise.exercise_id);
      }
      const shouldAdvance =
        (phase === 'PRE_OP' && patientStatus === 'CONSENT_GIVEN') ||
        (phase === 'POST_OP' && patientStatus === 'POST_OP_STARTED');
      if (shouldAdvance) {
        await advancePublicPatient(patientId);
      }
      setOpen(false);
      onDone();
    } catch {
      setError('Hochladen fehlgeschlagen.');
      confirmedRef.current = false;
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Button size="xs" variant="subtle" leftSection={<Upload size={14} />} onClick={handleOpen}>
        {buttonLabel}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="Aufnahmen ersetzen?"
        message={
          <>
            <Text size="xs" c="dimmed" mb={4}>
              Für folgende Übungen existiert bereits eine Aufnahme:
            </Text>
            {pendingConflicts.map((e) => e.title).join(', ')}. Möchten Sie diese ersetzen?
          </>
        }
        confirmLabel="Ersetzen"
        confirmColor="yellow"
        onConfirm={() => {
          confirmedRef.current = true;
          setConfirmOpen(false);
          handleUpload();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={`Hochladen (${phase === 'PRE_OP' ? 'Prä-OP' : 'Post-OP'})`}
        size="xl"
        centered
      >
        <Text size="sm" c="dimmed" mb="md">
          Bitte wählen Sie für jede der folgenden Übungen die entsprechende Audiodatei aus.
        </Text>
        <div className="grid grid-cols-4 gap-3">
          {EXERCISE_GROUPS.map((group) => {
            const groupExercises = exercises.filter((ex) =>
              'prefix' in group
                ? ex.exercise_id.startsWith(group.prefix)
                : group.ids.includes(ex.exercise_id),
            );
            if (groupExercises.length === 0) return null;
            return (
              <div
                key={group.label}
                className="rounded-lg border border-[var(--mantine-color-default-border)] p-3"
              >
                <Text fw={600} size="xs" c="dimmed" mb="xs" tt="uppercase">{group.label}</Text>
                <Stack gap="xs">
                  {groupExercises.map((ex) => (
                    <div key={ex.exercise_id}>
                      <Text size="xs" fw={500} mb={4}>{shortExerciseLabel(ex.title)}</Text>
                      <Button
                        component="label"
                        size="xs"
                        variant={files[ex.exercise_id] ? 'filled' : 'outline'}
                        color={files[ex.exercise_id] ? 'green' : 'brand'}
                        leftSection={<Upload size={10} />}
                        fullWidth
                      >
                        <Text size="xs" lineClamp={1}>
                          {files[ex.exercise_id] ? files[ex.exercise_id].name : 'Auswählen'}
                        </Text>
                        <input
                          type="file"
                          accept={AUDIO_ACCEPT_ATTR}
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) setFiles((prev) => ({ ...prev, [ex.exercise_id]: f }));
                          }}
                        />
                      </Button>
                    </div>
                  ))}
                </Stack>
              </div>
            );
          })}
        </div>
        {error && <Alert color="red" mt="md">{error}</Alert>}
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setOpen(false)} disabled={uploading}>
            Abbrechen
          </Button>
          <Button onClick={handleUpload} loading={uploading} px="xl">
            Alle Dateien hochladen
          </Button>
        </Group>
      </Modal>
    </>
  );
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

function InfoField({
  label,
  value,
  mono = false,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--mantine-color-default-border)] bg-[var(--mantine-color-default-hover)] px-3 py-2.5">
      <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--mantine-color-dimmed)]">
        {label}
      </div>
      <div className="mt-1">
        {children ?? (
          <div
            className="text-[0.9375rem] font-semibold"
            style={{ fontFamily: mono ? 'ui-monospace, Consolas, monospace' : undefined }}
          >
            {value || '-'}
          </div>
        )}
      </div>
    </div>
  );
}
