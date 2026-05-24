import { useMemo } from 'react';
import { Paper, ScrollArea, Text, useMantineTheme } from '@mantine/core';
import { Calendar, Activity } from 'lucide-react';
import type { Patient } from '../types';

function PanelCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: string;
}) {
  return (
    <Paper withBorder radius="md" className="overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-[var(--mantine-color-default-border)] px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex text-cyan-500">{icon}</div>
          <Text fw={700} size="sm">{title}</Text>
        </div>
        {action && (
          <Text size="xs" fw={600} c="cyan" className="cursor-pointer hover:underline">
            {action}
          </Text>
        )}
      </div>
      {children}
    </Paper>
  );
}

function formatActivityTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  if (date >= todayStart) {
    return `Heute, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (date >= yesterdayStart) {
    return `Gestern, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface ActivityEvent {
  text: React.ReactNode;
  time: string;
  dotColor: string;
  sortDate: Date;
}

export default function RightPanel({ patients }: { patients: Patient[] }) {
  const theme = useMantineTheme();
  const nowMs = Date.now();
  const weekMs = 7 * 86400000;

  const success = theme.colors.green[6];
  const warning = theme.colors.yellow[6];
  const error = theme.colors.red[6];
  const info = theme.colors.cyan[6];

  const expiryStats = useMemo(() => {
    const active = patients.filter((p) => !p.deleted_at);
    return {
      expired: active.filter((p) => new Date(p.expires_at).getTime() <= nowMs).length,
      thisWeek: active.filter((p) => {
        const t = new Date(p.expires_at).getTime();
        return t > nowMs && t <= nowMs + weekMs;
      }).length,
      nextWeek: active.filter((p) => {
        const t = new Date(p.expires_at).getTime();
        return t > nowMs + weekMs && t <= nowMs + 2 * weekMs;
      }).length,
      valid: active.filter((p) => new Date(p.expires_at).getTime() > nowMs + 2 * weekMs).length,
    };
  }, [patients, nowMs, weekMs]);

  const activities = useMemo((): ActivityEvent[] => {
    const events: ActivityEvent[] = [];

    for (const p of patients) {
      if (p.status === 'POST_OP_DONE') {
        events.push({
          text: <>Patient <strong>{p.patient_id}</strong> Post-OP abgeschlossen</>,
          time: formatActivityTime(p.updated_at),
          dotColor: success,
          sortDate: new Date(p.updated_at),
        });
      }
      if (p.prediction_pre !== 'TODO') {
        events.push({
          text: <>KI-Prä-OP Vorhersage <strong>{p.patient_id}</strong> bereit</>,
          time: formatActivityTime(p.updated_at),
          dotColor: info,
          sortDate: new Date(p.updated_at),
        });
      }
      if (p.deleted_at) {
        events.push({
          text: <>Patient <strong>{p.patient_id}</strong> gelöscht</>,
          time: formatActivityTime(p.deleted_at),
          dotColor: error,
          sortDate: new Date(p.deleted_at),
        });
      }
      if (!p.deleted_at && new Date(p.expires_at).getTime() <= nowMs) {
        events.push({
          text: <>Ablaufdatum <strong>{p.patient_id}</strong> überschritten</>,
          time: formatActivityTime(p.expires_at),
          dotColor: error,
          sortDate: new Date(p.expires_at),
        });
      }
      events.push({
        text: <>Patient <strong>{p.patient_id}</strong> angelegt</>,
        time: formatActivityTime(p.created_at),
        dotColor: info,
        sortDate: new Date(p.created_at),
      });
    }

    return events.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime()).slice(0, 8);
  }, [patients, nowMs, success, info, error]);

  const expiryRows = [
    { label: 'Bereits abgelaufen', count: expiryStats.expired, color: error },
    { label: 'Läuft diese Woche ab', count: expiryStats.thisWeek, color: warning },
    { label: 'Läuft nächste Woche ab', count: expiryStats.nextWeek, color: warning },
    { label: 'Aktiv & gültig', count: expiryStats.valid, color: success },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PanelCard title="Ablaufdaten" icon={<Calendar size={15} />} action="Details">
        <div className="px-4">
          {expiryRows.map((row, i) => (
            <div
              key={row.label}
              className={[
                'flex items-center justify-between py-2',
                i < expiryRows.length - 1 ? 'border-b border-[var(--mantine-color-default-border)]' : '',
              ].join(' ')}
            >
              <Text size="sm" c="dimmed">{row.label}</Text>
              <Text
                size="sm"
                fw={700}
                style={{
                  color: row.count > 0 ? row.color : undefined,
                  fontVariantNumeric: 'tabular-nums',
                }}
                c={row.count > 0 ? undefined : 'dimmed'}
              >
                {row.count}
              </Text>
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard title="Letzte Aktivität" icon={<Activity size={15} />} action="Alle">
        <ScrollArea.Autosize mah={260} type="hover">
          <div className="p-1">
            {activities.length === 0 ? (
              <Text size="sm" c="dimmed" p="sm">Keine Aktivitäten vorhanden.</Text>
            ) : (
              activities.map((ev, i) => (
                <div key={i} className="flex gap-3 rounded p-2 hover:bg-[var(--mantine-color-default-hover)]">
                  <div
                    className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ backgroundColor: ev.dotColor }}
                  />
                  <div className="min-w-0 flex-1">
                    <Text size="xs" lh={1.4}>{ev.text}</Text>
                    <Text size="xs" c="dimmed" mt={1}>{ev.time}</Text>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea.Autosize>
      </PanelCard>
    </div>
  );
}
