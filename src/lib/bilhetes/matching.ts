/**
 * Casamento de uma perna com a partida real (sport_fixtures).
 *
 * Reaproveita o matching do módulo de dicas (nomes canônicos, similaridade,
 * janela de horário, desambiguação). Regra: perna casada errado mostra a odd
 * de outro jogo — pior que não mostrar odd nenhuma. Por isso:
 *   - mandante E visitante precisam passar do limiar;
 *   - empate entre candidatos → não casa;
 *   - sem horário na perna, a janela é o dia inteiro, mas a confiança mínima
 *     exigida sobe.
 */

import { matchFixture, type MatchCandidate } from '@/lib/sports/domain/matching';
import type { RawLeg } from './domain/types';

export interface FixtureCandidate {
  id: string;
  homeName: string;
  awayName: string;
  startTime: string;
  leagueKey: string;
}

export interface LegMatch {
  fixtureId: string;
  confidenceBps: number;
}

const MIN_CONFIDENCE_WITH_TIME = 8_800;
const MIN_CONFIDENCE_WITHOUT_TIME = 9_200;

export function matchLeg(
  leg: Pick<RawLeg, 'homeName' | 'awayName' | 'kickoff'>,
  referenceDate: string,
  leagueKey: string | null,
  candidates: readonly FixtureCandidate[],
  aliases: Readonly<Record<string, string>> = {},
): LegMatch | null {
  const hasTime = leg.kickoff !== null;
  // Sem horário: meio-dia do dia de referência e janela de ±18 h.
  const startTime = leg.kickoff ?? `${referenceDate}T12:00:00.000Z`;
  const options: MatchCandidate[] = candidates.map((c) => ({
    providerId: c.id,
    homeName: c.homeName,
    awayName: c.awayName,
    startTime: c.startTime,
    leagueKey: c.leagueKey,
  }));

  const decision = matchFixture(
    { homeName: leg.homeName, awayName: leg.awayName, startTime, leagueKey },
    options,
    { aliases, timeWindowMinutes: hasTime ? 150 : 18 * 60, minMargin: 0.05 },
  );
  if (decision.status !== 'MATCHED' || !decision.best) return null;

  const minimum = hasTime ? MIN_CONFIDENCE_WITH_TIME : MIN_CONFIDENCE_WITHOUT_TIME;
  // Sem horário, a parte temporal da confiança não significa nada: exige nomes perfeitos.
  const names = Math.min(decision.best.homeSimilarity, decision.best.awaySimilarity);
  if (!hasTime && names < 0.95) return null;
  if (decision.best.confidenceBps < minimum && names < 0.97) return null;

  return { fixtureId: decision.best.candidate.providerId, confidenceBps: decision.best.confidenceBps };
}
