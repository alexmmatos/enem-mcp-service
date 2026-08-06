import { type Db, MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureIndexes } from "../src/server/db.js";
import { ATTEMPTS_COLLECTION, ExamService, type ExamAttemptDoc } from "../src/server/services/exam.service.js";
import { ResultService } from "../src/server/services/result.service.js";
import { QUESTIONS_COLLECTION, type QuestionDoc } from "../src/server/repositories/question.repository.js";

const YEAR = 2022;

interface EnemExamDoc { _id: number; languages: Array<{ value: string }> }
interface EnemQuestionDoc extends Record<string, unknown> { _id: string; year: number; index: number; language: string | null }

function enemQuestionDoc(index: number) {
  return {
    _id: `enem-${YEAR}-${index}`,
    year: YEAR,
    index,
    language: null,
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

let replSet: MongoMemoryReplSet;
let client: MongoClient;
let db: Db;
let service: ExamService;
let resultService: ResultService;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  client = new MongoClient(replSet.getUri());
  await client.connect();
  db = client.db("test");
  await ensureIndexes(db);
  service = new ExamService(db, client);
  resultService = new ResultService(db, client);
}, 120_000);

afterAll(async () => {
  await client.close();
  await replSet.stop();
});

beforeEach(async () => {
  await Promise.all([
    db.collection("exam_attempts").deleteMany({}),
    db.collection("exam_answers").deleteMany({}),
    db.collection("questions").deleteMany({}),
    db.collection("enem_questions").deleteMany({}),
    db.collection("enem_exams").deleteMany({}),
  ]);
  await db.collection<EnemExamDoc>("enem_exams").insertOne({ _id: YEAR, languages: [] });
  await db.collection<EnemQuestionDoc>("enem_questions").insertMany(
    Array.from({ length: 50 }, (_, i) => enemQuestionDoc(i + 1)),
  );
});

async function seedSingleQuestion(question: Record<string, unknown>) {
  await db.collection("enem_questions").deleteMany({});
  await db.collection<EnemQuestionDoc>("enem_questions").insertOne({ _id: `enem-${YEAR}-1`, year: YEAR, language: null, ...question } as EnemQuestionDoc);
}

async function create(count = 3) {
  return service.createExam({ year: YEAR, numberOfQuestions: count });
}

async function internal(questionId: string) {
  const row = await db.collection<QuestionDoc>(QUESTIONS_COLLECTION).findOne({ _id: questionId });
  if (!row) throw new Error(`questão ${questionId} não encontrada`);
  return { ...row, id: row._id };
}

describe("ExamService", () => {
  it("cria uma prova a partir do ENEM, com sessão anônima e cache local", async () => {
    const response = await create(5);
    const attempt = await db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).findOne({ _id: response.exam.id });
    const ids = attempt!.questionIds;
    expect(response.exam).toMatchObject({ status: "in_progress", topic: "ENEM", level: "enem", year: YEAR });
    expect(response.progress).toMatchObject({ current: 1, total: 5, answered: 0, correct: 0 });
    expect(attempt!.sessionId).toBeTruthy();
    expect(ids).toEqual(["enem-2022-1", "enem-2022-2", "enem-2022-3", "enem-2022-4", "enem-2022-5"]);

    const cached = await internal(ids[0]!);
    expect(cached.topic).toBe("Matemática");
  });

  it("extrai imagens do contexto e de alternativas image-only", async () => {
    await seedSingleQuestion({
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
    expect(response.question?.images).toEqual(["https://enem.dev/2022/questions/1/img1.jpg"]);
    expect(response.question?.alternatives).toEqual([
      { id: "A", image: "https://enem.dev/2022/questions/1/alt-a.jpg" },
      { id: "B", image: "https://enem.dev/2022/questions/1/alt-b.jpg" },
    ]);
  });

  it("filtra o placeholder de imagem quebrada do ENEM (context e alternativa)", async () => {
    await seedSingleQuestion({
      index: 1,
      discipline: "matematica",
      context: "![](https://res.cloudinary.com/gisdr0od/image/upload/v1786040662/enem-files/broken-image.svg)",
      correctAlternative: "A",
      alternativesIntroduction: "Pergunta sem imagem real.",
      alternatives: [
        { letter: "A", text: null, file: "https://res.cloudinary.com/gisdr0od/image/upload/v1786040662/enem-files/broken-image.svg", isCorrect: true },
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
    await db.collection("enem_questions").deleteMany({ index: { $gt: 1 } });
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
    const wrong = question.alternatives.find(({ id }) => id !== question.correctAlternativeId)!;
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
    expect(await db.collection("exam_answers").countDocuments({ examId: created.exam.id })).toBe(1);
    expect((await db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).findOne({ _id: created.exam.id }))!.score).toBe(1);
  });

  it("serializa chamadas simultâneas sem duplicar pontuação ou avanço", async () => {
    const created = await create();
    const question = await internal(created.question!.id);
    const input = { examId: created.exam.id, questionId: question.id, alternativeId: question.correctAlternativeId };
    const [first, second] = await Promise.all([service.submitAnswer(input), service.submitAnswer(input)]);
    expect(first.progress).toEqual(second.progress);
    expect(await db.collection("exam_answers").countDocuments({ examId: created.exam.id })).toBe(1);
    expect((await db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).findOne({ _id: created.exam.id }))!.currentQuestionIndex).toBe(1);
  });

  it("rejeita uma questão diferente da atual", async () => {
    const created = await create(2);
    const attempt = await db.collection<ExamAttemptDoc>(ATTEMPTS_COLLECTION).findOne({ _id: created.exam.id });
    const ids = attempt!.questionIds;
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
