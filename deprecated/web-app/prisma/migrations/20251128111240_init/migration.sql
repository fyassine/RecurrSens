/*
  Warnings:

  - You are about to drop the column `age` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `prediction` on the `Patient` table. All the data in the column will be lost.
  - The `diagnosis` column on the `Patient` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Diagnosis" AS ENUM ('LEFT', 'RIGHT', 'BOTH', 'HEALTHY', 'TODO');

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "age",
DROP COLUMN "prediction",
ADD COLUMN     "aiPercentageRPPost" DOUBLE PRECISION,
ADD COLUMN     "aiPercentageRPPre" DOUBLE PRECISION,
ADD COLUMN     "aiReasoningPost" TEXT,
ADD COLUMN     "aiReasoningPre" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "diagnosisText" TEXT,
ADD COLUMN     "postOpDate" TIMESTAMP(3),
ADD COLUMN     "preOpDate" TIMESTAMP(3),
ADD COLUMN     "predictionPost" "Diagnosis",
ADD COLUMN     "predictionPre" "Diagnosis",
DROP COLUMN "diagnosis",
ADD COLUMN     "diagnosis" "Diagnosis" DEFAULT 'TODO';
