import { randomUUID } from "node:crypto";
import { Prisma, type ExamAnswer, type ExamAttempt, type PrismaClient } from "@prisma/client";
import { EXAM_STATUSES, LEVELS, TOPICS, type ExamStatus, type Level, type Topic } from "../../shared/constants/exam.js";
import type { AnswerResult, ExamProgress, ExamToolResponse } from "../../shared/types/exam.js";
import { prisma as defaultPrisma } from "../db.js";
import { ExamError } from "../errors/exam-error.js";
import { fetchEnemQuestions } from "../repositories/enem.repository.js";
import { findQuestion, type InternalQuestion } from "../repositories/question.repository.js";
import { enemQuestionToData, toPublicQuestion } from "./question.service.js";

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

function parseQuestionIds(attempt: ExamAttempt): string[] {
  const parsed: unknown = JSON.parse(attempt.questionIdsJson);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new ExamError("INVALID_EXAM_DATA", "A ordem de questões da prova é inválida.");
  }
  return parsed;
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

async function requireAttempt(client: PrismaClient, examId: string): Promise<ExamAttempt> {
  const attempt = await client.examAttempt.findUnique({ where: { id: examId } });
  if (!attempt) throw new ExamError("EXAM_NOT_FOUND", "Prova não encontrada.", { examId });
  return attempt;
}

function progressOf(attempt: ExamAttempt, answered: number): ExamProgress {
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
  client: PrismaClient,
  attempt: ExamAttempt,
  result?: AnswerResult,
): Promise<ExamToolResponse> {
  const questionIds = parseQuestionIds(attempt);
  const answered = await client.examAnswer.count({ where: { examId: attempt.id } });
  const questionId = attempt.status === "finished" ? undefined : questionIds[attempt.currentQuestionIndex];
  const question = questionId ? toPublicQuestion(await findQuestion(client, questionId)) : undefined;
  return {
    exam: {
      id: attempt.id,
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

function answerResult(answer: ExamAnswer, question: InternalQuestion): AnswerResult {
  return {
    correct: answer.correct,
    selectedAlternativeId: answer.selectedAlternativeId,
    correctAlternativeId: question.correctAlternativeId,
    explanation: question.explanation,
  };
}

export class ExamService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async createExam(args: CreateExamArgs): Promise<ExamToolResponse> {
    const year = args.year;
    const fetched = await fetchEnemQuestions(year, args.numberOfQuestions);
    if (fetched.length < args.numberOfQuestions) {
      throw new ExamError(
        "INSUFFICIENT_QUESTIONS",
        `A prova do ENEM ${year} tem apenas ${fetched.length} questões disponíveis a partir do início.`,
        { available: fetched.length, requested: args.numberOfQuestions },
      );
    }
    const data = fetched.map((question) => enemQuestionToData(question, year));
    await this.db.$transaction(data.map((item) => this.db.question.upsert({
      where: { id: item.id }, create: item, update: item,
    })));
    const attempt = await this.db.examAttempt.create({ data: {
      topic: "ENEM",
      level: "enem",
      enemYear: year,
      questionIdsJson: JSON.stringify(data.map((item) => item.id)),
      sessionId: args.sessionId ?? randomUUID(),
      ...(args.userId ? { userId: args.userId } : {}),
    } });
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
    const updated = attempt.status === "paused" ? attempt : await this.db.examAttempt.update({
      where: { id: examId }, data: { status: "paused" },
    });
    return responseFor(this.db, updated);
  }

  async resumeExam(examId: string): Promise<ExamToolResponse> {
    const attempt = await requireAttempt(this.db, examId);
    if (attempt.status === "finished") throw new ExamError("EXAM_FINISHED", "A prova já foi finalizada.");
    const updated = attempt.status === "in_progress" ? attempt : await this.db.examAttempt.update({
      where: { id: examId }, data: { status: "in_progress" },
    });
    return responseFor(this.db, updated);
  }

  async submitAnswer(args: SubmitAnswerArgs): Promise<ExamToolResponse> {
    return withExamLock(args.examId, async () => this.db.$transaction(async (tx) => {
      const attempt = await tx.examAttempt.findUnique({ where: { id: args.examId } });
      if (!attempt) throw new ExamError("EXAM_NOT_FOUND", "Prova não encontrada.", { examId: args.examId });

      const existing = await tx.examAnswer.findUnique({
        where: { examId_questionId: { examId: args.examId, questionId: args.questionId } },
      });
      if (existing) {
        if (existing.selectedAlternativeId !== args.alternativeId) {
          throw new ExamError("ANSWER_ALREADY_SUBMITTED", "Esta questão já recebeu outra resposta.");
        }
        const current = await tx.examAttempt.findUniqueOrThrow({ where: { id: args.examId } });
        return responseFor(tx as unknown as PrismaClient, current, answerResult(existing, await findQuestion(tx, args.questionId)));
      }

      if (attempt.status === "paused") throw new ExamError("EXAM_PAUSED", "Retome a prova antes de responder.");
      if (attempt.status === "finished") throw new ExamError("EXAM_FINISHED", "A prova já foi finalizada.");

      const questionIds = parseQuestionIds(attempt);
      const currentQuestionId = questionIds[attempt.currentQuestionIndex];
      if (currentQuestionId !== args.questionId) {
        throw new ExamError("NOT_CURRENT_QUESTION", "A questão informada não é a questão atual.", { currentQuestionId });
      }

      const question = await findQuestion(tx, args.questionId);
      if (!question.alternatives.some(({ id }) => id === args.alternativeId)) {
        throw new ExamError("INVALID_ALTERNATIVE", "A alternativa não pertence à questão atual.");
      }

      const correct = question.correctAlternativeId === args.alternativeId;
      const answer = await tx.examAnswer.create({ data: {
        examId: args.examId,
        questionId: args.questionId,
        selectedAlternativeId: args.alternativeId,
        correct,
      } });
      const nextIndex = attempt.currentQuestionIndex + 1;
      const completed = nextIndex >= questionIds.length;
      const updated = await tx.examAttempt.update({ where: { id: args.examId }, data: {
        currentQuestionIndex: nextIndex,
        score: { increment: correct ? 1 : 0 },
        ...(completed ? { status: "finished", finishedAt: new Date() } : {}),
      } });
      return responseFor(tx as unknown as PrismaClient, updated, answerResult(answer, question));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
}
