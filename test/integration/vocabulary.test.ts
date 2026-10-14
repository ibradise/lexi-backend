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
  examples: [
    { sentence: 'We use testword in a sentence.', context: 'science' },
    { sentence: 'Another testword example.', context: 'daily_life' },
  ],
  exercises: [
    {
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
      expect(res.body.data.aiData.examples).toBeTruthy();
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

  describe('POST /api/vocabulary (bulk)', () => {
    it('should bulk add words and generate AI content in the background', async () => {
      const base = `bulk${Date.now()}`;
      const names = [`${base}a`, `${base}b`, `${base}c`];

      const res = await request(app).post('/api/vocabulary').send({ words: names });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.added).toHaveLength(3);
      expect(res.body.data.added.map((w: { word: string }) => w.word).sort()).toEqual(
        [...names].sort()
      );
      for (const item of res.body.data.added) {
        expect(item.id).toBeTruthy();
        expect(item.status).toBe('PENDING');
      }

      // The background worker persists aiData after the 202 response.
      const firstId = res.body.data.added[0].id;
      let ready = false;
      for (let i = 0; i < 50 && !ready; i++) {
        const get = await request(app).get(`/api/vocabulary/${firstId}`);
        ready = Boolean(get.body.data.aiData);
        if (!ready) await new Promise((r) => setTimeout(r, 100));
      }
      expect(ready).toBe(true);
    });

    it('should split on separators and de-duplicate the batch', async () => {
      const t = Date.now();
      const words = [`alpha${t}, beta${t}\ngamma${t} delta${t}`, `alpha${t}`];

      const res = await request(app).post('/api/vocabulary').send({ words });

      expect(res.status).toBe(202);
      const added = res.body.data.added.map((w: { word: string }) => w.word);
      expect(added.sort()).toEqual([`alpha${t}`, `beta${t}`, `delta${t}`, `gamma${t}`].sort());
      expect(res.body.data.duplicates).toContain(`alpha${t}`);
    });

    it('should report already-existing words as duplicates', async () => {
      const t = Date.now();
      const existing = `exist${t}`;
      await request(app).post('/api/vocabulary').send({ word: existing });

      const fresh = `fresh${t}`;
      const res = await request(app).post('/api/vocabulary').send({ words: [existing, fresh] });

      expect(res.status).toBe(202);
      expect(res.body.data.duplicates).toContain(existing);
      expect(res.body.data.added.map((w: { word: string }) => w.word)).toContain(fresh);
    });

    it('should return 400 for an empty words array', async () => {
      const res = await request(app).post('/api/vocabulary').send({ words: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 when exceeding the batch limit', async () => {
      const words = Array.from({ length: 51 }, (_, i) => `overflow${i}`);

      const res = await request(app).post('/api/vocabulary').send({ words });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('AI generation retries', () => {
    it('should retry after a failure and eventually persist aiData', async () => {
      const name = `retry${Date.now()}`;
      (generateWordContent as jest.Mock)
        .mockRejectedValueOnce(new Error('temporary failure 1'))
        .mockRejectedValueOnce(new Error('temporary failure 2'));

      const create = await request(app).post('/api/vocabulary').send({ word: name });
      expect(create.status).toBe(201);
      expect(create.body.data.aiData).toBeFalsy();

      const id = create.body.data.id;
      let ready = false;
      for (let i = 0; i < 60 && !ready; i++) {
        const get = await request(app).get(`/api/vocabulary/${id}`);
        ready = Boolean(get.body.data.aiData);
        if (!ready) await new Promise((r) => setTimeout(r, 200));
      }
      expect(ready).toBe(true);
    });

    it('should give up after MAX_ATTEMPTS and leave the word PENDING', async () => {
      const name = `giveup${Date.now()}`;
      (generateWordContent as jest.Mock).mockRejectedValue(new Error('always fails'));

      const create = await request(app).post('/api/vocabulary').send({ word: name });
      const id = create.body.data.id;

      // 1 addWord call + 3 worker attempts (retries ~2s, then ~4s apart)
      await new Promise((r) => setTimeout(r, 7500));

      const calls = (generateWordContent as jest.Mock).mock.calls.filter(
        (c) => c[0] === name
      ).length;
      expect(calls).toBe(4);

      const get = await request(app).get(`/api/vocabulary/${id}`);
      expect(get.body.data.aiData).toBeFalsy();
      expect(get.body.data.aiModel).toBeFalsy();
    });
  });

  describe('GET /api/vocabulary', () => {
    it('should list words', async () => {
      const res = await request(app).get('/api/vocabulary');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.data[0]).toHaveProperty('aiReady');
      expect(res.body.data[0]).not.toHaveProperty('aiData');
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
    it('should return 1-3 multiple-choice exercises', async () => {
      const res = await request(app).get(`/api/vocabulary/${wordId}/exercises`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.wordId).toBe(wordId);
      expect(res.body.data.exercises.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.exercises.length).toBeLessThanOrEqual(3);
      const first = res.body.data.exercises[0];
      expect(first.type).toBe('MULTIPLE_CHOICE');
      expect(first.question).toBeTruthy();
      expect(first.options).toHaveLength(4);
      expect(first.correctAnswer).toBeTruthy();
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
