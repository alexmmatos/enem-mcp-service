import { ExamService } from "../services/exam.service.js";
import { runTool } from "./tool-response.js";

interface Input {
  disciplina: string;
  numberOfQuestions: number;
  userId?: string | undefined;
  sessionId?: string | undefined;
}

export async function createExam(input: Input) {
  return runTool(() => new ExamService().createExam(input), "Prova criada. A primeira questão está pronta.");
}
