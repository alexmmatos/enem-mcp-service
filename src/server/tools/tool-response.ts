import type { ToolErrorResponse } from "../../shared/types/exam.js";
import { normalizeError } from "../errors/exam-error.js";

export function successResult<T extends object>(value: T, message: string) {
  return {
    structuredContent: { ...value },
    content: [{ type: "text" as const, text: message }],
    isError: false,
  };
}

export function errorResult(error: unknown) {
  const normalized = normalizeError(error);
  const payload: ToolErrorResponse = {
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
  };
  return {
    structuredContent: { ...payload },
    content: [{ type: "text" as const, text: `${normalized.code}: ${normalized.message}` }],
    isError: true,
  };
}

export async function runTool<T extends object>(operation: () => Promise<T>, message: string) {
  try {
    return successResult(await operation(), message);
  } catch (error) {
    return errorResult(error);
  }
}
