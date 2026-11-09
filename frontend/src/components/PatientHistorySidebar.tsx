import { useEffect, useState, useCallback } from 'react';
import { Loader } from '@mantine/core';
import { getPatientActivity } from '../api/client';
import type { PatientActivityEvent, ActivityEventType } from '../types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
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

  const dateStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (sameDay(d, today)) return `Heute — ${dateStr}`;
  if (sameDay(d, yesterday)) return `Gestern — ${dateStr}`;
  return dateStr;
}

// ─── Event categories ─────────────────────────────────────────────────────────
// System events, user actions and file operations are told apart by marker
// shape (diamond / circle / square) and an explicit category word, not by
// decorative colored badges. Color is reserved for outcome (success/danger).

type Category = 'system' | 'user' | 'file';

const CATEGORY_LABEL: Record<Category, string> = {
  system: 'System',
  user: 'Benutzer',
  file: 'Datei',
};

const EVENT_CONFIG: Record<ActivityEventType, { category: Category; color: string }> = {
  create: { category: 'user', color: 'var(--app-primary)' },
  edit: { category: 'user', color: 'var(--app-warning)' },
  view: { category: 'user', color: 'var(--app-text-secondary)' },
  upload: { category: 'file', color: 'var(--app-success)' },
  export: { category: 'file', color: 'var(--app-primary)' },
  delete: { category: 'file', color: 'var(--app-danger)' },
  expiry: { category: 'system', color: 'var(--app-danger)' },
};

const FALLBACK_CONFIG = EVENT_CONFIG.view;

const FILTER_OPTIONS: { type: ActivityEventType | 'all'; label: string }[] = [
  { type: 'all', label: 'Alle' },
  { type: 'create', label: 'Erstellt' },
  { type: 'upload', label: 'Uploads' },
  { type: 'export', label: 'Exporte' },
  { type: 'delete', label: 'Löschungen' },
  { type: 'edit', label: 'Bearbeitet' },
  { type: 'expiry', label: 'Ablauf' },
  { type: 'view', label: 'Zugriffe' },
];

function Marker({ category, color }: { category: Category; color: string }) {
  const base = { width: 9, height: 9, background: color, display: 'block' } as const;
  if (category === 'file') return <span aria-hidden style={{ ...base, borderRadius: 1 }} />;
  if (category === 'system') return <span aria-hidden style={{ ...base, transform: 'rotate(45deg)', width: 8, height: 8, borderRadius: 1 }} />;
  return <span aria-hidden style={{ ...base, borderRadius: '50%' }} />;
}

// ─── Single timeline row ──────────────────────────────────────────────────────

function TimelineItem({ event, isLast }: { event: PatientActivityEvent; isLast: boolean }) {
  const cfg = EVENT_CONFIG[event.type] ?? FALLBACK_CONFIG;
  const time = formatTime(event.timestamp);

  return (
    <div className="relative grid grid-cols-[16px_minmax(0,1fr)_auto] gap-x-2 pb-3">
      {!isLast && (
        <span
          aria-hidden
          className="absolute bottom-0 left-[7px] top-4 w-px bg-[var(--app-border)]"
        />
      )}
      <span className="relative z-[1] mt-[5px] flex h-3 w-4 items-center justify-center bg-[var(--app-surface)]">
        <Marker category={cfg.category} color={cfg.color} />
      </span>

      <div className="min-w-0">
        <div className="text-[13px] font-medium leading-snug">{event.event}</div>
        {event.detail && (
          <div className="text-xs leading-snug text-[var(--app-text-secondary)]">{event.detail}</div>
        )}
        {event.files && event.files.length > 0 && (
          <ul className="m-0 mt-0.5 list-none p-0 text-xs leading-snug text-[var(--app-text-secondary)]">
            {event.files.map((f, i) => (
              <li
                key={i}
                className="truncate"
                style={{ color: event.type === 'delete' ? 'var(--app-danger)' : undefined }}
              >
                {f}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-0.5 text-[11px] text-[var(--app-text-secondary)]">
          {CATEGORY_LABEL[cfg.category]} · {event.actor_name}
        </div>
      </div>

      <time dateTime={event.timestamp} className="pt-px text-xs tabular-nums text-[var(--app-text-secondary)]">
        {time}
      </time>
    </div>
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

  const filtered = activeFilter === 'all' ? events : events.filter((e) => e.type === activeFilter);

  // Group into date buckets preserving chronological order
  const groups: { label: string; items: PatientActivityEvent[] }[] = [];
  for (const ev of filtered) {
    const label = formatDateLabel(ev.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(ev);
    else groups.push({ label, items: [ev] });
  }

  return (
    <aside
      className="section min-w-0"
      aria-label="Patientenhistorie"
    >
      <div className="section-header flex-col items-stretch gap-1.5 py-2">
        <h2 className="section-title m-0 text-left">Patientenhistorie</h2>
        <div role="tablist" aria-label="Verlauf filtern" className="-mx-1 flex flex-wrap gap-x-1 gap-y-0.5">
          {FILTER_OPTIONS.map((opt) => {
            const active = activeFilter === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveFilter(opt.type)}
                className="cursor-pointer whitespace-nowrap border-0 border-b-2 border-solid bg-transparent px-1 py-0.5 text-xs"
                style={{
                  borderBottomColor: active ? 'var(--app-primary)' : 'transparent',
                  color: active ? 'var(--app-primary)' : 'var(--app-text-secondary)',
                  fontWeight: active ? 600 : 400,
                  font: 'inherit',
                  fontSize: 12,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="px-3 py-2">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader size="sm" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="m-0 py-3 text-xs text-[var(--app-text-secondary)]">Keine Einträge gefunden.</p>
          ) : (
            groups.map((group, gi) => (
              <div key={group.label}>
                <div className="mb-1.5 mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--app-text-secondary)]">
                  {group.label}
                </div>
                {group.items.map((ev, idx) => (
                  <TimelineItem
                    key={ev.id}
                    event={ev}
                    isLast={idx === group.items.length - 1 && gi === groups.length - 1}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
