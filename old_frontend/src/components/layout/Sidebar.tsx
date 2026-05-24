import { Box, Typography } from '@mui/material';
import GridViewIcon from '@mui/icons-material/GridView';
import BarChartIcon from '@mui/icons-material/BarChart';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearTokens } from '../../api/client';

function WaveLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="RecurrSens">
      <defs>
        <radialGradient id="bSB" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5ff0e8" stopOpacity="0.42"/>
          <stop offset="55%" stopColor="#1ec8c8" stopOpacity="0.14"/>
          <stop offset="100%" stopColor="#1ec8c8" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="tSB" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a0fdf8"/>
          <stop offset="100%" stopColor="#17b8c0"/>
        </linearGradient>
        <filter id="gSB" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.65" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <ellipse cx="12" cy="12" rx="11" ry="11" fill="url(#bSB)"/>
      <path d="M17,10V6a2,2,0,0,0-2.109-2A2.118,2.118,0,0,0,13,6.17V18a4.017,4.017,0,0,1-1.246,2.9A3.968,3.968,0,0,1,9,22c-.071,0-.143,0-.215,0A4.089,4.089,0,0,1,5,17.83V14a1,1,0,0,0-1-1H3a1,1,0,0,1,0-2H4a3,3,0,0,1,3,3v3.83A2.118,2.118,0,0,0,8.891,20,2,2,0,0,0,11,18V6.17a4.089,4.089,0,0,1,3.787-4.165A4,4,0,0,1,19,6v4a1,1,0,0,0,1,1h1a1,1,0,0,1,0,2H20A3,3,0,0,1,17,10Z" fill="url(#tSB)" filter="url(#gSB)"/>
    </svg>
  );
}

const NAV_ITEMS = [
  { label: 'Übersicht', icon: <GridViewIcon sx={{ fontSize: 18 }} />, path: '/', matchPrefixes: ['/', '/details/'] },
  { label: 'Analytik', icon: <BarChartIcon sx={{ fontSize: 18 }} />, path: '/analytik', matchPrefixes: ['/analytik'] },
  { label: 'Einstellungen', icon: <SettingsIcon sx={{ fontSize: 18 }} />, path: '/einstellungen', matchPrefixes: ['/einstellungen'] },
];

function NavItem({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        width: '100%',
        px: 1.5,
        py: 1,
        borderRadius: 1,
        border: 'none',
        bgcolor: active ? 'rgba(255,255,255,0.15)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
        mb: '2px',
        position: 'relative',
        textAlign: 'left',
        fontSize: '0.875rem',
        fontWeight: 500,
        fontFamily: 'inherit',
        transition: 'background 0.15s, color 0.15s',
        '&:hover': {
          bgcolor: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
          color: '#fff',
        },
        '&::before': active
          ? {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 4,
              bottom: 4,
              width: 3,
              bgcolor: 'info.main',
              borderRadius: '0 3px 3px 0',
            }
          : {},
      }}
    >
      {icon}
      <Typography component="span" fontSize="inherit" fontWeight="inherit" color="inherit">
        {label}
      </Typography>
    </Box>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

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
    navigate('/login', { replace: true });
  };

  return (
    <Box
      sx={{
        gridArea: 'sidebar',
        bgcolor: 'primary.dark',
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        position: 'sticky',
        top: 0,
        overflow: 'hidden',
        zIndex: 30,
      }}
    >
      {/* Brand */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 2,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}
      >
        <WaveLogo size={36} />
        <Box>
          <Typography
            sx={{
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.9375rem',
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
            }}
          >
            RecurrSens
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', mt: '-1px' }}>
            MRI
          </Typography>
        </Box>
      </Box>

      {/* Nav */}
      <Box sx={{ flex: 1, px: 1, py: 2, overflowY: 'auto' }}>
        <Typography
          sx={{
            fontSize: '0.6rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)',
            px: 1.5,
            pb: 1,
          }}
        >
          Klinik
        </Typography>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={isActive(item.matchPrefixes)}
            onClick={() => navigate(item.path)}
          />
        ))}
      </Box>

      {/* Footer */}
      <Box sx={{ px: 1, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <NavItem icon={<LogoutIcon sx={{ fontSize: 18 }} />} label="Abmelden" active={false} onClick={handleLogout} />
      </Box>
    </Box>
  );
}
