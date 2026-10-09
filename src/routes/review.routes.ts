import { Router } from 'express';
import * as reviewController from '../controllers/review.controller';

const router = Router();

router.get('/today', reviewController.getTodayReview);
router.post('/:wordId/submit', reviewController.submitReview);
router.get('/history', reviewController.getReviewHistory);

export default router;
