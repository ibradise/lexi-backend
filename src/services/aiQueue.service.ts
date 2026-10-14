import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { generateWordContent, getAIModel } from './ai.service';
import { AIData } from '../types/ai';

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2000;

// Writes the AI response onto the word row (single jsonb column) plus the denormalized pronunciation/difficulty columns.
export const persistAIData = async (wordId: string, data: AIData) => {
  return prisma.vocabularyWord.update({
    where: { id: wordId },
    data: {
      aiData: data as unknown as Prisma.InputJsonValue,
      aiModel: getAIModel(),
      aiUpdatedAt: new Date(),
      pronunciation: data.pronunciation || null,
      difficulty: data.difficulty ?? 3,
    },
    include: { learningState: true },
  });
};

const queue: string[] = [];
const known = new Set<string>();
const attempts = new Map<string, number>();
let active = 0;

// Failures only count while the process is running. A word that exhausts MAX_ATTEMPTS stays
// PENDING (aiModel = null) and is picked up again by the boot sweep or regenerate-ai.
const scheduleRetry = (wordId: string) => {
  const tries = (attempts.get(wordId) ?? 0) + 1;
  attempts.set(wordId, tries);

  if (tries >= MAX_ATTEMPTS) {
    attempts.delete(wordId);
    return false;
  }

  const delay = RETRY_BASE_MS * 2 ** (tries - 1);
  console.warn(`AI retry ${tries}/${MAX_ATTEMPTS - 1} for word ${wordId} in ${delay}ms`);
  const timer = setTimeout(() => enqueueAIGeneration([wordId]), delay);
  timer.unref();
  return true;
};

const processWord = async (wordId: string) => {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id: wordId },
    select: {
      id: true,
      word: true,
      partOfSpeech: true,
      sourceContext: true,
      aiData: true,
      isArchived: true,
    },
  });

  // Idempotent: skip missing/archived words or words that already have AI content.
  if (!word || word.isArchived || word.aiData !== null) return;

  const data = await generateWordContent(
    word.word,
    word.partOfSpeech ?? undefined,
    word.sourceContext ?? undefined
  );
  await persistAIData(word.id, data);
};

const pump = () => {
  while (active < CONCURRENCY && queue.length > 0) {
    const wordId = queue.shift() as string;
    active += 1;
    void processWord(wordId)
      .then(() => {
        attempts.delete(wordId);
      })
      .catch((err) => {
        if (!scheduleRetry(wordId)) {
          console.error(`AI generation failed for word ${wordId} after ${MAX_ATTEMPTS} attempts:`, err);
        }
      })
      .finally(() => {
        active -= 1;
        known.delete(wordId);
        pump();
      });
  }
};

// Fire-and-forget: schedules background AI generation for the given words. Never blocks the caller.
export const enqueueAIGeneration = (wordIds: string[]) => {
  for (const id of wordIds) {
    if (known.has(id)) continue;
    known.add(id);
    queue.push(id);
  }
  pump();
};

// On boot, re-enqueue words left PENDING by a crash/restart or by the client closing the app early.
export const sweepPendingWords = async () => {
  try {
    const pending = await prisma.vocabularyWord.findMany({
      where: { isArchived: false, aiModel: null },
      select: { id: true },
    });

    if (pending.length > 0) {
      console.log(`AI worker: re-enqueueing ${pending.length} word(s) without AI content`);
      enqueueAIGeneration(pending.map((w) => w.id));
    }
  } catch (err) {
    console.error('AI worker sweep failed:', err);
  }
};
