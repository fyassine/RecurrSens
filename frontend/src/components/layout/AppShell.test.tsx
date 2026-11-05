import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';

vi.mock('../../api/client', () => ({ clearTokens: vi.fn() }));
import { clearTokens } from '../../api/client';

function renderShell(path = '/') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>Login-Seite</div>} />
          <Route path="*" element={<AppShell><div>Seiteninhalt</div></AppShell>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('AppShell (dock)', () => {
  beforeEach(() => vi.mocked(clearTokens).mockReset());

  it('renders content and both nav destinations', () => {
    renderShell();
    expect(screen.getByText('Seiteninhalt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Übersicht' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Einstellungen' })).not.toHaveAttribute('aria-current');
  });

  it('marks Einstellungen current on its route', () => {
    renderShell('/einstellungen');
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('aria-current', 'page');
  });

  it('logs out and returns to the login page', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Login-Seite')).toBeInTheDocument();
  });
});
