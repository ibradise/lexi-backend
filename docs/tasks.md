# Lexi Backend — Implementation Tasks

> Detailed backend tasks. For product requirements, see `../prd/requirements.md`.

---

> Before building: Read `../prd/WORKFLOW.md` → `../prd/requirements.md` → `../prd/architecture.md` → `docs/tasks.md` → `docs/architecture.md`

# TASK: Single AI-response storage (3-table schema) + working add-word / review flows

**Goal:** Store one word's entire AI response in a single JSON column on `VocabularyWord`
(`aiData`), drop the `WordMeaning` / `Exercise` / `AICacheEntry` tables, keep only
`VocabularyWord`, `LearningState`, `Review`, and make the add-word → AI-generate → review
flows fully work with no broken or missing pieces.

## Schema
- [x] `VocabularyWord`: add `aiData Json?`, `aiModel String?`, `aiUpdatedAt DateTime?`; keep `pronunciation`, `difficulty`
- [x] Drop models: `WordMeaning`, `Exercise`, `AICacheEntry`
- [x] `ExerciseType` enum: add `EXAMPLE`
- [x] Migration created + applied; Prisma Client regenerated

## Types
- [x] Add `src/types/ai.ts` with `AIData` (meanings, exercises, synonyms, antonyms, pronunciation, difficulty)

## AI service (`src/services/ai.service.ts`)
- [x] Remove `AICacheEntry` caching + `crypto`/promptHash code
- [x] `generateWordContent(word, partOfSpeech?, sourceContext?)` is a pure call returning `AIData`
- [x] Keep `parseAIResponse` validation; JSON mode; `gemini-3.5-flash`; 3000 tokens; retry

## Vocabulary service (`src/services/vocabulary.service.ts`)
- [x] `addWord`: create word + LearningState, hybrid AI (wait ~8s), on success `persistAIData`, else leave PENDING (`aiData = null`)
- [x] `persistAIData(wordId, data)`: write `aiData`, `aiModel`, `aiUpdatedAt`, copy `pronunciation`/`difficulty`
- [x] `getWord`: drop `meanings`/`exercises` includes; keep `learningState` + `reviews`
- [x] `getExercises(wordId)`: 404 if missing; read `aiData.exercises`; return 2-3 (≥1 EXAMPLE if present) with `correctAnswer`
- [x] `regenerateAI(id)`: 404 if missing; regenerate + `persistAIData`; return updated word
- [x] `deleteWord`: existence check → 404
- [x] `listWords`: whitelist sort fields (`dateAdded`, `word`)

## Controller + routes
- [x] `vocabulary.controller.ts`: add `getExercises`
- [x] `vocabulary.routes.ts`: add `GET /:id/exercises`

## Review flow
- [x] `review.service.ts`: proper `ExerciseType`/`ReviewResult` types; wrap write flow in `$transaction`
- [x] `review.controller.ts`: validate `exerciseType` / `result` → 400 on invalid

## Housekeeping
- [x] Move `@prisma/client` to `dependencies` in `package.json`

## Tests
- [x] `vocabulary.test.ts`: mock AI, unique words, assert `aiData`, test `GET /:id/exercises`, delete 404
- [x] `review.test.ts`: mock AI, unique words, keep coverage; invalid enum → 400
- [x] `npm test` green (36/36 passing)

## Verification
- [x] `npx tsc --noEmit` clean
- [x] `npx prisma migrate status` up to date

## Docs
- [x] `docs/IMPLEMENTATION.md`: record what was built (3-table schema, aiData, endpoints)
- [x] `docs/architecture.md`: update data model, AI integration, scoring weights, endpoints
- [x] `AGENTS.md`: update entities, endpoints, env/stack drift

## Status
- [x] All items above done → STOP and report for user review (do NOT clear this file, do NOT commit)
