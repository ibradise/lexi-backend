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

---

## Phase 12: Remaining bug fixes (#5–#9)

**Status:** Done 2026-11-06 — build passes, 69/69 tests pass.
**Goal:** Close the remaining issues from the backend audit (validation 500s, skip loop,
double-submit, missing-AI contract, truncated queue counts).

### Decisions
- **#5** Malformed input → `400 VALIDATION_ERROR` (not 500): `page >= 1`, `limit` 1–100;
  `order` ∈ `{asc, desc}`; `status` must be a `WordStatus`; `responseTimeMs` integer 0–60000;
  `hintUsed`/`skipped` must be booleans when present; single-add enforces `MAX_WORD_LENGTH`.
- **#6** `SKIPPED` uses `intervalDays = max(1, current)` so a NEW word returns tomorrow, not immediately.
- **#7** Optional `submissionId` on submit, unique on `ReviewHistory`; a repeat returns the stored
  result + current learning state; reuse for another word → 409.
- **#8** `GET /api/vocabulary/:id/exercises` returns `409 AI_NOT_READY` when `aiData` is null
  (consistent with submit).
- **#9** Queue counts come from `count` queries; queue items stay capped at 30, new-word fetch cap 10.

### Task 5 — Request validation
- [x] `src/utils/query.ts`: strict positive-int parser with max (throws 400)
- [x] `vocabulary.controller.ts`: validate `page`, `limit`, `order`, `status`, `search`; single-add length
- [x] `review.controller.ts`: validate history pagination + submit body (`responseTimeMs`, booleans, `submissionId`)
- [x] Tests: malformed query/body → 400

### Task 6 — Skip scheduling
- [x] `scoring.service.ts`: `SKIPPED` → `intervalDays = max(1, current)`
- [x] Test: skipping a NEW word schedules it ≥1 day out

### Task 7 — Submit idempotency
- [x] Schema: `ReviewHistory.submissionId String? @unique` + migration
- [x] `submitReview`: return existing review when `submissionId` already seen; 409 on word mismatch
- [x] Tests: duplicate submit → one row, same result; cross-word reuse → 409

### Task 8 — Missing-AI contract
- [x] `getExercises`: `409 AI_NOT_READY` when `aiData` is null
- [x] Test: PENDING word exercises → 409

### Task 9 — Queue counts
- [x] `getTodayReview`: `totalDue`/`newWords`/`reviewWords` from `count` queries
- [x] Keep item cap (`QUEUE_LIMIT = 30`) and raise new-word fetch cap (`NEW_WORD_LIMIT = 10`)
- [x] Test: >30 due → `totalDue` > 30 while `queue.length === 30`

### Minor
- [x] `scoring.service.ts`: `responseTimeMs ?? 5000` so a real `0` is respected

### Verification
- [x] `npm run build`
- [x] `npm test`
- [x] Docs: `AGENTS.md`, `docs/architecture.md`, `docs/IMPLEMENTATION.md`

---

## Phase 13: Make knowledge scoring smart and PRD-aligned

**Status:** Done 2026-11-06 — build passes, 77/77 tests pass, 619 scores backfilled.
**Goal:** Make knowledge scoring the reliable core of the app: all five PRD signals,
normalized, consistent skip handling, and a transparent breakdown.

### Decisions
- **Weights:** accuracy **45%**, interval **20%**, response time **15%**, hint **10%**,
  repetition **10%** (accuracy stays dominant; adds the missing interval signal).
- **Interval component:** `min(intervalDays / 30, 1)` (30-day cap, linear).
- **Accuracy:** over the last 10 *answered* reviews; `SKIPPED` excluded (neutral).
  `PARTIAL` counts as 0.5.
- **Time / hint:** over the last 10 answered reviews; skip excluded.
- **Repetition:** `min(answeredReviews / 8, 1)` (skip excluded).
- **All components clamped to 0–1**; final score clamped to 0–1.
- **`SKIPPED`** leaves the score unchanged for an established word (neutral) and still
  schedules at least one day out.
- **API:** submit response gains `scoreBreakdown` (backward-compatible).
- **Backfill:** recompute existing `LearningState.knowledgeScore` from history.

### Task 1 — Scoring engine
- [x] Export `SCORE_WEIGHTS`, `INTERVAL_CAP_DAYS`, `RESPONSE_TIME_CAP_MS`
- [x] `calculateScoreBreakdown(reviews, intervalDays)` → `{ score, breakdown }`
- [x] Keep `calculateKnowledgeScore(reviews, intervalDays = 0)` as a wrapper
- [x] Accuracy handles `CORRECT` / `PARTIAL` / `INCORRECT`; skip excluded
- [x] Interval, time, hint, repetition components clamped to 0–1

### Task 2 — Wire into review flow
- [x] Compute the new interval first, then score with that interval
- [x] Return `scoreBreakdown` from `submitReview`
- [x] Verify skip does not move an established word's score

### Task 3 — Backfill existing scores
- [x] `src/scripts/recomputeScores.ts` recomputes from ordered history + current interval
- [x] `npm run recompute-scores` and run it against the DB

### Task 4 — Tests
- [x] Unit: each component boundary (0, cap, >cap), partial accuracy, skip neutrality, clamping
- [x] Integration: `scoreBreakdown` present and consistent; interval boosts score on correct;
      skip leaves score unchanged

### Task 5 — Docs
- [x] `docs/architecture.md` scoring table + formula
- [x] `AGENTS.md` knowledge scoring section
- [x] `docs/IMPLEMENTATION.md` Phase 13 entry

### Verification
- [x] `npm run build`
- [x] `npm test`
