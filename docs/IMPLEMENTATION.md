# Lexi Backend — Implementation Log

> Permanent record of what was actually built. Never deleted, only appended.

---

## Format

```markdown
## YYYY-MM-DD — Phase N: Feature Name
- [x] What was built
- [x] What was built

## API Endpoints Implemented
- POST /api/endpoint — description

## Database Changes
- Added table: tableName

## Notes
- Decisions made, issues encountered
```

---

## Log

## 2026-10-11 — Phase 1-7: Backend MVP Complete
- [x] Express + TypeScript server (port 3001, changed from 3000)
- [x] Prisma schema + client (6 tables, 3 enums; Prisma 6.19.3)
- [x] Vocabulary CRUD (7 CRUD endpoints + review + dashboard)
- [x] Gemini AI integration (with caching + retry logic, supports node 24)
- [x] Review engine (SM-2 interval calculation, knowledge scoring, priority queue)
- [x] Dashboard endpoint (today's review, weakest words, stats)
- [x] Unit + integration tests (7 tests passing)
- [x] Package cleanup (removed: bcryptjs, jsonwebtoken, @prisma/adapter-pg, pg, zod)

## 2026-10-11 — Package Updates
- @prisma/client 5.22.0 → 6.19.3 (Node 24 compatible; Prisma 7+ has issues)
- express 5.2.1 → 5.3.0
- typescript 5.4.5 → 5.x

## API Endpoints Implemented
- POST /api/vocabulary — add word (triggers AI generation)
- GET /api/vocabulary — list with search, filter, paginate
- GET /api/vocabulary/:id — word detail with meanings, examples, learning state, reviews
- DELETE /api/vocabulary/:id — soft delete
- POST /api/vocabulary/:id/regenerate-ai — regenerate AI content (stub - needs fixing)
- GET /api/review/today — today's review queue (smart selection by SM-2 algorithm)
- POST /api/review/:wordId/submit — submit answer, update score (currently trusts client, needs server-side validation)
- GET /api/review/history — review history with pagination
- GET /api/dashboard — dashboard data (today's review, weakest words, stats)

## Database Tables
- VocabularyWord, WordMeaning, Example, LearningState, Review, AICacheEntry

## Notes
- API port changed from 3000 → 3001 (due to port conflicts)
- Prisma 6.19.3 chosen over 7+ for Node 24 compatibility
- Gemini model: gemini-1.5-flash (free tier)
- AI responses cached in AICacheEntry table
- regenerateAI endpoint exists but is non-functional (stub)
- submitReview validates client-side (should validate server-side)
- Unused packages to remove: bcryptjs, jsonwebtoken, @prisma/adapter-pg, pg, zod

---

## 2026-10-14 — Single AI-response storage (schema migration)
- [x] `VocabularyWord` now stores the whole AI response in one `aiData Json?` column (+ `aiModel`, `aiUpdatedAt`)
- [x] Dropped models/tables: `WordMeaning`, `Exercise`, `AICacheEntry`
- [x] `ExerciseType` enum: added `EXAMPLE`
- [x] Migration `20261013213221_ai_data_json` created + applied
- [x] `generateWordContent` is now a pure call returning `AIData` (cache layer removed)
- [x] `addWord`: creates word, waits up to 8s for AI, then persists AI data (else stays PENDING with `aiData = null`)
- [x] `regenerateAI`: functional — regenerates and overwrites `aiData`
- [x] `getExercises`: returns 2-3 exercises (always ≥1 EXAMPLE when available) from `aiData.exercises`
- [x] `deleteWord`: returns 404 for missing word (was 500)
- [x] `listWords`: sort field whitelist (`dateAdded`, `word`)
- [x] `submitReview`: wraps review + learning-state writes in a `$transaction`; enum validation → 400
- [x] `@prisma/client` moved to `dependencies`
- [x] Tests updated (mock AI, unique words, new endpoints) — 36 passing

## API Endpoints Implemented (current)
- POST /api/vocabulary — add word (triggers AI generation; returns word with `aiData` when ready)
- GET /api/vocabulary — list with search, filter, paginate
- GET /api/vocabulary/:id — word detail with `aiData`, learning state, reviews
- GET /api/vocabulary/:id/exercises — 2-3 exercises for review (includes `correctAnswer`)
- DELETE /api/vocabulary/:id — soft delete (404 if missing)
- POST /api/vocabulary/:id/regenerate-ai — regenerate AI content
- GET /api/review/today — today's review queue (SM-2 priority)
- POST /api/review/:wordId/submit — submit answer, update score (atomic)
- GET /api/review/history — review history with pagination
- GET /api/dashboard — dashboard data

## Database Tables (current)
- VocabularyWord (with `aiData` JSON), LearningState, Review

## Notes
- `aiData` shape: `{ meanings[], exercises[], synonyms[], antonyms[], pronunciation, difficulty }`
- Replaces the earlier `WordMeaning`/`Example`/`Exercise`/`AICacheEntry` tables
- Gemini model: `gemini-3.5-flash` (JSON response mode, `maxOutputTokens` 3000)
- AI is best-effort on add: on timeout/failure the word is saved as PENDING and can be regenerated

---

## 2026-10-14 — Separate examples from exercises (AI response restructure)
- ✅ Split AI content into two fields: `examples: AIExample[]` (learning content) and `exercises: AIMultipleChoice[]` (answerable items)
- ✅ `src/types/ai.ts`: added `AIExample` and `AIMultipleChoice`; removed `AIExercise`/`AIExerciseType`
- ✅ Prompt now emits `examples` (4-6, distinct contexts) separately from `exercises` (2-3 MULTIPLE_CHOICE, no `type` field)
- ✅ `parseAIResponse`: validates `examples` (sentence + context) and `exercises` (question, 4 options, correctAnswer, explanation)
- ✅ Removed `EXAMPLE` from the `ExerciseType` enum; migration `20261014113010_remove_example_enum` recreates the enum type without it
- ✅ `getExercises`: returns only answerable exercises (random 2-3), each tagged `type: 'MULTIPLE_CHOICE'`; no more EXAMPLE mixing / "≥1 EXAMPLE" guarantee
- ✅ Tests updated for the new `AIData` shape — 36 passing

## Database Changes
- `ExerciseType` enum: removed `EXAMPLE` (recreated type; existing `EXAMPLE` review rows reassigned to `MULTIPLE_CHOICE`)

## Notes
- Examples are learning content, never scored; only `exercises` flow through the review/scoring pipeline
- `getExercises` response still includes a `type: 'MULTIPLE_CHOICE'` field so the client can submit `exerciseType` to `POST /api/review/:wordId/submit`
- `aiData` shape: `{ meanings[], examples[], exercises[], synonyms[], antonyms[], pronunciation, difficulty }`

---

## 2026-10-14 — Query projections: stop fetching unused aiData
- ✅ `getTodayReview`: both `findMany` calls now use `select` (`id`, `word`, `learningState` fields only) instead of `include` — response shape unchanged, no more DB→app transfer of the `aiData` jsonb
- ✅ `submitReview`: `findUnique` now selects only `id`, `learningState` (`intervalDays`/`easeFactor`/`repetitions`) and `reviews` (`result`/`responseTimeMs`/`hintUsed`) — no full row / `aiData`
- ✅ `getDashboard` weakestWords: `select` (`id`, `word`, `learningState.knowledgeScore`) instead of full rows
- ✅ `listWords`: uses `omit: { aiData: true }` so list responses no longer carry the heavy jsonb
- ✅ `scoring.service`: `calculateKnowledgeScore` accepts `ReviewSignals` (`Pick<Review, 'result'|'responseTimeMs'|'hintUsed'>`) to match the narrow projection
- ✅ `review.test.ts`: added a guard that `GET /api/review/today` queue items have **no** `aiData` and exactly `{ wordId, word, priority, knowledgeScore, status }`

## API Changes
- `GET /api/vocabulary` list items no longer include `aiData` (word detail `GET /api/vocabulary/:id` still returns it)

## Notes
- Behavior-preserving for review/dashboard; only `listWords` payload changed (list is a preview)
- No schema/migration change

---

## 2026-10-14 — Bulk add words + background AI worker + aiReady
- ✅ `POST /api/vocabulary` now accepts **either** `{ word, ... }` (single, unchanged `201`) **or** `{ words: string[] }` (bulk → `202 Accepted`)
- ✅ Bulk input is normalized: split on commas/whitespace/newlines, lowercased, trimmed; in-batch repeats and already-existing words returned in `duplicates`; over-long entries in `invalid`; cap 50 words/request (`400` when empty or over the cap)
- ✅ Bulk response: `{ added: [{ id, word, status: 'PENDING' }], duplicates: string[], invalid: string[] }` — returns before AI runs
- ✅ `addWords` creates each word with a `NEW` `LearningState` in a single `$transaction`, then enqueues them
- ✅ New `src/services/aiQueue.service.ts`: in-memory, concurrency-limited (3) background worker; `enqueueAIGeneration(ids)` is fire-and-forget; per-word idempotent (skips words that already have `aiData`); failures are logged and left PENDING for retry
- ✅ `persistAIData` moved from `vocabulary.service` into `aiQueue.service` (single AI-content writer, no circular import)
- ✅ `sweepPendingWords()` runs on server boot (`src/index.ts`) re-enqueueing all `isArchived: false, aiModel: null` words (finishes words left PENDING by a crash/restart or an early app close)
- ✅ `aiReady` flag added to `GET /api/review/today` queue items and `GET /api/vocabulary` list items (`aiModel !== null`); review queue now uses a `select` projection (no `aiData` transfer)
- ✅ Tests: 5 bulk tests (create + background generation, separator split + de-dupe, existing duplicates, empty → 400, over cap → 400) — 41 passing

## API Changes
- `POST /api/vocabulary` accepts `words: string[]` for bulk add → `202`
- `GET /api/review/today` queue items and `GET /api/vocabulary` list items include `aiReady: boolean`

## Notes
- The client can close the app immediately after a bulk add; words are created synchronously and AI content is generated server-side in the background
- No schema/migration change (uses existing `aiData` / `aiModel`)

---

## 2026-10-14 — AI generation retries (attempt tracking + backoff)
- ✅ `aiQueue.service`: failed worker jobs now retry in-run — `attempts` map (`MAX_ATTEMPTS = 3`), exponential backoff `2000 * 2 ** (tries - 1)` ms (2s, 4s), re-enqueued via `setTimeout(...).unref()` (won't keep the process alive)
- ✅ Success clears the word's attempt counter; after `MAX_ATTEMPTS` the worker gives up and leaves the word PENDING (boot sweep / `regenerate-ai` still recover it)
- ✅ Single `addWord`: when the hybrid 8s wait fails/times out, the word is handed to the background worker (`enqueueAIGeneration`) instead of being left untouched
- ✅ Tests: retry-then-succeed (mocked reject ×2 → resolves) and give-up (always reject → exactly 4 calls, stays PENDING) — 43 passing

## Notes
- Retries only run while the process is alive; a word that exhausts its attempts is PENDING until restart/regenerate
- Attempts stack on `callGeminiWithRetry`'s internal 3 attempts (up to ~9 Gemini calls per word)

---

## 2026-11-06 — Phase 10: Rename Review → ReviewHistory
- ✅ `prisma/schema.prisma`: `model Review` → `model ReviewHistory`; relation field kept as `reviews` (`ReviewHistory[]`) so API response keys are unchanged
- ✅ Added data-preserving migration `20261106232606_rename_review_to_review_history` (`ALTER TABLE ... RENAME`, plus index/constraint renames) — created manually because the dev DB was unreachable (`P1001`)
- ✅ `src/services/review.service.ts`: `tx.review` / `prisma.review` → `prisma.reviewHistory`
- ✅ `src/services/dashboard.service.ts`: `prisma.review` → `prisma.reviewHistory`
- ✅ `src/services/scoring.service.ts`: `Review` type → `ReviewHistory`
- ✅ `npx prisma validate`, `npx prisma generate`, and `npm run build` pass
- ✅ Migration applied with `npx prisma migrate deploy`; full suite passes (56/56)

## Notes
- Public API unchanged: `/api/review/*`, `submitReview`, and the `reviews` key on `GET /api/vocabulary/:id`
- Migration is data-preserving (`ALTER TABLE ... RENAME`); no manual data step needed

---

## 2026-11-06 — Phase 11: Critical bug fixes (#1–#4)
- ✅ #1 `submitReview` fetches the word's reviews ordered by `createdAt asc, id asc`, so `slice(-10)`/scoring and SM-2 use the true latest 10
- ✅ #2 Server-side answer validation:
  - `getExercises` now assigns stable ids from the original `aiData` index (before shuffle): `<wordId>-ex-<index>`
  - `POST /api/review/:wordId/submit` accepts `{ exerciseId, userAnswer?, responseTimeMs?, hintUsed?, skipped? }`
  - server resolves the exercise from `aiData`, normalizes the answer, derives `CORRECT`/`INCORRECT`/`SKIPPED`, stores `correctAnswer` + `userAnswer`, and feeds the derived result into scoring/SM-2
  - `400` unknown/foreign `exerciseId`, `409` when `aiData` is not ready, `404` archived/non-existent word
- ✅ #3 Archived-word guards: `getWord`, `getExercises`, `regenerateAI`, `submitReview` return 404 for archived words; review history and dashboard review counts filter archived words
- ✅ #4 Soft-delete re-add: bulk add now treats archived words as duplicates (no unique-constraint 500); `errorHandler` maps Prisma `P2002` → 409 and `P2025` → 404
- ✅ Tests updated: review submit contract (correct/wrong/skipped/unknown/foreign/archived/not-ready), score-order regression, stable exercise ids, archived guards + re-add duplicates
- ✅ `npm run build` passes; `npm test` passes (56/56 across 3 suites)

## API Changes
- `POST /api/review/:wordId/submit` body is now `{ exerciseId, userAnswer?, responseTimeMs?, hintUsed?, skipped? }`; the client no longer sends `result`/`exerciseType`
- `GET /api/vocabulary/:id/exercises` ids are stable across requests; `correctAnswer` is still returned

## Notes
- Postgres reachable again via `db.prisma.io`; all migrations applied and integration tests run against it

---

## 2026-11-06 — Phase 12: Remaining bug fixes (#5–#9)
- ✅ #5 Request validation: new `src/utils/query.ts` (`parsePositiveInt`, `parseEnum`, `parseOptionalString`); `listWords`/`getReviewHistory` reject bad `page`/`limit`/`order`/`status` with 400; submit validates `responseTimeMs` (integer 0–60000), booleans, and `submissionId`; single add enforces `MAX_WORD_LENGTH`
- ✅ #6 Skip scheduling: `calculateNewInterval(SKIPPED)` returns `max(1, intervalDays)`, so a skipped NEW word returns tomorrow instead of immediately
- ✅ #7 Submit idempotency: added nullable unique `ReviewHistory.submissionId` (migration `20261108090000_add_review_submission_id`, applied); replaying a key returns the original review + current state; reusing it for another word → 409
- ✅ #8 Missing-AI contract: `GET /api/vocabulary/:id/exercises` now returns `409 AI_NOT_READY` when `aiData` is null (matches submit)
- ✅ #9 Queue counts: `getTodayReview` derives `totalDue`/`newWords`/`reviewWords` from `count` queries; items stay capped at 30, new-word fetch cap raised to 10
- ✅ Minor: scoring uses `responseTimeMs ?? 5000` so a real 0ms is honored
- ✅ Tests: 69/69 pass; `npm test` now runs `jest --runInBand` (the suites share one live Postgres and parallel workers caused intermittent failures)

## API Changes
- `POST /api/review/:wordId/submit` accepts optional `submissionId` (client-generated UUID) for idempotent retries
- Malformed query/body input now returns `400 VALIDATION_ERROR` instead of a 500
- `GET /api/vocabulary/:id/exercises` returns `409 AI_NOT_READY` for words still generating AI content

---

## 2026-11-06 — Phase 13: Smart knowledge scoring
- ✅ Five PRD signals: accuracy 45%, interval 20%, response time 15%, hint 10%, repetition 10% (`SCORE_WEIGHTS`)
- ✅ Added the missing interval component: `min(intervalDays / 30, 1)` (30-day cap)
- ✅ Accuracy handles `CORRECT`=1, `PARTIAL`=0.5, `INCORRECT`=0; `SKIPPED` is neutral and excluded from accuracy/time/hint/repetition
- ✅ Every component clamped to 0–1; final score clamped to 0–1
- ✅ Score is computed with the newly scheduled interval; `submitReview` returns `scoreBreakdown`
- ✅ `npm run recompute-scores` backfills existing `LearningState` scores/status from ordered history (619 rows)
- ✅ Tests: 77/77 pass; Jest `testTimeout` raised to 180s for the remote Postgres latency

## API Changes
- `POST /api/review/:wordId/submit` response now includes `scoreBreakdown` (`accuracy`, `interval`, `responseTime`, `hint`, `repetition`)
