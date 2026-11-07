import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { generateWordContent } from './ai.service';
import { AIData } from '../types/ai';
import { persistAIData, enqueueAIGeneration } from './aiQueue.service';

const AI_WAIT_MS = 8000;
export const MAX_BULK_WORDS = 50;
const MAX_WORD_LENGTH = 100;
const ALLOWED_SORT_FIELDS = ['dateAdded', 'word'] as const;

interface AddWordInput {
  word: string;
  partOfSpeech?: string;
  sourceContext?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

// Resolves with the promise value, or `null` if it rejects or does not settle within `ms`. Clears the timer so it never keeps the process alive.
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

  // AI didn't finish within the wait (timeout/failure): hand off to the background worker to retry.
  enqueueAIGeneration([word.id]);

  return word;
};

// Bulk add: normalize/split each entry, drop existing + repeated words, create the rest with a NEW
// LearningState, then hand them to the background AI worker and return immediately.
export const addWords = async (words: unknown[]) => {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const invalid: string[] = [];

  for (const raw of words) {
    if (typeof raw !== 'string') {
      invalid.push(String(raw));
      continue;
    }

    for (const part of raw.split(/[\s,]+/)) {
      const token = part.trim().toLowerCase();
      if (!token) continue;

      if (token.length > MAX_WORD_LENGTH) {
        invalid.push(token);
        continue;
      }

      if (seen.has(token)) {
        duplicates.push(token);
        continue;
      }

      seen.add(token);
    }
  }

  const normalized = [...seen];
  if (normalized.length === 0) {
    return { added: [], duplicates, invalid };
  }
  if (normalized.length > MAX_BULK_WORDS) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `Too many words (max ${MAX_BULK_WORDS} per request)`
    );
  }

  const existing = await prisma.vocabularyWord.findMany({
    where: { word: { in: normalized } },
    select: { word: true },
  });
  const existingSet = new Set(existing.map((w) => w.word));

  const fresh = normalized.filter((w) => !existingSet.has(w));
  duplicates.push(...normalized.filter((w) => existingSet.has(w)));

  let added: { id: string; word: string; status: string }[] = [];

  if (fresh.length > 0) {
    added = await prisma.$transaction(
      fresh.map((word) =>
        prisma.vocabularyWord.create({
          data: {
            word,
            learningState: { create: { status: 'NEW', knowledgeScore: 0 } },
          },
          select: { id: true, word: true },
        })
      )
    ).then((rows) => rows.map((r) => ({ id: r.id, word: r.word, status: 'PENDING' })));

    // Fire-and-forget: generate AI content in the background so the client can close the app.
    enqueueAIGeneration(added.map((w) => w.id));
  }

  return { added, duplicates, invalid };
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
      omit: { aiData: true },
      include: { learningState: true },
      orderBy: { [sortField]: order },
      skip,
      take: limit,
    }),
    prisma.vocabularyWord.count({ where }),
  ]);

  return {
    items: items.map((item) => ({ ...item, aiReady: item.aiModel !== null })),
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

  if (!word || word.isArchived) {
    throw new ApiError(404, 'NOT_FOUND', 'Word not found');
  }

  return word;
};

export const getExercises = async (wordId: string) => {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id: wordId },
  });

  if (!word || word.isArchived) {
    throw new ApiError(404, 'NOT_FOUND', 'Word not found');
  }

  const aiData = (word.aiData as unknown as AIData | null) ?? null;
  const all = aiData?.exercises ?? [];

  const indexed = all.map((exercise, index) => ({ exercise, index }));
  const picked = shuffle(indexed).slice(0, Math.min(3, indexed.length));

  return {
    wordId: word.id,
    word: word.word,
    exercises: picked.map(({ exercise, index }) => ({
      id: `${word.id}-ex-${index}`,
      type: 'MULTIPLE_CHOICE',
      question: exercise.question,
      options: exercise.options,
      correctAnswer: exercise.correctAnswer,
      explanation: exercise.explanation,
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

  if (!word || word.isArchived) {
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
