export class ExamError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ExamError";
  }
}

export function normalizeError(error: unknown): ExamError {
  if (error instanceof ExamError) return error;
  return new ExamError("INTERNAL_ERROR", "Não foi possível concluir a operação.");
}
