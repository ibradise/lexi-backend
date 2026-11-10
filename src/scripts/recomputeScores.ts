import { prisma } from '../lib/prisma';
import { calculateScoreBreakdown, getStatusFromScore } from '../services/scoring.service';

const recomputeScores = async () => {
  const states = await prisma.learningState.findMany({
    include: {
      word: {
        select: {
          reviews: {
            select: { result: true, responseTimeMs: true, hintUsed: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      },
    },
  });

  for (const state of states) {
    const { score } = calculateScoreBreakdown(state.word.reviews, state.intervalDays);
    await prisma.learningState.update({
      where: { wordId: state.wordId },
      data: { knowledgeScore: score, status: getStatusFromScore(score) as never },
    });
  }

  console.log(`Recomputed ${states.length} learning states`);
};

recomputeScores()
  .catch((err) => {
    console.error('Score recompute failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
