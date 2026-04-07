import axios from 'axios';
import type {
  Patient,
  PatientDetail,
  PatientPublic,
  Exercise,
  Completeness,
} from '../types';

const api = axios.create({
  baseURL: '/api',
});

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

let accessToken: string | null = localStorage.getItem('access_token');

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function clearTokens() {
  accessToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function isLoggedIn(): boolean {
  return !!accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = localStorage.getItem('refresh_token');
  if (!refresh) return null;
  try {
    const { data } = await axios.post('/api/auth/token/refresh/', { refresh });
    accessToken = data.access;
    localStorage.setItem('access_token', data.access);
    return data.access;
  } catch {
    clearTokens();
    return null;
  }
}

// Attach JWT to admin requests & handle 401 refresh
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(username: string, password: string) {
  const { data } = await axios.post('/api/auth/token/', { username, password });
  setTokens(data.access, data.refresh);
  return data;
}

// ---------------------------------------------------------------------------
// Admin — Patients
// ---------------------------------------------------------------------------

export async function getPatients(): Promise<Patient[]> {
  const { data } = await api.get('/patients/');
  return data;
}

export async function getPatient(id: string): Promise<PatientDetail> {
  const { data } = await api.get(`/patients/${id}/`);
  return data;
}

export async function createPatient(patientId: string): Promise<PatientDetail> {
  const { data } = await api.post('/patients/', { patient_id: patientId });
  return data;
}

export async function updatePatient(
  id: string,
  payload: Record<string, unknown>,
): Promise<PatientDetail> {
  const { data } = await api.patch(`/patients/${id}/`, payload);
  return data;
}

export async function deletePatient(id: string): Promise<void> {
  await api.delete(`/patients/${id}/`);
}

export async function advancePatient(id: string): Promise<PatientDetail> {
  const { data } = await api.post(`/patients/${id}/advance/`);
  return data;
}

export async function getCompleteness(id: string): Promise<Completeness> {
  const { data } = await api.get(`/patients/${id}/completeness/`);
  return data;
}

export async function downloadPatientPdf(id: string): Promise<void> {
  const { data } = await api.get(`/patients/${id}/pdf/`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  window.open(url, '_blank', 'noopener,noreferrer');
  // Revoke after a short delay to allow the new tab to load
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------------------------------------------------------------------------
// Public — Patient-facing
// ---------------------------------------------------------------------------

const publicApi = axios.create({ baseURL: '/api' });

export async function getPublicPatient(token: string): Promise<PatientPublic> {
  const { data } = await publicApi.get(`/p/${token}/`);
  return data;
}

export async function updatePublicPatient(
  token: string,
  payload: Record<string, unknown>,
): Promise<PatientPublic> {
  const { data } = await publicApi.patch(`/p/${token}/`, payload);
  return data;
}

export async function advancePublicPatient(token: string): Promise<void> {
  await publicApi.post(`/p/${token}/advance/`);
}

export async function uploadAudio(
  token: string,
  file: Blob,
  exerciseId: string,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file, 'recording.webm');
  formData.append('exercise_id', exerciseId);
  await publicApi.post(`/p/${token}/audio/upload/`, formData);
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export function getAudioStreamUrl(fileId: string): string {
  return `/api/audio/${fileId}/`;
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export async function getExercises(): Promise<Exercise[]> {
  const { data } = await publicApi.get('/exercises/');
  return data;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function getExportUrl(): string {
  return `/api/export/`;
}
