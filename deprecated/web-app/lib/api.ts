'use server';

import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '@/lib/db';
import { s3Client, BUCKET_NAME } from '@/lib/s3';
import { PutObjectCommand, GetObjectCommand, CreateBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { revalidatePath } from 'next/cache';
import { getPrediction, getReasoning } from './inference';
import { Diagnosis } from '@prisma/client';
import { EXERCISES } from '@/lib/exercises';

export type { Diagnosis };

export interface Patient {
  $id: string;
  patientId: string;
  status: 'NEW' | 'CONSENT_GIVEN' | 'DEMOGRAPHICS_DONE' | 'PRE_OP_DONE' | 'POST_OP_STARTED' | 'POST_OP_DONE' | 'COMPLETED';
  gender: 'M' | 'W' | 'D' | '?';
  birthDate?: Date;
  audioFileIdsPre: string[];
  audioFileIdPost: string[];
  diagnosis: Diagnosis;
  diagnosisText?: string;
  
  predictionPre: 'TODO' | 'INFECTED' | 'HEALTHY';
  aiPercentageRPPre?: number;
  gradcamPredictionPre?: 'HEALTHY' | 'INFECTED';
  gradcamPercentagePre?: number;
  aiReasoningPre?: string;
  preOpDate?: Date;

  predictionPost: 'TODO' | 'INFECTED' | 'HEALTHY';
  aiPercentageRPPost?: number;
  gradcamPredictionPost?: 'HEALTHY' | 'INFECTED';
  gradcamPercentagePost?: number;
  aiReasoningPost?: string;
  postOpDate?: Date;

  createdAt: string;
}

export type PublicPatient = Omit<Patient, 
'predictionPre' | 'predictionPost' | 
'$id' | 'diagnosisText' | 'aiReasoningPre' | 
'aiReasoningPost' | 'preOpDate' | 'postOpDate' | 
'aiPercentageRPPre' | 'aiPercentageRPPost'
>;

// Helper to map Prisma patient to App interface
function mapPrismaPatient(p: any): Patient {
  const audioFiles = p.audioFiles || [];
  const preFiles = audioFiles.filter((f: any) => f.phase === 'PRE_OP').map((f: any) => f.id);
  const postFiles = audioFiles.filter((f: any) => f.phase === 'POST_OP').map((f: any) => f.id);

  return {
    $id: p.id,
    patientId: p.patientId,
    status: p.status as any,
    gender: (p.gender as any) || '?',
    birthDate: p.birthDate,
    preOpDate: p.preOpDate,
    postOpDate: p.postOpDate,
    audioFileIdsPre: preFiles,
    audioFileIdPost: postFiles,
    diagnosis: (p.diagnosis as any) || 'TODO',
    diagnosisText: p.diagnosisText || '',
    
    predictionPre: p.predictionPre || 'TODO',
    aiPercentageRPPre: p.aiPercentageRPPre || 0,
    gradcamPredictionPre: p.gradcamPredictionPre,
    gradcamPercentagePre: p.gradcamPercentagePre || 0,
    aiReasoningPre: p.aiReasoningPre || '',

    predictionPost: p.predictionPost || 'TODO',
    aiPercentageRPPost: p.aiPercentageRPPost || 0,
    gradcamPredictionPost: p.gradcamPredictionPost,
    gradcamPercentagePost: p.gradcamPercentagePost || 0,
    aiReasoningPost: p.aiReasoningPost || '',

    createdAt: p.createdAt.toISOString(),
  };
}

export async function createPatient(patientId: string): Promise<Patient> {
  const patient = await prisma.patient.create({
    data: {
      patientId,
      status: 'NEW',
      diagnosis: Diagnosis.TODO,
      predictionPre: 'TODO',
      predictionPost: 'TODO',
    },
    include: {
      audioFiles: true,
    },
  });
  revalidatePath('/');
  return mapPrismaPatient(patient);
}

export async function isValidToken(token: string): Promise<boolean> {
  const patient = await prisma.patient.findUnique({
    where: { id: token },
  });
  return !!patient;
}

export async function getPatientByToken(token: string): Promise<Patient | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: token },
    include: {
      audioFiles: true,
    },
  });
  if (!patient) return null;
  return mapPrismaPatient(patient);
}

