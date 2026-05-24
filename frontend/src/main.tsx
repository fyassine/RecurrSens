import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import './index.css';
import { theme } from './theme';
import App from './App';

// Inject ColorSchemeScript into <head> at runtime so the initial color scheme
// is applied before paint (avoids FOUC).
const headScript = document.createElement('div');
document.head.appendChild(headScript);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ColorSchemeScript defaultColorScheme="auto" />
      <ModalsProvider>
        <Notifications position="top-right" />
        <App />
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
