import 'server-only';
import { query, queryOne } from '@/lib/db';
import { notFound } from '@/lib/errors';
import type { Member, UserRole } from '@/lib/domain/types';

interface MemberRow {
  id: string;
  bankroll_id: string;
  user_id: string | null;
  display_name: string;
  share_bps: number;
  initial_contribution_cents: number;
  can_create_entries: boolean;
  is_active: boolean;
  joined_on: string;
  user_email: string | null;
  user_role: UserRole | null;
  user_is_active: boolean | null;
}

function mapMember(row: MemberRow): Member {
  return {
    id: row.id,
    bankrollId: row.bankroll_id,
    userId: row.user_id,
    displayName: row.display_name,
    shareBps: row.share_bps,
    initialContributionCents: row.initial_contribution_cents,
    canCreateEntries: row.can_create_entries,
    isActive: row.is_active,
    joinedOn: row.joined_on,
    userEmail: row.user_email,
    userRole: row.user_role,
    userIsActive: row.user_is_active,
  };
}

const SELECT_MEMBER = `
  SELECT m.id, m.bankroll_id, m.user_id, m.display_name, m.share_bps,
         m.initial_contribution_cents, m.can_create_entries, m.is_active, m.joined_on,
         u.email AS user_email, u.role AS user_role, u.is_active AS user_is_active
  FROM members m
  LEFT JOIN users u ON u.id = m.user_id
`;

export async function listMembers(bankrollId: string): Promise<Member[]> {
  const rows = await query<MemberRow>(
    `${SELECT_MEMBER} WHERE m.bankroll_id = $1 ORDER BY m.is_active DESC, m.display_name ASC`,
    [bankrollId],
  );
  return rows.map(mapMember);
}

export async function getMember(bankrollId: string, memberId: string): Promise<Member> {
  const row = await queryOne<MemberRow>(
    `${SELECT_MEMBER} WHERE m.bankroll_id = $1 AND m.id = $2`,
    [bankrollId, memberId],
  );
  if (!row) throw notFound('Sócio não encontrado nesta banca.');
  return mapMember(row);
}

export async function findMemberByUser(bankrollId: string, userId: string): Promise<Member | null> {
  const row = await queryOne<MemberRow>(
    `${SELECT_MEMBER} WHERE m.bankroll_id = $1 AND m.user_id = $2`,
    [bankrollId, userId],
  );
  return row ? mapMember(row) : null;
}

export interface MemberInput {
  userId: string | null;
  displayName: string;
  shareBps: number;
  initialContributionCents: number;
  canCreateEntries: boolean;
  isActive: boolean;
  joinedOn: string;
}

export async function createMember(bankrollId: string, input: MemberInput): Promise<Member> {
  const rows = await query<{ id: string }>(
    `INSERT INTO members
       (bankroll_id, user_id, display_name, share_bps, initial_contribution_cents,
        can_create_entries, is_active, joined_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      bankrollId,
      input.userId,
      input.displayName,
      input.shareBps,
      input.initialContributionCents,
      input.canCreateEntries,
      input.isActive,
      input.joinedOn,
    ],
  );
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar sócio.');
  return getMember(bankrollId, created.id);
}

export async function updateMember(
  bankrollId: string,
  memberId: string,
  input: MemberInput,
): Promise<Member> {
  const rows = await query<{ id: string }>(
    `UPDATE members SET
       user_id = $3, display_name = $4, share_bps = $5,
       initial_contribution_cents = $6, can_create_entries = $7,
       is_active = $8, joined_on = $9
     WHERE bankroll_id = $1 AND id = $2 RETURNING id`,
    [
      bankrollId,
      memberId,
      input.userId,
      input.displayName,
      input.shareBps,
      input.initialContributionCents,
      input.canCreateEntries,
      input.isActive,
      input.joinedOn,
    ],
  );
  if (!rows[0]) throw notFound('Sócio não encontrado nesta banca.');
  return getMember(bankrollId, memberId);
}

/** Atualiza várias participações de uma vez (usado ao redistribuir %). */
export async function updateShares(
  bankrollId: string,
  shares: readonly { memberId: string; shareBps: number }[],
): Promise<void> {
  for (const share of shares) {
    await query('UPDATE members SET share_bps = $3 WHERE bankroll_id = $1 AND id = $2', [
      bankrollId,
      share.memberId,
      share.shareBps,
    ]);
  }
}

export async function countMemberEntries(memberId: string): Promise<number> {
  const row = await queryOne<{ total: string }>(
    'SELECT count(*)::text AS total FROM entries WHERE member_id = $1',
    [memberId],
  );
  return Number(row?.total ?? 0);
}

export async function deleteMember(bankrollId: string, memberId: string): Promise<void> {
  await query('DELETE FROM members WHERE bankroll_id = $1 AND id = $2', [bankrollId, memberId]);
}
