import { Request, Response } from 'express';
import * as reviewService from '../services/review.service';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { MAX_PAGE_LIMIT, MAX_PAGE_NUMBER, parseOptionalString, parsePositiveInt } from '../utils/query';

const MAX_RESPONSE_TIME_MS = 60000;

export const getTodayReview = catchAsync(async (_req: Request, res: Response) => {
  const result = await reviewService.getTodayReview();
  res.json({ success: true, data: result, error: null, meta: null });
});

export const submitReview = catchAsync(async (req: Request, res: Response) => {
  const wordId = req.params.wordId as string;
  const { exerciseId, userAnswer, responseTimeMs, hintUsed, skipped, submissionId } =
    req.body ?? {};

  if (!exerciseId || typeof exerciseId !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'exerciseId is required');
  }

  if (
    submissionId !== undefined &&
    (typeof submissionId !== 'string' || submissionId.trim().length === 0)
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'submissionId must be a non-empty string');
  }

  if (hintUsed !== undefined && typeof hintUsed !== 'boolean') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'hintUsed must be a boolean');
  }

  if (skipped !== undefined && typeof skipped !== 'boolean') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'skipped must be a boolean');
  }

  if (
    responseTimeMs !== undefined &&
    (typeof responseTimeMs !== 'number' ||
      !Number.isInteger(responseTimeMs) ||
      responseTimeMs < 0 ||
      responseTimeMs > MAX_RESPONSE_TIME_MS)
  ) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `responseTimeMs must be an integer between 0 and ${MAX_RESPONSE_TIME_MS}`
    );
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
    submissionId: submissionId?.trim(),
  });

  res.json({ success: true, data: reviewResult, error: null, meta: null });
});

export const getReviewHistory = catchAsync(async (req: Request, res: Response) => {
  const wordId = parseOptionalString(req.query.wordId, 'wordId');
  const page = parsePositiveInt(req.query.page, 'page', 1, MAX_PAGE_NUMBER);
  const limit = parsePositiveInt(req.query.limit, 'limit', 20, MAX_PAGE_LIMIT);

  const result = await reviewService.getReviewHistory(wordId, page, limit);
  res.json({ success: true, data: result.items, error: null, meta: result.meta });
});
