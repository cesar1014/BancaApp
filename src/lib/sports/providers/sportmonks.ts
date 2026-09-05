/**
 * Adaptador Sportmonks (Football API v3).
 *
 * Documentação: https://docs.sportmonks.com/football
 *   GET /v3/football/fixtures/date/{YYYY-MM-DD}?include=...&filters=fixtureLeagues:271;501
 *   GET /v3/football/livescores/inplay?include=...
 *   GET /v3/football/fixtures/{id}?include=...
 *   GET /v3/football/fixtures/multi/{id1,id2}?include=...
 *
 * Autenticação: header `Authorization: <token>`. O corpo traz `rate_limit`
 * ({ remaining, resets_in_seconds }) — 3000 chamadas/hora por entidade.
 *
 * Plano gratuito: apenas Superliga (Dinamarca, 271) e Premiership (Escócia,
 * 501). xG é add-on pago (type_id 5304): quando não vier, o campo fica null
 * e o motor segue sem ele. Aqui o papel é ENRIQUECER partidas já filtradas —
 * nunca é a fonte primária do calendário.
 */

import { findLeagueByProviderId, LEAGUE_CATALOG } from '../config/leagues';
import { ttlFor } from '../config/cache-policy';
import type {
  EventType,
  FixtureStatus,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedPrediction,
  NormalizedStatistics,
  NormalizedTeam,
  OddsQuote,
  TeamStatistics,
} from '../domain/models';
import { EMPTY_TEAM_STATISTICS } from '../domain/models';
import { teamKey } from '../domain/names';
import { fixtureKey } from '../domain/matching';
import { ProviderError } from '../infra/http';
import { asArray, asNumber, asRecord, asString, type FixtureQuery, type ProviderCapabilities, type ProviderDeps, type SportsProvider } from './types';

const BASE_URL = 'https://api.sportmonks.com/v3/football';
const INCLUDES = 'participants;scores;state;league;periods;statistics;events';

/** IDs de tipo de estatística (docs → Types). Configurável: adicione aqui. */
const STAT_TYPE: Record<number, keyof TeamStatistics> = {
  34: 'corners',
  41: 'shotsOffTarget',
  42: 'shots',
  43: 'attacks',
  44: 'dangerousAttacks',
  45: 'possessionBps',
  49: 'shotsInsideBox',
  51: 'offsides',
  56: 'fouls',
  58: 'blockedShots',
  80: 'passes',
  83: 'redCards',
  84: 'yellowCards',
  86: 'shotsOnTarget',
  5304: 'xgMilli',
};

const EVENT_TYPE: Record<number, EventType> = {
  14: 'GOAL',
  15: 'OWN_GOAL',
  16: 'PENALTY_GOAL',
  17: 'PENALTY_MISSED',
  18: 'SUBSTITUTION',
  19: 'YELLOW_CARD',
  20: 'RED_CARD',
  21: 'RED_CARD',
  10: 'VAR',
};

const STATE_MAP: Record<string, FixtureStatus> = {
  NS: 'SCHEDULED',
  TBA: 'SCHEDULED',
  INPLAY_1ST_HALF: 'LIVE',
  INPLAY_2ND_HALF: 'LIVE',
  INPLAY_ET: 'LIVE',
  INPLAY_ET_2ND_HALF: 'LIVE',
  INPLAY_PENALTIES: 'LIVE',
  BREAK: 'LIVE',
  EXTRA_TIME_BREAK: 'LIVE',
  PEN_BREAK: 'LIVE',
  SUSPENDED: 'LIVE',
  INTERRUPTED: 'LIVE',
  HT: 'HALFTIME',
  FT: 'FINISHED',
  AET: 'FINISHED',
  FT_PEN: 'FINISHED',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  ABANDONED: 'CANCELLED',
  WALKOVER: 'CANCELLED',
  DELETED: 'CANCELLED',
};

interface Participants {
  home: { id: string; team: NormalizedTeam } | null;
  away: { id: string; team: NormalizedTeam } | null;
}

function mapParticipants(raw: unknown[], country: string): Participants {
  const out: Participants = { home: null, away: null };
  for (const item of raw) {
    const record = asRecord(item);
    const meta = asRecord(record?.meta);
    const location = asString(meta?.location);
    const name = asString(record?.name);
    if (!record || !name) continue;
    const id = String(record.id);
    const team: NormalizedTeam = {
      key: teamKey(name),
      name,
      shortName: asString(record.short_code),
      country,
      aliases: [],
      providerIds: { sportmonks: id },
    };
    if (location === 'home') out.home = { id, team };
    else if (location === 'away') out.away = { id, team };
  }
  return out;
}

