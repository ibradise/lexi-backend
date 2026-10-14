export const buildWordPrompt = (
  word: string,
  partOfSpeech?: string,
  sourceContext?: string
): string => {
  return `You are an English vocabulary tutor. Generate learning content for the following word.

Word: ${word}
Part of speech: ${partOfSpeech || 'unknown'}
User's original context: ${sourceContext || 'none'}

Generate a JSON response with this exact structure:
{
  "meanings": [
    { "meaning": "...", "isPrimary": true }
  ],
  "examples": [
    { "sentence": "a natural sentence using the word", "context": "workplace|relationships|technology|science|business|daily_life" }
  ],
  "exercises": [
    { "question": "What is the meaning of '${word}'?", "options": ["simple def A","simple def B","simple def C","simple def D"], "correctAnswer": "simple def A", "explanation": "..." }
  ],
  "synonyms": ["..."],
  "antonyms": ["..."],
  "pronunciation": "/.../",
  "difficulty": 1-5
}

Rules:
- Provide 1-2 meanings (mark the most common as primary)
- Provide 4-6 examples, each using the word in a DIFFERENT context
- Provide 2-3 exercises; every exercise is a MULTIPLE_CHOICE question about the word's meaning
- For each exercise: provide exactly 4 options (simple-English definitions), correctAnswer is the correct definition text, explanation says why it is correct
- Use clear, natural English
- Do not repeat the user's original sentence as an example
- Difficulty: 1=very easy, 5=very advanced

Respond with JSON only. No markdown, no explanation.`;
};
