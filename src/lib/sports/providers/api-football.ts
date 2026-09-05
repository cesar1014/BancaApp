/**
 * Adaptador API-Football (v3, api-sports.io).
 *
 * Documentação: https://www.api-football.com/documentation-v3
 *   GET /fixtures?date=YYYY-MM-DD&timezone=UTC     jogos do dia (todas as ligas)
 *   GET /fixtures?live=all                          partidas ao vivo
 *   GET /fixtures?ids=1-2-3 (até 20)                detalhe em lote com events,
 *                                                   statistics e lineups
 *   GET /fixtures/statistics?fixture=ID
 *   GET /fixtures/events?fixture=ID
 *   GET /odds?fixture=ID                            odds pré-jogo por casa
 *   GET /odds/live?fixture=ID                       odds ao vivo (beta)
 *   GET /predictions?fixture=ID
 *
 * Plano gratuito: 100 requests/dia, 10/min, todos os endpoints. Headers
 * `x-ratelimit-requests-limit` / `x-ratelimit-requests-remaining` trazem a
 * quota diária; erros de plano vêm no corpo (`errors`) com HTTP 200.
 *
 * Estratégia de quota: um request por lista (dia/ao vivo) e detalhe SEMPRE em
 * lote por ids — nunca uma chamada por jogo.
 */

import { findLeagueByProviderId, fallbackLeague } from '../config/leagues';
import { ttlFor } from '../config/cache-policy';
import type {
  EventType,
  FixtureStatus,
  MarketKey,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedPrediction,
  NormalizedStatistics,
  NormalizedTeam,
  OddsQuote,
  Selection,
  TeamStatistics,
} from '../domain/models';
import { EMPTY_TEAM_STATISTICS } from '../domain/models';
import { teamKey } from '../domain/names';
import { fixtureKey } from '../domain/matching';
import { ProviderError } from '../infra/http';
import { asArray, asNumber, asRecord, asString, oddToMilli, type FixtureQuery, type OddsRequest, type ProviderCapabilities, type ProviderDeps, type SportsProvider } from './types';

const BASE_URL = 'https://v3.football.api-sports.io';
const BATCH_SIZE = 20;

const STATUS_MAP: Record<string, FixtureStatus> = {
  TBD: 'SCHEDULED',
  NS: 'SCHEDULED',
  '1H': 'LIVE',
  '2H': 'LIVE',
  ET: 'LIVE',
  P: 'LIVE',
  BT: 'LIVE',
  LIVE: 'LIVE',
  SUSP: 'LIVE',
  INT: 'LIVE',
  HT: 'HALFTIME',
  FT: 'FINISHED',
  AET: 'FINISHED',
  PEN: 'FINISHED',
  PST: 'POSTPONED',
  CANC: 'CANCELLED',
  ABD: 'CANCELLED',
  AWD: 'CANCELLED',
  WO: 'CANCELLED',
};

function mapStatus(code: string | null): FixtureStatus {
  if (!code) return 'UNKNOWN';
  return STATUS_MAP[code] ?? 'UNKNOWN';
}

function mapTeam(raw: Record<string, unknown> | null, country: string | null): NormalizedTeam {
  const name = asString(raw?.name) ?? 'Desconhecido';
  return {
    key: teamKey(name),
    name,
    shortName: null,
    country,
    aliases: [],
    providerIds: raw?.id !== undefined ? { 'api-football': String(raw.id) } : {},
  };
}

const STAT_FIELD: Record<string, keyof TeamStatistics> = {
  'shots on goal': 'shotsOnTarget',
  'shots off goal': 'shotsOffTarget',
  'total shots': 'shots',
  'blocked shots': 'blockedShots',
  'shots insidebox': 'shotsInsideBox',
  fouls: 'fouls',
  'corner kicks': 'corners',
  offsides: 'offsides',
  'ball possession': 'possessionBps',
  'yellow cards': 'yellowCards',
  'red cards': 'redCards',
  'total passes': 'passes',
  'passes %': 'passAccuracyBps',
  expected_goals: 'xgMilli',
};

