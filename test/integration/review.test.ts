import request from 'supertest';
import app from '../../src/app';
import { generateWordContent } from '../../src/services/ai.service';

jest.mock('../../src/services/ai.service', () => ({
  generateWordContent: jest.fn(),
  getAIModel: jest.fn().mockReturnValue('gemini-3.5-flash'),
}));

const WORD = `reviewtest${Date.now()}`;

describe('Review API', () => {
  let wordId: string;

  beforeAll(async () => {
    (generateWordContent as jest.Mock).mockResolvedValue({
      meanings: [{ meaning: 'a review test word', isPrimary: true }],
      examples: [{ sentence: 'A review test word sentence.', context: 'daily_life' }],
      exercises: [
        {
          question: 'What does it mean?',
          options: ['a', 'b', 'c', 'd'],
          correctAnswer: 'a',
          explanation: 'because',
        },
      ],
      synonyms: [],
      antonyms: [],
      pronunciation: '',
      difficulty: 3,
    });

    const res = await request(app).post('/api/vocabulary').send({ word: WORD });
    wordId = res.body.data.id;
  });

  describe('POST /api/review/:wordId/submit', () => {
    it('should submit a correct review', async () => {
      const res = await request(app)
        .post(`/api/review/${wordId}/submit`)
        .send({
          exerciseType: 'MULTIPLE_CHOICE',
          result: 'CORRECT',
          responseTimeMs: 2000,
          hintUsed: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.result).toBe('CORRECT');
      expect(res.body.data.learningState.knowledgeScore).toBeGreaterThan(0);
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app).post(`/api/review/${wordId}/submit`).send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 for an invalid exerciseType', async () => {
      const res = await request(app)
        .post(`/api/review/${wordId}/submit`)
        .send({ exerciseType: 'NOT_A_TYPE', result: 'CORRECT' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for a non-existent word', async () => {
      const res = await request(app)
        .post('/api/review/nonexistent/submit')
        .send({ exerciseType: 'MULTIPLE_CHOICE', result: 'CORRECT' });

      expect(res.status).toBe(404);
    });

    it('should update score after multiple reviews', async () => {
      await request(app)
        .post(`/api/review/${wordId}/submit`)
        .send({ exerciseType: 'MULTIPLE_CHOICE', result: 'CORRECT', responseTimeMs: 2000 });

      const res = await request(app)
        .post(`/api/review/${wordId}/submit`)
        .send({ exerciseType: 'MULTIPLE_CHOICE', result: 'CORRECT', responseTimeMs: 2000 });

      expect(res.status).toBe(200);
      expect(res.body.data.learningState.repetitions).toBeGreaterThan(1);
    });
  });

  describe('GET /api/review/today', () => {
    it('should return review queue', async () => {
      const res = await request(app).get('/api/review/today');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('queue');
      expect(res.body.data).toHaveProperty('totalDue');
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
      const res = await request(app).get(`/api/review/history?wordId=${wordId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
