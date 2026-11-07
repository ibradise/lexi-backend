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
  });
});
