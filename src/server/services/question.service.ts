import { ENEM_DISCIPLINE_TOPICS, LEVELS, TOPICS, type EnemDiscipline, type Level, type Topic } from "../../shared/constants/exam.js";
import type { PublicQuestion } from "../../shared/types/exam.js";
import { ExamError } from "../errors/exam-error.js";
import type { EnemQuestion } from "../repositories/enem.repository.js";
import type { InternalQuestion, QuestionDoc } from "../repositories/question.repository.js";

function asTopic(value: string): Topic {
  if (!TOPICS.includes(value as Topic)) throw new ExamError("INVALID_QUESTION_DATA", "Assunto inválido no banco.");
  return value as Topic;
}

function asLevel(value: string): Level {
  if (!LEVELS.includes(value as Level)) throw new ExamError("INVALID_QUESTION_DATA", "Nível inválido no banco.");
  return value as Level;
}

const IMAGE_MARKDOWN_RE = /!\[\]\(([^)]+)\)/g;
// Remover a imagem do meio do texto deixa as quebras de linha que a cercavam órfãs (3+ `\n`
// seguidos) — com `white-space: pre-line` na view, cada uma vira uma linha em branco visível.
const EXCESS_BLANK_LINES_RE = /(?:[ \t]*\n){3,}/g;

// A própria API do ENEM referencia esse placeholder quando a imagem original se perdeu
// (ex.: ENEM 2023, questões 1 e 44) — resolve como um SVG real de "imagem quebrada", então
// precisa ser filtrado explicitamente em vez de aparecer como se fosse uma figura da prova.
// Mesmo arquivo hospedado no Cloudinary por scripts/upload-cloudinary.ts (pasta "enem-files").
const MISSING_IMAGE_URL = process.env.CLOUDINARY_IMAGE_BASE_URL
  ? `${process.env.CLOUDINARY_IMAGE_BASE_URL}broken-image.svg`
  : "https://res.cloudinary.com/gisdr0od/image/upload/v1786040662/enem-files/broken-image.svg";

// O statement guarda imagens como markdown (`![](url)`), copiado direto do `context` do ENEM;
// extraímos as URLs aqui para renderizar <img> de verdade em vez de exigir um renderer de markdown.
export function extractImages(text: string): { text: string; images: string[] } {
  const images: string[] = [];
  const cleaned = text.replace(IMAGE_MARKDOWN_RE, (_match, url: string) => {
    if (url !== MISSING_IMAGE_URL) images.push(url);
    return "";
  }).replace(EXCESS_BLANK_LINES_RE, "\n\n").trim();
  return { text: cleaned, images };
}

export function toPublicQuestion(question: InternalQuestion): PublicQuestion {
  const { text: statement, images } = extractImages(question.statement);
  const base = {
    id: question.id,
    topic: asTopic(question.topic),
    level: asLevel(question.level),
    year: question.year,
    statement,
    alternatives: question.alternatives,
    ...(images.length ? { images } : {}),
  };
  return question.code ? { ...base, code: question.code } : base;
}

function enemTopic(discipline: string): Topic {
  const topic = ENEM_DISCIPLINE_TOPICS[discipline as EnemDiscipline];
  if (!topic) throw new ExamError("ENEM_API_ERROR", `Disciplina do ENEM desconhecida: ${discipline}.`);
  return topic;
}

export function enemQuestionToData(question: EnemQuestion): QuestionDoc {
  const context = (question.context ?? "").trim();
  const statement = context ? `${context}\n\n${question.alternativesIntroduction}` : question.alternativesIntroduction;
  return {
    _id: `enem-${question.year}-${question.index}`,
    topic: enemTopic(question.discipline),
    level: "enem",
    year: question.year,
    statement,
    code: null,
    alternatives: question.alternatives.map(({ letter, text, file }) => ({
      id: letter,
      ...(text ? { text } : {}),
      ...(file && file !== MISSING_IMAGE_URL ? { image: file } : {}),
    })),
    correctAlternativeId: question.correctAlternative,
    explanation: `Gabarito oficial ENEM ${question.year}: alternativa ${question.correctAlternative}.`,
  };
}
