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
  "exercises": [
    { "type": "EXAMPLE", "content": "...", "context": "workplace|relationships|technology|science|business|daily_life" },
    { "type": "MULTIPLE_CHOICE", "question": "What is the meaning of 'malleable'?", "options": ["simple def A","simple def B","simple def C","simple def D"], "correctAnswer": "simple def A", "explanation": "..." }
  ],
  "synonyms": ["..."],
  "antonyms": ["..."],
  "pronunciation": "/.../",
  "difficulty": 1-5
}

Rules:
- Provide 1-2 meanings (mark the most common as primary)
- Provide 4-6 exercises TOTAL, including 2-3 EXAMPLES and 2-3 interactive exercises
- Each exercise must have a DIFFERENT context
- For MULTIPLE_CHOICE: provide exactly 4 options, correctAnswer is the correct definition text
- For EXAMPLE: content is a natural sentence, context is one of: workplace|relationships|technology|science|business|daily_life
- Use clear, natural English
- Do not repeat the user's original sentence as an example
- Difficulty: 1=very easy, 5=very advanced

Respond with JSON only. No markdown, no explanation.`;
};
