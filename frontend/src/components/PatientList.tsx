import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Button,
  Checkbox,
  Loader,
  Menu,
  Select,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
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
import { StatusBadge, PostOpSessionBadge } from './Badges';
import { deletePatient, advancePatient, createSession, downloadPatientPdf, exportPatients } from '../api/client';
import { formatDate, formatDateTime, NO_RECORDING_DATE } from '../utils';
import ConfirmDialog from './ConfirmDialog';
import { useAppData } from '../context/AppDataContext';

export type DashboardFilter = 'ALL' | 'PRE_OP' | 'POST_OP' | 'RP' | 'OVERDUE_DELETE';

type SortKey = keyof Patient;
type Order = 'asc' | 'desc';

const FOOTER_TEXT = { fontSize: '0.8125rem', lineHeight: 1.25 } as const;

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
  const [pageIndex, setPageIndex] = useState(0);
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
    setPageIndex(0);
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
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const paginated = sorted.slice(safePageIndex * rowsPerPage, (safePageIndex + 1) * rowsPerPage);
  // page 1 = newest slice, page N = oldest slice; internal page index 0 (newest slice) → displayed as page 1
  const displayPage    = safePageIndex + 1;
  const toInternalPage = (d: number) => Math.max(0, Math.min(totalPages - 1, d - 1));

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
    setPageIndex(0);
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
      <div className="section">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--app-border)] px-3 py-2">
          <TextInput
            size="xs"
            placeholder="Patienten-ID suchen…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<Search size={14} />}
            className="max-w-[280px] flex-1"
            aria-label="Patienten-ID suchen"
          />
          {rpCount > 0 && activeFilter !== 'RP' && (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--app-danger)]">
              <AlertTriangle size={14} />
              {rpCount} mit RP-Vorhersage in dieser Ansicht
            </span>
          )}
          <div className="flex-1" />
          {canDelete && selectedIds.size > 0 && (
            <Button
              variant="outline"
              color="red"
              size="xs"
              leftSection={<Trash2 size={14} />}
              onClick={() => setBulkDeleteOpen(true)}
            >
              {selectedIds.size === 1 ? 'Löschen' : `Löschen (${selectedIds.size})`}
            </Button>
          )}
          {canExport && onExport && (
            <Button
              variant="default"
              size="xs"
              leftSection={<Download size={14} />}
              onClick={onExport}
              loading={exporting}
            >
              {exporting ? 'Exportiere…' : exportCount > 1 ? `Exportieren (${exportCount})` : 'Exportieren'}
            </Button>
          )}
        </div>

        {/* Table */}
        <Table.ScrollContainer minWidth={0} type="native" className="[&_tbody_tr:last-child]:border-b-0">
          <Table
            verticalSpacing={6}
            horizontalSpacing="sm"
            striped={false}
            highlightOnHover
            stickyHeader={false}
            fz={13}
          >
            <Table.Thead bg="var(--app-header-bg)">
              <Table.Tr>
                {canDelete && (
                  <Table.Th style={{ width: 40, textAlign: 'center' }}>
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
                {!canDelete && <Table.Th style={{ width: 40 }} />}
                <SortHeader label="Patienten-ID" field="patient_id" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortHeader label="Erstellt am" field="created_at" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortHeader label="Status" field="status" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortHeader label="Löschdatum" field="expires_at" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortHeader label="Aufnahmedatum" field="pre_op_date" orderBy={orderBy} order={order} onSort={handleSort} />
                <SortHeader label="Letzte Aktivität" field="last_activity" orderBy={orderBy} order={order} onSort={handleSort} />
                <Table.Th style={{ width: 120 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paginated.map((p) => {
                const isRP = p.prediction_pre === 'INFECTED' || p.prediction_post === 'INFECTED';
                const expiresAtMs = new Date(p.expires_at).getTime();
                const isExpired = !p.deleted_at && expiresAtMs <= nowMs;
                const isExpiringSoon = !isExpired && expiresAtMs <= warningThresholdMs;
                const expColor = p.deleted_at
                  ? 'var(--app-success)'
                  : isExpired || isExpiringSoon
                    ? 'var(--app-danger)'
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
                    <Table.Td>
                      <span className="id-text inline-flex items-center gap-2 font-semibold text-[var(--app-primary)]">
                        {p.patient_id}
                        {isRP && (
                          <span className="rounded-[2px] border border-[var(--app-danger)] px-1 text-[11px] font-semibold leading-4 text-[var(--app-danger)]">
                            RP
                          </span>
                        )}
                      </span>
                    </Table.Td>
                    <Table.Td className="tabular-nums" style={{ whiteSpace: 'nowrap' }}>{formatDate(p.created_at)}</Table.Td>
                    <Table.Td>
                      <PatientStatusCell patient={p} />
                    </Table.Td>
                    <Table.Td className="tabular-nums" style={{ whiteSpace: 'nowrap', color: expColor, fontWeight: p.deleted_at || isExpired ? 600 : 400 }}>
                      {p.deleted_at ? (
                        <span className="inline-flex items-center gap-1">
                          Gelöscht <Check size={14} />
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {formatDate(p.expires_at)}
                          {isExpired && <AlertTriangle size={14} color="var(--app-danger)" />}
                        </span>
                      )}
                    </Table.Td>
                    <Table.Td
                      className="tabular-nums"
                      style={{
                        whiteSpace: 'nowrap',
                        color: p.pre_op_date ? undefined : 'var(--mantine-color-dimmed)',
                      }}
                    >
                      {p.pre_op_date ? formatDateTime(p.pre_op_date) : NO_RECORDING_DATE}
                    </Table.Td>
                    <Table.Td className="tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(p.last_activity)}
                    </Table.Td>
                    <Table.Td style={{ width: 120 }} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Menu position="bottom-end" withinPortal onOpen={() => setMenuOpenId(p.id)} onClose={() => setMenuOpenId(null)}>
                          <Menu.Target>
                            <ActionIcon
                              aria-label={`Weitere Aktionen für Patient ${p.patient_id}`}
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
                                  <Check size={14} color="var(--app-success)" />
                                ) : (
                                  <Copy size={14} />
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
                              leftSection={<FileText size={14} />}
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
                            aria-label="Patienten-Aufnahme öffnen"
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
                              aria-label="Für Post-OP freischalten"
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
                          <Tooltip label="Neue Post-OP Sitzung starten">
                            <ActionIcon
                              aria-label="Neue Post-OP Sitzung starten"
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
                              aria-label="Patient löschen"
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
                  <Table.Td colSpan={8} align="center" py="lg">
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

        {/* Footer: pagination left, count + page size right. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--app-border)] bg-[var(--app-header-bg)] px-3 py-1.5">
          <div className="flex items-center gap-1">
            {totalPages > 1 && (
              <>
                <ActionIcon
                  aria-label="Vorherige Seite"
                  size="sm"
                  variant="subtle"
                  color="gray"
                  disabled={displayPage <= 1}
                  onClick={() => setPageIndex(toInternalPage(displayPage - 1))}
                >
                  <ChevronLeft size={14} />
                </ActionIcon>
                {pageButtons.map((btn, i) =>
                  btn === '…' ? (
                    <span key={`ellipsis-${i}`} className="px-1" style={{ ...FOOTER_TEXT, color: 'var(--mantine-color-dimmed)' }}>…</span>
                  ) : (
                    <UnstyledButton
                      key={btn}
                      onClick={() => setPageIndex(toInternalPage(btn as number))}
                      aria-current={displayPage === btn ? 'page' : undefined}
                      className="flex h-6 min-w-6 items-center justify-center rounded-[4px] px-1 transition-colors"
                      style={{
                        ...FOOTER_TEXT,
                        border: '1px solid',
                        borderColor: displayPage === btn ? 'var(--mantine-color-brand-filled)' : 'transparent',
                        backgroundColor: displayPage === btn ? 'var(--mantine-color-brand-filled)' : 'transparent',
                        color: displayPage === btn ? '#fff' : 'var(--mantine-color-dimmed)',
                        fontWeight: displayPage === btn ? 600 : 400,
                      }}
                    >
                      {btn as number}
                    </UnstyledButton>
                  ),
                )}
                <ActionIcon
                  aria-label="Nächste Seite"
                  size="sm"
                  variant="subtle"
                  color="gray"
                  disabled={displayPage >= totalPages}
                  onClick={() => setPageIndex(toInternalPage(displayPage + 1))}
                >
                  <ChevronRight size={14} />
                </ActionIcon>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-4">
            <span style={{ ...FOOTER_TEXT, color: 'var(--mantine-color-dimmed)' }}>
              {sorted.length} Patient{sorted.length !== 1 ? 'en' : ''}
            </span>
            <div className="flex items-center gap-2">
              <span style={{ ...FOOTER_TEXT, color: 'var(--mantine-color-dimmed)' }}>Zeilen:</span>
              <Select
                size="xs"
                w={72}
                aria-label="Einträge pro Seite"
                allowDeselect={false}
                data={PAGE_SIZE_OPTIONS.map((n) => String(n))}
                value={String(rowsPerPage)}
                onChange={(v) => {
                  if (!v) return;
                  const size = Number(v);
                  const newTotal = Math.max(1, Math.ceil(sorted.length / size));
                  setRowsPerPage(size);
                  setPageIndex((pi) => Math.min(pi, newTotal - 1));
                }}
              />
            </div>
          </div>
        </div>
      </div>

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
  if (sessionNum != null && status === 'POST_OP_STARTED') {
    badge = <PostOpSessionBadge sessionNumber={sessionNum} complete={false} />;
  } else if (sessionNum != null && status === 'POST_OP_DONE') {
    badge = <PostOpSessionBadge sessionNumber={sessionNum} complete />;
  } else {
    badge = <StatusBadge status={status as PatientStatus} />;
  }

  return (
    <span className="inline-flex items-center gap-2">
      {badge}
      {showLock && <Lock size={12} color="var(--app-warning)" aria-label="Gesperrt" />}
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
    <Table.Th style={{ whiteSpace: 'nowrap', textAlign: 'left' }}>
      <UnstyledButton
        onClick={() => onSort(field)}
        className="flex items-center gap-1"
        style={{
          // Inline: Mantine's unlayered UnstyledButton font-size beats Tailwind's layered utilities.
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: 0,
          textTransform: 'none',
          color: active ? 'var(--mantine-color-text)' : 'var(--mantine-color-dimmed)',
        }}
      >
        {label}
        {active &&
          (order === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </UnstyledButton>
    </Table.Th>
  );
}
