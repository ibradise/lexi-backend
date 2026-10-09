# Lexi Backend — Implementation Tasks

> Detailed backend tasks. For product requirements, see `../prd/requirements.md`.

---

## Phase 1: Project Setup

- [ ] Initialize npm project
- [ ] Install dependencies (express, prisma, @prisma/client, bcryptjs, jsonwebtoken, zod, dotenv, cors, helmet, morgan, typescript, ts-node, @types/*)
- [ ] Configure tsconfig.json
- [ ] Set up .env with all variables
- [ ] Create src/app.ts and src/index.ts
- [ ] Add middleware (cors, helmet, morgan, JSON parser)
- [ ] Add global error handler
- [ ] Verify: server starts on port 3000

## Phase 2: Database + Prisma

- [ ] Sign up for Prisma Data Platform free tier
- [ ] Create database project on Prisma
- [ ] Get connection string
- [ ] Install and init Prisma
- [ ] Define schema (VocabularyWord, WordMeaning, Example, LearningState, Review, AICacheEntry)
- [ ] Run initial migration
- [ ] Create Prisma client singleton
- [ ] Verify: prisma studio shows all tables

## Phase 3: Vocabulary CRUD

- [ ] Create routes, controller, service for vocabulary
- [ ] Implement POST /api/vocabulary
- [ ] Implement GET /api/vocabulary (search, filter, paginate)
- [ ] Implement GET /api/vocabulary/:id
- [ ] Implement DELETE /api/vocabulary/:id
- [ ] Implement POST /api/vocabulary/:id/regenerate-ai
- [ ] Add Zod validation
- [ ] Handle duplicate words (409)
- [ ] Verify: full CRUD works

## Phase 4: AI Integration

- [ ] Create ai.service.ts
- [ ] Create prompt templates
- [ ] Implement Gemini API call
- [ ] Implement response validation
- [ ] Implement retry logic (3 retries, exponential backoff)
- [ ] Implement AI response caching
- [ ] Store generated content in database
- [ ] Handle AI failure gracefully
- [ ] Verify: adding word generates content

## Phase 5: Review Engine

- [ ] Create scoring.service.ts
- [ ] Implement knowledge score calculation
- [ ] Implement SM-2 interval calculation
- [ ] Implement forgetting detection
- [ ] Create review routes, controller, service
- [ ] Implement GET /api/review/today
- [ ] Implement POST /api/review/:wordId/submit
- [ ] Implement GET /api/review/history
- [ ] Add Zod validation
- [ ] Verify: review submission updates score

## Phase 6: Dashboard

- [ ] Create dashboard routes, controller, service
- [ ] Implement GET /api/dashboard
- [ ] Verify: returns correct aggregated data

## Phase 7: Testing + Polish

- [ ] Unit tests: scoring service
- [ ] Unit tests: validation
- [ ] Integration tests: vocabulary CRUD
- [ ] Integration tests: review submission
- [ ] Error handling + edge cases
- [ ] README with setup instructions
