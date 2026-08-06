import { ExamService } from "../services/exam.service.js";
import { runTool } from "./tool-response.js";

export async function getCurrentQuestion({ examId }: { examId: string }) {
  return runTool(() => new ExamService().getCurrentQuestion(examId), "Questão atual recuperada sem avançar a prova.");
}