export async function updatePatientData(
  token: string, 
  data: Partial<Omit<Patient, '$id' | 'audioFileIdsPre' | 'audioFileIdPost' | 'createdAt'>>
): Promise<void> {
  console.log('[SERVER] updatePatientData called with:', JSON.stringify(data, null, 2));
  
  const updateData: any = {};
  if ((data as any).patientId) updateData.patientId = (data as any).patientId;
  if (data.status) updateData.status = data.status;
  if (data.gender) updateData.gender = data.gender;
  if (data.birthDate) updateData.birthDate = data.birthDate;
  if (data.preOpDate) updateData.preOpDate = data.preOpDate;
  if (data.postOpDate) updateData.postOpDate = data.postOpDate;
  if (data.diagnosis) updateData.diagnosis = data.diagnosis;
  if (data.diagnosisText !== undefined) updateData.diagnosisText = data.diagnosisText;
  
  if (data.predictionPre) updateData.predictionPre = data.predictionPre;
  if (data.aiPercentageRPPre !== undefined) updateData.aiPercentageRPPre = data.aiPercentageRPPre;
  if (data.gradcamPredictionPre) updateData.gradcamPredictionPre = data.gradcamPredictionPre;
  if (data.gradcamPercentagePre !== undefined) updateData.gradcamPercentagePre = data.gradcamPercentagePre;
  if (data.aiReasoningPre !== undefined) updateData.aiReasoningPre = data.aiReasoningPre;

  if (data.predictionPost) updateData.predictionPost = data.predictionPost;
  if (data.aiPercentageRPPost !== undefined) updateData.aiPercentageRPPost = data.aiPercentageRPPost;
  if (data.gradcamPredictionPost) updateData.gradcamPredictionPost = data.gradcamPredictionPost;
  if (data.gradcamPercentagePost !== undefined) updateData.gradcamPercentagePost = data.gradcamPercentagePost;
  if (data.aiReasoningPost !== undefined) updateData.aiReasoningPost = data.aiReasoningPost;

  await prisma.patient.update({
    where: { id: token },
    data: updateData,
  });
}

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export async function advancePatientStep(token: string): Promise<void> {
  const patient = await getPatientByToken(token);
  if (!patient) throw new Error("Patient not found");

  let nextStatus: Patient['status'] | null = null;
  const updatePayload: Partial<Patient> = {};

  switch (patient.status) {
    case 'NEW':
      nextStatus = 'CONSENT_GIVEN';
      break;
    case 'CONSENT_GIVEN':
      nextStatus = 'DEMOGRAPHICS_DONE';
      break;
    case 'DEMOGRAPHICS_DONE':
      nextStatus = 'PRE_OP_DONE';
      updatePayload.preOpDate = new Date();
      break;
    case 'PRE_OP_DONE':
      nextStatus = 'POST_OP_STARTED';
      break;
    case 'POST_OP_STARTED':
      nextStatus = 'POST_OP_DONE';
      updatePayload.postOpDate = new Date();
      break;
    case 'POST_OP_DONE':
      nextStatus = 'COMPLETED';
      break;
  }

  if (nextStatus) {
    if (nextStatus === 'COMPLETED') {
      const completeness = await getPatientCompleteness(token);
      if (!completeness.complete) {
        throw new Error(`Fall kann nicht abgeschlossen werden. Fehlende Daten: ${completeness.missing.join(', ')}`);
      }
    }

    updatePayload.status = nextStatus;
    console.log(`Advancing patient ${token} from ${patient.status} to ${nextStatus}`);
    await updatePatientData(token, updatePayload);
    
    const age = patient.birthDate ? calculateAge(patient.birthDate) : -1;
    if (age === -1) {
      console.error("Could not calculate age for inference");
    }

    if (nextStatus === 'PRE_OP_DONE') {
      try {
        const audioFiles = await prisma.audioFile.findMany({
          where: { id: { in: patient.audioFileIdsPre } }
        });
        const keys = audioFiles.map(f => f.storageKey);
        
        const [predictionResult, reasoning] = await Promise.all([
          getPrediction(keys, patient.gender, age),
          getReasoning(keys, patient.gender, age),
        ]);

        await updatePatientData(token, {
          predictionPre: predictionResult.film_classifier.prediction,
          aiPercentageRPPre: predictionResult.film_classifier.percentage,
          gradcamPredictionPre: predictionResult.gradcam_pro?.prediction,
          gradcamPercentagePre: predictionResult.gradcam_pro?.percentage,
          aiReasoningPre: reasoning.text,
          preOpDate: new Date(),
        });
      } catch (error) {
        console.error("Pre-Op Inference failed:", error);
      }
    }

    if (nextStatus === 'POST_OP_DONE') {
      try {
        const audioFiles = await prisma.audioFile.findMany({
          where: { id: { in: patient.audioFileIdPost } }
        });
        const keys = audioFiles.map(f => f.storageKey);
        
        const [predictionResult, reasoning] = await Promise.all([
          getPrediction(keys, patient.gender, age),
          getReasoning(keys, patient.gender, age),
        ]);

        await updatePatientData(token, {
          predictionPost: predictionResult.film_classifier.prediction,
          aiPercentageRPPost: predictionResult.film_classifier.percentage,
          gradcamPredictionPost: predictionResult.gradcam_pro?.prediction,
          gradcamPercentagePost: predictionResult.gradcam_pro?.percentage,
          aiReasoningPost: reasoning.text,
          postOpDate: new Date(),
        });
      } catch (error) {
        console.error("Post-Op Inference failed:", error);
      }
    }
  }
}

