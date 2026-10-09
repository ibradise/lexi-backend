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
| Validation | Zod |
| AI | Gemini API |

---

## Database Schema

### Entities

```
VocabularyWord
├── WordMeaning (1:N)
├── Example (1:N)
├── LearningState (1:1)
├── Review (1:N)
└── AICacheEntry (1:N)
```

---

## API Design

### Vocabulary Endpoints

```
POST   /api/vocabulary              — Add word
GET    /api/vocabulary              — List (search, filter, paginate)
GET    /api/vocabulary/:id          — Detail
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
| Review accuracy | 40% |
| Interval length | 25% |
| Response time | 15% |
| Hint usage | 10% |
| Repetition count | 10% |

### SM-2 Interval

```
Correct: interval = previousInterval × easeFactor
Incorrect: interval = 1 day, easeFactor -= 0.2
Partial: interval = previousInterval × 0.5
```

---

## AI Integration

### Provider: Gemini API

- Model: gemini-1.5-flash (free tier)
- API key stored in .env (server-side only)
- Response cached in AICacheEntry table
- Retry with exponential backoff (3 attempts)

### Prompt Structure

```
Word: {word}
Part of speech: {partOfSpeech}
Context: {sourceContext}

Generate JSON:
{
  "meanings": [...],
  "examples": [...],
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
