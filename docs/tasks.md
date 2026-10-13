# Lexi Backend — Implementation Tasks

> Detailed backend tasks. For product requirements, see `../prd/requirements.md`.

---

> Before building: Read `../prd/WORKFLOW.md` → `../prd/requirements.md` → `../prd/architecture.md` → `docs/tasks.md` → `docs/architecture.md`

## Phase 8.0: Baseline Fixes

### Done
- [x] Prisma schema: add `Exercise` model (replaces `Example`; `type` distinguishes EXAMPLE + questions)
- [x] Prisma migration: `20261012074041_exercise_model_replacement` (drops `Example`, creates `Exercise`) — applied
- [x] AI prompt (`src/prompts/ai.prompts.ts`): `examples` → `exercises` (EXAMPLE + MULTIPLE_CHOICE)
- [x] AI service (`src/services/ai.service.ts`): `AIContent.exercises`, `parseAIResponse` validation, `responseMimeType: 'application/json'`, `maxOutputTokens` 1024 → 3000
- [x] `src/app.ts`: mount `dashboardRoutes` → `GET /api/dashboard` returns 200
- [x] `package.json`: test script `"jest"`; removed unused deps (`bcryptjs`, `jsonwebtoken`, `zod`, `pg`, `@prisma/adapter-pg`, `@types/bcryptjs`, `@types/jsonwebtoken`)
- [x] `.env.example`: `PORT=3001`, JWT secrets removed
- [x] `getWord`: include `exercises` instead of `examples`

### Not done (still pending)
- [ ] `addWord(input)`: hybrid AI call (wait ~8s → READY, else PENDING)
- [ ] `persistAIContent(wordId, content)`: `$transaction` writing `WordMeaning[]` + `Exercise[]`
- [ ] `regenerateAI(id)`: delete old meanings/exercises, call AI, persist, return `{ aiStatus }` (still a stub)
- [ ] `deleteWord`: existence check → 404 (currently Prisma P2025 → 500)
- [ ] `listWords`: whitelist allowed `sort` fields (`dateAdded`, `word`)
- [ ] `src/controllers/vocabulary.controller.ts`: `getExercises` controller
- [ ] `src/routes/vocabulary.routes.ts`: `GET /:id/exercises` route

## Phase 8.1: Exercise Model + AI-Generated Exercises

### Done
- [x] `Exercise` model + migration (above)
- [x] AI prompt + AI service for new `exercises` format (above)

### Not done (still pending)
- [ ] `getExercises(wordId)`: return 2-3 random exercises (≥1 EXAMPLE if available), each with `correctAnswer` for client-side validation
- [ ] Persist AI content (meanings → `WordMeaning`, examples/questions → `Exercise`)
- [ ] Store `pronunciation` / `difficulty` on `VocabularyWord`
- [ ] Persist synonyms / antonyms — **no schema field/table exists yet**
- [ ] Tests updated for new schema + endpoints
- [ ] Docs updated: `AGENTS.md`, `docs/architecture.md`, `docs/IMPLEMENTATION.md`

## Phase 8.2: Review Flow
- [ ] `submitReview(input)`: verify contract (`exerciseType`, `result`, `responseTimeMs`, `userAnswer`, `hintUsed`); no `exerciseId`; scoring/SM-2 unchanged

## Phase 9: Polish + Mobile Prep
- [ ] Consistent JSON response format on new endpoints
- [ ] `npm test` green after schema changes
- [ ] `npm run dev` starts cleanly

## Phase 10: Final cleanup
- [ ] STOP and ask user explicit approval before clearing `docs/tasks.md`
- [ ] Verify `.env` has no exposed secrets

## Open Design Question
- Synonyms/antonyms are returned by the AI (`AIContent`) but have **no storage** in the schema.
  Options: (1) add `String[]` columns on `VocabularyWord`, (2) drop from interface + prompt, (3) `WordRelation` table.

## Current Status
- **TypeScript**: compiles cleanly (`tsc --noEmit` passes)
- **Dashboard endpoint**: `GET /api/dashboard` → 200
- **Committed changes**: schema + migration, AI prompt, AI service, dashboard mount, package.json, `.env.example`, `getWord` include fix
- **Phase 8.1 features**: NOT complete — AI persistence (`addWord`/`persistAIContent`/`getExercises`/`regenerateAI`), controller/route, tests, docs all pending
