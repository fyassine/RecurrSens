import { useEffect, useState, useCallback } from 'react';
import {
  Badge,
  Group,
  Loader,
  ScrollArea,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  Clock,
  Plus,
  Upload,
  Download,
  Trash2,
  Eye,
  Pencil,
  Timer,
} from 'lucide-react';
import { getPatientActivity } from '../api/client';
import type { PatientActivityEvent, ActivityEventType } from '../types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return { date, time };
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const dateStr = d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  if (sameDay(d, today)) return `Heute — ${dateStr}`;
  if (sameDay(d, yesterday)) return `Gestern — ${dateStr}`;
  return dateStr;
}

// ─── Event type configuration ─────────────────────────────────────────────────

const EVENT_CONFIG: Record<
  ActivityEventType,
  { color: string; bg: string; icon: React.ReactNode; badgeColor: string; badgeLabel: string }
> = {
  create: {
    color: 'var(--mantine-color-blue-6)',
    bg: 'var(--mantine-color-blue-0)',
    icon: <Plus size={12} strokeWidth={2.5} />,
    badgeColor: 'blue',
    badgeLabel: 'Erstellt',
  },
  upload: {
    color: 'var(--mantine-color-green-7)',
    bg: 'var(--mantine-color-green-0)',
    icon: <Upload size={12} strokeWidth={2.5} />,
    badgeColor: 'green',
    badgeLabel: 'Upload',
  },
  export: {
    color: 'var(--mantine-color-orange-6)',
    bg: 'var(--mantine-color-orange-0)',
    icon: <Download size={12} strokeWidth={2.5} />,
    badgeColor: 'orange',
    badgeLabel: 'Export',
  },
  delete: {
    color: 'var(--mantine-color-red-7)',
    bg: 'var(--mantine-color-red-0)',
    icon: <Trash2 size={12} strokeWidth={2.5} />,
    badgeColor: 'red',
    badgeLabel: 'Löschung',
  },
  edit: {
    color: 'var(--mantine-color-yellow-7)',
    bg: 'var(--mantine-color-yellow-0)',
    icon: <Pencil size={12} strokeWidth={2.5} />,
    badgeColor: 'yellow',
    badgeLabel: 'Bearbeitet',
  },
  expiry: {
    color: 'var(--mantine-color-red-6)',
    bg: 'var(--mantine-color-red-0)',
    icon: <Timer size={12} strokeWidth={2.5} />,
    badgeColor: 'red',
    badgeLabel: 'System',
  },
  view: {
    color: 'var(--mantine-color-gray-6)',
    bg: 'var(--mantine-color-gray-1)',
    icon: <Eye size={12} strokeWidth={2.5} />,
    badgeColor: 'gray',
    badgeLabel: 'Zugriff',
  },
};

const FILTER_OPTIONS: { type: ActivityEventType | 'all'; label: string; icon?: React.ReactNode }[] = [
  { type: 'all', label: 'Alle' },
  { type: 'create', label: 'Erstellt', icon: <Plus size={10} strokeWidth={2.5} /> },
  { type: 'upload', label: 'Uploads', icon: <Upload size={10} strokeWidth={2.5} /> },
  { type: 'export', label: 'Exporte', icon: <Download size={10} strokeWidth={2.5} /> },
  { type: 'delete', label: 'Löschungen', icon: <Trash2 size={10} strokeWidth={2.5} /> },
  { type: 'edit', label: 'Bearbeitet', icon: <Pencil size={10} strokeWidth={2.5} /> },
  { type: 'expiry', label: 'Ablauf', icon: <Timer size={10} strokeWidth={2.5} /> },
];

// ─── Actor avatar ─────────────────────────────────────────────────────────────

