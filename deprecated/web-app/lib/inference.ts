'use server';

import { BUCKET_NAME } from '@/lib/s3';

interface InferencePrediction {
  prediction: 'INFECTED' | 'HEALTHY';
  percentage: number;
}

interface InferenceReasoning {
  text: string;
}

if (!process.env.INFERENCE_SERVICE_URL) {
  throw new Error('INFERENCE_SERVICE_URL is not defined');
}
const INFERENCE_SERVICE_URL = process.env.INFERENCE_SERVICE_URL;

interface Prediction {
  prediction: "INFECTED" | "HEALTHY";
  percentage: number;
}

interface InferenceResult {
  film_classifier: Prediction;
  gradcam_pro?: Prediction;
}

export async function getPrediction(
  audioKeys: string[],
  gender: string,
  age: number
): Promise<InferenceResult> {
  if (audioKeys.length === 0) {
    return {
      film_classifier: { prediction: "TODO" as any, percentage: 0 },
    };
  }

  try {
    const response = await fetch(`${INFERENCE_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        bucket: BUCKET_NAME,
        keys: audioKeys,
        gender,
        age
      }),
    });

    if (!response.ok) {
      throw new Error(`Inference service error: ${response.statusText}`);
    }

    return await response.json();

  } catch (error) {
    console.error("Inference prediction failed:", error);
    return {
      film_classifier: { prediction: "TODO" as any, percentage: 0 },
    };
  }
}

export async function getReasoning(audioKeys: string[], gender: string, age: number): Promise<InferenceReasoning> {
  if (audioKeys.length === 0) {
    return { text: '' };
  }

  try {
    const response = await fetch(`${INFERENCE_SERVICE_URL}/reasoning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        bucket: BUCKET_NAME,
        keys: audioKeys,
        gender,
        age
      }),
    });

    if (!response.ok) {
      throw new Error(`Inference service error: ${response.statusText}`);
    }

    return await response.json();

  } catch (error) {
    console.error("Inference reasoning failed:", error);
    return { text: '' };
  }
}
