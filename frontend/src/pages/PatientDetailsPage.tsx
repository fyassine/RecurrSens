import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import PersonIcon from '@mui/icons-material/Person';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import type { PatientDetail, PatientStatus } from '../types';
import {
  getPatient,
  updatePatient,
  advancePatient,
  getAudioStreamUrl,
  uploadAudio,
  getExercises,
  advancePublicPatient,
} from '../api/client';
import { StatusBadge } from '../components/Badges';
import ConfirmDialog from '../components/ConfirmDialog';
import type { Exercise } from '../types';

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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', px: { xs: 2, md: 3 }, py: 3 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/')}
        sx={{ mb: 3 }}
      >
        Zurück zur Übersicht
      </Button>

      <Grid container spacing={3} justifyContent="center">
        <Grid size={{ xs: 12, lg: 8 }}>
          <PatientInfoCard patient={patient} onUpdated={fetchPatient} />
          <AudioSection
            title="Prä-OP Aufnahmen"
            audioFiles={patient.audio_files_pre}
            phase="PRE_OP"
            date={patient.pre_op_date}
            patientId={patient.id}
            patientStatus={patient.status}
            showUpload={patient.status === 'CONSENT_GIVEN'}
            onUploaded={fetchPatient}
          />
          <AudioSection
            title="Post-OP Aufnahmen"
            audioFiles={patient.audio_files_post}
            phase="POST_OP"
            date={patient.post_op_date}
            patientId={patient.id}
            patientStatus={patient.status}
            showUpload
            onUploaded={fetchPatient}
          />
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
}: {
  patient: PatientDetail;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pid, setPid] = useState(patient.patient_id);
  const [completeOpen, setCompleteOpen] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePatient(patient.id, {
        patient_id: pid,
      });
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    await advancePatient(patient.id);
    setCompleteOpen(false);
    onUpdated();
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader
        avatar={<PersonIcon color="primary" />}
        title="Patienten Details"
        action={
          <IconButton onClick={() => setEditing(!editing)}>
            <EditIcon />
          </IconButton>
        }
      />
      <CardContent>
        {editing ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Patienten-ID"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              size="small"
              fullWidth
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
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <InfoField label="Patienten-ID" value={patient.patient_id} />
            <InfoField label="Status">
              <StatusBadge status={patient.status as PatientStatus} />
            </InfoField>
            <InfoField
              label="Ablaufdatum"
              value={new Date(patient.expires_at).toLocaleDateString('de-DE')}
            />
            <InfoField
              label="Erstellt am"
              value={new Date(patient.created_at).toLocaleDateString('de-DE')}
            />
          </Box>
        )}

        {patient.status === 'POST_OP_DONE' && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Button
              fullWidth
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={() => setCompleteOpen(true)}
            >
              Fall abschließen
            </Button>
            <ConfirmDialog
              open={completeOpen}
              title="Fall abschließen?"
              message="Möchten Sie diesen Fall wirklich als abgeschlossen markieren?"
              confirmLabel="Abschließen"
              confirmColor="success"
              onConfirm={handleComplete}
              onCancel={() => setCompleteOpen(false)}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Audio section with manual upload
// ---------------------------------------------------------------------------

import type { AudioFile as AudioFileType } from '../types';

function AudioSection({
  title,
  audioFiles,
  phase,
  date,
  patientId,
  patientStatus,
  showUpload,
  onUploaded,
}: {
  title: string;
  audioFiles: AudioFileType[];
  phase: 'PRE_OP' | 'POST_OP';
  date: string | null;
  patientId: string;
  patientStatus: string;
  showUpload: boolean;
  onUploaded: () => void;
}) {
  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader
        avatar={<AudioFileIcon color={phase === 'PRE_OP' ? 'primary' : 'warning'} />}
        title={title}
        subheader={date ? new Date(date).toLocaleDateString('de-DE') : undefined}
        action={showUpload ? <ManualUpload patientId={patientId} phase={phase} patientStatus={patientStatus} onDone={onUploaded} /> : undefined}
      />
      <CardContent>
        {audioFiles.length === 0 ? (
          <Box
            sx={{
              py: 4,
              textAlign: 'center',
              color: 'text.secondary',
              bgcolor: 'grey.50',
              borderRadius: 1,
              border: '1px dashed',
              borderColor: 'grey.300',
            }}
          >
            Keine {phase === 'PRE_OP' ? 'Prä-OP' : 'Post-OP'} Aufnahmen vorhanden.
          </Box>
        ) : (
          <Grid container spacing={2}>
            {audioFiles.map((f, i) => (
              <Grid key={f.id} size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: 'grey.200',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                    Aufnahme {i + 1}
                    {f.exercise_id && (
                      <Chip label={f.exercise_id} size="small" sx={{ ml: 1 }} />
                    )}
                  </Typography>
                  <audio controls src={getAudioStreamUrl(f.id)} style={{ width: '100%', height: 32 }} />
                </Box>
              </Grid>
            ))}
          </Grid>
        )}
      </CardContent>
    </Card>
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
}: {
  patientId: string;
  phase: 'PRE_OP' | 'POST_OP';
  patientStatus: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleOpen = async () => {
    setOpen(true);
    const ex = await getExercises();
    setExercises(ex);
  };

  const handleUpload = async () => {
    const missing = exercises.filter((e) => !files[e.exercise_id]);
    if (missing.length > 0) {
      setError('Bitte für jede Übung eine Datei auswählen.');
      return;
    }
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

      // Advance after all uploads
      await advancePublicPatient(patientId);
      setOpen(false);
      onDone();
    } catch {
      setError('Hochladen fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Button size="small" startIcon={<UploadFileIcon />} onClick={handleOpen}>
        Dateien hochladen
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Dateien hochladen ({phase === 'PRE_OP' ? 'Prä-OP' : 'Post-OP'})</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Übung</TableCell>
                <TableCell align="right">Datei</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {exercises.map((ex) => (
                <TableRow key={ex.exercise_id}>
                  <TableCell>{ex.title}</TableCell>
                  <TableCell align="right">
                    <Button
                      component="label"
                      size="small"
                      variant={files[ex.exercise_id] ? 'contained' : 'outlined'}
                      color={files[ex.exercise_id] ? 'success' : 'primary'}
                      startIcon={<UploadFileIcon />}
                    >
                      {files[ex.exercise_id] ? files[ex.exercise_id].name : 'Auswählen'}
                      <input
                        type="file"
                        accept="audio/*"
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
          {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={uploading}>Abbrechen</Button>
          <Button variant="contained" onClick={handleUpload} disabled={uploading}>
            {uploading ? <CircularProgress size={20} /> : 'Hochladen'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// Need these imports for Dialog inside ManualUpload
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function InfoField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </Typography>
      {children ?? (
        <Typography variant="body1" fontWeight={500}>
          {value || '-'}
        </Typography>
      )}
    </Box>
  );
}
