import type { Cents } from '@/lib/money';
import type { Bps } from '@/lib/numbers';
import { ratioToBps } from '@/lib/numbers';
import type { IsoDate } from '@/lib/datetime';
import { listMonthDates, weekdayShort } from '@/lib/datetime';
import type { EntryLike, TransactionLike } from './metrics';
import { isSettled } from './entry';

/**
 * A meta é uma referência gerencial de acompanhamento — nunca uma promessa de
 * lucro. Nenhum cálculo deste módulo assume que a meta será atingida, e nada
 * aqui sugere aumentar stake para "recuperar" diferença.
 */

export type DayStatus =
  | 'GOAL_HIT' // resultado do dia ≥ meta diária
  | 'ABOVE_GOAL' // acumulado do mês ≥ meta acumulada
  | 'BELOW_GOAL' // acumulado do mês < meta acumulada
  | 'STOP_HIT' // prejuízo do dia atingiu o stop diário
  | 'NO_ACTIVITY' // dia passado sem entradas resolvidas
  | 'FUTURE'; // dia ainda não aconteceu

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  GOAL_HIT: 'Meta batida',
  ABOVE_GOAL: 'Acima da meta',
  BELOW_GOAL: 'Abaixo da meta',
  STOP_HIT: 'Stop atingido',
  NO_ACTIVITY: 'Sem entradas',
  FUTURE: 'A realizar',
};

export interface DailyRow {
  date: IsoDate;
  weekday: string;
  dayIndex: number;
  dailyGoalCents: Cents;
  cumulativeGoalCents: Cents;
  dayProfitCents: Cents;
  cumulativeProfitCents: Cents;
  /** Banca-alvo naquele dia = banca do início do mês + meta acumulada. */
  targetBankrollCents: Cents;
  /** Banca real no fim daquele dia (inclui aportes e retiradas). */
  realBankrollCents: Cents;
  /** Realizado acumulado − meta acumulada. */
  differenceCents: Cents;
  status: DayStatus;
  entriesCount: number;
  stakeCents: Cents;
  contributionsCents: Cents;
  withdrawalsCents: Cents;
  isFuture: boolean;
  isToday: boolean;
}

export interface DailySeriesInput {
  year: number;
  month: number;
  /** Meta de lucro do mês inteiro. */
  monthlyGoalCents: Cents;
  /** Meta média por dia ativo. */
  dailyGoalCents: Cents;
  /** Banca no primeiro instante do mês (antes de qualquer registro do mês). */
  openingBankrollCents: Cents;
  /** Valor absoluto do stop diário (já convertido de % para centavos). */
  dailyStopCents: Cents;
  entries: readonly EntryLike[];
  transactions: readonly TransactionLike[];
  today: IsoDate;
}

/**
 * Constrói a série diária do mês: meta acumulada × realizado acumulado,
 * banca-alvo × banca real, e o status de cada dia.
 */
