-- Rename the Review table to ReviewHistory (data-preserving).
ALTER TABLE "Review" RENAME TO "ReviewHistory";

-- Postgres does not rename indexes/constraints with the table, so rename them explicitly.
ALTER TABLE "ReviewHistory" RENAME CONSTRAINT "Review_pkey" TO "ReviewHistory_pkey";
ALTER INDEX "Review_wordId_createdAt_idx" RENAME TO "ReviewHistory_wordId_createdAt_idx";
ALTER TABLE "ReviewHistory" RENAME CONSTRAINT "Review_wordId_fkey" TO "ReviewHistory_wordId_fkey";
