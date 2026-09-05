/**
 * Modelo de gols compartilhado pelas estratégias de gols, ambas marcam,
 * próximo gol e resultado.
 *
 * Ideia: os gols restantes seguem Poisson com taxa
 *
 *   λ = taxa_base × minutos_restantes × multiplicador_de_pressão
 *
 * onde a taxa_base começa na média da competição e, conforme o jogo avança,
 * é misturada com o que a própria partida está produzindo (xG por minuto ou,
 * na falta de xG, um proxy por finalizações). Tudo tolera dado ausente: sem
 * estatística nenhuma, o modelo é só a média da liga — menos preciso, mas
 * nunca quebrado.
 */

import type { LeagueCatalogEntry } from '../../config/leagues';
import type { FixtureSignals } from '../signals';
import { ENGINE_CONFIG } from '../../config/strategy-config';

export interface GoalModel {
  /** Gols esperados restantes (total, mandante, visitante). */
  lambdaTotal: number;
  lambdaHome: number;
  lambdaAway: number;
  /** Multiplicador aplicado pela pressão (1 = neutro). */
  pressureMultiplier: number;
  /** xG (ou proxy) projetado para 90', em milli. null se não houve como estimar. */
  xgPer90Milli: number | null;
  usedXg: boolean;
  usedShotsProxy: boolean;
}

/** Proxy de xG a partir de finalizações quando o provedor não traz xG. */
function xgProxyMilli(shots: number | null, shotsOnTarget: number | null): number | null {
  if (shots === null && shotsOnTarget === null) return null;
  const sot = shotsOnTarget ?? 0;
  const off = Math.max(0, (shots ?? sot) - sot);
  return Math.round(sot * 300 + off * 70);
}

export function buildGoalModel(
  signals: FixtureSignals,
  league: LeagueCatalogEntry,
  params: { pressureBoost?: number } = {},
): GoalModel {
  const baseRatePerMinute = league.avgGoalsMilli / 1000 / ENGINE_CONFIG.regulationMinutes;
  const minute = signals.minute;

  // Taxa observada na partida (xG ou proxy), por minuto.
  let observedPerMinute: number | null = null;
  let usedXg = false;
  let usedShotsProxy = false;
  let xgPer90Milli: number | null = null;

  if (signals.isLive && minute >= 5) {
    const xg = signals.totals.xgMilli;
    const proxy = xg === null ? xgProxyMilli(signals.totals.shots, signals.totals.shotsOnTarget) : null;
    const source = xg ?? proxy;
    if (source !== null) {
      observedPerMinute = source / 1000 / minute;
      xgPer90Milli = Math.round(observedPerMinute * 1000 * ENGINE_CONFIG.regulationMinutes);
      usedXg = xg !== null;
      usedShotsProxy = xg === null;
    }
  }

  // Mistura: quanto mais jogo, mais peso para o observado (até 60%).
  const observedWeight = observedPerMinute === null ? 0 : Math.min(0.6, minute / 60);
  const ratePerMinute =
    observedPerMinute === null
      ? baseRatePerMinute
      : observedWeight * observedPerMinute + (1 - observedWeight) * baseRatePerMinute;

  // Pressão: acima de 0,45 acelera, abaixo desacelera. Limitado a [0,6; 1,8].
  const boost = params.pressureBoost ?? 0.5;
  const pressure = signals.pressureIndex;
  const rawMultiplier = pressure === null ? 1 : 1 + boost * (pressure - 0.45) * 2;
  const momentumAdjust = signals.momentum === null ? 0 : (signals.momentum - 0.5) * 0.2;
  const pressureMultiplier = Math.min(1.8, Math.max(0.6, rawMultiplier + momentumAdjust));

  const lambdaTotal = ratePerMinute * signals.remainingMinutes * pressureMultiplier;

  // Divisão entre os lados: pela dominância (ou pelo xG de cada lado); no
  // pré-jogo, vantagem de mando de ~55/45.
  let homeShare = 0.55;
  if (signals.dominance !== null) {
    homeShare = Math.min(0.8, Math.max(0.2, 0.5 + signals.dominance * 0.3));
  }
  // Um vermelho reduz a produção do lado punido.
  if ((signals.home.redCards ?? 0) > 0) homeShare = Math.max(0.2, homeShare - 0.12);
  if ((signals.away.redCards ?? 0) > 0) homeShare = Math.min(0.8, homeShare + 0.12);

  return {
    lambdaTotal,
    lambdaHome: lambdaTotal * homeShare,
    lambdaAway: lambdaTotal * (1 - homeShare),
    pressureMultiplier,
    xgPer90Milli,
    usedXg,
    usedShotsProxy,
  };
}

/** Notas 0–1 dos componentes comuns às estratégias ofensivas. */
export function offensiveComponents(
  signals: FixtureSignals,
  league: LeagueCatalogEntry,
  model: GoalModel,
  config: { minMinute: number | null; maxMinute: number | null },
): { pressure: number | null; xg: number | null; shots: number | null; context: number; other: number | null } {
  const leagueXg = league.avgGoalsMilli; // xG médio ≈ gols médios

  const xg =
    model.xgPer90Milli === null
      ? null
      : Math.min(1, model.xgPer90Milli / (leagueXg * 1.35));

  let shots: number | null = null;
  if (signals.shotsPer90 !== null || signals.shotsOnTargetPer90 !== null) {
    const shotsNote = signals.shotsPer90 === null ? null : Math.min(1, signals.shotsPer90 / 26);
    const sotNote =
      signals.shotsOnTargetPer90 === null ? null : Math.min(1, signals.shotsOnTargetPer90 / 9);
    const present = [shotsNote, sotNote].filter((v): v is number => v !== null);
    shots = present.reduce((a, b) => a + b, 0) / present.length;
  }

  // Contexto: janela de minuto ideal, jogo aberto (diferença ≤ 1), liga prioritária.
  let context = 0.5;
  if (signals.isLive) {
    const min = config.minMinute ?? 0;
    const max = config.maxMinute ?? 90;
    const span = Math.max(1, max - min);
    const position = (signals.minute - min) / span; // 0 no início da janela, 1 no fim
    context = position < 0 || position > 1 ? 0.15 : 1 - Math.abs(position - 0.45) * 0.9;
  }
  if (Math.abs(signals.goalDiff) <= 1) context += 0.15;
  else context -= 0.2;
  context += league.priority === 1 ? 0.1 : league.priority === 2 ? 0.05 : 0;
  context = Math.min(1, Math.max(0, context));

  // Outros: escanteios e expulsões costumam acompanhar jogos abertos.
  let other: number | null = null;
  const parts: number[] = [];
  if (signals.cornersPer90 !== null) parts.push(Math.min(1, signals.cornersPer90 / 12));
  if (signals.totals.redCards !== null) parts.push(signals.totals.redCards > 0 ? 0.8 : 0.4);
  if (parts.length > 0) other = parts.reduce((a, b) => a + b, 0) / parts.length;

  return { pressure: signals.pressureIndex, xg, shots, context, other };
}
