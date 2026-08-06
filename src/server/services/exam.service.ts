import { randomUUID } from "node:crypto";
import type { ClientSession, Db, MongoClient } from "mongodb";
import { disciplineValueFromLabel, EXAM_STATUSES, LEVELS, TOPICS, type ExamStatus, type Level, type Topic } from "../../shared/constants/exam.js";
import type { AnswerResult, ExamProgress, ExamToolResponse, QuestionStatus } from "../../shared/types/exam.js";
import { db as defaultDb, mongoClient as defaultMongoClient } from "../db.js";
import { ExamError } from "../errors/exam-error.js";
import { fetchEnemQuestionsByDiscipline } from "../repositories/enem.repository.js";
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
  markedQuestionIds: string[];
  score: number;
  disciplina: string;
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
  disciplina: string;
  numberOfQuestions: number;
  userId?: string | undefined;
  sessionId?: string | undefined;
}
interface SubmitAnswerArgs { examId: string; questionId: string; alternativeId: string }
interface MarkQuestionArgs { examId: string; questionId: string; marked: boolean }

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

function answerResult(answer: ExamAnswerDoc, question: InternalQuestion): AnswerResult {
  return {
    correct: answer.correct,
    selectedAlternativeId: answer.selectedAlternativeId,
    correctAlternativeId: question.correctAlternativeId,
    explanation: question.explanation,
  };
}

async function responseFor(
  db: Db,
  attempt: ExamAttemptDoc,
  result?: AnswerResult,
  options?: { session?: ClientSession; viewQuestionId?: string },
): Promise<ExamToolResponse> {
  const questionIds = parseQuestionIds(attempt);
  const mongoOptions = options?.session ? { session: options.session } : {};
  const answers = await db.collection<ExamAnswerDoc>(ANSWERS_COLLECTION).find({ examId: attempt._id }, mongoOptions).toArray();
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const marked = new Set(attempt.markedQuestionIds ?? []);

  const questions: QuestionStatus[] = questionIds.map((id, i) => {
    const answer = answerByQuestion.get(id);
    return {
      questionId: id,
      index: i + 1,
      status: answer ? (answer.correct ? "correct" : "incorrect") : "unanswered",
      marked: marked.has(id),
    };
  });

  const viewedId = options?.viewQuestionId ?? (attempt.status === "finished" ? undefined : questionIds[attempt.currentQuestionIndex]);
  let question: ExamToolResponse["question"];
  let viewedResult = result;
  if (viewedId) {
    const internal = await findQuestion(db, viewedId, options);
    question = toPublicQuestion(internal);
    const existingAnswer = answerByQuestion.get(viewedId);
    if (!viewedResult && existingAnswer) viewedResult = answerResult(existingAnswer, internal);
  }

  return {
    exam: {
      id: attempt._id,
      status: examStatus(attempt.status),
      topic: examTopic(attempt.topic),
      level: examLevel(attempt.level),
      disciplina: attempt.disciplina,
    },
    progress: progressOf(attempt, answers.length),
    questions,
    ...(question ? { question } : {}),
    ...(viewedResult ? { result: viewedResult } : {}),
  };
}

export class ExamService {
  constructor(
    private readonly db: Db = defaultDb,
    private readonly client: MongoClient = defaultMongoClient,
  ) {}

