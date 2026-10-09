import request from 'supertest';
import app from '../../src/app';

describe('Review API', () => {
  let wordId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/vocabulary')
      .send({ word: 'reviewtest' });
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
      const res = await request(app)
        .post(`/api/review/${wordId}/submit`)
        .send({});

      expect(res.status).toBe(400);
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
