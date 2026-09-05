/**
 * Funil de filtragem: decide quais partidas merecem gastar quota.
 *
 *   Todos os jogos → interessantes → monitorados → análise avançada
 *
 * O score de interesse combina prioridade da liga, se está ao vivo, se o
 * início está próximo, se há odds e a atividade observada. Partidas que já
 * avançaram na análise têm prioridade absoluta: quando a quota aperta, o
 * sistema prefere atualizar uma entrada identificada a olhar um jogo novo.
 */

import type { AnalysisState, FixtureStatus } from './models';
import { stateRank } from './analysis-state';
import { ENGINE_CONFIG, INTEREST_WEIGHTS } from '../config/strategy-config';
import type { EconomyMode } from '../config/cache-policy';

export type FunnelTier = 'IGNORED' | 'INTERESTING' | 'MONITORED' | 'ADVANCED';

export interface FunnelCandidate {
  fixtureId: string;
  leaguePriority: number;
  status: FixtureStatus;
  /** ISO 8601 */
  startTime: string;
  hasOdds: boolean;
  /** 0–1 ou null quando não há estatística. */
  activity: number | null;
  state: AnalysisState | null;
}

export function interestScore(candidate: FunnelCandidate, now: Date): number {
  const w = INTEREST_WEIGHTS;
  let score = 0;

  // Liga: prioridade 1 vale tudo, 5 vale quase nada.
  score += w.leaguePriority * Math.max(0, (6 - Math.min(5, candidate.leaguePriority)) / 5);

  const live = candidate.status === 'LIVE' || candidate.status === 'HALFTIME';
  if (live) score += w.isLive;

  const minutesToKickoff = (new Date(candidate.startTime).getTime() - now.getTime()) / 60_000;
  if (!live && candidate.status === 'SCHEDULED') {
    if (minutesToKickoff <= 0) score += w.kickoffSoon;
    else if (minutesToKickoff <= 120) score += w.kickoffSoon * (1 - minutesToKickoff / 120);
  }

  if (candidate.hasOdds) score += w.hasOdds;
  if (candidate.activity !== null) score += w.activity * candidate.activity;

  if (candidate.status === 'FINISHED' || candidate.status === 'CANCELLED' || candidate.status === 'POSTPONED') {
    return 0;
  }
  return Math.round(Math.min(100, score));
}

export interface FunnelLimits {
  maxInteresting: number;
  maxMonitored: number;
  maxAdvanced: number;
}

export function limitsForMode(mode: EconomyMode): FunnelLimits {
  const base = ENGINE_CONFIG.funnel;
  const factor = mode === 'NORMAL' ? 1 : mode === 'ECONOMIA' ? 0.5 : 0.25;
  return {
    maxInteresting: Math.max(2, Math.round(base.maxInteresting * factor)),
    maxMonitored: Math.max(1, Math.round(base.maxMonitored * factor)),
    maxAdvanced: Math.max(1, Math.round(base.maxAdvanced * factor)),
  };
}

export interface FunnelAssignment {
  fixtureId: string;
  tier: FunnelTier;
  interest: number;
}

/**
 * Ordena por (estado da análise, interesse) e distribui os níveis do funil.
 * Devolve a lista ordenada — quem chamou pode usar a ordem como prioridade
 * de atualização.
 */
export function assignTiers(
  candidates: readonly FunnelCandidate[],
  limits: FunnelLimits,
  now: Date = new Date(),
): FunnelAssignment[] {
  const scored = candidates.map((candidate) => ({
    candidate,
    interest: interestScore(candidate, now),
    rank: candidate.state ? stateRank(candidate.state) : 0,
  }));

  scored.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return b.interest - a.interest;
  });

  return scored.map((item, index) => {
    let tier: FunnelTier = 'IGNORED';
    const live = item.candidate.status === 'LIVE' || item.candidate.status === 'HALFTIME';
    if (item.interest > 0 || item.rank > 0) {
      if (index < limits.maxAdvanced && (live || item.rank >= 3)) tier = 'ADVANCED';
      else if (index < limits.maxMonitored) tier = 'MONITORED';
      else if (index < limits.maxInteresting) tier = 'INTERESTING';
    }
    return { fixtureId: item.candidate.fixtureId, tier, interest: item.interest };
  });
}
