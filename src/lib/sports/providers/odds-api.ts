/**
 * Adaptador The Odds API (v4).
 *
 * Documentação: https://the-odds-api.com/liveapi/guides/v4/
 *   GET /v4/sports/{sport_key}/events?apiKey=...                 (GRÁTIS: não gasta crédito)
 *   GET /v4/sports/{sport_key}/odds?apiKey=&regions=&markets=&eventIds=
 *   GET /v4/sports/{sport_key}/events/{eventId}/odds?apiKey=&regions=&markets=
 *
 * Custo: 1 crédito por mercado × região por chamada. Com 500 créditos/mês,
 * cada consulta com 2 mercados numa região custa 2 — o que dá ~250 consultas.
 * Por isso:
 *   - a lista de eventos (grátis) é usada para o matching;
 *   - odds só são pedidas para partidas que passaram no funil;
 *   - `btts` só existe no endpoint por evento, então só é pedido em partidas
 *     avançadas, e a resposta fica em cache por 60 s no mínimo.
 *
 * Headers: x-requests-remaining, x-requests-used, x-requests-last.
 */

import { ttlFor } from '../config/cache-policy';
import type { LeagueCatalogEntry } from '../config/leagues';
import type { MarketKey, NormalizedEvent, NormalizedFixture, NormalizedPrediction, NormalizedStatistics, OddsQuote, Selection } from '../domain/models';
import { matchFixture, type MatchCandidate } from '../domain/matching';
import { ProviderError } from '../infra/http';
import { sportsLog } from '../infra/logger';
import { asArray, asNumber, asRecord, asString, oddToMilli, type OddsRequest, type ProviderCapabilities, type ProviderDeps, type SportsProvider } from './types';

const BASE_URL = 'https://api.the-odds-api.com/v4';

export interface OddsApiOptions {
  /** Regiões (eu, uk, us, au). Cada região multiplica o custo. */
  regions: string;
  /** Mercados na consulta em lote (1 crédito cada). */
  bulkMarkets: readonly string[];
  /** Mercados extras no endpoint por evento (partidas avançadas). */
  eventMarkets: readonly string[];
}

export const DEFAULT_ODDS_API_OPTIONS: OddsApiOptions = {
  regions: 'eu',
  bulkMarkets: ['h2h', 'totals'],
  eventMarkets: ['h2h', 'totals', 'btts'],
};

export interface OddsApiEvent {
  id: string;
  sportKey: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
}

function mapEvent(raw: unknown): OddsApiEvent | null {
  const record = asRecord(raw);
  const id = asString(record?.id);
  const home = asString(record?.home_team);
  const away = asString(record?.away_team);
  const commence = asString(record?.commence_time);
  const sportKey = asString(record?.sport_key);
  if (!id || !home || !away || !commence || !sportKey) return null;
  return { id, sportKey, commenceTime: new Date(commence).toISOString(), homeTeam: home, awayTeam: away };
}

function parseOutcome(marketKey: string, outcome: Record<string, unknown>, home: string, away: string): { market: MarketKey; selection: Selection; line: number | null } | null {
  const name = asString(outcome.name) ?? '';
  const point = asNumber(outcome.point);

  if (marketKey === 'h2h') {
    if (name === home) return { market: 'MATCH_WINNER', selection: 'HOME', line: null };
    if (name === away) return { market: 'MATCH_WINNER', selection: 'AWAY', line: null };
    if (name.toLowerCase() === 'draw') return { market: 'MATCH_WINNER', selection: 'DRAW', line: null };
    return null;
  }
  if (marketKey === 'totals' || marketKey === 'alternate_totals') {
    if (point === null) return null;
    const over = name.toLowerCase() === 'over';
    if (point === 0.5 && over) return { market: 'OVER_0_5', selection: 'OVER', line: point };
    if (point === 1.5 && over) return { market: 'OVER_1_5', selection: 'OVER', line: point };
    if (point === 2.5) return over ? { market: 'OVER_2_5', selection: 'OVER', line: point } : { market: 'UNDER_2_5', selection: 'UNDER', line: point };
    return null;
  }
  if (marketKey === 'btts') {
    if (name.toLowerCase() === 'yes') return { market: 'BTTS', selection: 'YES', line: null };
    if (name.toLowerCase() === 'no') return { market: 'BTTS', selection: 'NO', line: null };
    return null;
  }
  return null;
}

