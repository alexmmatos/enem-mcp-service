import { ExamService } from "../services/exam.service.js";
import { runTool } from "./tool-response.js";

interface Input { examId: string; questionId?: string | undefined }

export async function getCurrentQuestion({ examId, questionId }: Input) {
  return runTool(
    () => new ExamService().getCurrentQuestion(examId, questionId),
    questionId ? "Navegou para a questão pedida." : "Questão atual recuperada sem avançar a prova.",
  );
}
