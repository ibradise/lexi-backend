-- CreateEnum
CREATE TYPE "WordStatus" AS ENUM ('NEW', 'LEARNING', 'FAMILIAR', 'STRONG', 'MASTERED');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('DEFINITION_RECALL', 'MULTIPLE_CHOICE', 'CONTEXT_COMPLETION', 'MEANING_FROM_CONTEXT', 'WORD_SELECTION', 'SENTENCE_CREATION', 'SIMILAR_WORD_DISTINCTION');

-- CreateEnum
CREATE TYPE "ReviewResult" AS ENUM ('CORRECT', 'INCORRECT', 'PARTIAL', 'SKIPPED');

-- CreateTable
CREATE TABLE "VocabularyWord" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "partOfSpeech" TEXT,
    "pronunciation" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "sourceContext" TEXT,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "dateAdded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VocabularyWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordMeaning" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WordMeaning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Example" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "sentence" TEXT NOT NULL,
    "context" TEXT,

    CONSTRAINT "Example_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningState" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "status" "WordStatus" NOT NULL DEFAULT 'NEW',
    "knowledgeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "exerciseType" "ExerciseType" NOT NULL,
    "result" "ReviewResult" NOT NULL,
    "responseTimeMs" INTEGER,
    "userAnswer" TEXT,
    "correctAnswer" TEXT,
    "hintUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICacheEntry" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICacheEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabularyWord_dateAdded_idx" ON "VocabularyWord"("dateAdded");

-- CreateIndex
CREATE INDEX "VocabularyWord_isArchived_idx" ON "VocabularyWord"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyWord_word_key" ON "VocabularyWord"("word");

-- CreateIndex
CREATE INDEX "WordMeaning_wordId_idx" ON "WordMeaning"("wordId");

-- CreateIndex
CREATE INDEX "Example_wordId_idx" ON "Example"("wordId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningState_wordId_key" ON "LearningState"("wordId");

-- CreateIndex
CREATE INDEX "LearningState_nextReviewAt_idx" ON "LearningState"("nextReviewAt");

-- CreateIndex
CREATE INDEX "LearningState_status_idx" ON "LearningState"("status");

-- CreateIndex
CREATE INDEX "Review_wordId_createdAt_idx" ON "Review"("wordId", "createdAt");

-- CreateIndex
CREATE INDEX "AICacheEntry_createdAt_idx" ON "AICacheEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AICacheEntry_wordId_promptHash_key" ON "AICacheEntry"("wordId", "promptHash");

-- AddForeignKey
ALTER TABLE "WordMeaning" ADD CONSTRAINT "WordMeaning_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "VocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Example" ADD CONSTRAINT "Example_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "VocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningState" ADD CONSTRAINT "LearningState_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "VocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "VocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICacheEntry" ADD CONSTRAINT "AICacheEntry_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "VocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