export async function uploadAudioFile(
  token: string, 
  formData: FormData
): Promise<string> {
  const file = formData.get('file') as File;
  const exerciseId = formData.get('exerciseId') as string;

  if (!file || !exerciseId) {
    throw new Error('Missing file or exerciseId');
  }

  // Determine phase based on patient status
  const patient = await getPatientByToken(token);
  if (!patient) throw new Error("Patient not found");

  const isPostOp = patient.status === 'POST_OP_STARTED' || patient.status === 'POST_OP_DONE';
  const phase = isPostOp ? 'POST_OP' : 'PRE_OP';
  const phaseFolder = isPostOp ? 'post' : 'pre';

  const buffer = Buffer.from(await file.arrayBuffer());
  // Format: token/pre|post/exerciseId.ext (no UUID in filename)
  const extension = file.name.split('.').pop() || 'wav';
  const key = `${token}/${phaseFolder}/${exerciseId}.${extension}`;

  // Ensure bucket exists and upload to S3/MinIO
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }));
  } catch (error: any) {
    if (error.name === 'NoSuchBucket') {
      await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      // Retry upload
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }));
    } else {
      throw error;
    }
  }

  // Save to DB
  try {
    const audioFile = await prisma.audioFile.create({
      data: {
        // Let the database generate the primary key; storageKey uniquely identifies the object in S3
        patientId: token,
        exerciseId: exerciseId,
        storageKey: key,
        phase: phase,
      },
    });
    return audioFile.id;
  } catch (error) {
    // Cleanup S3 if DB save fails (prevent orphans)
    console.error("DB save failed, cleaning up S3 file...", error);
    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));
    throw error;
  }
}

// Admin Dashboard Stubs (now using Prisma)

export async function getAllPatients(): Promise<Patient[]> {
  const patients = await prisma.patient.findMany({
    include: { audioFiles: true },
    orderBy: { createdAt: 'desc' },
  });
  return patients.map(mapPrismaPatient);
}

