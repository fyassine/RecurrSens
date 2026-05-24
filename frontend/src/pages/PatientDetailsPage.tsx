import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import PersonIcon from '@mui/icons-material/Person';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import type { PatientDetail, PatientStatus, RecordingSession } from '../types';
import {
  getPatient,
  updatePatient,
  advancePatient,
  getAudioStreamUrl,
  uploadAudio,
  getExercises,
  advancePublicPatient,
  exportPatients,
  reassignAudioFile,
  createSession,
  AUDIO_ACCEPT_ATTR,
  isAllowedAudioFile,
} from '../api/client';
import { StatusBadge, PredictionBadge, FollowUpBadge } from '../components/Badges';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDate, formatDateTime, NO_RECORDING_DATE } from '../utils';
import type { Exercise, AudioFile as AudioFileType } from '../types';

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
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !patient) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error || 'Unbekannter Fehler'}</Alert>
      </Box>
    );
  }

  const noRecordings = patient.audio_files_pre.length === 0 && patient.audio_files_post.length === 0;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: noRecordings ? 2 : 3 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/')}
        sx={{ mb: noRecordings ? 2 : 3 }}
      >
        Zurück zur Übersicht
      </Button>

      <Grid container spacing={noRecordings ? 2 : 3} justifyContent="center">
        <Grid size={{ xs: 12, lg: noRecordings ? 9 : 8 }}>
          <PatientInfoCard patient={patient} onUpdated={fetchPatient} compact={noRecordings} />
          {noRecordings ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
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
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
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
              </Grid>
            </Grid>
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
        </Grid>
      </Grid>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Patient info card with inline edit
// ---------------------------------------------------------------------------

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
  const [preOpDate, setPreOpDate] = useState(toDatetimeLocal(patient.pre_op_date));
  const [postOpDate, setPostOpDate] = useState(toDatetimeLocal(patient.post_op_date));

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
        pre_op_date: preOpDate ? new Date(preOpDate).toISOString() : null,
        post_op_date: postOpDate ? new Date(postOpDate).toISOString() : null,
      });
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card sx={{ mb: compact ? 2 : 3 }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon color="primary" sx={{ fontSize: 20 }} />
            <Typography variant="h6" fontWeight={600}>
              Patienten Details
            </Typography>
            <IconButton size="small" onClick={() => setEditing(!editing)} sx={{ ml: 0.25 }}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        }
        action={
          <Button
            size="small"
            startIcon={downloading ? <CircularProgress size={16} /> : <DownloadIcon />}
            onClick={handleDownload}
            disabled={downloading}
          >
            Herunterladen
          </Button>
        }
        sx={{ pb: 1 }}
      />
      <CardContent sx={{ pt: 0 }}>
        {patient.deleted_at && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            Gelöscht am {formatDateTime(patient.deleted_at)}
          </Alert>
        )}
        {editing ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Patienten-ID"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label="Prä-OP Aufnahmedatum"
              type="datetime-local"
              value={preOpDate}
              onChange={(e) => setPreOpDate(e.target.value)}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Post-OP Aufnahmedatum"
              type="datetime-local"
              value={postOpDate}
              onChange={(e) => setPostOpDate(e.target.value)}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
              <Button size="small" variant="contained" onClick={handleSave} disabled={saving}>
                {saving ? <CircularProgress size={16} /> : 'Speichern'}
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <InfoField label="Patienten-ID" value={patient.patient_id} mono />
            <InfoField label="Status">
              {patient.current_post_op_session_number != null
                ? <FollowUpBadge
                    sessionNumber={patient.current_post_op_session_number}
                    complete={patient.status === 'POST_OP_DONE'}
                  />
                : <StatusBadge status={patient.status as PatientStatus} />
              }
            </InfoField>
            <InfoField
              label="Erstellt am"
              value={formatDate(patient.created_at)}
            />
            <InfoField
              label="Ablaufdatum"
              value={formatDate(patient.expires_at)}
            />
            <InfoField
              label="Prä-OP Aufnahmedatum"
              value={patient.pre_op_date ? formatDateTime(patient.pre_op_date) : '—'}
            />
            <InfoField
              label="Post-OP Aufnahmedatum"
              value={patient.post_op_date ? formatDateTime(patient.post_op_date) : '—'}
            />
          </Box>
        )}

        {/* CDSS prediction section */}
        <Box
          sx={{
            mt: compact ? 1.5 : 2,
            pt: compact ? 1.5 : 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            textAlign: 'center',
          }}
        >
          <Typography variant="subtitle2" gutterBottom align="center">
            Modellvorhersage (KI)
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ mb: compact ? 1.25 : 2, fontStyle: 'italic', fontSize: '0.78rem' }}
          >
            Hinweis: Dies ist ein klinisches Entscheidungsunterstützungssystem (CDSS).
            <br />
            Die Vorhersage ersetzt keine ärztliche Diagnose.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 1 : 1.5, alignItems: 'center' }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle2" align="center" sx={{ mb: 0.5 }}>
                Prä-OP Analyse
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <PredictionBadge
                  value={patient.prediction_pre}
                  percentage={patient.ai_percentage_rp_pre}
                  gradcamPrediction={patient.gradcam_prediction_pre}
                  gradcamPercentage={patient.gradcam_percentage_pre}
                />
              </Box>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle2" align="center" sx={{ mb: 0.5 }}>
                Post-OP Analyse
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <PredictionBadge
                  value={patient.prediction_post}
                  percentage={patient.ai_percentage_rp_post}
                  gradcamPrediction={patient.gradcam_prediction_post}
                  gradcamPercentage={patient.gradcam_percentage_post}
                />
              </Box>
            </Box>
          </Box>
        </Box>

      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Audio section with manual upload
