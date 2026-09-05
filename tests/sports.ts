/**
 * Suíte da Central de Dicas. Roda junto com `npm test` (importada por run.ts).
 * Nenhum teste toca API real: provedores são simulados ou recebem um
 * `fetchJson` falso.
 */
import assert from 'node:assert/strict';
import { group, test } from './harness';

import { diceSimilarity, normalizeTeamName, teamKey, teamSimilarity, isSameTeam } from '../src/lib/sports/domain/names';
import { fixtureKey, matchFixture, matchFixtures } from '../src/lib/sports/domain/matching';
import {
  expectedValueBps,
  fairOddMilli,
  impliedProbabilityBps,
  minAcceptableOddMilli,
  overroundBps,
  removeMargin,
  valueBps,
  bestQuote,
} from '../src/lib/sports/domain/odds-math';
import { computeEntryScore, oddValueComponent } from '../src/lib/sports/domain/scoring';
import { DEFAULT_SCORE_WEIGHTS, STRATEGY_CONFIGS, findStrategyConfig } from '../src/lib/sports/config/strategy-config';
import { poissonAtLeast, poissonCdf, matchOutcomeProbabilities } from '../src/lib/sports/domain/poisson';
import { computeSignals } from '../src/lib/sports/domain/signals';
import { nextAnalysisState, liveDisplayState, confidenceFromScore } from '../src/lib/sports/domain/analysis-state';
import { assignTiers, interestScore, limitsForMode } from '../src/lib/sports/domain/funnel';
import { computePerformance, computePerformanceBreakdown, tipProfitCents } from '../src/lib/sports/domain/performance';
import { evaluateFixture, identifiedEntries } from '../src/lib/sports/domain/evaluate';
import { runBacktest } from '../src/lib/sports/domain/backtest';
import { STRATEGY_MODULES, findStrategyModule } from '../src/lib/sports/domain/strategies';
import { buildGoalModel } from '../src/lib/sports/domain/strategies/goal-model';
import {
  buildMarketAnchor,
  consensusOddMilli,
  overTwoFiveProbability,
  totalFromOverProbability,
} from '../src/lib/sports/domain/market-anchor';
import { SportsCache } from '../src/lib/sports/infra/cache';
import { ProviderQuotaManager, DEFAULT_QUOTA_LIMITS } from '../src/lib/sports/infra/quota';
import { CircuitBreaker } from '../src/lib/sports/infra/http';
import { MockProvider } from '../src/lib/sports/providers/mock';
import { ApiFootballProvider } from '../src/lib/sports/providers/api-football';
import { mapOddsApiEvent } from '../src/lib/sports/providers/odds-api';
import { createProviders } from '../src/lib/sports/providers';
import { InMemoryMappingStore, SportsDataLayer, mergeStatistics } from '../src/lib/sports/data-layer';
import { findLeague } from '../src/lib/sports/config/leagues';
import { ttlFor } from '../src/lib/sports/config/cache-policy';
import type { NormalizedFixture, OddsQuote, TeamStatistics } from '../src/lib/sports/domain/models';
import { EMPTY_TEAM_STATISTICS } from '../src/lib/sports/domain/models';
import type { FetchJson } from '../src/lib/sports/infra/http';

// ---------------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------------
const LEAGUE = findLeague('BRA_SERIE_A')!;

function stats(over: Partial<TeamStatistics>): TeamStatistics {
  return { ...EMPTY_TEAM_STATISTICS, ...over };
}

function fixture(over: Partial<NormalizedFixture> = {}): NormalizedFixture {
  return {
    id: '2026-09-05:palmeiras:flamengo',
    providerIds: { mock: 'mock-2026-09-05-1' },
    league: LEAGUE,
    homeTeam: { key: 'palmeiras', name: 'Palmeiras', shortName: null, country: 'Brasil', aliases: [], providerIds: {} },
    awayTeam: { key: 'flamengo', name: 'Flamengo', shortName: null, country: 'Brasil', aliases: [], providerIds: {} },
    startTime: '2026-09-05T20:00:00.000Z',
    status: 'LIVE',
    minute: 34,
    score: { home: 0, away: 0 },
    halftimeScore: null,
    statistics: {
      home: stats({ shots: 12, shotsOnTarget: 5, corners: 6, xgMilli: 1180, dangerousAttacks: 40, possessionBps: 6200, yellowCards: 1, redCards: 0 }),
      away: stats({ shots: 4, shotsOnTarget: 1, corners: 1, xgMilli: 290, dangerousAttacks: 12, possessionBps: 3800, yellowCards: 2, redCards: 0 }),
      source: 'mock',
      lastUpdated: '2026-09-05T20:34:00.000Z',
      confidence: 'HIGH',
    },
    events: [],
    odds: null,
    metadata: { sources: ['mock'], lastUpdated: '2026-09-05T20:34:00.000Z', confidence: 'HIGH', stale: false, venue: null, round: null },
    ...over,
  };
}

function quote(market: OddsQuote['market'], selection: OddsQuote['selection'], odd: number, line: number | null = null, bookmaker = 'Bet365'): OddsQuote {
  return { market, selection, line, oddMilli: odd, bookmaker, provider: 'mock', capturedAt: '2026-09-05T20:34:00.000Z' };
}

const NOW = new Date('2026-09-05T20:34:30.000Z');
const STRATEGIES = STRATEGY_CONFIGS.map((config) => ({ module: STRATEGY_MODULES.find((m) => m.key === config.key)!, config }));

// ===========================================================================
group('Dicas › normalização de nomes');
// ===========================================================================
test('remove ruído, acentos e expande abreviações', () => {
  assert.equal(normalizeTeamName('Manchester Utd.'), 'manchester united');
  assert.equal(normalizeTeamName('SE Palmeiras'), 'palmeiras');
  assert.equal(normalizeTeamName('Atlético-MG'), 'atletico mg');
  assert.equal(normalizeTeamName('FC København'), 'kobenhavn');
});

test('aliases conhecidos levam à mesma chave canônica', () => {
  assert.equal(teamKey('Man Utd'), teamKey('Manchester United'));
  assert.equal(teamKey('Manchester Utd'), teamKey('Manchester United'));
  assert.equal(teamKey('Atlético-MG'), teamKey('Atletico Mineiro'));
  assert.equal(teamKey('RB Bragantino'), teamKey('Red Bull Bragantino'));
  assert.equal(teamKey('FC København'), teamKey('Copenhagen'));
});

test('similaridade reconhece variações sem igualdade exata', () => {
  assert.equal(teamSimilarity('Man Utd', 'Manchester United'), 1);
  assert.ok(teamSimilarity('Real Sociedad', 'Real Sociedad de Fútbol') >= 0.85);
  assert.ok(teamSimilarity('Palmeiras', 'Flamengo') < 0.5);
  assert.ok(diceSimilarity('night', 'nacht') > 0 && diceSimilarity('night', 'nacht') <= 0.6);
  assert.equal(isSameTeam('Wolves', 'Wolverhampton Wanderers'), true);
  assert.equal(isSameTeam('Inter', 'Internacional'), true);
  assert.equal(isSameTeam('Santos', 'Vitória'), false);
});

test('aliases extras (persistidos) têm prioridade', () => {
  assert.equal(teamKey('galo doido', { 'galo doido': 'atletico mineiro' }), 'atletico mineiro');
});

// ===========================================================================
group('Dicas › matching entre provedores');
// ===========================================================================
const TARGET = { homeName: 'Palmeiras', awayName: 'Flamengo', startTime: '2026-09-05T20:00:00Z', leagueKey: 'BRA_SERIE_A' };

