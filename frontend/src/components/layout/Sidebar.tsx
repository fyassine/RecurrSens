import { LayoutGrid, Settings, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { clearTokens } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';

function WaveLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="RecurrSens">
      <defs>
        <radialGradient id="bSB" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5ff0e8" stopOpacity="0.42" />
          <stop offset="55%" stopColor="#1ec8c8" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#1ec8c8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tSB" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a0fdf8" />
          <stop offset="100%" stopColor="#17b8c0" />
        </linearGradient>
        <filter id="gSB" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.65" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ellipse cx="12" cy="12" rx="11" ry="11" fill="url(#bSB)" />
      <path
        d="M17,10V6a2,2,0,0,0-2.109-2A2.118,2.118,0,0,0,13,6.17V18a4.017,4.017,0,0,1-1.246,2.9A3.968,3.968,0,0,1,9,22c-.071,0-.143,0-.215,0A4.089,4.089,0,0,1,5,17.83V14a1,1,0,0,0-1-1H3a1,1,0,0,1,0-2H4a3,3,0,0,1,3,3v3.83A2.118,2.118,0,0,0,8.891,20,2,2,0,0,0,11,18V6.17a4.089,4.089,0,0,1,3.787-4.165A4,4,0,0,1,19,6v4a1,1,0,0,0,1,1h1a1,1,0,0,1,0,2H20A3,3,0,0,1,17,10Z"
        fill="url(#tSB)"
        filter="url(#gSB)"
      />
    </svg>
  );
}

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
  const collapsed = !useMediaQuery('(min-width: 768px)', true);
  const { centerName, userRole, setCenterName, setUserRole } = useAppData();
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
      </div>
    </aside>
  );
}
