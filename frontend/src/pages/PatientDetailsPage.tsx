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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
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
import type { PatientDetail, PatientStatus } from '../types';
import {
  getPatient,
  updatePatient,
  advancePatient,
  getAudioStreamUrl,
  uploadAudio,
  getExercises,
  advancePublicPatient,
  exportPatients,
} from '../api/client';
import { StatusBadge, PredictionBadge, FollowUpBadge } from '../components/Badges';
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
  phase: 'PRE_OP' | 'POST_OP';
  date: string | null;
  patientId: string;
  patientStatus: string;
  showUpload: boolean;
  onUploaded: () => void;
  compact?: boolean;
}) {
  return (
    <Card sx={{ mb: compact ? 0 : 3, height: compact ? '100%' : 'auto' }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
            <AudioFileIcon color='primary' />
            {/* Display the title passed to the function */}
            <Typography variant="h6" component="span">
              {title}
            </Typography>
          </Box>
        }
          subheader={date ? formatDate(date) : NO_RECORDING_DATE}
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
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <ManualUpload
              patientId={patientId}
              phase={phase}
              patientStatus={patientStatus}
              onDone={onUploaded}
              buttonLabel="Hochladen"
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
  buttonLabel = 'Hochladen',
}: {
  patientId: string;
  phase: 'PRE_OP' | 'POST_OP';
  patientStatus: string;
  onDone: () => void;
  buttonLabel?: string;
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
        {buttonLabel}
      </Button>
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
// Helper
// ---------------------------------------------------------------------------

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