function ActorAvatar({ actor, actorName }: { actor: string; actorName: string }) {
  const initial = actorName.charAt(0).toUpperCase();

  const bgMap: Record<string, string> = {
    admin: 'var(--mantine-color-brand-7)',
    patient: 'var(--mantine-color-green-7)',
    system: 'var(--mantine-color-gray-5)',
  };

  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: bgMap[actor] ?? 'var(--mantine-color-gray-5)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

// ─── Single timeline item ─────────────────────────────────────────────────────

function TimelineItem({ event, isLast }: { event: PatientActivityEvent; isLast: boolean }) {
  const cfg = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.view;
  const { date, time } = formatDateTime(event.timestamp);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '0 10px', position: 'relative' }}>
      {/* connector line */}
      {!isLast && (
        <div
          style={{
            position: 'absolute',
            left: 13,
            top: 28,
            bottom: -4,
            width: 2,
            background: 'var(--mantine-color-default-border)',
            zIndex: 0,
          }}
        />
      )}

      {/* dot */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: cfg.bg,
          color: cfg.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          zIndex: 1,
          border: '2px solid var(--mantine-color-body)',
          boxShadow: '0 0 0 1px var(--mantine-color-default-border)',
        }}
        aria-hidden
      >
        {cfg.icon}
      </div>

      {/* body */}
      <div style={{ paddingBottom: 12 }}>
        <div
          style={{
            background: 'var(--mantine-color-default-hover)',
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 8,
            padding: '8px 10px',
            transition: 'background 140ms ease',
            cursor: 'default',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-gray-0)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-default-hover)';
          }}
        >
          {/* top row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
            {/* left */}
            <div style={{ minWidth: 0 }}>
              <Text size="xs" fw={500} style={{ lineHeight: 1.3 }}>
                {event.event}
              </Text>
              {event.detail && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 6px', marginTop: 2 }}>
                  <Text size="xs" c="dimmed" style={{ fontSize: '0.7rem' }}>
                    {event.detail}
                  </Text>
                  <Badge size="xs" variant="light" color={cfg.badgeColor} style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                    {cfg.badgeLabel}
                  </Badge>
                </div>
              )}

              {/* file chips */}
              {event.files && event.files.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                  {event.files.map((f, i) => (
                    <span
                      key={i}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        background: 'var(--mantine-color-body)',
                        border: '1px solid var(--mantine-color-default-border)',
                        borderRadius: 3,
                        padding: '1px 5px',
                        fontSize: '0.66rem',
                        color: event.type === 'delete'
                          ? 'var(--mantine-color-red-6)'
                          : 'var(--mantine-color-dimmed)',
                      }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* right: timestamp + actor */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
              <Tooltip label={`${date}, ${time}`} withArrow position="left">
                <Text
                  size="xs"
                  c="dimmed"
                  style={{ fontSize: '0.67rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', cursor: 'default' }}
                >
                  {time}
                </Text>
              </Tooltip>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'var(--mantine-color-body)',
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 9999,
                  padding: '1px 6px 1px 2px',
                  fontSize: '0.67rem',
                }}
              >
                <ActorAvatar actor={event.actor} actorName={event.actor_name} />
                <Text
                  size="xs"
                  c="dimmed"
                  fw={500}
                  style={{ fontSize: '0.67rem', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {event.actor_name}
                </Text>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Date group divider ───────────────────────────────────────────────────────

function DateDivider({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '6px 0',
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'var(--mantine-color-default-border)' }} />
      <Text
        size="xs"
        c="dimmed"
        fw={600}
        style={{ fontSize: '0.68rem', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}
      >
        {label}
      </Text>
      <div style={{ flex: 1, height: 1, background: 'var(--mantine-color-default-border)' }} />
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: '0.69rem',
        padding: '3px 8px',
        borderRadius: 9999,
        border: `1px solid ${active ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-default-border)'}`,
        background: active ? 'var(--mantine-color-brand-0)' : 'var(--mantine-color-body)',
        color: active ? 'var(--mantine-color-brand-7)' : 'var(--mantine-color-dimmed)',
        cursor: 'pointer',
        transition: 'all 140ms ease',
        fontWeight: active ? 600 : 400,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PatientHistorySidebarProps {
  patientId: string;
  refreshTrigger?: string;
}

export default function PatientHistorySidebar({ patientId, refreshTrigger }: PatientHistorySidebarProps) {
  const [events, setEvents] = useState<PatientActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<ActivityEventType | 'all'>('all');

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPatientActivity(patientId);
      setEvents(data);
    } catch {
      // silently fail — timeline is supplementary information
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity, refreshTrigger]);

  const filtered = activeFilter === 'all'
    ? events
    : events.filter((e) => e.type === activeFilter);

  // Group into date buckets preserving chronological order
  const groups: { label: string; items: PatientActivityEvent[] }[] = [];
  for (const ev of filtered) {
    const label = formatDateLabel(ev.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(ev);
    } else {
      groups.push({ label, items: [ev] });
    }
  }

  return (
    <div
      className="w-full md:w-[360px]"
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          background: 'var(--mantine-color-body)',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 80,
          maxHeight: 'calc(100vh - 100px)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px 10px',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Group gap="xs" mb={10}>
            <Clock size={15} color="var(--mantine-color-brand-7)" />
            <Title order={6} style={{ fontSize: '0.8125rem' }}>
              Patientenhistorie
            </Title>
          </Group>

          {/* Filter pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {FILTER_OPTIONS.map((opt) => (
              <FilterPill
                key={opt.type}
                active={activeFilter === opt.type}
                onClick={() => setActiveFilter(opt.type)}
                icon={opt.icon}
                label={opt.label}
              />
            ))}
          </div>
        </div>

        {/* Timeline scroll area */}
        <ScrollArea.Autosize mah="calc(100vh - 200px)" type="hover">
          <div style={{ padding: '12px 14px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                <Loader size="sm" />
              </div>
            ) : filtered.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="md">
                Keine Einträge gefunden.
              </Text>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <DateDivider label={group.label} />
                  {group.items.map((ev, idx) => (
                    <TimelineItem
                      key={ev.id}
                      event={ev}
                      isLast={idx === group.items.length - 1 && group === groups[groups.length - 1]}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </ScrollArea.Autosize>
      </div>
    </div>
  );
}
