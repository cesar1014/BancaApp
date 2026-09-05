/**
 * Máquina de estados da análise de uma partida/estratégia.
 *
 *   OBSERVANDO → MONITORANDO → PRESSÃO DETECTADA → POSSÍVEL OPORTUNIDADE
 *     → ODD AGUARDANDO → VALUE CONFIRMADO → ENTRADA IDENTIFICADA
 *   e, se as condições piorarem, DESCARTADA. Partida terminada → ENCERRADA.
 *
 * Há histerese: uma entrada identificada não some porque o score oscilou um
 * ponto abaixo do mínimo; ela só é descartada quando cai claramente.
 */

import type { AnalysisState, FixtureStatus, LiveDisplayState, TipConfidence } from './models';
import { ENGINE_CONFIG, type StrategyThresholds } from '../config/strategy-config';

export interface StateInput {
  previous: AnalysisState | null;
  status: FixtureStatus;
  /** Partida está no grupo monitorado do funil. */
  monitored: boolean;
  score: number;
  /** null quando não há odd disponível. */
  valueBps: number | null;
  oddInRange: boolean;
  thresholds: StrategyThresholds;
}

const RANK: Record<AnalysisState, number> = {
  DESCARTADA: -1,
  ENCERRADA: -2,
  OBSERVANDO: 0,
  MONITORANDO: 1,
  PRESSAO_DETECTADA: 2,
  POSSIVEL_OPORTUNIDADE: 3,
  ODD_AGUARDANDO: 4,
  VALUE_CONFIRMADO: 5,
  ENTRADA_IDENTIFICADA: 6,
};

export function stateRank(state: AnalysisState): number {
  return RANK[state];
}

export function nextAnalysisState(input: StateInput): AnalysisState {
  const { previous, status, monitored, score, valueBps, oddInRange, thresholds } = input;

  if (status === 'FINISHED' || status === 'CANCELLED' || status === 'POSTPONED') return 'ENCERRADA';

  const hasOdds = valueBps !== null;
  const valueOk = hasOdds && valueBps >= thresholds.minValueBps && oddInRange;
  const wasAdvanced = previous !== null && RANK[previous] >= RANK.POSSIVEL_OPORTUNIDADE;

  // Queda clara depois de ter avançado: descarta (com histerese).
  if (wasAdvanced && score < thresholds.candidateScore - thresholds.discardHysteresis) {
    return 'DESCARTADA';
  }
  if (previous === 'ENTRADA_IDENTIFICADA' || previous === 'VALUE_CONFIRMADO') {
    // Mantém o estado enquanto estiver perto do mínimo e o value não virou negativo.
    if (score >= thresholds.minScore - thresholds.discardHysteresis && hasOdds && valueBps >= 0 && oddInRange) {
      return previous;
    }
  }

  if (score >= thresholds.minScore) {
    if (valueOk) return 'ENTRADA_IDENTIFICADA';
    return 'ODD_AGUARDANDO';
  }
  if (score >= thresholds.candidateScore) {
    if (valueOk) return 'VALUE_CONFIRMADO';
    return 'POSSIVEL_OPORTUNIDADE';
  }
  if (score >= thresholds.pressureScore) return 'PRESSAO_DETECTADA';

  // Já tinha sido descartada e continua fraca: permanece descartada.
  if (previous === 'DESCARTADA') return 'DESCARTADA';
  return monitored ? 'MONITORANDO' : 'OBSERVANDO';
}

/** Estado visual da aba "Ao vivo" a partir do melhor estado entre as estratégias. */
export function liveDisplayState(best: AnalysisState | null, status: FixtureStatus): LiveDisplayState {
  if (status === 'FINISHED' || status === 'CANCELLED' || status === 'POSTPONED') return 'ENCERRADA';
  switch (best) {
    case 'ENTRADA_IDENTIFICADA':
    case 'VALUE_CONFIRMADO':
      return 'OPORTUNIDADE';
    case 'ODD_AGUARDANDO':
    case 'POSSIVEL_OPORTUNIDADE':
      return 'QUASE_ENTRADA';
    case 'PRESSAO_DETECTADA':
      return 'ATENCAO';
    case 'MONITORANDO':
      return 'MONITORANDO';
    default:
      return 'NORMAL';
  }
}

export function confidenceFromScore(score: number): TipConfidence {
  if (score >= ENGINE_CONFIG.confidence.alta) return 'ALTA';
  if (score >= ENGINE_CONFIG.confidence.media) return 'MEDIA';
  return 'BAIXA';
}

/** Melhor (mais avançado) de uma lista de estados. */
export function bestState(states: readonly AnalysisState[]): AnalysisState | null {
  let best: AnalysisState | null = null;
  for (const state of states) {
    if (best === null || RANK[state] > RANK[best]) best = state;
  }
  return best;
}