test('casa a partida certa mesmo com nomes e horário diferentes', () => {
  const decision = matchFixture(TARGET, [
    { providerId: 'a', homeName: 'SE Palmeiras', awayName: 'CR Flamengo', startTime: '2026-09-05T20:05:00Z' },
    { providerId: 'b', homeName: 'Santos', awayName: 'Flamengo', startTime: '2026-09-05T20:00:00Z' },
    { providerId: 'c', homeName: 'Palmeiras', awayName: 'Flamengo', startTime: '2026-09-07T20:00:00Z' },
  ]);
  assert.equal(decision.status, 'MATCHED');
  assert.equal(decision.best?.candidate.providerId, 'a');
  assert.ok((decision.best?.confidenceBps ?? 0) > 9000);
});

test('não casa quando só um dos times bate', () => {
  const decision = matchFixture(TARGET, [{ providerId: 'x', homeName: 'Palmeiras', awayName: 'Corinthians', startTime: '2026-09-05T20:00:00Z' }]);
  assert.equal(decision.status, 'NONE');
});

test('mandante e visitante invertidos não casam', () => {
  const decision = matchFixture(TARGET, [{ providerId: 'x', homeName: 'Flamengo', awayName: 'Palmeiras', startTime: '2026-09-05T20:00:00Z' }]);
  assert.equal(decision.status, 'NONE');
});

test('dois candidatos bons demais viram AMBIGUOUS em vez de chute', () => {
  const decision = matchFixture(TARGET, [
    { providerId: 'a', homeName: 'Palmeiras', awayName: 'Flamengo', startTime: '2026-09-05T20:00:00Z' },
    { providerId: 'b', homeName: 'Palmeiras', awayName: 'Flamengo', startTime: '2026-09-05T20:01:00Z' },
  ]);
  assert.equal(decision.status, 'AMBIGUOUS');
});

test('fora da janela temporal não é candidato', () => {
  const decision = matchFixture(TARGET, [{ providerId: 'a', homeName: 'Palmeiras', awayName: 'Flamengo', startTime: '2026-09-05T23:00:00Z' }]);
  assert.equal(decision.status, 'NONE');
});

test('casamento em lote é um-para-um', () => {
  const results = matchFixtures(
    [
      { homeName: 'Palmeiras', awayName: 'Flamengo', startTime: '2026-09-05T20:00:00Z' },
      { homeName: 'Palmeiras', awayName: 'Flamengo', startTime: '2026-09-05T20:10:00Z' },
    ],
    [{ providerId: 'only', homeName: 'Palmeiras', awayName: 'Flamengo', startTime: '2026-09-05T20:00:00Z' }],
  );
  const matched = results.filter((r) => r.decision.status === 'MATCHED');
  assert.equal(matched.length, 1);
  assert.equal(matched[0]!.target.startTime, '2026-09-05T20:00:00Z');
});

test('chave interna é determinística e independe da grafia', () => {
  assert.equal(fixtureKey('2026-09-05T20:00:00Z', 'Man Utd', 'Wolves'), fixtureKey('2026-09-05T22:00:00Z', 'Manchester United', 'Wolverhampton Wanderers'));
});

// ===========================================================================
group('Dicas › matemática de odds');
// ===========================================================================
test('probabilidade implícita = 1/odd', () => {
  assert.equal(impliedProbabilityBps(2000), 5000);
  assert.equal(impliedProbabilityBps(1580), 6329);
  assert.equal(impliedProbabilityBps(1000), 10_000);
});

test('odd justa = 1/probabilidade (exemplo da especificação)', () => {
  assert.equal(fairOddMilli(7000), 1429); // 1/0,70 = 1,43
  assert.equal(fairOddMilli(7600), 1316); // 76% → 1,32
});

test('value e EV (exemplo: p=0,70 e odd 1,65)', () => {
  assert.equal(expectedValueBps(7000, 1650), 1550); // +15,5%
  assert.equal(valueBps(7000, 1650), 1547); // 1,65/1,429 − 1
  assert.ok(expectedValueBps(5000, 1800) < 0); // odd abaixo da justa → EV negativo
});

test('odd mínima aceitável para um EV mínimo', () => {
  // p = 76%, EV mínimo 5% → odd ≥ 1,05/0,76 = 1,3816
  assert.equal(minAcceptableOddMilli(7600, 500), 1382);
});

test('remoção de margem devolve probabilidades que somam 100%', () => {
  const fair = removeMargin([1900, 3400, 4200]);
  assert.equal(fair.reduce((a, b) => a + b, 0), 10_000);
  assert.ok(overroundBps([1900, 3400, 4200]) > 0);
});

test('melhor cotação escolhe a maior odd da seleção certa', () => {
  const quotes = [quote('OVER_2_5', 'OVER', 1800, 2.5, 'A'), quote('OVER_2_5', 'OVER', 1920, 2.5, 'B'), quote('UNDER_2_5', 'UNDER', 2100, 2.5, 'B')];
  assert.equal(bestQuote(quotes, 'OVER_2_5', 'OVER', 2.5)?.bookmaker, 'B');
  assert.equal(bestQuote(quotes, 'BTTS', 'YES'), null);
});

// ===========================================================================
group('Dicas › score ponderado');
// ===========================================================================
test('com todos os componentes, o score é a soma ponderada', () => {
  const breakdown = computeEntryScore({ pressure: 1, xg: 1, shots: 1, context: 1, oddValue: 1, other: 1 }, DEFAULT_SCORE_WEIGHTS);
  assert.equal(breakdown.total, 100);
  const half = computeEntryScore({ pressure: 0.5, xg: 0.5, shots: 0.5, context: 0.5, oddValue: 0.5, other: 0.5 }, DEFAULT_SCORE_WEIGHTS);
  assert.equal(half.total, 50);
});

test('dado ausente redistribui o peso — não penaliza nem quebra', () => {
  const withoutXg = computeEntryScore({ pressure: 0.8, xg: null, shots: 0.8, context: 0.8, oddValue: 0.8, other: 0.8 }, DEFAULT_SCORE_WEIGHTS);
  assert.equal(withoutXg.total, 80);
  const xgItem = withoutXg.items.find((item) => item.key === 'xg')!;
  assert.equal(xgItem.available, false);
  assert.equal(xgItem.max, 0);
  const pressure = withoutXg.items.find((item) => item.key === 'pressure')!;
  assert.ok(pressure.max > 25); // ganhou parte dos 20 pontos do xG
});

test('sem nenhum dado o score é zero, não erro', () => {
  const empty = computeEntryScore({ pressure: null, xg: null, shots: null, context: null, oddValue: null, other: null }, DEFAULT_SCORE_WEIGHTS);
  assert.equal(empty.total, 0);
});

test('componente de odd: sem cotação = null; no mínimo exigido = 0,5', () => {
  assert.equal(oddValueComponent(null, 500), null);
  assert.equal(oddValueComponent(500, 500), 0.5);
  assert.equal(oddValueComponent(-600, 500), 0);
  assert.equal(oddValueComponent(3000, 500), 1);
});

// ===========================================================================
group('Dicas › modelo de Poisson e sinais');
// ===========================================================================
test('Poisson: P(≥1 gol) com λ=1 ≈ 63%', () => {
  assert.ok(Math.abs(poissonAtLeast(1, 1) - 0.632) < 0.005);
  assert.equal(poissonAtLeast(0, 0.5), 1);
  assert.ok(Math.abs(poissonCdf(2, 1) - 0.9197) < 0.001);
});

test('resultado final considera o placar atual', () => {
  const ahead = matchOutcomeProbabilities(2, 0, 0.3, 0.3);
  assert.ok(ahead.homeWin > 0.9);
  const even = matchOutcomeProbabilities(0, 0, 1.2, 1.2);
  assert.ok(Math.abs(even.homeWin - even.awayWin) < 1e-9);
});

test('sinais toleram estatística ausente', () => {
  const signals = computeSignals(fixture({ statistics: null }));
  assert.equal(signals.pressureIndex, null);
  assert.equal(signals.totals.shots, null);
  assert.equal(signals.availability.statistics, false);
  assert.equal(signals.remainingMinutes, 60);
});

