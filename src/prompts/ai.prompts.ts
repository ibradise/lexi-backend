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
    { "sentence": "...", "context": "workplace|relationships|technology|science|business|daily_life" }
  ],
  "synonyms": ["..."],
  "antonyms": ["..."],
  "pronunciation": "/.../",
  "difficulty": 1-5
}

Rules:
- Provide 1-2 meanings (mark the most common as primary)
- Provide 4-6 examples, each in a DIFFERENT context
- Use clear, natural English
- Do not repeat the user's original sentence as an example
- Difficulty: 1=very easy, 5=very advanced

Respond with JSON only. No markdown, no explanation.`;
};
