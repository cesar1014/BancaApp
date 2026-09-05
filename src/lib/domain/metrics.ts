import type { Cents } from '@/lib/money';
import type { Bps } from '@/lib/numbers';
import { ratioToBps } from '@/lib/numbers';
import type { IsoDate } from '@/lib/datetime';
import type { EntryStatus, TransactionKind } from './types';
import { countsForTurnover, isSettled } from './entry';

/** Forma mínima de uma entrada para efeito de cálculo. */
export interface EntryLike {
  occurredOn: IsoDate;
  status: EntryStatus;
  stakeCents: Cents;
  profitCents: Cents;
  memberId?: string;
}

/** Forma mínima de uma movimentação para efeito de cálculo. */
export interface TransactionLike {
  occurredOn: IsoDate;
  kind: TransactionKind;
  amountCents: Cents;
  memberId?: string | null;
}

export interface EntriesSummary {
  /** Todas as entradas do conjunto, inclusive as abertas. */
  count: number;
  settledCount: number;
  openCount: number;
  greens: number;
  reds: number;
  voids: number;
  cashouts: number;
  /** Lucro realizado (entradas resolvidas). Aportes/retiradas NÃO entram. */
  profitCents: Cents;
  grossProfitCents: Cents;
  grossLossCents: Cents;
  /** Soma das stakes que efetivamente correram risco (exclui VOID e abertas). */
  totalStakedCents: Cents;
  /** Soma de todas as stakes registradas, inclusive abertas e voids. */
  totalStakeVolumeCents: Cents;
  openStakeCents: Cents;
  maxStakeCents: Cents;
  avgStakeCents: Cents;
  avgProfitCents: Cents;
  /** Lucro ÷ total apostado. null quando não há volume. */
  roiBps: Bps | null;
  /** Greens ÷ (greens + reds). null quando não há entradas decididas. */
  hitRateBps: Bps | null;
  avgOddMilli: number | null;
}

export const EMPTY_ENTRIES_SUMMARY: EntriesSummary = {
  count: 0,
  settledCount: 0,
  openCount: 0,
  greens: 0,
  reds: 0,
  voids: 0,
  cashouts: 0,
  profitCents: 0,
  grossProfitCents: 0,
  grossLossCents: 0,
  totalStakedCents: 0,
  totalStakeVolumeCents: 0,
  openStakeCents: 0,
  maxStakeCents: 0,
  avgStakeCents: 0,
  avgProfitCents: 0,
  roiBps: null,
  hitRateBps: null,
  avgOddMilli: null,
};

export function summarizeEntries(entries: readonly (EntryLike & { oddMilli?: number })[]): EntriesSummary {
  const summary: EntriesSummary = { ...EMPTY_ENTRIES_SUMMARY };
  let oddSum = 0;

  for (const entry of entries) {
    summary.count += 1;
    summary.totalStakeVolumeCents += entry.stakeCents;
    if (entry.oddMilli) oddSum += entry.oddMilli;

    if (entry.stakeCents > summary.maxStakeCents) summary.maxStakeCents = entry.stakeCents;

    switch (entry.status) {
      case 'GREEN':
        summary.greens += 1;
        break;
      case 'RED':
        summary.reds += 1;
        break;
      case 'VOID':
        summary.voids += 1;
        break;
      case 'CASHOUT':
        summary.cashouts += 1;
        break;
      case 'OPEN':
        summary.openCount += 1;
        summary.openStakeCents += entry.stakeCents;
        break;
      default:
        break;
    }

    if (isSettled(entry.status)) {
      summary.settledCount += 1;
      summary.profitCents += entry.profitCents;
      if (entry.profitCents > 0) summary.grossProfitCents += entry.profitCents;
      if (entry.profitCents < 0) summary.grossLossCents += -entry.profitCents;
    }

    if (countsForTurnover(entry.status)) {
      summary.totalStakedCents += entry.stakeCents;
    }
  }

  summary.roiBps = ratioToBps(summary.profitCents, summary.totalStakedCents);
  summary.hitRateBps = ratioToBps(summary.greens, summary.greens + summary.reds);
  summary.avgStakeCents = summary.count > 0 ? Math.round(summary.totalStakeVolumeCents / summary.count) : 0;
  summary.avgProfitCents =
    summary.settledCount > 0 ? Math.round(summary.profitCents / summary.settledCount) : 0;
  summary.avgOddMilli = entries.length > 0 && oddSum > 0 ? Math.round(oddSum / entries.length) : null;

  return summary;
}

export interface TransactionsSummary {
  contributionsCents: Cents;
  withdrawalsCents: Cents;
  /** Aportes − retiradas. Nunca é lucro. */
  netCents: Cents;
  count: number;
}

export function summarizeTransactions(
  transactions: readonly TransactionLike[],
): TransactionsSummary {
  let contributionsCents = 0;
  let withdrawalsCents = 0;

  for (const tx of transactions) {
    if (tx.kind === 'CONTRIBUTION') contributionsCents += tx.amountCents;
    else withdrawalsCents += tx.amountCents;
  }

  return {
    contributionsCents,
    withdrawalsCents,
    netCents: contributionsCents - withdrawalsCents,
    count: transactions.length,
  };
}

/**
 * Banca = banca inicial + lucro realizado + aportes − retiradas.
 *
 * Aportes e retiradas movimentam o caixa mas jamais são contabilizados como
 * lucro/prejuízo — é por isso que entram nesta soma por um caminho separado.
 * Entradas em aberto não movimentam a banca até serem resolvidas.
 */
export function computeBankrollCents(params: {
  initialBankrollCents: Cents;
  realizedProfitCents: Cents;
  contributionsCents: Cents;
  withdrawalsCents: Cents;
}): Cents {
  return (
    params.initialBankrollCents +
    params.realizedProfitCents +
    params.contributionsCents -
    params.withdrawalsCents
  );
}

/** Filtra por intervalo de datas inclusivo. */
export function inRange<T extends { occurredOn: IsoDate }>(
  items: readonly T[],
  start: IsoDate,
  end: IsoDate,
): T[] {
  return items.filter((item) => item.occurredOn >= start && item.occurredOn <= end);
}

export function upToDate<T extends { occurredOn: IsoDate }>(items: readonly T[], end: IsoDate): T[] {
  return items.filter((item) => item.occurredOn <= end);
}

export function beforeDate<T extends { occurredOn: IsoDate }>(
  items: readonly T[],
  start: IsoDate,
): T[] {
  return items.filter((item) => item.occurredOn < start);
}
