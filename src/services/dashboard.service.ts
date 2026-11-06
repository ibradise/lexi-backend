import { prisma } from '../lib/prisma';

export const getDashboard = async () => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalWords,
    statusGroups,
    dueWords,
    newWords,
    weakestWords,
    reviewsToday,
    last7DaysReviews,
  ] = await Promise.all([
    prisma.vocabularyWord.count({ where: { isArchived: false } }),
    prisma.learningState.groupBy({
      by: ['status'],
      where: { word: { isArchived: false } },
      _count: { _all: true },
    }),
    prisma.learningState.count({
      where: {
        word: { isArchived: false },
        nextReviewAt: { lte: now },
      },
    }),
    prisma.learningState.count({
      where: { word: { isArchived: false }, status: 'NEW' },
    }),
    prisma.vocabularyWord.findMany({
      where: { isArchived: false, learningState: { status: { in: ['LEARNING', 'NEW'] } } },
      select: {
        id: true,
        word: true,
        learningState: { select: { knowledgeScore: true } },
      },
      orderBy: { learningState: { knowledgeScore: 'asc' } },
      take: 5,
    }),
    prisma.reviewHistory.count({
      where: { createdAt: { gte: todayStart } },
    }),
    prisma.reviewHistory.groupBy({
      by: ['result'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const g of statusGroups) {
    statusMap[g.status] = g._count._all;
  }

  const last7Map: Record<string, number> = {};
  for (const r of last7DaysReviews) {
    last7Map[r.result] = r._count._all;
  }
  const totalLast7 = Object.values(last7Map).reduce((a, b) => a + b, 0);
  const correctLast7 = last7Map['CORRECT'] || 0;
  const accuracyLast7Days = totalLast7 > 0 ? correctLast7 / totalLast7 : 0;

  const needAttention = await prisma.learningState.count({
    where: {
      word: { isArchived: false },
      status: 'LEARNING',
      knowledgeScore: { lt: 0.3 },
    },
  });

  const becomingStrong = await prisma.learningState.count({
    where: {
      word: { isArchived: false },
      status: { in: ['FAMILIAR', 'STRONG'] },
      knowledgeScore: { gte: 0.6 },
    },
  });

  return {
    todayReview: {
      due: dueWords,
      newWords,
      needAttention,
      becomingStrong,
    },
    weakestWords: weakestWords.map((w) => ({
      wordId: w.id,
      word: w.word,
      knowledgeScore: w.learningState?.knowledgeScore || 0,
    })),
    stats: {
      totalWords,
      new: statusMap['NEW'] || 0,
      learning: statusMap['LEARNING'] || 0,
      familiar: statusMap['FAMILIAR'] || 0,
      strong: statusMap['STRONG'] || 0,
      mastered: statusMap['MASTERED'] || 0,
      reviewsToday,
      accuracyLast7Days,
      currentStreak: 0,
    },
  };
};
