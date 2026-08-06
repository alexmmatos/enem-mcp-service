import { z } from "zod";

export const createExamInput = {
  year: z.number().int().min(1998).max(new Date().getFullYear())
    .describe("Ano da prova oficial do ENEM a consultar em api.enem.dev."),
  numberOfQuestions: z.number().int().min(1).max(50).describe("Quantidade de questões (limit da consulta ao ENEM)."),
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
