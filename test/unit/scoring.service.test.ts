import {
  SCORE_WEIGHTS,
  calculateKnowledgeScore,
  calculateNewInterval,
  calculateScoreBreakdown,
  getStatusFromScore,
  calculatePriorityScore,
  type ReviewSignals,
} from '../../src/services/scoring.service';

const makeReview = (overrides: Partial<ReviewSignals> = {}): ReviewSignals => ({
  result: 'CORRECT',
  responseTimeMs: 2000,
  hintUsed: false,
  ...overrides,
});

describe('Scoring Service', () => {
  describe('calculateScoreBreakdown', () => {
    it('returns a zero score for no reviews and no interval', () => {
      const { score, breakdown } = calculateScoreBreakdown([], 0);

      expect(score).toBe(0);
      expect(breakdown).toEqual({
        accuracy: 0,
        interval: 0,
        responseTime: 0,
        hint: 0,
        repetition: 0,
      });
    });

    it('scores all-correct, fast, hint-free reviews highly', () => {
      const reviews = Array.from({ length: 8 }, () => makeReview({ responseTimeMs: 0 }));
      const { score, breakdown } = calculateScoreBreakdown(reviews, 30);

      expect(breakdown.accuracy).toBe(1);
      expect(breakdown.interval).toBe(1);
      expect(breakdown.responseTime).toBe(1);
      expect(breakdown.hint).toBe(1);
      expect(breakdown.repetition).toBe(1);
      expect(score).toBeCloseTo(1);
    });

    it('counts PARTIAL as half accuracy', () => {
      const reviews = [makeReview(), makeReview({ result: 'PARTIAL' })];
      const { breakdown } = calculateScoreBreakdown(reviews, 0);

      expect(breakdown.accuracy).toBeCloseTo(0.75);
    });

    it('excludes SKIPPED reviews from accuracy, time, hint, and repetition', () => {
      const reviews = [
        makeReview(),
        makeReview({ hintUsed: true, responseTimeMs: 8000 }),
        makeReview({ result: 'SKIPPED', hintUsed: true, responseTimeMs: 9000 }),
        makeReview({ result: 'SKIPPED', hintUsed: true, responseTimeMs: 9000 }),
      ];
      const { breakdown } = calculateScoreBreakdown(reviews, 0);

      expect(breakdown.accuracy).toBe(1);
      expect(breakdown.hint).toBe(0.5);
      expect(breakdown.repetition).toBe(0.25);
    });

    it('caps the interval component at 30 days', () => {
      expect(calculateScoreBreakdown([], 0).breakdown.interval).toBe(0);
      expect(calculateScoreBreakdown([], 30).breakdown.interval).toBe(1);
      expect(calculateScoreBreakdown([], 90).breakdown.interval).toBe(1);
    });

    it('computes response time linearly up to the cap', () => {
      const at = (responseTimeMs: number) =>
        calculateScoreBreakdown([makeReview({ responseTimeMs })], 0).breakdown.responseTime;

      expect(at(0)).toBe(1);
      expect(at(5000)).toBeCloseTo(0.5);
      expect(at(10000)).toBe(0);
      expect(at(20000)).toBe(0);
    });

    it('uses the default response time when none is recorded', () => {
      const { breakdown } = calculateScoreBreakdown([makeReview({ responseTimeMs: null })], 0);

      expect(breakdown.responseTime).toBeCloseTo(0.5);
    });

    it('weights the five components with SCORE_WEIGHTS', () => {
      const { score, breakdown } = calculateScoreBreakdown(
        [makeReview({ responseTimeMs: 5000 })],
        30
      );
      const expected =
        breakdown.accuracy * SCORE_WEIGHTS.accuracy +
        breakdown.interval * SCORE_WEIGHTS.interval +
        breakdown.responseTime * SCORE_WEIGHTS.responseTime +
        breakdown.hint * SCORE_WEIGHTS.hint +
        breakdown.repetition * SCORE_WEIGHTS.repetition;

      expect(score).toBeCloseTo(expected);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('keeps the wrapper in sync with the breakdown', () => {
      const reviews = [makeReview(), makeReview({ result: 'INCORRECT' })];

      expect(calculateKnowledgeScore(reviews, 10)).toBe(
        calculateScoreBreakdown(reviews, 10).score
      );
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

    it('does not shorten an existing interval on skipped', () => {
      const result = calculateNewInterval({ ...baseState, repetitions: 3, intervalDays: 6 } as never, 'SKIPPED');
      expect(result.intervalDays).toBe(6);
      expect(result.repetitions).toBe(3);
    });

    it('schedules a skipped NEW word one day out', () => {
      const result = calculateNewInterval(baseState as never, 'SKIPPED');
      expect(result.intervalDays).toBe(1);
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
