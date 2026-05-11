import { Box } from '@mui/material';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        gridTemplateRows: '56px 1fr',
        gridTemplateAreas: '"sidebar topbar" "sidebar main"',
        height: '100dvh',
      }}
    >
      <Sidebar />
      <Topbar />
      <Box
        component="main"
        sx={{
          gridArea: 'main',
          overflow: 'auto',
          bgcolor: 'background.default',
          p: { xs: 2, md: 3 },
          minWidth: 0,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