test('estatística exagerada não vira previsão absurda (teto de sanidade)', () => {
  // xG de 4,0 aos 30 minutos: um provedor com dado corrompido não pode gerar
  // "6 gols esperados" e, com isso, uma probabilidade de 99% e value de +70%.
  const louco = fixture({
    minute: 30,
    statistics: {
      ...fixture().statistics!,
      home: stats({ shots: 30, shotsOnTarget: 15, xgMilli: 4000, dangerousAttacks: 90, possessionBps: 7000, corners: 14 }),
      away: stats({ shots: 22, shotsOnTarget: 9, xgMilli: 2800, dangerousAttacks: 70, possessionBps: 3000, corners: 9 }),
    },
  });
  const model = buildGoalModel(computeSignals(louco), LEAGUE, { pressureBoost: 0.5 });
  const restante = (94 - 30) / 90;
  const teto = (LEAGUE.avgGoalsMilli / 1000) * 2 * restante;
  assert.ok(model.lambdaTotal <= teto + 1e-9, `lambda ${model.lambdaTotal} passou do teto ${teto}`);
  assert.ok(model.lambdaTotal < 4, 'nenhum jogo tem 4+ gols esperados no tempo restante');

  const over05 = findStrategyModule('LIVE_OVER_0_5')!.estimate({
    fixture: louco, signals: computeSignals(louco), league: LEAGUE, prediction: null, anchor: null,
    config: findStrategyConfig('LIVE_OVER_0_5')!, now: NOW,
  })[0]!;
  assert.ok(over05.probabilityBps < 9700, `probabilidade ${over05.probabilityBps} irreal`);

  // A pressão não pode ser contada duas vezes: quando a taxa já vem do xG
  // observado, ela própria reflete a pressão. Multiplicar de novo por um fator
  // grande cria "value" que não existe.
  const pressionado = fixture({
    minute: 40,
    statistics: {
      ...fixture().statistics!,
      home: stats({ shots: 12, shotsOnTarget: 5, xgMilli: 1200, dangerousAttacks: 55, possessionBps: 7000, corners: 7 }),
      away: stats({ shots: 3, shotsOnTarget: 1, xgMilli: 250, dangerousAttacks: 12, possessionBps: 3000, corners: 1 }),
    },
  });
  const comXg = buildGoalModel(computeSignals(pressionado), LEAGUE, { pressureBoost: 0.5 });
  assert.ok(comXg.usedXg, 'este cenário tem xG e deve usá-lo');
  assert.ok(
    comXg.pressureMultiplier <= 1.2 && comXg.pressureMultiplier >= 0.8,
    `com xG observado o ajuste de pressão deve ser estreito, veio ${comXg.pressureMultiplier}`,
  );

  // Sem estatística nenhuma, a pressão é a única informação: alcance largo.
  const semDados = fixture({ minute: 40, statistics: null });
  assert.equal(buildGoalModel(computeSignals(semDados), LEAGUE, {}).pressureMultiplier, 1);

  // O piso protege o oposto: jogo travado ainda tem chance de sair gol.
  const travado = fixture({
    minute: 30,
    statistics: {
      ...fixture().statistics!,
      home: stats({ shots: 0, shotsOnTarget: 0, xgMilli: 0, dangerousAttacks: 0, possessionBps: 5000 }),
      away: stats({ shots: 0, shotsOnTarget: 0, xgMilli: 0, dangerousAttacks: 0, possessionBps: 5000 }),
    },
  });
  assert.ok(buildGoalModel(computeSignals(travado), LEAGUE, {}).lambdaTotal > 0.2);
});

test('sinais detectam domínio do mandante', () => {
  const signals = computeSignals(fixture());
  assert.ok(signals.dominance !== null && signals.dominance > 0.3);
  assert.ok(signals.pressureIndex !== null && signals.pressureIndex > 0.5);
  assert.equal(signals.totals.shots, 16);
  assert.equal(signals.totals.xgMilli, 1470);
});

test('momentum compara ritmo recente com ritmo médio', () => {
  const current = fixture();
  const previous = {
    minute: 24,
    statistics: {
      ...current.statistics!,
      home: stats({ shots: 4, corners: 2, dangerousAttacks: 15 }),
      away: stats({ shots: 2, corners: 0, dangerousAttacks: 8 }),
    },
  };
  const signals = computeSignals(current, previous);
  assert.ok(signals.momentum !== null && signals.momentum > 0.5); // acelerou
});

// ===========================================================================
group('Dicas › estratégias');
// ===========================================================================
test('Over 0.5 ao vivo: jogo pressionado sem gol tem probabilidade alta', () => {
  const module = findStrategyModule('LIVE_OVER_0_5')!;
  const config = findStrategyConfig('LIVE_OVER_0_5')!;
  const f = fixture();
  const [estimate] = module.estimate({ fixture: f, signals: computeSignals(f), league: LEAGUE, prediction: null, anchor: null, config, now: NOW });
  assert.equal(estimate!.applicable, true);
  assert.ok(estimate!.probabilityBps > 7000);
  assert.ok(estimate!.rationale.length >= 3);
});

test('estratégia fora da janela de minuto não é aplicável (com motivo)', () => {
  const module = findStrategyModule('LIVE_OVER_0_5')!;
  const config = findStrategyConfig('LIVE_OVER_0_5')!;
  const f = fixture({ minute: 88 });
  const [estimate] = module.estimate({ fixture: f, signals: computeSignals(f), league: LEAGUE, prediction: null, anchor: null, config, now: NOW });
  assert.equal(estimate!.applicable, false);
  assert.match(estimate!.reason ?? '', /minuto/);
});

test('mercado já decidido não é oferecido', () => {
  const module = findStrategyModule('LIVE_OVER_1_5')!;
  const config = findStrategyConfig('LIVE_OVER_1_5')!;
  const f = fixture({ score: { home: 2, away: 0 } });
  const [estimate] = module.estimate({ fixture: f, signals: computeSignals(f), league: LEAGUE, prediction: null, anchor: null, config, now: NOW });
  assert.equal(estimate!.applicable, false);
});

test('estratégias funcionam sem estatística nenhuma (só média da liga)', () => {
  const f = fixture({ statistics: null, minute: 30 });
  for (const { module, config } of STRATEGIES) {
    const estimates = module.estimate({ fixture: f, signals: computeSignals(f), league: LEAGUE, prediction: null, anchor: null, config, now: NOW });
    assert.ok(estimates.length > 0, config.key);
  }
  const over25 = findStrategyModule('OVER_2_5')!.estimate({ fixture: f, signals: computeSignals(f), league: LEAGUE, prediction: null, anchor: null, config: findStrategyConfig('OVER_2_5')!, now: NOW })[0]!;
  assert.equal(over25.applicable, true);
  assert.equal(over25.components.xg, null); // sem xG → componente ausente
});

test('próximo gol só sugere o lado dominante', () => {
  const module = findStrategyModule('LIVE_NEXT_GOAL')!;
  const config = findStrategyConfig('LIVE_NEXT_GOAL')!;
  const f = fixture();
  const estimates = module.estimate({ fixture: f, signals: computeSignals(f), league: LEAGUE, prediction: null, anchor: null, config, now: NOW });
  assert.equal(estimates.length, 1);
  assert.equal(estimates[0]!.selection, 'HOME');
});

test('under favorece jogo sem pressão', () => {
  const module = findStrategyModule('UNDER_2_5')!;
  const config = findStrategyConfig('UNDER_2_5')!;
  const calm = fixture({ statistics: { ...fixture().statistics!, home: stats({ shots: 2, shotsOnTarget: 0, xgMilli: 100 }), away: stats({ shots: 1, shotsOnTarget: 0, xgMilli: 50 }) } });
  const hot = fixture();
  const pCalm = module.estimate({ fixture: calm, signals: computeSignals(calm), league: LEAGUE, prediction: null, anchor: null, config, now: NOW })[0]!.probabilityBps;
  const pHot = module.estimate({ fixture: hot, signals: computeSignals(hot), league: LEAGUE, prediction: null, anchor: null, config, now: NOW })[0]!.probabilityBps;
  assert.ok(pCalm > pHot);
});

