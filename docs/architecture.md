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
├── aiData (Json)        — full AI response: meanings, exercises, synonyms, antonyms, pronunciation, difficulty
├── LearningState (1:1)
└── Review (1:N)
```

Only three tables exist: `VocabularyWord`, `LearningState`, `Review`.
The whole AI response for a word lives in the single `aiData` JSON column
(plus denormalized `aiModel`, `aiUpdatedAt`, `pronunciation`, `difficulty`).

---

## API Design

### Vocabulary Endpoints

```
POST   /api/vocabulary              — Add word
GET    /api/vocabulary              — List (search, filter, paginate)
GET    /api/vocabulary/:id          — Detail
GET    /api/vocabulary/:id/exercises — 2-3 review exercises (with correctAnswer)
DELETE /api/vocabulary/:id          — Soft delete
POST   /api/vocabulary/:id/regenerate-ai
```

### Review Endpoints

```
GET    /api/review/today            — Today's queue
POST   /api/review/:wordId/submit   — Submit answer
GET    /api/review/history          — History
```

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

### Prompt Structure

```
Word: {word}
Part of speech: {partOfSpeech}
Context: {sourceContext}

Generate JSON:
{
  "meanings": [{ "meaning": "...", "isPrimary": true }],
  "exercises": [
    { "type": "EXAMPLE", "content": "...", "context": "..." },
    { "type": "MULTIPLE_CHOICE", "question": "...", "options": ["..."], "correctAnswer": "...", "explanation": "..." }
  ],
  "synonyms": [...],
  "antonyms": [...],
  "pronunciation": "...",
  "difficulty": 1-5
}
```

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
