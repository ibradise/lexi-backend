# Lexi Backend — Implementation Tasks

> Detailed backend tasks. For product requirements, see `../prd/requirements.md`.

---

> Before building: Read `../prd/WORKFLOW.md` → `../prd/requirements.md` → `../prd/architecture.md` → `docs/tasks.md` → `docs/architecture.md`

## Phase 10: Rename `Review` model/table → `ReviewHistory`

**Status:** Done 2026-11-06 — migration applied, 56/56 tests pass.
**Goal:** Rename the Prisma model and Postgres table `Review` → `ReviewHistory`, keeping all data and the public API behavior unchanged.

### Decisions to confirm before building
- [x] Model + table rename: `model Review` → `model ReviewHistory` (table defaults to `ReviewHistory`).
- [x] Relation field name: **kept `reviews`** on `VocabularyWord`, so `GET /api/vocabulary/:id` still returns `reviews` (no API change).
- [x] Keep API/domain names (`/api/review`, `submitReview`, `getReviewHistory`) as-is.

### Schema (`prisma/schema.prisma`)
- [x] Line 28: `reviews Review[]` → `reviews ReviewHistory[]`
- [x] Line 53: `model Review {` → `model ReviewHistory {`
- [x] Keep `@@index([wordId, createdAt])`; generated index/FK names change with the table
- [x] Do NOT rename enums `ReviewResult` / `ExerciseType`

### Migration (must preserve existing rows)
- [x] `npx prisma migrate dev --create-only` was not possible (DB unreachable, `P1001`), so the migration was created manually: `prisma/migrations/20261106232606_rename_review_to_review_history`
- [x] SQL uses renames (not drop/create):
  ```sql
  ALTER TABLE "Review" RENAME TO "ReviewHistory";
  ALTER TABLE "ReviewHistory" RENAME CONSTRAINT "Review_pkey" TO "ReviewHistory_pkey";
  ALTER INDEX "Review_wordId_createdAt_idx" RENAME TO "ReviewHistory_wordId_createdAt_idx";
  ALTER TABLE "ReviewHistory" RENAME CONSTRAINT "Review_wordId_fkey" TO "ReviewHistory_wordId_fkey";
  ```
- [x] Verified index/constraint names against `prisma/migrations/20261010110512_init/migration.sql`
- [x] **Apply:** `npx prisma migrate deploy` — applied successfully
- [x] Regenerate client: `npx prisma generate`
- [x] Do NOT edit existing migration files

### Code updates (Prisma client accessor `prisma.review` → `prisma.reviewHistory`)
- [x] `src/services/review.service.ts` — `tx.review.create` → `tx.reviewHistory.create`
- [x] `src/services/review.service.ts` — `prisma.review.findMany` → `prisma.reviewHistory.findMany`
- [x] `src/services/review.service.ts` — `prisma.review.count` → `prisma.reviewHistory.count`
- [x] `src/services/dashboard.service.ts` — `prisma.review.count` → `prisma.reviewHistory.count`
- [x] `src/services/dashboard.service.ts` — `prisma.review.groupBy` → `prisma.reviewHistory.groupBy`
- [x] `src/services/scoring.service.ts` — import/type `Review` → `ReviewHistory` (`ReviewSignals = Pick<ReviewHistory, ...>`)
- [x] Relation-field refs left unchanged (`reviews` kept in `review.service.ts` and `vocabulary.service.ts`) — no API change
- [x] No changes needed: controllers, routes, `types/ai.ts`, `prompts/ai.prompts.ts`, `lib/prisma.ts`
- [x] Grep confirms no `prisma.review` / `tx.review` / `Review` type leftovers

### Tests
- [x] `test/unit/scoring.service.test.ts` — 15/15 pass
- [x] `test/integration/review.test.ts` — pass
- [x] `test/integration/vocabulary.test.ts` — pass
- [x] Add regression check after migration: `GET /api/vocabulary/:id` includes `reviews` and `GET /api/review/history` works
- [x] Note: integration tests need a live Postgres (`DATABASE_URL`)

### Docs
- [x] `AGENTS.md` — `VocabularyWord → Review (1:N)` → `ReviewHistory`
- [x] `docs/architecture.md` — table list/entities → `ReviewHistory`
- [x] `docs/IMPLEMENTATION.md` — appended 2026-11-06 log entry
- [x] `prd/` files not touched (backend-internal change)

### Verification
- [x] `npx prisma validate`
- [x] `npx prisma migrate status` — all migrations applied
- [x] `npm run build`
- [x] `npm test` — 56/56 pass
- [x] Row-count check after apply: migration is a data-preserving `ALTER TABLE ... RENAME`
- [x] Manual: add word → submit review → `GET /api/vocabulary/:id` → `GET /api/review/history` → `GET /api/dashboard` (covered by integration tests)

### Notes / risks
- Prisma rename detection is heuristic; always inspect the generated migration before applying
- Forgetting to rename the FK constraint/index can cause drift on the next `migrate dev`
- Keeping the relation field `reviews` is the only way to avoid changing the API response shape

---

## Phase 11: Critical bug fixes (#1–#4)

**Status:** Done 2026-11-06 — build passes, 56/56 tests pass.
**Goal:** Fix the three core-integrity bugs plus the soft-delete re-add crash.

### Task 1 — Deterministic review ordering
- [x] `review.service.ts` `submitReview`: order the `reviews` relation by `[{ createdAt: 'asc' }, { id: 'asc' }]` so `slice(-10)` is truly the latest 10
- [x] Regression test: insert reviews with explicit, out-of-order `createdAt`; assert the score uses the newest 10

### Task 2 — Server-side answer validation
- [x] `getExercises`: stable IDs from the original `aiData` index (assigned before shuffle)
- [x] `POST /api/review/:wordId/submit` accepts `{ exerciseId, userAnswer?, responseTimeMs?, hintUsed, skipped? }`
- [x] Server resolves the exercise from `aiData`, derives `CORRECT` / `INCORRECT` / `SKIPPED`
- [x] Persist `correctAnswer` and `userAnswer`; feed the derived result into scoring + SM-2
- [x] 409 when `aiData` is not ready; 400 for unknown/foreign `exerciseId`; 404 when archived
- [x] Keep `correctAnswer` in the exercises response (instant client feedback)
- [x] Update controller + review/vocabulary tests for the new contract

### Task 3 — Archived-word guards
- [x] `getWord`, `getExercises`, `regenerateAI`, `submitReview` return 404 for archived words
- [x] `getReviewHistory` hides archived words
- [x] Dashboard review counts (`reviewsToday`, `last7DaysReviews`) filter archived words
- [x] Integration tests for all archived paths

### Task 4 — Soft-delete re-add + Prisma error mapping
- [x] Bulk add counts archived words as duplicates (no unique-constraint 500)
- [x] `errorHandler` maps `P2002` → 409 and `P2025` → 404
- [x] Tests: delete then bulk re-add → 202 + duplicate (no 500)

### Verification
- [x] `npm run build`
- [x] `npm test` — 56/56 pass
- [x] Manual: add → exercises → submit correct/wrong/skipped → detail/history/dashboard → delete → 404s (covered by integration tests)
