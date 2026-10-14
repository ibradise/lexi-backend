import { Request, Response } from 'express';
import * as vocabularyService from '../services/vocabulary.service';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';

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
  const { search, status, sort = 'dateAdded', order = 'desc', page = '1', limit = '20' } = req.query;

  const result = await vocabularyService.listWords({
    search: search as string | undefined,
    status: status as string | undefined,
    sort: sort as string,
    order: order as 'asc' | 'desc',
    page: parseInt(page as string, 10),
    limit: parseInt(limit as string, 10),
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
