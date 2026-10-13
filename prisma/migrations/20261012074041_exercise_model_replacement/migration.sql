/*
  Warnings:

  - You are about to drop the `Example` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Example" DROP CONSTRAINT "Example_wordId_fkey";

-- DropTable
DROP TABLE "Example";

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "type" "ExerciseType" NOT NULL,
    "content" TEXT,
    "context" TEXT,
    "question" TEXT,
    "options" JSONB,
    "correctAnswer" TEXT,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exercise_wordId_idx" ON "Exercise"("wordId");

-- CreateIndex
CREATE INDEX "Exercise_type_idx" ON "Exercise"("type");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "VocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
