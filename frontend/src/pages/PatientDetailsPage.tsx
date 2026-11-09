import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  ArrowLeft,
  Check,
  Download,
  Pencil,
  Upload,
  ArrowLeftRight,
  X,
} from 'lucide-react';
import { DateInput } from '@mantine/dates';
import type { PatientDetail, PatientStatus, RecordingSession } from '../types';
import {
  getPatient,
  updatePatient,
  updateSessionVisitDate,
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
import { StatusBadge, PostOpSessionBadge } from '../components/Badges';
import ConfirmDialog from '../components/ConfirmDialog';
import { AudioPlayer } from '../components/AudioPlayer';
import AudioDeviceInfoBadge from '../components/AudioDeviceInfoBadge';
import { getRecordingDeviceInfo } from '../utils/deviceInfo';
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

  const postOpSections = useMemo(() => (patient ? buildPostOpSections(patient) : []), [patient]);

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

  const preOpSession = patient.sessions.find((s) => s.phase === 'PRE_OP' && s.session_number === 1);

  return (
    <div className="mx-auto max-w-[1600px]">
      <PatientHeader patient={patient} onUpdated={fetchPatient} onBack={() => navigate('/')} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_520px]">
        <RecordingTabs
          tabs={[
            {
              key: 'pre',
              label: 'Prä-OP',
              count: patient.audio_files_pre.length,
              content: (
                <AudioSection
                  title="Prä-OP Aufnahmen"
                  audioFiles={patient.audio_files_pre}
                  sessions={patient.sessions}
                  phase="PRE_OP"
                  date={patient.pre_op_date}
                  sessionId={preOpSession?.id}
                  isActiveSession
                  patientId={patient.id}
                  patientStatus={patient.status}
                  onUploaded={fetchPatient}
                  onSaveDate={(iso) => updatePatient(patient.id, { pre_op_date: iso })}
                />
              ),
            },
            ...postOpSections.map((sec) => ({
              key: sec.key,
              label: sec.title.replace(/ Aufnahmen$/, ''),
              count: sec.audioFiles.length,
              content: (
                <AudioSection
                  title={sec.title}
                  audioFiles={sec.audioFiles}
                  sessions={patient.sessions}
                  phase="POST_OP"
                  date={sec.date}
                  sessionId={sec.sessionId}
                  isActiveSession={sec.isActiveSession}
                  patientId={patient.id}
                  patientStatus={patient.status}
                  onUploaded={fetchPatient}
                  onSaveDate={sec.onSaveDate}
                />
              ),
            })),
          ]}
        />
        <PatientHistorySidebar patientId={patient.id} refreshTrigger={patient.last_activity} />
      </div>
    </div>
  );
}

