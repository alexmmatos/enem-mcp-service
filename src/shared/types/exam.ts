import type { ExamStatus, Level, Topic } from "../constants/exam.js";

export interface Alternative { id: string; text?: string; image?: string }

export interface PublicQuestion {
  id: string;
  topic: Topic;
  level: Level;
  year: number;
  statement: string;
  images?: string[];
  code?: string;
  alternatives: Alternative[];
}

export interface ExamProgress {
  current: number;
  total: number;
  answered: number;
  correct: number;
  percentage: number;
}

export interface AnswerResult {
  correct: boolean;
  selectedAlternativeId: string;
  correctAlternativeId: string;
  explanation: string;
}

export interface ExamSummary { id: string; status: ExamStatus; topic: Topic; level: Level; disciplina: string }

export interface QuestionStatus {
  questionId: string;
  index: number;
  status: "unanswered" | "correct" | "incorrect";
  marked: boolean;
}

export interface ExamToolResponse {
  exam: ExamSummary;
  progress: ExamProgress;
  questions: QuestionStatus[];
  question?: PublicQuestion;
  result?: AnswerResult;
}

export interface WrongQuestion {
  questionId: string;
  topic: Topic;
  statement: string;
  selectedAlternativeId: string | null;
  correctAlternativeId: string;
  explanation: string;
}

export interface ReviewQuestion extends WrongQuestion { correct: boolean }

export interface ExamReport {
  score: number;
  percentage: number;
  correct: number;
  incorrect: number;
  performanceByTopic: Array<{ topic: Topic; correct: number; total: number; percentage: number }>;
  wrongQuestions: WrongQuestion[];
  reviewQuestions: ReviewQuestion[];
  recommendedTopics: Topic[];
}

export interface FinishExamResponse extends ExamToolResponse { report: ExamReport }

export interface ToolErrorResponse {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
