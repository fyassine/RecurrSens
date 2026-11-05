import Breadcrumb from './Breadcrumb';
import NotificationBell from './NotificationBell';
import ColorSchemeToggle from './ColorSchemeToggle';

export default function Topbar() {
  return (
    <header
      className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-[var(--mantine-color-default-border)] bg-[var(--mantine-color-body)] px-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      style={{ gridArea: 'topbar' }}
    >
      <Breadcrumb />
      <NotificationBell />
      <ColorSchemeToggle />
    </header>
  );
}
