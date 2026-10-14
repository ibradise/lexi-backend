export interface AIMeaning {
  meaning: string;
  isPrimary: boolean;
}

export interface AIExample {
  sentence: string; // the example sentence
  context: string; // context label, e.g. "science"
}

export interface AIMultipleChoice {
  question: string; // the prompt
  options: string[]; // 4 simple-English definitions
  correctAnswer: string; // correct definition text
  explanation: string; // why it's correct
}

export interface AIData {
  meanings: AIMeaning[];
  examples: AIExample[];
  exercises: AIMultipleChoice[];
  synonyms: string[];
  antonyms: string[];
  pronunciation: string;
  difficulty: number;
}
