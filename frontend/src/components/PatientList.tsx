import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Loader,
  Menu,
  Paper,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Download,
  Trash2,
  Copy,
  Check,
  FileText,
  ExternalLink,
  Lock,
  Unlock,
  MoreVertical,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { Patient, PatientStatus } from '../types';
import { StatusBadge, FollowUpBadge } from './Badges';
import { deletePatient, advancePatient, createSession, downloadPatientPdf, exportPatients } from '../api/client';
import { formatDate, formatDateTime, NO_RECORDING_DATE } from '../utils';
import ConfirmDialog from './ConfirmDialog';
import { useAppData } from '../context/AppDataContext';

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
}) {
  const navigate = useNavigate();
  const { userRole } = useAppData();
  const canDelete = userRole === 'SUPER_ADMIN';
  const canExport = userRole === 'SUPER_ADMIN';
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
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [creatingFollowUp, setCreatingFollowUp] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

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
  const safePage = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage);
  // page 1 = oldest, page N = newest; internal page 0 (newest slice) → displayed as totalPages
  const displayPage    = totalPages - safePage;
  const toInternalPage = (d: number) => totalPages - d;

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
      <div className="flex justify-center py-16">
        <Loader />
      </div>
    );
  }

  const pageButtons: (number | '…')[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageButtons.push(i);
  } else {
    pageButtons.push(1);
    if (displayPage > 3) pageButtons.push('…');
    for (let d = Math.max(2, displayPage - 1); d <= Math.min(totalPages - 1, displayPage + 1); d++) {
      pageButtons.push(d);
    }
    if (displayPage < totalPages - 2) pageButtons.push('…');
    pageButtons.push(totalPages);
  }

  return (
    <>
      <Paper withBorder radius="md" className="overflow-clip">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--mantine-color-default-border)] px-4 py-3">
          <TextInput
            size="xs"
            placeholder="Patienten-ID suchen…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<Search size={14} />}
            className="max-w-[280px] flex-1"
          />
          <div className="flex-1" />
          {canDelete && (
            <AnimatePresence>
              {selectedIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    variant="outline"
                    color="red"
                    size="xs"
                    leftSection={<Trash2 size={14} />}
                    onClick={() => setBulkDeleteOpen(true)}
                    className="min-w-[160px]"
                  >
                    {selectedIds.size === 1 ? 'Löschen' : `Löschen (${selectedIds.size})`}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
          {canExport && onExport && (
            <Button
              variant="outline"
              size="sm"
              leftSection={<Download size={14} />}
              onClick={onExport}
              loading={exporting}
            >
              {exporting ? 'Exportiere…' : exportCount > 1 ? `Exportieren (${exportCount})` : 'Exportieren'}
            </Button>
          )}
        </div>

        {/* RP alert banner */}
        {rpCount > 0 && activeFilter !== 'RP' && (
          <Alert color="red" radius={0} icon={<AlertTriangle size={16} />}>
            {rpCount} Patient{rpCount !== 1 ? 'en' : ''} mit RP-Vorhersage in dieser Ansicht
          </Alert>
        )}

        {/* Table */}
        <Table.ScrollContainer minWidth={0}>
          <Table
            verticalSpacing="xs"
            horizontalSpacing="sm"
            striped={false}
            highlightOnHover
            stickyHeader={false}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <Table.Thead bg="var(--mantine-color-body)">
              <Table.Tr>
                {canDelete && (
                  <Table.Th style={{ width: 44, textAlign: 'center' }}>
                    <div className="flex justify-center">
                      <Checkbox
                        size="xs"
                        checked={allVisibleSelected}
                        indeterminate={someVisibleSelected}
                        onChange={handleToggleAll}
                        aria-label="Alle sichtbaren Patienten auswählen"
                      />
                    </div>
                  </Table.Th>
                )}
                {!canDelete && <Table.Th style={{ width: 44 }} />}
                <SortHeader label="Patienten-ID" field="patient_id" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortHeader label="Erstellt am" field="created_at" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortHeader label="Status" field="status" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortHeader label="Löschdatum" field="expires_at" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortHeader label="Aufnahmedatum" field="pre_op_date" orderBy={orderBy} order={order} onSort={handleSort} />
                <Table.Th style={{ width: 140, textAlign: 'center' }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paginated.map((p) => {
                const isRP = p.prediction_pre === 'INFECTED' || p.prediction_post === 'INFECTED';
                const expiresAtMs = new Date(p.expires_at).getTime();
                const isExpired = !p.deleted_at && expiresAtMs <= nowMs;
                const isExpiringSoon = !isExpired && expiresAtMs <= warningThresholdMs;
                const expColor = p.deleted_at
                  ? 'var(--mantine-color-green-6)'
                  : isExpired || isExpiringSoon
                    ? 'var(--mantine-color-red-6)'
                    : undefined;
                const isMenuOpen = menuOpenId === p.id;
                return (
                  <Table.Tr
                    key={p.id}
                    onClick={() => navigate(`/details/${p.id}`, { state: { patientLabel: p.patient_id } })}
                    className="group cursor-pointer"
                    bg={selectedIds.has(p.id) || isMenuOpen ? 'var(--mantine-color-brand-light)' : undefined}
                  >
                    <Table.Td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                      {canDelete && (
                        <div className="flex justify-center">
                          <Checkbox
                            size="xs"
                            checked={selectedIds.has(p.id)}
                            onChange={() => handleToggleRow(p.id)}
                            aria-label={`Patient ${p.patient_id} auswählen`}
                          />
                        </div>
                      )}
                    </Table.Td>
                    <Table.Td align="center">
                      <div
                        className="flex items-center justify-center gap-2 font-mono font-bold"
                        style={{
                          color: 'var(--mantine-color-brand-7)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <span
                          className="h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{
                            backgroundColor: isRP ? 'var(--mantine-color-red-6)' : 'transparent',
                          }}
                        />
                        {p.patient_id}
                      </div>
                    </Table.Td>
                    <Table.Td align="center">{formatDate(p.created_at)}</Table.Td>
                    <Table.Td align="center">
                      <PatientStatusCell patient={p} />
                    </Table.Td>
                    <Table.Td align="center" style={{ color: expColor, fontWeight: p.deleted_at || isExpired ? 700 : 400 }}>
                      {p.deleted_at ? (
                        <span className="inline-flex items-center gap-1">
                          Gelöscht <Check size={14} />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1">
                          {formatDate(p.expires_at)}
                          {isExpired && <AlertTriangle size={14} color="var(--mantine-color-red-6)" />}
                        </span>
                      )}
                    </Table.Td>
                    <Table.Td
                      align="center"
                      style={{
                        whiteSpace: 'nowrap',
                        fontSize: '0.8rem',
                        color: p.pre_op_date ? undefined : 'var(--mantine-color-dimmed)',
                      }}
                    >
                      {p.pre_op_date ? formatDateTime(p.pre_op_date) : NO_RECORDING_DATE}
                    </Table.Td>
                    <Table.Td align="center" style={{ width: 140 }} onClick={(e) => e.stopPropagation()}>
                      <div className={`flex items-center justify-center gap-0.5 transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <Menu position="bottom-end" withinPortal onOpen={() => setMenuOpenId(p.id)} onClose={() => setMenuOpenId(null)}>
                          <Menu.Target>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="gray"
                              onClick={(e) => e.stopPropagation()}
                              title="Weitere Aktionen"
                            >
                              <MoreVertical size={14} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                            <Menu.Item
                              leftSection={
                                copiedId === p.id ? (
                                  <Check size={14} color="var(--mantine-color-green-6)" />
                                ) : (
                                  <Copy size={14} color="var(--mantine-color-cyan-6)" />
                                )
                              }
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/p/${p.id}`);
                                setCopiedId(p.id);
                                setTimeout(() => setCopiedId(null), 2000);
                              }}
                            >
                              {copiedId === p.id ? 'Kopiert!' : 'Link kopieren'}
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<FileText size={14} color="var(--mantine-color-yellow-6)" />}
                              onClick={() => downloadPatientPdf(p.id)}
                            >
                              PDF öffnen
                            </Menu.Item>
                            {canExport && (
                              <Menu.Item
                                leftSection={<Download size={14} />}
                                onClick={() => exportPatients([p.id])}
                              >
                                Exportieren
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                        <Tooltip label="Patienten-Aufnahme öffnen">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="brand"
                            component="a"
                            href={`/p/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            <ExternalLink size={14} />
                          </ActionIcon>
                        </Tooltip>
                        {p.status === 'PRE_OP_DONE' && (
                          <Tooltip label="Für Post-OP freischalten">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="green"
                              loading={unlocking === p.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnlock(p);
                              }}
                            >
                              <Unlock size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {p.status === 'POST_OP_DONE' && (
                          <Tooltip label="Neue Follow-Up Sitzung starten">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="cyan"
                              loading={creatingFollowUp === p.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateFollowUp(p);
                              }}
                            >
                              <Unlock size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {canDelete && (
                          <Tooltip label="Löschen">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(p);
                                setDeleteOpen(true);
                              }}
                            >
                              <Trash2 size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </div>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {paginated.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={9} align="center" py="xl">
                    <Text size="sm" c="dimmed">
                      {search
                        ? `Kein Patient mit ID „${search}" gefunden.`
                        : activeFilter
                          ? 'Keine Patienten in dieser Kategorie.'
                          : 'Noch keine Patienten angelegt.'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--mantine-color-default-border)] bg-[var(--mantine-color-default-hover)] px-4 py-2.5">
          <div className="flex items-center gap-4">
            <Text size="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {sorted.length} Patient{sorted.length !== 1 ? 'en' : ''}
            </Text>
            <div className="flex items-center gap-1">
              <Text size="sm" c="dimmed">Zeige:</Text>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <UnstyledButton
                  key={size}
                  onClick={() => {
                    const newTotal = Math.max(1, Math.ceil(sorted.length / size));
                    setRowsPerPage(size);
                    setPage((p) => Math.min(p, newTotal - 1));
                  }}
                  className="flex h-7 w-8 items-center justify-center rounded text-sm transition-colors"
                  style={{
                    border: '1px solid',
                    borderColor: rowsPerPage === size ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-default-border)',
                    backgroundColor: rowsPerPage === size ? 'var(--mantine-color-brand-6)' : 'transparent',
                    color: rowsPerPage === size ? '#fff' : 'var(--mantine-color-dimmed)',
                    fontWeight: rowsPerPage === size ? 700 : 400,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {size}
                </UnstyledButton>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                disabled={displayPage >= totalPages}
                onClick={() => setPage(toInternalPage(displayPage + 1))}
              >
                <ChevronLeft size={14} />
              </ActionIcon>
              {pageButtons.map((btn, i) =>
                btn === '…' ? (
                  <Text key={`ellipsis-${i}`} size="sm" c="dimmed" px={4}>…</Text>
                ) : (
                  <UnstyledButton
                    key={btn}
                    onClick={() => setPage(toInternalPage(btn as number))}
                    className="flex h-7 w-8 items-center justify-center rounded text-sm transition-colors"
                    style={{
                      border: '1px solid',
                      borderColor: displayPage === btn ? 'var(--mantine-color-brand-6)' : 'transparent',
                      backgroundColor: displayPage === btn ? 'var(--mantine-color-brand-6)' : 'transparent',
                      color: displayPage === btn ? '#fff' : 'var(--mantine-color-dimmed)',
                      fontWeight: displayPage === btn ? 700 : 400,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {btn as number}
                  </UnstyledButton>
                ),
              )}
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                disabled={displayPage <= 1}
                onClick={() => setPage(toInternalPage(displayPage - 1))}
              >
                <ChevronRight size={14} />
              </ActionIcon>
            </div>
          )}
        </div>
      </Paper>

      <ConfirmDialog
        open={deleteOpen}
        title="Patient löschen?"
        message={`Sind Sie sicher, dass Sie den Patienten "${deleteTarget?.patient_id}" löschen möchten? Die Daten werden gelöscht — stellen Sie sicher, dass alle Audiodateien bereits auf den verschlüsselten lokalen Server übertragen wurden.`}
        confirmLabel="Löschen"
        confirmColor="red"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={selectedIds.size > 1 ? 'Ausgewählte Patienten löschen?' : 'Ausgewählten Patienten löschen?'}
        message={`Möchten Sie ${selectedIds.size > 1 ? `die ${selectedIds.size} ausgewählten Patienten` : 'den ausgewählten Patienten'} löschen? Die Daten werden gelöscht — stellen Sie sicher, dass alle Audiodateien bereits auf den verschlüsselten lokalen Server übertragen wurden.`}
        confirmLabel={selectedIds.size > 1 ? `Alle (${selectedIds.size}) löschen` : 'Löschen'}
        confirmColor="red"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </>
  );
}

function PatientStatusCell({ patient }: { patient: Patient }) {
  const { status, current_post_op_session_number: sessionNum } = patient;
  const showLock = status === 'PRE_OP_DONE' || status === 'POST_OP_DONE';

  let badge: ReactNode;
  if (sessionNum != null && sessionNum >= 2 && status === 'POST_OP_STARTED') {
    badge = <FollowUpBadge sessionNumber={sessionNum - 1} complete={false} />;
  } else if (sessionNum != null && sessionNum >= 2 && status === 'POST_OP_DONE') {
    badge = <FollowUpBadge sessionNumber={sessionNum - 1} complete />;
  } else {
    badge = <StatusBadge status={status as PatientStatus} />;
  }

  return (
    <span className="inline-flex items-center justify-center gap-2">
      {badge}
      {showLock && <Lock size={13} color="var(--mantine-color-yellow-6)" />}
    </span>
  );
}

function SortHeader({
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
  const active = orderBy === field;
  return (
    <Table.Th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
      <UnstyledButton
        onClick={() => onSort(field)}
        className="mx-auto flex items-center gap-1 text-xs font-semibold uppercase tracking-wider"
        style={{ color: active ? 'var(--mantine-color-text)' : 'var(--mantine-color-dimmed)' }}
      >
        {label}
        {active &&
          (order === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </UnstyledButton>
    </Table.Th>
  );
}
