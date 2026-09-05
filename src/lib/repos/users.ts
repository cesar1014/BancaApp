import 'server-only';
import { query, queryOne } from '@/lib/db';
import type { UserRole } from '@/lib/domain/types';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  password_hash: string;
  role: UserRole;
  is_owner: boolean;
  must_change_password: boolean;
  is_active: boolean;
  token_version: number;
  last_login_at: Date | null;
  created_at: Date;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: UserRole;
  isOwner: boolean;
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function mapSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    role: row.role,
    isOwner: row.is_owner,
    mustChangePassword: row.must_change_password,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE lower(btrim(email)) = lower(btrim($1))', [
    email,
  ]);
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE lower(username) = lower(btrim($1))', [
    username,
  ]);
}

/** Login aceita o nick ou o e-mail — quem tem "@" é e-mail. */
export async function findUserByLogin(login: string): Promise<UserRow | null> {
  const value = login.trim();
  if (value.includes('@')) return findUserByEmail(value);
  return findUserByUsername(value);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
}

export async function listUsers(): Promise<UserSummary[]> {
  const rows = await query<UserRow>('SELECT * FROM users ORDER BY is_owner DESC, name ASC');
  return rows.map(mapSummary);
}

export async function createUser(input: {
  name: string;
  email: string;
  username: string | null;
  passwordHash: string;
  role: UserRole;
  mustChangePassword?: boolean;
}): Promise<UserSummary> {
  const rows = await query<UserRow>(
    `INSERT INTO users (name, email, username, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      input.name,
      input.email.trim(),
      input.username,
      input.passwordHash,
      input.role,
      input.mustChangePassword ?? false,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('Falha ao criar usuário.');
  return mapSummary(row);
}

export async function updateUserProfile(
  id: string,
  input: { name: string; email: string; username: string | null; role: UserRole; isActive: boolean },
): Promise<UserSummary> {
  const rows = await query<UserRow>(
    `UPDATE users SET name = $2, email = $3, username = $4, role = $5, is_active = $6,
       token_version = CASE WHEN $6 = FALSE THEN token_version + 1 ELSE token_version END
     WHERE id = $1 RETURNING *`,
    [id, input.name, input.email.trim(), input.username, input.role, input.isActive],
  );
  const row = rows[0];
  if (!row) throw new Error('Usuário não encontrado.');
  return mapSummary(row);
}

/**
 * Trocar a senha invalida todas as sessões existentes daquele usuário.
 * `mustChangePassword` marca se a nova senha é a padrão (troca obrigatória).
 */
export async function updateUserPassword(
  id: string,
  passwordHash: string,
  mustChangePassword = false,
): Promise<number> {
  const row = await queryOne<{ token_version: number }>(
    `UPDATE users SET password_hash = $2, must_change_password = $3, token_version = token_version + 1
     WHERE id = $1 RETURNING token_version`,
    [id, passwordHash, mustChangePassword],
  );
  return row?.token_version ?? 0;
}

export async function touchLastLogin(id: string): Promise<void> {
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
}

export async function countAdmins(): Promise<number> {
  const row = await queryOne<{ total: string }>(
    "SELECT count(*)::text AS total FROM users WHERE role = 'ADMIN' AND is_active = TRUE",
  );
  return Number(row?.total ?? 0);
}
