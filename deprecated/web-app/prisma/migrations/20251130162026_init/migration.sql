/*
  Warnings:

  - The `predictionPost` column on the `Patient` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `predictionPre` column on the `Patient` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Prediction" AS ENUM ('TODO', 'INFECTED', 'HEALTHY');

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "predictionPost",
ADD COLUMN     "predictionPost" "Prediction",
DROP COLUMN "predictionPre",
ADD COLUMN     "predictionPre" "Prediction";