function mapTeamStatistics(entries: unknown[]): TeamStatistics {
  const stats: TeamStatistics = { ...EMPTY_TEAM_STATISTICS };
  for (const item of entries) {
    const record = asRecord(item);
    const type = asString(record?.type)?.toLowerCase();
    if (!type) continue;
    const field = STAT_FIELD[type];
    if (!field) continue;
    const value = asNumber(record?.value);
    if (value === null) continue;
    if (field === 'possessionBps' || field === 'passAccuracyBps') stats[field] = Math.round(value * 100);
    else if (field === 'xgMilli') stats[field] = Math.round(value * 1000);
    else stats[field] = Math.round(value);
  }
  return stats;
}

function mapStatistics(raw: unknown[], homeId: string | null, lastUpdated: string): NormalizedStatistics | null {
  if (raw.length === 0) return null;
  let home: TeamStatistics | null = null;
  let away: TeamStatistics | null = null;
  for (const item of raw) {
    const record = asRecord(item);
    const teamId = asRecord(record?.team)?.id;
    const stats = mapTeamStatistics(asArray(record?.statistics));
    if (homeId !== null && String(teamId) === homeId) home = stats;
    else if (home === null && away === null && homeId === null) home = stats;
    else away = stats;
  }
  if (!home && !away) return null;
  return {
    home: home ?? { ...EMPTY_TEAM_STATISTICS },
    away: away ?? { ...EMPTY_TEAM_STATISTICS },
    source: 'api-football',
    lastUpdated,
    confidence: home && away ? 'HIGH' : 'MEDIUM',
  };
}

function mapEventType(type: string | null, detail: string | null): EventType {
  const t = (type ?? '').toLowerCase();
  const d = (detail ?? '').toLowerCase();
  if (t === 'goal') {
    if (d.includes('own')) return 'OWN_GOAL';
    if (d.includes('missed')) return 'PENALTY_MISSED';
    if (d.includes('penalty')) return 'PENALTY_GOAL';
    return 'GOAL';
  }
  if (t === 'card') return d.includes('red') ? 'RED_CARD' : 'YELLOW_CARD';
  if (t === 'subst') return 'SUBSTITUTION';
  if (t === 'var') return 'VAR';
  return 'OTHER';
}

function mapEvents(raw: unknown[], homeId: string | null): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;
    const time = asRecord(record.time);
    const minute = asNumber(time?.elapsed);
    if (minute === null) continue;
    const teamId = asRecord(record.team)?.id;
    events.push({
      minute: Math.round(minute),
      extraMinute: asNumber(time?.extra),
      type: mapEventType(asString(record.type), asString(record.detail)),
      team: homeId !== null && String(teamId) === homeId ? 'HOME' : 'AWAY',
      player: asString(asRecord(record.player)?.name),
      detail: asString(record.detail),
    });
  }
  return events.sort((a, b) => a.minute - b.minute);
}

function mapFixture(raw: unknown, now: string): NormalizedFixture | null {
  const record = asRecord(raw);
  const fixture = asRecord(record?.fixture);
  const leagueRaw = asRecord(record?.league);
  const teams = asRecord(record?.teams);
  const goals = asRecord(record?.goals);
  const scoreRaw = asRecord(record?.score);
  if (!fixture || !leagueRaw || !teams) return null;

  const startTime = asString(fixture.date);
  const id = fixture.id;
  if (!startTime || id === undefined) return null;

  const leagueId = leagueRaw.id;
  const catalog = leagueId !== undefined ? findLeagueByProviderId('api-football', String(leagueId)) : null;
  const league =
    catalog ??
    fallbackLeague(asString(leagueRaw.name) ?? 'Liga', asString(leagueRaw.country) ?? '', {
      'api-football': String(leagueId ?? ''),
    });

  const homeRaw = asRecord(teams.home);
  const awayRaw = asRecord(teams.away);
  const homeId = homeRaw?.id !== undefined ? String(homeRaw.id) : null;
  const homeTeam = mapTeam(homeRaw, league.country);
  const awayTeam = mapTeam(awayRaw, league.country);

  const statusRaw = asRecord(fixture.status);
  const status = mapStatus(asString(statusRaw?.short));
  const minute = asNumber(statusRaw?.elapsed);
  const halftime = asRecord(scoreRaw?.halftime);

  const statistics = mapStatistics(asArray(record?.statistics), homeId, now);
  const events = mapEvents(asArray(record?.events), homeId);

  return {
    id: fixtureKey(startTime, homeTeam.name, awayTeam.name),
    providerIds: { 'api-football': String(id) },
    league,
    homeTeam,
    awayTeam,
    startTime: new Date(startTime).toISOString(),
    status,
    minute: minute === null ? null : Math.round(minute),
    score: { home: Math.round(asNumber(goals?.home) ?? 0), away: Math.round(asNumber(goals?.away) ?? 0) },
    halftimeScore:
      halftime && asNumber(halftime.home) !== null
        ? { home: Math.round(asNumber(halftime.home) ?? 0), away: Math.round(asNumber(halftime.away) ?? 0) }
        : null,
    statistics,
    events,
    odds: null,
    metadata: {
      sources: ['api-football'],
      lastUpdated: now,
      confidence: 'HIGH',
      stale: false,
      venue: asString(asRecord(fixture.venue)?.name),
      round: asString(leagueRaw.round),
    },
  };
}