export function buildDailySeries(input: DailySeriesInput): DailyRow[] {
  const dates = listMonthDates(input.year, input.month);

  const byDate = new Map<IsoDate, { profit: Cents; count: number; stake: Cents }>();
  for (const entry of input.entries) {
    const bucket = byDate.get(entry.occurredOn) ?? { profit: 0, count: 0, stake: 0 };
    bucket.count += 1;
    bucket.stake += entry.stakeCents;
    if (isSettled(entry.status)) bucket.profit += entry.profitCents;
    byDate.set(entry.occurredOn, bucket);
  }

  const txByDate = new Map<IsoDate, { contributions: Cents; withdrawals: Cents }>();
  for (const tx of input.transactions) {
    const bucket = txByDate.get(tx.occurredOn) ?? { contributions: 0, withdrawals: 0 };
    if (tx.kind === 'CONTRIBUTION') bucket.contributions += tx.amountCents;
    else bucket.withdrawals += tx.amountCents;
    txByDate.set(tx.occurredOn, bucket);
  }

  let cumulativeProfit = 0;
  let cumulativeCash = 0;

  return dates.map((date, index) => {
    const dayIndex = index + 1;
    const day = byDate.get(date) ?? { profit: 0, count: 0, stake: 0 };
    const cash = txByDate.get(date) ?? { contributions: 0, withdrawals: 0 };

    cumulativeProfit += day.profit;
    cumulativeCash += cash.contributions - cash.withdrawals;

    // A meta acumulada nunca ultrapassa a meta do mês, mesmo que o mês tenha
    // mais dias corridos do que dias ativos configurados.
    const cumulativeGoalCents = Math.min(input.dailyGoalCents * dayIndex, input.monthlyGoalCents);

    const isFuture = date > input.today;
    const isToday = date === input.today;
    const hasActivity = day.count > 0;

    let status: DayStatus;
    if (isFuture) {
      status = 'FUTURE';
    } else if (input.dailyStopCents > 0 && day.profit <= -input.dailyStopCents) {
      status = 'STOP_HIT';
    } else if (!hasActivity) {
      status = 'NO_ACTIVITY';
    } else if (input.dailyGoalCents > 0 && day.profit >= input.dailyGoalCents) {
      status = 'GOAL_HIT';
    } else if (cumulativeProfit >= cumulativeGoalCents) {
      status = 'ABOVE_GOAL';
    } else {
      status = 'BELOW_GOAL';
    }

    return {
      date,
      weekday: weekdayShort(date),
      dayIndex,
      dailyGoalCents: input.dailyGoalCents,
      cumulativeGoalCents,
      dayProfitCents: day.profit,
      cumulativeProfitCents: cumulativeProfit,
      targetBankrollCents: input.openingBankrollCents + cumulativeGoalCents,
      realBankrollCents: input.openingBankrollCents + cumulativeProfit + cumulativeCash,
      differenceCents: cumulativeProfit - cumulativeGoalCents,
      status,
      entriesCount: day.count,
      stakeCents: day.stake,
      contributionsCents: cash.contributions,
      withdrawalsCents: cash.withdrawals,
      isFuture,
      isToday,
    };
  });
}

export interface GoalProgress {
  goalCents: Cents;
  achievedCents: Cents;
  remainingCents: Cents;
  progressBps: Bps;
  /** Progresso limitado a 0–100% para uso em barras. */
  progressBarBps: Bps;
  isReached: boolean;
}

export function computeGoalProgress(goalCents: Cents, achievedCents: Cents): GoalProgress {
  const progressBps = goalCents > 0 ? (ratioToBps(achievedCents, goalCents) ?? 0) : 0;
  return {
    goalCents,
    achievedCents,
    remainingCents: Math.max(goalCents - achievedCents, 0),
    progressBps,
    progressBarBps: Math.min(Math.max(progressBps, 0), 10_000),
    isReached: goalCents > 0 && achievedCents >= goalCents,
  };
}

/** Meta diária efetiva: manual (se configurada) ou meta mensal ÷ dias ativos. */
export function resolveDailyGoalCents(params: {
  mode: 'AUTO' | 'MANUAL';
  monthlyGoalCents: Cents;
  activeDays: number;
  manualDailyGoalCents: Cents;
}): Cents {
  if (params.mode === 'MANUAL') return params.manualDailyGoalCents;
  if (params.activeDays <= 0) return 0;
  return Math.round(params.monthlyGoalCents / params.activeDays);
}

/**
 * Ritmo necessário para o restante do mês — informativo, nunca prescritivo.
 * Não é usado em nenhuma sugestão de stake.
 */
export function remainingPacePerDay(params: {
  remainingCents: Cents;
  remainingActiveDays: number;
}): Cents | null {
  if (params.remainingActiveDays <= 0) return null;
  return Math.round(params.remainingCents / params.remainingActiveDays);
}
