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
  const { signals, league, prediction, anchor, config, fixture } = ctx;
  const model = buildGoalModel(signals, league, { pressureBoost: 0.4, anchor });
  let probs = matchOutcomeProbabilities(
    fixture.score.home,
    fixture.score.away,
    model.lambdaHome,
    model.lambdaAway,
  );

  /**
   * Previsão do provedor: só entra quando o mercado NÃO deu a força dos times.
   *
   * Com âncora de 1X2, o preço já embute escalação, desfalques e forma, e é
   * incomparavelmente melhor que uma porcentagem genérica de API. Misturar as
   * duas só reintroduziria o viés que a âncora foi criada para eliminar: puxar
   * favorito para baixo e azarão para cima. Sem âncora, a previsão é a única
   * informação específica do confronto que existe, então vale o peso cheio.
   */
  const hasOutcomeAnchor = anchor !== null && anchor.outcome !== null;
  if (
    !signals.isLive &&
    !hasOutcomeAnchor &&
    prediction &&
    prediction.homeWinBps !== null &&
    prediction.awayWinBps !== null
  ) {
    const w = config.params.strengthWeight ?? 0.6;
    const drawBps = prediction.drawBps ?? Math.max(0, 10_000 - prediction.homeWinBps - prediction.awayWinBps);
    probs = {
      homeWin: probs.homeWin * (1 - w) + (prediction.homeWinBps / 10_000) * w,
      draw: probs.draw * (1 - w) + (drawBps / 10_000) * w,
      awayWin: probs.awayWin * (1 - w) + (prediction.awayWinBps / 10_000) * w,
    };
  }

  return { model, probs, informed: hasOutcomeAnchor || (!signals.isLive && prediction !== null) };
}

/**
 * No pré-jogo sem nenhuma informação do confronto — nem preço de 1X2, nem
 * previsão do provedor — o modelo devolveria a média da liga, idêntica para
 * todos os jogos. Um número que não distingue os times não é uma estimativa,
 * e comparado a uma odd real produziria "value" proporcional ao tamanho do
 * azarão. Nesses casos o certo é não opinar.
 */
function uninformedPrematch(ctx: StrategyContext, informed: boolean): string | null {
  if (ctx.signals.isLive || informed) return null;
  return 'sem cotação de 1X2 nem previsão: o modelo não distingue os times no pré-jogo';
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
    const { model, probs, informed } = outcomes(ctx);
    const uninformed = uninformedPrematch(ctx, informed);
    if (uninformed) return [notApplicable('HOME', uninformed), notApplicable('AWAY', uninformed)];
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
    const { model, probs, informed } = outcomes(ctx);
    const uninformed = uninformedPrematch(ctx, informed);
    if (uninformed) return [notApplicable('1X', uninformed), notApplicable('X2', uninformed)];
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
