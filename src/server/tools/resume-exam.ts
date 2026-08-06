import { ExamService } from "../services/exam.service.js";
import { runTool } from "./tool-response.js";

export async function resumeExam({ examId }: { examId: string }) {
  return runTool(() => new ExamService().resumeExam(examId), "Prova retomada na questão atual.");
}