test('liquidação: over, btts, resultado, dupla chance e escanteios', () => {
  const final = fixture({ status: 'FINISHED', minute: 90, score: { home: 2, away: 1 }, statistics: { ...fixture().statistics!, home: stats({ corners: 7, yellowCards: 2, redCards: 0 }), away: stats({ corners: 3, yellowCards: 3, redCards: 1 }) } });
  const settle = (key: string, selection: OddsQuote['selection'], line: number | null = null) =>
    findStrategyModule(key)!.settle({ market: findStrategyModule(key)!.market, selection, line, minuteAt: 30, scoreAt: { home: 0, away: 0 } }, final);
  assert.equal(settle('OVER_2_5', 'OVER', 2.5), 'GREEN');
  assert.equal(settle('UNDER_2_5', 'UNDER', 2.5), 'RED');
  assert.equal(settle('BTTS', 'YES'), 'GREEN');
  assert.equal(settle('MATCH_WINNER', 'AWAY'), 'RED');
  assert.equal(settle('DOUBLE_CHANCE', '1X'), 'GREEN');
  assert.equal(settle('LIVE_CORNERS', 'OVER', 9.5), 'GREEN');
  assert.equal(settle('LIVE_CORNERS', 'OVER', 10.5), 'RED');
  assert.equal(settle('LIVE_CARDS', 'OVER', 5.5), 'GREEN');
  // Partida ainda em andamento não resolve.
  assert.equal(findStrategyModule('OVER_2_5')!.settle({ market: 'OVER_2_5', selection: 'OVER', line: 2.5, minuteAt: 30, scoreAt: { home: 0, away: 0 } }, fixture()), null);
});

test('liquidação do próximo gol usa a ordem dos eventos', () => {
  const module = findStrategyModule('LIVE_NEXT_GOAL')!;
  const final = fixture({
    status: 'FINISHED',
    score: { home: 1, away: 1 },
    events: [
      { minute: 20, extraMinute: null, type: 'GOAL', team: 'HOME', player: null, detail: null },
      { minute: 55, extraMinute: null, type: 'GOAL', team: 'AWAY', player: null, detail: null },
    ],
  });
  const input = { market: 'NEXT_GOAL' as const, line: null, minuteAt: 30, scoreAt: { home: 1, away: 0 } };
  assert.equal(module.settle({ ...input, selection: 'AWAY' }, final), 'GREEN');
  assert.equal(module.settle({ ...input, selection: 'HOME' }, final), 'RED');
  // Sem eventos e ambos marcaram depois: não dá para saber a ordem → push.
  assert.equal(module.settle({ ...input, selection: 'HOME', scoreAt: { home: 0, away: 0 } }, { ...final, events: [] }), 'PUSH');
});

// ===========================================================================
group('Dicas › estados da análise');
// ===========================================================================
const TH = findStrategyConfig('LIVE_OVER_0_5')!.thresholds;

test('progressão pelos estados conforme score e value', () => {
  const base = { previous: null, status: 'LIVE' as const, monitored: true, thresholds: TH, oddInRange: true };
  assert.equal(nextAnalysisState({ ...base, score: 20, valueBps: null }), 'MONITORANDO');
  assert.equal(nextAnalysisState({ ...base, monitored: false, score: 20, valueBps: null }), 'OBSERVANDO');
  assert.equal(nextAnalysisState({ ...base, score: 55, valueBps: null }), 'PRESSAO_DETECTADA');
  assert.equal(nextAnalysisState({ ...base, score: 65, valueBps: null }), 'POSSIVEL_OPORTUNIDADE');
  assert.equal(nextAnalysisState({ ...base, score: 65, valueBps: 900 }), 'VALUE_CONFIRMADO');
  assert.equal(nextAnalysisState({ ...base, score: 80, valueBps: null }), 'ODD_AGUARDANDO');
  assert.equal(nextAnalysisState({ ...base, score: 80, valueBps: 200 }), 'ODD_AGUARDANDO'); // value abaixo do mínimo
  assert.equal(nextAnalysisState({ ...base, score: 80, valueBps: 900 }), 'ENTRADA_IDENTIFICADA');
  assert.equal(nextAnalysisState({ ...base, score: 80, valueBps: 900, oddInRange: false }), 'ODD_AGUARDANDO');
});

test('histerese: entrada identificada não some por oscilação pequena', () => {
  const base = { status: 'LIVE' as const, monitored: true, thresholds: TH, oddInRange: true };
  assert.equal(nextAnalysisState({ ...base, previous: 'ENTRADA_IDENTIFICADA', score: TH.minScore - 3, valueBps: 100 }), 'ENTRADA_IDENTIFICADA');
  assert.equal(nextAnalysisState({ ...base, previous: 'ENTRADA_IDENTIFICADA', score: 40, valueBps: 900 }), 'DESCARTADA');
  assert.equal(nextAnalysisState({ ...base, previous: 'POSSIVEL_OPORTUNIDADE', score: 45, valueBps: null }), 'DESCARTADA');
});

test('partida encerrada → ENCERRADA; estados visuais e confiança', () => {
  assert.equal(nextAnalysisState({ previous: 'ENTRADA_IDENTIFICADA', status: 'FINISHED', monitored: true, score: 90, valueBps: 900, oddInRange: true, thresholds: TH }), 'ENCERRADA');
  assert.equal(liveDisplayState('ENTRADA_IDENTIFICADA', 'LIVE'), 'OPORTUNIDADE');
  assert.equal(liveDisplayState('POSSIVEL_OPORTUNIDADE', 'LIVE'), 'QUASE_ENTRADA');
  assert.equal(liveDisplayState('PRESSAO_DETECTADA', 'LIVE'), 'ATENCAO');
  assert.equal(liveDisplayState('OBSERVANDO', 'FINISHED'), 'ENCERRADA');
  assert.equal(confidenceFromScore(85), 'ALTA');
  assert.equal(confidenceFromScore(72), 'MEDIA');
  assert.equal(confidenceFromScore(60), 'BAIXA');
});

// ===========================================================================
group('Dicas › funil');
// ===========================================================================
test('interesse prioriza liga, ao vivo e odds', () => {
  const now = new Date('2026-09-05T20:00:00Z');
  const live = interestScore({ fixtureId: 'a', leaguePriority: 1, status: 'LIVE', startTime: '2026-09-05T19:00:00Z', hasOdds: true, activity: 0.8, state: null }, now);
  const later = interestScore({ fixtureId: 'b', leaguePriority: 4, status: 'SCHEDULED', startTime: '2026-09-06T19:00:00Z', hasOdds: false, activity: null, state: null }, now);
  const done = interestScore({ fixtureId: 'c', leaguePriority: 1, status: 'FINISHED', startTime: '2026-09-05T15:00:00Z', hasOdds: true, activity: 1, state: null }, now);
  assert.ok(live > later);
  assert.equal(done, 0);
});

test('modo economia reduz o funil e estado avançado tem prioridade absoluta', () => {
  assert.ok(limitsForMode('ECONOMIA').maxMonitored < limitsForMode('NORMAL').maxMonitored);
  assert.ok(limitsForMode('CRITICO').maxMonitored <= limitsForMode('ECONOMIA').maxMonitored);
  const now = new Date('2026-09-05T20:00:00Z');
  const candidates = Array.from({ length: 12 }, (_, i) => ({
    fixtureId: `f${i}`,
    leaguePriority: 1,
    status: 'LIVE' as const,
    startTime: '2026-09-05T19:00:00Z',
    hasOdds: true,
    activity: 0.5,
    state: i === 11 ? ('ENTRADA_IDENTIFICADA' as const) : null,
  }));
  const tiers = assignTiers(candidates, limitsForMode('CRITICO'), now);
  assert.equal(tiers[0]!.fixtureId, 'f11');
  assert.equal(tiers[0]!.tier, 'ADVANCED');
  assert.ok(tiers.filter((t) => t.tier !== 'IGNORED').length <= limitsForMode('CRITICO').maxInteresting);
});

