import request from 'supertest';
import app from '../../src/app';

describe('Vocabulary API', () => {
  let wordId: string;

  describe('POST /api/vocabulary', () => {
    it('should create a new word', async () => {
      const res = await request(app)
        .post('/api/vocabulary')
        .send({ word: 'testword', partOfSpeech: 'noun' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.word).toBe('testword');
      wordId = res.body.data.id;
    });

    it('should return 400 for missing word', async () => {
      const res = await request(app)
        .post('/api/vocabulary')
        .send({ partOfSpeech: 'noun' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 409 for duplicate word', async () => {
      const res = await request(app)
        .post('/api/vocabulary')
        .send({ word: 'testword' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/vocabulary', () => {
    it('should list words', async () => {
      const res = await request(app).get('/api/vocabulary');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toHaveProperty('total');
    });

    it('should search words', async () => {
      const res = await request(app).get('/api/vocabulary?search=test');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/vocabulary/:id', () => {
    it('should get word by id', async () => {
      const res = await request(app).get(`/api/vocabulary/${wordId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(wordId);
    });

    it('should return 404 for non-existent word', async () => {
      const res = await request(app).get('/api/vocabulary/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/vocabulary/:id', () => {
    it('should soft delete word', async () => {
      const res = await request(app).delete(`/api/vocabulary/${wordId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isArchived).toBe(true);
    });
  });
});
