import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { catchAsync } from '../utils/catchAsync';

export const getDashboard = catchAsync(async (_req: Request, res: Response) => {
  const result = await dashboardService.getDashboard();
  res.json({ success: true, data: result, error: null, meta: null });
});