// ===========================================================================
group('Dicas › cache, deduplicação e quota');
// ===========================================================================
test('cache devolve o valor e deduplica chamadas simultâneas', async () => {
  const cache = new SportsCache();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { n: calls };
  };
  const [a, b, c] = await Promise.all([cache.getOrLoad('k', 60, loader), cache.getOrLoad('k', 60, loader), cache.getOrLoad('k', 60, loader)]);
  assert.equal(calls, 1);
  assert.deepEqual(a.value, b.value);
  assert.deepEqual(b.value, c.value);
  assert.equal(cache.stats.deduped, 2);
  const again = await cache.getOrLoad('k', 60, loader);
  assert.equal(again.fromCache, true);
  assert.equal(calls, 1);
});

test('cache vencido serve como fallback quando o loader falha', async () => {
  const cache = new SportsCache();
  await cache.set('k', 'velho', 1, 1000);
  const result = await cache.getOrLoad(
    'k',
    60,
    async () => {
      throw new Error('provedor fora');
    },
    { now: 1000 + 5000 },
  );
  assert.equal(result.value, 'velho');
  assert.equal(result.stale, true);
});

test('TTL cresce com o modo de economia', () => {
  assert.equal(ttlFor('odds-live', 'NORMAL'), 60);
  assert.equal(ttlFor('odds-live', 'ECONOMIA'), 180);
  assert.equal(ttlFor('odds-live', 'CRITICO'), 600);
  assert.ok(ttlFor('leagues') > ttlFor('fixtures-today'));
  assert.ok(ttlFor('fixtures-today') > ttlFor('live-statistics'));
});

test('quota: contagem local, headers do provedor e modos', async () => {
  let clock = Date.UTC(2026, 8, 5, 12);
  const quota = new ProviderQuotaManager(DEFAULT_QUOTA_LIMITS, null, () => clock);
  assert.equal((await quota.canSpend('api-football')).ok, true);
  await quota.recordRequest('api-football');
  assert.equal((await quota.snapshot(['api-football']))[0]!.remaining, 99);

  // O header do provedor corrige o restante.
  await quota.recordRequest('api-football', { remaining: 30, limit: 100 });
  assert.equal(await quota.economyMode('api-football'), 'ECONOMIA');
  assert.equal((await quota.canSpend('api-football', 1, { priority: 'LOW' })).ok, false);
  assert.equal((await quota.canSpend('api-football', 1, { priority: 'NORMAL' })).ok, true);

  await quota.recordRequest('api-football', { remaining: 5 });
  assert.equal(await quota.economyMode('api-football'), 'CRITICO');
  assert.equal((await quota.canSpend('api-football', 1, { priority: 'NORMAL' })).ok, false);
  assert.equal((await quota.canSpend('api-football', 1, { priority: 'HIGH' })).ok, true);

  await quota.recordRequest('api-football', { remaining: 0 });
  assert.equal((await quota.canSpend('api-football', 1, { priority: 'HIGH' })).status, 'EXHAUSTED');

  // Nova janela (dia seguinte) zera o contador local.
  clock += 24 * 3600 * 1000;
  assert.equal((await quota.canSpend('api-football')).ok, true);
});

test('quota: limite por minuto', async () => {
  let clock = Date.UTC(2026, 8, 5, 12);
  const quota = new ProviderQuotaManager(DEFAULT_QUOTA_LIMITS, null, () => clock);
  for (let i = 0; i < 10; i += 1) await quota.recordRequest('api-football');
  assert.match((await quota.canSpend('api-football')).reason ?? '', /minuto/);
  clock += 61_000;
  assert.equal((await quota.canSpend('api-football')).ok, true);
});

test('Odds API: custo = mercados × regiões, lido do header x-requests-last', async () => {
  const quota = new ProviderQuotaManager(DEFAULT_QUOTA_LIMITS, null, () => Date.UTC(2026, 8, 5));
  await quota.recordRequest('odds-api', { cost: 3, remaining: 497 });
  const [state] = await quota.snapshot(['odds-api']);
  assert.equal(state!.remaining, 497);
  assert.equal(state!.requestsUsed, 3);
});

test('circuit breaker abre após falhas seguidas e fecha depois do intervalo', () => {
  const circuit = new CircuitBreaker(3, 50);
  circuit.recordFailure();
  circuit.recordFailure();
  assert.equal(circuit.canRequest(), true);
  circuit.recordFailure();
  assert.equal(circuit.canRequest(), false);
  circuit.recordSuccess();
  assert.equal(circuit.canRequest(), true);
});

// ===========================================================================
group('Dicas › provedores e fallback');
// ===========================================================================
test('modo mock por padrão; live sem chave cai para o simulador; live com chave usa a API', () => {
  const deps = { fetchJson: (async () => { throw new Error('não deve chamar'); }) as FetchJson, quota: new ProviderQuotaManager(), cache: new SportsCache(), now: () => NOW };
  const mock = createProviders({ mode: undefined, apiFootballKey: undefined, sportmonksKey: undefined, oddsApiKey: undefined, oddsApiRegions: undefined }, deps);
  assert.equal(mock.mode, 'mock');
  assert.equal(mock.primary.key, 'mock');

  const fallback = createProviders({ mode: 'live', apiFootballKey: '', sportmonksKey: undefined, oddsApiKey: undefined, oddsApiRegions: undefined }, deps);
  assert.equal(fallback.usingMockFallback, true);

  const live = createProviders({ mode: 'live', apiFootballKey: 'abc', sportmonksKey: 'def', oddsApiKey: 'ghi', oddsApiRegions: undefined }, deps);
  assert.equal(live.primary.key, 'api-football');
  assert.deepEqual(live.enrichment.map((p) => p.key), ['sportmonks']);
  assert.deepEqual(live.odds.map((p) => p.key), ['odds-api', 'api-football']);
});

test('simulador é determinístico e evolui com o relógio', async () => {
  const at = (iso: string) => new MockProvider(() => new Date(iso));
  const a = await at('2026-09-05T15:00:00Z').getFixtures({ date: '2026-09-05' });
  const b = await at('2026-09-05T18:00:00Z').getFixtures({ date: '2026-09-05' });
  assert.equal(a.length, b.length);
  assert.equal(a[0]!.id, b[0]!.id);
  assert.equal(a[0]!.homeTeam.name, b[0]!.homeTeam.name);

  const live = await at('2026-09-05T15:00:00Z').getLiveFixtures();
  assert.ok(live.length > 0);
  assert.ok(live.every((f) => f.status === 'LIVE' || f.status === 'HALFTIME'));
  assert.ok(live[0]!.statistics !== null);

  const detail = await at('2026-09-05T15:00:00Z').getFixture(live[0]!.providerIds.mock!);
  assert.ok(detail!.odds!.quotes.length > 10);
  assert.ok(detail!.odds!.quotes.every((q) => q.oddMilli > 1000 && q.capturedAt));
});

