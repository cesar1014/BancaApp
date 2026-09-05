/**
 * Entry Score: 0–100, ponderado e tolerante a dados ausentes.
 *
 * Cada componente entrega uma nota 0–1 ou `null` quando o dado não existe
 * (ex.: a API não trouxe xG). O peso dos componentes ausentes é redistribuído
 * proporcionalmente entre os presentes — o score nunca é penalizado por um
 * provedor não fornecer uma estatística, e nunca falha por isso.
 *
 * Exemplo com os pesos padrão (pressão 25, xG 20, finalizações 15, contexto
 * 15, odd 20, outros 5) e xG ausente: os 20 pontos do xG são divididos
 * entre os outros cinco na proporção dos seus pesos.
 */

import type { ScoreBreakdown, ScoreBreakdownItem } from './models';
import { SCORE_COMPONENT_LABEL, type ScoreWeights } from '../config/strategy-config';

export type ComponentScores = Record<keyof ScoreWeights, number | null>;

export const COMPONENT_KEYS: readonly (keyof ScoreWeights)[] = [
  'pressure',
  'xg',
  'shots',
  'context',
  'oddValue',
  'other',
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function computeEntryScore(
  components: ComponentScores,
  weights: ScoreWeights,
): ScoreBreakdown {
  const available = COMPONENT_KEYS.filter(
    (key) => components[key] !== null && weights[key] > 0,
  );
  const availableWeight = available.reduce((acc, key) => acc + weights[key], 0);
  const totalWeight = COMPONENT_KEYS.reduce((acc, key) => acc + weights[key], 0);

  if (available.length === 0 || availableWeight === 0 || totalWeight === 0) {
    return {
      total: 0,
      items: COMPONENT_KEYS.map((key) => ({
        key,
        label: SCORE_COMPONENT_LABEL[key],
        points: 0,
        max: weights[key],
        available: false,
      })),
    };
  }

  // Redistribuição: o peso efetivo de cada componente presente cresce na
  // proporção do seu peso original, até somar o total (100).
  const scale = totalWeight / availableWeight;
  const items: ScoreBreakdownItem[] = [];
  let total = 0;

  for (const key of COMPONENT_KEYS) {
    const value = components[key];
    if (value === null || weights[key] <= 0) {
      items.push({ key, label: SCORE_COMPONENT_LABEL[key], points: 0, max: 0, available: false });
      continue;
    }
    const max = Math.round(weights[key] * scale * 100) / 100;
    const points = Math.round(clamp01(value) * max * 100) / 100;
    total += points;
    items.push({ key, label: SCORE_COMPONENT_LABEL[key], points, max, available: true });
  }

  return { total: Math.max(0, Math.min(100, Math.round(total))), items };
}

/** Converte value/EV em nota 0–1 para o componente "valor da odd". */
export function oddValueComponent(valueBps: number | null, minValueBps: number): number | null {
  if (valueBps === null) return null;
  // −5% → 0; no mínimo exigido → 0,5; +25% ou mais → 1.
  if (valueBps <= -500) return 0;
  if (valueBps <= minValueBps) return 0.5 * ((valueBps + 500) / (minValueBps + 500));
  return Math.min(1, 0.5 + 0.5 * ((valueBps - minValueBps) / (2_500 - minValueBps)));
}
