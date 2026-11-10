import { ReviewHistory, LearningState } from '@prisma/client';

export type ReviewSignals = Pick<ReviewHistory, 'result' | 'responseTimeMs' | 'hintUsed'>;

export interface ScoreBreakdown {
  accuracy: number;
  interval: number;
  responseTime: number;
  hint: number;
  repetition: number;
}

export interface KnowledgeScore {
  score: number;
  breakdown: ScoreBreakdown;
}

export const SCORE_WEIGHTS = {
  accuracy: 0.45,
  interval: 0.2,
  responseTime: 0.15,
  hint: 0.1,
  repetition: 0.1,
} as const;

export const INTERVAL_CAP_DAYS = 30;
export const RESPONSE_TIME_CAP_MS = 10000;
export const DEFAULT_RESPONSE_TIME_MS = 5000;
export const REPETITION_TARGET = 8;

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

const accuracyPoints = (result: ReviewSignals['result']): number => {
  if (result === 'CORRECT') return 1;
  if (result === 'PARTIAL') return 0.5;
  return 0;
};

export const calculateScoreBreakdown = (
  reviews: ReviewSignals[],
  intervalDays: number
): KnowledgeScore => {
  const answered = reviews.filter((r) => r.result !== 'SKIPPED');
  const last10 = answered.slice(-10);

  const accuracy =
    last10.length === 0
      ? 0
      : last10.reduce((sum, r) => sum + accuracyPoints(r.result), 0) / last10.length;

  const avgResponseTime =
    last10.length === 0
      ? 0
      : last10.reduce(
          (sum, r) => sum + (r.responseTimeMs ?? DEFAULT_RESPONSE_TIME_MS),
          0
        ) / last10.length;
  const responseTime =
    last10.length === 0 ? 0 : clamp(1 - avgResponseTime / RESPONSE_TIME_CAP_MS);

  const hint =
    last10.length === 0
      ? 0
      : 1 - last10.filter((r) => r.hintUsed).length / last10.length;

  const repetition = clamp(answered.length / REPETITION_TARGET);
  const interval = clamp(Math.max(0, intervalDays) / INTERVAL_CAP_DAYS);

  const breakdown: ScoreBreakdown = {
    accuracy: clamp(accuracy),
    interval,
    responseTime,
    hint: clamp(hint),
    repetition,
  };

  const score = clamp(
    breakdown.accuracy * SCORE_WEIGHTS.accuracy +
      breakdown.interval * SCORE_WEIGHTS.interval +
      breakdown.responseTime * SCORE_WEIGHTS.responseTime +
      breakdown.hint * SCORE_WEIGHTS.hint +
      breakdown.repetition * SCORE_WEIGHTS.repetition
  );

  return { score, breakdown };
};

export const calculateKnowledgeScore = (reviews: ReviewSignals[], intervalDays = 0): number => calculateScoreBreakdown(reviews, intervalDays).score;

export const calculateNewInterval = (
  state: LearningState,
  result: 'CORRECT' | 'INCORRECT' | 'PARTIAL' | 'SKIPPED'
): { intervalDays: number; easeFactor: number; repetitions: number } => {
  if (result === 'SKIPPED') {
    return {
      intervalDays: Math.max(1, state.intervalDays),
      easeFactor: state.easeFactor,
      repetitions: state.repetitions,
    };
  }

  if (result === 'CORRECT') {
    const newRepetitions = state.repetitions + 1;
    let newInterval: number;
    if (newRepetitions === 1) newInterval = 1;
    else if (newRepetitions === 2) newInterval = 3;
    else newInterval = Math.round(state.intervalDays * state.easeFactor);
    return { intervalDays: newInterval, easeFactor: state.easeFactor, repetitions: newRepetitions };
  }

  if (result === 'PARTIAL') {
    return {
      intervalDays: Math.max(1, Math.round(state.intervalDays * 0.5)),
      easeFactor: Math.max(1.3, state.easeFactor - 0.1),
      repetitions: state.repetitions,
    };
  }

  return {
    intervalDays: 1,
    easeFactor: Math.max(1.3, state.easeFactor - 0.2),
    repetitions: 0,
  };
};

export const getStatusFromScore = (score: number): string => {
  if (score >= 0.9) return 'MASTERED';
  if (score >= 0.65) return 'STRONG';
  if (score >= 0.4) return 'FAMILIAR';
  if (score >= 0.01) return 'LEARNING';
  return 'NEW';
};

export const calculatePriorityScore = (
  knowledgeScore: number,
  nextReviewAt: Date | null,
  daysSinceLastReview: number,
  isNew: boolean
): number => {
  let urgency: number;
  if (!nextReviewAt) urgency = 1.0;
  else if (nextReviewAt <= new Date()) urgency = 1.0;
  else {
    const daysUntilReview = Math.ceil(
      (nextReviewAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    urgency = Math.max(0, 1 - daysUntilReview / 7);
  }

  const weakness = 1 - knowledgeScore;
  const recency = Math.min(daysSinceLastReview / 30, 1.0);
  const newWordWeight = isNew ? 1 : 0;

  const forgettingRisk = Math.exp(-daysSinceLastReview / 30);

  return urgency * 0.35 + weakness * 0.3 + recency * 0.15 + newWordWeight * 0.1 + forgettingRisk * 0.1;
};
