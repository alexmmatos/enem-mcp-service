import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExamService } from "../src/server/services/exam.service.js";
import { ResultService } from "../src/server/services/result.service.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn() };
});

const readFileMock = vi.mocked(readFile);

const db = new PrismaClient();
const service = new ExamService(db);
const resultService = new ResultService(db);

const YEAR = 2022;
let available = 50;

function enemQuestion(index: number) {
  return {
    index,
    discipline: "matematica",
    context: `![](https://enem.dev/img.jpg)\n\nContexto da questão ${index}.`,
    correctAlternative: "B",
    alternativesIntroduction: `Pergunta ${index}?`,
    alternatives: [
      { letter: "A", text: "Errada", file: null, isCorrect: false },
      { letter: "B", text: "Certa", file: null, isCorrect: true },
      { letter: "C", text: "Errada", file: null, isCorrect: false },
    ],
  };
}

function examDetails(count: number) {
  return { languages: [], questions: Array.from({ length: count }, (_, i) => ({ index: i + 1, language: null })) };
}

beforeEach(async () => {
  await db.examAnswer.deleteMany();
  await db.examAttempt.deleteMany();
  available = 50;
  readFileMock.mockImplementation((filePath) => {
    const path = filePath as string;
    const questionMatch = /questions[/\\](\d+)[/\\]details\.json$/.exec(path);
    if (questionMatch) {
      const index = Number(questionMatch[1]);
      if (index > available) return Promise.reject(new Error("ENOENT"));
      return Promise.resolve(JSON.stringify(enemQuestion(index)));
    }
    if (path.endsWith("details.json")) return Promise.resolve(JSON.stringify(examDetails(available)));
    return Promise.reject(new Error("ENOENT"));
  });
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => db.$disconnect());

function mockSingleQuestion(question: Record<string, unknown>) {
  readFileMock.mockReset();
  readFileMock.mockImplementationOnce(() => Promise.resolve(JSON.stringify({ languages: [], questions: [{ index: 1, language: null }] })));
  readFileMock.mockImplementationOnce(() => Promise.resolve(JSON.stringify(question)));
}

async function create(count = 3) {
  return service.createExam({ year: YEAR, numberOfQuestions: count });
}

async function internal(questionId: string) {
  return db.question.findUniqueOrThrow({ where: { id: questionId } });
}

describe("ExamService", () => {
  it("cria uma prova a partir do ENEM, com sessão anônima e cache local", async () => {
    const response = await create(5);
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: response.exam.id } });
    const ids = JSON.parse(attempt.questionIdsJson) as string[];
    expect(response.exam).toMatchObject({ status: "in_progress", topic: "ENEM", level: "enem", year: YEAR });
    expect(response.progress).toMatchObject({ current: 1, total: 5, answered: 0, correct: 0 });
    expect(attempt.sessionId).toBeTruthy();
    expect(ids).toEqual(["enem-2022-1", "enem-2022-2", "enem-2022-3", "enem-2022-4", "enem-2022-5"]);

    const cached = await internal(ids[0]!);
    expect(cached.topic).toBe("Matemática");
  });

  it("extrai imagens do contexto e de alternativas image-only", async () => {
    mockSingleQuestion({
      index: 1,
      discipline: "matematica",
      context: "![](https://enem.dev/2022/questions/1/img1.jpg)\n\nTexto do contexto.",
      correctAlternative: "A",
      alternativesIntroduction: "Qual alternativa representa a fórmula?",
      alternatives: [
        { letter: "A", text: null, file: "https://enem.dev/2022/questions/1/alt-a.jpg", isCorrect: true },
        { letter: "B", text: null, file: "https://enem.dev/2022/questions/1/alt-b.jpg", isCorrect: false },
      ],
    });

    const response = await create(1);

    expect(response.question?.statement).not.toContain("![");
    expect(response.question?.statement).toContain("Texto do contexto.");
    expect(response.question?.images).toEqual(["/assets/img1.jpg"]);
    expect(response.question?.alternatives).toEqual([
      { id: "A", image: "/assets/alt-a.jpg" },
      { id: "B", image: "/assets/alt-b.jpg" },
    ]);
  });

  it("filtra o placeholder de imagem quebrada do ENEM (context e alternativa)", async () => {
    mockSingleQuestion({
      index: 1,
      discipline: "matematica",
      context: "![](https://enem.dev/broken-image.svg)",
      correctAlternative: "A",
      alternativesIntroduction: "Pergunta sem imagem real.",
      alternatives: [
        { letter: "A", text: null, file: "https://enem.dev/broken-image.svg", isCorrect: true },
        { letter: "B", text: "Certa por eliminação", file: null, isCorrect: false },
      ],
    });

    const response = await create(1);

    expect(response.question?.statement).not.toContain("broken-image");
    expect(response.question?.images).toBeUndefined();
    expect(response.question?.alternatives).toEqual([
      { id: "A" },
      { id: "B", text: "Certa por eliminação" },
    ]);
  });

  it("recusa quantidade indisponível com erro estruturável", async () => {
    available = 1;
    await expect(create(5)).rejects.toMatchObject({ code: "INSUFFICIENT_QUESTIONS", details: { available: 1, requested: 5 } });
  });

  it("recupera sempre a questão atual sem avançar", async () => {
    const created = await create();
    const first = await service.getCurrentQuestion(created.exam.id);
    const second = await service.getCurrentQuestion(created.exam.id);
    expect(first.question?.id).toBe(created.question?.id);
    expect(second.question?.id).toBe(created.question?.id);
    expect(second.progress.answered).toBe(0);
  });

  it("não expõe resposta ou explicação antes da resposta", async () => {
    const created = await create();
    const serialized = JSON.stringify(created.question);
    expect(serialized).not.toContain("correctAlternativeId");
    expect(serialized).not.toContain("explanation");
    expect(Object.keys(created.question ?? {})).toEqual(expect.arrayContaining(["id", "topic", "level", "statement", "alternatives"]));
  });

  it("registra resposta correta, pontua e avança", async () => {
    const created = await create();
    const question = await internal(created.question!.id);
    const response = await service.submitAnswer({ examId: created.exam.id, questionId: question.id, alternativeId: question.correctAlternativeId });
    expect(response.result).toMatchObject({ correct: true, correctAlternativeId: question.correctAlternativeId });
    expect(response.progress).toMatchObject({ answered: 1, correct: 1, current: 2 });
    expect(response.question?.id).not.toBe(question.id);
  });

  it("registra resposta incorreta sem pontuar", async () => {
    const created = await create();
    const question = await internal(created.question!.id);
    const wrong = (JSON.parse(question.alternativesJson) as Array<{ id: string }>).find(({ id }) => id !== question.correctAlternativeId)!;
    const response = await service.submitAnswer({ examId: created.exam.id, questionId: question.id, alternativeId: wrong.id });
    expect(response.result?.correct).toBe(false);
    expect(response.progress).toMatchObject({ answered: 1, correct: 0, percentage: 0 });
  });

  it("pausa e retoma sem perder a questão", async () => {
    const created = await create();
    const paused = await service.pauseExam(created.exam.id);
    expect(paused.exam.status).toBe("paused");
    expect(paused.question?.id).toBe(created.question?.id);
    await expect(service.submitAnswer({ examId: created.exam.id, questionId: created.question!.id, alternativeId: "A" }))
      .rejects.toMatchObject({ code: "EXAM_PAUSED" });
    const resumed = await service.resumeExam(created.exam.id);
    expect(resumed.exam.status).toBe("in_progress");
    expect(resumed.question?.id).toBe(created.question?.id);
  });

  it("é idempotente ao receber a mesma resposta duas vezes", async () => {
    const created = await create();
    const question = await internal(created.question!.id);
    const input = { examId: created.exam.id, questionId: question.id, alternativeId: question.correctAlternativeId };
    const first = await service.submitAnswer(input);
    const duplicate = await service.submitAnswer(input);
    expect(duplicate.progress).toEqual(first.progress);
    expect(await db.examAnswer.count({ where: { examId: created.exam.id } })).toBe(1);
    expect((await db.examAttempt.findUniqueOrThrow({ where: { id: created.exam.id } })).score).toBe(1);
  });

  it("serializa chamadas simultâneas sem duplicar pontuação ou avanço", async () => {
    const created = await create();
    const question = await internal(created.question!.id);
    const input = { examId: created.exam.id, questionId: question.id, alternativeId: question.correctAlternativeId };
    const [first, second] = await Promise.all([service.submitAnswer(input), service.submitAnswer(input)]);
    expect(first.progress).toEqual(second.progress);
    expect(await db.examAnswer.count({ where: { examId: created.exam.id } })).toBe(1);
    expect((await db.examAttempt.findUniqueOrThrow({ where: { id: created.exam.id } })).currentQuestionIndex).toBe(1);
  });

  it("rejeita uma questão diferente da atual", async () => {
    const created = await create(2);
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: created.exam.id } });
    const ids = JSON.parse(attempt.questionIdsJson) as string[];
    await expect(service.submitAnswer({ examId: created.exam.id, questionId: ids[1]!, alternativeId: "A" }))
      .rejects.toMatchObject({ code: "NOT_CURRENT_QUESTION" });
  });

  it("rejeita resposta nova em prova finalizada", async () => {
    const created = await create(2);
    await resultService.finishExam(created.exam.id);
    await expect(service.submitAnswer({ examId: created.exam.id, questionId: created.question!.id, alternativeId: "A" }))
      .rejects.toMatchObject({ code: "EXAM_FINISHED" });
  });

  it("finaliza de forma idempotente e calcula o relatório", async () => {
    const created = await create(2);
    const question = await internal(created.question!.id);
    await service.submitAnswer({ examId: created.exam.id, questionId: question.id, alternativeId: question.correctAlternativeId });
    const first = await resultService.finishExam(created.exam.id);
    const second = await resultService.finishExam(created.exam.id);
    expect(first.exam.status).toBe("finished");
    expect(first.report).toEqual(second.report);
    expect(first.report).toMatchObject({ correct: 1, incorrect: 1, percentage: 50 });
    expect(first.report.wrongQuestions).toHaveLength(1);
  });

  it("executa o fluxo integrado completo", async () => {
    let response = await create(3);
    const examId = response.exam.id;
    while (response.question) {
      const question = await internal(response.question.id);
      response = await service.submitAnswer({ examId, questionId: question.id, alternativeId: question.correctAlternativeId });
    }
    const final = await resultService.finishExam(examId);
    expect(final.exam.status).toBe("finished");
    expect(final.progress).toMatchObject({ answered: 3, correct: 3, percentage: 100 });
    expect(final.report).toMatchObject({ correct: 3, incorrect: 0, percentage: 100 });
    expect(final.report.wrongQuestions).toEqual([]);
  });
});
