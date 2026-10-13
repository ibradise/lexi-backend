import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

interface AddWordInput {
  word: string;
  partOfSpeech?: string;
  sourceContext?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

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
    include: {
      learningState: true,
    },
  });

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
      orderBy: { [sort]: order },
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
      meanings: true,
      exercises: true,
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

export const deleteWord = async (id: string) => {
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

  return { id: word.id, aiContent: { status: 'generating' } };
};
