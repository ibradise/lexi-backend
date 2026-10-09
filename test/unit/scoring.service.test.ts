import {
  calculateKnowledgeScore,
  calculateNewInterval,
  getStatusFromScore,
  calculatePriorityScore,
} from '../../src/services/scoring.service';

describe('Scoring Service', () => {
  describe('calculateKnowledgeScore', () => {
    it('returns 0 for no reviews', () => {
      expect(calculateKnowledgeScore([])).toBe(0);
    });

    it('returns higher score for all correct reviews', () => {
      const reviews = Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`,
        wordId: 'w1',
        exerciseType: 'MULTIPLE_CHOICE' as const,
        result: 'CORRECT' as const,
        responseTimeMs: 2000,
        userAnswer: null,
        correctAnswer: null,
        hintUsed: false,
        createdAt: new Date(),
      }));
      const score = calculateKnowledgeScore(reviews);
      expect(score).toBeGreaterThan(0.5);
    });

    it('returns lower score for incorrect reviews', () => {
      const reviews = Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`,
        wordId: 'w1',
        exerciseType: 'MULTIPLE_CHOICE' as const,
        result: 'INCORRECT' as const,
        responseTimeMs: 8000,
        userAnswer: null,
        correctAnswer: null,
        hintUsed: true,
        createdAt: new Date(),
      }));
      const score = calculateKnowledgeScore(reviews);
      expect(score).toBeLessThan(0.3);
    });
  });

  describe('calculateNewInterval', () => {
    const baseState = {
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
    };

    it('sets interval to 1 day on first correct answer', () => {
      const result = calculateNewInterval(baseState as never, 'CORRECT');
      expect(result.intervalDays).toBe(1);
      expect(result.repetitions).toBe(1);
    });

    it('sets interval to 3 days on second correct answer', () => {
      const result = calculateNewInterval({ ...baseState, repetitions: 1, intervalDays: 1 } as never, 'CORRECT');
      expect(result.intervalDays).toBe(3);
      expect(result.repetitions).toBe(2);
    });

    it('resets to 1 day on incorrect answer', () => {
      const result = calculateNewInterval({ ...baseState, repetitions: 5, intervalDays: 10 } as never, 'INCORRECT');
      expect(result.intervalDays).toBe(1);
      expect(result.repetitions).toBe(0);
      expect(result.easeFactor).toBe(2.3);
    });

    it('halves interval on partial answer', () => {
      const result = calculateNewInterval({ ...baseState, repetitions: 3, intervalDays: 6 } as never, 'PARTIAL');
      expect(result.intervalDays).toBe(3);
      expect(result.easeFactor).toBe(2.4);
    });

    it('does not change on skipped', () => {
      const result = calculateNewInterval({ ...baseState, repetitions: 3, intervalDays: 6 } as never, 'SKIPPED');
      expect(result.intervalDays).toBe(6);
      expect(result.repetitions).toBe(3);
    });
  });

  describe('getStatusFromScore', () => {
    it('returns NEW for 0', () => {
      expect(getStatusFromScore(0)).toBe('NEW');
    });
    it('returns LEARNING for 0.2', () => {
      expect(getStatusFromScore(0.2)).toBe('LEARNING');
    });
    it('returns FAMILIAR for 0.5', () => {
      expect(getStatusFromScore(0.5)).toBe('FAMILIAR');
    });
    it('returns STRONG for 0.75', () => {
      expect(getStatusFromScore(0.75)).toBe('STRONG');
    });
    it('returns MASTERED for 0.95', () => {
      expect(getStatusFromScore(0.95)).toBe('MASTERED');
    });
  });

  describe('calculatePriorityScore', () => {
    it('returns higher priority for overdue words', () => {
      const overdue = calculatePriorityScore(0.2, new Date(Date.now() - 86400000), 5, false);
      const notDue = calculatePriorityScore(0.2, new Date(Date.now() + 86400000 * 7), 1, false);
      expect(overdue).toBeGreaterThan(notDue);
    });

    it('returns higher priority for new words', () => {
      const newWord = calculatePriorityScore(0, null, 30, true);
      const oldWord = calculatePriorityScore(0.8, new Date(), 1, false);
      expect(newWord).toBeGreaterThan(oldWord);
    });
  });
});