  async createExam(args: CreateExamArgs): Promise<ExamToolResponse> {
    // A integração fala em label ("Ciências da Natureza") ou "todas"; enem_questions.discipline
    // guarda o value bruto do ENEM ("ciencias-natureza") — traduz só pra consultar.
    const discipline = args.disciplina === "todas" ? "all" : (disciplineValueFromLabel(args.disciplina) ?? args.disciplina);
    const fetched = await fetchEnemQuestionsByDiscipline(this.db, discipline, args.numberOfQuestions);
    if (fetched.length < args.numberOfQuestions) {
      throw new ExamError(
        "INSUFFICIENT_QUESTIONS",
        `Só há ${fetched.length} questões disponíveis para "${args.disciplina}".`,
        { available: fetched.length, requested: args.numberOfQuestions },
      );
    }
    const data = fetched.map((question) => enemQuestionToData(question));
    await upsertQuestions(this.db, data);

    const now = new Date();
    const attempt: ExamAttemptDoc = {
      _id: randomUUID(),
      sessionId: args.sessionId ?? randomUUID(),
      ...(args.userId ? { userId: args.userId } : {}),
      status: "in_progress",
      topic: "ENEM",
      level: "enem",
      disciplina: args.disciplina,
      questionIds: data.map((item) => item._id),
      currentQuestionIndex: 0,
      markedQuestionIds: [],
      score: 0,
      startedAt: now,
      updatedAt: now,
    };
    await this.db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).insertOne(attempt);
    return responseFor(this.db, attempt);
  }

  // Sem questionId, devolve a questão atualmente "aberta". Com questionId, navega pra ela —
  // qualquer questão da prova, respondida ou não (grade de navegação livre) — e persiste isso
  // como a nova posição atual, pra get_exam_progress/reaberturas da view lembrarem de onde parou.
  async getCurrentQuestion(examId: string, questionId?: string): Promise<ExamToolResponse> {
    const attempt = await requireAttempt(this.db, examId);
    if (!questionId) return responseFor(this.db, attempt);

    const index = parseQuestionIds(attempt).indexOf(questionId);
    if (index === -1) throw new ExamError("QUESTION_NOT_IN_EXAM", "A questão informada não pertence a esta prova.", { questionId });

    const updated = index === attempt.currentQuestionIndex ? attempt : await this.db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).findOneAndUpdate(
      { _id: examId }, { $set: { currentQuestionIndex: index, updatedAt: new Date() } }, { returnDocument: "after" },
    );
    return responseFor(this.db, updated ?? attempt);
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

  async markQuestion(args: MarkQuestionArgs): Promise<ExamToolResponse> {
    const attempt = await requireAttempt(this.db, args.examId);
    if (attempt.status === "finished") throw new ExamError("EXAM_FINISHED", "A prova já foi finalizada.");
    if (!parseQuestionIds(attempt).includes(args.questionId)) {
      throw new ExamError("QUESTION_NOT_IN_EXAM", "A questão informada não pertence a esta prova.", { questionId: args.questionId });
    }
    const update = args.marked
      ? { $addToSet: { markedQuestionIds: args.questionId }, $set: { updatedAt: new Date() } }
      : { $pull: { markedQuestionIds: args.questionId }, $set: { updatedAt: new Date() } };
    const updated = await this.db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).findOneAndUpdate(
      { _id: args.examId }, update, { returnDocument: "after" },
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

          // Navegação livre: qualquer questão da prova pode ser respondida, não só a "atual".
          const questionIds = parseQuestionIds(attempt);
          const targetIndex = questionIds.indexOf(args.questionId);
          if (targetIndex === -1) {
            throw new ExamError("QUESTION_NOT_IN_EXAM", "A questão informada não pertence a esta prova.", { questionId: args.questionId });
          }

          const existing = await answers.findOne({ examId: args.examId, questionId: args.questionId }, { session });
          if (existing) {
            if (existing.selectedAlternativeId !== args.alternativeId) {
              throw new ExamError("ANSWER_ALREADY_SUBMITTED", "Esta questão já recebeu outra resposta.");
            }
            // Não mexe em currentQuestionIndex — é só uma confirmação idempotente. Passa
            // viewQuestionId pra devolver question/result desta questão sem descasar do statement,
            // mas sem mover a posição "atual" da prova (que fica intocada).
            const question = await findQuestion(this.db, args.questionId, { session });
            response = await responseFor(this.db, attempt, answerResult(existing, question), { session, viewQuestionId: args.questionId });
            return;
          }

          if (attempt.status === "paused") throw new ExamError("EXAM_PAUSED", "Retome a prova antes de responder.");
          if (attempt.status === "finished") throw new ExamError("EXAM_FINISHED", "A prova já foi finalizada.");

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

          // Concluída quando todas as questões tiverem resposta — não mais "chegou no fim da
          // lista", já que a ordem de resposta pode não ser sequencial.
          const answeredCount = await answers.countDocuments({ examId: args.examId }, { session });
          const completed = answeredCount >= questionIds.length;
          const nextIndex = Math.min(attempt.currentQuestionIndex + 1, questionIds.length - 1);
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
