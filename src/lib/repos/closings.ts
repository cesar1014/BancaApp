import 'server-only';
import { query, queryOne, withTransaction } from '@/lib/db';
import type { MonthlyClosingSnapshot } from '@/lib/domain/closing';

export interface MonthlyClosing {
  id: string;
  bankrollId: string;
  year: number;
  month: number;
  openingBankrollCents: number;
  entriesProfitCents: number;
  contributionsCents: number;
  withdrawalsCents: number;
  closingBankrollCents: number;
  goalCents: number;
  goalProgressBps: number;
  roiBps: number;
  entriesCount: number;
  greens: number;
  reds: number;
  voids: number;
  cashouts: number;
  openEntries: number;
  hitRateBps: number;
  totalStakedCents: number;
  maxStakeCents: number;
  snapshot: MonthlyClosingSnapshot;
  closedAt: string;
  closedByName: string | null;
}

interface ClosingRow {
  id: string;
  bankroll_id: string;
  year: number;
  month: number;
  opening_bankroll_cents: number;
  entries_profit_cents: number;
  contributions_cents: number;
  withdrawals_cents: number;
  closing_bankroll_cents: number;
  goal_cents: number;
  goal_progress_bps: number;
  roi_bps: number;
  entries_count: number;
  greens: number;
  reds: number;
  voids: number;
  cashouts: number;
  open_entries: number;
  hit_rate_bps: number;
  total_staked_cents: number;
  max_stake_cents: number;
  snapshot: MonthlyClosingSnapshot;
  closed_at: Date;
  closed_by_name: string | null;
}

function mapClosing(row: ClosingRow): MonthlyClosing {
  return {
    id: row.id,
    bankrollId: row.bankroll_id,
    year: row.year,
    month: row.month,
    openingBankrollCents: row.opening_bankroll_cents,
    entriesProfitCents: row.entries_profit_cents,
    contributionsCents: row.contributions_cents,
    withdrawalsCents: row.withdrawals_cents,
    closingBankrollCents: row.closing_bankroll_cents,
    goalCents: row.goal_cents,
    goalProgressBps: row.goal_progress_bps,
    roiBps: row.roi_bps,
    entriesCount: row.entries_count,
    greens: row.greens,
    reds: row.reds,
    voids: row.voids,
    cashouts: row.cashouts,
    openEntries: row.open_entries,
    hitRateBps: row.hit_rate_bps,
    totalStakedCents: row.total_staked_cents,
    maxStakeCents: row.max_stake_cents,
    snapshot: row.snapshot,
    closedAt: row.closed_at.toISOString(),
    closedByName: row.closed_by_name,
  };
}

const SELECT_CLOSING = `
  SELECT c.*, u.name AS closed_by_name
  FROM monthly_closings c
  LEFT JOIN users u ON u.id = c.closed_by_user_id
`;

export async function listClosings(bankrollId: string): Promise<MonthlyClosing[]> {
  const rows = await query<ClosingRow>(
    `${SELECT_CLOSING} WHERE c.bankroll_id = $1 ORDER BY c.year DESC, c.month DESC`,
    [bankrollId],
  );
  return rows.map(mapClosing);
}

export async function findClosing(
  bankrollId: string,
  year: number,
  month: number,
): Promise<MonthlyClosing | null> {
  const row = await queryOne<ClosingRow>(
    `${SELECT_CLOSING} WHERE c.bankroll_id = $1 AND c.year = $2 AND c.month = $3`,
    [bankrollId, year, month],
  );
  return row ? mapClosing(row) : null;
}

/** Existe fechamento cobrindo esta data? Usado para bloquear edições no passado. */
export async function isPeriodClosed(bankrollId: string, date: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM monthly_closings
       WHERE bankroll_id = $1
         AND year = EXTRACT(YEAR FROM $2::date)::int
         AND month = EXTRACT(MONTH FROM $2::date)::int
     ) AS exists`,
    [bankrollId, date],
  );
  return row?.exists ?? false;
}

export async function createClosing(
  bankrollId: string,
  snapshot: MonthlyClosingSnapshot,
  closedByUserId: string,
): Promise<MonthlyClosing> {
  const id = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO monthly_closings (
         bankroll_id, year, month,
         opening_bankroll_cents, entries_profit_cents, contributions_cents, withdrawals_cents,
         closing_bankroll_cents, goal_cents, goal_progress_bps, roi_bps,
         entries_count, greens, reds, voids, cashouts, open_entries, hit_rate_bps,
         total_staked_cents, max_stake_cents, snapshot, closed_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING id`,
      [
        bankrollId,
        snapshot.year,
        snapshot.month,
        snapshot.openingBankrollCents,
        snapshot.entriesProfitCents,
        snapshot.contributionsCents,
        snapshot.withdrawalsCents,
        snapshot.closingBankrollCents,
        snapshot.goalCents,
        snapshot.goalProgressBps,
        snapshot.roiBps,
        snapshot.entriesCount,
        snapshot.greens,
        snapshot.reds,
        snapshot.voids,
        snapshot.cashouts,
        snapshot.openEntries,
        snapshot.hitRateBps,
        snapshot.totalStakedCents,
        snapshot.maxStakeCents,
        JSON.stringify(snapshot),
        closedByUserId,
      ],
    );

    const closingId = inserted.rows[0]?.id;
    if (!closingId) throw new Error('Falha ao gravar o fechamento mensal.');

    for (const partner of snapshot.partners) {
      await client.query(
        `INSERT INTO monthly_closing_partners
           (closing_id, member_id, display_name, share_bps, profit_share_cents,
            contributions_cents, withdrawals_cents, balance_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          closingId,
          partner.memberId,
          partner.displayName,
          partner.shareBps,
          partner.profitShareCents,
          partner.contributionsCents,
          partner.withdrawalsCents,
          partner.balanceCents,
        ],
      );
    }

    return closingId;
  });

  const closing = await findClosingById(bankrollId, id);
  if (!closing) throw new Error('Fechamento gravado mas não localizado.');
  return closing;
}

export async function findClosingById(
  bankrollId: string,
  id: string,
): Promise<MonthlyClosing | null> {
  const row = await queryOne<ClosingRow>(
    `${SELECT_CLOSING} WHERE c.bankroll_id = $1 AND c.id = $2`,
    [bankrollId, id],
  );
  return row ? mapClosing(row) : null;
}

export async function deleteClosing(bankrollId: string, year: number, month: number): Promise<void> {
  await query('DELETE FROM monthly_closings WHERE bankroll_id = $1 AND year = $2 AND month = $3', [
    bankrollId,
    year,
    month,
  ]);
}
