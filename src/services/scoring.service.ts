import { ReviewHistory, LearningState } from '@prisma/client';

export type ReviewSignals = Pick<ReviewHistory, 'result' | 'responseTimeMs' | 'hintUsed'>;

export const calculateKnowledgeScore = (reviews: ReviewSignals[]): number => {
  if (reviews.length === 0) return 0;

  const last10 = reviews.slice(-10);

  const correctCount = last10.filter((r) => r.result === 'CORRECT').length;
  const accuracyComponent = correctCount / last10.length;

// Reverse the response-time ratio(1 - avgResponseTime) so faster answers get higher scores, indicating the user is more familiar with the word.
  const avgResponseTime =
    last10.reduce((sum, r) => sum + (r.responseTimeMs || 5000), 0) / last10.length;
  const timeComponent = Math.max(0, 1 - avgResponseTime / 10000);

  const hintCount = last10.filter((r) => r.hintUsed).length;
  const hintComponent = 1 - hintCount / last10.length;

  const repetitionComponent = Math.min(reviews.length / 8, 1.0);

  return (
    accuracyComponent * 0.65 +
    timeComponent * 0.15 +
    hintComponent * 0.1 +
    repetitionComponent * 0.1
  );
};

export const calculateNewInterval = (
  state: LearningState,
  result: 'CORRECT' | 'INCORRECT' | 'PARTIAL' | 'SKIPPED'
): { intervalDays: number; easeFactor: number; repetitions: number } => {
  if (result === 'SKIPPED') {
    return {
      intervalDays: state.intervalDays,
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