export function mapOddsApiEvent(raw: unknown, fallbackCapturedAt: string): OddsQuote[] {
  const record = asRecord(raw);
  const home = asString(record?.home_team) ?? '';
  const away = asString(record?.away_team) ?? '';
  const quotes: OddsQuote[] = [];

  for (const bookmakerRaw of asArray(record?.bookmakers)) {
    const bookmaker = asRecord(bookmakerRaw);
    const title = asString(bookmaker?.title) ?? asString(bookmaker?.key) ?? 'Casa';
    for (const marketRaw of asArray(bookmaker?.markets)) {
      const market = asRecord(marketRaw);
      const key = asString(market?.key);
      if (!key) continue;
      const updated = asString(market?.last_update) ?? asString(bookmaker?.last_update) ?? fallbackCapturedAt;
      for (const outcomeRaw of asArray(market?.outcomes)) {
        const outcome = asRecord(outcomeRaw);
        if (!outcome) continue;
        const parsed = parseOutcome(key, outcome, home, away);
        const oddMilli = oddToMilli(outcome.price);
        if (!parsed || oddMilli === null) continue;
        quotes.push({ ...parsed, oddMilli, bookmaker: title, provider: 'odds-api', capturedAt: new Date(updated).toISOString() });
      }
    }
  }
  return quotes;
}

export class OddsApiProvider implements SportsProvider {
  readonly key = 'odds-api' as const;
  readonly capabilities: ProviderCapabilities = {
    fixtures: false,
    live: false,
    statistics: false,
    events: false,
    odds: true,
    predictions: false,
    xg: false,
  };