// ---------------------------------------------------------------------------
// Odds
// ---------------------------------------------------------------------------
interface ParsedBet {
  market: MarketKey;
  selection: Selection;
  line: number | null;
}

/** Interpreta ("Goals Over/Under", "Over 2.5") → OVER_2_5/OVER/2.5 etc. */
function parseBet(betName: string, value: string, homeName: string, awayName: string): ParsedBet | null {
  const name = betName.toLowerCase();
  const v = value.toLowerCase().trim();

  if (name === 'match winner' || name === 'fulltime result' || name === 'full time result') {
    if (v === 'home' || v === '1' || v === homeName.toLowerCase()) return { market: 'MATCH_WINNER', selection: 'HOME', line: null };
    if (v === 'away' || v === '2' || v === awayName.toLowerCase()) return { market: 'MATCH_WINNER', selection: 'AWAY', line: null };
    if (v === 'draw' || v === 'x') return { market: 'MATCH_WINNER', selection: 'DRAW', line: null };
    return null;
  }
  if (name === 'double chance') {
    if (v.includes('home/draw') || v === '1x') return { market: 'DOUBLE_CHANCE', selection: '1X', line: null };
    if (v.includes('draw/away') || v === 'x2') return { market: 'DOUBLE_CHANCE', selection: 'X2', line: null };
    if (v.includes('home/away') || v === '12') return { market: 'DOUBLE_CHANCE', selection: '12', line: null };
    return null;
  }
  if (name.includes('both teams') && name.includes('score')) {
    if (v === 'yes') return { market: 'BTTS', selection: 'YES', line: null };
    if (v === 'no') return { market: 'BTTS', selection: 'NO', line: null };
    return null;
  }
  if (name === 'goals over/under' || name === 'over/under') {
    const match = /^(over|under)\s+([\d.]+)$/.exec(v);
    if (!match) return null;
    const line = Number(match[2]);
    const over = match[1] === 'over';
    if (line === 0.5 && over) return { market: 'OVER_0_5', selection: 'OVER', line };
    if (line === 1.5 && over) return { market: 'OVER_1_5', selection: 'OVER', line };
    if (line === 2.5) return over ? { market: 'OVER_2_5', selection: 'OVER', line } : { market: 'UNDER_2_5', selection: 'UNDER', line };
    return null;
  }
  if (name.includes('corners') && name.includes('over')) {
    const match = /^(over|under)\s+([\d.]+)$/.exec(v);
    if (!match) return null;
    return { market: 'CORNERS', selection: match[1] === 'over' ? 'OVER' : 'UNDER', line: Number(match[2]) };
  }
  if (name.includes('cards') && name.includes('over')) {
    const match = /^(over|under)\s+([\d.]+)$/.exec(v);
    if (!match) return null;
    return { market: 'CARDS', selection: match[1] === 'over' ? 'OVER' : 'UNDER', line: Number(match[2]) };
  }
  return null;
}

