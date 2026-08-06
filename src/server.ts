import { McpServer } from "skybridge/server";
import { ensureIndexes } from "./server/db.js";
import { createExamInput, examIdInput, submitAnswerInput } from "./server/schemas/exam.schemas.js";
import { createExam } from "./server/tools/create-exam.js";
import { finishExam } from "./server/tools/finish-exam.js";
import { getCurrentQuestion } from "./server/tools/get-current-question.js";
import { getExamProgress } from "./server/tools/get-exam-progress.js";
import { pauseExam } from "./server/tools/pause-exam.js";
import { resumeExam } from "./server/tools/resume-exam.js";
import { submitAnswer } from "./server/tools/submit-answer.js";

const standardMeta = (invoking: string, invoked: string) => ({
  "openai/toolInvocation/invoking": invoking,
  "openai/toolInvocation/invoked": invoked,
});

const server = new McpServer(
  { name: "tech-exam-mcp", version: "1.0.0" },
  { capabilities: {} },
)
  .registerTool(
    {
      name: "create_exam",
      description: "Cria uma prova persistente com questões oficiais do ENEM e abre a interface interativa.",
      inputSchema: createExamInput,
      annotations: { title: "Criar prova", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: standardMeta("Preparando a prova…", "Prova pronta."),
      view: {
        component: "exam-app",
        description: "Interface interativa de uma prova de tecnologia.",
      },
    },
    createExam,
  )
  .registerTool(
    {
      name: "get_current_question",
      description: "Recupera a questão atual sem avançar a prova.",
      inputSchema: examIdInput,
      annotations: { title: "Ver questão atual", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: standardMeta("Recuperando a questão…", "Questão recuperada."),
    },
    getCurrentQuestion,
  )
  .registerTool(
    {
      name: "submit_answer",
      description: "Registra de forma idempotente a resposta da questão atual e avança a prova.",
      inputSchema: submitAnswerInput,
      annotations: { title: "Responder questão", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: standardMeta("Validando a resposta…", "Resposta registrada."),
    },
    submitAnswer,
  )
  .registerTool(
    {
      name: "pause_exam",
      description: "Pausa uma prova preservando todo o progresso.",
      inputSchema: examIdInput,
      annotations: { title: "Pausar prova", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: standardMeta("Pausando a prova…", "Prova pausada."),
    },
    pauseExam,
  )
  .registerTool(
    {
      name: "resume_exam",
      description: "Retoma uma prova pausada na questão atual.",
      inputSchema: examIdInput,
      annotations: { title: "Retomar prova", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: standardMeta("Retomando a prova…", "Prova retomada."),
    },
    resumeExam,
  )
  .registerTool(
    {
      name: "get_exam_progress",
      description: "Retorna o progresso persistido e a questão atual da prova.",
      inputSchema: examIdInput,
      annotations: { title: "Ver progresso", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: standardMeta("Consultando o progresso…", "Progresso recuperado."),
    },
    getExamProgress,
  )
  .registerTool(
    {
      name: "finish_exam",
      description: "Finaliza a prova e retorna um relatório detalhado de desempenho.",
      inputSchema: examIdInput,
      annotations: { title: "Finalizar prova", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: standardMeta("Calculando o resultado…", "Resultado pronto."),
    },
    finishExam,
  );

await ensureIndexes();

export default await server.run();
export type AppType = typeof server;
