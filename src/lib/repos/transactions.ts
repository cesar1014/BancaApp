import 'server-only';
import { query, queryOne } from '@/lib/db';
import { notFound } from '@/lib/errors';
import type { Transaction, TransactionKind } from '@/lib/domain/types';
import type { IsoDate } from '@/lib/datetime';

interface TransactionRow {
  id: string;
  bankroll_id: string;
  member_id: string | null;
  member_name: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  kind: TransactionKind;
  amount_cents: number;
  occurred_on: string;
  note: string | null;
  created_at: Date;
}

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    bankrollId: row.bankroll_id,
    memberId: row.member_id,
    memberName: row.member_name,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    kind: row.kind,
    amountCents: row.amount_cents,
    occurredOn: row.occurred_on,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

const SELECT_TRANSACTION = `
  SELECT t.*, m.display_name AS member_name, u.name AS created_by_name
  FROM transactions t
  LEFT JOIN members m ON m.id = t.member_id
  LEFT JOIN users u ON u.id = t.created_by_user_id
`;

export interface TransactionFilters {
  dateFrom?: IsoDate | null;
  dateTo?: IsoDate | null;
  kind?: TransactionKind | null;
  memberId?: string | null;
}

export async function listTransactions(
  bankrollId: string,
  filters: TransactionFilters = {},
): Promise<Transaction[]> {
  const conditions = ['t.bankroll_id = $1'];
  const params: unknown[] = [bankrollId];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.dateFrom) conditions.push(`t.occurred_on >= ${bind(filters.dateFrom)}::date`);
  if (filters.dateTo) conditions.push(`t.occurred_on <= ${bind(filters.dateTo)}::date`);
  if (filters.kind) conditions.push(`t.kind = ${bind(filters.kind)}::transaction_kind`);
  if (filters.memberId) conditions.push(`t.member_id = ${bind(filters.memberId)}::uuid`);

  const rows = await query<TransactionRow>(
    `${SELECT_TRANSACTION} WHERE ${conditions.join(' AND ')}
     ORDER BY t.occurred_on DESC, t.created_at DESC`,
    params,
  );
  return rows.map(mapTransaction);
}

export async function getTransaction(bankrollId: string, id: string): Promise<Transaction> {
  const row = await queryOne<TransactionRow>(
    `${SELECT_TRANSACTION} WHERE t.bankroll_id = $1 AND t.id = $2`,
    [bankrollId, id],
  );
  if (!row) throw notFound('Movimentação não encontrada nesta banca.');
  return mapTransaction(row);
}

export interface TransactionWriteInput {
  memberId: string | null;
  kind: TransactionKind;
  amountCents: number;
  occurredOn: IsoDate;
  note: string | null;
}

export async function insertTransaction(
  bankrollId: string,
  input: TransactionWriteInput,
  createdByUserId: string,
): Promise<Transaction> {
  const rows = await query<{ id: string }>(
    `INSERT INTO transactions (bankroll_id, member_id, created_by_user_id, kind, amount_cents, occurred_on, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      bankrollId,
      input.memberId,
      createdByUserId,
      input.kind,
      input.amountCents,
      input.occurredOn,
      input.note,
    ],
  );
  const created = rows[0];
  if (!created) throw new Error('Falha ao registrar a movimentação.');
  return getTransaction(bankrollId, created.id);
}

export async function updateTransaction(
  bankrollId: string,
  id: string,
  input: TransactionWriteInput,
): Promise<Transaction> {
  const rows = await query<{ id: string }>(
    `UPDATE transactions SET member_id = $3, kind = $4, amount_cents = $5, occurred_on = $6, note = $7
     WHERE bankroll_id = $1 AND id = $2 RETURNING id`,
    [bankrollId, id, input.memberId, input.kind, input.amountCents, input.occurredOn, input.note],
  );
  if (!rows[0]) throw notFound('Movimentação não encontrada nesta banca.');
  return getTransaction(bankrollId, id);
}

export async function deleteTransaction(bankrollId: string, id: string): Promise<void> {
  await query('DELETE FROM transactions WHERE bankroll_id = $1 AND id = $2', [bankrollId, id]);
}

/** Aportes e retiradas acumulados até uma data (inclusive). */
export async function sumCashUpTo(
  bankrollId: string,
  date: IsoDate | null,
): Promise<{ contributionsCents: number; withdrawalsCents: number }> {
  const row = await queryOne<{ contributions: number; withdrawals: number }>(
    `SELECT
       coalesce(sum(amount_cents) FILTER (WHERE kind = 'CONTRIBUTION'), 0)::bigint AS contributions,
       coalesce(sum(amount_cents) FILTER (WHERE kind = 'WITHDRAWAL'), 0)::bigint AS withdrawals
     FROM transactions
     WHERE bankroll_id = $1 AND ($2::date IS NULL OR occurred_on <= $2::date)`,
    [bankrollId, date],
  );
  return {
    contributionsCents: Number(row?.contributions ?? 0),
    withdrawalsCents: Number(row?.withdrawals ?? 0),
  };
}

/** Aportes e retiradas estritamente antes de uma data. */
export async function sumCashBefore(
  bankrollId: string,
  date: IsoDate,
): Promise<{ contributionsCents: number; withdrawalsCents: number }> {
  const row = await queryOne<{ contributions: number; withdrawals: number }>(
    `SELECT
       coalesce(sum(amount_cents) FILTER (WHERE kind = 'CONTRIBUTION'), 0)::bigint AS contributions,
       coalesce(sum(amount_cents) FILTER (WHERE kind = 'WITHDRAWAL'), 0)::bigint AS withdrawals
     FROM transactions
     WHERE bankroll_id = $1 AND occurred_on < $2::date`,
    [bankrollId, date],
  );
  return {
    contributionsCents: Number(row?.contributions ?? 0),
    withdrawalsCents: Number(row?.withdrawals ?? 0),
  };
}
