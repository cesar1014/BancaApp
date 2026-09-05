/**
 * Estratégias de gols: Over 0.5 / 1.5 / 2.5, Under 2.5, Ambas marcam e
 * Próximo gol. Todas usam o modelo de Poisson de goal-model.ts.
 */

import type { NormalizedFixture, TipResult } from '../models';
import { poissonAtLeast, poissonCdf } from '../poisson';
import { buildGoalModel, offensiveComponents } from './goal-model';
import { notApplicable, toBps, type SettleInput, type StrategyContext, type StrategyEstimate, type StrategyModule } from './types';

function fmtXg(milli: number | null): string {
  return milli === null ? '—' : (milli / 1000).toFixed(2).replace('.', ',');
}

function minuteWindowOk(ctx: StrategyContext): string | null {
  const { minMinute, maxMinute } = ctx.config.thresholds;
  const { signals, config } = ctx;
  if (!signals.isLive) {
    return config.scope === 'LIVE' ? 'estratégia exclusiva ao vivo' : null;
  }
  if (config.scope === 'PREMATCH') return 'estratégia exclusiva pré-jogo';
  if (minMinute !== null && signals.minute < minMinute) return `antes do minuto ${minMinute}`;
  if (maxMinute !== null && signals.minute > maxMinute) return `depois do minuto ${maxMinute}`;
  return null;
}

function minimumSignalsOk(ctx: StrategyContext): string | null {
  const { thresholds } = ctx.config;
  const { totals } = ctx.signals;
  if (!ctx.signals.isLive) return null;
  // Só cobra o mínimo quando o dado existe: ausência não reprova.
  if (totals.shots !== null && totals.shots < thresholds.minShots) return 'poucas finalizações';
  if (totals.shotsOnTarget !== null && totals.shotsOnTarget < thresholds.minShotsOnTarget) {
    return 'poucas finalizações no alvo';
  }
  if (totals.xgMilli !== null && totals.xgMilli < thresholds.minXgMilli) return 'xG baixo';
  return null;
}

/** Fabrica uma estratégia "Over N.5 gols". */
function overStrategy(key: string, line: number): StrategyModule {
  return {
    key,
    market: line === 0.5 ? 'OVER_0_5' : line === 1.5 ? 'OVER_1_5' : 'OVER_2_5',
    estimate(ctx): StrategyEstimate[] {
      const blocked = minuteWindowOk(ctx) ?? minimumSignalsOk(ctx);
      if (blocked) return [notApplicable('OVER', blocked)];

      const { signals, league, config } = ctx;
      const needed = Math.floor(line) + 1 - signals.totalGoals;
      if (needed <= 0) return [notApplicable('OVER', 'mercado já decidido')];

      const model = buildGoalModel(signals, league, { pressureBoost: config.params.pressureBoost });
      const probability = poissonAtLeast(needed, model.lambdaTotal);
      const comps = offensiveComponents(signals, league, model, config.thresholds);

      const rationale: string[] = [];
      if (signals.isLive) {
        rationale.push(`${signals.minute}' · ${signals.totalGoals} gol(s), faltam ${needed} para o over`);
        if (signals.totals.shots !== null) {
          rationale.push(`Finalizações ${signals.home.shots ?? 0} x ${signals.away.shots ?? 0}`);
        }
        if (signals.totals.xgMilli !== null) {
          rationale.push(`xG ${fmtXg(signals.home.xgMilli)} x ${fmtXg(signals.away.xgMilli)}`);
        } else if (model.usedShotsProxy) {
          rationale.push('xG estimado por finalizações (provedor sem xG)');
        }
        if (signals.pressureIndex !== null) {
          rationale.push(`Pressão ofensiva ${Math.round(signals.pressureIndex * 100)}/100`);
        }
      } else {
        rationale.push(`Média da competição: ${(league.avgGoalsMilli / 1000).toFixed(2).replace('.', ',')} gols/jogo`);
      }
      rationale.push(`Modelo indica ${(model.lambdaTotal).toFixed(2).replace('.', ',')} gol(s) esperado(s) até o fim`);

      return [
        {
          selection: 'OVER',
          line,
          probabilityBps: toBps(probability),
          components: comps,
          rationale,
          applicable: true,
        },
      ];
    },
    settle(input, fixture) {
      return settleTotal(input, fixture);
    },
  };
}

