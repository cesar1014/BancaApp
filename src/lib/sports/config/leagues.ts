/**
 * Catálogo de competições acompanhadas.
 *
 * Os IDs de cada provedor vêm da documentação pública deles e são usados para
 * (a) filtrar o que vale a pena buscar e (b) ancorar o matching entre APIs.
 * Prioridade 1 = entra primeiro no funil quando a quota aperta.
 *
 * Plano gratuito do Sportmonks: cobre apenas a Superliga dinamarquesa (271) e
 * a Scottish Premiership (501). As demais ficam como null e o sistema segue
 * sem enriquecimento nelas.
 */

import type { NormalizedLeague } from '../domain/models';

export interface LeagueCatalogEntry extends NormalizedLeague {
  /** sport_key da The Odds API. */
  oddsApiKey: string | null;
  /** Média histórica de gols por partida × 1000 (base do modelo de gols). */
  avgGoalsMilli: number;
  /** Média de escanteios por partida × 1000. */
  avgCornersMilli: number;
  /** Média de cartões (amarelos + vermelhos) por partida × 1000. */
  avgCardsMilli: number;
}

const SEASON = new Date().getUTCFullYear();

function entry(
  key: string,
  name: string,
  country: string,
  priority: number,
  ids: { apiFootball: number | null; sportmonks: number | null; oddsApi: string | null },
  averages: { goals: number; corners: number; cards: number },
  season: number = SEASON,
): LeagueCatalogEntry {
  return {
    key,
    name,
    country,
    season,
    priority,
    providerIds: {
      ...(ids.apiFootball !== null ? { 'api-football': String(ids.apiFootball) } : {}),
      ...(ids.sportmonks !== null ? { sportmonks: String(ids.sportmonks) } : {}),
      ...(ids.oddsApi !== null ? { 'odds-api': ids.oddsApi } : {}),
    },
    oddsApiKey: ids.oddsApi,
    avgGoalsMilli: Math.round(averages.goals * 1000),
    avgCornersMilli: Math.round(averages.corners * 1000),
    avgCardsMilli: Math.round(averages.cards * 1000),
  };
}

