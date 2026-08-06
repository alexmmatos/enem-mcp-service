import type { Db, MongoClient } from "mongodb";
import { TOPICS, type Topic } from "../../shared/constants/exam.js";
import type { ExamReport, FinishExamResponse } from "../../shared/types/exam.js";
import { db as defaultDb, mongoClient as defaultMongoClient } from "../db.js";
import { ExamError } from "../errors/exam-error.js";
import { findQuestion } from "../repositories/question.repository.js";
import { ANSWERS_COLLECTION, ATTEMPTS_COLLECTION, ExamService, type ExamAnswerDoc, type ExamAttemptDoc } from "./exam.service.js";
import { extractImages } from "./question.service.js";

export class ResultService {
  constructor(
    private readonly db: Db = defaultDb,
    private readonly client: MongoClient = defaultMongoClient,
  ) {}

  async finishExam(examId: string): Promise<FinishExamResponse> {
    const collection = this.db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION);
    const found = await collection.findOne({ _id: examId });
    if (!found) throw new ExamError("EXAM_NOT_FOUND", "Prova não encontrada.", { examId });
    const attempt = found.status === "finished" ? found : await collection.findOneAndUpdate(
      { _id: examId },
      { $set: { status: "finished", finishedAt: new Date(), updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    const base = await new ExamService(this.db, this.client).getProgress(examId);
    const report = await this.buildReport(attempt ?? found);
    return { ...base, report };
  }

  private async buildReport(attempt: ExamAttemptDoc): Promise<ExamReport> {
    const questionIds = attempt.questionIds;
    const [questions, answers] = await Promise.all([
      Promise.all(questionIds.map(async (id) => findQuestion(this.db, id))),
      this.db.collection<ExamAnswerDoc>(ANSWERS_COLLECTION).find({ examId: attempt._id }).toArray(),
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