// ---------------------------------------------------------------------------

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

  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleDone = () => {
    setSelectedIds(new Set());
    setBulkOpen(false);
    onUploaded();
  };

  return (
    <Card sx={{ mb: compact ? 0 : 3, height: compact ? '100%' : 'auto' }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
            <AudioFileIcon color='primary' />
            <Typography variant="h6" component="span">
              {title}
            </Typography>
          </Box>
        }
          subheader={date ? formatDateTime(date) : NO_RECORDING_DATE}
          slotProps={{
            title: {
              variant: 'h7',
              component: 'div',
            },
            subheader: {
              align: 'center',
            },
          }}
          sx={{
            '& .MuiCardHeader-content': { textAlign: 'center' },
            '& .MuiCardHeader-avatar': { display: 'none' }
          }}
      />
      <CardContent>
        {showUpload && audioFiles.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <Checkbox
                size="small"
                checked={selectedIds.size === audioFiles.length}
                indeterminate={selectedIds.size > 0 && selectedIds.size < audioFiles.length}
                onChange={() => {
                  if (selectedIds.size === audioFiles.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(audioFiles.map((f) => f.id)));
                  }
                }}
                sx={{ p: 0.25 }}
              />
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  if (selectedIds.size === audioFiles.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(audioFiles.map((f) => f.id)));
                  }
                }}
              >
                {selectedIds.size === audioFiles.length ? 'Auswahl aufheben' : 'Alle auswählen'}
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SwapHorizIcon />}
                  onClick={() => setBulkOpen(true)}
                >
                  Zuordnung ändern ({selectedIds.size})
                </Button>
              )}
            </Box>
            <ManualUpload
              patientId={patientId}
              phase={phase}
              patientStatus={patientStatus}
              onDone={onUploaded}
              buttonLabel="Hochladen"
              existingFiles={audioFiles}
            />
          </Box>
        )}
        {audioFiles.length === 0 ? (
          <Box
            sx={{
              py: compact ? 2.5 : 4,
              textAlign: 'center',
              color: 'text.secondary',
              bgcolor: 'grey.50',
              borderRadius: 1,
              border: '1px dashed',
              borderColor: 'grey.300',
            }}
          >
            <Typography variant="body2">
              Keine {phase === 'PRE_OP' ? 'Prä-OP' : 'Post-OP'} Aufnahmen vorhanden.
            </Typography>
            {showUpload && (
              <Box sx={{ mt: 1 }}>
                <ManualUpload
                  patientId={patientId}
                  phase={phase}
                  patientStatus={patientStatus}
                  onDone={onUploaded}
                  buttonLabel="Dateien hochladen"
                  existingFiles={audioFiles}
                />
              </Box>
            )}
          </Box>
        ) : (
          <Grid container spacing={2}>
            {audioFiles.map((f, i) => (
              <Grid key={f.id} size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: selectedIds.has(f.id) ? 'primary.main' : 'grey.200',
                    borderRadius: 1,
                    transition: 'border-color 0.15s',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <Checkbox
                      size="small"
                      checked={selectedIds.has(f.id)}
                      onChange={() => toggleSelect(f.id)}
                      sx={{ p: 0.25 }}
                    />
                    <Typography variant="body2" fontWeight={500} component="span">
                      Aufnahme {i + 1}
                      {f.exercise_id && (
                        <Chip label={f.exercise_id} size="small" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                  </Box>
                  <audio controls src={getAudioStreamUrl(f.id)} style={{ width: '100%', height: 32 }} />
                </Box>
              </Grid>
            ))}
          </Grid>
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
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bulk reassign dialog
// ---------------------------------------------------------------------------

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
    defaultPhase === 'PRE_OP' ? 'POST_OP' : 'PRE_OP'
  );
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // Default to the opposite phase — reassigning usually means moving to the other phase
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

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      let targetSessionId: string | null = null;
      if (isNewFollowup) {
        const s = await createSession(patientId, 'POST_OP');
        targetSessionId = s.id;
      } else {
        targetSessionId = selectedSession || null;
      }
      for (const fileId of fileIds) {
        await reassignAudioFile(fileId, selectedPhase, targetSessionId);
      }
      onDone();
    } catch {
      setError('Zuordnung konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth onClick={(e) => e.stopPropagation()}>
      <DialogTitle sx={{ pb: 1 }}>
        Zuordnung ändern ({fileIds.length} {fileIds.length === 1 ? 'Aufnahme' : 'Aufnahmen'})
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Wählen Sie die neue Phase und Sitzung für {fileIds.length === 1 ? 'diese Aufnahme' : 'alle ausgewählten Aufnahmen'}.
        </Typography>
        <FormControl size="small" fullWidth>
          <InputLabel>Phase</InputLabel>
          <Select
            label="Phase"
            value={selectedPhase}
            onChange={(e) => {
              setSelectedPhase(e.target.value as 'PRE_OP' | 'POST_OP');
              setSelectedSession('');
            }}
          >
            <MenuItem value="PRE_OP">Prä-OP</MenuItem>
            <MenuItem value="POST_OP">Post-OP</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
          <InputLabel>Sitzung</InputLabel>
          <Select
            label="Sitzung"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            <MenuItem value=""><em>Keine Sitzung</em></MenuItem>
            {filteredSessions.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {sessionLabel(s)}
              </MenuItem>
            ))}
            {selectedPhase === 'POST_OP' && nextPostOpSessionNumber >= 2 && (
              <MenuItem value="NEW_FOLLOWUP">
                <em>+ Neue Follow-up Sitzung anlegen</em>
              </MenuItem>
            )}
          </Select>
        </FormControl>
        {isNewFollowup && (
          <Alert severity="info" sx={{ mt: 0 }}>
            Es wird automatisch <strong>Post-OP Sitzung {nextPostOpSessionNumber}</strong>
            {nextFollowUpNumber >= 1 ? ` (Follow-up ${nextFollowUpNumber})` : ''} angelegt.
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Abbrechen
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : 'Speichern'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Manual upload for admin
// ---------------------------------------------------------------------------

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
      // For post-op, advance to POST_OP_STARTED first
      if (phase === 'POST_OP' && patientStatus === 'PRE_OP_DONE') {
        await advancePatient(patientId);
      }

      for (const exercise of exercises) {
        const file = files[exercise.exercise_id];
        if (!file) continue;
        await uploadAudio(patientId, file, exercise.exercise_id);
      }

      // Only advance if the patient hasn't already completed this phase
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
      <Button size="small" startIcon={<UploadFileIcon />} onClick={handleOpen}>
        {buttonLabel}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="Aufnahmen ersetzen?"
        message={
          <>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Für folgende Übungen existiert bereits eine Aufnahme:
            </Typography>
            {pendingConflicts.map((e) => e.title).join(', ')}. Möchten Sie diese ersetzen?
          </>
        }
        confirmLabel="Ersetzen"
        confirmColor="warning"
        onConfirm={() => {
          confirmedRef.current = true;
          setConfirmOpen(false);
          handleUpload();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          Hochladen ({phase === 'PRE_OP' ? 'Prä-OP' : 'Post-OP'})
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Bitte wählen Sie für jede der folgenden Übungen die entsprechende Audiodatei aus.
          </Typography>
          <Table size="medium">
            <TableBody>
              {exercises.map((ex) => (
                <TableRow key={ex.exercise_id}>
                  <TableCell sx={{ pl: 0, fontWeight: 500 }}>{ex.title}</TableCell>
                  <TableCell align="right" sx={{ pr: 0 }}>
                    <Button
                      component="label"
                      variant={files[ex.exercise_id] ? 'contained' : 'outlined'}
                      color={files[ex.exercise_id] ? 'success' : 'primary'}
                      startIcon={<UploadFileIcon />}
                      sx={{ minWidth: '140px' }}
                    >
                      <Typography variant="caption" noWrap sx={{ maxWidth: 120 }}>
                        {files[ex.exercise_id] ? files[ex.exercise_id].name : 'Auswählen'}
                      </Typography>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setOpen(false)} disabled={uploading} color="inherit">
            Abbrechen
          </Button>
          <Button 
            variant="contained" 
            onClick={handleUpload} 
            disabled={uploading} 
            sx={{ px: 4 }}
          >
            {uploading ? <CircularProgress size={20} /> : 'Alle Dateien hochladen'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  // Trim seconds and timezone so <input type="datetime-local"> accepts it
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
    <Box
      sx={{
        px: 1.5,
        py: 1.25,
        bgcolor: 'background.default',
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.68rem', fontWeight: 600, display: 'block' }}
      >
        {label}
      </Typography>
      <Box sx={{ mt: 0.5 }}>
        {children ?? (
          <Typography
            fontWeight={600}
            fontSize="0.9375rem"
            color="text.primary"
            sx={mono ? { fontFamily: 'ui-monospace, Consolas, monospace' } : {}}
          >
            {value || '-'}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
