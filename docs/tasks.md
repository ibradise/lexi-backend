# Lexi Backend — Implementation Tasks

> Detailed backend tasks. For product requirements, see `../prd/requirements.md`.

---

> Before building: Read `../prd/WORKFLOW.md` → `../prd/requirements.md` → `../prd/architecture.md` → `docs/tasks.md` → `docs/architecture.md`

## Phase 10: Rename `Review` model/table → `ReviewHistory`

**Status:** Code/migration/docs done 2026-11-06 — **blocked on DB** for apply + runtime tests.
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
- [ ] **Apply:** `npx prisma migrate dev` (local) / `npx prisma migrate deploy` (prod) — DB unreachable
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
- [ ] `test/unit/scoring.service.test.ts` — not run (DB-dependent suite); compiles via `tsc`
- [ ] `test/integration/review.test.ts` — not run (needs live Postgres)
- [ ] `test/integration/vocabulary.test.ts` — not run (needs live Postgres)
- [ ] Add regression check after migration: `GET /api/vocabulary/:id` includes `reviews` and `GET /api/review/history` works
- [ ] Note: integration tests need a live Postgres (`DATABASE_URL`)

### Docs
- [x] `AGENTS.md` — `VocabularyWord → Review (1:N)` → `ReviewHistory`
- [x] `docs/architecture.md` — table list/entities → `ReviewHistory`
- [x] `docs/IMPLEMENTATION.md` — appended 2026-11-06 log entry
- [x] `prd/` files not touched (backend-internal change)

### Verification
- [x] `npx prisma validate`
- [ ] `npx prisma migrate status` — DB unreachable
- [x] `npm run build`
- [ ] `npm test` — needs live Postgres
- [ ] Row-count check after apply: `SELECT count(*) FROM "ReviewHistory";` must match old `"Review"` count
- [ ] Manual: add word → submit review → `GET /api/vocabulary/:id` → `GET /api/review/history` → `GET /api/dashboard`

### Notes / risks
- Prisma rename detection is heuristic; always inspect the generated migration before applying
- Forgetting to rename the FK constraint/index can cause drift on the next `migrate dev`
- Keeping the relation field `reviews` is the only way to avoid changing the API response shape
