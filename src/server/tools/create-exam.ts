import type { McpExtra } from "skybridge/server";
import { ExamService } from "../services/exam.service.js";
import { runTool } from "./tool-response.js";

interface Input {
  disciplina: string;
  numberOfQuestions: number;
  sessionId?: string | undefined;
}

// `sub` do token OAuth verificado (ver server.ts) — nunca vem do cliente, então não dá pra
// falsificar um userId alheio como acontecia com o campo antigo de input.
function userIdFrom(extra: McpExtra): string | undefined {
  const subject = extra.authInfo?.extra?.subject;
  return typeof subject === "string" ? subject : undefined;
}

export async function createExam(input: Input, extra: McpExtra) {
  return runTool(
    () => new ExamService().createExam({ ...input, userId: userIdFrom(extra) }),
    "Prova criada. A primeira questão está pronta.",
  );
}
