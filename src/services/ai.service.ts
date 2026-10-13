import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import crypto from 'crypto';
import { buildWordPrompt } from '../prompts/ai.prompts';
import { ApiError } from '../utils/ApiError';

interface AIContent {
  meanings: { meaning: string; isPrimary: boolean }[];
  exercises: {
    type: 'EXAMPLE' | 'MULTIPLE_CHOICE';
    content?: string;      // EXAMPLE: the sentence
    context?: string;      // EXAMPLE: context label
    question?: string;     // MULTIPLE_CHOICE: the prompt
    options?: string[];    // MULTIPLE_CHOICE: 4 simple-English definitions
    correctAnswer?: string;// MULTIPLE_CHOICE: correct definition text
    explanation?: string;  // MULTIPLE_CHOICE: why
  }[];
  synonyms: string[];
  antonyms: string[];
  pronunciation: string;
  difficulty: number;
}

const parseAIResponse = (text: string): AIContent => {
  let jsonStr = text.trim();
  jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const data = JSON.parse(jsonStr);

  if (!data.meanings || !Array.isArray(data.meanings) || data.meanings.length === 0) {
    throw new Error('Invalid AI response: meanings missing');
  }
  if (!data.exercises || !Array.isArray(data.exercises) || data.exercises.length === 0) {
    throw new Error('Invalid AI response: exercises missing');
  }

  // Validate each exercise has required fields per type
  for (const exercise of data.exercises) {
    if (exercise.type === 'EXAMPLE') {
      if (!exercise.content || !exercise.context) {
        throw new Error('Invalid EXAMPLE exercise: missing content or context');
      }
    } else if (exercise.type === 'MULTIPLE_CHOICE') {
      if (!exercise.question || !exercise.options || exercise.options.length !== 4 || !exercise.correctAnswer) {
        throw new Error('Invalid MULTIPLE_CHOICE exercise: missing question, 4 options, or correctAnswer');
      }
    }
  }

  return {
    meanings: data.meanings,
    exercises: data.exercises,
    synonyms: data.synonyms || [],
    antonyms: data.antonyms || [],
    pronunciation: data.pronunciation || '',
    difficulty: data.difficulty || 3,
  };
};

const callGeminiWithRetry = async (prompt: string): Promise<string> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 3000,
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
      if (attempt < 2) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Gemini API failed after 3 retries');
};

export const generateWordContent = async (
  wordId: string,
  word: string,
  partOfSpeech?: string,
  sourceContext?: string
): Promise<AIContent> => {
  const prompt = buildWordPrompt(word, partOfSpeech, sourceContext);
  const promptHash = crypto.createHash('sha256').update(prompt).digest('hex');

  const cached = await prisma.aICacheEntry.findUnique({
    where: { wordId_promptHash: { wordId, promptHash } },
  });

  if (cached) {
    return cached.response as unknown as AIContent;
  }

  try {
    const responseText = await callGeminiWithRetry(prompt);
    const content = parseAIResponse(responseText);

    await prisma.aICacheEntry.create({
      data: {
        wordId,
        promptHash,
        response: content as object,
        model: 'gemini-3.5-flash',
      },
    });

    return content;
  } catch (err) {
    throw new ApiError(
      502,
      'AI_GENERATION_FAILED',
      err instanceof Error ? err.message : 'AI generation failed'
    );
  }
};
