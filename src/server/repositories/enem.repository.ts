import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ExamError } from "../errors/exam-error.js";

const ENEM_DATA_DIR = path.join(process.cwd(), "enem-api", "public");

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
  questions: z.array(z.object({ index: z.number(), language: z.string().nullable() })),
});

export type EnemQuestion = z.infer<typeof enemQuestionSchema>;

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// A API do ENEM referencia imagens em https://enem.dev/{year}/questions/{index}/{arquivo}; os
// mesmos arquivos foram copiados soltos para public/ (nomes são UUID, sem colisão). public/ é
// servido em produção sob /assets (express.static em dist/assets — outDir do build do Skybridge),
// não na raiz; só bate com a raiz no servidor de dev do Vite.
const ENEM_IMAGE_URL_RE = /https:\/\/enem\.dev\/[^\s")]+/g;

function localize(url: string): string {
  return `/assets/${url.split("/").pop()}`;
}

function localizeUrls(question: EnemQuestion): EnemQuestion {
  return {
    ...question,
    context: question.context?.replace(ENEM_IMAGE_URL_RE, localize) ?? question.context,
    alternatives: question.alternatives.map((alternative) => (
      alternative.file ? { ...alternative, file: localize(alternative.file) } : alternative
    )),
  };
}

export async function fetchEnemQuestions(year: number, limit: number, offset = 0): Promise<EnemQuestion[]> {
  const exam = examDetailsSchema.safeParse(await readJson(path.join(ENEM_DATA_DIR, String(year), "details.json")));
  if (!exam.success) {
    throw new ExamError("ENEM_API_ERROR", `A prova do ENEM ${year} não foi encontrada na base local.`, { year });
  }

  const language = exam.data.languages[0]?.value;
  const targets = exam.data.questions
    .filter((question) => question.language === language || !question.language)
    .filter((question) => question.index >= offset && question.index <= offset + limit)
    .sort((left, right) => left.index - right.index);

  const questionsDir = path.join(ENEM_DATA_DIR, String(year), "questions");
  return Promise.all(targets.map(async (target) => {
    const raw = (await readJson(path.join(questionsDir, String(target.index), "details.json")))
      ?? (target.language ? await readJson(path.join(questionsDir, `${target.index}-${target.language}`, "details.json")) : null);
    const parsed = enemQuestionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ExamError("ENEM_API_ERROR", `A questão ${target.index} do ENEM ${year} não pôde ser carregada.`, { year, index: target.index });
    }
    return localizeUrls(parsed.data);
  }));
}
