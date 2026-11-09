import { Request, Response } from 'express';
import { WordStatus } from '@prisma/client';
import * as vocabularyService from '../services/vocabulary.service';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import {
  MAX_PAGE_LIMIT,
  MAX_PAGE_NUMBER,
  parseEnum,
  parseOptionalString,
  parsePositiveInt,
} from '../utils/query';

const VALID_ORDERS = ['asc', 'desc'] as const;
const VALID_STATUSES = Object.values(WordStatus);

export const addWord = catchAsync(async (req: Request, res: Response) => {
  const { word, words, partOfSpeech, sourceContext, sourceUrl, sourceTitle } = req.body;

  if (Array.isArray(words)) {
    if (words.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Words array is empty');
    }
    if (words.length > vocabularyService.MAX_BULK_WORDS) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `Too many words (max ${vocabularyService.MAX_BULK_WORDS} per request)`
      );
    }

    const result = await vocabularyService.addWords(words);

    res.status(202).json({
      success: true,
      data: result,
      error: null,
      meta: null,
    });
    return;
  }

  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Word is required');
  }

  if (word.trim().length > vocabularyService.MAX_WORD_LENGTH) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `Word must be at most ${vocabularyService.MAX_WORD_LENGTH} characters`
    );
  }

  const result = await vocabularyService.addWord({
    word: word.trim().toLowerCase(),
    partOfSpeech,
    sourceContext,
    sourceUrl,
    sourceTitle,
  });

  res.status(201).json({
    success: true,
    data: result,
    error: null,
    meta: null,
  });
});

export const listWords = catchAsync(async (req: Request, res: Response) => {
  const search = parseOptionalString(req.query.search, 'search');
  const status = parseEnum(req.query.status, 'status', VALID_STATUSES);
  const sort = parseOptionalString(req.query.sort, 'sort') ?? 'dateAdded';
  const order = parseEnum(req.query.order, 'order', VALID_ORDERS) ?? 'desc';
  const page = parsePositiveInt(req.query.page, 'page', 1, MAX_PAGE_NUMBER);
  const limit = parsePositiveInt(req.query.limit, 'limit', 20, MAX_PAGE_LIMIT);

  const result = await vocabularyService.listWords({
    search,
    status,
    sort,
    order,
    page,
    limit,
  });

  res.json({
    success: true,
    data: result.items,
    error: null,
    meta: result.meta,
  });
});

export const getWord = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await vocabularyService.getWord(id);

  res.json({
    success: true,
    data: result,
    error: null,
    meta: null,
  });
});

export const getExercises = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await vocabularyService.getExercises(id);

  res.json({
    success: true,
    data: result,
    error: null,
    meta: null,
  });
});

export const deleteWord = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await vocabularyService.deleteWord(id);

  res.json({
    success: true,
    data: result,
    error: null,
    meta: null,
  });
});

export const regenerateAI = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await vocabularyService.regenerateAI(id);

  res.json({
    success: true,
    data: result,
    error: null,
    meta: null,
  });
});
