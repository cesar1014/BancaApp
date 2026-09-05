function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Copie .env.example para .env e preencha os valores.`,
    );
  }
  return value.trim();
}

export function databaseUrl(): string {
  return required('DATABASE_URL');
}

export function authSecret(): string {
  const secret = required('AUTH_SECRET');
  if (secret.length < 24) {
    throw new Error('AUTH_SECRET precisa ter pelo menos 24 caracteres.');
  }
  return secret;
}

export function sessionTtlSeconds(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? '168');
  if (!Number.isFinite(hours) || hours <= 0) return 168 * 3600;
  return Math.floor(hours * 3600);
}

export const isProduction = process.env.NODE_ENV === 'production';
