import 'server-only';
import { query, queryOne } from '@/lib/db';
import { notFound } from '@/lib/errors';
import type { Entry, EntryStatus } from '@/lib/domain/types';
import type { IsoDate } from '@/lib/datetime';

interface EntryRow {
  id: string;
  bankroll_id: string;
  member_id: string;
  member_name: string;
  created_by_user_id: string | null;
  created_by_name: string | null;
  occurred_on: string;
  occurred_at_time: string;
  sport: string;
  event: string;
  market: string;
  odd_milli: number;
  stake_cents: number;
  status: EntryStatus;
  payout_cents: number;
  profit_cents: number;
  note: string | null;
  risk_override: boolean;
  risk_override_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    bankrollId: row.bankroll_id,
    memberId: row.member_id,
    memberName: row.member_name,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    occurredOn: row.occurred_on,
    occurredAtTime: row.occurred_at_time,
    sport: row.sport,
    event: row.event,
    market: row.market,
    oddMilli: row.odd_milli,
    stakeCents: row.stake_cents,
    status: row.status,
    payoutCents: row.payout_cents,
    profitCents: row.profit_cents,
    note: row.note,
    riskOverride: row.risk_override,
    riskOverrideReason: row.risk_override_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SELECT_ENTRY = `
  SELECT e.*, m.display_name AS member_name, u.name AS created_by_name
  FROM entries e
  JOIN members m ON m.id = e.member_id
  LEFT JOIN users u ON u.id = e.created_by_user_id
`;

export interface EntryFilters {
  dateFrom?: IsoDate | null;
  dateTo?: IsoDate | null;
  memberId?: string | null;
  statuses?: readonly EntryStatus[] | null;
  sport?: string | null;
  market?: string | null;
  oddMinMilli?: number | null;
  oddMaxMilli?: number | null;
  stakeMinCents?: number | null;
  stakeMaxCents?: number | null;
  search?: string | null;
}

interface WhereClause {
  sql: string;
  params: unknown[];
}

function buildWhere(bankrollId: string, filters: EntryFilters): WhereClause {
  const conditions: string[] = ['e.bankroll_id = $1'];
  const params: unknown[] = [bankrollId];

  /** Registra um valor e devolve o placeholder correspondente ($2, $3, ...). */
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.dateFrom) conditions.push(`e.occurred_on >= ${bind(filters.dateFrom)}::date`);
  if (filters.dateTo) conditions.push(`e.occurred_on <= ${bind(filters.dateTo)}::date`);
  if (filters.memberId) conditions.push(`e.member_id = ${bind(filters.memberId)}::uuid`);
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(`e.status = ANY(${bind([...filters.statuses])}::entry_status[])`);
  }
  if (filters.sport) conditions.push(`lower(e.sport) = lower(${bind(filters.sport)})`);
  if (filters.market) conditions.push(`lower(e.market) = lower(${bind(filters.market)})`);
  if (filters.oddMinMilli != null) conditions.push(`e.odd_milli >= ${bind(filters.oddMinMilli)}`);
  if (filters.oddMaxMilli != null) conditions.push(`e.odd_milli <= ${bind(filters.oddMaxMilli)}`);
  if (filters.stakeMinCents != null) conditions.push(`e.stake_cents >= ${bind(filters.stakeMinCents)}`);
  if (filters.stakeMaxCents != null) conditions.push(`e.stake_cents <= ${bind(filters.stakeMaxCents)}`);

  const search = filters.search?.trim();
  if (search) {
    const placeholder = bind(`%${search}%`);
    conditions.push(
      `(e.event ILIKE ${placeholder} OR e.market ILIKE ${placeholder} OR e.sport ILIKE ${placeholder}` +
        ` OR coalesce(e.note, '') ILIKE ${placeholder} OR m.display_name ILIKE ${placeholder})`,
    );
  }

  return { sql: conditions.join(' AND '), params };
}