  constructor(
    private readonly apiKey: string | null,
    private readonly deps: ProviderDeps,
    private readonly options: OddsApiOptions = DEFAULT_ODDS_API_OPTIONS,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async request<T = unknown>(path: string, cost: number, priority: 'HIGH' | 'NORMAL' | 'LOW'): Promise<T> {
    if (!this.apiKey) throw new ProviderError(this.key, 'THE_ODDS_API_KEY não configurada.', null, false);
    if (cost > 0) {
      const check = await this.deps.quota.canSpend(this.key, cost, { priority });
      if (!check.ok) throw new ProviderError(this.key, `Quota: ${check.reason ?? check.status}`, 429, true);
    }
    const separator = path.includes('?') ? '&' : '?';
    const response = await this.deps.fetchJson<T>({
      provider: this.key,
      url: `${BASE_URL}${path}${separator}apiKey=${encodeURIComponent(this.apiKey)}`,
    });
    const remaining = asNumber(response.headers.get('x-requests-remaining'));
    const used = asNumber(response.headers.get('x-requests-last'));
    await this.deps.quota.recordRequest(this.key, { cost: used ?? cost, remaining });
    return response.body;
  }

  /** Lista de eventos de uma competição — NÃO gasta crédito. Base do matching. */
  async listEvents(league: LeagueCatalogEntry): Promise<OddsApiEvent[]> {
    const sportKey = league.oddsApiKey;
    if (!sportKey) return [];
    const result = await this.deps.cache.getOrLoad(`odds-api:events:${sportKey}`, ttlFor('odds-events-index'), async () => {
      const raw = await this.request<unknown[]>(`/sports/${sportKey}/events`, 0, 'LOW');
      return asArray(raw).map(mapEvent).filter((e): e is OddsApiEvent => e !== null);
    });
    return result.value;
  }

  /** Encontra o evento da Odds API correspondente a uma partida nossa. */
  async matchEvent(fixture: NormalizedFixture, aliases: Readonly<Record<string, string>> = {}): Promise<OddsApiEvent | null> {
    const events = await this.listEvents(fixture.league as LeagueCatalogEntry);
    const candidates: MatchCandidate[] = events.map((event) => ({
      providerId: event.id,
      homeName: event.homeTeam,
      awayName: event.awayTeam,
      startTime: event.commenceTime,
      leagueKey: fixture.league.key,
    }));
    const decision = matchFixture(
      { homeName: fixture.homeTeam.name, awayName: fixture.awayTeam.name, startTime: fixture.startTime, leagueKey: fixture.league.key },
      candidates,
      { aliases },
    );
    if (decision.status === 'AMBIGUOUS') {
      sportsLog('warn', 'matching.ambiguous', { provider: this.key, fixture: fixture.id, best: decision.best?.candidate.providerId, runnerUp: decision.runnerUp?.candidate.providerId }, { dedupeKey: fixture.id });
      return null;
    }
    if (decision.status !== 'MATCHED' || !decision.best) return null;
    sportsLog('debug', 'matching.linked', { provider: this.key, fixture: fixture.id, eventId: decision.best.candidate.providerId, confidenceBps: decision.best.confidenceBps });
    return events.find((event) => event.id === decision.best!.candidate.providerId) ?? null;
  }

  async getOdds(request: OddsRequest): Promise<OddsQuote[]> {
    const league = request.fixture.league as LeagueCatalogEntry;
    const sportKey = league.oddsApiKey;
    if (!sportKey) return [];

    const eventId = request.providerId;
    if (!eventId) return [];

    const live = request.fixture.status === 'LIVE' || request.fixture.status === 'HALFTIME';
    const kind = live ? 'odds-live' : 'odds-prematch';
    const mode = await this.deps.quota.economyMode(this.key);
    const regions = this.options.regions;

    /**
     * Partida prioritária ganha o endpoint por evento, que traz mais mercados
     * e custa (mercados × regiões) por jogo. Vale para poucas partidas.
     */
    if (request.priority === 'HIGH') {
      const markets = this.options.eventMarkets;
      const cost = markets.length * regions.split(',').length;
      const result = await this.deps.cache.getOrLoad(
        `odds-api:evento:${sportKey}:${eventId}:${markets.join(',')}`,
        ttlFor(kind, mode),
        async () => {
          const raw = await this.request<unknown>(
            `/sports/${sportKey}/events/${eventId}/odds?regions=${regions}&markets=${markets.join(',')}&oddsFormat=decimal&dateFormat=iso`,
            cost,
            'HIGH',
          );
          return mapOddsApiEvent(raw, this.deps.now().toISOString());
        },
      );
      return result.value;
    }

    /**
     * O CAMINHO NORMAL É POR CAMPEONATO, NÃO POR JOGO.
     *
     * O endpoint em lote devolve TODAS as partidas de um campeonato numa
     * resposta e cobra (mercados × regiões) uma vez — 2 créditos, cubra ele
     * dois jogos ou vinte.
     *
     * A versão anterior usava esse mesmo endpoint com `&eventIds=<um jogo>`:
     * pagava o preço do lote e levava um jogo só. Com oito partidas por ciclo
     * e um ciclo a cada trinta minutos, isso consome centenas de créditos por
     * dia — os 500 do mês inteiro evaporaram em pouco mais de um dia, e a The
     * Odds API entrou em modo crítico.
     *
     * Buscando o campeonato inteiro, o cache serve todas as partidas dele pelo
     * preço de uma chamada.
     */
    const markets = this.options.bulkMarkets;
    const cost = markets.length * regions.split(',').length;

    const result = await this.deps.cache.getOrLoad(
      // `kind` entra na chave porque cotação ao vivo vence bem mais rápido que
      // a de pré-jogo. Sem isso, a primeira partida a carregar definiria a
      // validade para todas as outras do mesmo campeonato.
      `odds-api:liga:${kind}:${sportKey}:${markets.join(',')}`,
      ttlFor(kind, mode),
      async () => {
        const raw = await this.request<unknown>(
          `/sports/${sportKey}/odds?regions=${regions}&markets=${markets.join(',')}&oddsFormat=decimal&dateFormat=iso`,
          cost,
          request.priority,
        );
        const now = this.deps.now().toISOString();
        const porEvento: Record<string, OddsQuote[]> = {};
        for (const item of Array.isArray(raw) ? raw : [raw]) {
          const id = asString(asRecord(item)?.id);
          if (!id) continue;
          porEvento[id] = mapOddsApiEvent(item, now);
        }
        return porEvento;
      },
    );

    return result.value[eventId] ?? [];
  }

  // O restante do contrato não se aplica: este provedor só entrega odds.
  async getFixtures(): Promise<NormalizedFixture[]> {
    return [];
  }
  async getLiveFixtures(): Promise<NormalizedFixture[]> {
    return [];
  }
  async getFixture(): Promise<NormalizedFixture | null> {
    return null;
  }
  async getFixturesByIds(): Promise<NormalizedFixture[]> {
    return [];
  }
  async getStatistics(): Promise<NormalizedStatistics | null> {
    return null;
  }
  async getEvents(): Promise<NormalizedEvent[]> {
    return [];
  }
  async getPredictions(): Promise<NormalizedPrediction | null> {
    return null;
  }
}
