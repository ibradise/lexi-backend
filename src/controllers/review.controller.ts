import { Request, Response } from 'express';
  import * as reviewService from '../services/review.service';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';

export const getTodayReview = catchAsync(async (_req: Request, res: Response) => {
  const result = await reviewService.getTodayReview();
  res.json({ success: true, data: result, error: null, meta: null });
});

export const submitReview = catchAsync(async (req: Request, res: Response) => {
  const wordId = req.params.wordId as string;
  const { exerciseId, userAnswer, responseTimeMs, hintUsed, skipped } = req.body ?? {};

  if (!exerciseId || typeof exerciseId !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'exerciseId is required');
  }

  if (!skipped && typeof userAnswer !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'userAnswer is required');
  }

  const reviewResult = await reviewService.submitReview({
    wordId,
    exerciseId,
    userAnswer,
    responseTimeMs,
    hintUsed: hintUsed === true,
    skipped: skipped === true,
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
