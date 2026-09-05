/**
 * Avaliação PURA de uma partida: sinais → estratégias → odds → score →
 * estado. Não faz I/O; recebe tudo pronto e devolve candidatos a dica.
 *
 * É usada tanto pelo motor em produção (engine.ts) quanto pelo backtesting —
 * garantindo que o teste histórico rode exatamente a mesma lógica.
 */

import type { LeagueCatalogEntry } from '../config/leagues';
import type { StrategyConfig } from '../config/strategy-config';
import { confidenceFromScore, liveDisplayState, nextAnalysisState, bestState } from './analysis-state';
import type {
  AnalysisState,
  LiveDisplayState,
  NormalizedFixture,
  NormalizedPrediction,
  NormalizedStatistics,
  OddsQuote,
  ScoreBreakdown,
  Selection,
  TipConfidence,
} from './models';
import { bestQuote, expectedValueBps, fairOddMilli, isQuoteStale, minAcceptableOddMilli, valueBps as computeValueBps } from './odds-math';
import { computeEntryScore, oddValueComponent } from './scoring';
import { computeSignals, type FixtureSignals } from './signals';
import type { StrategyModule } from './strategies/types';

export interface TipCandidate {
  strategyKey: string;
  market: StrategyConfig['market'];
  selection: Selection;
  line: number | null;
  probabilityBps: number;
  fairOddMilli: number;
  /** null quando não há cotação para este mercado. */
  oddMilli: number | null;
  minOddMilli: number;
  valueBps: number | null;
  evBps: number | null;
  score: number;
  breakdown: ScoreBreakdown;
  confidence: TipConfidence;
  rationale: string[];
  state: AnalysisState;
  bookmaker: string | null;
  oddsCapturedAt: string | null;
  oddStale: boolean;
  applicable: boolean;
  reason: string | null;
}

export interface FixtureEvaluation {
  fixtureId: string;
  signals: FixtureSignals;
  candidates: TipCandidate[];
  /** Estado mais avançado entre as estratégias. */
  bestState: AnalysisState | null;
  liveState: LiveDisplayState;
  /** Melhor candidato (por score) aplicável, se houver. */
  best: TipCandidate | null;
}

export interface EvaluateInput {
  fixture: NormalizedFixture;
  league: LeagueCatalogEntry;
  strategies: readonly { module: StrategyModule; config: StrategyConfig }[];
  prediction?: NormalizedPrediction | null;
  quotes?: readonly OddsQuote[] | null;
  previousStates?: Readonly<Record<string, AnalysisState>>;
  previousSnapshot?: { minute: number; statistics: NormalizedStatistics | null } | null;
  monitored?: boolean;
  now?: Date;
}

