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
  year: z.number(),
  index: z.number(),
  discipline: z.string(),
  context: z.string().nullable(),
  correctAlternative: z.string().min(1),
  alternativesIntroduction: z.string(),
  alternatives: z.array(enemAlternativeSchema).min(1),
});

export type EnemQuestion = z.infer<typeof enemQuestionSchema>;

// Questões e metadados de prova já vêm semeados no Mongo por scripts/seed-mongo.ts (a partir de
// data/enem/) — nenhuma chamada de rede aqui. `enem_questions` guarda uma variante por idioma
// pra questões de língua estrangeira (índices 1–5, sempre discipline "linguagens"); resolvemos
// pro idioma padrão de cada prova (primeiro de `enem_exams.languages`), igual à API pública do
// ENEM fazia — só que agora cruzando todos os anos, já que a seleção é por disciplina, não por
// uma prova específica.
export async function fetchEnemQuestionsByDiscipline(db: Db, discipline: string, limit: number): Promise<EnemQuestion[]> {
  const exams = await db.collection<{ _id: number; languages: Array<{ value: string }> }>("enem_exams").find({}).toArray();
  if (!exams.length) throw new ExamError("ENEM_API_ERROR", "Nenhuma prova do ENEM encontrada na base.", { discipline });

  const languageMatches = exams.flatMap(({ _id: year, languages }) => (
    languages[0] ? [{ year, language: languages[0].value }] : []
  ));

  const match: Record<string, unknown> = { $or: [{ language: null }, ...languageMatches] };
  if (discipline !== "all") match.discipline = discipline;

  const docs = await db.collection("enem_questions")
    .aggregate([{ $match: match }, { $sample: { size: limit } }])
    .toArray();

  return docs.map((doc) => {
    const parsed = enemQuestionSchema.safeParse(doc);
    if (!parsed.success) {
      throw new ExamError("ENEM_API_ERROR", "Uma questão do ENEM não pôde ser carregada.", { discipline, questionId: doc._id as unknown });
    }
    return parsed.data;
  });
}