export async function getPatientAudioUrl(fileId: string): Promise<string> {
  const audioFile = await prisma.audioFile.findUnique({
    where: { id: fileId },
  });
  
  if (!audioFile) throw new Error("File not found");

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: audioFile.storageKey,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function deletePatient(token: string): Promise<void> {
  // 1. Get all audio files for this patient
  const audioFiles = await prisma.audioFile.findMany({
    where: { patientId: token },
  });

  // 2. Delete from S3
  for (const file of audioFiles) {
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: file.storageKey,
      }));
    } catch (error) {
      console.error(`Failed to delete S3 file ${file.storageKey}:`, error);
      // Continue deleting other files and DB records even if one S3 delete fails
    }
  }

  // 3. Delete from DB
  await prisma.audioFile.deleteMany({
    where: { patientId: token },
  });

  await prisma.patient.delete({
    where: { id: token },
  });
  revalidatePath('/');
}

/**
 * Evaluates whether a patient has all required data to close the case.
 * AI-related fields are optional; missing AI data only triggers warnings.
 */
export async function getPatientCompleteness(token: string): Promise<{
  complete: boolean;
  missing: string[];
  warnings: string[];
}> {
  const patient = await prisma.patient.findUnique({
    where: { id: token },
    include: { audioFiles: true },
  });

  if (!patient) {
    return {
      complete: false,
      missing: ['patientNotFound'],
      warnings: [],
    };
  }

  const exerciseIds = EXERCISES.map((e) => e.id);
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!patient.patientId?.trim()) missing.push('patientId');
  if (!patient.gender || patient.gender === '?') missing.push('gender');
  if (!patient.birthDate) missing.push('birthDate');
  if (!patient.diagnosis || patient.diagnosis === Diagnosis.TODO) missing.push('diagnosis');

  const preFiles = patient.audioFiles.filter((f) => f.phase === 'PRE_OP');
  const postFiles = patient.audioFiles.filter((f) => f.phase === 'POST_OP');

  const missingPre = exerciseIds.filter((id) => !preFiles.some((f) => f.exerciseId === id));
  if (missingPre.length) missing.push(`preOpAudio:${missingPre.join(',')}`);

  const missingPost = exerciseIds.filter((id) => !postFiles.some((f) => f.exerciseId === id));
  if (missingPost.length) missing.push(`postOpAudio:${missingPost.join(',')}`);

  // Warnings for AI results (do not block completion)
  if (!patient.predictionPre || patient.predictionPre === Diagnosis.TODO) warnings.push('aiPreMissing');
  if (!patient.predictionPost || patient.predictionPost === Diagnosis.TODO) warnings.push('aiPostMissing');

  return {
    complete: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Generates a PDF for the patient with QR code using a template.
 */
export async function getPatientPDF(token: string): Promise<Blob> {
  const patient = await getPatientByToken(token);
  if (!patient) throw new Error("Patient not found");

  // Load the template PDF from the public directory
  const templatePath = path.resolve(process.cwd(), 'public', 'pdf', 'patient_qr.pdf');
  const existingPdfBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  // Get the first page of the document
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];

  if (!process.env.NEXT_PUBLIC_APP_URL && !process.env.APP_URL) {
    throw new Error('NEXT_PUBLIC_APP_URL or APP_URL is not defined');
  }
  // Use APP_URL (runtime) if available, otherwise fall back to NEXT_PUBLIC_APP_URL (build time)
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const patientUrl = `${baseUrl}/p/${token}`;
  
  // Generate QR Code as Data URL
  const qrCodeDataUrl = await QRCode.toDataURL(patientUrl, { width: 256, margin: 1 });
  
  // Embed PNG
  const qrImage = await pdfDoc.embedPng(qrCodeDataUrl);

  // Convert cm to points (1 inch = 2.54 cm, 1 inch = 72 points)
  const cmToPoints = (cm: number) => cm * (72 / 2.54);

  const qrWidth = cmToPoints(5.5);
  const qrHeight = cmToPoints(5.5);
  const x = cmToPoints(2.1);
  
  // A4 height is ~29.7cm. Y-coordinate in pdf-lib is from the bottom of the page.
  const y = cmToPoints(29.7 - 12.8 - 5.5);

  // Draw the QR code on the first page
  firstPage.drawImage(qrImage, {
    x: x,
    y: y,
    width: qrWidth,
    height: qrHeight,
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([Buffer.from(pdfBytes)], { type: 'application/pdf' });
}

