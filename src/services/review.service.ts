import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import {
  calculateKnowledgeScore,
  calculateNewInterval,
  getStatusFromScore,
  calculatePriorityScore,
} from './scoring.service';

interface SubmitReviewInput {
  wordId: string;
  exerciseType: string;
  result: 'CORRECT' | 'INCORRECT' | 'PARTIAL' | 'SKIPPED';
  responseTimeMs?: number;
  userAnswer?: string;
  hintUsed: boolean;
}

export const submitReview = async (input: SubmitReviewInput) => {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id: input.wordId },
    include: { learningState: true, reviews: true },
  });

  if (!word) {
    throw new ApiError(404, 'NOT_FOUND', 'Word not found');
  }

  const review = await prisma.review.create({
    data: {
      wordId: input.wordId,
      exerciseType: input.exerciseType as never,
      result: input.result,
      responseTimeMs: input.responseTimeMs,
      userAnswer: input.userAnswer,
      hintUsed: input.hintUsed,
    },
  });

  const allReviews = [...word.reviews, review];
  const newScore = calculateKnowledgeScore(allReviews);
  const newStatus = getStatusFromScore(newScore);

  const currentInterval = word.learningState?.intervalDays || 0;
  const currentEase = word.learningState?.easeFactor || 2.5;
  const currentReps = word.learningState?.repetitions || 0;

  const { intervalDays, easeFactor, repetitions } = calculateNewInterval(
    {
      intervalDays: currentInterval,
      easeFactor: currentEase,
      repetitions: currentReps,
    } as never,
    input.result
  );

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

  const learningState = await prisma.learningState.upsert({
    where: { wordId: input.wordId },
    create: {
      wordId: input.wordId,
      status: newStatus as never,
      knowledgeScore: newScore,
      easeFactor,
      intervalDays,
      repetitions,
      nextReviewAt,
      lastReviewedAt: new Date(),
    },
    update: {
      status: newStatus as never,
      knowledgeScore: newScore,
      easeFactor,
      intervalDays,
      repetitions,
      nextReviewAt,
      lastReviewedAt: new Date(),
    },
  });

  return {
    review,
    learningState,
  };
};

export const getTodayReview = async () => {
  const now = new Date();
  const words = await prisma.vocabularyWord.findMany({
    where: {
      isArchived: false,
      learningState: {
        nextReviewAt: { lte: now },
      },
    },
    include: { learningState: true },
    take: 30,
  });

  const newWords = await prisma.vocabularyWord.findMany({
    where: {
      isArchived: false,
      learningState: { status: 'NEW' },
    },
    include: { learningState: true },
    take: 5,
  });

  const queue = [...words, ...newWords]
    .map((w) => {
      const ls = w.learningState;
      const daysSinceLastReview = ls?.lastReviewedAt
        ? Math.floor((Date.now() - ls.lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 30;
      const priority = calculatePriorityScore(
        ls?.knowledgeScore || 0,
        ls?.nextReviewAt || null,
        daysSinceLastReview,
        ls?.status === 'NEW'
      );
      return {
        wordId: w.id,
        word: w.word,
        priority,
        knowledgeScore: ls?.knowledgeScore || 0,
        status: ls?.status || 'NEW',
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 30);

  return {
    totalDue: queue.length,
    newWords: queue.filter((q) => q.status === 'NEW').length,
    reviewWords: queue.filter((q) => q.status !== 'NEW').length,
    queue,
  };
};

export const getReviewHistory = async (wordId?: string, page = 1, limit = 20) => {
  const where: Record<string, unknown> = wordId ? { wordId } : {};
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: { word: { select: { word: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  return {
    items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};