function mapStatistics(raw: unknown[], homeId: string | null, lastUpdated: string): NormalizedStatistics | null {
  if (raw.length === 0) return null;
  const home: TeamStatistics = { ...EMPTY_TEAM_STATISTICS };
  const away: TeamStatistics = { ...EMPTY_TEAM_STATISTICS };
  let any = false;

  for (const item of raw) {
    const record = asRecord(item);
    const typeId = asNumber(record?.type_id);
    if (typeId === null) continue;
    const field = STAT_TYPE[typeId];
    if (!field) continue;
    const value = asNumber(asRecord(record?.data)?.value);
    if (value === null) continue;
    const location = asString(record?.location);
    const participant = record?.participant_id !== undefined ? String(record.participant_id) : null;
    const isHome = location ? location === 'home' : participant !== null && participant === homeId;
    const target = isHome ? home : away;
    if (field === 'possessionBps' || field === 'passAccuracyBps') target[field] = Math.round(value * 100);
    else if (field === 'xgMilli') target[field] = Math.round(value * 1000);
    else target[field] = Math.round(value);
    any = true;
  }

  if (!any) return null;
  return { home, away, source: 'sportmonks', lastUpdated, confidence: 'HIGH' };
}

function mapEvents(raw: unknown[], homeId: string | null): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    const typeId = asNumber(record?.type_id);
    const minute = asNumber(record?.minute);
    if (typeId === null || minute === null) continue;
    const participant = record?.participant_id !== undefined ? String(record.participant_id) : null;
    events.push({
      minute: Math.round(minute),
      extraMinute: asNumber(record?.extra_minute),
      type: EVENT_TYPE[typeId] ?? 'OTHER',
      team: participant !== null && participant === homeId ? 'HOME' : 'AWAY',
      player: asString(record?.player_name),
      detail: asString(record?.result) ?? asString(record?.info),
    });
  }
  return events.sort((a, b) => a.minute - b.minute);
}

function currentMinute(periods: unknown[]): number | null {
  for (const item of periods) {
    const record = asRecord(item);
    if (record?.ticking === true) {
      const minutes = asNumber(record.minutes);
      return minutes === null ? null : Math.round(minutes);
    }
  }
  return null;
}

function readScore(scores: unknown[], description: string): { home: number; away: number } | null {
  let home: number | null = null;
  let away: number | null = null;
  for (const item of scores) {
    const record = asRecord(item);
    if (asString(record?.description) !== description) continue;
    const score = asRecord(record?.score);
    const goals = asNumber(score?.goals);
    const side = asString(score?.participant);
    if (goals === null) continue;
    if (side === 'home') home = Math.round(goals);
    if (side === 'away') away = Math.round(goals);
  }
  if (home === null && away === null) return null;
  return { home: home ?? 0, away: away ?? 0 };
}

function mapFixture(raw: unknown, now: string): NormalizedFixture | null {
  const record = asRecord(raw);
  if (!record || record.id === undefined) return null;
  const startingAt = asString(record.starting_at);
  if (!startingAt) return null;
  const startTime = new Date(startingAt.replace(' ', 'T') + (startingAt.includes('Z') ? '' : 'Z')).toISOString();

  const leagueRaw = asRecord(record.league);
  const leagueId = record.league_id ?? leagueRaw?.id;
  const catalog = leagueId !== undefined ? findLeagueByProviderId('sportmonks', String(leagueId)) : null;
  if (!catalog) return null; // fora do catálogo: não vale a pena

  const participants = mapParticipants(asArray(record.participants), catalog.country);
  if (!participants.home || !participants.away) return null;

  const state = asRecord(record.state);
  const status = STATE_MAP[asString(state?.state) ?? ''] ?? 'UNKNOWN';
  const scores = asArray(record.scores);
  const current = readScore(scores, 'CURRENT') ?? { home: 0, away: 0 };
  const minute = status === 'LIVE' ? currentMinute(asArray(record.periods)) : status === 'HALFTIME' ? 45 : null;

  return {
    id: fixtureKey(startTime, participants.home.team.name, participants.away.team.name),
    providerIds: { sportmonks: String(record.id) },
    league: catalog,
    homeTeam: participants.home.team,
    awayTeam: participants.away.team,
    startTime,
    status,
    minute,
    score: current,
    halftimeScore: readScore(scores, '1ST_HALF'),
    statistics: mapStatistics(asArray(record.statistics), participants.home.id, now),
    events: mapEvents(asArray(record.events), participants.home.id),
    odds: null,
    metadata: { sources: ['sportmonks'], lastUpdated: now, confidence: 'HIGH', stale: false, venue: null, round: null },
  };
}

