/**
 * Token de sessão assinado (JWT compacto, HS256) usando apenas Web Crypto.
 *
 * Web Crypto existe tanto no runtime Node quanto no runtime Edge, então o
 * mesmo código valida a sessão no middleware e nos Server Components — sem
 * dependência externa.
 */

export interface SessionClaims {
  /** user id */
  sub: string;
  /** bankroll id */
  bid: string;
  role: 'ADMIN' | 'PARTNER';
  /** token_version do usuário: invalida sessões antigas */
  tv: number;
  /** emitido em (segundos) */
  iat: number;
  /** expira em (segundos) */
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSessionToken(
  claims: Omit<SessionClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionClaims = { ...claims, iat: issuedAt, exp: issuedAt + ttlSeconds };

  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;

  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionClaims | null> {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts as [string, string, string];
  const data = `${header}.${body}`;

  const key = await importKey(secret);
  const expected = base64UrlEncode(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))),
  );
  if (!constantTimeEquals(signature, expected)) return null;

  let claims: SessionClaims;
  try {
    claims = JSON.parse(decoder.decode(base64UrlDecode(body))) as SessionClaims;
  } catch {
    return null;
  }

  if (
    typeof claims.sub !== 'string' ||
    typeof claims.bid !== 'string' ||
    typeof claims.exp !== 'number' ||
    typeof claims.tv !== 'number' ||
    (claims.role !== 'ADMIN' && claims.role !== 'PARTNER')
  ) {
    return null;
  }

  if (claims.exp <= Math.floor(Date.now() / 1000)) return null;

  return claims;
}

export const SESSION_COOKIE = 'banca_session';
