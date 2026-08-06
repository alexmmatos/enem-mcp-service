import type { ClientSession, Db } from "mongodb";
import type { Alternative } from "../../shared/types/exam.js";
import { ExamError } from "../errors/exam-error.js";

export const QUESTIONS_COLLECTION = "questions";

export interface QuestionDoc {
  _id: string;
  topic: string;
  level: string;
  statement: string;
  code: string | null;
  alternatives: Alternative[];
  correctAlternativeId: string;
  explanation: string;
}

export interface InternalQuestion {
  id: string;
  topic: string;
  level: string;
  statement: string;
  code: string | null;
  alternatives: Alternative[];
  correctAlternativeId: string;
  explanation: string;
}

function hydrateQuestion(doc: QuestionDoc): InternalQuestion {
  return {
    id: doc._id,
    topic: doc.topic,
    level: doc.level,
    statement: doc.statement,
    code: doc.code,
    alternatives: doc.alternatives,
    correctAlternativeId: doc.correctAlternativeId,
    explanation: doc.explanation,
  };
}

export async function findQuestion(db: Db, id: string, options?: { session?: ClientSession }): Promise<InternalQuestion> {
  const row = await db.collection<QuestionDoc>(QUESTIONS_COLLECTION).findOne({ _id: id }, options?.session ? { session: options.session } : {});
  if (!row) throw new ExamError("QUESTION_NOT_FOUND", "Questão não encontrada.", { questionId: id });
  return hydrateQuestion(row);
}

export async function upsertQuestions(db: Db, questions: QuestionDoc[]): Promise<void> {
  if (!questions.length) return;
  await db.collection<QuestionDoc>(QUESTIONS_COLLECTION).bulkWrite(
    questions.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })),
  );
}
