import { Prisma, ReviewResult } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { AIData } from '../types/ai';
import {
  calculateKnowledgeScore,
  calculateNewInterval,
  getStatusFromScore,
  calculatePriorityScore,
} from './scoring.service';

interface SubmitReviewInput {
  wordId: string;
  exerciseId: string;
  userAnswer?: string;
  responseTimeMs?: number;
  hintUsed: boolean;
  skipped?: boolean;
}

const normalizeAnswer = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const findExercise = (wordId: string, exerciseId: string, aiData: AIData) => {
  const prefix = `${wordId}-ex-`;
  if (!exerciseId.startsWith(prefix)) return null;

  const rawIndex = exerciseId.slice(prefix.length);
  if (!/^\d+$/.test(rawIndex)) return null;

  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= aiData.exercises.length) return null;

  return aiData.exercises[index] ?? null;
};
  
export const submitReview = async (input: SubmitReviewInput) => {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id: input.wordId },
    select: {
      id: true,
      isArchived: true,
      aiData: true,
      learningState: {
        select: { intervalDays: true, easeFactor: true, repetitions: true },
      },
      reviews: {
        select: { result: true, responseTimeMs: true, hintUsed: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  });

  if (!word || word.isArchived) {
    throw new ApiError(404, 'NOT_FOUND', 'Word not found');
  }

  const aiData = (word.aiData as unknown as AIData | null) ?? null;
  if (!aiData) {
    throw new ApiError(409, 'AI_NOT_READY', 'AI content is not ready for this word');
  }

  const exercise = findExercise(word.id, input.exerciseId, aiData);
  if (!exercise) {
    throw new ApiError(400, 'INVALID_EXERCISE', 'Exercise not found for this word');
  }

  const result: ReviewResult = input.skipped
    ? 'SKIPPED'
    : normalizeAnswer(input.userAnswer ?? '') === normalizeAnswer(exercise.correctAnswer)
      ? 'CORRECT'
      : 'INCORRECT';

  return prisma.$transaction(async (tx) => {
    const review = await tx.reviewHistory.create({
      data: {
        wordId: input.wordId,
        exerciseType: 'MULTIPLE_CHOICE',
        result,
        responseTimeMs: input.responseTimeMs,
        userAnswer: input.userAnswer,
        correctAnswer: exercise.correctAnswer,
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
      result
    );

    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

    const learningState = await tx.learningState.upsert({
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

    return { review, learningState };
  });
};

const queueSelect = {
  id: true,
  word: true,
  aiModel: true,
  learningState: {
    select: {
      knowledgeScore: true,
      nextReviewAt: true,
      lastReviewedAt: true,
      status: true,
    },
  },
} satisfies Prisma.VocabularyWordSelect;

export const getTodayReview = async () => {
  const now = new Date();
  const words = await prisma.vocabularyWord.findMany({
    where: {
      isArchived: false,
      learningState: {
        nextReviewAt: { lte: now },
      },
    },
    select: queueSelect,
    take: 30,
  });

  const newWords = await prisma.vocabularyWord.findMany({
    where: {
      isArchived: false,
      learningState: { status: 'NEW' },
    },
    select: queueSelect,
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
        aiReady: w.aiModel !== null,
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
  const where: Record<string, unknown> = {
    word: { isArchived: false },
    ...(wordId ? { wordId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.reviewHistory.findMany({
      where,
      include: { word: { select: { word: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reviewHistory.count({ where }),
  ]);

  return {
    items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};
