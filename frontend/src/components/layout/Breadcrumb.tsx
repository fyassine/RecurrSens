import { Text } from '@mantine/core';
import { useLocation, useParams } from 'react-router-dom';
import { useShellActions } from './useShellActions';

function getBreadcrumb(pathname: string, patientLabel?: string, token?: string): string {
  if (pathname === '/') return 'Übersicht';
  if (pathname.startsWith('/details/')) {
    const label = patientLabel || token;
    return label ? `Übersicht / ${label}` : 'Übersicht';
  }
  if (pathname.startsWith('/analytik')) return 'Analytik';
  if (pathname.startsWith('/einstellungen')) return 'Einstellungen';
  return 'Übersicht';
}

export default function Breadcrumb() {
  const location = useLocation();
  const { token } = useParams<{ token?: string }>();
  const { centerLabel } = useShellActions();
  const patientLabel = (location.state as { patientLabel?: string } | null)?.patientLabel;
  const parts = getBreadcrumb(location.pathname, patientLabel, token).split(' / ');

  return (
    <nav aria-label="Breadcrumb" className="flex flex-1 items-center gap-1.5">
      <Text size="sm" c="dimmed">{centerLabel}</Text>
      {parts.map((part, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Text size="sm" c="dimmed">/</Text>
          <Text size="sm" fw={i === parts.length - 1 ? 600 : 400} c={i === parts.length - 1 ? undefined : 'dimmed'}>
            {part}
          </Text>
        </div>
      ))}
    </nav>
  );
}
