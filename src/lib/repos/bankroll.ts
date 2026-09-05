import 'server-only';
import { query, queryOne } from '@/lib/db';
import { notFound } from '@/lib/errors';
import type { Bankroll, BankrollSettings, GoalMode, LimitPolicy, RiskBase } from '@/lib/domain/types';

interface BankrollRow {
  id: string;
  name: string;
  timezone: string;
  currency: string;
}

interface SettingsRow {
  bankroll_id: string;
  initial_bankroll_cents: number;
  monthly_goal_cents: number;
  target_bankroll_cents: number;
  active_days: number;
  daily_goal_mode: GoalMode;
  daily_goal_cents: number;
  risk_base: RiskBase;
  max_risk_per_entry_bps: number;
  max_stake_cap_cents: number | null;
  daily_stop_bps: number;
  weekly_stop_bps: number;
  monthly_stop_bps: number;
  stake_limit_policy: LimitPolicy;
  stop_limit_policy: LimitPolicy;
  partners_can_create_entries: boolean;
  updated_at: Date;
}

function mapSettings(row: SettingsRow): BankrollSettings {
  return {
    bankrollId: row.bankroll_id,
    initialBankrollCents: row.initial_bankroll_cents,
    monthlyGoalCents: row.monthly_goal_cents,
    targetBankrollCents: row.target_bankroll_cents,
    activeDays: row.active_days,
    dailyGoalMode: row.daily_goal_mode,
    dailyGoalCents: row.daily_goal_cents,
    riskBase: row.risk_base,
    maxRiskPerEntryBps: row.max_risk_per_entry_bps,
    maxStakeCapCents: row.max_stake_cap_cents,
    dailyStopBps: row.daily_stop_bps,
    weeklyStopBps: row.weekly_stop_bps,
    monthlyStopBps: row.monthly_stop_bps,
    stakeLimitPolicy: row.stake_limit_policy,
    stopLimitPolicy: row.stop_limit_policy,
    partnersCanCreateEntries: row.partners_can_create_entries,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getBankroll(bankrollId: string): Promise<Bankroll> {
  const row = await queryOne<BankrollRow>(
    'SELECT id, name, timezone, currency FROM bankrolls WHERE id = $1',
    [bankrollId],
  );
  if (!row) throw notFound('Banca não encontrada.');
  return row;
}

export async function getFirstBankroll(): Promise<Bankroll | null> {
  return queryOne<BankrollRow>(
    'SELECT id, name, timezone, currency FROM bankrolls ORDER BY created_at ASC LIMIT 1',
  );
}

export async function getSettings(bankrollId: string): Promise<BankrollSettings> {
  const row = await queryOne<SettingsRow>('SELECT * FROM settings WHERE bankroll_id = $1', [
    bankrollId,
  ]);
  if (!row) throw notFound('Configurações da banca não encontradas.');
  return mapSettings(row);
}

export interface UpdateSettingsInput {
  initialBankrollCents: number;
  monthlyGoalCents: number;
  targetBankrollCents: number;
  activeDays: number;
  dailyGoalMode: GoalMode;
  dailyGoalCents: number;
  riskBase: RiskBase;
  maxRiskPerEntryBps: number;
  maxStakeCapCents: number | null;
  dailyStopBps: number;
  weeklyStopBps: number;
  monthlyStopBps: number;
  stakeLimitPolicy: LimitPolicy;
  stopLimitPolicy: LimitPolicy;
  partnersCanCreateEntries: boolean;
}

export async function updateSettings(
  bankrollId: string,
  input: UpdateSettingsInput,
  updatedByUserId: string,
): Promise<BankrollSettings> {
  const row = await queryOne<SettingsRow>(
    `UPDATE settings SET
       initial_bankroll_cents = $2,
       monthly_goal_cents = $3,
       target_bankroll_cents = $4,
       active_days = $5,
       daily_goal_mode = $6,
       daily_goal_cents = $7,
       risk_base = $8,
       max_risk_per_entry_bps = $9,
       max_stake_cap_cents = $10,
       daily_stop_bps = $11,
       weekly_stop_bps = $12,
       monthly_stop_bps = $13,
       stake_limit_policy = $14,
       stop_limit_policy = $15,
       partners_can_create_entries = $16,
       updated_by_user_id = $17,
       updated_at = now()
     WHERE bankroll_id = $1
     RETURNING *`,
    [
      bankrollId,
      input.initialBankrollCents,
      input.monthlyGoalCents,
      input.targetBankrollCents,
      input.activeDays,
      input.dailyGoalMode,
      input.dailyGoalCents,
      input.riskBase,
      input.maxRiskPerEntryBps,
      input.maxStakeCapCents,
      input.dailyStopBps,
      input.weeklyStopBps,
      input.monthlyStopBps,
      input.stakeLimitPolicy,
      input.stopLimitPolicy,
      input.partnersCanCreateEntries,
      updatedByUserId,
    ],
  );
  if (!row) throw notFound('Configurações da banca não encontradas.');
  return mapSettings(row);
}

export async function updateBankrollProfile(
  bankrollId: string,
  input: { name: string; timezone: string },
): Promise<Bankroll> {
  const row = await queryOne<BankrollRow>(
    `UPDATE bankrolls SET name = $2, timezone = $3 WHERE id = $1
     RETURNING id, name, timezone, currency`,
    [bankrollId, input.name, input.timezone],
  );
  if (!row) throw notFound('Banca não encontrada.');
  return row;
}

interface MonthlyGoalRow {
  bankroll_id: string;
  year: number;
  month: number;
  goal_cents: number;
  active_days: number;
  daily_goal_cents: number;
  target_bankroll_cents: number;
}

export async function getMonthlyGoal(
  bankrollId: string,
  year: number,
  month: number,
): Promise<MonthlyGoalRow | null> {
  return queryOne<MonthlyGoalRow>(
    `SELECT bankroll_id, year, month, goal_cents, active_days, daily_goal_cents, target_bankroll_cents
     FROM monthly_goals WHERE bankroll_id = $1 AND year = $2 AND month = $3`,
    [bankrollId, year, month],
  );
}

export async function upsertMonthlyGoal(
  bankrollId: string,
  input: {
    year: number;
    month: number;
    goalCents: number;
    activeDays: number;
    dailyGoalCents: number;
    targetBankrollCents: number;
  },
): Promise<void> {
  await query(
    `INSERT INTO monthly_goals
       (bankroll_id, year, month, goal_cents, active_days, daily_goal_cents, target_bankroll_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (bankroll_id, year, month) DO UPDATE SET
       goal_cents = EXCLUDED.goal_cents,
       active_days = EXCLUDED.active_days,
       daily_goal_cents = EXCLUDED.daily_goal_cents,
       target_bankroll_cents = EXCLUDED.target_bankroll_cents,
       updated_at = now()`,
    [
      bankrollId,
      input.year,
      input.month,
      input.goalCents,
      input.activeDays,
      input.dailyGoalCents,
      input.targetBankrollCents,
    ],
  );
}

export async function deleteMonthlyGoal(
  bankrollId: string,
  year: number,
  month: number,
): Promise<void> {
  await query('DELETE FROM monthly_goals WHERE bankroll_id = $1 AND year = $2 AND month = $3', [
    bankrollId,
    year,
    month,
  ]);
}
