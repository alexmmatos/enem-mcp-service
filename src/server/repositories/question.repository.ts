import type { Prisma, PrismaClient, Question } from "@prisma/client";
import type { Alternative } from "../../shared/types/exam.js";
import { ExamError } from "../errors/exam-error.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface InternalQuestion extends Omit<Question, "alternativesJson"> {
  alternatives: Alternative[];
}

function parseAlternatives(value: string): Alternative[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new ExamError("INVALID_QUESTION_DATA", "Alternativas inválidas no banco.");
  return parsed as Alternative[];
}

export function hydrateQuestion(question: Question): InternalQuestion {
  return {
    id: question.id,
    topic: question.topic,
    level: question.level,
    statement: question.statement,
    code: question.code,
    correctAlternativeId: question.correctAlternativeId,
    explanation: question.explanation,
    alternatives: parseAlternatives(question.alternativesJson),
  };
}

export async function findQuestion(db: DbClient, id: string): Promise<InternalQuestion> {
  const row = await db.question.findUnique({ where: { id } });
  if (!row) throw new ExamError("QUESTION_NOT_FOUND", "Questão não encontrada.", { questionId: id });
  return hydrateQuestion(row);
}
