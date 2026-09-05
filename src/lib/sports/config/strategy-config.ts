/**
 * CONFIGURAÇÃO CENTRAL DO MOTOR DE ANÁLISE.
 *
 * Todos os pesos, limiares e parâmetros das estratégias vivem aqui. Para
 * ajustar o comportamento do sistema, edite este arquivo — nenhuma regra fica
 * espalhada por outros módulos. O banco (`bet_strategies.config`) pode
 * sobrepor estes valores em runtime; o merge é feito em engine.ts.
 */

import type { MarketKey, Selection } from '../domain/models';

// ---------------------------------------------------------------------------
// Pesos do Entry Score (somam 100)
// ---------------------------------------------------------------------------
export interface ScoreWeights {
  /** Pressão ofensiva / momentum (posse, ataques perigosos, ritmo recente). */
  pressure: number;
  /** Expected goals (quando disponível). */
  xg: number;
  /** Finalizações e finalizações no alvo. */
  shots: number;
  /** Contexto: minuto, placar, força dos times, histórico. */
  context: number;
  /** Valor da odd (EV) e movimentação. */
  oddValue: number;
  /** Outros sinais: escanteios, cartões, expulsões. */
  other: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  pressure: 25,
  xg: 20,
  shots: 15,
  context: 15,
  oddValue: 20,
  other: 5,
};

export const SCORE_COMPONENT_LABEL: Record<keyof ScoreWeights, string> = {
  pressure: 'Pressão',
  xg: 'xG',
  shots: 'Finalizações',
  context: 'Contexto',
  oddValue: 'Valor da odd',
  other: 'Outros',
};

// ---------------------------------------------------------------------------
// Limiares por estratégia
// ---------------------------------------------------------------------------
export interface StrategyThresholds {
  /** Score mínimo (0–100) para virar dica. */
  minScore: number;
  /** Value/EV mínimo em bps para virar dica. */
  minValueBps: number;
  /**
   * Teto de discordância com o mercado, em bps, medido contra o preço de
   * CONSENSO (mediana das casas), não contra a melhor casa.
   *
   * Serve de freio de sanidade. Quando o modelo enxerga muito mais valor do
   * que o mercado inteiro, a explicação provável não é que todas as casas
   * erraram: é que uma estatística chegou torta, um placar está defasado ou a
   * estratégia está mal calibrada para aquela situação. Acima deste teto o
   * sistema prefere não indicar nada a indicar com confiança algo que não
   * consegue sustentar. O value legítimo — a melhor casa contra o consenso —
   * é de poucos pontos percentuais e passa longe daqui.
   */
  maxConsensusValueBps: number;
  /** Odd mínima e máxima aceitas (milli). */
  minOddMilli: number;
  maxOddMilli: number;
  /** Janela de minuto da partida (ao vivo). null = pré-jogo também. */
  minMinute: number | null;
  maxMinute: number | null;
  /** Sinais mínimos — só cobrados quando o dado existe. */
  minShots: number;
  minShotsOnTarget: number;
  minXgMilli: number;
  /** Probabilidade mínima estimada (bps). */
  minProbabilityBps: number;
  /** Score a partir do qual a partida vira "pressão detectada" / "possível". */
  pressureScore: number;
  candidateScore: number;
  /** Histerese: a dica só é descartada se cair abaixo de minScore − este valor. */
  discardHysteresis: number;
}

export interface StrategyConfig {
  key: string;
  name: string;
  market: MarketKey;
  /** Seleções que a estratégia pode sugerir. */
  selections: readonly Selection[];
  /** Linha do mercado quando fixa (2.5 gols). */
  line: number | null;
  /** Ao vivo, pré-jogo ou ambos. */
  scope: 'LIVE' | 'PREMATCH' | 'BOTH';
  enabled: boolean;
  weights: ScoreWeights;
  thresholds: StrategyThresholds;
  /** Parâmetros numéricos específicos (documentados em cada estratégia). */
  params: Record<string, number>;
}

const BASE_THRESHOLDS: StrategyThresholds = {
  minScore: 70,
  minValueBps: 500, // +5%
  maxConsensusValueBps: 2_000, // +20% contra o consenso já é sinal de erro, não de oportunidade
  minOddMilli: 1_250,
  maxOddMilli: 4_000,
  minMinute: 10,
  maxMinute: 82,
  minShots: 6,
  minShotsOnTarget: 2,
  minXgMilli: 600,
  minProbabilityBps: 4_500,
  pressureScore: 50,
  candidateScore: 62,
  discardHysteresis: 8,
};

function strategy(
  key: string,
  name: string,
  market: MarketKey,
  selections: readonly Selection[],
  line: number | null,
  scope: StrategyConfig['scope'],
  overrides: Partial<StrategyThresholds> = {},
  params: Record<string, number> = {},
  weights: Partial<ScoreWeights> = {},
  enabled = true,
): StrategyConfig {
  return {
    key,
    name,
    market,
    selections,
    line,
    scope,
    enabled,
    weights: { ...DEFAULT_SCORE_WEIGHTS, ...weights },
    thresholds: { ...BASE_THRESHOLDS, ...overrides },
    params,
  };
}

/**
 * Estratégias iniciais. Os parâmetros de gols seguem um modelo de Poisson
 * simples: taxa esperada de gols nos minutos restantes, ajustada por pressão,
 * xG e placar. Ver domain/strategies/goals.ts.
 */
