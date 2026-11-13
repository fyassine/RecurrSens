import { LayoutGrid, Settings, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import WaveLogo from '../WaveLogo';
import { clearTokens } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';

const NAV_ITEMS = [
  { label: 'Übersicht', icon: LayoutGrid, path: '/', matchPrefixes: ['/', '/details/'] },
  { label: 'Einstellungen', icon: Settings, path: '/einstellungen', matchPrefixes: ['/einstellungen'] },
];

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  collapsed = false,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative mb-0.5 flex w-full items-center rounded-md border-0 py-2 text-left text-sm font-medium transition-colors cursor-pointer',
        collapsed ? 'justify-center px-0' : 'gap-3 px-3',
        active
          ? 'bg-white/15 text-white'
          : 'bg-transparent text-white/70 hover:bg-white/10 hover:text-white',
      ].join(' ')}
    >
      {active && (
        <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-cyan-400" aria-hidden />
      )}
      <Icon size={18} />
      {!collapsed && <span>{label}</span>}
    </button>
  );
  return collapsed ? (
    <Tooltip label={label} position="right" withArrow>
      {btn}
    </Tooltip>
  ) : btn;
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 768px)', true);
  const { centerName, userRole, setCenterName, setUserRole, sidebarCollapsed, setSidebarCollapsed } = useAppData();
  const collapsed = !isDesktop || sidebarCollapsed;
  const centerLabel = centerName ?? (userRole === 'SUPER_ADMIN' ? 'Alle Zentren' : '');

  const isActive = (prefixes: string[]) =>
    prefixes.some((prefix) =>
      prefix.endsWith('/') && prefix !== '/'
        ? location.pathname.startsWith(prefix)
        : prefix === '/'
          ? location.pathname === '/' || location.pathname.startsWith('/details/')
          : location.pathname.startsWith(prefix),
    );

  const handleLogout = () => {
    clearTokens();
    setUserRole('SUPER_ADMIN');
    setCenterName(null);
    navigate('/login', { replace: true });
  };

  return (
    <aside
      className="sticky top-0 z-30 flex h-dvh flex-col overflow-hidden bg-brand-900"
      style={{ gridArea: 'sidebar' }}
    >
      {/* Brand */}
      <div className={`flex flex-shrink-0 items-center border-b border-white/10 py-4 ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}>
        <WaveLogo size={36} />
        {!collapsed && (
          <div>
            <div className="text-[0.9375rem] font-bold leading-tight tracking-tight text-white">
              RecurrSens
            </div>
            <div className="-mt-px text-[0.7rem] text-white/50">{centerLabel}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 py-4">
        {!collapsed && (
          <div className="px-3 pb-2 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-white/35">
            Klinik
          </div>
        )}
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={isActive(item.matchPrefixes)}
            onClick={() => navigate(item.path)}
            collapsed={collapsed}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-white/10 px-2 py-2">
        <NavItem icon={LogOut} label="Abmelden" active={false} onClick={handleLogout} collapsed={collapsed} />
        {isDesktop && (
          <NavItem
            icon={sidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
            label={sidebarCollapsed ? 'Sidebar einblenden' : 'Sidebar einklappen'}
            active={false}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            collapsed={collapsed}
          />
        )}
      </div>
    </aside>
  );
}
