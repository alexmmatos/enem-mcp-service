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

export const ENEM_DISCIPLINES = ["linguagens", "ciencias-humanas", "ciencias-natureza", "matematica"] as const;
export type EnemDiscipline = (typeof ENEM_DISCIPLINES)[number];

export const ENEM_DISCIPLINE_TOPICS: Record<EnemDiscipline, Topic> = {
  linguagens: "Linguagens",
  "ciencias-humanas": "Ciências Humanas",
  "ciencias-natureza": "Ciências da Natureza",
  matematica: "Matemática",
};

// A integração (tool MCP) fala em português e usa a label (ex.: "Ciências da Natureza"), não o
// value interno (ex.: "ciencias-natureza") — esse só existe porque é o formato bruto do ENEM.
export const ENEM_DISCIPLINE_LABELS = [
  "Linguagens",
  "Ciências Humanas",
  "Ciências da Natureza",
  "Matemática",
] as const satisfies readonly Topic[];

const LABEL_TO_ENEM_DISCIPLINE = new Map<string, EnemDiscipline>(
  (Object.entries(ENEM_DISCIPLINE_TOPICS) as [EnemDiscipline, Topic][]).map(([value, label]) => [label, value]),
);

export function disciplineValueFromLabel(label: string): EnemDiscipline | undefined {
  return LABEL_TO_ENEM_DISCIPLINE.get(label);
}
