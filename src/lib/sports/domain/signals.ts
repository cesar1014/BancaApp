/**
 * Sinais derivados de uma partida.
 *
 * Transforma estatísticas brutas (que podem estar parcialmente ausentes) em
 * índices normalizados 0–1 que as estratégias e o score consomem. A regra de
 * ouro: dado ausente vira `null`, nunca zero — e nenhuma função aqui lança
 * erro por falta de estatística.
 */

import type { NormalizedFixture, NormalizedStatistics, TeamStatistics } from './models';
import { ENGINE_CONFIG } from '../config/strategy-config';

export interface TeamSignals {
  /** Índice de pressão 0–1 (null se nenhum dado disponível). */
  pressure: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  xgMilli: number | null;
  corners: number | null;
  cards: number | null;
  redCards: number | null;
  dangerousAttacks: number | null;
  possessionBps: number | null;
}

export interface FixtureTotals {
  shots: number | null;
  shotsOnTarget: number | null;
  xgMilli: number | null;
  corners: number | null;
  cards: number | null;
  redCards: number | null;
  dangerousAttacks: number | null;
  fouls: number | null;
}

export interface FixtureSignals {
  /** Minuto efetivo usado nos cálculos (0 no pré-jogo). */
  minute: number;
  isLive: boolean;
  /** Minutos restantes estimados (regulamentares + acréscimos esperados). */
  remainingMinutes: number;
  totalGoals: number;
  /** Placar mandante − visitante. */
  goalDiff: number;
  home: TeamSignals;
  away: TeamSignals;
  totals: FixtureTotals;
  /** Pressão geral do jogo 0–1 (ritmo ofensivo somado). */
  pressureIndex: number | null;
  /** −1 (visitante domina) … +1 (mandante domina). */
  dominance: number | null;
  /** Ritmo recente comparado ao ritmo médio do jogo: 0,5 = igual, 1 = muito acima. */
  momentum: number | null;
  /** Ritmo de finalizações projetado para 90 min. */
  shotsPer90: number | null;
  shotsOnTargetPer90: number | null;
  xgPer90Milli: number | null;
  cornersPer90: number | null;
  cardsPer90: number | null;
  availability: {
    statistics: boolean;
    xg: boolean;
    shots: boolean;
    corners: boolean;
    cards: boolean;
    possession: boolean;
    dangerousAttacks: boolean;
  };
}

/** Referências "alto" por minuto para normalizar cada métrica em 0–1. */
const PER_MINUTE_REFERENCE = {
  dangerousAttacks: 1.1,
  shots: 0.2,
  shotsOnTarget: 0.075,
  corners: 0.12,
  xgMilli: 22, // 0,022 xG/min ≈ 2 xG em 90'
} as const;

