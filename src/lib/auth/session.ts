import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authSecret, isProduction, sessionTtlSeconds } from '@/lib/env';
import { AppError } from '@/lib/errors';
import type { SessionUser } from '@/lib/domain/types';
import { SESSION_COOKIE, signSessionToken, verifySessionToken } from './token';
import { findUserById } from '@/lib/repos/users';
import { findMemberByUser } from '@/lib/repos/members';
import { getFirstBankroll } from '@/lib/repos/bankroll';

/**
 * Carrega a sessão a partir do cookie e revalida SEMPRE contra o banco:
 * o token diz quem é, o banco diz o que essa pessoa ainda pode fazer.
 * `cache` garante uma única consulta por requisição.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token, authSecret());
  if (!claims) return null;

  const user = await findUserById(claims.sub);
  if (!user || !user.is_active) return null;
  if (user.token_version !== claims.tv) return null;

  const member = await findMemberByUser(claims.bid, user.id);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    isOwner: user.is_owner,
    mustChangePassword: user.must_change_password,
    bankrollId: claims.bid,
    memberId: member?.id ?? null,
    canCreateEntries: member?.canCreateEntries ?? user.role === 'ADMIN',
  };
});

/**
 * Usa em Server Components: redireciona para o login quando não autenticado
 * e para a troca obrigatória de senha enquanto a conta usa a senha padrão.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/trocar-senha');
  return user;
}

/** Usa em Server Actions: lança erro tratável em vez de redirecionar. */
export async function requireUserForAction(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sua sessão expirou. Entre novamente.');
  }
  return user;
}

export async function startSession(params: {
  userId: string;
  bankrollId: string;
  role: 'ADMIN' | 'PARTNER';
  tokenVersion: number;
}): Promise<void> {
  const ttl = sessionTtlSeconds();
  const token = await signSessionToken(
    { sub: params.userId, bid: params.bankrollId, role: params.role, tv: params.tokenVersion },
    authSecret(),
    ttl,
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: ttl,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Banca padrão do sistema (o desenho suporta várias; o seed cria uma). */
export async function resolveDefaultBankrollId(): Promise<string | null> {
  const bankroll = await getFirstBankroll();
  return bankroll?.id ?? null;
}
