import type { ExamAttempt, PrismaClient } from "@prisma/client";
import { TOPICS, type Topic } from "../../shared/constants/exam.js";
import type { ExamReport, FinishExamResponse } from "../../shared/types/exam.js";
import { prisma as defaultPrisma } from "../db.js";
import { ExamError } from "../errors/exam-error.js";
import { findQuestion } from "../repositories/question.repository.js";
import { ExamService } from "./exam.service.js";
import { extractImages } from "./question.service.js";

function idsOf(attempt: ExamAttempt): string[] {
  return JSON.parse(attempt.questionIdsJson) as string[];
}

export class ResultService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async finishExam(examId: string): Promise<FinishExamResponse> {
    const found = await this.db.examAttempt.findUnique({ where: { id: examId } });
    if (!found) throw new ExamError("EXAM_NOT_FOUND", "Prova não encontrada.", { examId });
    const attempt = found.status === "finished" ? found : await this.db.examAttempt.update({
      where: { id: examId }, data: { status: "finished", finishedAt: new Date() },
    });
    const base = await new ExamService(this.db).getProgress(examId);
    const report = await this.buildReport(attempt);
    return { ...base, report };
  }

  private async buildReport(attempt: ExamAttempt): Promise<ExamReport> {
    const questionIds = idsOf(attempt);
    const [questions, answers] = await Promise.all([
      Promise.all(questionIds.map(async (id) => findQuestion(this.db, id))),
      this.db.examAnswer.findMany({ where: { examId: attempt.id } }),
    ]);
    const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
    const topics = new Map<Topic, { correct: number; total: number }>();
    for (const question of questions) {
      const topic = question.topic as Topic;
      const value = topics.get(topic) ?? { correct: 0, total: 0 };
      value.total += 1;
      if (answerByQuestion.get(question.id)?.correct) value.correct += 1;
      topics.set(topic, value);
    }
    const performanceByTopic = [...topics].map(([topic, value]) => ({
      topic, ...value, percentage: Math.round((value.correct / value.total) * 100),
    }));
    const reviewQuestions = questions.map((question) => {
      const answer = answerByQuestion.get(question.id);
      return {
        questionId: question.id,
        topic: question.topic as Topic,
        statement: extractImages(question.statement).text,
        correct: Boolean(answer?.correct),
        selectedAlternativeId: answer?.selectedAlternativeId ?? null,
        correctAlternativeId: question.correctAlternativeId,
        explanation: question.explanation,
      };
    });
    const wrongQuestions = reviewQuestions.filter((question) => !question.correct);
    const correct = answers.filter(({ correct: value }) => value).length;
    const total = questionIds.length;
    return {
      score: correct,
      percentage: total === 0 ? 0 : Math.round((correct / total) * 100),
      correct,
      incorrect: total - correct,
      performanceByTopic,
      wrongQuestions,
      reviewQuestions,
      recommendedTopics: performanceByTopic
        .filter(({ percentage }) => percentage < 70)
        .map(({ topic }) => topic)
        .sort((left, right) => TOPICS.indexOf(left) - TOPICS.indexOf(right)),
    };
  }
}
