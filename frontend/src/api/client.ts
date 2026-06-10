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

// Single-flight refresh: concurrent 401s share one refresh request instead of
// each firing their own (which races and can spam the backend / corrupt state).
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
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
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
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
// Role helpers — decode JWT payload without a library
// ---------------------------------------------------------------------------

export type UserRole = 'SUPER_ADMIN' | 'CENTER_USER';

export type MeResponse = {
  username: string;
  role: UserRole;
  center_id: string | null;
  center_name: string | null;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getUserRole(): UserRole {
  const token = localStorage.getItem('access_token');
  if (!token) return 'SUPER_ADMIN';
  const payload = decodeJwtPayload(token);
  return (payload?.role as UserRole) ?? 'SUPER_ADMIN';
}

export function isSuperAdmin(): boolean {
  return getUserRole() === 'SUPER_ADMIN';
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(username: string, password: string) {
  const { data } = await axios.post('/api/auth/token/', { username, password });
  setTokens(data.access, data.refresh);
  return data;
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await api.get('/me/');
  return data as MeResponse;
}

export type DeviceInfo = {
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  device_type: 'Desktop' | 'Mobil' | 'Tablet' | 'Unbekannt';
  device_family: string | null;
};

export type CurrentSessionInfo = DeviceInfo & {
  ip_address: string | null;
  user_agent: string;
};

export type LoginHistoryEntry = DeviceInfo & {
  created_at: string;
  ip_address: string | null;
};

export type AccountInfo = {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  role: UserRole;
  center_id: string | null;
  center_name: string | null;
  last_login: string | null;
  current_session: CurrentSessionInfo;
  login_history: LoginHistoryEntry[];
};

export async function getAccountInfo(): Promise<AccountInfo> {
  const { data } = await api.get('/me/account/');
  return data as AccountInfo;
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

export async function createPatient(
  patientId: string,
  startPostOp = false,
): Promise<PatientDetail> {
  const { data } = await api.post('/patients/', {
    patient_id: patientId,
    start_post_op: startPostOp,
  });
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

export async function createSession(
  patientId: string,
  phase: 'PRE_OP' | 'POST_OP',
): Promise<{ id: string; phase: string; session_number: number; created_at: string }> {
  const { data } = await api.post(`/patients/${patientId}/sessions/`, { phase });
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

export async function advancePublicPatient(token: string): Promise<void> {
  await publicApi.post(`/p/${token}/advance/`);
}

export const ALLOWED_AUDIO_EXTENSIONS = [
  'webm',
  'mp4',
  'm4a',
  'aac',
  'wav',
  'mp3',
  'ogg',
  'oga',
  'flac',
  '3gp',
  '3gpp',
  'amr',
  'caf',
  'aiff',
  'aif',
  'nsp',
] as const;

export const AUDIO_ACCEPT_ATTR = [
  ...ALLOWED_AUDIO_EXTENSIONS.map((ext) => `.${ext}`),
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/ogg',
  'audio/flac',
  'audio/3gpp',
  'audio/amr',
  'audio/x-caf',
  'audio/aiff',
  'audio/x-aiff',
].join(',');

export function isAllowedAudioFile(filename: string): boolean {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return false;
  const ext = filename.slice(idx + 1).toLowerCase();
  return (ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}

// Maps a recording's MIME type to a filename extension the backend whitelist
// accepts. Keep aligned with `_MIME_TO_EXT` in backend audio_validation.py.
// Critical on iOS, where WebKit's MediaRecorder produces audio/mp4 (not webm):
// the backend picks its magic-byte check from the filename extension, so a
// hardcoded `.webm` name on MP4 bytes is rejected with a 400.
const AUDIO_MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/aac': 'aac',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/3gpp': '3gp',
  'audio/amr': 'amr',
  'audio/x-caf': 'caf',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
};

export async function uploadAudio(
  token: string,
  file: Blob,
  exerciseId: string,
): Promise<void> {
  const formData = new FormData();
  let filename: string;
  if (file instanceof File) {
    filename = file.name;
  } else {
    const baseType = file.type.split(';')[0].trim().toLowerCase();
    const ext = AUDIO_MIME_TO_EXT[baseType] ?? 'webm';
    filename = `recording.${ext}`;
  }
  formData.append('file', file, filename);
  formData.append('exercise_id', exerciseId);
  await publicApi.post(`/p/${token}/audio/upload/`, formData);
}

export type FeedbackPayload = {
  phase: 'PRE_OP' | 'POST_OP';
  rating?: number | null;
  comment?: string;
  skipped?: boolean;
};

export async function submitFeedback(
  token: string,
  payload: FeedbackPayload,
): Promise<void> {
  await publicApi.post(`/p/${token}/feedback/`, payload);
}

export type ExerciseSkipPayload = {
  phase: 'PRE_OP' | 'POST_OP';
  exercise_id: string;
};

export async function skipExercise(
  token: string,
  payload: ExerciseSkipPayload,
): Promise<void> {
  await publicApi.post(`/p/${token}/skips/`, payload);
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

// Fetch a short-lived signed stream URL (JWT + center-scoped on the backend).
// Native <audio> elements can't send the auth header, so playback uses this
// signed URL rather than a static path.
export async function getAudioStreamUrl(fileId: string): Promise<string> {
  const { data } = await api.get(`/audio/${fileId}/stream-url/`);
  return data.url;
}

export async function reassignAudioFile(
  fileId: string,
  phase: 'PRE_OP' | 'POST_OP',
  sessionId: string | null,
): Promise<void> {
  await api.patch(`/audio/${fileId}/reassign/`, { phase, session: sessionId });
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

export async function exportPatients(ids?: string[]): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const params = ids && ids.length > 0 ? { ids: ids.join(',') } : {};
  const response = await api.get('/export/', { responseType: 'blob', params });
  const filename =
    response.headers['x-export-filename'] ?? `patienten_export_${today}.zip`;
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// Activity Timeline
// ---------------------------------------------------------------------------

export async function getPatientActivity(id: string): Promise<import('../types').PatientActivityEvent[]> {
  const { data } = await api.get(`/patients/${id}/activity/`);
  return data;
}

