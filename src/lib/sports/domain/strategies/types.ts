/**
 * Contrato de um Strategy Module.
 *
 * Cada mercado tem o seu módulo. Ele recebe a partida + sinais + configuração
 * e devolve, para cada seleção candidata, uma probabilidade estimada e as
 * notas dos componentes do score. O motor (evaluate.ts) faz o resto: busca a
 * odd, calcula value/EV, pontua e decide o estado.
 *
 * Um módulo NUNCA lança por falta de dado: devolve `applicable: false` com o
 * motivo, ou estima com o que houver (componente ausente = null).
 */

import type { LeagueCatalogEntry } from '../../config/leagues';
import type { StrategyConfig } from '../../config/strategy-config';
import type {
  MarketKey,
  NormalizedFixture,
  NormalizedPrediction,
  Selection,
  TipResult,
} from '../models';
import type { MarketAnchor } from '../market-anchor';
import type { ComponentScores } from '../scoring';
import type { FixtureSignals } from '../signals';

export interface StrategyContext {
  fixture: NormalizedFixture;
  signals: FixtureSignals;
  league: LeagueCatalogEntry;
  prediction: NormalizedPrediction | null;
  /**
   * Força dos times lida do preço de mercado. null quando não há cotação de
   * 1X2 nem de total — nesse caso o modelo não tem como distinguir os times,
   * e no pré-jogo cada estratégia decide se ainda faz sentido opinar.
   */
  anchor: MarketAnchor | null;
  config: StrategyConfig;
  now: Date;
}

export interface StrategyEstimate {
  selection: Selection;
  line: number | null;
  probabilityBps: number;
  /** Notas 0–1 (ou null) de tudo exceto oddValue, que o motor calcula. */
  components: Omit<ComponentScores, 'oddValue'>;
  /** Frases curtas que a interface mostra como justificativa. */
  rationale: string[];
  applicable: boolean;
  reason?: string;
}

export interface SettleInput {
  market: MarketKey;
  selection: Selection;
  line: number | null;
  /** Minuto em que a dica foi dada (para "próximo gol"). */
  minuteAt: number | null;
  scoreAt: { home: number; away: number };
}

export interface StrategyModule {
  key: string;
  market: MarketKey;
  estimate(context: StrategyContext): StrategyEstimate[];
  /** null = ainda não dá para resolver (partida não terminou ou dado ausente). */
  settle(input: SettleInput, finalFixture: NormalizedFixture): TipResult | null;
}

export function notApplicable(selection: Selection, reason: string): StrategyEstimate {
  return {
    selection,
    line: null,
    probabilityBps: 0,
    components: { pressure: null, xg: null, shots: null, context: null, other: null },
    rationale: [],
    applicable: false,
    reason,
  };
}

export function toBps(probability: number): number {
  if (!Number.isFinite(probability)) return 0;
  return Math.round(Math.min(1, Math.max(0, probability)) * 10_000);
}