export function evaluateFixture(input: EvaluateInput): FixtureEvaluation {
  const now = input.now ?? new Date();
  const { fixture, league } = input;
  const signals = computeSignals(fixture, input.previousSnapshot ?? null);
  const quotes = input.quotes ?? fixture.odds?.quotes ?? [];
  const previousStates = input.previousStates ?? {};
  const monitored = input.monitored ?? false;

  const candidates: TipCandidate[] = [];

  for (const { module, config } of input.strategies) {
    if (!config.enabled) continue;
    const context = { fixture, signals, league, prediction: input.prediction ?? null, config, now };

    let estimates;
    try {
      estimates = module.estimate(context);
    } catch {
      // Uma estratégia com defeito nunca derruba a avaliação das outras.
      continue;
    }

    for (const estimate of estimates) {
      const stateKey = `${config.key}:${estimate.selection}`;
      const previous = previousStates[stateKey] ?? null;

      if (!estimate.applicable) {
        candidates.push({
          strategyKey: config.key,
          market: config.market,
          selection: estimate.selection,
          line: estimate.line,
          probabilityBps: 0,
          fairOddMilli: 0,
          oddMilli: null,
          minOddMilli: 0,
          valueBps: null,
          evBps: null,
          score: 0,
          breakdown: { total: 0, items: [] },
          confidence: 'BAIXA',
          rationale: [],
          state: fixture.status === 'FINISHED' ? 'ENCERRADA' : previous === 'DESCARTADA' ? 'DESCARTADA' : monitored ? 'MONITORANDO' : 'OBSERVANDO',
          bookmaker: null,
          oddsCapturedAt: null,
          oddStale: false,
          applicable: false,
          reason: estimate.reason ?? null,
        });
        continue;
      }

      if (estimate.probabilityBps < config.thresholds.minProbabilityBps) {
        // Probabilidade baixa demais para este mercado: não é candidato.
        candidates.push({
          strategyKey: config.key,
          market: config.market,
          selection: estimate.selection,
          line: estimate.line,
          probabilityBps: estimate.probabilityBps,
          fairOddMilli: fairOddMilli(estimate.probabilityBps),
          oddMilli: null,
          minOddMilli: 0,
          valueBps: null,
          evBps: null,
          score: 0,
          breakdown: { total: 0, items: [] },
          confidence: 'BAIXA',
          rationale: estimate.rationale,
          state: previous === 'DESCARTADA' ? 'DESCARTADA' : monitored ? 'MONITORANDO' : 'OBSERVANDO',
          bookmaker: null,
          oddsCapturedAt: null,
          oddStale: false,
          applicable: false,
          reason: 'probabilidade estimada abaixo do mínimo',
        });
        continue;
      }

      const quote = bestQuote(quotes, config.market, estimate.selection, estimate.line);
      const oddMilli = quote?.oddMilli ?? null;
      const value = oddMilli === null ? null : computeValueBps(estimate.probabilityBps, oddMilli);
      const ev = oddMilli === null ? null : expectedValueBps(estimate.probabilityBps, oddMilli);
      const oddInRange =
        oddMilli !== null &&
        oddMilli >= config.thresholds.minOddMilli &&
        oddMilli <= config.thresholds.maxOddMilli;

      const breakdown = computeEntryScore(
        { ...estimate.components, oddValue: oddValueComponent(value, config.thresholds.minValueBps) },
        config.weights,
      );

      const state = nextAnalysisState({
        previous,
        status: fixture.status,
        monitored,
        score: breakdown.total,
        valueBps: value,
        oddInRange,
        thresholds: config.thresholds,
      });

      candidates.push({
        strategyKey: config.key,
        market: config.market,
        selection: estimate.selection,
        line: estimate.line,
        probabilityBps: estimate.probabilityBps,
        fairOddMilli: fairOddMilli(estimate.probabilityBps),
        oddMilli,
        minOddMilli: Math.max(
          config.thresholds.minOddMilli,
          minAcceptableOddMilli(estimate.probabilityBps, config.thresholds.minValueBps),
        ),
        valueBps: value,
        evBps: ev,
        score: breakdown.total,
        breakdown,
        confidence: confidenceFromScore(breakdown.total),
        rationale: estimate.rationale,
        state,
        bookmaker: quote?.bookmaker ?? null,
        oddsCapturedAt: quote?.capturedAt ?? null,
        oddStale: quote ? isQuoteStale(quote, now) : false,
        applicable: true,
        reason: null,
      });
    }
  }

  const applicable = candidates.filter((candidate) => candidate.applicable);
  const best = applicable.length === 0 ? null : applicable.reduce((a, b) => (b.score > a.score ? b : a));
  const overall = bestState(candidates.map((candidate) => candidate.state));

  return {
    fixtureId: fixture.id,
    signals,
    candidates,
    bestState: overall,
    liveState: liveDisplayState(overall, fixture.status),
    best,
  };
}

/** Candidatos que viraram dica de fato (entrada identificada). */
export function identifiedEntries(evaluation: FixtureEvaluation): TipCandidate[] {
  return evaluation.candidates.filter((candidate) => candidate.state === 'ENTRADA_IDENTIFICADA');
}