function mapOdds(raw: unknown[], homeName: string, awayName: string, capturedAt: string): OddsQuote[] {
  const quotes: OddsQuote[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    const updated = asString(record?.update) ?? capturedAt;
    for (const bookmakerRaw of asArray(record?.bookmakers)) {
      const bookmaker = asRecord(bookmakerRaw);
      const bookmakerName = asString(bookmaker?.name) ?? 'Casa';
      for (const betRaw of asArray(bookmaker?.bets)) {
        const bet = asRecord(betRaw);
        const betName = asString(bet?.name);
        if (!betName) continue;
        for (const valueRaw of asArray(bet?.values)) {
          const value = asRecord(valueRaw);
          const label = asString(value?.value);
          const oddMilli = oddToMilli(value?.odd);
          if (!label || oddMilli === null) continue;
          if (value?.suspended === true) continue;
          const parsed = parseBet(betName, label, homeName, awayName);
          if (!parsed) continue;
          quotes.push({ ...parsed, oddMilli, bookmaker: bookmakerName, provider: 'api-football', capturedAt: new Date(updated).toISOString() });
        }
      }
    }
  }
  return quotes;
}

// ---------------------------------------------------------------------------
// Provedor
// ---------------------------------------------------------------------------
export class ApiFootballProvider implements SportsProvider {
  readonly key = 'api-football' as const;
  readonly capabilities: ProviderCapabilities = {
    fixtures: true,
    live: true,
    statistics: true,
    events: true,
    odds: true,
    predictions: true,
    xg: true, // "expected_goals" aparece nas estatísticas de algumas ligas
  };

