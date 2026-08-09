import { Redis } from "@upstash/redis";

// Cache é otimização, não infra essencial — sem as env vars o app funciona igual, só sem
// reaproveitar a seleção de questões entre pedidos (sempre faz $sample de novo).
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

export const EXAM_QUESTIONS_CACHE_TTL_SECONDS = process.env.EXAM_QUESTIONS_CACHE_TTL_SECONDS
  ? parseInt(process.env.EXAM_QUESTIONS_CACHE_TTL_SECONDS, 10)
  : 30 * 60;

export function examQuestionsCacheKey(discipline: string, numberOfQuestions: number): string {
  return `exam-questions:${discipline}:${numberOfQuestions}`;
}