function settleTotal(input: SettleInput, fixture: NormalizedFixture): TipResult | null {
  if (fixture.status !== 'FINISHED') return null;
  const total = fixture.score.home + fixture.score.away;
  const line = input.line ?? 2.5;
  if (input.selection === 'OVER') return total > line ? 'GREEN' : 'RED';
  if (input.selection === 'UNDER') return total < line ? 'GREEN' : 'RED';
  return null;
}

export const over05Strategy = overStrategy('LIVE_OVER_0_5', 0.5);
export const over15Strategy = overStrategy('LIVE_OVER_1_5', 1.5);
export const over25Strategy = overStrategy('OVER_2_5', 2.5);

export const under25Strategy: StrategyModule = {
  key: 'UNDER_2_5',
  market: 'UNDER_2_5',
  estimate(ctx): StrategyEstimate[] {
    const blocked = minuteWindowOk(ctx);
    if (blocked) return [notApplicable('UNDER', blocked)];

    const { signals, league, config } = ctx;
    const line = 2.5;
    const allowed = Math.floor(line) - signals.totalGoals; // gols que ainda cabem
    if (allowed < 0) return [notApplicable('UNDER', 'mercado já decidido')];

    const model = buildGoalModel(signals, league, { pressureBoost: 0.5 });
    const probability = poissonCdf(allowed, model.lambdaTotal);
    const offensive = offensiveComponents(signals, league, model, config.thresholds);

    // Para o under, o que interessa é a AUSÊNCIA de pressão: notas invertidas.
    const invert = (value: number | null) => (value === null ? null : 1 - value);
    const lowTempo = config.params.lowTempoBonus ?? 0.3;
    const context = Math.min(1, offensive.context * (1 - lowTempo) + (signals.isLive ? lowTempo : 0));

    const rationale: string[] = [];
    if (signals.isLive) {
      rationale.push(`${signals.minute}' · ${signals.totalGoals} gol(s), cabem ${allowed} para o under`);
      if (signals.totals.shots !== null) rationale.push(`Apenas ${signals.totals.shots} finalizações no jogo`);
      if (signals.pressureIndex !== null) rationale.push(`Pressão ofensiva ${Math.round(signals.pressureIndex * 100)}/100`);
    }
    rationale.push(`Modelo indica ${model.lambdaTotal.toFixed(2).replace('.', ',')} gol(s) esperado(s) até o fim`);

    return [
      {
        selection: 'UNDER',
        line,
        probabilityBps: toBps(probability),
        components: {
          pressure: invert(offensive.pressure),
          xg: invert(offensive.xg),
          shots: invert(offensive.shots),
          context,
          other: invert(offensive.other),
        },
        rationale,
        applicable: true,
      },
    ];
  },
  settle: settleTotal,
};

export const bttsStrategy: StrategyModule = {
  key: 'BTTS',
  market: 'BTTS',
  estimate(ctx): StrategyEstimate[] {
    const blocked = minuteWindowOk(ctx);
    if (blocked) return [notApplicable('YES', blocked)];

    const { signals, league, config, fixture } = ctx;
    const homeNeeds = fixture.score.home === 0 ? 1 : 0;
    const awayNeeds = fixture.score.away === 0 ? 1 : 0;
    if (homeNeeds === 0 && awayNeeds === 0) return [notApplicable('YES', 'ambas já marcaram')];

    const model = buildGoalModel(signals, league, { pressureBoost: 0.45 });
    const probability =
      poissonAtLeast(homeNeeds, model.lambdaHome) * poissonAtLeast(awayNeeds, model.lambdaAway);
    const comps = offensiveComponents(signals, league, model, config.thresholds);

    // Jogo equilibrado favorece "ambas marcam".
    const balance = signals.dominance === null ? null : 1 - Math.abs(signals.dominance);
    const bonus = config.params.balanceBonus ?? 0.35;
    const context =
      balance === null ? comps.context : Math.min(1, comps.context * (1 - bonus) + balance * bonus);

    const rationale: string[] = [];
    if (signals.isLive) rationale.push(`${signals.minute}' · placar ${fixture.score.home} x ${fixture.score.away}`);
    if (balance !== null) rationale.push(`Equilíbrio ofensivo ${Math.round(balance * 100)}/100`);
    rationale.push(
      `Gols esperados: mandante ${model.lambdaHome.toFixed(2).replace('.', ',')}, visitante ${model.lambdaAway.toFixed(2).replace('.', ',')}`,
    );

    return [
      {
        selection: 'YES',
        line: null,
        probabilityBps: toBps(probability),
        components: { ...comps, context },
        rationale,
        applicable: true,
      },
    ];
  },
  settle(input, fixture) {
    if (fixture.status !== 'FINISHED') return null;
    const both = fixture.score.home > 0 && fixture.score.away > 0;
    if (input.selection === 'YES') return both ? 'GREEN' : 'RED';
    if (input.selection === 'NO') return both ? 'RED' : 'GREEN';
    return null;
  },
};

