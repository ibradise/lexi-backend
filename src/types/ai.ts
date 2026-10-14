export type AIExerciseType = 'EXAMPLE' | 'MULTIPLE_CHOICE';

export interface AIExercise {
  type: AIExerciseType;
  content?: string; // EXAMPLE: the sentence
  context?: string; // EXAMPLE: context label
  question?: string; // MULTIPLE_CHOICE: the prompt
  options?: string[]; // MULTIPLE_CHOICE: 4 simple-English definitions
  correctAnswer?: string; // MULTIPLE_CHOICE: correct definition text
  explanation?: string; // MULTIPLE_CHOICE: why
}

export interface AIMeaning {
  meaning: string;
  isPrimary: boolean;
}

export interface AIData {
  meanings: AIMeaning[];
  exercises: AIExercise[];
  synonyms: string[];
  antonyms: string[];
  pronunciation: string;
  difficulty: number;
}
