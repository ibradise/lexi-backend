-- AlterEnum: remove EXAMPLE from ExerciseType
-- Postgres cannot drop an enum value directly, so the type is recreated without it.
-- Reassign any existing EXAMPLE rows first so the column cast cannot fail.
UPDATE "Review" SET "exerciseType" = 'MULTIPLE_CHOICE' WHERE "exerciseType" = 'EXAMPLE';

BEGIN;
CREATE TYPE "ExerciseType_new" AS ENUM ('DEFINITION_RECALL', 'MULTIPLE_CHOICE', 'CONTEXT_COMPLETION', 'MEANING_FROM_CONTEXT', 'WORD_SELECTION', 'SENTENCE_CREATION', 'SIMILAR_WORD_DISTINCTION');
ALTER TABLE "Review" ALTER COLUMN "exerciseType" TYPE "ExerciseType_new" USING ("exerciseType"::text::"ExerciseType_new");
ALTER TYPE "ExerciseType" RENAME TO "ExerciseType_old";
ALTER TYPE "ExerciseType_new" RENAME TO "ExerciseType";
DROP TYPE "ExerciseType_old";
COMMIT;
