import { Prisma, ReviewResult } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { AIData } from '../types/ai';
import {
  calculateNewInterval,
  calculateScoreBreakdown,
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
  submissionId?: string;
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

const findExistingSubmission = async (wordId: string, submissionId: string) => {
  const review = await prisma.reviewHistory.findUnique({ where: { submissionId } });
  if (!review) return null;

  if (review.wordId !== wordId) {
    throw new ApiError(409, 'CONFLICT', 'submissionId already used for another word');
  }

  const [learningState, reviews] = await Promise.all([
    prisma.learningState.findUnique({ where: { wordId } }),
    prisma.reviewHistory.findMany({
      where: { wordId },
      select: { result: true, responseTimeMs: true, hintUsed: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const { breakdown } = calculateScoreBreakdown(reviews, learningState?.intervalDays ?? 0);
  return { review, learningState, scoreBreakdown: breakdown };
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

  if (input.submissionId) {
    const existing = await findExistingSubmission(input.wordId, input.submissionId);
    if (existing) return existing;
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

  try {
    return await prisma.$transaction(async (tx) => {
      const review = await tx.reviewHistory.create({
        data: {
          wordId: input.wordId,
          submissionId: input.submissionId,
          exerciseType: 'MULTIPLE_CHOICE',
          result,
          responseTimeMs: input.responseTimeMs,
          userAnswer: input.userAnswer,
          correctAnswer: exercise.correctAnswer,
          hintUsed: input.hintUsed,
        },
      });

      const allReviews = [...word.reviews, review];

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

      const { score: newScore, breakdown: scoreBreakdown } = calculateScoreBreakdown(
        allReviews,
        intervalDays
      );
      const newStatus = getStatusFromScore(newScore);

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

      return { review, learningState, scoreBreakdown };
    });
  } catch (err) {
    if (
      input.submissionId &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const existing = await findExistingSubmission(input.wordId, input.submissionId);
      if (existing) return existing;
    }
    throw err;
  }
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

const QUEUE_LIMIT = 30;
const NEW_WORD_LIMIT = 10;

export const getTodayReview = async () => {
  const now = new Date();
  const dueWhere: Prisma.VocabularyWordWhereInput = {
    isArchived: false,
    learningState: {
      nextReviewAt: { lte: now },
    },
  };
  const newWhere: Prisma.VocabularyWordWhereInput = {
    isArchived: false,
    learningState: { status: 'NEW' },
  };

  const [words, newWordItems, reviewWords, newWords] = await Promise.all([
    prisma.vocabularyWord.findMany({
      where: dueWhere,
      select: queueSelect,
      take: QUEUE_LIMIT,
    }),
    prisma.vocabularyWord.findMany({
      where: newWhere,
      select: queueSelect,
      take: NEW_WORD_LIMIT,
    }),
    prisma.vocabularyWord.count({ where: dueWhere }),
    prisma.vocabularyWord.count({ where: newWhere }),
  ]);

  const queue = [...words, ...newWordItems]
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
    .slice(0, QUEUE_LIMIT);

  return {
    totalDue: reviewWords + newWords,
    newWords,
    reviewWords,
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
