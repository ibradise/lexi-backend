import { ApiError } from './ApiError';

export const MAX_PAGE_LIMIT = 100;
export const MAX_PAGE_NUMBER = 1_000_000;

export const parsePositiveInt = (
  value: unknown,
  name: string,
  fallback: number,
  max: number
): number => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${name} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${name} must be between 1 and ${max}`);
  }

  return parsed;
};

export const parseEnum = <T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[]
): T | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${name} must be one of: ${allowed.join(', ')}`);
  }

  return value as T;
};

export const parseOptionalString = (value: unknown, name: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `${name} must be a string`);
  }

  return value;
};