test('API-Football: mapeia fixtures, estatísticas e eventos; erro no corpo vira falha', async () => {
  const body = {
    errors: {},
    response: [
      {
        fixture: { id: 123, date: '2026-09-05T20:00:00+00:00', status: { short: '2H', elapsed: 67 }, venue: { name: 'Allianz' } },
        league: { id: 71, name: 'Serie A', country: 'Brazil', round: 'Regular Season - 22' },
        teams: { home: { id: 1, name: 'Palmeiras' }, away: { id: 2, name: 'Flamengo' } },
        goals: { home: 1, away: 0 },
        score: { halftime: { home: 0, away: 0 } },
        statistics: [
          { team: { id: 1 }, statistics: [{ type: 'Total Shots', value: 11 }, { type: 'Ball Possession', value: '58%' }, { type: 'expected_goals', value: '1.32' }] },
          { team: { id: 2 }, statistics: [{ type: 'Total Shots', value: 5 }, { type: 'Corner Kicks', value: null }] },
        ],
        events: [{ time: { elapsed: 52, extra: null }, team: { id: 1 }, player: { name: 'Estêvão' }, type: 'Goal', detail: 'Normal Goal' }],
      },
    ],
  };
  const fetchJson: FetchJson = (async () => ({ status: 200, headers: new Headers({ 'x-ratelimit-requests-remaining': '87', 'x-ratelimit-requests-limit': '100' }), body })) as FetchJson;
  const quota = new ProviderQuotaManager(DEFAULT_QUOTA_LIMITS, null, () => NOW.getTime());
  const provider = new ApiFootballProvider('key', { fetchJson, quota, cache: new SportsCache(), now: () => NOW });

  const [f] = await provider.getFixturesByIds(['123']);
  assert.equal(f!.league.key, 'BRA_SERIE_A');
  assert.equal(f!.status, 'LIVE');
  assert.equal(f!.minute, 67);
  assert.equal(f!.statistics!.home.shots, 11);
  assert.equal(f!.statistics!.home.possessionBps, 5800);
  assert.equal(f!.statistics!.home.xgMilli, 1320);
  assert.equal(f!.statistics!.away.corners, null);
  assert.equal(f!.events[0]!.type, 'GOAL');
  assert.equal(f!.events[0]!.team, 'HOME');
  assert.equal((await quota.snapshot(['api-football']))[0]!.remaining, 87);

  const failing: FetchJson = (async () => ({ status: 200, headers: new Headers(), body: { errors: { rateLimit: 'Too many requests' }, response: [] } })) as FetchJson;
  const broken = new ApiFootballProvider('key', { fetchJson: failing, quota, cache: new SportsCache(), now: () => NOW });
  await assert.rejects(() => broken.getLiveFixtures(), /rateLimit/);
});

test('The Odds API: mapeia h2h, totals e btts com timestamp por casa', () => {
  const quotes = mapOddsApiEvent(
    {
      home_team: 'Palmeiras',
      away_team: 'Flamengo',
      bookmakers: [
        { key: 'pinnacle', title: 'Pinnacle', last_update: '2026-09-05T20:30:00Z', markets: [
          { key: 'h2h', outcomes: [{ name: 'Palmeiras', price: 2.1 }, { name: 'Flamengo', price: 3.4 }, { name: 'Draw', price: 3.3 }] },
          { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 2.5 }, { name: 'Under', price: 1.95, point: 2.5 }] },
          { key: 'btts', outcomes: [{ name: 'Yes', price: 1.8 }, { name: 'No', price: 2.0 }] },
        ] },
      ],
    },
    NOW.toISOString(),
  );
  assert.equal(quotes.length, 7);
  assert.equal(quotes.find((q) => q.market === 'MATCH_WINNER' && q.selection === 'HOME')!.oddMilli, 2100);
  assert.equal(quotes.find((q) => q.market === 'OVER_2_5')!.line, 2.5);
  assert.equal(quotes.find((q) => q.market === 'BTTS' && q.selection === 'YES')!.oddMilli, 1800);
  assert.ok(quotes.every((q) => q.capturedAt === '2026-09-05T20:30:00.000Z'));
});

test('camada de dados: provedor que falha não derruba a partida (fallback)', async () => {
  const exploding: FetchJson = (async () => { throw new Error('rede'); }) as FetchJson;
  const quota = new ProviderQuotaManager(DEFAULT_QUOTA_LIMITS, null, () => NOW.getTime());
  const cache = new SportsCache();
  const providers = createProviders({ mode: 'live', apiFootballKey: 'k', sportmonksKey: undefined, oddsApiKey: 'k', oddsApiRegions: undefined }, { fetchJson: exploding, quota, cache, now: () => NOW });
  const layer = new SportsDataLayer({ providers, cache, quota, mappings: new InMemoryMappingStore(), now: () => NOW });

  assert.deepEqual(await layer.getLiveFixtures(), []);
  const base = fixture({ providerIds: { 'api-football': '1' } });
  const [details] = await layer.getDetails([base], 'HIGH');
  assert.equal(details!.id, base.id); // segue com o que tinha
  assert.deepEqual(await layer.getOdds(base, 'HIGH'), []);
});

test('mesclagem de estatísticas: primário manda, enriquecimento só preenche lacunas', () => {
  const primary = { home: stats({ shots: 10, xgMilli: null }), away: stats({ shots: 3 }), source: 'api-football' as const, lastUpdated: null, confidence: 'HIGH' as const };
  const extra = { home: stats({ shots: 99, xgMilli: 800 }), away: stats({ shots: 99, corners: 4 }), source: 'sportmonks' as const, lastUpdated: null, confidence: 'HIGH' as const };
  const merged = mergeStatistics(primary, extra)!;
  assert.equal(merged.home.shots, 10);
  assert.equal(merged.home.xgMilli, 800);
  assert.equal(merged.away.corners, 4);
  assert.equal(merged.source, 'api-football');
  assert.equal(mergeStatistics(null, extra), extra);
});

// ===========================================================================
group('Dicas › avaliação, dica, performance e backtest');
// ===========================================================================
test('avaliação identifica entrada quando score e value passam juntos', () => {
  // As odds aqui precisam ser as que uma casa real ofereceria nesta situação
  // (0 x 0 aos 34', mandante pressionando). Um Over 0.5 a 1,58 não existe no
  // mercado, e o freio de plausibilidade — que compara o modelo ao consenso —
  // recusaria a diferença, mascarando o que este teste quer verificar.
  const quotes = [quote('OVER_0_5', 'OVER', 1250, 0.5), quote('OVER_1_5', 'OVER', 2400, 1.5)];
  const evaluation = evaluateFixture({ fixture: fixture(), league: LEAGUE, strategies: STRATEGIES, quotes, monitored: true, now: NOW });
  const over05 = evaluation.candidates.find((c) => c.strategyKey === 'LIVE_OVER_0_5')!;
  assert.equal(over05.applicable, true);
  assert.equal(over05.oddMilli, 1250);
  assert.ok(over05.valueBps !== null && over05.valueBps > 0);
  assert.ok(over05.score >= 70, `score ${over05.score}`);
  assert.equal(over05.state, 'ENTRADA_IDENTIFICADA');
  assert.equal(evaluation.liveState, 'OPORTUNIDADE');
  assert.ok(identifiedEntries(evaluation).length >= 1);
});

test('probabilidade alta com odd ruim NÃO vira dica', () => {
  const quotes = [quote('OVER_0_5', 'OVER', 1030, 0.5)]; // odd abaixo da justa
  const evaluation = evaluateFixture({ fixture: fixture(), league: LEAGUE, strategies: STRATEGIES, quotes, monitored: true, now: NOW });
  const over05 = evaluation.candidates.find((c) => c.strategyKey === 'LIVE_OVER_0_5')!;
  assert.ok(over05.valueBps !== null && over05.valueBps < 0);
  assert.notEqual(over05.state, 'ENTRADA_IDENTIFICADA');
  assert.equal(identifiedEntries(evaluation).some((c) => c.strategyKey === 'LIVE_OVER_0_5'), false);
});

test('sem odds a partida fica em "aguardando odd", nunca em entrada', () => {
  const evaluation = evaluateFixture({ fixture: fixture(), league: LEAGUE, strategies: STRATEGIES, quotes: [], monitored: true, now: NOW });
  assert.equal(identifiedEntries(evaluation).length, 0);
  assert.ok(evaluation.candidates.some((c) => c.state === 'ODD_AGUARDANDO' || c.state === 'POSSIVEL_OPORTUNIDADE' || c.state === 'PRESSAO_DETECTADA'));
});

