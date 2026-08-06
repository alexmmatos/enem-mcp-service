import { randomUUID } from "node:crypto";
import type { ClientSession, Db, MongoClient } from "mongodb";
import { EXAM_STATUSES, LEVELS, TOPICS, type ExamStatus, type Level, type Topic } from "../../shared/constants/exam.js";
import type { AnswerResult, ExamProgress, ExamToolResponse } from "../../shared/types/exam.js";
import { db as defaultDb, mongoClient as defaultMongoClient } from "../db.js";
import { ExamError } from "../errors/exam-error.js";
import { fetchEnemQuestions } from "../repositories/enem.repository.js";
import { findQuestion, upsertQuestions, type InternalQuestion } from "../repositories/question.repository.js";
import { enemQuestionToData, toPublicQuestion } from "./question.service.js";

export const ATTEMPTS_COLLECTION = "exam_attempts";
export const ANSWERS_COLLECTION = "exam_answers";

export interface ExamAttemptDoc {
  _id: string;
  userId?: string;
  sessionId: string;
  status: string;
  topic: string;
  level: string;
  questionIds: string[];
  currentQuestionIndex: number;
  score: number;
  enemYear?: number;
  startedAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
}

export interface ExamAnswerDoc {
  examId: string;
  questionId: string;
  selectedAlternativeId: string;
  correct: boolean;
  answeredAt: Date;
}

interface CreateExamArgs {
  year: number;
  numberOfQuestions: number;
  userId?: string | undefined;
  sessionId?: string | undefined;
}
interface SubmitAnswerArgs { examId: string; questionId: string; alternativeId: string }

const locks = new Map<string, Promise<void>>();

async function withExamLock<T>(examId: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(examId) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  locks.set(examId, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(examId) === queued) locks.delete(examId);
  }
}

function parseQuestionIds(attempt: ExamAttemptDoc): string[] {
  if (!Array.isArray(attempt.questionIds) || !attempt.questionIds.every((item) => typeof item === "string")) {
    throw new ExamError("INVALID_EXAM_DATA", "A ordem de questões da prova é inválida.");
  }
  return attempt.questionIds;
}

function examStatus(value: string): ExamStatus {
  if (!EXAM_STATUSES.includes(value as ExamStatus)) throw new ExamError("INVALID_EXAM_DATA", "Status de prova inválido.");
  return value as ExamStatus;
}

function examTopic(value: string): Topic {
  if (!TOPICS.includes(value as Topic)) throw new ExamError("INVALID_EXAM_DATA", "Assunto de prova inválido.");
  return value as Topic;
}

function examLevel(value: string): Level {
  if (!LEVELS.includes(value as Level)) throw new ExamError("INVALID_EXAM_DATA", "Nível de prova inválido.");
  return value as Level;
}

async function requireAttempt(db: Db, examId: string, options?: { session?: ClientSession }): Promise<ExamAttemptDoc> {
  const attempt = await db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).findOne({ _id: examId }, options?.session ? { session: options.session } : {});
  if (!attempt) throw new ExamError("EXAM_NOT_FOUND", "Prova não encontrada.", { examId });
  return attempt;
}

function progressOf(attempt: ExamAttemptDoc, answered: number): ExamProgress {
  const total = parseQuestionIds(attempt).length;
  return {
    current: Math.min(attempt.currentQuestionIndex + 1, total),
    total,
    answered,
    correct: attempt.score,
    percentage: total === 0 ? 0 : Math.round((attempt.score / total) * 100),
  };
}

async function responseFor(
  db: Db,
  attempt: ExamAttemptDoc,
  result?: AnswerResult,
  options?: { session?: ClientSession },
): Promise<ExamToolResponse> {
  const questionIds = parseQuestionIds(attempt);
  const answered = await db.collection<ExamAnswerDoc>(ANSWERS_COLLECTION).countDocuments({ examId: attempt._id }, options?.session ? { session: options.session } : {});
  const questionId = attempt.status === "finished" ? undefined : questionIds[attempt.currentQuestionIndex];
  const question = questionId ? toPublicQuestion(await findQuestion(db, questionId, options)) : undefined;
  return {
    exam: {
      id: attempt._id,
      status: examStatus(attempt.status),
      topic: examTopic(attempt.topic),
      level: examLevel(attempt.level),
      ...(attempt.enemYear ? { year: attempt.enemYear } : {}),
    },
    progress: progressOf(attempt, answered),
    ...(question ? { question } : {}),
    ...(result ? { result } : {}),
  };
}

function answerResult(answer: ExamAnswerDoc, question: InternalQuestion): AnswerResult {
  return {
    correct: answer.correct,
    selectedAlternativeId: answer.selectedAlternativeId,
    correctAlternativeId: question.correctAlternativeId,
    explanation: question.explanation,
  };
}

export class ExamService {
  constructor(
    private readonly db: Db = defaultDb,
    private readonly client: MongoClient = defaultMongoClient,
  ) {}

