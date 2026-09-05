/**
 * Matching de partidas entre provedores.
 *
 * O mesmo jogo tem IDs diferentes em cada API. Para reconhecer que
 * "Palmeiras x Flamengo" da API-Football é o mesmo evento da Odds API, o
 * sistema combina:
 *   1. similaridade de nome do mandante E do visitante (names.ts);
 *   2. janela temporal do horário de início;
 *   3. competição, quando ambos os lados informam;
 *   4. desambiguação: só casa se o melhor candidato vence o segundo por margem.
 *
 * O resultado é gravado em `provider_mapping` uma única vez; depois disso o
 * casamento é reaproveitado — não recalculado a cada request.
 */

import { teamKey, teamSimilarity, TEAM_MATCH_THRESHOLD } from './names';

export interface MatchTarget {
  homeName: string;
  awayName: string;
  /** ISO 8601 */
  startTime: string;
  leagueKey?: string | null;
}

export interface MatchCandidate extends MatchTarget {
  /** ID no provedor de origem do candidato. */
  providerId: string;
}

export interface MatchScore {
  candidate: MatchCandidate;
  homeSimilarity: number;
  awaySimilarity: number;
  timeDiffMinutes: number;
  /** 0–10000 */
  confidenceBps: number;
}

export interface MatchOptions {
  /** Aliases persistidos (forma normalizada → chave canônica). */
  aliases?: Readonly<Record<string, string>>;
  /** Janela máxima de diferença de horário. */
  timeWindowMinutes?: number;
  /** Similaridade mínima de cada time. */
  threshold?: number;
  /** Margem mínima sobre o segundo melhor candidato. */
  minMargin?: number;
}

const DEFAULTS: Required<MatchOptions> = {
  aliases: {},
  timeWindowMinutes: 90,
  threshold: TEAM_MATCH_THRESHOLD,
  minMargin: 0.04,
};

function minutesBetween(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / 60_000;
}

/** Pontua todos os candidatos dentro da janela temporal, do melhor ao pior. */
export function scoreCandidates(
  target: MatchTarget,
  candidates: readonly MatchCandidate[],
  options: MatchOptions = {},
): MatchScore[] {
  const opts = { ...DEFAULTS, ...options };
  const scored: MatchScore[] = [];

  for (const candidate of candidates) {
    const timeDiff = minutesBetween(target.startTime, candidate.startTime);
    if (timeDiff > opts.timeWindowMinutes) continue;

    const homeSimilarity = teamSimilarity(target.homeName, candidate.homeName, opts.aliases);
    const awaySimilarity = teamSimilarity(target.awayName, candidate.awayName, opts.aliases);

    // O par precisa bater: um nome ótimo não compensa o outro ruim.
    const names = Math.min(homeSimilarity, awaySimilarity);
    const timeScore = 1 - Math.min(1, timeDiff / opts.timeWindowMinutes);
    const leagueScore =
      target.leagueKey && candidate.leagueKey
        ? target.leagueKey === candidate.leagueKey
          ? 1
          : 0
        : 0.5;

    const confidence = names * 0.8 + timeScore * 0.1 + leagueScore * 0.1;
    scored.push({
      candidate,
      homeSimilarity,
      awaySimilarity,
      timeDiffMinutes: Math.round(timeDiff),
      confidenceBps: Math.round(confidence * 10_000),
    });
  }

  return scored.sort((a, b) => b.confidenceBps - a.confidenceBps);
}

export interface MatchDecision {
  status: 'MATCHED' | 'AMBIGUOUS' | 'NONE';
  best: MatchScore | null;
  runnerUp: MatchScore | null;
}

/**
 * Decide o casamento de UMA partida. Devolve AMBIGUOUS quando dois candidatos
 * são bons demais para escolher com segurança — melhor não casar do que casar
 * errado e publicar a odd de outro jogo.
 */
export function matchFixture(
  target: MatchTarget,
  candidates: readonly MatchCandidate[],
  options: MatchOptions = {},
): MatchDecision {
  const opts = { ...DEFAULTS, ...options };
  const ranked = scoreCandidates(target, candidates, opts);
  const best = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;

  if (!best) return { status: 'NONE', best: null, runnerUp: null };
  if (best.homeSimilarity < opts.threshold || best.awaySimilarity < opts.threshold) {
    return { status: 'NONE', best, runnerUp };
  }

  if (runnerUp) {
    const margin = (best.confidenceBps - runnerUp.confidenceBps) / 10_000;
    const runnerUpAlsoGood =
      runnerUp.homeSimilarity >= opts.threshold && runnerUp.awaySimilarity >= opts.threshold;
    if (runnerUpAlsoGood && margin < opts.minMargin) {
      return { status: 'AMBIGUOUS', best, runnerUp };
    }
  }

  return { status: 'MATCHED', best, runnerUp };
}

export interface BulkMatch<T extends MatchTarget> {
  target: T;
  decision: MatchDecision;
}

/**
 * Casa várias partidas contra vários candidatos garantindo um-para-um: um
 * candidato já usado por um casamento mais confiante não é reutilizado.
 */
export function matchFixtures<T extends MatchTarget>(
  targets: readonly T[],
  candidates: readonly MatchCandidate[],
  options: MatchOptions = {},
): BulkMatch<T>[] {
  const decisions = targets.map((target) => ({
    target,
    decision: matchFixture(target, candidates, options),
  }));

  // Resolve conflitos: o casamento mais confiante fica com o candidato.
  const used = new Map<string, number>();
  const sorted = [...decisions].sort(
    (a, b) => (b.decision.best?.confidenceBps ?? 0) - (a.decision.best?.confidenceBps ?? 0),
  );
  for (const item of sorted) {
    const best = item.decision.best;
    if (item.decision.status !== 'MATCHED' || !best) continue;
    const id = best.candidate.providerId;
    const taken = used.get(id);
    if (taken !== undefined && taken >= best.confidenceBps) {
      item.decision = { status: 'AMBIGUOUS', best, runnerUp: item.decision.runnerUp };
      continue;
    }
    used.set(id, best.confidenceBps);
  }

  return decisions;
}

/**
 * Chave interna determinística da partida: data (UTC) + mandante + visitante
 * canônicos. Dois provedores que descrevem o mesmo jogo produzem a mesma
 * chave, que é o que permite persistir o casamento.
 */
export function fixtureKey(
  startTime: string,
  homeName: string,
  awayName: string,
  aliases: Readonly<Record<string, string>> = {},
): string {
  const date = startTime.slice(0, 10);
  const home = teamKey(homeName, aliases).replace(/\s+/g, '-');
  const away = teamKey(awayName, aliases).replace(/\s+/g, '-');
  return `${date}:${home}:${away}`;
}