export const STRATEGY_CONFIGS: readonly StrategyConfig[] = [
  strategy('LIVE_OVER_0_5', 'Over 0.5 gols (ao vivo)', 'OVER_0_5', ['OVER'], 0.5, 'LIVE',
    { minMinute: 20, maxMinute: 80, minOddMilli: 1_200, maxOddMilli: 3_000, minProbabilityBps: 5_500 },
    { pressureBoost: 0.55, xgBoost: 0.5, shotsBoost: 0.35 }),

  strategy('LIVE_OVER_1_5', 'Over 1.5 gols (ao vivo)', 'OVER_1_5', ['OVER'], 1.5, 'LIVE',
    { minMinute: 15, maxMinute: 75, minOddMilli: 1_250, maxOddMilli: 3_200 },
    { pressureBoost: 0.5, xgBoost: 0.5, shotsBoost: 0.3 }),

  strategy('OVER_2_5', 'Over 2.5 gols', 'OVER_2_5', ['OVER'], 2.5, 'BOTH',
    { minMinute: null, maxMinute: 70, minOddMilli: 1_400, maxOddMilli: 3_500, minScore: 68 },
    { pressureBoost: 0.45, xgBoost: 0.5, shotsBoost: 0.3 }),

  strategy('UNDER_2_5', 'Under 2.5 gols', 'UNDER_2_5', ['UNDER'], 2.5, 'BOTH',
    { minMinute: null, maxMinute: 75, minOddMilli: 1_350, maxOddMilli: 3_000, minShots: 0, minShotsOnTarget: 0, minXgMilli: 0 },
    { lowTempoBonus: 0.3 }),

  strategy('BTTS', 'Ambas marcam', 'BTTS', ['YES'], null, 'BOTH',
    { minMinute: null, maxMinute: 70, minOddMilli: 1_400, maxOddMilli: 3_200 },
    { balanceBonus: 0.35 }),

  strategy('LIVE_NEXT_GOAL', 'Próximo gol (ao vivo)', 'NEXT_GOAL', ['HOME', 'AWAY'], null, 'LIVE',
    { minMinute: 15, maxMinute: 80, minOddMilli: 1_400, maxOddMilli: 3_500, minScore: 72, minValueBps: 600 },
    { dominanceThreshold: 0.62 }),

  strategy('MATCH_WINNER', 'Resultado da partida', 'MATCH_WINNER', ['HOME', 'AWAY'], null, 'BOTH',
    { minMinute: null, maxMinute: 70, minOddMilli: 1_500, maxOddMilli: 4_500, minScore: 72, minShots: 0, minShotsOnTarget: 0, minXgMilli: 0 },
    { strengthWeight: 0.6 }),

  strategy('DOUBLE_CHANCE', 'Dupla chance', 'DOUBLE_CHANCE', ['1X', 'X2'], null, 'BOTH',
    { minMinute: null, maxMinute: 75, minOddMilli: 1_250, maxOddMilli: 2_200, minShots: 0, minShotsOnTarget: 0, minXgMilli: 0, minProbabilityBps: 6_000 },
    { strengthWeight: 0.6 }),

  strategy('LIVE_CORNERS', 'Escanteios (ao vivo)', 'CORNERS', ['OVER'], null, 'LIVE',
    { minMinute: 20, maxMinute: 80, minOddMilli: 1_500, maxOddMilli: 3_000, minShots: 0, minShotsOnTarget: 0, minXgMilli: 0, minScore: 68 },
    { cornerPaceWeight: 0.7 }, { pressure: 30, xg: 5, shots: 20, context: 15, oddValue: 20, other: 10 }),

  strategy('LIVE_CARDS', 'Cartões (ao vivo)', 'CARDS', ['OVER'], null, 'LIVE',
    { minMinute: 25, maxMinute: 80, minOddMilli: 1_500, maxOddMilli: 3_000, minShots: 0, minShotsOnTarget: 0, minXgMilli: 0, minScore: 68 },
    { cardPaceWeight: 0.7, foulsWeight: 0.3 }, { pressure: 10, xg: 0, shots: 5, context: 30, oddValue: 25, other: 30 }),
];

export function findStrategyConfig(key: string): StrategyConfig | null {
  return STRATEGY_CONFIGS.find((config) => config.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// Parâmetros gerais do motor
// ---------------------------------------------------------------------------
export const ENGINE_CONFIG = {
  /** Funil: quantas partidas em cada estágio (por ciclo). */
  funnel: {
    maxInteresting: 20,
    maxMonitored: 8,
    maxAdvanced: 4,
  },
  /** Snapshots ao vivo: um a cada N minutos de jogo. */
  snapshotEveryMinutes: 5,
  /** Máximo de snapshots por partida (controle de armazenamento). */
  maxSnapshotsPerFixture: 24,
  /** Stake de referência usada no histórico das dicas (R$ 100,00). */
  referenceStakeCents: 10_000,
  /** Score → nível de confiança. */
  confidence: { alta: 82, media: 70 },
  /** Score → estado visual ao vivo. */
  liveDisplay: { atencao: 50, quaseEntrada: 62 },
  /** Dica expira se a partida passar deste minuto sem resolução do mercado. */
  expireAfterMinute: 90,
  /** Minutos totais de jogo considerados (sem acréscimos). */
  regulationMinutes: 90,
  /** Fator de "tempo útil" dos acréscimos (~4 min esperados). */
  stoppageMinutes: 4,
} as const;

/** Interesse pré-filtro: pesos do score que decide quem entra no funil. */
export const INTEREST_WEIGHTS = {
  leaguePriority: 35,
  isLive: 25,
  kickoffSoon: 15,
  hasOdds: 15,
  activity: 10,
} as const;
