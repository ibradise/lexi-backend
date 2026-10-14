import { Request, Response } from 'express';
import { ExerciseType, ReviewResult } from '@prisma/client';
import * as reviewService from '../services/review.service';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';

const VALID_EXERCISE_TYPES = Object.values(ExerciseType) as string[];
const VALID_RESULTS = Object.values(ReviewResult) as string[];

export const getTodayReview = catchAsync(async (_req: Request, res: Response) => {
  const result = await reviewService.getTodayReview();
  res.json({ success: true, data: result, error: null, meta: null });
});

export const submitReview = catchAsync(async (req: Request, res: Response) => {
  const wordId = req.params.wordId as string;
  const { exerciseType, result, responseTimeMs, userAnswer, hintUsed } = req.body;

  if (!exerciseType || !result) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'exerciseType and result are required');
  }

  if (!VALID_EXERCISE_TYPES.includes(exerciseType)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid exerciseType: ${exerciseType}`);
  }

  if (!VALID_RESULTS.includes(result)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid result: ${result}`);
  }

  const reviewResult = await reviewService.submitReview({
    wordId,
    exerciseType,
    result,
    responseTimeMs,
    userAnswer,
    hintUsed: hintUsed || false,
  });

  res.json({ success: true, data: reviewResult, error: null, meta: null });
});

export const getReviewHistory = catchAsync(async (req: Request, res: Response) => {
  const wordId = req.query.wordId as string | undefined;
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  const result = await reviewService.getReviewHistory(wordId, page, limit);
  res.json({ success: true, data: result.items, error: null, meta: result.meta });
});