function sum(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function ratio(value: number | null, minutes: number, reference: number): number | null {
  if (value === null || minutes <= 0) return null;
  return Math.min(1, value / minutes / reference);
}

function average(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((acc, value) => acc + value, 0) / present.length;
}

function teamSignals(stats: TeamStatistics | null, minutes: number): TeamSignals {
  if (!stats) {
    return {
      pressure: null,
      shots: null,
      shotsOnTarget: null,
      xgMilli: null,
      corners: null,
      cards: null,
      redCards: null,
      dangerousAttacks: null,
      possessionBps: null,
    };
  }

  const effectiveMinutes = Math.max(minutes, 1);
  const cards = sum(stats.yellowCards, stats.redCards);

  // Pressão: média dos indicadores disponíveis, cada um normalizado 0–1.
  const pressure = average([
    ratio(stats.dangerousAttacks, effectiveMinutes, PER_MINUTE_REFERENCE.dangerousAttacks),
    ratio(stats.shots, effectiveMinutes, PER_MINUTE_REFERENCE.shots),
    ratio(stats.shotsOnTarget, effectiveMinutes, PER_MINUTE_REFERENCE.shotsOnTarget),
    ratio(stats.corners, effectiveMinutes, PER_MINUTE_REFERENCE.corners),
    ratio(stats.xgMilli, effectiveMinutes, PER_MINUTE_REFERENCE.xgMilli),
    stats.possessionBps === null ? null : Math.min(1, stats.possessionBps / 7_000),
  ]);

  return {
    pressure,
    shots: stats.shots,
    shotsOnTarget: stats.shotsOnTarget,
    xgMilli: stats.xgMilli,
    corners: stats.corners,
    cards,
    redCards: stats.redCards,
    dangerousAttacks: stats.dangerousAttacks,
    possessionBps: stats.possessionBps,
  };
}

function per90(value: number | null, minutes: number): number | null {
  if (value === null || minutes <= 0) return null;
  return (value / minutes) * 90;
}

/** Ritmo recente: compara o que aconteceu desde o snapshot anterior com o ritmo médio. */
function computeMomentum(
  current: NormalizedStatistics | null,
  previous: { minute: number; statistics: NormalizedStatistics | null } | null,
  minute: number,
): number | null {
  if (!current || !previous || !previous.statistics) return null;
  const elapsed = minute - previous.minute;
  if (elapsed < 3 || minute <= 0) return null;

  const activity = (stats: NormalizedStatistics): number | null => {
    const parts = [
      sum(stats.home.shots, stats.away.shots),
      sum(stats.home.corners, stats.away.corners),
      (() => {
        const da = sum(stats.home.dangerousAttacks, stats.away.dangerousAttacks);
        return da === null ? null : da / 5;
      })(),
    ];
    return parts.every((part) => part === null) ? null : parts.reduce<number>((acc, p) => acc + (p ?? 0), 0);
  };

  const now = activity(current);
  const before = activity(previous.statistics);
  if (now === null || before === null) return null;

  const recentRate = (now - before) / elapsed;
  const averageRate = now / minute;
  if (averageRate <= 0) return recentRate > 0 ? 1 : 0.5;
  // 0,5 = mesmo ritmo; 1 = ritmo dobrado ou mais; 0 = parou.
  return Math.max(0, Math.min(1, recentRate / averageRate / 2));
}

export function computeSignals(
  fixture: NormalizedFixture,
  previous: { minute: number; statistics: NormalizedStatistics | null } | null = null,
): FixtureSignals {
  const isLive = fixture.status === 'LIVE' || fixture.status === 'HALFTIME';
  const minute = isLive ? Math.max(0, fixture.minute ?? 0) : fixture.status === 'FINISHED' ? 90 : 0;
  const remainingMinutes = Math.max(
    0,
    ENGINE_CONFIG.regulationMinutes + ENGINE_CONFIG.stoppageMinutes - minute,
  );

  const stats = fixture.statistics;
  const home = teamSignals(stats?.home ?? null, minute);
  const away = teamSignals(stats?.away ?? null, minute);

  const totals: FixtureTotals = {
    shots: sum(home.shots, away.shots),
    shotsOnTarget: sum(home.shotsOnTarget, away.shotsOnTarget),
    xgMilli: sum(home.xgMilli, away.xgMilli),
    corners: sum(home.corners, away.corners),
    cards: sum(home.cards, away.cards),
    redCards: sum(home.redCards, away.redCards),
    dangerousAttacks: sum(home.dangerousAttacks, away.dangerousAttacks),
    fouls: sum(stats?.home.fouls ?? null, stats?.away.fouls ?? null),
  };

  // Pressão geral: soma dos dois lados (um jogo aberto tem pressão dos dois).
  const pressureIndex =
    home.pressure === null && away.pressure === null
      ? null
      : Math.min(1, ((home.pressure ?? 0) + (away.pressure ?? 0)) * 0.7);

  let dominance: number | null = null;
  if (home.pressure !== null && away.pressure !== null) {
    const total = home.pressure + away.pressure;
    dominance = total === 0 ? 0 : (home.pressure - away.pressure) / total;
  } else if (home.xgMilli !== null && away.xgMilli !== null && home.xgMilli + away.xgMilli > 0) {
    dominance = (home.xgMilli - away.xgMilli) / (home.xgMilli + away.xgMilli);
  }

  const effectiveMinutes = Math.max(minute, 1);

  return {
    minute,
    isLive,
    remainingMinutes,
    totalGoals: fixture.score.home + fixture.score.away,
    goalDiff: fixture.score.home - fixture.score.away,
    home,
    away,
    totals,
    pressureIndex,
    dominance,
    momentum: computeMomentum(stats, previous, minute),
    shotsPer90: isLive ? per90(totals.shots, effectiveMinutes) : null,
    shotsOnTargetPer90: isLive ? per90(totals.shotsOnTarget, effectiveMinutes) : null,
    xgPer90Milli: isLive ? per90(totals.xgMilli, effectiveMinutes) : null,
    cornersPer90: isLive ? per90(totals.corners, effectiveMinutes) : null,
    cardsPer90: isLive ? per90(totals.cards, effectiveMinutes) : null,
    availability: {
      statistics: stats !== null,
      xg: totals.xgMilli !== null,
      shots: totals.shots !== null,
      corners: totals.corners !== null,
      cards: totals.cards !== null,
      possession: home.possessionBps !== null,
      dangerousAttacks: totals.dangerousAttacks !== null,
    },
  };
}