export const nextGoalStrategy: StrategyModule = {
  key: 'LIVE_NEXT_GOAL',
  market: 'NEXT_GOAL',
  estimate(ctx): StrategyEstimate[] {
    const blocked = minuteWindowOk(ctx) ?? minimumSignalsOk(ctx);
    if (blocked) return [notApplicable('HOME', blocked)];

    const { signals, league, config } = ctx;
    if (signals.dominance === null) return [notApplicable('HOME', 'sem dados de domínio')];

    const model = buildGoalModel(signals, league, { pressureBoost: 0.5 });
    const anyGoal = poissonAtLeast(1, model.lambdaTotal);
    const homeShare = model.lambdaHome / Math.max(1e-9, model.lambdaTotal);
    const threshold = config.params.dominanceThreshold ?? 0.62;

    const comps = offensiveComponents(signals, league, model, config.thresholds);
    const estimates: StrategyEstimate[] = [];

    for (const side of ['HOME', 'AWAY'] as const) {
      const share = side === 'HOME' ? homeShare : 1 - homeShare;
      if (share < threshold) continue;
      const team = side === 'HOME' ? signals.home : signals.away;
      const teamPressure = team.pressure;
      estimates.push({
        selection: side,
        line: null,
        probabilityBps: toBps(anyGoal * share),
        components: { ...comps, pressure: teamPressure ?? comps.pressure },
        rationale: [
          `${signals.minute}' · ${side === 'HOME' ? 'mandante' : 'visitante'} com ${Math.round(share * 100)}% dos gols esperados`,
          `Probabilidade de sair gol até o fim: ${Math.round(anyGoal * 100)}%`,
          ...(team.shots !== null ? [`Finalizações do lado dominante: ${team.shots} (${team.shotsOnTarget ?? 0} no alvo)`] : []),
        ],
        applicable: true,
      });
    }

    return estimates.length > 0 ? estimates : [notApplicable('HOME', 'nenhum lado domina o suficiente')];
  },
  settle(input, fixture) {
    if (fixture.status !== 'FINISHED' && fixture.status !== 'LIVE' && fixture.status !== 'HALFTIME') return null;
    const minuteAt = input.minuteAt ?? 0;
    const goals = fixture.events
      .filter((event) => (event.type === 'GOAL' || event.type === 'PENALTY_GOAL' || event.type === 'OWN_GOAL') && event.minute > minuteAt)
      .sort((a, b) => a.minute - b.minute);

    if (goals.length > 0) {
      const first = goals[0]!;
      // Gol contra conta para o adversário.
      const scorer = first.type === 'OWN_GOAL' ? (first.team === 'HOME' ? 'AWAY' : 'HOME') : first.team;
      return scorer === input.selection ? 'GREEN' : 'RED';
    }

    if (fixture.status !== 'FINISHED') return null;

    // Sem eventos: cai para a comparação de placares.
    const dh = fixture.score.home - input.scoreAt.home;
    const da = fixture.score.away - input.scoreAt.away;
    if (dh === 0 && da === 0) return 'RED';
    if (dh > 0 && da === 0) return input.selection === 'HOME' ? 'GREEN' : 'RED';
    if (da > 0 && dh === 0) return input.selection === 'AWAY' ? 'GREEN' : 'RED';
    return 'PUSH'; // os dois marcaram e não sabemos a ordem
  },
};
