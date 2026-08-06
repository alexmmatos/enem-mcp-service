import { ResultService } from "../services/result.service.js";
import { runTool } from "./tool-response.js";

export async function finishExam({ examId }: { examId: string }) {
  return runTool(() => new ResultService().finishExam(examId), "Prova finalizada e relatório calculado.");
}
