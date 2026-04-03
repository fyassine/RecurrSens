export interface Patient {
  id: string;
  patient_id: string;
  status: PatientStatus;
  gender: Gender;
  birth_date: string | null;
  diagnosis: Diagnosis;
  diagnosis_text: string;
  prediction_pre: PredictionStatus;
  prediction_post: PredictionStatus;
  audio_count_pre: number;
  audio_count_post: number;
  pre_op_date: string | null;
  post_op_date: string | null;
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
  age: number | null;
  audio_files: AudioFile[];
  audio_files_pre: AudioFile[];
  audio_files_post: AudioFile[];
}

export interface PatientPublic {
  status: PatientStatus;
  gender: Gender;
  birth_date: string | null;
  patient_id: string;
  diagnosis: Diagnosis;
  audio_file_ids_pre: string[];
  audio_file_ids_post: string[];
  created_at: string;
}

export interface AudioFile {
  id: string;
  exercise_id: string;
  phase: 'PRE_OP' | 'POST_OP';
  created_at: string;
}

export interface Exercise {
  id: number;
  exercise_id: string;
  title: string;
  description: string;
  example_audio_url_female: string;
  example_audio_url_male: string;
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
  | 'DEMOGRAPHICS_DONE'
  | 'PRE_OP_DONE'
  | 'POST_OP_STARTED'
  | 'POST_OP_DONE'
  | 'COMPLETED';

export type Gender = 'M' | 'W' | 'D' | '?';

export type Diagnosis = 'TODO' | 'LEFT' | 'RIGHT' | 'BOTH' | 'HEALTHY';

export type PredictionStatus = 'TODO' | 'INFECTED' | 'HEALTHY';