export const LEAGUE_CATALOG: readonly LeagueCatalogEntry[] = [
  entry('BRA_SERIE_A', 'Brasileirão Série A', 'Brasil', 1, { apiFootball: 71, sportmonks: null, oddsApi: 'soccer_brazil_campeonato' }, { goals: 2.45, corners: 9.8, cards: 5.4 }),
  entry('BRA_SERIE_B', 'Brasileirão Série B', 'Brasil', 2, { apiFootball: 72, sportmonks: null, oddsApi: 'soccer_brazil_serie_b' }, { goals: 2.2, corners: 9.5, cards: 5.6 }),
  entry('BRA_COPA', 'Copa do Brasil', 'Brasil', 2, { apiFootball: 73, sportmonks: null, oddsApi: null }, { goals: 2.5, corners: 9.6, cards: 5.2 }),
  entry('CONMEBOL_LIBERTADORES', 'Copa Libertadores', 'América do Sul', 1, { apiFootball: 13, sportmonks: null, oddsApi: 'soccer_conmebol_copa_libertadores' }, { goals: 2.5, corners: 9.7, cards: 5.8 }),
  entry('CONMEBOL_SUDAMERICANA', 'Copa Sul-Americana', 'América do Sul', 3, { apiFootball: 11, sportmonks: null, oddsApi: 'soccer_conmebol_copa_sudamericana' }, { goals: 2.4, corners: 9.5, cards: 5.7 }),
  entry('ENG_PREMIER_LEAGUE', 'Premier League', 'Inglaterra', 1, { apiFootball: 39, sportmonks: null, oddsApi: 'soccer_epl' }, { goals: 2.85, corners: 10.4, cards: 4.2 }),
  entry('ESP_LA_LIGA', 'La Liga', 'Espanha', 1, { apiFootball: 140, sportmonks: null, oddsApi: 'soccer_spain_la_liga' }, { goals: 2.6, corners: 9.6, cards: 5.6 }),
  entry('ITA_SERIE_A', 'Serie A', 'Itália', 2, { apiFootball: 135, sportmonks: null, oddsApi: 'soccer_italy_serie_a' }, { goals: 2.7, corners: 10.1, cards: 5.0 }),
  entry('GER_BUNDESLIGA', 'Bundesliga', 'Alemanha', 2, { apiFootball: 78, sportmonks: null, oddsApi: 'soccer_germany_bundesliga' }, { goals: 3.1, corners: 9.9, cards: 4.0 }),
  entry('FRA_LIGUE_1', 'Ligue 1', 'França', 2, { apiFootball: 61, sportmonks: null, oddsApi: 'soccer_france_ligue_one' }, { goals: 2.8, corners: 9.7, cards: 4.6 }),
  entry('POR_PRIMEIRA_LIGA', 'Primeira Liga', 'Portugal', 3, { apiFootball: 94, sportmonks: null, oddsApi: 'soccer_portugal_primeira_liga' }, { goals: 2.6, corners: 9.8, cards: 5.2 }),
  entry('NED_EREDIVISIE', 'Eredivisie', 'Holanda', 3, { apiFootball: 88, sportmonks: null, oddsApi: 'soccer_netherlands_eredivisie' }, { goals: 3.2, corners: 10.2, cards: 4.1 }),
  entry('UEFA_CHAMPIONS_LEAGUE', 'Champions League', 'Europa', 1, { apiFootball: 2, sportmonks: null, oddsApi: 'soccer_uefa_champs_league' }, { goals: 3.0, corners: 10.0, cards: 4.3 }),
  entry('UEFA_EUROPA_LEAGUE', 'Europa League', 'Europa', 2, { apiFootball: 3, sportmonks: null, oddsApi: 'soccer_uefa_europa_league' }, { goals: 2.9, corners: 9.9, cards: 4.5 }),
  entry('ARG_PRIMERA', 'Liga Profesional', 'Argentina', 3, { apiFootball: 128, sportmonks: null, oddsApi: 'soccer_argentina_primera_division' }, { goals: 2.2, corners: 9.4, cards: 6.0 }),
  entry('MEX_LIGA_MX', 'Liga MX', 'México', 3, { apiFootball: 262, sportmonks: null, oddsApi: 'soccer_mexico_ligamx' }, { goals: 2.7, corners: 9.6, cards: 5.0 }),
  entry('USA_MLS', 'MLS', 'Estados Unidos', 3, { apiFootball: 253, sportmonks: null, oddsApi: 'soccer_usa_mls' }, { goals: 3.0, corners: 9.8, cards: 4.4 }),
  entry('DEN_SUPERLIGA', 'Superliga', 'Dinamarca', 3, { apiFootball: 119, sportmonks: 271, oddsApi: 'soccer_denmark_superliga' }, { goals: 2.9, corners: 10.0, cards: 4.2 }),
  entry('SCO_PREMIERSHIP', 'Scottish Premiership', 'Escócia', 3, { apiFootball: 179, sportmonks: 501, oddsApi: 'soccer_spl' }, { goals: 2.8, corners: 10.3, cards: 4.4 }),
];

const BY_KEY = new Map(LEAGUE_CATALOG.map((league) => [league.key, league]));

export function findLeague(key: string): LeagueCatalogEntry | null {
  return BY_KEY.get(key) ?? null;
}

export function findLeagueByProviderId(
  provider: keyof NormalizedLeague['providerIds'],
  id: string | number,
): LeagueCatalogEntry | null {
  const wanted = String(id);
  return LEAGUE_CATALOG.find((league) => league.providerIds[provider] === wanted) ?? null;
}

/** Liga desconhecida: entra com prioridade baixa e médias genéricas. */
export function fallbackLeague(
  name: string,
  country: string,
  providerIds: NormalizedLeague['providerIds'],
): LeagueCatalogEntry {
  const key = `OTHER_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
  return {
    key,
    name,
    country,
    season: SEASON,
    priority: 5,
    providerIds,
    oddsApiKey: null,
    avgGoalsMilli: 2_600,
    avgCornersMilli: 9_800,
    avgCardsMilli: 5_000,
  };
}
