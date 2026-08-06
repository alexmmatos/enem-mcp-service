import type { Db } from "mongodb";
import { z } from "zod";
import { ExamError } from "../errors/exam-error.js";

const enemAlternativeSchema = z.object({
  letter: z.string().min(1),
  text: z.string().nullable(),
  file: z.string().nullable(),
  isCorrect: z.boolean(),
});

const enemQuestionSchema = z.object({
  index: z.number(),
  discipline: z.string(),
  context: z.string().nullable(),
  correctAlternative: z.string().min(1),
  alternativesIntroduction: z.string(),
  alternatives: z.array(enemAlternativeSchema).min(1),
});

const examDetailsSchema = z.object({
  languages: z.array(z.object({ value: z.string() })),
});

export type EnemQuestion = z.infer<typeof enemQuestionSchema>;

// Questões e metadados de prova já vêm semeados no Mongo por scripts/seed-mongo.ts (a partir de
// data/enem/) — nenhuma chamada de rede aqui. `enem_questions` guarda uma variante por idioma
// pra questões de língua estrangeira (índices 1–5); resolvemos pro idioma padrão da prova
// (primeiro de `enem_exams.languages`), igual à API pública do ENEM fazia.
export async function fetchEnemQuestions(db: Db, year: number, limit: number, offset = 0): Promise<EnemQuestion[]> {
  const exam = examDetailsSchema.safeParse(await db.collection<{ _id: number }>("enem_exams").findOne({ _id: year }));
  if (!exam.success) {
    throw new ExamError("ENEM_API_ERROR", `A prova do ENEM ${year} não foi encontrada na base.`, { year });
  }
  const language = exam.data.languages[0]?.value;

  const docs = await db.collection("enem_questions")
    .find({
      year,
      index: { $gte: offset, $lte: offset + limit },
      ...(language ? { $or: [{ language }, { language: null }] } : { language: null }),
    })
    .sort({ index: 1 })
    .toArray();

  return docs.map((doc) => {
    const parsed = enemQuestionSchema.safeParse(doc);
    if (!parsed.success) {
      throw new ExamError("ENEM_API_ERROR", `A questão ${String(doc.index)} do ENEM ${year} não pôde ser carregada.`, { year, index: doc.index });
    }
    return parsed.data;
  });
}