  async createExam(args: CreateExamArgs): Promise<ExamToolResponse> {
    const year = args.year;
    const fetched = await fetchEnemQuestions(this.db, year, args.numberOfQuestions);
    if (fetched.length < args.numberOfQuestions) {
      throw new ExamError(
        "INSUFFICIENT_QUESTIONS",
        `A prova do ENEM ${year} tem apenas ${fetched.length} questões disponíveis a partir do início.`,
        { available: fetched.length, requested: args.numberOfQuestions },
      );
    }
    const data = fetched.map((question) => enemQuestionToData(question, year));
    await upsertQuestions(this.db, data);

    const now = new Date();
    const attempt: ExamAttemptDoc = {
      _id: randomUUID(),
      sessionId: args.sessionId ?? randomUUID(),
      ...(args.userId ? { userId: args.userId } : {}),
      status: "in_progress",
      topic: "ENEM",
      level: "enem",
      enemYear: year,
      questionIds: data.map((item) => item._id),
      currentQuestionIndex: 0,
      score: 0,
      startedAt: now,
      updatedAt: now,
    };
    await this.db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).insertOne(attempt);
    return responseFor(this.db, attempt);
  }

  async getCurrentQuestion(examId: string): Promise<ExamToolResponse> {
    return responseFor(this.db, await requireAttempt(this.db, examId));
  }

  async getProgress(examId: string): Promise<ExamToolResponse> {
    return responseFor(this.db, await requireAttempt(this.db, examId));
  }

  async pauseExam(examId: string): Promise<ExamToolResponse> {
    const attempt = await requireAttempt(this.db, examId);
    if (attempt.status === "finished") throw new ExamError("EXAM_FINISHED", "A prova já foi finalizada.");
    const updated = attempt.status === "paused" ? attempt : await this.db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).findOneAndUpdate(
      { _id: examId }, { $set: { status: "paused", updatedAt: new Date() } }, { returnDocument: "after" },
    );
    return responseFor(this.db, updated ?? attempt);
  }

  async resumeExam(examId: string): Promise<ExamToolResponse> {
    const attempt = await requireAttempt(this.db, examId);
    if (attempt.status === "finished") throw new ExamError("EXAM_FINISHED", "A prova já foi finalizada.");
    const updated = attempt.status === "in_progress" ? attempt : await this.db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).findOneAndUpdate(
      { _id: examId }, { $set: { status: "in_progress", updatedAt: new Date() } }, { returnDocument: "after" },
    );
    return responseFor(this.db, updated ?? attempt);
  }

  async submitAnswer(args: SubmitAnswerArgs): Promise<ExamToolResponse> {
    return withExamLock(args.examId, async () => {
      const session = this.client.startSession();
      try {
        let response!: ExamToolResponse;
        await session.withTransaction(async () => {
          const attempts = this.db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION);
          const answers = this.db.collection<ExamAnswerDoc>(ANSWERS_COLLECTION);

          const attempt = await attempts.findOne({ _id: args.examId }, { session });
          if (!attempt) throw new ExamError("EXAM_NOT_FOUND", "Prova não encontrada.", { examId: args.examId });

          const existing = await answers.findOne({ examId: args.examId, questionId: args.questionId }, { session });
          if (existing) {
            if (existing.selectedAlternativeId !== args.alternativeId) {
              throw new ExamError("ANSWER_ALREADY_SUBMITTED", "Esta questão já recebeu outra resposta.");
            }
            const question = await findQuestion(this.db, args.questionId, { session });
            response = await responseFor(this.db, attempt, answerResult(existing, question), { session });
            return;
          }

          if (attempt.status === "paused") throw new ExamError("EXAM_PAUSED", "Retome a prova antes de responder.");
          if (attempt.status === "finished") throw new ExamError("EXAM_FINISHED", "A prova já foi finalizada.");

          const questionIds = parseQuestionIds(attempt);
          const currentQuestionId = questionIds[attempt.currentQuestionIndex];
          if (currentQuestionId !== args.questionId) {
            throw new ExamError("NOT_CURRENT_QUESTION", "A questão informada não é a questão atual.", { currentQuestionId });
          }

          const question = await findQuestion(this.db, args.questionId, { session });
          if (!question.alternatives.some(({ id }) => id === args.alternativeId)) {
            throw new ExamError("INVALID_ALTERNATIVE", "A alternativa não pertence à questão atual.");
          }

          const correct = question.correctAlternativeId === args.alternativeId;
          const answer: ExamAnswerDoc = {
            examId: args.examId,
            questionId: args.questionId,
            selectedAlternativeId: args.alternativeId,
            correct,
            answeredAt: new Date(),
          };
          await answers.insertOne(answer, { session });

          const nextIndex = attempt.currentQuestionIndex + 1;
          const completed = nextIndex >= questionIds.length;
          const updated = await attempts.findOneAndUpdate(
            { _id: args.examId },
            {
              $set: { currentQuestionIndex: nextIndex, updatedAt: new Date(), ...(completed ? { status: "finished", finishedAt: new Date() } : {}) },
              $inc: { score: correct ? 1 : 0 },
            },
            { returnDocument: "after", session },
          );
          response = await responseFor(this.db, updated!, answerResult(answer, question), { session });
        });
        return response;
      } finally {
        await session.endSession();
      }
    });
  }
}
