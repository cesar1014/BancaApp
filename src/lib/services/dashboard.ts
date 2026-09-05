import 'server-only';
import type { BankrollContext, ResolvedMonthlyGoal } from './context';
import { loadBankrollState, resolveMonthlyGoal } from './context';
import { listAllEntries } from '@/lib/repos/entries';
import { listTransactions } from '@/lib/repos/transactions';
import { summarizeEntries, summarizeTransactions, type EntriesSummary } from '@/lib/domain/metrics';
import { buildDailySeries, computeGoalProgress, type DailyRow, type GoalProgress } from '@/lib/domain/goals';
import { evaluateStops, type RiskLimits, type StopStatus } from '@/lib/domain/risk';
import { computePartnerShares, type PartnerSharesResult } from '@/lib/domain/partners';
import { isoWeekRange, monthRange, type IsoDate } from '@/lib/datetime';
import { isSettled } from '@/lib/domain/entry';
import type { Entry, Transaction } from '@/lib/domain/types';

export interface DashboardData {
  year: number;
  month: number;
  today: IsoDate;
  goal: ResolvedMonthlyGoal;
  limits: RiskLimits;

  initialBankrollCents: number;
  currentBankrollCents: number;
  monthStartBankrollCents: number;
  targetBankrollCents: number;

  /** Métricas do mês de referência. */
  monthSummary: EntriesSummary;
  /** Métricas de todo o histórico. */
  allTimeSummary: EntriesSummary;

  monthContributionsCents: number;
  monthWithdrawalsCents: number;
  allTimeContributionsCents: number;
  allTimeWithdrawalsCents: number;

  goalProgress: GoalProgress;
  dailyGoalCents: number;
  todayProfitCents: number;
  weekProfitCents: number;

  series: DailyRow[];
  stops: StopStatus[];
  partners: PartnerSharesResult;

  recentEntries: Entry[];
  openEntries: Entry[];
  monthTransactions: Transaction[];

  /** Distância entre a banca atual e a banca-alvo. */
  toTargetCents: number;
}

export async function buildDashboard(
  context: BankrollContext,
  year: number,
  month: number,
): Promise<DashboardData> {
  const { bankroll, settings } = context;
  const range = monthRange(year, month);

  const [state, goal, monthEntries, allEntries, monthTransactions, allTransactions] =
    await Promise.all([
      loadBankrollState(bankroll.id, settings, year, month),
      resolveMonthlyGoal(bankroll.id, settings, year, month),
      listAllEntries(bankroll.id, { dateFrom: range.start, dateTo: range.end }),
      listAllEntries(bankroll.id),
      listTransactions(bankroll.id, { dateFrom: range.start, dateTo: range.end }),
      listTransactions(bankroll.id),
    ]);

  const monthSummary = summarizeEntries(monthEntries);
  const allTimeSummary = summarizeEntries(allEntries);
  const monthCash = summarizeTransactions(monthTransactions);
  const allCash = summarizeTransactions(allTransactions);

  const today = context.today;
  const todayProfitCents = monthEntries
    .filter((e) => e.occurredOn === today && isSettled(e.status))
    .reduce((acc, e) => acc + e.profitCents, 0);

  const week = isoWeekRange(today);
  const weekProfitCents = allEntries
    .filter((e) => e.occurredOn >= week.start && e.occurredOn <= week.end && isSettled(e.status))
    .reduce((acc, e) => acc + e.profitCents, 0);

  const series = buildDailySeries({
    year,
    month,
    monthlyGoalCents: goal.goalCents,
    dailyGoalCents: goal.dailyGoalCents,
    openingBankrollCents: state.monthStartBankrollCents,
    dailyStopCents: state.limits.dailyStopCents,
    entries: monthEntries,
    transactions: monthTransactions,
    today,
  });

  const stops = evaluateStops({
    limits: state.limits,
    dayProfitCents: todayProfitCents,
    weekProfitCents,
    monthProfitCents: monthSummary.profitCents,
  });

  const partners = computePartnerShares({
    members: context.members,
    profitCents: monthSummary.profitCents,
    transactions: monthTransactions,
  });

  return {
    year,
    month,
    today,
    goal,
    limits: state.limits,

    initialBankrollCents: settings.initialBankrollCents,
    currentBankrollCents: state.currentBankrollCents,
    monthStartBankrollCents: state.monthStartBankrollCents,
    targetBankrollCents: goal.targetBankrollCents,

    monthSummary,
    allTimeSummary,

    monthContributionsCents: monthCash.contributionsCents,
    monthWithdrawalsCents: monthCash.withdrawalsCents,
    allTimeContributionsCents: allCash.contributionsCents,
    allTimeWithdrawalsCents: allCash.withdrawalsCents,

    goalProgress: computeGoalProgress(goal.goalCents, monthSummary.profitCents),
    dailyGoalCents: goal.dailyGoalCents,
    todayProfitCents,
    weekProfitCents,

    series,
    stops,
    partners,

    recentEntries: [...monthEntries]
      .sort((a, b) =>
        b.occurredOn.localeCompare(a.occurredOn) ||
        b.occurredAtTime.localeCompare(a.occurredAtTime) ||
        b.createdAt.localeCompare(a.createdAt),
      )
      .slice(0, 8),
    openEntries: allEntries.filter((e) => e.status === 'OPEN'),
    monthTransactions,

    toTargetCents: goal.targetBankrollCents - state.currentBankrollCents,
  };
}
