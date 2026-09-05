import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';

/**
 * Hash de senha com scrypt (node:crypto). Formato armazenado:
 *   scrypt$<salt-base64url>$<hash-base64url>
 *
 * scrypt é uma KDF com custo de memória, recomendada pelo próprio Node, e não
 * exige nenhuma dependência externa nem binário nativo — o que mantém o
 * projeto instalável e portátil (inclusive em serverless).
 */
/**
 * Comprimento mínimo aceito por esta função de baixo nível.
 *
 * É 6, e não 8, porque a senha padrão do sistema (`DEFAULT_USER_PASSWORD`,
 * distribuída pelo administrador e trocada obrigatoriamente no primeiro
 * acesso) pode ser mais curta. A exigência de 8 caracteres vale para toda
 * senha ESCOLHIDA por uma pessoa e é aplicada nos schemas Zod
 * (`changePasswordSchema`, `recoverPasswordSchema`, `resetPasswordSchema`),
 * que são o caminho por onde essas senhas entram.
 */
export const MIN_PASSWORD_LENGTH = 6;

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;

  const salt = Buffer.from(parts[1] ?? '', 'base64url');
  const expected = Buffer.from(parts[2] ?? '', 'base64url');
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}

/** Senha aleatória legível, usada ao criar um usuário sem senha definida. */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out}@1`;
}