test('avaliação nunca quebra sem estatística e marca componentes ausentes', () => {
  const evaluation = evaluateFixture({ fixture: fixture({ statistics: null }), league: LEAGUE, strategies: STRATEGIES, quotes: [quote('OVER_0_5', 'OVER', 1250, 0.5)], now: NOW });
  const over05 = evaluation.candidates.find((c) => c.strategyKey === 'LIVE_OVER_0_5')!;
  assert.equal(over05.applicable, true);
  assert.equal(over05.breakdown.items.find((i) => i.key === 'xg')!.available, false);
  assert.equal(over05.breakdown.items.find((i) => i.key === 'pressure')!.available, false);
  assert.ok(over05.score > 0);
});

test('lucro da dica segue a regra das entradas e performance separa acerto de rentabilidade', () => {
  assert.deepEqual(tipProfitCents('GREEN', 10_000, 1580), { profitCents: 5_800, payoutCents: 15_800 });
  assert.deepEqual(tipProfitCents('RED', 10_000, 1580), { profitCents: -10_000, payoutCents: 0 });
  assert.deepEqual(tipProfitCents('PUSH', 10_000, 1580), { profitCents: 0, payoutCents: 10_000 });

  const tips = [
    // 3 greens em odd baixa e 1 red: 75% de acerto, prejuízo.
    { market: 'OVER_0_5' as const, leagueKey: 'BRA_SERIE_A', oddMilli: 1200, score: 85, evBps: 300, result: 'GREEN' as const, stakeCents: 10_000, profitCents: 2_000 },
    { market: 'OVER_0_5' as const, leagueKey: 'BRA_SERIE_A', oddMilli: 1200, score: 85, evBps: 300, result: 'GREEN' as const, stakeCents: 10_000, profitCents: 2_000 },
    { market: 'OVER_0_5' as const, leagueKey: 'BRA_SERIE_A', oddMilli: 1200, score: 85, evBps: 300, result: 'GREEN' as const, stakeCents: 10_000, profitCents: 2_000 },
    { market: 'OVER_0_5' as const, leagueKey: 'BRA_SERIE_A', oddMilli: 1200, score: 85, evBps: 300, result: 'RED' as const, stakeCents: 10_000, profitCents: -10_000 },
    { market: 'BTTS' as const, leagueKey: 'ENG_PREMIER_LEAGUE', oddMilli: 2500, score: 72, evBps: 1200, result: 'PUSH' as const, stakeCents: 10_000, profitCents: 0 },
    { market: 'BTTS' as const, leagueKey: 'ENG_PREMIER_LEAGUE', oddMilli: 2500, score: 72, evBps: 1200, result: null, stakeCents: 10_000, profitCents: 0 },
  ];
  const m = computePerformance(tips);
  assert.equal(m.total, 6);
  assert.equal(m.settled, 5);
  assert.equal(m.pending, 1);
  assert.equal(m.winRateBps, 7500);
  assert.equal(m.profitCents, -4_000);
  assert.equal(m.turnoverCents, 40_000); // push não corre risco
  assert.equal(m.yieldBps, -1000);
  assert.equal(m.roiBps, -800); // 5 resolvidas × 10.000
  assert.equal(m.profitFactorMilli, 600);

  const breakdown = computePerformanceBreakdown(tips);
  assert.equal(breakdown.byMarket.OVER_0_5!.settled, 4);
  assert.ok(breakdown.byScoreBand['80-89']);
  assert.ok(breakdown.byOddsBand['1,20–1,49']);
  assert.equal(computePerformance([]).winRateBps, null);
});

test('backtest roda a mesma avaliação sobre snapshots e liquida com o final', () => {
  const snapshotAt = (minute: number, odd: number) => ({
    fixture: fixture({ minute }),
    quotes: [quote('OVER_0_5', 'OVER', odd, 0.5)],
    capturedAt: `2026-09-05T20:${String(minute).padStart(2, '0')}:00.000Z`,
  });
  const report = runBacktest(
    [
      {
        league: LEAGUE,
        snapshots: [snapshotAt(25, 1230), snapshotAt(30, 1250), snapshotAt(35, 1270)],
        final: fixture({ status: 'FINISHED', minute: 90, score: { home: 2, away: 1 } }),
      },
    ],
    STRATEGIES,
  );
  assert.equal(report.fixtures, 1);
  assert.equal(report.snapshotsEvaluated, 3);
  const over05 = report.tips.filter((t) => t.strategyKey === 'LIVE_OVER_0_5');
  assert.equal(over05.length, 1); // uma dica por partida/estratégia, mesmo com 3 snapshots
  assert.equal(over05[0]!.result, 'GREEN');
  assert.ok(report.performance.overall.profitCents > 0);
});

// ===========================================================================
group('Dicas › âncora de mercado');
// ===========================================================================
/**
 * Regressão do defeito mais perigoso que o modo real expôs: no pré-jogo o
 * modelo não distinguia os times, então o "value" era função apenas da odd e
 * o sistema recomendava azarão em casa de forma sistemática.
 */

/** Cotações de um confronto: 1X2 + total, como as casas publicam. */
function marketQuotes(home: number, draw: number, away: number, over = 1_900, under = 1_900): OddsQuote[] {
  return [
    quote('MATCH_WINNER', 'HOME', home),
    quote('MATCH_WINNER', 'DRAW', draw),
    quote('MATCH_WINNER', 'AWAY', away),
    quote('OVER_2_5', 'OVER', over, 2.5),
    quote('UNDER_2_5', 'UNDER', under, 2.5),
  ];
}

const PREMATCH_SIGNALS = computeSignals(
  fixture({ status: 'SCHEDULED', minute: null, statistics: null, score: { home: 0, away: 0 } }),
  null,
);

test('o total de gols é lido do mercado de Over/Under, não da média da liga', () => {
  const alto = buildMarketAnchor(marketQuotes(2_000, 3_600, 3_500, 1_500, 2_600), 2.45)!;
  const baixo = buildMarketAnchor(marketQuotes(2_000, 3_600, 3_500, 3_000, 1_400), 2.45)!;
  assert.ok(alto.lambdaTotal > 3.2, 'esperava total alto no mercado de muito gol');
  assert.ok(baixo.lambdaTotal < 2.0, 'esperava total baixo no mercado travado');
  assert.ok(alto.lambdaTotal > baixo.lambdaTotal + 1.2, 'os dois cenários têm de ficar bem separados');
});

test('a inversão de Over 2.5 para lambda reproduz a probabilidade de origem', () => {
  for (const p of [0.35, 0.5, 0.62, 0.75]) {
    const lambda = totalFromOverProbability(p);
    assert.ok(Math.abs(overTwoFiveProbability(lambda) - p) < 1e-6, 'a bisseção não convergiu');
  }
});

test('a divisão entre os lados vem do 1X2: favorito recebe mais gols esperados', () => {
  const favoritoEmCasa = buildMarketAnchor(marketQuotes(1_250, 6_500, 11_000), 2.45)!;
  const favoritoFora = buildMarketAnchor(marketQuotes(9_000, 6_000, 1_330), 2.45)!;
  assert.ok(favoritoEmCasa.lambdaHome > favoritoEmCasa.lambdaAway * 2.5, 'mandante favorito deve dominar o lambda');
  assert.ok(favoritoFora.lambdaAway > favoritoFora.lambdaHome * 2.5, 'visitante favorito deve dominar o lambda');
  assert.ok(Math.abs(favoritoEmCasa.lambdaTotal - favoritoFora.lambdaTotal) < 1e-9, 'o total não depende do 1X2');
});

test('o modelo ancorado reproduz a probabilidade justa do mercado', () => {
  for (const [h, d, a] of [[1_250, 6_500, 11_000], [2_560, 3_500, 2_700], [9_000, 6_000, 1_330]] as const) {
    const anchor = buildMarketAnchor(marketQuotes(h, d, a), 2.45)!;
    const model = buildGoalModel(PREMATCH_SIGNALS, LEAGUE, { pressureBoost: 0.4, anchor });
    const probs = matchOutcomeProbabilities(0, 0, model.lambdaHome, model.lambdaAway);
    const mercado = anchor.outcome!.homeWin;
    assert.ok(Math.abs(probs.homeWin - mercado) < 0.02, 'modelo e mercado divergiram demais');
  }
});

