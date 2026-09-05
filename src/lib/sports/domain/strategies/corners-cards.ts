/**
 * Escanteios e cartões (ao vivo).
 *
 * Mesmo esqueleto do modelo de gols: ritmo observado misturado com a média
 * da competição, Poisson nos minutos restantes. A linha sugerida fica um
 * pouco abaixo do esperado, para que a probabilidade estimada seja alta o
 * bastante e ainda exista odd razoável.
 */

import type { NormalizedFixture, TipResult } from '../models';
import { poissonAtLeast } from '../poisson';
import { ENGINE_CONFIG } from '../../config/strategy-config';
import { notApplicable, toBps, type SettleInput, type StrategyContext, type StrategyEstimate, type StrategyModule } from './types';

function windowBlocked(ctx: StrategyContext): string | null {
  const { minMinute, maxMinute } = ctx.config.thresholds;
  if (!ctx.signals.isLive) return 'estratégia exclusiva ao vivo';
  if (minMinute !== null && ctx.signals.minute < minMinute) return `antes do minuto ${minMinute}`;
  if (maxMinute !== null && ctx.signals.minute > maxMinute) return `depois do minuto ${maxMinute}`;
  return null;
}

/** λ restante para uma contagem (escanteios/cartões) dado o ritmo do jogo. */
function remainingLambda(
  current: number,
  minute: number,
  remaining: number,
  leagueAvgMilli: number,
  paceWeight: number,
  boost: number,
): number {
  const basePerMinute = leagueAvgMilli / 1000 / ENGINE_CONFIG.regulationMinutes;
  const observedPerMinute = minute >= 5 ? current / minute : basePerMinute;
  const w = Math.min(paceWeight, minute / 60);
  const rate = w * observedPerMinute + (1 - w) * basePerMinute;
  return rate * remaining * boost;
}

export const cornersStrategy: StrategyModule = {
  key: 'LIVE_CORNERS',
  market: 'CORNERS',
  estimate(ctx): StrategyEstimate[] {
    const blocked = windowBlocked(ctx);
    if (blocked) return [notApplicable('OVER', blocked)];
    const { signals, league, config } = ctx;
    const current = signals.totals.corners;
    if (current === null) return [notApplicable('OVER', 'provedor sem escanteios')];

    // A pressão já está no ritmo de escanteios que o jogo vem produzindo, e
    // esse ritmo é a base do cálculo. Aplicá-la de novo por inteiro contaria
    // duas vezes; depois dos primeiros minutos o ajuste fica estreito.
    const pressure = signals.pressureIndex ?? 0.45;
    const range = signals.minute >= 5 ? 0.15 : 0.6;
    const boost = Math.min(1 + range, Math.max(1 - range, 1 + (pressure - 0.45) * 0.9));
    const lambda = remainingLambda(
      current,
      signals.minute,
      signals.remainingMinutes,
      league.avgCornersMilli,
      config.params.cornerPaceWeight ?? 0.7,
      boost,
    );

    // Linha: esperado − 1 (mínimo 1), em .5.
    const extra = Math.max(1, Math.round(lambda - 1));
    const line = current + extra + 0.5;
    const probability = poissonAtLeast(extra + 1, lambda);

    return [
      {
        selection: 'OVER',
        line,
        probabilityBps: toBps(probability),
        components: {
          pressure: signals.pressureIndex,
          xg: null,
          shots: signals.shotsPer90 === null ? null : Math.min(1, signals.shotsPer90 / 26),
          context: Math.abs(signals.goalDiff) <= 1 ? 0.7 : 0.35,
          other: signals.cornersPer90 === null ? null : Math.min(1, signals.cornersPer90 / 12),
        },
        rationale: [
          `${signals.minute}' · ${current} escanteios (${signals.home.corners ?? 0} x ${signals.away.corners ?? 0})`,
          `Ritmo projetado: ${(signals.cornersPer90 ?? 0).toFixed(1).replace('.', ',')} por 90'`,
          `Modelo indica ${lambda.toFixed(1).replace('.', ',')} escanteio(s) até o fim · linha ${line}`,
        ],
        applicable: true,
      },
    ];
  },
  settle(input, fixture) {
    return settleCount(input, fixture, (f) => {
      const h = f.statistics?.home.corners ?? null;
      const a = f.statistics?.away.corners ?? null;
      return h === null && a === null ? null : (h ?? 0) + (a ?? 0);
    });
  },
};

export const cardsStrategy: StrategyModule = {
  key: 'LIVE_CARDS',
  market: 'CARDS',
  estimate(ctx): StrategyEstimate[] {
    const blocked = windowBlocked(ctx);
    if (blocked) return [notApplicable('OVER', blocked)];
    const { signals, league, config } = ctx;
    const current = signals.totals.cards;
    if (current === null) return [notApplicable('OVER', 'provedor sem cartões')];

    // Faltas por minuto aceleram cartões; jogo apertado no fim também.
    const foulsPerMinute = signals.totals.fouls === null || signals.minute < 5 ? null : signals.totals.fouls / signals.minute;
    const foulsBoost = foulsPerMinute === null ? 1 : Math.min(1.4, Math.max(0.8, foulsPerMinute / 0.3));
    const tightBoost = Math.abs(signals.goalDiff) <= 1 && signals.minute >= 60 ? 1.15 : 1;
    const boost = foulsBoost * (config.params.foulsWeight ?? 0.3) + tightBoost * (1 - (config.params.foulsWeight ?? 0.3));

    const lambda = remainingLambda(
      current,
      signals.minute,
      signals.remainingMinutes,
      league.avgCardsMilli,
      config.params.cardPaceWeight ?? 0.7,
      boost,
    );
    const extra = Math.max(1, Math.round(lambda - 0.5));
    const line = current + extra + 0.5;
    const probability = poissonAtLeast(extra + 1, lambda);

    return [
      {
        selection: 'OVER',
        line,
        probabilityBps: toBps(probability),
        components: {
          pressure: null,
          xg: null,
          shots: null,
          context: Math.min(1, 0.4 + (signals.minute >= 60 ? 0.3 : 0) + (Math.abs(signals.goalDiff) <= 1 ? 0.2 : 0)),
          other: signals.cardsPer90 === null ? null : Math.min(1, signals.cardsPer90 / 7),
        },
        rationale: [
          `${signals.minute}' · ${current} cartão(ões) (${signals.home.cards ?? 0} x ${signals.away.cards ?? 0})`,
          ...(signals.totals.fouls !== null ? [`${signals.totals.fouls} faltas até agora`] : []),
          `Modelo indica ${lambda.toFixed(1).replace('.', ',')} cartão(ões) até o fim · linha ${line}`,
        ],
        applicable: true,
      },
    ];
  },
  settle(input, fixture) {
    return settleCount(input, fixture, (f) => {
      const stats = f.statistics;
      if (!stats) return null;
      const values = [stats.home.yellowCards, stats.home.redCards, stats.away.yellowCards, stats.away.redCards];
      if (values.every((v) => v === null)) return null;
      return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
    });
  },
};

function settleCount(
  input: SettleInput,
  fixture: NormalizedFixture,
  read: (fixture: NormalizedFixture) => number | null,
): TipResult | null {
  if (fixture.status !== 'FINISHED') return null;
  const total = read(fixture);
  if (total === null || input.line === null) return null;
  if (input.selection === 'OVER') return total > input.line ? 'GREEN' : 'RED';
  if (input.selection === 'UNDER') return total < input.line ? 'GREEN' : 'RED';
  return null;
}
