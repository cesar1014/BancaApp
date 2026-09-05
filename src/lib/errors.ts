export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RISK_BLOCKED'
  | 'PERIOD_CLOSED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, string[]>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (details) this.details = details;
  }
}

export function forbidden(message = 'Você não tem permissão para esta ação.'): AppError {
  return new AppError('FORBIDDEN', message);
}

export function notFound(message = 'Registro não encontrado.'): AppError {
  return new AppError('NOT_FOUND', message);
}

export function validation(message: string, details?: Record<string, string[]>): AppError {
  return new AppError('VALIDATION', message, details);
}

export function conflict(message: string): AppError {
  return new AppError('CONFLICT', message);
}

export function periodClosed(message: string): AppError {
  return new AppError('PERIOD_CLOSED', message);
}

/** Resultado padrão devolvido por toda Server Action. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: string; code: AppErrorCode; details?: Record<string, string[]>; warnings?: string[] };

export function toActionError(error: unknown): Extract<ActionResult<never>, { ok: false }> {
  if (error instanceof AppError) {
    return error.details
      ? { ok: false, error: error.message, code: error.code, details: error.details }
      : { ok: false, error: error.message, code: error.code };
  }
  console.error('[action] erro não tratado', error);
  return {
    ok: false,
    error: 'Não foi possível concluir a operação. Tente novamente.',
    code: 'INTERNAL',
  };
}
