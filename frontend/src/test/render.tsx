import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

function Providers({ children }: { children: ReactNode }) {
  return <MantineProvider>{children}</MantineProvider>;
}

/** render() wrapper that supplies the MantineProvider every component needs. */
export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: Providers });
}