export class SportmonksProvider implements SportsProvider {
  readonly key = 'sportmonks' as const;
  readonly capabilities: ProviderCapabilities = {
    fixtures: true,
    live: true,
    statistics: true,
    events: true,
    odds: false, // sem odds no plano gratuito
    predictions: false,
    xg: false, // add-on pago
  };

  constructor(
    private readonly apiToken: string | null,
    private readonly deps: ProviderDeps,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiToken);
  }

  /** Ligas do catálogo que este provedor cobre (têm id Sportmonks). */
  private leagueFilter(): string {
    return LEAGUE_CATALOG.map((league) => league.providerIds.sportmonks).filter((id): id is string => Boolean(id)).join(';');
  }

  private async request<T = unknown>(path: string, priority: 'HIGH' | 'NORMAL' | 'LOW'): Promise<T> {
    if (!this.apiToken) throw new ProviderError(this.key, 'SPORTMONKS_API_KEY não configurada.', null, false);
    const check = await this.deps.quota.canSpend(this.key, 1, { priority });
    if (!check.ok) throw new ProviderError(this.key, `Quota: ${check.reason ?? check.status}`, 429, true);

    const separator = path.includes('?') ? '&' : '?';
    const response = await this.deps.fetchJson<Record<string, unknown>>({
      provider: this.key,
      url: `${BASE_URL}${path}${separator}timezone=UTC`,
      headers: { Authorization: this.apiToken },
    });

    const rateLimit = asRecord(response.body.rate_limit);
    const resetsIn = asNumber(rateLimit?.resets_in_seconds);
    await this.deps.quota.recordRequest(this.key, {
      remaining: asNumber(rateLimit?.remaining),
      resetAt: resetsIn === null ? null : new Date(this.deps.now().getTime() + resetsIn * 1000).toISOString(),
    });

    return response.body.data as T;
  }

  async getFixtures(query: FixtureQuery): Promise<NormalizedFixture[]> {
    const filter = this.leagueFilter();
    if (!filter) return [];
    const mode = await this.deps.quota.economyMode(this.key);
    const result = await this.deps.cache.getOrLoad(`sportmonks:fixtures:${query.date}`, ttlFor('fixtures-today', mode), async () => {
      const raw = await this.request<unknown[]>(`/fixtures/date/${query.date}?include=${INCLUDES}&filters=fixtureLeagues:${filter}`, 'LOW');
      const now = this.deps.now().toISOString();
      return asArray(raw).map((item) => mapFixture(item, now)).filter((f): f is NormalizedFixture => f !== null);
    });
    return query.leagueKeys ? result.value.filter((fixture) => query.leagueKeys!.includes(fixture.league.key)) : result.value;
  }

  async getLiveFixtures(): Promise<NormalizedFixture[]> {
    const filter = this.leagueFilter();
    if (!filter) return [];
    const mode = await this.deps.quota.economyMode(this.key);
    const result = await this.deps.cache.getOrLoad('sportmonks:live', ttlFor('live-statistics', mode), async () => {
      const raw = await this.request<unknown[]>(`/livescores/inplay?include=${INCLUDES}&filters=fixtureLeagues:${filter}`, 'NORMAL');
      const now = this.deps.now().toISOString();
      return asArray(raw).map((item) => mapFixture(item, now)).filter((f): f is NormalizedFixture => f !== null);
    });
    return result.value;
  }

  async getFixture(providerId: string): Promise<NormalizedFixture | null> {
    return (await this.getFixturesByIds([providerId]))[0] ?? null;
  }

  async getFixturesByIds(providerIds: readonly string[], priority: 'HIGH' | 'NORMAL' | 'LOW' = 'NORMAL'): Promise<NormalizedFixture[]> {
    if (providerIds.length === 0) return [];
    const mode = await this.deps.quota.economyMode(this.key);
    const result = await this.deps.cache.getOrLoad(`sportmonks:multi:${providerIds.join(',')}`, ttlFor('live-statistics', mode), async () => {
      const raw = await this.request<unknown[]>(`/fixtures/multi/${providerIds.join(',')}?include=${INCLUDES}`, priority);
      const now = this.deps.now().toISOString();
      return asArray(raw).map((item) => mapFixture(item, now)).filter((f): f is NormalizedFixture => f !== null);
    });
    return result.value;
  }

  async getStatistics(providerId: string): Promise<NormalizedStatistics | null> {
    return (await this.getFixture(providerId))?.statistics ?? null;
  }

  async getEvents(providerId: string): Promise<NormalizedEvent[]> {
    return (await this.getFixture(providerId))?.events ?? [];
  }

  async getOdds(): Promise<OddsQuote[]> {
    return []; // não disponível no plano gratuito
  }

  async getPredictions(): Promise<NormalizedPrediction | null> {
    return null;
  }
}
