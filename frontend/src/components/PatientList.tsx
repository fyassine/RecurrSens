import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import type { Patient, PatientStatus } from '../types';
import { StatusBadge, PredictionBadge } from './Badges';
import { deletePatient, advancePatient, createSession } from '../api/client';
import PatientAccessOptions from './PatientAccessOptions';
import CreatePatientDialog from './CreatePatientDialog';
import ConfirmDialog from './ConfirmDialog';

export type DashboardFilter = 'ALL' | 'PRE_OP' | 'POST_OP' | 'RP' | 'OVERDUE_DELETE';

type SortKey = keyof Patient;
type Order = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [5, 10, 25];

export default function PatientList({
  patients,
  loading,
  onRefresh,
  selectedIds,
  onSelectionChange,
  activeFilter = null,
  onExport,
  exporting = false,
  exportCount = 0,
  onCreated,
}: {
  patients: Patient[];
  loading: boolean;
  onRefresh: () => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  activeFilter?: DashboardFilter | null;
  onExport?: () => void;
  exporting?: boolean;
  exportCount?: number;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [orderBy, setOrderBy] = useState<SortKey>('created_at');
  const [order, setOrder] = useState<Order>('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const nowMs = Date.now();
  const warningThresholdMs = nowMs + 86400000;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [accessPatient, setAccessPatient] = useState<Patient | null>(null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [creatingFollowUp, setCreatingFollowUp] = useState<string | null>(null);

  // Reset to page 0 when filter/search changes
  useEffect(() => {
    setPage(0);
  }, [search, activeFilter]);

  const filtered = useMemo(() => {
    return patients.filter((p) => {
      if (search && !p.patient_id.toLowerCase().includes(search.toLowerCase())) return false;
      switch (activeFilter) {
        case 'PRE_OP':
          return p.status === 'NEW' || p.status === 'CONSENT_GIVEN' || p.status === 'PRE_OP_DONE';
        case 'POST_OP':
          return p.status === 'POST_OP_STARTED' || p.status === 'POST_OP_DONE';
        case 'RP':
          return p.prediction_pre === 'INFECTED' || p.prediction_post === 'INFECTED';
        case 'OVERDUE_DELETE':
          return !p.deleted_at && new Date(p.expires_at).getTime() <= nowMs;
        default:
          return true;
      }
    });
  }, [patients, search, activeFilter, nowMs]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal: unknown = a[orderBy];
      const bVal: unknown = b[orderBy];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, orderBy, order]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const paginated = sorted.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const rpCount = useMemo(
    () => sorted.filter((p) => p.prediction_pre === 'INFECTED' || p.prediction_post === 'INFECTED').length,
    [sorted],
  );

  const handleSort = (key: SortKey) => {
    if (orderBy === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(key);
      setOrder('asc');
    }
    setPage(0);
  };

  const visibleIds = paginated.map((p) => p.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = !allVisibleSelected && visibleIds.some((id) => selectedIds.has(id));

  const handleToggleAll = () => {
    const next = new Set(selectedIds);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    onSelectionChange(next);
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deletePatient(deleteTarget.id);
    setDeleteOpen(false);
    setDeleteTarget(null);
    onRefresh();
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await deletePatient(id);
    }
    setBulkDeleteOpen(false);
    onSelectionChange(new Set());
    onRefresh();
  };

  const handleUnlock = async (patient: Patient) => {
    setUnlocking(patient.id);
    try {
      await advancePatient(patient.id);
      onRefresh();
    } finally {
      setUnlocking(null);
    }
  };

  const handleCreateFollowUp = async (patient: Patient) => {
    setCreatingFollowUp(patient.id);
    try {
      await createSession(patient.id, 'POST_OP');
      onRefresh();
    } finally {
      setCreatingFollowUp(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Numbered pagination buttons (show up to 5)
  const pageButtons: (number | '…')[] = [];
  if (totalPages <= 5) {
    for (let i = 0; i < totalPages; i++) pageButtons.push(i);
  } else {
    pageButtons.push(0);
    if (page > 2) pageButtons.push('…');
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) {
      pageButtons.push(i);
    }
    if (page < totalPages - 3) pageButtons.push('…');
    pageButtons.push(totalPages - 1);
  }

  return (
    <>
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderRadius: 2,
          overflow: 'clip',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {/* Toolbar */}
        <Box
          sx={{
            bgcolor: 'background.paper',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexWrap: 'wrap',
          }}
        >
          <TextField
            size="small"
            placeholder="Patienten-ID suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              flex: 1,
              maxWidth: 280,
              '& .MuiOutlinedInput-root': { height: 32, fontSize: '0.8125rem' },
              '& .MuiOutlinedInput-input': { py: 0 },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'text.secondary', fontSize: 16 }} />
                  </InputAdornment>
                ),
              },
            }}
          />
          <Box sx={{ flex: 1 }} />
          {selectedIds.size > 0 && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<DeleteIcon />}
              onClick={() => setBulkDeleteOpen(true)}
              sx={{ height: 32, minWidth: 160 }}
            >
              {selectedIds.size === 1 ? 'Löschen' : `Löschen (${selectedIds.size})`}
            </Button>
          )}
          {onExport && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={onExport}
              disabled={exporting}
              sx={{ height: 32, minWidth: 140 }}
            >
              {exporting ? 'Exportiere…' : exportCount > 1 ? `Exportieren (${exportCount})` : 'Exportieren'}
            </Button>
          )}
          {onCreated && <CreatePatientDialog onCreated={onCreated} buttonSx={{ height: 32 }} />}
        </Box>

        {/* RP alert banner */}
        {rpCount > 0 && activeFilter !== 'RP' && (
          <Alert
            severity="error"
            icon={<WarningAmberIcon fontSize="small" />}
            sx={{ borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            {rpCount} Patient{rpCount !== 1 ? 'en' : ''} mit RP-Vorhersage in dieser Ansicht
          </Alert>
        )}

        {/* Table */}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" align="center">
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Checkbox
                      size="small"
                      checked={allVisibleSelected}
                      indeterminate={someVisibleSelected}
                      onChange={handleToggleAll}
                      slotProps={{ input: { 'aria-label': 'Alle sichtbaren Patienten auswählen' } }}
                    />
                  </Box>
                </TableCell>
                <SortCell label="Patienten-ID" field="patient_id" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortCell label="Erstellt am" field="created_at" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortCell label="Status" field="status" orderBy={orderBy} order={order} onSort={handleSort} />
                <TableCell sx={{ whiteSpace: 'nowrap' }} align="center">
                  <Tooltip title="FiLM-Modell Vorhersage — wird automatisch nach Eingang der Prä-OP Aufnahmen berechnet">
                    <Box
                      component="span"
                      sx={{ borderBottom: '1px dashed', borderColor: 'text.secondary', cursor: 'help' }}
                    >
                      Prä-OP KI
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }} align="center">
                  <Tooltip title="FiLM-Modell Vorhersage — wird automatisch nach Eingang der Post-OP Aufnahmen berechnet">
                    <Box
                      component="span"
                      sx={{ borderBottom: '1px dashed', borderColor: 'text.secondary', cursor: 'help' }}
                    >
                      Post-OP KI
                    </Box>
                  </Tooltip>
                </TableCell>
                <SortCell label="Löschdatum" field="expires_at" orderBy={orderBy} order={order} onSort={handleSort} />
                <TableCell align="center" sx={{ whiteSpace: 'nowrap' }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {paginated.map((p) => {
                const isRP = p.prediction_pre === 'INFECTED' || p.prediction_post === 'INFECTED';
                const expiresAtMs = new Date(p.expires_at).getTime();
                const isExpired = !p.deleted_at && expiresAtMs <= nowMs;
                const isExpiringSoon = !isExpired && expiresAtMs <= warningThresholdMs;
                return (
                  <TableRow
                    key={p.id}
                    hover
                    selected={selectedIds.has(p.id)}
                    onClick={() => navigate(`/details/${p.id}`, { state: { patientLabel: p.patient_id } })}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': {
                        boxShadow: 'inset 0 0 0 1px rgba(14,165,201,0.2)',
                        '& .row-actions': { opacity: 1 },
                      },
                    }}
                  >
                    <TableCell padding="checkbox" align="center" onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <Checkbox
                          size="small"
                          checked={selectedIds.has(p.id)}
                          onChange={() => handleToggleRow(p.id)}
                          slotProps={{ input: { 'aria-label': `Patient ${p.patient_id} auswählen` } }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: 'ui-monospace, Consolas, monospace',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        color: 'primary.main',
                      }}
                      align="center"
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.75, width: '100%' }}>
                        <Box
                          sx={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            bgcolor: isRP ? 'error.main' : 'transparent',
                            flexShrink: 0,
                          }}
                        />
                        {p.patient_id}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      {new Date(p.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
                        {p.status === 'POST_OP_STARTED' && (p.current_post_op_session_number ?? 1) > 1
                          ? <FollowUpBadge sessionNumber={p.current_post_op_session_number!} complete={false} />
                          : p.status === 'POST_OP_DONE' && (p.current_post_op_session_number ?? 1) > 1
                            ? <FollowUpBadge sessionNumber={p.current_post_op_session_number!} complete />
                            : <StatusBadge status={p.status as PatientStatus} />
                        }
                        {p.status === 'PRE_OP_DONE' && (
                          <LockIcon sx={{ fontSize: 13, color: 'warning.main' }} />
                        )}
                        {p.status === 'POST_OP_DONE' && (
                          <LockIcon sx={{ fontSize: 13, color: 'warning.main' }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <PredictionBadge value={p.prediction_pre} />
                    </TableCell>
                    <TableCell align="center">
                      <PredictionBadge value={p.prediction_post} />
                    </TableCell>
                    <TableCell
                      sx={{
                        color: isExpired || isExpiringSoon ? 'error.main' : 'text.primary',
                        fontWeight: isExpired ? 700 : 400,
                      }}
                      align="center"
                    >
                      <Box sx={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                        {new Date(p.expires_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {isExpired && <WarningAmberIcon sx={{ fontSize: 16, color: 'error.main' }} />}
                      </Box>
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Box
                        className="row-actions"
                        sx={{
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          gap: 0.25,
                          opacity: 0,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <Tooltip title="Zugangsoptionen">
                          <IconButton size="small" onClick={() => setAccessPatient(p)}>
                            <OpenInNewIcon fontSize="small" color="primary" />
                          </IconButton>
                        </Tooltip>
                        {p.status === 'PRE_OP_DONE' && (
                          <Tooltip title="Für Post-OP freischalten">
                            <IconButton
                              size="small"
                              disabled={unlocking === p.id}
                              onClick={(e) => { e.stopPropagation(); handleUnlock(p); }}
                            >
                              {unlocking === p.id
                                ? <CircularProgress size={14} />
                                : <LockOpenIcon fontSize="small" sx={{ color: 'success.main' }} />}
                            </IconButton>
                          </Tooltip>
                        )}
                        {p.status === 'POST_OP_DONE' && (
                          <Tooltip title="Neue Follow-Up Sitzung starten">
                            <IconButton
                              size="small"
                              disabled={creatingFollowUp === p.id}
                              onClick={(e) => { e.stopPropagation(); handleCreateFollowUp(p); }}
                            >
                              {creatingFollowUp === p.id
                                ? <CircularProgress size={14} />
                                : <LockOpenIcon fontSize="small" sx={{ color: 'info.main' }} />}
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Löschen">
                          <IconButton
                            size="small"
                            onClick={() => { setDeleteTarget(p); setDeleteOpen(true); }}
                          >
                            <DeleteIcon fontSize="small" color="error" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {search
                      ? `Kein Patient mit ID „${search}" gefunden.`
                      : activeFilter
                        ? 'Keine Patienten in dieser Kategorie.'
                        : 'Noch keine Patienten angelegt.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Table footer: count + page size + pagination */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.25,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'action.hover',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {/* Left: count + page size */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography fontSize="0.8rem" color="text.secondary">
              {sorted.length} Patient{sorted.length !== 1 ? 'en' : ''}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography fontSize="0.75rem" color="text.secondary">
                Zeige:
              </Typography>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <Box
                  key={size}
                  component="button"
                  onClick={() => { setRowsPerPage(size); setPage(0); }}
                  sx={{
                    width: 28,
                    height: 24,
                    borderRadius: 0.75,
                    border: '1px solid',
                    borderColor: rowsPerPage === size ? 'primary.main' : 'divider',
                    bgcolor: rowsPerPage === size ? 'primary.main' : 'transparent',
                    color: rowsPerPage === size ? '#fff' : 'text.secondary',
                    fontSize: '0.75rem',
                    fontWeight: rowsPerPage === size ? 700 : 400,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                    '&:hover': !( rowsPerPage === size) ? { borderColor: 'primary.main', color: 'primary.main' } : {},
                  }}
                >
                  {size}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Right: pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton
                size="small"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                sx={{ width: 28, height: 28, borderRadius: 0.75 }}
              >
                <NavigateBeforeIcon fontSize="small" />
              </IconButton>

              {pageButtons.map((btn, i) =>
                btn === '…' ? (
                  <Typography key={`ellipsis-${i}`} fontSize="0.75rem" color="text.secondary" sx={{ px: 0.5 }}>
                    …
                  </Typography>
                ) : (
                  <Box
                    key={btn}
                    component="button"
                    onClick={() => setPage(btn)}
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: 0.75,
                      border: '1px solid',
                      borderColor: page === btn ? 'primary.main' : 'transparent',
                      bgcolor: page === btn ? 'primary.main' : 'transparent',
                      color: page === btn ? '#fff' : 'text.secondary',
                      fontSize: '0.75rem',
                      fontWeight: page === btn ? 700 : 400,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                      '&:hover': !(page === btn) ? { borderColor: 'divider', color: 'text.primary' } : {},
                    }}
                  >
                    {(btn as number) + 1}
                  </Box>
                ),
              )}

              <IconButton
                size="small"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                sx={{ width: 28, height: 28, borderRadius: 0.75 }}
              >
                <NavigateNextIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </Box>
      </Box>

      <ConfirmDialog
        open={deleteOpen}
        title="Patient löschen?"
        message={`Sind Sie sicher, dass Sie den Patienten "${deleteTarget?.patient_id}" löschen möchten? Die Daten werden gelöscht — stellen Sie sicher, dass alle Audiodateien bereits auf den verschlüsselten lokalen Server übertragen wurden.`}
        confirmLabel="Löschen"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={selectedIds.size > 1 ? 'Ausgewählte Patienten löschen?' : 'Ausgewählten Patienten löschen?'}
        message={`Möchten Sie ${selectedIds.size > 1 ? `die ${selectedIds.size} ausgewählten Patienten` : 'den ausgewählten Patienten'} löschen? Die Daten werden gelöscht — stellen Sie sicher, dass alle Audiodateien bereits auf den verschlüsselten lokalen Server übertragen wurden.`}
        confirmLabel={selectedIds.size > 1 ? `Alle (${selectedIds.size}) löschen` : 'Löschen'}
        confirmColor="error"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      {/* Patient access dialog — opened by row click or hover icon */}
      <Dialog open={!!accessPatient} onClose={() => setAccessPatient(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Patienten-Zugang</DialogTitle>
        <DialogContent>
          {accessPatient && (
            <PatientAccessOptions patientId={accessPatient.id} patientLabel={accessPatient.patient_id} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccessPatient(null)}>Schließen</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function FollowUpBadge({ sessionNumber, complete }: { sessionNumber: number; complete: boolean }) {
  const { palette: p } = useTheme();
  const isDark = p.mode === 'dark';
  const color = complete
    ? (isDark ? '#4ade80' : '#2e7d32')
    : (isDark ? '#60a5fa' : '#1565c0');
  const bg = complete
    ? (isDark ? 'rgba(74,222,128,0.12)' : '#e8f5e9')
    : (isDark ? 'rgba(96,165,250,0.12)' : '#e3f2fd');
  return (
    <Chip
      label={`Follow-up (${sessionNumber}) ${complete ? 'vollständig' : 'unvollständig'}`}
      size="small"
      sx={{ bgcolor: bg, color, fontWeight: 500 }}
    />
  );
}

function SortCell({
  label, field, orderBy, order, onSort,
}: {
  label: string;
  field: SortKey;
  orderBy: SortKey;
  order: Order;
  onSort: (k: SortKey) => void;
}) {
  return (
    <TableCell sx={{ whiteSpace: 'nowrap' }} align="center">
      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <TableSortLabel
          active={orderBy === field}
          direction={orderBy === field ? order : 'asc'}
          onClick={() => onSort(field)}
          sx={{ display: 'flex', justifyContent: 'center' }}
        >
          {label}
        </TableSortLabel>
      </Box>
    </TableCell>
  );
}