test('REGRESSÃO: o azarão em casa deixa de exibir value inventado', () => {
  const oddAzarao = 9_000;
  const quotes = marketQuotes(oddAzarao, 6_000, 1_330);

  const semAncora = buildGoalModel(PREMATCH_SIGNALS, LEAGUE, { pressureBoost: 0.4 });
  const pSem = matchOutcomeProbabilities(0, 0, semAncora.lambdaHome, semAncora.lambdaAway).homeWin;
  assert.ok(pSem * (oddAzarao / 1000) - 1 > 2, 'o defeito antigo produzia value acima de +200%');

  const comAncora = buildGoalModel(PREMATCH_SIGNALS, LEAGUE, {
    pressureBoost: 0.4,
    anchor: buildMarketAnchor(quotes, 2.45),
  });
  const pCom = matchOutcomeProbabilities(0, 0, comAncora.lambdaHome, comAncora.lambdaAway).homeWin;
  assert.ok(pCom * (oddAzarao / 1000) - 1 < 0.05, 'o value do azarão continua inflado');
});

test('a estimativa passa a distinguir os times do mesmo confronto invertido', () => {
  const casaForte = buildMarketAnchor(marketQuotes(1_250, 6_500, 11_000), 2.45);
  const casaFraca = buildMarketAnchor(marketQuotes(11_000, 6_500, 1_250), 2.45);
  const p = (anchor: ReturnType<typeof buildMarketAnchor>) => {
    const m = buildGoalModel(PREMATCH_SIGNALS, LEAGUE, { pressureBoost: 0.4, anchor });
    return matchOutcomeProbabilities(0, 0, m.lambdaHome, m.lambdaAway).homeWin;
  };
  assert.ok(p(casaForte) - p(casaFraca) > 0.5, 'inverter o favorito tem de inverter a estimativa');
});

test('a mediana ignora a casa fora da curva ao formar o consenso', () => {
  const quotes = [
    quote('MATCH_WINNER', 'HOME', 2_500, null, 'Bet365'),
    quote('MATCH_WINNER', 'HOME', 2_520, null, 'Pinnacle'),
    quote('MATCH_WINNER', 'HOME', 2_480, null, 'Betfair'),
    quote('MATCH_WINNER', 'HOME', 4_000, null, 'CasaComErro'),
  ];
  const consenso = consensusOddMilli(quotes, 'MATCH_WINNER', 'HOME');
  assert.ok(consenso !== null && consenso >= 2_480 && consenso <= 2_520, 'a casa fora da curva deslocou o consenso');
});

test('o value que sobra é a diferença entre a melhor casa e o consenso', () => {
  const quotes = [
    ...marketQuotes(2_500, 3_500, 2_700),
    quote('MATCH_WINNER', 'HOME', 2_520, null, 'Pinnacle'),
    quote('MATCH_WINNER', 'HOME', 2_800, null, 'CasaGenerosa'),
  ];
  const anchor = buildMarketAnchor(quotes, 2.45)!;
  const model = buildGoalModel(PREMATCH_SIGNALS, LEAGUE, { pressureBoost: 0.4, anchor });
  const p = matchOutcomeProbabilities(0, 0, model.lambdaHome, model.lambdaAway).homeWin;
  assert.ok(p * 2.5 - 1 < 0, 'apostar no preço de consenso continua sendo EV negativo');
  assert.ok(p * 2.8 - 1 > 0.03, 'a casa acima do consenso tem de gerar value positivo');
});

test('sem cotação nenhuma não há âncora, e o pré-jogo não opina', () => {
  assert.equal(buildMarketAnchor([], 2.45), null);

  const semOdds = fixture({ status: 'SCHEDULED', minute: null, statistics: null, odds: null });
  const evaluation = evaluateFixture({ fixture: semOdds, league: LEAGUE, strategies: STRATEGIES, quotes: [], now: NOW });
  const prejogo = evaluation.candidates.filter((c) =>
    ['MATCH_WINNER', 'DOUBLE_CHANCE', 'OVER_2_5', 'UNDER_2_5', 'BTTS'].includes(c.strategyKey),
  );
  assert.ok(prejogo.length > 0, 'as estratégias de pré-jogo têm de ser avaliadas');
  for (const candidato of prejogo) {
    assert.equal(candidato.applicable, false, 'uma estratégia opinou sem informação nenhuma');
  }
});

test('só o mercado de total, sem 1X2, ainda serve para os mercados de gols', () => {
  const anchor = buildMarketAnchor(
    [quote('OVER_2_5', 'OVER', 1_500, 2.5), quote('UNDER_2_5', 'UNDER', 2_600, 2.5)],
    2.45,
  )!;
  assert.equal(anchor.source, 'TOTAL');
  assert.equal(anchor.outcome, null);
  assert.ok(anchor.overTwoFive !== null && anchor.overTwoFive > 0.55);
  assert.ok(Math.abs(anchor.homeShare - 0.55) < 1e-9, 'sem 1X2 vale a vantagem genérica de mando');
});

test('ao vivo a âncora não engessa: a estatística da partida continua mandando', () => {
  const emJogo = computeSignals(fixture({ minute: 70 }), null);
  const anchor = buildMarketAnchor(marketQuotes(2_000, 3_600, 3_500, 3_000, 1_400), 2.45)!;
  const model = buildGoalModel(emJogo, LEAGUE, { pressureBoost: 0.5, anchor });
  const congelado = anchor.lambdaTotal * (emJogo.remainingMinutes / 90);
  assert.ok(model.lambdaTotal > congelado, 'o observado precisa corrigir a âncora ao vivo');
  assert.equal(model.usedMarketAnchor, true);
});

test('discordar do mercado inteiro além do teto não vira dica', () => {
  // Over 0.5 aos 34' num 0 x 0: o modelo estima ~93%. Uma casa oferecendo
  // 1,58 pagaria muito acima da odd justa, mas nenhuma casa real oferece isso
  // — a leitura provável é dado ruim, não oportunidade.
  const absurdo = evaluateFixture({
    fixture: fixture(),
    league: LEAGUE,
    strategies: STRATEGIES,
    quotes: [quote('OVER_0_5', 'OVER', 1_580, 0.5)],
    monitored: true,
    now: NOW,
  });
  const bloqueado = absurdo.candidates.find((c) => c.strategyKey === 'LIVE_OVER_0_5')!;
  assert.equal(bloqueado.applicable, false);
  assert.equal(bloqueado.valueBps, null);
  assert.notEqual(bloqueado.state, 'ENTRADA_IDENTIFICADA');
  assert.ok((bloqueado.reason ?? '').includes('discorda do mercado'));
  assert.equal(identifiedEntries(absurdo).length, 0);
});

test('o teto olha o consenso, não a melhor casa: garimpar preço continua valendo', () => {
  // Consenso em 1,25 (três casas) e uma quarta pagando 1,40. A discordância
  // contra o consenso é aceitável, então a dica sai — na melhor casa.
  const quotes = [
    quote('OVER_0_5', 'OVER', 1_250, 0.5, 'Bet365'),
    quote('OVER_0_5', 'OVER', 1_240, 0.5, 'Pinnacle'),
    quote('OVER_0_5', 'OVER', 1_260, 0.5, 'Betfair'),
    quote('OVER_0_5', 'OVER', 1_400, 0.5, 'CasaGenerosa'),
  ];
  const evaluation = evaluateFixture({ fixture: fixture(), league: LEAGUE, strategies: STRATEGIES, quotes, monitored: true, now: NOW });
  const over05 = evaluation.candidates.find((c) => c.strategyKey === 'LIVE_OVER_0_5')!;
  assert.equal(over05.applicable, true);
  assert.equal(over05.oddMilli, 1_400, 'a dica tem de apontar a melhor casa');
  assert.equal(over05.bookmaker, 'CasaGenerosa');
  assert.ok(over05.valueBps !== null && over05.valueBps > 0);
});
