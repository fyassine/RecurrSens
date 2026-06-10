import { useMediaQuery } from '@mantine/hooks';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAppData } from '../../context/AppDataContext';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)', true);
  const { sidebarCollapsed } = useAppData();
  const sidebarWidth = isDesktop && !sidebarCollapsed ? '240px' : '60px';

  return (
    <div
      className="grid h-dvh transition-[grid-template-columns] duration-200 ease-in-out"
      style={{
        gridTemplateColumns: `${sidebarWidth} 1fr`,
        gridTemplateRows: '56px 1fr',
        gridTemplateAreas: '"sidebar topbar" "sidebar main"',
      }}
    >
      <Sidebar />
      <Topbar />
      <main
        className="overflow-auto bg-[var(--mantine-color-body)] p-4 md:p-6 min-w-0"
        style={{ gridArea: 'main' }}
      >
        {children}
      </main>
    </div>
  );
}