function PatientHeader({
  patient,
  onUpdated,
  onBack,
}: {
  patient: PatientDetail;
  onUpdated: () => void;
  onBack: () => void;
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

  const resetEdit = () => {
    setEditing(false);
    setPid(patient.patient_id);
    setCreatedAt(patient.created_at.slice(0, 10));
    setStatus(patient.status);
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
    <div className="section mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-2">
        <div className="min-w-0">
          <Button
            variant="subtle"
            size="compact-xs"
            leftSection={<ArrowLeft size={14} />}
            onClick={onBack}
            ml={-8}
          >
            Zurück zur Übersicht
          </Button>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            {editing ? (
              <TextInput
                value={pid}
                onChange={(e) => setPid(e.currentTarget.value)}
                size="sm"
                aria-label="Patienten-ID"
                classNames={{ input: 'id-text' }}
                styles={{ input: { fontWeight: 600 } }}
              />
            ) : (
              <h1 className="id-text m-0 text-[22px] font-semibold leading-tight">{patient.patient_id}</h1>
            )}
            {editing ? (
              <Select
                value={status}
                onChange={(val) => setStatus(val as PatientStatus)}
                aria-label="Status"
                data={[
                  { value: 'NEW', label: 'Neu (Prä-OP unvollständig)' },
                  { value: 'CONSENT_GIVEN', label: 'Einwilligung erteilt (Prä-OP unvollständig)' },
                  { value: 'PRE_OP_DONE', label: 'Prä-OP abgeschlossen (Prä-OP vollständig)' },
                  { value: 'POST_OP_STARTED', label: 'Post-OP begonnen (Post-OP unvollständig)' },
                  { value: 'POST_OP_DONE', label: 'Post-OP abgeschlossen (Post-OP vollständig)' },
                ]}
                size="sm"
                w={320}
                allowDeselect={false}
              />
            ) : (patient.status === 'POST_OP_STARTED' || patient.status === 'POST_OP_DONE') &&
              patient.current_post_op_session_number != null ? (
              <PostOpSessionBadge
                sessionNumber={patient.current_post_op_session_number}
                complete={patient.status === 'POST_OP_DONE'}
              />
            ) : (
              <StatusBadge status={patient.status as PatientStatus} />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          {editing ? (
            <>
              <Button size="xs" variant="default" onClick={resetEdit}>Abbrechen</Button>
              <Button size="xs" onClick={handleSave} loading={saving}>Speichern</Button>
            </>
          ) : (
            <Button size="xs" variant="default" leftSection={<Pencil size={14} />} onClick={() => setEditing(true)}>
              Bearbeiten
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            leftSection={<Download size={14} />}
            onClick={handleDownload}
            loading={downloading}
          >
            Herunterladen
          </Button>
        </div>
      </div>

      {patient.deleted_at && (
        <div className="border-t border-[var(--app-danger)] bg-[var(--app-header-bg)] px-4 py-1.5 text-[13px] font-medium text-[var(--app-danger)]">
          Gelöscht am {formatDateTime(patient.deleted_at)}
        </div>
      )}

      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-[var(--app-border)] bg-[var(--app-header-bg)] px-4 py-2 md:grid-cols-4">
        <HeaderField label="Erstellt am">
          {editing ? (
            <DateInput
              value={createdAt ? new Date(createdAt) : null}
              onChange={(val) => setCreatedAt(val ? val.toISOString().slice(0, 10) : createdAt)}
              valueFormat="DD.MM.YYYY"
              size="xs"
              clearable={false}
              aria-label="Erstellt am"
            />
          ) : (
            formatDate(patient.created_at)
          )}
        </HeaderField>
        <HeaderField label="Ablaufdatum">
          {editing ? formatDate(derivedExpiresAt(createdAt)) : formatDate(patient.expires_at)}
        </HeaderField>
        <HeaderField label="Gelöscht am">{patient.deleted_at ? formatDateTime(patient.deleted_at) : '–'}</HeaderField>
        <HeaderField label="Letzte Aktivität">{formatDateTime(patient.last_activity)}</HeaderField>
      </dl>
    </div>
  );
}

function HeaderField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--app-text-secondary)]">{label}</dt>
      <dd className="m-0 mt-0.5 text-[13px] font-medium tabular-nums">{children}</dd>
    </div>
  );
}

interface RecordingTab {
  key: string;
  label: string;
  count: number;
  content: React.ReactNode;
}

/** One panel with a tab per recording phase (Prä-OP, Post-OP 1, 2, …). */
function RecordingTabs({ tabs }: { tabs: RecordingTab[] }) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  if (!active) return null;

  return (
    <div className="section min-w-0">
      <div role="tablist" aria-label="Aufnahmephase" className="flex gap-0.5 overflow-x-auto border-b border-[var(--app-border)] bg-[var(--app-header-bg)] px-2">
        {tabs.map((t) => {
          const isActive = t.key === active.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`rec-tab-${t.key}`}
              aria-selected={isActive}
              aria-controls={`rec-panel-${t.key}`}
              onClick={() => setActiveKey(t.key)}
              className="cursor-pointer whitespace-nowrap border-0 border-b-2 border-solid bg-transparent px-3 pb-[7px] pt-[9px]"
              style={{
                borderBottomColor: isActive ? 'var(--app-primary)' : 'transparent',
                color: isActive ? 'var(--app-primary)' : 'var(--app-text-secondary)',
                fontWeight: isActive ? 600 : 400,
                font: 'inherit',
                fontSize: 13,
              }}
            >
              {t.label}
              <span className="ml-1.5 text-[11px] font-normal text-[var(--app-text-secondary)]">{t.count}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`rec-panel-${active.key}`} aria-labelledby={`rec-tab-${active.key}`} key={active.key}>
        {active.content}
      </div>
    </div>
  );
}

function AudioSection({
  title,
  audioFiles,
  sessions,
  phase,
  date,
  sessionId,
  isActiveSession,
  patientId,
  patientStatus,
  onUploaded,
  onSaveDate,
}: {
  title: string;
  audioFiles: AudioFileType[];
  sessions: RecordingSession[];
  phase: 'PRE_OP' | 'POST_OP';
  date: string | null;
  sessionId?: string;
  isActiveSession: boolean;
  patientId: string;
  patientStatus: string;
  onUploaded: () => void;
  onSaveDate: (isoDate: string) => Promise<unknown>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState(toDatetimeLocal(date));
  const [savingDate, setSavingDate] = useState(false);

  const allSelected = audioFiles.length > 0 && selectedIds.size === audioFiles.length;
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(audioFiles.map((f) => f.id)));

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
      const iso = dateValue ? new Date(dateValue).toISOString() : new Date().toISOString();
      await onSaveDate(iso);
      setEditingDate(false);
      onUploaded();
    } finally {
      setSavingDate(false);
    }
  };

  return (
    <section aria-label={title}>
      <div className="section-header flex-wrap justify-between border-t-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="section-title m-0">{title}</h2>
          {editingDate ? (
            <div className="flex items-center gap-1">
              <TextInput
                type="datetime-local"
                value={dateValue}
                onChange={(e) => setDateValue(e.currentTarget.value)}
                size="xs"
                aria-label="Aufnahmedatum"
                style={{ width: 200 }}
              />
              <ActionIcon size="sm" variant="subtle" color="green" loading={savingDate} onClick={handleSaveDate} aria-label="Datum speichern">
                <Check size={14} />
              </ActionIcon>
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setEditingDate(false)} aria-label="Abbrechen">
                <X size={14} />
              </ActionIcon>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs tabular-nums text-[var(--app-text-secondary)]">
                {date ? formatDateTime(date) : NO_RECORDING_DATE}
              </span>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="Datum bearbeiten"
                onClick={() => {
                  setDateValue(toDatetimeLocal(date) || toDatetimeLocal(new Date().toISOString()));
                  setEditingDate(true);
                }}
              >
                <Pencil size={12} />
              </ActionIcon>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {audioFiles.length > 0 && (
            <>
              <Checkbox
                size="xs"
                checked={allSelected}
                indeterminate={selectedIds.size > 0 && !allSelected}
                onChange={toggleAll}
                aria-label="Alle Aufnahmen auswählen"
                mr={4}
              />
              <Button size="compact-xs" variant="subtle" onClick={toggleAll}>
                {allSelected ? 'Auswahl aufheben' : 'Alle auswählen'}
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  size="compact-xs"
                  variant="default"
                  leftSection={<ArrowLeftRight size={12} />}
                  onClick={() => setBulkOpen(true)}
                >
                  Zuordnung ändern ({selectedIds.size})
                </Button>
              )}
            </>
          )}
          <ManualUpload
            patientId={patientId}
            phase={phase}
            patientStatus={patientStatus}
            sessionId={sessionId}
            isActiveSession={isActiveSession}
            onDone={onUploaded}
            buttonLabel={audioFiles.length > 0 ? 'Hochladen' : 'Dateien hochladen'}
            existingFiles={audioFiles}
          />
        </div>
      </div>

      {audioFiles.length === 0 ? (
        <div className="px-3 py-3 text-[13px] text-[var(--app-text-secondary)]">
          Keine Aufnahmen für {title.replace(/ Aufnahmen$/, '')} vorhanden.
        </div>
      ) : (
        <div className="grid gap-px bg-[var(--app-border)] sm:grid-cols-2">
          {audioFiles.map((f, i) => (
            <div key={f.id} className="bg-[var(--app-surface)] px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    size="xs"
                    checked={selectedIds.has(f.id)}
                    onChange={() => toggleSelect(f.id)}
                    aria-label={`Aufnahme ${i + 1} auswählen`}
                  />
                  <span className="text-[13px] font-medium">Aufnahme {i + 1}</span>
                  {f.exercise_id && (
                    <span className="truncate text-xs text-[var(--app-text-secondary)]">{f.exercise_id}</span>
                  )}
                </div>
                <AudioDeviceInfoBadge info={f.device_info} />
              </div>
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
    </section>
  );
}

function sessionLabel(s: RecordingSession): string {
  if (s.phase === 'PRE_OP') return 'Prä-OP';
  return `Post-OP ${s.session_number}`;
}

interface AudioSectionData {
  key: string;
  title: string;
  audioFiles: AudioFileType[];
  date: string | null;
  sessionId?: string;
  onSaveDate: (isoDate: string) => Promise<unknown>;
  isActiveSession: boolean;
}

// Each POST_OP RecordingSession gets its own card ("Post-OP N Aufnahmen",
// numbered the same way as the post_op_N export folders). Patients who
// haven't had a real session_number=1 RecordingSession created yet (should
// no longer happen now that advance_patient_step auto-creates it, but kept
// as a fallback) get a single virtual section holding their session-less
// recordings, so they still render instead of disappearing.
function buildPostOpSections(patient: PatientDetail): AudioSectionData[] {
  const postOpSessions = patient.sessions
    .filter((s) => s.phase === 'POST_OP')
    .sort((a, b) => a.session_number - b.session_number);
  const sessionOne = postOpSessions.find((s) => s.session_number === 1);

  const sections: AudioSectionData[] = [];

  if (!sessionOne) {
    sections.push({
      key: 'post-op-virtual',
      title: 'Post-OP 1 Aufnahmen',
      audioFiles: patient.audio_files_post.filter((f) => f.session === null),
      date: patient.post_op_date,
      sessionId: undefined,
      onSaveDate: (iso) => updatePatient(patient.id, { post_op_date: iso }),
      isActiveSession: true,
    });
  }

  for (const session of postOpSessions) {
    const ownFiles = patient.audio_files_post.filter((f) => f.session === session.id);
    // Session 1 also picks up any pre-existing recordings that predate the
    // RecordingSession row (session === null).
    const legacyFiles = session.session_number === 1
      ? patient.audio_files_post.filter((f) => f.session === null)
      : [];
    sections.push({
      key: session.id,
      title: `Post-OP ${session.session_number} Aufnahmen`,
      audioFiles: [...ownFiles, ...legacyFiles],
      date: session.session_number === 1 ? patient.post_op_date : session.visit_date,
      sessionId: session.id,
      onSaveDate: session.session_number === 1
        ? (iso) => updatePatient(patient.id, { post_op_date: iso })
        : (iso) => updateSessionVisitDate(patient.id, session.id, iso),
      isActiveSession: session.session_number === patient.current_post_op_session_number,
    });
  }

  return sections;
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

  const isNewFollowup = selectedSession === 'NEW_FOLLOWUP';
  const showSessionDropdown =
    selectedPhase === 'POST_OP' && nextPostOpSessionNumber >= 2;

  const sessionOptions = [
    { value: '', label: 'Keine Sitzung' },
    ...filteredSessions.map((s) => ({ value: s.id, label: sessionLabel(s) })),
    ...(selectedPhase === 'POST_OP' && nextPostOpSessionNumber >= 2
      ? [{ value: 'NEW_FOLLOWUP', label: '+ Neue Post-OP Sitzung anlegen' }]
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
                Es wird automatisch <strong>Post-OP {nextPostOpSessionNumber}</strong> angelegt.
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
  sessionId,
  isActiveSession,
}: {
  patientId: string;
  phase: 'PRE_OP' | 'POST_OP';
  patientStatus: string;
  onDone: () => void;
  buttonLabel?: string;
  existingFiles?: AudioFileType[];
  sessionId?: string;
  isActiveSession: boolean;
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
      if (phase === 'POST_OP' && patientStatus === 'PRE_OP_DONE' && isActiveSession) {
        await advancePatient(patientId);
      }
      const adminDeviceInfo = getRecordingDeviceInfo(null);
      if (adminDeviceInfo.microphone) {
        adminDeviceInfo.microphone.label = 'Manuell hochgeladen (Admin)';
      }
      for (const exercise of exercises) {
        const file = files[exercise.exercise_id];
        if (!file) continue;
        await uploadAudio(patientId, file, exercise.exercise_id, sessionId, adminDeviceInfo);
      }
      const shouldAdvance = isActiveSession && (
        (phase === 'PRE_OP' && patientStatus === 'CONSENT_GIVEN') ||
        (phase === 'POST_OP' && patientStatus === 'POST_OP_STARTED')
      );
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
      <Button size="compact-xs" variant="default" leftSection={<Upload size={12} />} onClick={handleOpen}>
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
                className="border-t-2 border-[var(--app-border)] pt-2"
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
