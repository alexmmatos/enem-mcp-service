import { ExamService } from "../services/exam.service.js";
import { runTool } from "./tool-response.js";

export async function pauseExam({ examId }: { examId: string }) {
  return runTool(() => new ExamService().pauseExam(examId), "Prova pausada. O progresso foi preservado.");
}
