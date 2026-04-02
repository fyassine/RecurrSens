'use server';

import { createPatient, deletePatient, advancePatientStep } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export async function createPatientAction(formData: FormData) {
  const patientId = formData.get('patientId') as string;
  if (!patientId) return { error: "Missing Patient ID" };
  
  const patient = await createPatient(patientId);
  revalidatePath('/');
  return { success: true, patient };
}

export async function advancePatientStepAction(formData: FormData) {
  const token = formData.get('token') as string;
  if (!token) return { error: "Missing token" };

  try {
    await advancePatientStep(token);
    revalidatePath('/');
    revalidatePath(`/details/${token}`);
    return { success: true };
  } catch (error: any) {
    console.error("Failed to advance patient step", error);
    return { error: error?.message || "Unbekannter Fehler beim Aktualisieren." };
  }
}

export async function deletePatientAction(formData: FormData) {
  const token = formData.get('token') as string;
  if (!token) return;

  await deletePatient(token);
  revalidatePath('/');
}
