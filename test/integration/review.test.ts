import request from 'supertest';
import { Prisma } from '@prisma/client';
import app from '../../src/app';
import { generateWordContent } from '../../src/services/ai.service';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/services/ai.service', () => ({
  generateWordContent: jest.fn(),
  getAIModel: jest.fn().mockReturnValue('gemini-3.5-flash'),
}));

const WORD = `reviewtest${Date.now()}`;
const CORRECT_ANSWER = 'a';

describe('Review API', () => {
  let counter = 0;

  const setupWord = async () => {
    counter += 1;
    const create = await request(app)
      .post('/api/vocabulary')
      .send({ word: `${WORD}${counter}` });
    const wordId = create.body.data.id as string;

    const exercises = await request(app).get(`/api/vocabulary/${wordId}/exercises`);
    const exerciseId = exercises.body.data.exercises[0].id as string;

    return { wordId, exerciseId };
  };

  beforeAll(() => {
    (generateWordContent as jest.Mock).mockResolvedValue({
      meanings: [{ meaning: 'a review test word', isPrimary: true }],
      examples: [{ sentence: 'A review test word sentence.', context: 'daily_life' }],
      exercises: [
        {
          question: 'What does it mean?',
          options: ['a', 'b', 'c', 'd'],
          correctAnswer: CORRECT_ANSWER,
          explanation: 'because',
        },
      ],
      synonyms: [],
      antonyms: [],
      pronunciation: '',
      difficulty: 3,
    });
  });

  describe('POST /api/review/:wordId/submit', () => {
    it('should mark a correct answer as CORRECT on the server', async () => {
      const { wordId, exerciseId } = await setupWord();

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
        responseTimeMs: 2000,
        hintUsed: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.result).toBe('CORRECT');
      expect(res.body.data.review.correctAnswer).toBe(CORRECT_ANSWER);
      expect(res.body.data.learningState.knowledgeScore).toBeGreaterThan(0);
    });

    it('should mark a wrong answer as INCORRECT on the server', async () => {
      const { wordId, exerciseId } = await setupWord();

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: 'b',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.review.result).toBe('INCORRECT');
      expect(res.body.data.review.correctAnswer).toBe(CORRECT_ANSWER);
    });

    it('should accept a skipped review without an answer', async () => {
      const { wordId, exerciseId } = await setupWord();

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        skipped: true,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.review.result).toBe('SKIPPED');
    });

    it('should schedule a skipped NEW word at least one day out', async () => {
      const { wordId, exerciseId } = await setupWord();

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        skipped: true,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.learningState.intervalDays).toBeGreaterThanOrEqual(1);
      const nextReviewAt = new Date(res.body.data.learningState.nextReviewAt).getTime();
      expect(nextReviewAt).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    });

    it('should return the same review for a repeated submissionId', async () => {
      const { wordId, exerciseId } = await setupWord();
      const submissionId = `sub-${Date.now()}-${Math.random()}`;

      const first = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
        submissionId,
      });
      const second = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
        submissionId,
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.review.id).toBe(first.body.data.review.id);
      expect(await prisma.reviewHistory.count({ where: { wordId } })).toBe(1);
    });

    it('should return 409 when a submissionId is reused for another word', async () => {
      const first = await setupWord();
      const second = await setupWord();
      const submissionId = `sub-${Date.now()}-${Math.random()}`;

      await request(app).post(`/api/review/${first.wordId}/submit`).send({
        exerciseId: first.exerciseId,
        userAnswer: CORRECT_ANSWER,
        submissionId,
      });

      const res = await request(app).post(`/api/review/${second.wordId}/submit`).send({
        exerciseId: second.exerciseId,
        userAnswer: CORRECT_ANSWER,
        submissionId,
      });

      expect(res.status).toBe(409);
    });

    it('should return 400 for an invalid responseTimeMs', async () => {
      const { wordId, exerciseId } = await setupWord();

      for (const responseTimeMs of ['fast', -1, 60001, 1.5]) {
        const res = await request(app).post(`/api/review/${wordId}/submit`).send({
          exerciseId,
          userAnswer: CORRECT_ANSWER,
          responseTimeMs,
        });
        expect(res.status).toBe(400);
      }
    });

    it('should return 400 for non-boolean hintUsed or skipped', async () => {
      const { wordId, exerciseId } = await setupWord();

      const hint = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
        hintUsed: 'true',
      });
      const skip = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        skipped: 1,
      });

      expect(hint.status).toBe(400);
      expect(skip.status).toBe(400);
    });

    it('should return 400 for an invalid submissionId', async () => {
      const { wordId, exerciseId } = await setupWord();

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
        submissionId: 123,
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 for a missing exerciseId', async () => {
      const { wordId } = await setupWord();

      const res = await request(app)
        .post(`/api/review/${wordId}/submit`)
        .send({ userAnswer: 'a' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for a missing userAnswer when not skipped', async () => {
      const { wordId, exerciseId } = await setupWord();

      const res = await request(app)
        .post(`/api/review/${wordId}/submit`)
        .send({ exerciseId });

      expect(res.status).toBe(400);
    });

    it('should return 400 for an unknown exerciseId', async () => {
      const { wordId } = await setupWord();

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId: `${wordId}-ex-99`,
        userAnswer: 'a',
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 for an exerciseId belonging to another word', async () => {
      const first = await setupWord();
      const second = await setupWord();

      const res = await request(app).post(`/api/review/${second.wordId}/submit`).send({
        exerciseId: first.exerciseId,
        userAnswer: 'a',
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 for a non-existent word', async () => {
      const res = await request(app).post('/api/review/nonexistent/submit').send({
        exerciseId: 'nonexistent-ex-0',
        userAnswer: 'a',
      });

      expect(res.status).toBe(404);
    });

    it('should return 404 for an archived word', async () => {
      const { wordId, exerciseId } = await setupWord();
      await request(app).delete(`/api/vocabulary/${wordId}`);

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
      });

      expect(res.status).toBe(404);
    });

    it('should return 409 when AI content is not ready', async () => {
      const { wordId, exerciseId } = await setupWord();
      await prisma.vocabularyWord.update({
        where: { id: wordId },
        data: { aiData: Prisma.DbNull },
      });

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
      });

      expect(res.status).toBe(409);
    });

    it('should update score after multiple correct reviews', async () => {
      const { wordId, exerciseId } = await setupWord();

      for (let i = 0; i < 3; i++) {
        await request(app).post(`/api/review/${wordId}/submit`).send({
          exerciseId,
          userAnswer: CORRECT_ANSWER,
          responseTimeMs: 2000,
        });
      }

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
        responseTimeMs: 2000,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.learningState.repetitions).toBeGreaterThan(1);
      expect(res.body.data.learningState.knowledgeScore).toBeGreaterThan(0);
    });
  });

  describe('Knowledge score ordering', () => {
    it('should use the newest 10 reviews regardless of DB insertion order', async () => {
      const { wordId, exerciseId } = await setupWord();

      const day = 24 * 60 * 60 * 1000;
      const base = Date.now() - 20 * day;

      await prisma.reviewHistory.create({
        data: {
          wordId,
          exerciseType: 'MULTIPLE_CHOICE',
          result: 'INCORRECT',
          responseTimeMs: 2000,
          hintUsed: false,
          createdAt: new Date(Date.now() - day),
        },
      });

      for (let i = 0; i < 9; i++) {
        await prisma.reviewHistory.create({
          data: {
            wordId,
            exerciseType: 'MULTIPLE_CHOICE',
            result: 'CORRECT',
            responseTimeMs: 2000,
            hintUsed: false,
            createdAt: new Date(base + i * day),
          },
        });
      }

      const res = await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
        responseTimeMs: 2000,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.learningState.knowledgeScore).toBeLessThan(0.95);
    });
  });

  describe('GET /api/review/today', () => {
    it('should return a lightweight review queue (no aiData)', async () => {
      await setupWord();

      const res = await request(app).get('/api/review/today');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalDue');
      expect(Array.isArray(res.body.data.queue)).toBe(true);
      expect(res.body.data.queue.length).toBeGreaterThan(0);

      for (const item of res.body.data.queue) {
        expect(item).not.toHaveProperty('aiData');
        expect(typeof item.aiReady).toBe('boolean');
        expect(Object.keys(item).sort()).toEqual([
          'aiReady',
          'knowledgeScore',
          'priority',
          'status',
          'word',
          'wordId',
        ]);
      }
    });

    it('should report totals beyond the returned queue cap', async () => {
      const suffix = Date.now();
      const rows = Array.from({ length: 31 }, (_, i) => ({
        id: `queue-${suffix}-${i}`,
        word: `queueword${suffix}${i}`,
      }));

      await prisma.vocabularyWord.createMany({ data: rows });
      await prisma.learningState.createMany({
        data: rows.map((row) => ({
          wordId: row.id,
          status: 'LEARNING' as const,
          nextReviewAt: new Date(Date.now() - 60_000),
        })),
      });

      const res = await request(app).get('/api/review/today');

      expect(res.status).toBe(200);
      expect(res.body.data.reviewWords).toBeGreaterThanOrEqual(31);
      expect(res.body.data.totalDue).toBeGreaterThanOrEqual(31);
      expect(res.body.data.queue).toHaveLength(30);
    });
  });

  describe('GET /api/review/history', () => {
    it('should return review history', async () => {
      const res = await request(app).get('/api/review/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should filter by wordId', async () => {
      const { wordId, exerciseId } = await setupWord();
      await request(app).post(`/api/review/${wordId}/submit`).send({
        exerciseId,
        userAnswer: CORRECT_ANSWER,
      });

      const res = await request(app).get(`/api/review/history?wordId=${wordId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should return 400 for invalid pagination', async () => {
      for (const query of ['page=0', 'page=abc', 'limit=101']) {
        const res = await request(app).get(`/api/review/history?${query}`);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