  constructor(
    private readonly apiKey: string | null,
    private readonly deps: ProviderDeps,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async request<T = unknown>(path: string, priority: 'HIGH' | 'NORMAL' | 'LOW'): Promise<T> {
    if (!this.apiKey) throw new ProviderError(this.key, 'API_FOOTBALL_KEY não configurada.', null, false);
    const check = await this.deps.quota.canSpend(this.key, 1, { priority });
    if (!check.ok) throw new ProviderError(this.key, `Quota: ${check.reason ?? check.status}`, 429, true);

    const response = await this.deps.fetchJson<Record<string, unknown>>({
      provider: this.key,
      url: `${BASE_URL}${path}`,
      headers: { 'x-apisports-key': this.apiKey },
    });

    await this.deps.quota.recordRequest(this.key, {
      remaining: asNumber(response.headers.get('x-ratelimit-requests-remaining')),
      limit: asNumber(response.headers.get('x-ratelimit-requests-limit')),
    });

    // A API devolve 200 com `errors` preenchido quando há problema de plano/quota.
    const errors = response.body.errors;
    const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors && typeof errors === 'object' && Object.keys(errors).length > 0;
    if (hasErrors) {
      const message = JSON.stringify(errors).slice(0, 200);
      const quotaIssue = /rateLimit|requests|plan/i.test(message);
      throw new ProviderError(this.key, `API-Football: ${message}`, quotaIssue ? 429 : 400, quotaIssue);
    }

    return response.body.response as T;
  }

  async getFixtures(query: FixtureQuery): Promise<NormalizedFixture[]> {
    const key = `api-football:fixtures:${query.date}`;
    const today = this.deps.now().toISOString().slice(0, 10);
    const kind = query.date === today ? 'fixtures-today' : 'fixtures-upcoming';
    const mode = await this.deps.quota.economyMode(this.key);
    const result = await this.deps.cache.getOrLoad(key, ttlFor(kind, mode), async () => {
      const raw = await this.request<unknown[]>(`/fixtures?date=${query.date}&timezone=UTC`, 'NORMAL');
      const now = this.deps.now().toISOString();
      return asArray(raw).map((item) => mapFixture(item, now)).filter((f): f is NormalizedFixture => f !== null);
    });
    const fixtures = result.value.map((fixture) => ({ ...fixture, metadata: { ...fixture.metadata, stale: result.stale } }));
    return query.leagueKeys ? fixtures.filter((fixture) => query.leagueKeys!.includes(fixture.league.key)) : fixtures;
  }

  async getLiveFixtures(): Promise<NormalizedFixture[]> {
    const mode = await this.deps.quota.economyMode(this.key);
    const result = await this.deps.cache.getOrLoad('api-football:live', ttlFor('fixtures-live-list', mode), async () => {
      const raw = await this.request<unknown[]>('/fixtures?live=all', 'NORMAL');
      const now = this.deps.now().toISOString();
      return asArray(raw).map((item) => mapFixture(item, now)).filter((f): f is NormalizedFixture => f !== null);
    });
    return result.value.map((fixture) => ({ ...fixture, metadata: { ...fixture.metadata, stale: result.stale } }));
  }

  async getFixture(providerId: string): Promise<NormalizedFixture | null> {
    const list = await this.getFixturesByIds([providerId], 'NORMAL');
    return list[0] ?? null;
  }

  /** Lote de até 20 ids por chamada — inclui events e statistics. */
  async getFixturesByIds(providerIds: readonly string[], priority: 'HIGH' | 'NORMAL' | 'LOW' = 'NORMAL'): Promise<NormalizedFixture[]> {
    const out: NormalizedFixture[] = [];
    for (let i = 0; i < providerIds.length; i += BATCH_SIZE) {
      const batch = providerIds.slice(i, i + BATCH_SIZE);
      const key = `api-football:ids:${batch.join('-')}`;
      const mode = await this.deps.quota.economyMode(this.key);
      const result = await this.deps.cache.getOrLoad(key, ttlFor('live-statistics', mode), async () => {
        const raw = await this.request<unknown[]>(`/fixtures?ids=${batch.join('-')}&timezone=UTC`, priority);
        const now = this.deps.now().toISOString();
        return asArray(raw).map((item) => mapFixture(item, now)).filter((f): f is NormalizedFixture => f !== null);
      });
      out.push(...result.value.map((fixture) => ({ ...fixture, metadata: { ...fixture.metadata, stale: result.stale } })));
    }
    return out;
  }

  async getStatistics(providerId: string): Promise<NormalizedStatistics | null> {
    return (await this.getFixture(providerId))?.statistics ?? null;
  }

  async getEvents(providerId: string): Promise<NormalizedEvent[]> {
    return (await this.getFixture(providerId))?.events ?? [];
  }

  async getOdds(request: OddsRequest): Promise<OddsQuote[]> {
    const id = request.providerId ?? request.fixture.providerIds['api-football'] ?? null;
    if (!id) return [];
    const live = request.fixture.status === 'LIVE' || request.fixture.status === 'HALFTIME';
    const kind = live ? 'odds-live' : 'odds-prematch';
    const mode = await this.deps.quota.economyMode(this.key);
    const result = await this.deps.cache.getOrLoad(`api-football:odds:${live ? 'live' : 'pre'}:${id}`, ttlFor(kind, mode), async () => {
      const path = live ? `/odds/live?fixture=${id}` : `/odds?fixture=${id}`;
      const raw = await this.request<unknown[]>(path, request.priority);
      return mapOdds(asArray(raw), request.fixture.homeTeam.name, request.fixture.awayTeam.name, this.deps.now().toISOString());
    });
    return result.value;
  }

  async getPredictions(providerId: string): Promise<NormalizedPrediction | null> {
    const mode = await this.deps.quota.economyMode(this.key);
    const result = await this.deps.cache.getOrLoad(`api-football:predictions:${providerId}`, ttlFor('predictions', mode), async () => {
      const raw = await this.request<unknown[]>(`/predictions?fixture=${providerId}`, 'LOW');
      const first = asRecord(asArray(raw)[0]);
      const predictions = asRecord(first?.predictions);
      const percent = asRecord(predictions?.percent);
      if (!percent) return null;
      const comparison = asRecord(asRecord(first?.comparison)?.total);
      const prediction: NormalizedPrediction = {
        fixtureId: providerId,
        homeWinBps: percentToBps(percent.home),
        drawBps: percentToBps(percent.draw),
        awayWinBps: percentToBps(percent.away),
        homeStrength: asNumber(comparison?.home),
        awayStrength: asNumber(comparison?.away),
        source: 'api-football',
        lastUpdated: this.deps.now().toISOString(),
      };
      return prediction;
    });
    return result.value;
  }
}

function percentToBps(value: unknown): number | null {
  const number = asNumber(value);
  return number === null ? null : Math.round(number * 100);
}
