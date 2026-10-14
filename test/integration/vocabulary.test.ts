import request from 'supertest';
import app from '../../src/app';
import { generateWordContent } from '../../src/services/ai.service';

jest.mock('../../src/services/ai.service', () => ({
  generateWordContent: jest.fn(),
  getAIModel: jest.fn().mockReturnValue('gemini-3.5-flash'),
}));

const WORD = `testword${Date.now()}`;

const aiFixture = {
  meanings: [{ meaning: 'a word used in tests', isPrimary: true }],
  exercises: [
    { type: 'EXAMPLE', content: 'We use testword in a sentence.', context: 'science' },
    { type: 'EXAMPLE', content: 'Another testword example.', context: 'daily_life' },
    {
      type: 'MULTIPLE_CHOICE',
      question: `What is the meaning of '${WORD}'?`,
      options: ['a word used in tests', 'a fruit', 'a color', 'a country'],
      correctAnswer: 'a word used in tests',
      explanation: 'It is a test fixture.',
    },
  ],
  synonyms: ['sample'],
  antonyms: ['awesome'],
  pronunciation: '/test/',
  difficulty: 2,
};

describe('Vocabulary API', () => {
  let wordId: string;

  beforeEach(() => {
    (generateWordContent as jest.Mock).mockResolvedValue(aiFixture);
  });

  describe('POST /api/vocabulary', () => {
    it('should create a new word and generate AI content', async () => {
      const res = await request(app)
        .post('/api/vocabulary')
        .send({ word: WORD, partOfSpeech: 'noun' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.word).toBe(WORD);
      expect(res.body.data.aiData).toBeTruthy();
      expect(res.body.data.aiModel).toBe('gemini-3.5-flash');
      expect(res.body.data.pronunciation).toBe('/test/');
      expect(res.body.data.difficulty).toBe(2);
      wordId = res.body.data.id;
    });

    it('should return 400 for missing word', async () => {
      const res = await request(app).post('/api/vocabulary').send({ partOfSpeech: 'noun' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 409 for duplicate word', async () => {
      const res = await request(app).post('/api/vocabulary').send({ word: WORD });

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
      const res = await request(app).get(`/api/vocabulary?search=${WORD}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/vocabulary/:id', () => {
    it('should get word by id with aiData', async () => {
      const res = await request(app).get(`/api/vocabulary/${wordId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(wordId);
      expect(res.body.data.aiData).toBeTruthy();
    });

    it('should return 404 for non-existent word', async () => {
      const res = await request(app).get('/api/vocabulary/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/vocabulary/:id/exercises', () => {
    it('should return 1-3 exercises including an EXAMPLE', async () => {
      const res = await request(app).get(`/api/vocabulary/${wordId}/exercises`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.wordId).toBe(wordId);
      expect(res.body.data.exercises.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.exercises.length).toBeLessThanOrEqual(3);
      expect(res.body.data.exercises.some((e: { type: string }) => e.type === 'EXAMPLE')).toBe(true);
    });

    it('should return 404 for non-existent word', async () => {
      const res = await request(app).get('/api/vocabulary/nonexistent/exercises');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/vocabulary/:id/regenerate-ai', () => {
    it('should regenerate AI content', async () => {
      const res = await request(app).post(`/api/vocabulary/${wordId}/regenerate-ai`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.aiData).toBeTruthy();
      expect(res.body.data.aiUpdatedAt).toBeTruthy();
    });

    it('should return 404 for non-existent word', async () => {
      const res = await request(app).post('/api/vocabulary/nonexistent/regenerate-ai');

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

    it('should return 404 for non-existent word', async () => {
      const res = await request(app).delete('/api/vocabulary/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
