import { useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Card,
  Collapse,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  User as UserIcon,
  Globe,
  History,
  Building2,
  Mail,
  CalendarDays,
  Clock,
  MapPin,
  Monitor,
  Smartphone,
  Tablet,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getAccountInfo, type AccountInfo, type DeviceInfo } from '../api/client';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function DeviceIcon({
  deviceType,
  size,
  className,
}: {
  deviceType: string;
  size?: number;
  className?: string;
}) {
  switch (deviceType) {
    case 'Desktop':
      return <Monitor size={size} className={className} />;
    case 'Mobil':
      return <Smartphone size={size} className={className} />;
    case 'Tablet':
      return <Tablet size={size} className={className} />;
    default:
      return <HelpCircle size={size} className={className} />;
  }
}

function DeviceLabel({ info }: { info: DeviceInfo }) {
  const browser = info.browser
    ? `${info.browser}${info.browser_version ? ` ${info.browser_version}` : ''}`
    : 'Unbekannter Browser';
  const os = info.os ? `${info.os}${info.os_version ? ` ${info.os_version}` : ''}` : 'Unbekanntes System';

  return (
    <Group gap="xs" wrap="nowrap">
      <DeviceIcon deviceType={info.device_type} size={16} className="shrink-0 text-[var(--mantine-color-dimmed)]" />
      <Text size="sm">
        {browser} · {os}
      </Text>
    </Group>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card withBorder radius="md" padding="lg">
      <Group gap="xs" mb="md">
        <div className="flex rounded-md bg-cyan-500/10 p-1.5 text-cyan-600">{icon}</div>
        <Title order={4}>{title}</Title>
      </Group>
      {children}
    </Card>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" py={6}>
      <Group gap="xs" wrap="nowrap">
        <div className="text-[var(--mantine-color-dimmed)]">{icon}</div>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      </Group>
      <div className="text-right">{value}</div>
    </Group>
  );
}

function AccountSection({ info }: { info: AccountInfo }) {
  const fullName = [info.first_name, info.last_name].filter(Boolean).join(' ');
  const initial = info.username.slice(0, 1).toUpperCase();
  const roleLabel = info.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Zentrum-Benutzer';
  const zentrum = info.center_name ?? (info.role === 'SUPER_ADMIN' ? 'Alle Zentren' : '—');

  return (
    <Stack gap="md">
      <Group gap="md">
        <Avatar size={48} radius="xl" color="brand">
          {initial}
        </Avatar>
        <div>
          <Text fw={700} size="md">
            {fullName || info.username}
          </Text>
          <Text size="xs" c="dimmed">
            @{info.username}
          </Text>
        </div>
        <Badge color={info.role === 'SUPER_ADMIN' ? 'cyan' : 'gray'} variant="light" ml="auto">
          {roleLabel}
        </Badge>
      </Group>

      <Stack gap={2}>
        <InfoRow
          icon={<Mail size={16} />}
          label="E-Mail"
          value={<Text size="sm">{info.email || '—'}</Text>}
        />
        <InfoRow
          icon={<Building2 size={16} />}
          label="Zentrum"
          value={<Text size="sm">{zentrum}</Text>}
        />
        <InfoRow
          icon={<CalendarDays size={16} />}
          label="Mitglied seit"
          value={<Text size="sm">{formatDate(info.date_joined)}</Text>}
        />
      </Stack>
    </Stack>
  );
}

function CurrentSessionSection({ info }: { info: AccountInfo }) {
  const [showAgent, setShowAgent] = useState(false);
  const session = info.current_session;

  return (
    <Stack gap={2}>
      <InfoRow
        icon={<Clock size={16} />}
        label="Letzter Login"
        value={<Text size="sm">{formatDateTime(info.last_login)}</Text>}
      />
      <InfoRow
        icon={<MapPin size={16} />}
        label="IP-Adresse"
        value={<Text size="sm">{session.ip_address ?? '—'}</Text>}
      />
      <InfoRow
        icon={<Monitor size={16} />}
        label="Gerät"
        value={<DeviceLabel info={session} />}
      />

      <UnstyledButton
        onClick={() => setShowAgent((v) => !v)}
        className="mt-1 flex items-center gap-1 text-xs text-[var(--mantine-color-dimmed)] hover:text-[var(--mantine-color-text)]"
      >
        {showAgent ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        User-Agent {showAgent ? 'ausblenden' : 'anzeigen'}
      </UnstyledButton>
      <Collapse in={showAgent}>
        <Text
          ff="monospace"
          size="xs"
          c="dimmed"
          className="mt-2 break-all rounded-md bg-[var(--mantine-color-default-hover)] p-2"
        >
          {session.user_agent || '—'}
        </Text>
      </Collapse>
    </Stack>
  );
}

function LoginHistoryTable({ entries }: { entries: AccountInfo['login_history'] }) {
  if (entries.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Noch keine Anmeldungen aufgezeichnet.
      </Text>
    );
  }

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Zeitpunkt</Table.Th>
            <Table.Th>IP-Adresse</Table.Th>
            <Table.Th>Browser</Table.Th>
            <Table.Th>Betriebssystem</Table.Th>
            <Table.Th>Gerät</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((entry, i) => (
            <Table.Tr key={i}>
              <Table.Td>{formatDateTime(entry.created_at)}</Table.Td>
              <Table.Td>{entry.ip_address ?? '—'}</Table.Td>
              <Table.Td>
                {entry.browser ? `${entry.browser} ${entry.browser_version ?? ''}`.trim() : '—'}
              </Table.Td>
              <Table.Td>
                {entry.os ? `${entry.os} ${entry.os_version ?? ''}`.trim() : '—'}
              </Table.Td>
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <DeviceIcon deviceType={entry.device_type} size={14} className="text-[var(--mantine-color-dimmed)]" />
                  {entry.device_type}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export default function EinstellungenPage() {
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAccountInfo()
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setError('Konto-Informationen konnten nicht geladen werden.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-center">
        <Text c="red" size="sm">
          {error ?? 'Konto-Informationen konnten nicht geladen werden.'}
        </Text>
      </div>
    );
  }

  return (
    <Stack gap="lg" className="mx-auto max-w-3xl">
      <div>
        <Title order={3} fw={700} style={{ letterSpacing: '-0.02em' }}>
          Einstellungen
        </Title>
        <Text size="sm" c="dimmed">
          Konto- und Sicherheitsinformationen
        </Text>
      </div>

      <SectionCard icon={<UserIcon size={18} />} title="Konto">
        <AccountSection info={info} />
      </SectionCard>

      <SectionCard icon={<Globe size={18} />} title="Aktuelle Sitzung">
        <CurrentSessionSection info={info} />
      </SectionCard>

      <SectionCard icon={<History size={18} />} title="Anmeldeverlauf">
        <LoginHistoryTable entries={info.login_history} />
      </SectionCard>
    </Stack>
  );
}
