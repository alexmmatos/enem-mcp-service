export const TOPICS = [
  "ENEM",
  "Linguagens",
  "Ciências Humanas",
  "Ciências da Natureza",
  "Matemática",
] as const;

export const LEVELS = ["enem"] as const;
export const EXAM_STATUSES = ["in_progress", "paused", "finished"] as const;

export type Topic = (typeof TOPICS)[number];
export type Level = (typeof LEVELS)[number];
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const ENEM_DISCIPLINE_TOPICS: Record<string, Topic> = {
  linguagens: "Linguagens",
  "ciencias-humanas": "Ciências Humanas",
  "ciencias-natureza": "Ciências da Natureza",
  matematica: "Matemática",
};
