/**
 * Resultado da partida (1X2) e Dupla chance.
 *
 * Usa o mesmo modelo de gols restantes por lado: dado o placar atual e os
 * gols esperados de cada time, calcula P(vitória), P(empate) e P(derrota)
 * numa grade de Poisson. No pré-jogo, uma previsão do provedor (quando há)
 * é misturada com o modelo.
 */

import type { NormalizedFixture, Selection, TipResult } from '../models';
import { matchOutcomeProbabilities } from '../poisson';
import { buildGoalModel, offensiveComponents } from './goal-model';
import { notApplicable, toBps, type StrategyContext, type StrategyEstimate, type StrategyModule } from './types';

function outcomes(ctx: StrategyContext) {
  const { signals, league, prediction, config, fixture } = ctx;
  const model = buildGoalModel(signals, league, { pressureBoost: 0.4 });
  let probs = matchOutcomeProbabilities(
    fixture.score.home,
    fixture.score.away,
    model.lambdaHome,
    model.lambdaAway,
  );

  // Pré-jogo com previsão do provedor: mistura pelo peso configurado.
  if (!signals.isLive && prediction && prediction.homeWinBps !== null && prediction.awayWinBps !== null) {
    const w = config.params.strengthWeight ?? 0.6;
    const drawBps = prediction.drawBps ?? Math.max(0, 10_000 - prediction.homeWinBps - prediction.awayWinBps);
    probs = {
      homeWin: probs.homeWin * (1 - w) + (prediction.homeWinBps / 10_000) * w,
      draw: probs.draw * (1 - w) + (drawBps / 10_000) * w,
      awayWin: probs.awayWin * (1 - w) + (prediction.awayWinBps / 10_000) * w,
    };
  }

  return { model, probs };
}

function windowBlocked(ctx: StrategyContext): string | null {
  const { minMinute, maxMinute } = ctx.config.thresholds;
  if (!ctx.signals.isLive) return null;
  if (minMinute !== null && ctx.signals.minute < minMinute) return `antes do minuto ${minMinute}`;
  if (maxMinute !== null && ctx.signals.minute > maxMinute) return `depois do minuto ${maxMinute}`;
  return null;
}

export const matchWinnerStrategy: StrategyModule = {
  key: 'MATCH_WINNER',
  market: 'MATCH_WINNER',
  estimate(ctx): StrategyEstimate[] {
    const blocked = windowBlocked(ctx);
    if (blocked) return [notApplicable('HOME', blocked)];

    const { signals, league, config, fixture } = ctx;
    const { model, probs } = outcomes(ctx);
    const comps = offensiveComponents(signals, league, model, config.thresholds);

    const estimates: StrategyEstimate[] = [];
    for (const side of ['HOME', 'AWAY'] as const) {
      const p = side === 'HOME' ? probs.homeWin : probs.awayWin;
      const team = side === 'HOME' ? signals.home : signals.away;
      const leading = side === 'HOME' ? signals.goalDiff > 0 : signals.goalDiff < 0;
      const rationale = [
        signals.isLive
          ? `${signals.minute}' · placar ${fixture.score.home} x ${fixture.score.away}${leading ? ' (já na frente)' : ''}`
          : 'Análise pré-jogo',
        `Modelo indica ${Math.round(p * 100)}% de vitória do ${side === 'HOME' ? 'mandante' : 'visitante'}`,
        ...(signals.dominance !== null
          ? [`Domínio ${side === 'HOME' ? 'do mandante' : 'do visitante'}: ${Math.round((side === 'HOME' ? signals.dominance : -signals.dominance) * 50 + 50)}/100`]
          : []),
      ];
      estimates.push({
        selection: side,
        line: null,
        probabilityBps: toBps(p),
        components: { ...comps, pressure: team.pressure ?? comps.pressure },
        rationale,
        applicable: true,
      });
    }
    return estimates;
  },
  settle(input, fixture) {
    return settleOutcome(input.selection, fixture);
  },
};

export const doubleChanceStrategy: StrategyModule = {
  key: 'DOUBLE_CHANCE',
  market: 'DOUBLE_CHANCE',
  estimate(ctx): StrategyEstimate[] {
    const blocked = windowBlocked(ctx);
    if (blocked) return [notApplicable('1X', blocked)];

    const { signals, league, config, fixture } = ctx;
    const { model, probs } = outcomes(ctx);
    const comps = offensiveComponents(signals, league, model, config.thresholds);

    const make = (selection: Selection, p: number, label: string): StrategyEstimate => ({
      selection,
      line: null,
      probabilityBps: toBps(p),
      components: comps,
      rationale: [
        signals.isLive ? `${signals.minute}' · placar ${fixture.score.home} x ${fixture.score.away}` : 'Análise pré-jogo',
        `Modelo indica ${Math.round(p * 100)}% para ${label}`,
      ],
      applicable: true,
    });

    return [
      make('1X', probs.homeWin + probs.draw, 'mandante ou empate'),
      make('X2', probs.awayWin + probs.draw, 'visitante ou empate'),
    ];
  },
  settle(input, fixture) {
    return settleOutcome(input.selection, fixture);
  },
};

function settleOutcome(selection: Selection, fixture: NormalizedFixture): TipResult | null {
  if (fixture.status !== 'FINISHED') return null;
  const { home, away } = fixture.score;
  switch (selection) {
    case 'HOME':
      return home > away ? 'GREEN' : 'RED';
    case 'AWAY':
      return away > home ? 'GREEN' : 'RED';
    case 'DRAW':
      return home === away ? 'GREEN' : 'RED';
    case '1X':
      return home >= away ? 'GREEN' : 'RED';
    case 'X2':
      return away >= home ? 'GREEN' : 'RED';
    case '12':
      return home !== away ? 'GREEN' : 'RED';
    default:
      return null;
  }
}
