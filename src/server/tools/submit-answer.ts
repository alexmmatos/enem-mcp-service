import { ExamService } from "../services/exam.service.js";
import { runTool } from "./tool-response.js";

export async function submitAnswer(input: { examId: string; questionId: string; alternativeId: string }) {
  return runTool(() => new ExamService().submitAnswer(input), "Resposta registrada e progresso atualizado.");
}
