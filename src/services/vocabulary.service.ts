import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { generateWordContent, getAIModel } from './ai.service';
import { AIData } from '../types/ai';

const AI_WAIT_MS = 8000;
const ALLOWED_SORT_FIELDS = ['dateAdded', 'word'] as const;

interface AddWordInput {
  word: string;
  partOfSpeech?: string;
  sourceContext?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

/**
 * Resolves with the promise value, or `null` if it rejects or does not settle within `ms`.
 * Clears the timer so it never keeps the process alive.
 */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Writes the AI response onto the word row (single jsonb column) plus the
 * denormalized pronunciation/difficulty columns.
 */
const persistAIData = async (wordId: string, data: AIData) => {
  return prisma.vocabularyWord.update({
    where: { id: wordId },
    data: {
      aiData: data as unknown as Prisma.InputJsonValue,
      aiModel: getAIModel(),
      aiUpdatedAt: new Date(),
      pronunciation: data.pronunciation || null,
      difficulty: data.difficulty ?? 3,
    },
    include: { learningState: true },
  });
};

export const addWord = async (input: AddWordInput) => {
  const existing = await prisma.vocabularyWord.findUnique({
    where: { word: input.word },
  });

  if (existing) {
    throw new ApiError(409, 'DUPLICATE_WORD', 'Word already exists', { id: existing.id });
  }

  const word = await prisma.vocabularyWord.create({
    data: {
      word: input.word,
      partOfSpeech: input.partOfSpeech,
      sourceContext: input.sourceContext,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      learningState: {
        create: {
          status: 'NEW',
          knowledgeScore: 0,
        },
      },
    },
    include: { learningState: true },
  });

  // Hybrid AI: wait up to AI_WAIT_MS; on success store content, otherwise leave PENDING (aiData = null).
  const aiData = await withTimeout(
    generateWordContent(input.word, input.partOfSpeech, input.sourceContext),
    AI_WAIT_MS
  );

  if (aiData) {
    return persistAIData(word.id, aiData);
  }

  return word;
};

export const listWords = async (params: {
  search?: string;
  status?: string;
  sort: string;
  order: 'asc' | 'desc';
  page: number;
  limit: number;
}) => {
  const { search, status, sort, order, page, limit } = params;
  const skip = (page - 1) * limit;
  const sortField = (ALLOWED_SORT_FIELDS as readonly string[]).includes(sort) ? sort : 'dateAdded';

  const where: Record<string, unknown> = { isArchived: false };

  if (search) {
    where.word = { contains: search, mode: 'insensitive' };
  }

  if (status) {
    where.learningState = { status };
  }

  const [items, total] = await Promise.all([
    prisma.vocabularyWord.findMany({
      where,
      include: { learningState: true },
      orderBy: { [sortField]: order },
      skip,
      take: limit,
    }),
    prisma.vocabularyWord.count({ where }),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getWord = async (id: string) => {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id },
    include: {
      learningState: true,
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!word) {
    throw new ApiError(404, 'NOT_FOUND', 'Word not found');
  }

  return word;
};

export const getExercises = async (wordId: string) => {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id: wordId },
  });

  if (!word) {
    throw new ApiError(404, 'NOT_FOUND', 'Word not found');
  }

  const aiData = (word.aiData as unknown as AIData | null) ?? null;
  const all = aiData?.exercises ?? [];

  const picked = shuffle(all).slice(0, Math.min(3, all.length));

  return {
    wordId: word.id,
    word: word.word,
    exercises: picked.map((e, i) => ({
      id: `${word.id}-ex-${i}`,
      type: 'MULTIPLE_CHOICE',
      question: e.question,
      options: e.options,
      correctAnswer: e.correctAnswer,
      explanation: e.explanation,
    })),
  };
};

export const deleteWord = async (id: string) => {
  const existing = await prisma.vocabularyWord.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Word not found');
  }

  const word = await prisma.vocabularyWord.update({
    where: { id },
    data: { isArchived: true },
  });

  return { id: word.id, isArchived: true };
};

export const regenerateAI = async (id: string) => {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id },
  });

  if (!word) {
    throw new ApiError(404, 'NOT_FOUND', 'Word not found');
  }

  const aiData = await generateWordContent(
    word.word,
    word.partOfSpeech ?? undefined,
    word.sourceContext ?? undefined
  );
  await persistAIData(id, aiData);

  return getWord(id);
};