export interface EntryPage {
  entries: Entry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export async function listEntries(
  bankrollId: string,
  filters: EntryFilters = {},
  pagination: { page?: number; pageSize?: number } = {},
): Promise<EntryPage> {
  const page = Math.max(1, pagination.page ?? 1);
  const pageSize = Math.min(Math.max(pagination.pageSize ?? 25, 5), 200);
  const where = buildWhere(bankrollId, filters);

  const countRow = await queryOne<{ total: string }>(
    `SELECT count(*)::text AS total FROM entries e JOIN members m ON m.id = e.member_id WHERE ${where.sql}`,
    where.params,
  );
  const total = Number(countRow?.total ?? 0);

  const rows = await query<EntryRow>(
    `${SELECT_ENTRY} WHERE ${where.sql}
     ORDER BY e.occurred_on DESC, e.occurred_at_time DESC, e.created_at DESC
     LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
    [...where.params, pageSize, (page - 1) * pageSize],
  );

  return {
    entries: rows.map(mapEntry),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Todas as entradas que atendem ao filtro (sem paginação) — usado nos cálculos. */
export async function listAllEntries(
  bankrollId: string,
  filters: EntryFilters = {},
): Promise<Entry[]> {
  const where = buildWhere(bankrollId, filters);
  const rows = await query<EntryRow>(
    `${SELECT_ENTRY} WHERE ${where.sql} ORDER BY e.occurred_on ASC, e.occurred_at_time ASC`,
    where.params,
  );
  return rows.map(mapEntry);
}

export async function getEntry(bankrollId: string, entryId: string): Promise<Entry> {
  const row = await queryOne<EntryRow>(`${SELECT_ENTRY} WHERE e.bankroll_id = $1 AND e.id = $2`, [
    bankrollId,
    entryId,
  ]);
  if (!row) throw notFound('Entrada não encontrada nesta banca.');
  return mapEntry(row);
}

export interface EntryWriteInput {
  memberId: string;
  occurredOn: IsoDate;
  occurredAtTime: string;
  sport: string;
  event: string;
  market: string;
  oddMilli: number;
  stakeCents: number;
  status: EntryStatus;
  payoutCents: number;
  profitCents: number;
  note: string | null;
  riskOverride: boolean;
  riskOverrideReason: string | null;
}

export async function insertEntry(
  bankrollId: string,
  input: EntryWriteInput,
  createdByUserId: string,
): Promise<Entry> {
  const rows = await query<{ id: string }>(
    `INSERT INTO entries
       (bankroll_id, member_id, created_by_user_id, occurred_on, occurred_at_time,
        sport, event, market, odd_milli, stake_cents, status, payout_cents, profit_cents,
        note, risk_override, risk_override_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      bankrollId,
      input.memberId,
      createdByUserId,
      input.occurredOn,
      input.occurredAtTime,
      input.sport,
      input.event,
      input.market,
      input.oddMilli,
      input.stakeCents,
      input.status,
      input.payoutCents,
      input.profitCents,
      input.note,
      input.riskOverride,
      input.riskOverrideReason,
    ],
  );
  const created = rows[0];
  if (!created) throw new Error('Falha ao registrar a entrada.');
  return getEntry(bankrollId, created.id);
}

export async function updateEntry(
  bankrollId: string,
  entryId: string,
  input: EntryWriteInput,
): Promise<Entry> {
  const rows = await query<{ id: string }>(
    `UPDATE entries SET
       member_id = $3, occurred_on = $4, occurred_at_time = $5, sport = $6, event = $7,
       market = $8, odd_milli = $9, stake_cents = $10, status = $11, payout_cents = $12,
       profit_cents = $13, note = $14, risk_override = $15, risk_override_reason = $16
     WHERE bankroll_id = $1 AND id = $2 RETURNING id`,
    [
      bankrollId,
      entryId,
      input.memberId,
      input.occurredOn,
      input.occurredAtTime,
      input.sport,
      input.event,
      input.market,
      input.oddMilli,
      input.stakeCents,
      input.status,
      input.payoutCents,
      input.profitCents,
      input.note,
      input.riskOverride,
      input.riskOverrideReason,
    ],
  );
  if (!rows[0]) throw notFound('Entrada não encontrada nesta banca.');
  return getEntry(bankrollId, entryId);
}

export async function deleteEntry(bankrollId: string, entryId: string): Promise<void> {
  await query('DELETE FROM entries WHERE bankroll_id = $1 AND id = $2', [bankrollId, entryId]);
}

/** Valores distintos usados para popular os filtros. */
export async function listDistinctValues(
  bankrollId: string,
): Promise<{ sports: string[]; markets: string[] }> {
  const sports = await query<{ value: string }>(
    'SELECT DISTINCT sport AS value FROM entries WHERE bankroll_id = $1 ORDER BY value ASC',
    [bankrollId],
  );
  const markets = await query<{ value: string }>(
    'SELECT DISTINCT market AS value FROM entries WHERE bankroll_id = $1 ORDER BY value ASC',
    [bankrollId],
  );
  return { sports: sports.map((r) => r.value), markets: markets.map((r) => r.value) };
}

/** Soma de lucro realizado de todas as entradas até uma data (inclusive). */
export async function sumProfitUpTo(bankrollId: string, date: IsoDate | null): Promise<number> {
  const row = await queryOne<{ total: number }>(
    `SELECT coalesce(sum(profit_cents), 0)::bigint AS total
     FROM entries WHERE bankroll_id = $1 AND status <> 'OPEN'
       AND ($2::date IS NULL OR occurred_on <= $2::date)`,
    [bankrollId, date],
  );
  return Number(row?.total ?? 0);
}

/** Soma de lucro realizado estritamente antes de uma data. */
export async function sumProfitBefore(bankrollId: string, date: IsoDate): Promise<number> {
  const row = await queryOne<{ total: number }>(
    `SELECT coalesce(sum(profit_cents), 0)::bigint AS total
     FROM entries WHERE bankroll_id = $1 AND status <> 'OPEN' AND occurred_on < $2::date`,
    [bankrollId, date],
  );
  return Number(row?.total ?? 0);
}

/** Períodos (ano/mês) que possuem registros — usado no seletor de meses. */
export async function listActivePeriods(
  bankrollId: string,
): Promise<{ year: number; month: number }[]> {
  const rows = await query<{ year: number; month: number }>(
    `SELECT DISTINCT EXTRACT(YEAR FROM occurred_on)::int AS year,
                     EXTRACT(MONTH FROM occurred_on)::int AS month
     FROM (
       SELECT occurred_on FROM entries WHERE bankroll_id = $1
       UNION ALL
       SELECT occurred_on FROM transactions WHERE bankroll_id = $1
     ) AS periods
     ORDER BY year DESC, month DESC`,
    [bankrollId],
  );
  return rows;
}
