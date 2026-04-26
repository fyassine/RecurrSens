export interface Patient {
  id: string;
  patient_id: string;
  status: PatientStatus;
  prediction_pre: PredictionStatus;
  prediction_post: PredictionStatus;
  audio_count_pre: number;
  audio_count_post: number;
  pre_op_date: string | null;
  post_op_date: string | null;
  deleted_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface PatientDetail extends Patient {
  ai_percentage_rp_pre: number | null;
  gradcam_prediction_pre: string | null;
  gradcam_percentage_pre: number | null;
  ai_reasoning_pre: string | null;
  ai_percentage_rp_post: number | null;
  gradcam_prediction_post: string | null;
  gradcam_percentage_post: number | null;
  ai_reasoning_post: string | null;
  audio_files: AudioFile[];
  audio_files_pre: AudioFile[];
  audio_files_post: AudioFile[];
  sessions: RecordingSession[];
}

export interface PatientPublic {
  status: PatientStatus;
  patient_id: string;
  completed_exercise_ids_pre: string[];
  completed_exercise_ids_post: string[];
  created_at: string;
}

export interface RecordingSession {
  id: string;
  phase: 'PRE_OP' | 'POST_OP';
  session_number: number;
  created_at: string;
}

export interface AudioFile {
  id: string;
  exercise_id: string;
  phase: 'PRE_OP' | 'POST_OP';
  session: string | null;
  created_at: string;
}

export interface Exercise {
  id: number;
  exercise_id: string;
  title: string;
  description: string;
  example_audio_url: string;
  order: number;
  is_active: boolean;
}

export interface Completeness {
  complete: boolean;
  missing: string[];
  warnings: string[];
}

export type PatientStatus =
  | 'NEW'
  | 'CONSENT_GIVEN'
  | 'PRE_OP_DONE'
  | 'POST_OP_STARTED'
  | 'POST_OP_DONE'
  | 'COMPLETED'
  | 'EXPIRED';

export type PredictionStatus = 'TODO' | 'INFECTED' | 'HEALTHY';
