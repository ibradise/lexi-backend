import { Router } from 'express';
import * as vocabularyController from '../controllers/vocabulary.controller';

const router = Router();

router.post('/', vocabularyController.addWord);
router.get('/', vocabularyController.listWords);
router.get('/:id', vocabularyController.getWord);
router.get('/:id/exercises', vocabularyController.getExercises);
router.delete('/:id', vocabularyController.deleteWord);
router.post('/:id/regenerate-ai', vocabularyController.regenerateAI);

export default router;
