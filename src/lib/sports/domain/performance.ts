/**
 * Métricas de performance das dicas.
 *
 * Assertividade ≠ rentabilidade: uma estratégia com 70% de acerto em odd
 * 1,20 perde dinheiro. Por isso as métricas principais são EV, ROI, yield e
 * profit factor — a taxa de acerto é exibida, mas não é o critério.
 *
 * Convenções: dinheiro em centavos, odds em milli, percentuais em bps.
 */

import type { MarketKey, TipResult } from './models';

export interface TipLike {
  market: MarketKey;
  leagueKey: string;
  oddMilli: number;
  score: number;
  evBps: number;
  result: TipResult | null;
  stakeCents: number;
  profitCents: number;
}

export interface PerformanceMetrics {
  total: number;
  settled: number;
  greens: number;
  reds: number;
  pushes: number;
  pending: number;
  /** greens ÷ (greens + reds). null sem decididas. */
  winRateBps: number | null;
  avgOddMilli: number | null;
  avgEvBps: number | null;
  profitCents: number;
  grossProfitCents: number;
  grossLossCents: number;
  /** Volume que efetivamente correu risco (exclui push e pendentes). */
  turnoverCents: number;
  /** lucro ÷ volume arriscado. */
  yieldBps: number | null;
  /** lucro ÷ (stake de referência × entradas resolvidas, inclusive push). */
  roiBps: number | null;
  /** lucro bruto ÷ prejuízo bruto. null sem prejuízo. */
  profitFactorMilli: number | null;
}

export interface PerformanceBreakdown {
  overall: PerformanceMetrics;
  byMarket: Record<string, PerformanceMetrics>;
  byLeague: Record<string, PerformanceMetrics>;
  byScoreBand: Record<string, PerformanceMetrics>;
  byOddsBand: Record<string, PerformanceMetrics>;
}

export const SCORE_BANDS: readonly { key: string; min: number; max: number }[] = [
  { key: '90-100', min: 90, max: 101 },
  { key: '80-89', min: 80, max: 90 },
  { key: '70-79', min: 70, max: 80 },
  { key: '<70', min: 0, max: 70 },
];

export const ODDS_BANDS: readonly { key: string; min: number; max: number }[] = [
  { key: '1,20–1,49', min: 1_200, max: 1_500 },
  { key: '1,50–1,79', min: 1_500, max: 1_800 },
  { key: '1,80–2,19', min: 1_800, max: 2_200 },
  { key: '2,20–2,99', min: 2_200, max: 3_000 },
  { key: '3,00+', min: 3_000, max: Number.POSITIVE_INFINITY },
];

function ratioBps(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10_000);
}

export function computePerformance(tips: readonly TipLike[]): PerformanceMetrics {
  const m: PerformanceMetrics = {
    total: 0,
    settled: 0,
    greens: 0,
    reds: 0,
    pushes: 0,
    pending: 0,
    winRateBps: null,
    avgOddMilli: null,
    avgEvBps: null,
    profitCents: 0,
    grossProfitCents: 0,
    grossLossCents: 0,
    turnoverCents: 0,
    yieldBps: null,
    roiBps: null,
    profitFactorMilli: null,
  };

  let oddSum = 0;
  let evSum = 0;
  let referenceStake = 0;

  for (const tip of tips) {
    m.total += 1;
    oddSum += tip.oddMilli;
    evSum += tip.evBps;

    if (tip.result === null) {
      m.pending += 1;
      continue;
    }

    m.settled += 1;
    referenceStake += tip.stakeCents;
    if (tip.result === 'GREEN') m.greens += 1;
    else if (tip.result === 'RED') m.reds += 1;
    else m.pushes += 1;

    if (tip.result !== 'PUSH') m.turnoverCents += tip.stakeCents;
    m.profitCents += tip.profitCents;
    if (tip.profitCents > 0) m.grossProfitCents += tip.profitCents;
    if (tip.profitCents < 0) m.grossLossCents += -tip.profitCents;
  }

  m.winRateBps = ratioBps(m.greens, m.greens + m.reds);
  m.avgOddMilli = m.total > 0 ? Math.round(oddSum / m.total) : null;
  m.avgEvBps = m.total > 0 ? Math.round(evSum / m.total) : null;
  m.yieldBps = ratioBps(m.profitCents, m.turnoverCents);
  m.roiBps = ratioBps(m.profitCents, referenceStake);
  m.profitFactorMilli =
    m.grossLossCents === 0 ? null : Math.round((m.grossProfitCents / m.grossLossCents) * 1000);

  return m;
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyOf(item);
    (out[key] ??= []).push(item);
  }
  return out;
}

function mapGroups(groups: Record<string, TipLike[]>): Record<string, PerformanceMetrics> {
  const out: Record<string, PerformanceMetrics> = {};
  for (const [key, list] of Object.entries(groups)) out[key] = computePerformance(list);
  return out;
}

export function computePerformanceBreakdown(tips: readonly TipLike[]): PerformanceBreakdown {
  return {
    overall: computePerformance(tips),
    byMarket: mapGroups(groupBy(tips, (tip) => tip.market)),
    byLeague: mapGroups(groupBy(tips, (tip) => tip.leagueKey)),
    byScoreBand: mapGroups(
      groupBy(tips, (tip) => SCORE_BANDS.find((band) => tip.score >= band.min && tip.score < band.max)?.key ?? '<70'),
    ),
    byOddsBand: mapGroups(
      groupBy(tips, (tip) => ODDS_BANDS.find((band) => tip.oddMilli >= band.min && tip.oddMilli < band.max)?.key ?? '3,00+'),
    ),
  };
}

/** Lucro de uma dica resolvida com stake fixa (mesma regra das entradas). */
export function tipProfitCents(result: TipResult, stakeCents: number, oddMilli: number): { profitCents: number; payoutCents: number } {
  switch (result) {
    case 'GREEN': {
      const profitCents = Math.round((stakeCents * (oddMilli - 1000)) / 1000);
      return { profitCents, payoutCents: stakeCents + profitCents };
    }
    case 'RED':
      return { profitCents: -stakeCents, payoutCents: 0 };
    case 'PUSH':
    default:
      return { profitCents: 0, payoutCents: stakeCents };
  }
}
