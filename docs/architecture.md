# Lexi Backend — Technical Architecture

> Detailed backend implementation design. For high-level system flow, see `../prd/architecture.md`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express |
| Language | TypeScript |
| ORM | Prisma |
| Database | PostgreSQL (Prisma Data Platform free tier) |
| Validation | Manual (in controllers) |
| AI | Gemini API (`gemini-3.5-flash`) |

---

## Database Schema

### Entities

```
VocabularyWord
├── aiData (Json)        — full AI response: meanings, examples, exercises, synonyms, antonyms, pronunciation, difficulty
├── LearningState (1:1)
└── ReviewHistory (1:N)
```

Only three tables exist: `VocabularyWord`, `LearningState`, `ReviewHistory`.
The whole AI response for a word lives in the single `aiData` JSON column
(plus denormalized `aiModel`, `aiUpdatedAt`, `pronunciation`, `difficulty`).

> **Query projections:** queries fetch only the columns they need via `select`
> (or `omit: { aiData: true }` for lists) so the heavy `aiData` jsonb is never
> loaded when unused. Full `aiData` is returned only by `GET /api/vocabulary/:id`
> and used by `getExercises` / `regenerateAI`.

---

## API Design

### Vocabulary Endpoints

```
POST   /api/vocabulary              — Add word (single `{ word }` → 201, or bulk `{ words[] }` → 202)
GET    /api/vocabulary              — List (search, filter, paginate; includes `aiReady`)
GET    /api/vocabulary/:id          — Detail
GET    /api/vocabulary/:id/exercises — 2-3 review exercises (with correctAnswer)
DELETE /api/vocabulary/:id          — Soft delete
POST   /api/vocabulary/:id/regenerate-ai
```

### Review Endpoints

```
GET    /api/review/today            — Today's queue
POST   /api/review/:wordId/submit   — Submit `{ exerciseId, userAnswer?, skipped? }`; server derives the result
GET    /api/review/history          — History
```

### Answer validation

Exercises are returned with stable ids (`<wordId>-ex-<aiDataIndex>`) and the
`correctAnswer`. On submit, the server resolves the exercise from the word's
`aiData`, compares the normalized `userAnswer`, and stores the derived
`ReviewHistory.result` (plus `correctAnswer`) — the client cannot dictate the
score. `skipped: true` records `SKIPPED`. Archived words and words without AI
content are rejected (404 / 409).

### Dashboard Endpoints

```
GET    /api/dashboard               — Dashboard data
```

---

## Knowledge Scoring

### Score Components

| Signal | Weight |
|--------|--------|
| Review accuracy | 65% |
| Response time | 15% |
| Hint usage | 10% |
| Repetition count | 10% |

(Computed over the last 10 reviews — see `src/services/scoring.service.ts`.)

### SM-2 Interval

```
Correct: interval = previousInterval × easeFactor
Incorrect: interval = 1 day, easeFactor -= 0.2
Partial: interval = previousInterval × 0.5
```

---

## AI Integration

### Provider: Gemini API

- Model: `gemini-3.5-flash`
- API key stored in .env (server-side only)
- `responseMimeType: 'application/json'`, `maxOutputTokens: 3000`
- Retry with exponential backoff (3 attempts)
- No external cache table: the generated result is stored on `VocabularyWord.aiData`
- `addWord` waits up to 8s; on timeout/failure the word stays PENDING (`aiData = null`)

### Background worker (`src/services/aiQueue.service.ts`)

Bulk add must not block on AI, because the user may close the app immediately.

```
POST /api/vocabulary { words: [...] }
  → normalize + dedupe → create words + NEW LearningState (transaction)
  → 202 Accepted { added, duplicates, invalid }
  → enqueueAIGeneration(ids)            (fire-and-forget, concurrency 3)
       └─ generateWordContent → persistAIData   (idempotent: skips words with aiData)
  → on boot: sweepPendingWords() re-enqueues every `aiModel = null` word
```

- In-memory queue, concurrency **3**; failures **retry in-run with exponential backoff**
  (`MAX_ATTEMPTS = 3`, base 2s → 2s, 4s) and are then left PENDING for the boot sweep / `regenerate-ai`
- Single `addWord` failures/timeouts are also handed to the worker (enqueue-on-failure)
- `aiReady` (`aiModel !== null`) is surfaced on review-queue and list responses so the
  client can show "preparing…" while content is still generating
- Words are visible in `GET /review/today` (NEW queue) as soon as they are created

### Prompt Structure

```
Word: {word}
Part of speech: {partOfSpeech}
Context: {sourceContext}

Generate JSON:
{
  "meanings": [{ "meaning": "...", "isPrimary": true }],
  "examples": [
    { "sentence": "...", "context": "workplace|relationships|..." }
  ],
  "exercises": [
    { "question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": "...", "explanation": "..." }
  ],
  "synonyms": [...],
  "antonyms": [...],
  "pronunciation": "...",
  "difficulty": 1-5
}
```

> Examples (learning content) and exercises (answerable items) are separate fields.
> Examples are never scored; `exercises` holds only `MULTIPLE_CHOICE` items.

---

## Error Handling

| Category | HTTP Code |
|----------|-----------|
| Validation | 400 |
| Not Found | 404 |
| Conflict (duplicate) | 409 |
| AI Failure | 502 |
| Rate Limit | 429 |
| Internal | 500 |
