import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppDataContext } from './context/AppDataContext';
import type { Patient } from './types';
import { useTailwindDarkMirror } from './lib/colorScheme';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PatientDetailsPage from './pages/PatientDetailsPage';
import PatientWizardPage from './pages/PatientWizardPage';
import AnalytikPage from './pages/AnalytikPage';
import EinstellungenPage from './pages/EinstellungenPage';
import AppShell from './components/layout/AppShell';
import { isLoggedIn } from './api/client';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  useTailwindDarkMirror();

  const [notificationCount, setNotificationCount] = useState(0);
  const [patients, setPatients] = useState<Patient[]>([]);

  return (
    <AppDataContext.Provider
      value={{ notificationCount, setNotificationCount, patients, setPatients }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/p/:token" element={<PatientWizardPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell>
                  <DashboardPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/details/:token"
            element={
              <ProtectedRoute>
                <AppShell>
                  <PatientDetailsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytik"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AnalytikPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/einstellungen"
            element={
              <ProtectedRoute>
                <AppShell>
                  <EinstellungenPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AppDataContext.Provider>
  );
}
