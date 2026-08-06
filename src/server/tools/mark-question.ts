import { ExamService } from "../services/exam.service.js";
import { runTool } from "./tool-response.js";

interface Input { examId: string; questionId: string; marked: boolean }

export async function markQuestion(input: Input) {
  return runTool(
    () => new ExamService().markQuestion(input),
    input.marked ? "Questão marcada para revisão." : "Marcação removida.",
  );
}
