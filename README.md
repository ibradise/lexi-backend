# Lexi Backend

AI-assisted vocabulary API with spaced repetition, built with Express, TypeScript, Prisma, and PostgreSQL.

## Status

Phases 1-13 complete. 77/77 tests passing, 6 migrations applied, TypeScript build green.

## Features

- Vocabulary CRUD with soft delete and archived-word guards
- Single and bulk add; bulk requests return `202` and generate content in the background
- AI-generated content via Gemini: pronunciation, definitions, examples, synonyms, and exercises
- Exercises with stable IDs and server-side answer validation (`CORRECT`, `INCORRECT`, `SKIPPED`)
- Idempotent review submits via `submissionId` (retries return the original result)
- SM-2 scheduling plus a five-factor knowledge score: accuracy 45%, interval 20%, response time 15%, hint usage 10%, repetition 10%
- `scoreBreakdown` returned on submit for each scoring signal
- Review history and dashboard stats
- Strict query/body validation and Prisma error mapping
- AI retry queue with boot-time sweep for pending words

## Tech Stack

- Node.js, Express, TypeScript (strict)
- Prisma ORM + PostgreSQL
- Google Gemini
- Jest + Supertest

## Getting Started

Requires Node.js 18+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env   # then fill in the values
npx prisma migrate deploy
npm run dev
```

Environment variables:

```env
DATABASE_URL="postgresql://..."
GEMINI_API_KEY="..."
PORT=3001
```

Build and run in production:

```bash
npm run build
npm start
```

## API

All API routes are under `/api` and return `{ success, data, error, meta }`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/vocabulary` | Add a word (AI generated in background) |
| GET | `/api/vocabulary` | List words with search, filter, and pagination |
| GET | `/api/vocabulary/:id` | Get word detail |
| DELETE | `/api/vocabulary/:id` | Soft delete a word |
| GET | `/api/vocabulary/:id/exercises` | Get exercises (`409` if AI is not ready) |
| POST | `/api/vocabulary/:id/regenerate-ai` | Regenerate AI content |
| GET | `/api/review/today` | Get today's review queue |
| POST | `/api/review/:wordId/submit` | Submit a review answer |
| GET | `/api/review/history` | Paginated review history |
| GET | `/api/dashboard` | Dashboard stats and progress |
| GET | `/health` | Health check |

## Testing

```bash
npm test
```

Tests run serially against a live PostgreSQL database. Use `npm run recompute-scores` to backfill knowledge scores and statuses from review history.

## Project Structure

```
src/
  routes/        HTTP routes
  controllers/   request validation and response shaping
  services/      business logic (vocabulary, review, scoring, AI queue)
  middleware/    error handling
  utils/         query parsing helpers
  scripts/       maintenance scripts
prisma/          schema and migrations
test/            unit and integration tests
docs/            architecture, implementation log, task tracking
```

## Documentation

- `AGENTS.md` - project conventions and API summary
- `docs/architecture.md` - data model, scoring, and AI flow
- `docs/IMPLEMENTATION.md` - phase-by-phase implementation log
- `docs/tasks.md` - task tracking and roadmap

## Not Done / Next

- Authentication and per-user data scoping
- Rate limiting and request size limits
- CI pipeline (build + tests)
- Remaining PRD exercise types (currently `MULTIPLE_CHOICE` only)
- `currentStreak` and timezone-aware daily stats
- Production deploy hardening
- Flutter mobile client
