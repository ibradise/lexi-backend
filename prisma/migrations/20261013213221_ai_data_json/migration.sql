/*
  Warnings:

  - You are about to drop the `AICacheEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Exercise` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WordMeaning` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "ExerciseType" ADD VALUE 'EXAMPLE';

-- DropForeignKey
ALTER TABLE "AICacheEntry" DROP CONSTRAINT "AICacheEntry_wordId_fkey";

-- DropForeignKey
ALTER TABLE "Exercise" DROP CONSTRAINT "Exercise_wordId_fkey";

-- DropForeignKey
ALTER TABLE "WordMeaning" DROP CONSTRAINT "WordMeaning_wordId_fkey";

-- AlterTable
ALTER TABLE "VocabularyWord" ADD COLUMN     "aiData" JSONB,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiUpdatedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "AICacheEntry";

-- DropTable
DROP TABLE "Exercise";

-- DropTable
DROP TABLE "WordMeaning";
