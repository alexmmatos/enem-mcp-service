import type { Prisma } from "@prisma/client";
import { ENEM_DISCIPLINE_TOPICS, LEVELS, TOPICS, type Level, type Topic } from "../../shared/constants/exam.js";
import type { PublicQuestion } from "../../shared/types/exam.js";
import { ExamError } from "../errors/exam-error.js";
import type { EnemQuestion } from "../repositories/enem.repository.js";
import type { InternalQuestion } from "../repositories/question.repository.js";

function asTopic(value: string): Topic {
  if (!TOPICS.includes(value as Topic)) throw new ExamError("INVALID_QUESTION_DATA", "Assunto inválido no banco.");
  return value as Topic;
}

function asLevel(value: string): Level {
  if (!LEVELS.includes(value as Level)) throw new ExamError("INVALID_QUESTION_DATA", "Nível inválido no banco.");
  return value as Level;
}

const IMAGE_MARKDOWN_RE = /!\[\]\(([^)]+)\)/g;

// A própria API do ENEM referencia esse placeholder quando a imagem original se perdeu
// (ex.: ENEM 2023, questões 1 e 44) — resolve como um SVG real de "imagem quebrada", então
// precisa ser filtrado explicitamente em vez de aparecer como se fosse uma figura da prova.
const MISSING_IMAGE_URL = "/assets/broken-image.svg";

// O statement guarda imagens como markdown (`![](url)`), copiado direto do `context` do ENEM;
// extraímos as URLs aqui para renderizar <img> de verdade em vez de exigir um renderer de markdown.
export function extractImages(text: string): { text: string; images: string[] } {
  const images: string[] = [];
  const cleaned = text.replace(IMAGE_MARKDOWN_RE, (_match, url: string) => {
    if (url !== MISSING_IMAGE_URL) images.push(url);
    return "";
  }).trim();
  return { text: cleaned, images };
}

export function toPublicQuestion(question: InternalQuestion): PublicQuestion {
  const { text: statement, images } = extractImages(question.statement);
  const base = {
    id: question.id,
    topic: asTopic(question.topic),
    level: asLevel(question.level),
    statement,
    alternatives: question.alternatives,
    ...(images.length ? { images } : {}),
  };
  return question.code ? { ...base, code: question.code } : base;
}

function enemTopic(discipline: string): Topic {
  const topic = ENEM_DISCIPLINE_TOPICS[discipline];
  if (!topic) throw new ExamError("ENEM_API_ERROR", `Disciplina do ENEM desconhecida: ${discipline}.`);
  return topic;
}

export function enemQuestionToData(question: EnemQuestion, year: number): Prisma.QuestionCreateInput {
  const context = (question.context ?? "").trim();
  const statement = context ? `${context}\n\n${question.alternativesIntroduction}` : question.alternativesIntroduction;
  return {
    id: `enem-${year}-${question.index}`,
    topic: enemTopic(question.discipline),
    level: "enem",
    statement,
    alternativesJson: JSON.stringify(question.alternatives.map(({ letter, text, file }) => ({
      id: letter,
      ...(text ? { text } : {}),
      ...(file && file !== MISSING_IMAGE_URL ? { image: file } : {}),
    }))),
    correctAlternativeId: question.correctAlternative,
    explanation: `Gabarito oficial ENEM ${year}: alternativa ${question.correctAlternative}.`,
  };
}
