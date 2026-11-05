import { LogOut } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Topbar from './Topbar';
import { NAV_ITEMS, isNavActive } from './navItems';
import { useShellActions } from './useShellActions';
import NavLinkItem from './NavLinkItem';

/** Slim top bar plus a floating bottom dock for navigation. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { logout } = useShellActions();

  return (
    <div
      className="grid h-dvh"
      style={{
        gridTemplateRows: '56px 1fr',
        gridTemplateAreas: '"topbar" "main"',
        ['--shell-extra' as string]: '80px',
      }}
    >
      <Topbar />
      <main className="min-w-0 overflow-auto bg-[var(--mantine-color-body)] p-4 pb-28 md:p-6 md:pb-28" style={{ gridArea: 'main' }}>
        {children}
      </main>

      <nav
        aria-label="Hauptnavigation"
        className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-brand-900/95 p-1.5 text-white shadow-xl backdrop-blur"
      >
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item.matchPrefixes);
          return (
            <NavLinkItem
              key={item.path}
              to={item.path}
              icon={item.icon}
              label={item.label}
              active={active}
              hideLabelOnSmall
              className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium no-underline transition-colors ${
                active ? 'bg-white/20 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            />
          );
        })}
        <span className="mx-1 h-6 w-px bg-white/20" aria-hidden="true" />
        <button
          type="button"
          onClick={logout}
          aria-label="Abmelden"
          title="Abmelden"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-white/75 hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} />
        </button>
      </nav>
    </div>
  );
}
