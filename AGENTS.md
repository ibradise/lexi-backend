# AGENTS.md — Backend Development Guide

> This file is the first thing a coding agent reads when working in this repo.

---

## Project Overview

Lexi backend — Express + TypeScript API for the Lexi vocabulary learning app.

**What it does:** Manages vocabulary words, AI-generated content, review sessions, and knowledge scoring.

---

## MANDATORY WORKFLOW (do not skip)

### Before Building
1. Read `../prd/WORKFLOW.md` — this is how we work
2. Read `../prd/requirements.md` — what to build
3. Read `../prd/architecture.md` — system flow
4. Read `docs/tasks.md` — what's next
5. Read `docs/architecture.md` — current code structure

### After Building
6. Update `docs/IMPLEMENTATION.md` — what was actually built
7. Update `docs/architecture.md` — if code structure changed
8. **STOP and ask the user** for approval before clearing `docs/tasks.md`
9. After approval, clear `docs/tasks.md`
10. Commit

**DO NOT** clear `docs/tasks.md` automatically or immediately.
**ALWAYS** wait for explicit user approval before clearing.
**DO NOT** start next phase until all steps are done.

---

## Rules

### DO
- Read `../prd/WORKFLOW.md` — this is how we work
- Read `../prd/requirements.md` and `../prd/architecture.md` before starting any work
- Read `docs/tasks.md` — what to build next
- Read `docs/architecture.md` — current code structure
- Follow the existing code structure (routes → controllers → services)
- Use TypeScript strict mode
- Validate inputs in controllers (no Zod dependency)
- Return consistent JSON response format
- Write tests for new endpoints
- Update `docs/IMPLEMENTATION.md` after building — what was actually built
- Update `docs/architecture.md` if code structure changed

### DO NOT
- **DO NOT implement anything from `../prd/proposals/`** — they are not approved
- Do NOT add authentication (not in MVP)
- Do NOT add new dependencies without asking
- Do NOT modify the Prisma schema without updating this file
- Do NOT expose the Gemini API key in any response
- **DO NOT install outdated or RC versions of packages** — always install the latest stable version
- **DO NOT guess or assume any real-time data** — always use the websearch tool to verify latest versions, APIs, documentation, or any information from the internet

---

## Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Run Prisma Studio (view database)
npx prisma studio

# Run migrations
npx prisma migrate dev
```

---

## Project Structure

```
lexi-backend/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── migrations/        # Database migrations
├── src/
│   ├── index.ts           # Server entry point
│   ├── app.ts             # Express app setup
│   ├── config/
│   │   └── env.ts         # Environment variables
│   ├── types/
│   │   └── ai.ts          # AIData shape (aiData jsonb)
│   ├── middleware/
│   │   └── errorHandler.ts
│   ├── routes/
│   │   ├── vocabulary.routes.ts
│   │   ├── review.routes.ts
│   │   └── dashboard.routes.ts
│   ├── controllers/
│   │   ├── vocabulary.controller.ts
│   │   ├── review.controller.ts
│   │   └── dashboard.controller.ts
│   ├── services/
│   │   ├── vocabulary.service.ts
│   │   ├── review.service.ts
│   │   ├── scoring.service.ts
│   │   ├── dashboard.service.ts
│   │   ├── aiQueue.service.ts    # background AI generation worker + persistAIData
│   │   └── ai.service.ts
│   ├── prompts/
│   │   └── ai.prompts.ts  # Gemini prompt templates
│   └── utils/
│       ├── ApiError.ts
│       └── catchAsync.ts
├── test/
├── package.json
├── tsconfig.json
└── .env
```

---

## Response Format

All API responses follow this format:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": null
}
```

Error response:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Word is required",
    "details": []
  },
  "meta": null
}
```

---

## Environment Variables

```env
DATABASE_URL="postgresql://..."
GEMINI_API_KEY="..."
PORT=3001
```

(No auth in MVP — no JWT secrets.)

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/vocabulary | Add word — single (`{ word }` → 201) or bulk (`{ words[] }` → 202, async AI) |
| GET | /api/vocabulary | List words (search, filter, paginate) |
| GET | /api/vocabulary/:id | Word detail |
| GET | /api/vocabulary/:id/exercises | Review exercises (2-3 multiple-choice, with correctAnswer) |
| DELETE | /api/vocabulary/:id | Soft delete word |
| POST | /api/vocabulary/:id/regenerate-ai | Regenerate AI content |
| GET | /api/review/today | Today's review queue |
| POST | /api/review/:wordId/submit | Submit review answer |
| GET | /api/review/history | Review history |
| GET | /api/dashboard | Dashboard data |

---

## Technical Architecture

### Tech Stack
- Node.js + Express + TypeScript
- Prisma ORM + PostgreSQL (Prisma Data Platform free tier)
- Gemini API (`gemini-3.5-flash`)
- Manual validation in controllers

### Database Entities
- VocabularyWord → LearningState (1:1)
- VocabularyWord → Review (1:N)
- `VocabularyWord.aiData` (Json) — the whole AI response (meanings, examples, exercises, synonyms, antonyms, pronunciation, difficulty); `examples` are learning content, `exercises` are answerable MULTIPLE_CHOICE items

### Knowledge Scoring
- Review accuracy (65%), response time (15%), hint usage (10%), repetition count (10%) over the last 10 reviews
- SM-2 interval: correct → interval × easeFactor, incorrect → reset to 1 day

### AI Integration
- Gemini API key stored in .env (server-side only)
- JSON response mode, 3000 max output tokens
- Result stored on `VocabularyWord.aiData` (no separate cache table)
- Retry with exponential backoff (3 attempts)
- `addWord` (single) waits up to 8s for AI; **bulk add** creates words immediately and generates
  AI in the background via `aiQueue.service.ts` (concurrency 3, idempotent, boot sweep for PENDING)
- Background jobs retry in-run on failure: `MAX_ATTEMPTS = 3` with exponential backoff (2s, 4s);
  single `addWord` failures are also enqueued for retry
- `aiReady` (`aiModel !== null`) is exposed on review-queue and list responses
