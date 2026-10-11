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
