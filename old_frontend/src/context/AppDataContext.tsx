import { createContext, useContext } from 'react';
import type { Patient } from '../types';

interface AppDataContextValue {
  notificationCount: number;
  setNotificationCount: (count: number) => void;
  patients: Patient[];
  setPatients: (patients: Patient[]) => void;
}

export const AppDataContext = createContext<AppDataContextValue>({
  notificationCount: 0,
  setNotificationCount: () => {},
  patients: [],
  setPatients: () => {},
});

export function useAppData() {
  return useContext(AppDataContext);
}
