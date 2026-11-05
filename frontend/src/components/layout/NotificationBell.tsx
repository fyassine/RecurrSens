import { useMemo } from 'react';
import { ActionIcon, Indicator, Popover, ScrollArea, Text, useMantineTheme } from '@mantine/core';
import { Bell, Activity } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';

function formatTime(dateStr: string): string {
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

/** Bell + recent-activity popover. `tone="dark"` for use on dark headers. */
export default function NotificationBell({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const theme = useMantineTheme();
  const { patients, notificationCount } = useAppData();
  const successColor = theme.colors.green[6];
  const errorColor = theme.colors.red[6];
  const infoColor = theme.colors.cyan[6];

  const activities = useMemo(() => {
    const nowMs = Date.now();
    const events: { text: React.ReactNode; time: string; dotColor: string; sort: number }[] = [];
    for (const pt of patients) {
      if (pt.status === 'POST_OP_DONE') {
        events.push({
          text: <>Patient <strong>{pt.patient_id}</strong> Post-OP abgeschlossen</>,
          time: formatTime(pt.updated_at),
          dotColor: successColor,
          sort: new Date(pt.updated_at).getTime(),
        });
      }
      if (pt.prediction_pre !== 'TODO') {
        events.push({
          text: <>KI-Prä-OP Vorhersage <strong>{pt.patient_id}</strong> bereit</>,
          time: formatTime(pt.updated_at),
          dotColor: infoColor,
          sort: new Date(pt.updated_at).getTime(),
        });
      }
      if (pt.deleted_at) {
        events.push({
          text: <>Patient <strong>{pt.patient_id}</strong> gelöscht</>,
          time: formatTime(pt.deleted_at),
          dotColor: errorColor,
          sort: new Date(pt.deleted_at).getTime(),
        });
      } else if (new Date(pt.expires_at).getTime() <= nowMs) {
        events.push({
          text: <>Ablaufdatum <strong>{pt.patient_id}</strong> überschritten</>,
          time: formatTime(pt.expires_at),
          dotColor: errorColor,
          sort: new Date(pt.expires_at).getTime(),
        });
      }
      events.push({
        text: <>Patient <strong>{pt.patient_id}</strong> angelegt</>,
        time: formatTime(pt.created_at),
        dotColor: infoColor,
        sort: new Date(pt.created_at).getTime(),
      });
    }
    return events.sort((a, b) => b.sort - a.sort).slice(0, 15);
  }, [patients, successColor, errorColor, infoColor]);

  return (
  <Popover position="bottom-end" shadow="lg" width={400} withArrow={false}>
    <Popover.Target>
      <ActionIcon variant="subtle" color={tone === 'dark' ? 'gray.0' : 'gray'} size="lg" title="Letzte Aktivität" aria-label="Letzte Aktivität" style={{ overflow: 'visible' }}>
        <Indicator
          label={notificationCount > 0 ? notificationCount : undefined}
          color="red"
          size={16}
          disabled={notificationCount === 0}
        >
          <Bell size={20} />
        </Indicator>
      </ActionIcon>
    </Popover.Target>
    <Popover.Dropdown p={0}>
      <div className="flex items-center gap-2 border-b border-[var(--mantine-color-default-border)] px-4 py-2.5">
        <Activity size={15} color={infoColor} />
        <Text fw={700} size="sm">Letzte Aktivität</Text>
      </div>
      <ScrollArea.Autosize mah={480} type="hover">
        <div className="p-1.5">
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
    </Popover.Dropdown>
  </Popover>
  );
}
