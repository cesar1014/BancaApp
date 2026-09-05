/**
 * Backtesting (estrutura inicial).
 *
 * Responde: "se esta estratégia tivesse sido usada nestes jogos, quanto teria
 * rendido?". Recebe snapshots históricos (estado da partida minuto a minuto,
 * com as odds vistas naquele momento) e o resultado final, roda a MESMA
 * avaliação de produção (evaluate.ts) e resolve cada dica.
 *
 * Os snapshots vêm de `live_snapshots` + `odds_snapshots`; o serviço que os
 * carrega fica fora do domínio. Aqui é só cálculo.
 */

import type { LeagueCatalogEntry } from '../config/leagues';
import type { StrategyConfig } from '../config/strategy-config';
import { ENGINE_CONFIG } from '../config/strategy-config';
import { evaluateFixture, identifiedEntries, type TipCandidate } from './evaluate';
import type { AnalysisState, NormalizedFixture, OddsQuote, TipResult } from './models';
import { computePerformanceBreakdown, tipProfitCents, type PerformanceBreakdown, type TipLike } from './performance';
import type { StrategyModule } from './strategies/types';

export interface BacktestSnapshot {
  /** Estado da partida naquele minuto (placar, estatísticas, eventos). */
  fixture: NormalizedFixture;
  quotes: readonly OddsQuote[];
  capturedAt: string;
}

export interface BacktestFixture {
  league: LeagueCatalogEntry;
  snapshots: readonly BacktestSnapshot[];
  final: NormalizedFixture;
}

export interface BacktestTip extends TipLike {
  fixtureId: string;
  strategyKey: string;
  selection: TipCandidate['selection'];
  line: number | null;
  minuteAt: number;
  probabilityBps: number;
}

export interface BacktestReport {
  fixtures: number;
  snapshotsEvaluated: number;
  tips: BacktestTip[];
  performance: PerformanceBreakdown;
}

export function runBacktest(
  fixtures: readonly BacktestFixture[],
  strategies: readonly { module: StrategyModule; config: StrategyConfig }[],
  options: { stakeCents?: number } = {},
): BacktestReport {
  const stakeCents = options.stakeCents ?? ENGINE_CONFIG.referenceStakeCents;
  const tips: BacktestTip[] = [];
  let snapshotsEvaluated = 0;

  for (const item of fixtures) {
    const states: Record<string, AnalysisState> = {};
    const alreadyTipped = new Set<string>();
    let previous: { minute: number; statistics: NormalizedFixture['statistics'] } | null = null;

    const ordered = [...item.snapshots].sort(
      (a, b) => (a.fixture.minute ?? 0) - (b.fixture.minute ?? 0),
    );

    for (const snapshot of ordered) {
      snapshotsEvaluated += 1;
      const evaluation = evaluateFixture({
        fixture: snapshot.fixture,
        league: item.league,
        strategies,
        quotes: snapshot.quotes,
        previousStates: states,
        previousSnapshot: previous,
        monitored: true,
        now: new Date(snapshot.capturedAt),
      });

      for (const candidate of evaluation.candidates) {
        states[`${candidate.strategyKey}:${candidate.selection}`] = candidate.state;
      }

      for (const entry of identifiedEntries(evaluation)) {
        const key = `${entry.strategyKey}:${entry.selection}`;
        if (alreadyTipped.has(key) || entry.oddMilli === null) continue;
        alreadyTipped.add(key);

        const strategyModule = strategies.find((s) => s.config.key === entry.strategyKey)?.module;
        const result: TipResult | null =
          strategyModule?.settle(
            {
              market: entry.market,
              selection: entry.selection,
              line: entry.line,
              minuteAt: snapshot.fixture.minute,
              scoreAt: snapshot.fixture.score,
            },
            item.final,
          ) ?? null;

        const money = result ? tipProfitCents(result, stakeCents, entry.oddMilli) : { profitCents: 0, payoutCents: 0 };

        tips.push({
          fixtureId: item.final.id,
          strategyKey: entry.strategyKey,
          market: entry.market,
          selection: entry.selection,
          line: entry.line,
          leagueKey: item.league.key,
          minuteAt: snapshot.fixture.minute ?? 0,
          probabilityBps: entry.probabilityBps,
          oddMilli: entry.oddMilli,
          score: entry.score,
          evBps: entry.evBps ?? 0,
          result,
          stakeCents,
          profitCents: money.profitCents,
        });
      }

      previous = { minute: snapshot.fixture.minute ?? 0, statistics: snapshot.fixture.statistics };
    }
  }

  return {
    fixtures: fixtures.length,
    snapshotsEvaluated,
    tips,
    performance: computePerformanceBreakdown(tips),
  };
}
