-- Add a client-supplied idempotency key for review submissions.
ALTER TABLE "ReviewHistory" ADD COLUMN "submissionId" TEXT;

CREATE UNIQUE INDEX "ReviewHistory_submissionId_key" ON "ReviewHistory"("submissionId");
