import { createContext, useContext } from 'react';
import type { Patient } from '../types';
import type { UserRole } from '../api/client';

interface AppDataContextValue {
  notificationCount: number;
  setNotificationCount: (count: number) => void;
  patients: Patient[];
  setPatients: (patients: Patient[]) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  centerName: string | null;
  setCenterName: (name: string | null) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const AppDataContext = createContext<AppDataContextValue>({
  notificationCount: 0,
  setNotificationCount: () => {},
  patients: [],
  setPatients: () => {},
  userRole: 'SUPER_ADMIN',
  setUserRole: () => {},
  centerName: null,
  setCenterName: () => {},
  sidebarCollapsed: false,
  setSidebarCollapsed: () => {},
});

export function useAppData() {
  return useContext(AppDataContext);
}
