import { createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

export function createAppTheme(mode: PaletteMode) {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? '#5b8fd4' : '#1b3f6e',
        dark: isDark ? '#0f1824' : '#0f2240',
        light: isDark ? '#7aa8e0' : '#3a6fa8',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#b71c1c',
      },
      error: {
        main: isDark ? '#f87171' : '#dc2626',
      },
      warning: {
        main: isDark ? '#fbbf24' : '#d97706',
        dark: isDark ? '#92400e' : '#b45309',
        light: isDark ? '#451a03' : '#fef3c7',
      },
      success: {
        main: isDark ? '#4ade80' : '#16a34a',
        light: isDark ? '#14532d' : '#dcfce7',
      },
      info: {
        main: isDark ? '#22c4e8' : '#0ea5c9',
        light: isDark ? '#0e2d3d' : '#e0f5fb',
      },
      background: {
        default: isDark ? '#0f1824' : '#f0f4f8',
        paper: isDark ? '#162030' : '#ffffff',
      },
      divider: isDark ? '#243346' : '#dde5ef',
      text: {
        primary: isDark ? '#d4e0ee' : '#1a2435',
        secondary: isDark ? '#7a90a8' : '#5a6e85',
        disabled: isDark ? '#4a6078' : '#9aafc4',
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h5: { fontWeight: 600, letterSpacing: '-0.02em' },
      h6: { fontWeight: 600 },
      subtitle2: {
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: isDark ? '#7a90a8' : '#5a6e85',
        fontSize: '0.7rem',
      },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, boxShadow: 'none' },
          contained: {
            '&:hover': { boxShadow: 'none' },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${isDark ? '#243346' : '#dde5ef'}` },
          head: {
            fontWeight: 600,
            backgroundColor: isDark ? '#1c2a3e' : '#f0f4f8',
            color: isDark ? '#7a90a8' : '#5a6e85',
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { boxShadow: isDark ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)' },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500 },
        },
      },
    },
  });
}
