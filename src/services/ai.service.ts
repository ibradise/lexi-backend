import { env } from '../config/env';
import { buildWordPrompt } from '../prompts/ai.prompts';
import { ApiError } from '../utils/ApiError';
import { AIData } from '../types/ai';

const AI_MODEL = 'gemini-3.5-flash';

export const getAIModel = (): string => AI_MODEL;

const parseAIResponse = (text: string): AIData => {
  let jsonStr = text.trim();
  jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const data = JSON.parse(jsonStr);

  if (!data.meanings || !Array.isArray(data.meanings) || data.meanings.length === 0) {
    throw new Error('Invalid AI response: meanings missing');
  }
  if (!data.examples || !Array.isArray(data.examples) || data.examples.length === 0) {
    throw new Error('Invalid AI response: examples missing');
  }
  for (const example of data.examples) {
    if (!example.sentence || !example.context) {
      throw new Error('Invalid example: missing sentence or context');
    }
  }
  if (!data.exercises || !Array.isArray(data.exercises) || data.exercises.length === 0) {
    throw new Error('Invalid AI response: exercises missing');
  }
  for (const exercise of data.exercises) {
    if (
      !exercise.question ||
      !exercise.options ||
      exercise.options.length !== 4 ||
      !exercise.correctAnswer
    ) {
      throw new Error('Invalid exercise: missing question, 4 options, or correctAnswer');
    }
  }

  return {
    meanings: data.meanings,
    examples: data.examples.map((example: { sentence: string; context: string }) => ({
      sentence: example.sentence,
      context: example.context,
    })),
    exercises: data.exercises.map(
      (exercise: {
        question: string;
        options: string[];
        correctAnswer: string;
        explanation?: string;
      }) => ({
        question: exercise.question,
        options: exercise.options,
        correctAnswer: exercise.correctAnswer,
        explanation: exercise.explanation || '',
      })
    ),
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
        `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
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

      const result = (await response.json()) as {
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

/**
 * Pure AI call: builds the prompt, calls Gemini, validates and returns AIData.
 * Caching/persistence is the caller's responsibility (see vocabulary.service).
 */
export const generateWordContent = async (
  word: string,
  partOfSpeech?: string,
  sourceContext?: string
): Promise<AIData> => {
  const prompt = buildWordPrompt(word, partOfSpeech, sourceContext);

  try {
    const responseText = await callGeminiWithRetry(prompt);
    return parseAIResponse(responseText);
  } catch (err) {
    throw new ApiError(
      502,
      'AI_GENERATION_FAILED',
      err instanceof Error ? err.message : 'AI generation failed'
    );
  }
};
