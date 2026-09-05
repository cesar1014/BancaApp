import type { Cents } from '@/lib/money';
import type { Bps } from '@/lib/numbers';
import { ratioToBps } from '@/lib/numbers';
import type { EntryLike, TransactionLike } from './metrics';
import { summarizeEntries, summarizeTransactions } from './metrics';
import { computePartnerShares } from './partners';
import type { Member } from './types';

/**
 * Fechamento mensal: uma fotografia dos números do mês.
 *
 * Depois de gravado, o fechamento é imutável — alterações futuras em
 * Configurações (meta, stops, participações) não reescrevem o passado, porque
 * tudo que importa é copiado para dentro do snapshot.
 */

export interface ClosingPartnerRow {
  memberId: string;
  displayName: string;
  shareBps: Bps;
  profitShareCents: Cents;
  contributionsCents: Cents;
  withdrawalsCents: Cents;
  balanceCents: Cents;
}

export interface MonthlyClosingSnapshot {
  year: number;
  month: number;
  openingBankrollCents: Cents;
  entriesProfitCents: Cents;
  contributionsCents: Cents;
  withdrawalsCents: Cents;
  closingBankrollCents: Cents;
  goalCents: Cents;
  goalProgressBps: Bps;
  roiBps: Bps;
  entriesCount: number;
  settledCount: number;
  openEntries: number;
  greens: number;
  reds: number;
  voids: number;
  cashouts: number;
  hitRateBps: Bps;
  totalStakedCents: Cents;
  maxStakeCents: Cents;
  avgStakeCents: Cents;
  avgProfitCents: Cents;
  dailyGoalCents: Cents;
  activeDays: number;
  targetBankrollCents: Cents;
  partners: ClosingPartnerRow[];
  generatedAt: string;
}

export interface BuildClosingInput {
  year: number;
  month: number;
  openingBankrollCents: Cents;
  goalCents: Cents;
  dailyGoalCents: Cents;
  activeDays: number;
  targetBankrollCents: Cents;
  entries: readonly (EntryLike & { oddMilli?: number })[];
  transactions: readonly TransactionLike[];
  members: readonly Pick<
    Member,
    'id' | 'displayName' | 'shareBps' | 'initialContributionCents' | 'isActive'
  >[];
  now?: Date;
}

export function buildMonthlyClosing(input: BuildClosingInput): MonthlyClosingSnapshot {
  const entriesSummary = summarizeEntries(input.entries);
  const txSummary = summarizeTransactions(input.transactions);

  const closingBankrollCents =
    input.openingBankrollCents +
    entriesSummary.profitCents +
    txSummary.contributionsCents -
    txSummary.withdrawalsCents;

  const shares = computePartnerShares({
    members: input.members,
    profitCents: entriesSummary.profitCents,
    transactions: input.transactions,
  });

  return {
    year: input.year,
    month: input.month,
    openingBankrollCents: input.openingBankrollCents,
    entriesProfitCents: entriesSummary.profitCents,
    contributionsCents: txSummary.contributionsCents,
    withdrawalsCents: txSummary.withdrawalsCents,
    closingBankrollCents,
    goalCents: input.goalCents,
    goalProgressBps:
      input.goalCents > 0 ? (ratioToBps(entriesSummary.profitCents, input.goalCents) ?? 0) : 0,
    roiBps: entriesSummary.roiBps ?? 0,
    entriesCount: entriesSummary.count,
    settledCount: entriesSummary.settledCount,
    openEntries: entriesSummary.openCount,
    greens: entriesSummary.greens,
    reds: entriesSummary.reds,
    voids: entriesSummary.voids,
    cashouts: entriesSummary.cashouts,
    hitRateBps: entriesSummary.hitRateBps ?? 0,
    totalStakedCents: entriesSummary.totalStakedCents,
    maxStakeCents: entriesSummary.maxStakeCents,
    avgStakeCents: entriesSummary.avgStakeCents,
    avgProfitCents: entriesSummary.avgProfitCents,
    dailyGoalCents: input.dailyGoalCents,
    activeDays: input.activeDays,
    targetBankrollCents: input.targetBankrollCents,
    partners: shares.partners.map((partner) => ({
      memberId: partner.memberId,
      displayName: partner.displayName,
      shareBps: partner.shareBps,
      profitShareCents: partner.profitShareCents,
      contributionsCents: partner.contributionsCents,
      withdrawalsCents: partner.withdrawalsCents,
      balanceCents: partner.balanceCents,
    })),
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}
