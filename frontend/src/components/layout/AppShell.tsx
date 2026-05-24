import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid h-dvh [grid-template-columns:60px_1fr] md:[grid-template-columns:240px_1fr]"
      style={{
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
