import { ExamService } from "../services/exam.service.js";
import { runTool } from "./tool-response.js";

export async function getExamProgress({ examId }: { examId: string }) {
  return runTool(() => new ExamService().getProgress(examId), "Progresso atual recuperado.");
}
