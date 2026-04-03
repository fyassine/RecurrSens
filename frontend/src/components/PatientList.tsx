import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  CircularProgress,
  Tooltip,
  Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import VisibilityIcon from '@mui/icons-material/Visibility';
import type { Patient, Diagnosis, PatientStatus, PredictionStatus } from '../types';
import { StatusBadge, DiagnosisBadge, PredictionBadge } from './Badges';
import { getAge, formatGender } from '../utils';
import { deletePatient, advancePatient } from '../api/client';
import PatientAccessDialog from './PatientAccessDialog';
import ConfirmDialog from './ConfirmDialog';

type SortKey = keyof Patient | 'age';
type Order = 'asc' | 'desc';

export default function PatientList({
  patients,
  loading,
  onRefresh,
}: {
  patients: Patient[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [diagnosisFilter, setDiagnosisFilter] = useState<string>('ALL');
  const [predictionFilter, setPredictionFilter] = useState<string>('ALL');
  const [orderBy, setOrderBy] = useState<SortKey>('created_at');
  const [order, setOrder] = useState<Order>('desc');

  // Dialogs
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<Patient | null>(null);

  const filtered = useMemo(() => {
    return patients.filter((p) => {
      if (search && !p.patient_id.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (diagnosisFilter !== 'ALL') {
        if (diagnosisFilter === 'INFECTED') {
          if (!['LEFT', 'RIGHT', 'BOTH'].includes(p.diagnosis)) return false;
        } else if (p.diagnosis !== diagnosisFilter) return false;
      }
      if (predictionFilter !== 'ALL') {
        if (p.prediction_pre !== predictionFilter && p.prediction_post !== predictionFilter) return false;
      }
      return true;
    });
  }, [patients, search, statusFilter, diagnosisFilter, predictionFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: unknown;
      let bVal: unknown;
      if (orderBy === 'age') {
        aVal = getAge(a.birth_date);
        bVal = getAge(b.birth_date);
      } else {
        aVal = a[orderBy];
        bVal = b[orderBy];
      }
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, orderBy, order]);

  const handleSort = (key: SortKey) => {
    if (orderBy === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(key);
      setOrder('asc');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deletePatient(deleteTarget.id);
    setDeleteOpen(false);
    setDeleteTarget(null);
    onRefresh();
  };

  const handleUnlock = async () => {
    if (!unlockTarget) return;
    await advancePatient(unlockTarget.id);
    setUnlockOpen(false);
    setUnlockTarget(null);
    onRefresh();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      {/* Filters */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          size="small"
          placeholder="Suche nach Patienten-ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            },
          }}
          sx={{ minWidth: 240, bgcolor: 'white' }}
        />
        <TextField
          select
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 180, bgcolor: 'white' }}
        >
          <MenuItem value="ALL">Alle Status</MenuItem>
          <MenuItem value="NEW">Neu</MenuItem>
          <MenuItem value="CONSENT_GIVEN">Einwilligung</MenuItem>
          <MenuItem value="DEMOGRAPHICS_DONE">Demografie</MenuItem>
          <MenuItem value="PRE_OP_DONE">Prä-OP fertig</MenuItem>
          <MenuItem value="POST_OP_STARTED">Post-OP gestartet</MenuItem>
          <MenuItem value="POST_OP_DONE">Post-OP fertig</MenuItem>
          <MenuItem value="COMPLETED">Abgeschlossen</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          value={diagnosisFilter}
          onChange={(e) => setDiagnosisFilter(e.target.value)}
          sx={{ minWidth: 180, bgcolor: 'white' }}
        >
          <MenuItem value="ALL">Alle Diagnosen</MenuItem>
          <MenuItem value="TODO">Ausstehend</MenuItem>
          <MenuItem value="INFECTED">RP (alle)</MenuItem>
          <MenuItem value="LEFT">Links (RP)</MenuItem>
          <MenuItem value="RIGHT">Rechts (RP)</MenuItem>
          <MenuItem value="BOTH">Beidseitig (RP)</MenuItem>
          <MenuItem value="HEALTHY">Keine RP</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          value={predictionFilter}
          onChange={(e) => setPredictionFilter(e.target.value)}
          sx={{ minWidth: 180, bgcolor: 'white' }}
        >
          <MenuItem value="ALL">Alle Vorhersagen</MenuItem>
          <MenuItem value="TODO">Ausstehend</MenuItem>
          <MenuItem value="INFECTED">RP</MenuItem>
          <MenuItem value="HEALTHY">Keine RP</MenuItem>
        </TextField>
      </Stack>

      {/* Table */}
      <TableContainer component={Paper} elevation={1}>
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Aktive Patienten ({sorted.length})
          </Typography>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortCell label="Patienten-ID" field="patient_id" orderBy={orderBy} order={order} onSort={handleSort} />
              <SortCell label="Status" field="status" orderBy={orderBy} order={order} onSort={handleSort} />
              <SortCell label="Alter / Geschlecht" field="age" orderBy={orderBy} order={order} onSort={handleSort} />
              <SortCell label="Diagnose" field="diagnosis" orderBy={orderBy} order={order} onSort={handleSort} />
              <SortCell label="KI (Prä)" field="prediction_pre" orderBy={orderBy} order={order} onSort={handleSort} />
              <SortCell label="KI (Post)" field="prediction_post" orderBy={orderBy} order={order} onSort={handleSort} />
              <SortCell label="Erstellt am" field="created_at" orderBy={orderBy} order={order} onSort={handleSort} />
              <TableCell align="right">Aktionen</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{p.patient_id}</TableCell>
                <TableCell>
                  {p.status === 'PRE_OP_DONE' ? (
                    <Button
                      size="small"
                      variant="contained"
                      color="warning"
                      startIcon={<LockOpenIcon />}
                      onClick={() => {
                        setUnlockTarget(p);
                        setUnlockOpen(true);
                      }}
                    >
                      Freischalten
                    </Button>
                  ) : (
                    <StatusBadge status={p.status as PatientStatus} />
                  )}
                </TableCell>
                <TableCell>
                  {getAge(p.birth_date) > 0 ? getAge(p.birth_date) : '-'} / {formatGender(p.gender)}
                </TableCell>
                <TableCell>
                  <DiagnosisBadge value={p.diagnosis as Diagnosis} />
                </TableCell>
                <TableCell>
                  <PredictionBadge value={p.prediction_pre as PredictionStatus} />
                </TableCell>
                <TableCell>
                  <PredictionBadge value={p.prediction_post as PredictionStatus} />
                </TableCell>
                <TableCell>
                  {new Date(p.created_at).toLocaleDateString('de-DE')}
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                    <Tooltip title="Details anzeigen">
                      <IconButton size="small" onClick={() => navigate(`/details/${p.id}`)}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <PatientAccessDialog patient={p} />
                    <Tooltip title="Löschen">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setDeleteTarget(p);
                          setDeleteOpen(true);
                        }}
                      >
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  Keine Patienten gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        title="Patient löschen?"
        message={`Sind Sie sicher, dass Sie den Patienten "${deleteTarget?.patient_id}" löschen möchten? Alle zugehörigen Daten und Audiodateien werden dauerhaft entfernt.`}
        confirmLabel="Löschen"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
      />

      {/* Unlock confirmation */}
      <ConfirmDialog
        open={unlockOpen}
        title="Patient freischalten?"
        message={`Möchten Sie den Patienten "${unlockTarget?.patient_id}" für die Post-OP Phase freischalten?`}
        confirmLabel="Freischalten"
        confirmColor="warning"
        onConfirm={handleUnlock}
        onCancel={() => {
          setUnlockOpen(false);
          setUnlockTarget(null);
        }}
      />
    </>
  );
}

function SortCell({
  label,
  field,
  orderBy,
  order,
  onSort,
}: {
  label: string;
  field: SortKey;
  orderBy: SortKey;
  order: Order;
  onSort: (k: SortKey) => void;
}) {
  return (
    <TableCell>
      <TableSortLabel
        active={orderBy === field}
        direction={orderBy === field ? order : 'asc'}
        onClick={() => onSort(field)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}
