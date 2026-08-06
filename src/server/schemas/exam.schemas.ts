import { z } from "zod";
import { ENEM_DISCIPLINE_LABELS } from "../../shared/constants/exam.js";

export const createExamInput = {
  disciplina: z.enum([...ENEM_DISCIPLINE_LABELS, "todas"]).default("todas")
    .describe("Disciplina do ENEM a estudar (Linguagens, Ciências Humanas, Ciências da Natureza, Matemática), ou \"todas\" para misturar todas as disciplinas. Questões são sorteadas de todos os anos disponíveis."),
  numberOfQuestions: z.number().int().min(1).max(50).describe("Quantidade de questões."),
  userId: z.string().trim().min(1).max(128).optional().describe("Identificador opcional do usuário."),
  sessionId: z.string().trim().min(1).max(128).optional().describe("Identificador opcional da sessão."),
};

export const examIdInput = {
  examId: z.string().trim().min(1).describe("Identificador da prova."),
};

export const submitAnswerInput = {
  ...examIdInput,
  questionId: z.string().trim().min(1).describe("Questão exibida atualmente."),
  alternativeId: z.string().trim().min(1).describe("Alternativa selecionada."),
};
