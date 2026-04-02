import { getAllPatients } from "@/lib/api";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";

function mapDiagnosisToPathology(diagnosis: string) {
  if (diagnosis === "HEALTHY") return "Keine Recurrensparese";
  if (diagnosis === "LEFT") return "Linke Recurrensparese";
  if (diagnosis === "RIGHT") return "Rechte Recurrensparese";
  if (diagnosis === "BOTH") return "Beidseitige Recurrensparese";
  return "";
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

export async function GET() {
  const zip = new JSZip();
  const patients = await getAllPatients();
  const completed = patients.filter((p) => p.status === "COMPLETED");
  const rows = [];
  // Header
  rows.push([
    "AufnahmeID",
    "AufnahmeTyp",
    "AufnahmeDatum",
    "Diagnose",
    "SprecherID",
    "Geburtsdatum",
    "Geschlecht",
    "Pathologien",
  ]);

  for (const p of completed) {
    // PRE
    rows.push([
      `${p.$id}/pre`,
      "h",
      formatDate(p.preOpDate),
      "",
      p.patientId,
      formatDate(p.birthDate),
      p.gender,
      "Keine Recurrensparese",
    ]);
    // POST
    rows.push([
      `${p.$id}/post`,
      "h",
      formatDate(p.postOpDate),
      '"' + (p.diagnosisText || "") + '"',
      p.patientId,
      formatDate(p.birthDate),
      p.gender,
      mapDiagnosisToPathology(p.diagnosis),
    ]);
  }

  const csv = rows
    .map((row) => row.map((v) => String(v)).join(","))
    .join("\r\n");

  zip.file("export.csv", csv);

  for (const p of completed) {
    const audioFiles = await prisma.audioFile.findMany({
      where: { patientId: p.$id },
    });

    for (const audioFile of audioFiles) {
      try {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: audioFile.storageKey,
        });
        const { Body } = await s3Client.send(command);
        if (Body) {
          const buffer = await Body.transformToByteArray();
          // Use the storage key to create the folder structure within the zip
          zip.file(`data/${audioFile.storageKey}`, buffer);
        }
      } catch (error) {
        console.error(
          `Failed to fetch or add file ${audioFile.storageKey} for patient ${p.$id}:`,
          error
        );
      }
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="patienten_export_${new Date()
        .toISOString()
        .slice(0, 10)}.zip"`,
    },
  });
}
