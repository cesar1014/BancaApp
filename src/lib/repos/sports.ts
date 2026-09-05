import 'server-only';
import { query, queryOne } from '@/lib/db';
import type { CachePersistence, CacheRecord } from '@/lib/sports/infra/cache';
import type { ProviderQuotaState, QuotaPersistence } from '@/lib/sports/infra/quota';
import type { MappingStore } from '@/lib/sports/data-layer';
import type { FunnelTier } from '@/lib/sports/domain/funnel';
import type { TipCandidate } from '@/lib/sports/domain/evaluate';
import type {
  AnalysisState,
  FixtureStatus,
  LiveDisplayState,
  NormalizedFixture,
  NormalizedStatistics,
  OddsQuote,
  ProviderKey,
} from '@/lib/sports/domain/models';

/**
 * Persistência da camada esportiva: partidas, casamentos entre provedores,
 * snapshots, odds, cache e quota. Tudo SQL explícito, como no restante.
 */

// ---------------------------------------------------------------------------
// Partidas
// ---------------------------------------------------------------------------
export interface FixtureRow {
  id: string;
  league_key: string;
  league_name: string;
  league_country: string;
  home_key: string;
  home_name: string;
  away_key: string;
  away_name: string;
  start_time: Date;
  status: FixtureStatus;
  minute: number | null;
  home_score: number;
  away_score: number;
  provider_ids: Record<string, string>;
  payload: NormalizedFixture;
  analysis_state: AnalysisState;
  live_state: LiveDisplayState;
  funnel_tier: FunnelTier;
  interest_score: number;
  best_score: number;
  strategy_states: Record<string, AnalysisState>;
  evaluation: { candidates: TipCandidate[]; evaluatedAt: string } | null;
  has_odds: boolean;
  data_stale: boolean;
  last_refreshed_at: Date | null;
  last_evaluated_at: Date | null;
  last_snapshot_minute: number | null;
  updated_at: Date;
}

export interface StoredFixture {
  fixture: NormalizedFixture;
  analysisState: AnalysisState;
  liveState: LiveDisplayState;
  funnelTier: FunnelTier;
  interestScore: number;
  bestScore: number;
  strategyStates: Record<string, AnalysisState>;
  candidates: TipCandidate[];
  evaluatedAt: string | null;
  hasOdds: boolean;
  stale: boolean;
  lastRefreshedAt: string | null;
  lastSnapshotMinute: number | null;
}

function mapStored(row: FixtureRow): StoredFixture {
  return {
    fixture: row.payload,
    analysisState: row.analysis_state,
    liveState: row.live_state,
    funnelTier: row.funnel_tier,
    interestScore: row.interest_score,
    bestScore: row.best_score,
    strategyStates: row.strategy_states ?? {},
    candidates: row.evaluation?.candidates ?? [],
    evaluatedAt: row.evaluation?.evaluatedAt ?? null,
    hasOdds: row.has_odds,
    stale: row.data_stale,
    lastRefreshedAt: row.last_refreshed_at ? row.last_refreshed_at.toISOString() : null,
    lastSnapshotMinute: row.last_snapshot_minute,
  };
}

/** Insere ou atualiza a partida (dados brutos). Estado da análise fica intacto. */
export async function upsertFixture(fixture: NormalizedFixture, options: { refreshed?: boolean } = {}): Promise<void> {
  await query(
    `INSERT INTO sport_fixtures (
       id, league_key, league_name, league_country, home_key, home_name, away_key, away_name,
       start_time, status, minute, home_score, away_score, provider_ids, payload, has_odds, data_stale,
       last_refreshed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, CASE WHEN $18 THEN now() ELSE NULL END)
     ON CONFLICT (id) DO UPDATE SET
       league_key = EXCLUDED.league_key,
       league_name = EXCLUDED.league_name,
       league_country = EXCLUDED.league_country,
       home_name = EXCLUDED.home_name,
       away_name = EXCLUDED.away_name,
       start_time = EXCLUDED.start_time,
       status = EXCLUDED.status,
       minute = EXCLUDED.minute,
       home_score = EXCLUDED.home_score,
       away_score = EXCLUDED.away_score,
       provider_ids = sport_fixtures.provider_ids || EXCLUDED.provider_ids,
       payload = EXCLUDED.payload,
       has_odds = EXCLUDED.has_odds,
       data_stale = EXCLUDED.data_stale,
       last_refreshed_at = CASE WHEN $18 THEN now() ELSE sport_fixtures.last_refreshed_at END`,
    [
      fixture.id,
      fixture.league.key,
      fixture.league.name,
      fixture.league.country,
      fixture.homeTeam.key,
      fixture.homeTeam.name,
      fixture.awayTeam.key,
      fixture.awayTeam.name,
      fixture.startTime,
      fixture.status,
      fixture.minute,
      fixture.score.home,
      fixture.score.away,
      JSON.stringify(fixture.providerIds),
      JSON.stringify(fixture),
      (fixture.odds?.quotes.length ?? 0) > 0,
      fixture.metadata.stale,
      options.refreshed ?? true,
    ],
  );
}

export async function updateFixtureAnalysis(
  fixtureId: string,
  input: {
    analysisState: AnalysisState;
    liveState: LiveDisplayState;
    funnelTier?: FunnelTier;
    interestScore?: number;
    bestScore: number;
    strategyStates: Record<string, AnalysisState>;
    candidates: TipCandidate[];
    evaluatedAt: string;
  },
): Promise<void> {
  await query(
    `UPDATE sport_fixtures SET
       analysis_state = $2, live_state = $3,
       funnel_tier = coalesce($4, funnel_tier), interest_score = coalesce($5, interest_score),
       best_score = $6, strategy_states = $7, evaluation = $8, last_evaluated_at = now()
     WHERE id = $1`,
    [
      fixtureId,
      input.analysisState,
      input.liveState,
      input.funnelTier ?? null,
      input.interestScore ?? null,
      input.bestScore,
      JSON.stringify(input.strategyStates),
      JSON.stringify({ candidates: input.candidates, evaluatedAt: input.evaluatedAt }),
    ],
  );
}

export async function updateFunnel(assignments: readonly { fixtureId: string; tier: FunnelTier; interest: number }[]): Promise<void> {
  for (const item of assignments) {
    await query('UPDATE sport_fixtures SET funnel_tier = $2, interest_score = $3 WHERE id = $1', [item.fixtureId, item.tier, item.interest]);
  }
}

export async function getStoredFixture(id: string): Promise<StoredFixture | null> {
  const row = await queryOne<FixtureRow>('SELECT * FROM sport_fixtures WHERE id = $1', [id]);
  return row ? mapStored(row) : null;
}

/**
 * Existe alguma partida vinda de provedor real?
 *
 * Usada para impedir que o simulador escreva por cima de um banco de verdade.
 * Basta uma: se qualquer partida veio de provedor real, o banco não é de
 * desenvolvimento e não deve receber dado inventado.
 */
export async function hasRealFixtures(): Promise<boolean> {
  const row = await queryOne<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM sport_fixtures
       WHERE provider_ids ?| array['api-football','sportmonks','odds-api']
     ) AS existe`,
  );
  return row?.existe ?? false;
}

/**
 * Remove partidas simuladas e tudo que depende delas.
 *
 * Só apaga o que veio EXCLUSIVAMENTE do simulador: uma partida real que
 * também tenha id do mock (nunca deveria acontecer, mas o banco não garante)
 * permanece. Devolve quantas partidas e quantas dicas saíram.
 */
export async function purgeMockFixtures(): Promise<{ fixtures: number; tips: number }> {
  const tips = await query<{ id: string }>(
    `DELETE FROM bet_tips WHERE fixture_id IN (
       SELECT id FROM sport_fixtures
       WHERE provider_ids ? 'mock'
         AND NOT (provider_ids ?| array['api-football','sportmonks','odds-api'])
     ) RETURNING id`,
  );
  const fixtures = await query<{ id: string }>(
    `DELETE FROM sport_fixtures
     WHERE provider_ids ? 'mock'
       AND NOT (provider_ids ?| array['api-football','sportmonks','odds-api'])
     RETURNING id`,
  );
  return { fixtures: fixtures.length, tips: tips.length };
}

export async function listFixturesBetween(from: Date, to: Date): Promise<StoredFixture[]> {
  const rows = await query<FixtureRow>(
    'SELECT * FROM sport_fixtures WHERE start_time >= $1 AND start_time < $2 ORDER BY start_time ASC',
    [from, to],
  );
  return rows.map(mapStored);
}

export async function listLiveFixtures(): Promise<StoredFixture[]> {
  const rows = await query<FixtureRow>(
    `SELECT * FROM sport_fixtures WHERE status IN ('LIVE','HALFTIME') ORDER BY best_score DESC, start_time ASC`,
  );
  return rows.map(mapStored);
}

/** Partidas ao vivo que ficaram sem atualização há muito tempo (provedor sumiu). */
export async function markStaleLiveAsFinished(olderThanMinutes: number): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE sport_fixtures SET status = 'FINISHED', minute = 90, data_stale = TRUE
     WHERE status IN ('LIVE','HALFTIME') AND start_time < now() - ($1 || ' minutes')::interval
     RETURNING id`,
    [String(olderThanMinutes)],
  );
  return rows.length;
}

export async function listFixturesByIds(ids: readonly string[]): Promise<StoredFixture[]> {
  if (ids.length === 0) return [];
  const rows = await query<FixtureRow>('SELECT * FROM sport_fixtures WHERE id = ANY($1::text[])', [[...ids]]);
  return rows.map(mapStored);
}

export async function listDistinctLeagues(from: Date, to: Date): Promise<{ key: string; name: string; country: string }[]> {
  return query<{ key: string; name: string; country: string }>(
    `SELECT DISTINCT league_key AS key, league_name AS name, league_country AS country
     FROM sport_fixtures WHERE start_time >= $1 AND start_time < $2 ORDER BY league_name`,
    [from, to],
  );
}

// ---------------------------------------------------------------------------
// Snapshots ao vivo e histórico de odds
// ---------------------------------------------------------------------------
export async function insertLiveSnapshot(input: {
  fixtureId: string;
  minute: number;
  score: { home: number; away: number };
  statistics: NormalizedStatistics | null;
  quotes: readonly OddsQuote[];
  bestScore: number;
  analysisState: AnalysisState;
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO live_snapshots (fixture_id, minute, home_score, away_score, statistics, quotes, best_score, analysis_state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (fixture_id, minute) DO NOTHING RETURNING id`,
    [
      input.fixtureId,
      input.minute,
      input.score.home,
      input.score.away,
      input.statistics ? JSON.stringify(input.statistics) : null,
      JSON.stringify(input.quotes),
      input.bestScore,
      input.analysisState,
    ],
  );
  if (rows.length > 0) {
    await query('UPDATE sport_fixtures SET last_snapshot_minute = $2 WHERE id = $1', [input.fixtureId, input.minute]);
  }
  return rows.length > 0;
}

export async function countSnapshots(fixtureId: string): Promise<number> {
  const row = await queryOne<{ total: string }>('SELECT count(*)::text AS total FROM live_snapshots WHERE fixture_id = $1', [fixtureId]);
  return Number(row?.total ?? 0);
}

export interface SnapshotRow {
  minute: number;
  home_score: number;
  away_score: number;
  statistics: NormalizedStatistics | null;
  quotes: OddsQuote[] | null;
  best_score: number;
  analysis_state: AnalysisState;
  captured_at: Date;
}

export async function listSnapshots(fixtureId: string): Promise<SnapshotRow[]> {
  return query<SnapshotRow>('SELECT * FROM live_snapshots WHERE fixture_id = $1 ORDER BY minute ASC', [fixtureId]);
}

export async function insertOddsSnapshots(fixtureId: string, quotes: readonly OddsQuote[]): Promise<void> {
  if (quotes.length === 0) return;
  // Uma linha por (mercado, seleção, casa) por captura; evita duplicar a
  // mesma cotação vista no mesmo minuto.
  const seen = new Set<string>();
  for (const quote of quotes) {
    const key = `${quote.market}:${quote.selection}:${quote.line ?? ''}:${quote.bookmaker}:${quote.oddMilli}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await query(
      `INSERT INTO odds_snapshots (fixture_id, market_key, selection, line_milli, bookmaker, odd_milli, provider, captured_at)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8
       WHERE NOT EXISTS (
         SELECT 1 FROM odds_snapshots
         WHERE fixture_id = $1 AND market_key = $2 AND selection = $3 AND coalesce(line_milli, -1) = coalesce($4, -1)
           AND bookmaker = $5 AND odd_milli = $6 AND captured_at > now() - INTERVAL '10 minutes'
       )`,
      [
        fixtureId,
        quote.market,
        quote.selection,
        quote.line === null ? null : Math.round(quote.line * 1000),
        quote.bookmaker,
        quote.oddMilli,
        quote.provider,
        quote.capturedAt,
      ],
    );
  }
}

export interface OddsHistoryRow {
  market_key: string;
  selection: string;
  line_milli: number | null;
  bookmaker: string;
  odd_milli: number;
  provider: string;
  captured_at: Date;
}

export async function listOddsHistory(fixtureId: string, limit = 200): Promise<OddsHistoryRow[]> {
  return query<OddsHistoryRow>(
    'SELECT market_key, selection, line_milli, bookmaker, odd_milli, provider, captured_at FROM odds_snapshots WHERE fixture_id = $1 ORDER BY captured_at DESC LIMIT $2',
    [fixtureId, limit],
  );
}

// ---------------------------------------------------------------------------
// Mapping entre provedores e aliases
// ---------------------------------------------------------------------------
export class DbMappingStore implements MappingStore {
  private aliasCache: { value: Record<string, string>; at: number } | null = null;

  async getProviderId(provider: ProviderKey, entityType: 'fixture' | 'team', internalId: string): Promise<string | null> {
    const row = await queryOne<{ provider_id: string }>(
      'SELECT provider_id FROM provider_mapping WHERE provider = $1 AND entity_type = $2 AND internal_id = $3 ORDER BY confidence_bps DESC LIMIT 1',
      [provider, entityType, internalId],
    );
    return row?.provider_id ?? null;
  }

  async saveMapping(provider: ProviderKey, entityType: 'fixture' | 'team', providerId: string, internalId: string, confidenceBps: number): Promise<void> {
    await query(
      `INSERT INTO provider_mapping (provider, entity_type, provider_id, internal_id, confidence_bps)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (provider, entity_type, provider_id) DO UPDATE SET internal_id = EXCLUDED.internal_id, confidence_bps = EXCLUDED.confidence_bps`,
      [provider, entityType, providerId, internalId, confidenceBps],
    );
  }

  async getAliases(): Promise<Record<string, string>> {
    if (this.aliasCache && Date.now() - this.aliasCache.at < 10 * 60_000) return this.aliasCache.value;
    const rows = await query<{ key: string; aliases: string[] }>('SELECT key, aliases FROM sport_teams');
    const aliases: Record<string, string> = {};
    for (const row of rows) for (const alias of row.aliases ?? []) aliases[alias] = row.key;
    this.aliasCache = { value: aliases, at: Date.now() };
    return aliases;
  }
}

/** Registra o time e acrescenta o nome visto como alias (idempotente). */
export async function rememberTeam(team: { key: string; name: string; country: string | null; providerIds: Record<string, string | undefined> }, seenAs: string): Promise<void> {
  await query(
    `INSERT INTO sport_teams (key, name, country, aliases, provider_ids)
     VALUES ($1, $2, $3, ARRAY[$4]::text[], $5)
     ON CONFLICT (key) DO UPDATE SET
       aliases = (SELECT ARRAY(SELECT DISTINCT unnest(sport_teams.aliases || ARRAY[$4]::text[]))),
       provider_ids = sport_teams.provider_ids || EXCLUDED.provider_ids`,
    [team.key, team.name, team.country, seenAs, JSON.stringify(team.providerIds)],
  );
}

// ---------------------------------------------------------------------------
// Cache persistente
// ---------------------------------------------------------------------------
export class DbCachePersistence implements CachePersistence {
  async get(key: string): Promise<CacheRecord | null> {
    const row = await queryOne<{ value: unknown; stored_at: Date; expires_at: Date }>(
      'SELECT value, stored_at, expires_at FROM sports_cache WHERE key = $1',
      [key],
    );
    if (!row) return null;
    return { value: row.value, storedAt: row.stored_at.getTime(), expiresAt: row.expires_at.getTime() };
  }

  async set(key: string, record: CacheRecord): Promise<void> {
    await query(
      `INSERT INTO sports_cache (key, value, stored_at, expires_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, stored_at = EXCLUDED.stored_at, expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify(record.value), new Date(record.storedAt), new Date(record.expiresAt)],
    );
  }

  async delete(key: string): Promise<void> {
    await query('DELETE FROM sports_cache WHERE key = $1', [key]);
  }
}

/** Limpeza: entradas vencidas há mais de um dia. */
export async function purgeExpiredCache(): Promise<number> {
  const rows = await query<{ key: string }>("DELETE FROM sports_cache WHERE expires_at < now() - INTERVAL '1 day' RETURNING key");
  return rows.length;
}

// ---------------------------------------------------------------------------
// Quota persistente
// ---------------------------------------------------------------------------
interface UsageRow {
  provider: ProviderKey;
  requests_used: number;
  request_limit: number | null;
  remaining: number | null;
  reset_at: Date | null;
  last_request_at: Date | null;
  status: ProviderQuotaState['status'];
  window_started_at: Date;
  recent: number[];
}

export class DbQuotaPersistence implements QuotaPersistence {
  async load(provider: ProviderKey): Promise<ProviderQuotaState | null> {
    const row = await queryOne<UsageRow>('SELECT * FROM provider_usage WHERE provider = $1', [provider]);
    if (!row) return null;
    return {
      provider: row.provider,
      requestsUsed: row.requests_used,
      requestLimit: row.request_limit,
      remaining: row.remaining,
      resetAt: row.reset_at ? row.reset_at.toISOString() : null,
      lastRequestAt: row.last_request_at ? row.last_request_at.toISOString() : null,
      status: row.status,
      windowStartedAt: row.window_started_at.toISOString(),
      recent: Array.isArray(row.recent) ? row.recent : [],
    };
  }

  async save(state: ProviderQuotaState): Promise<void> {
    await query(
      `INSERT INTO provider_usage (provider, requests_used, request_limit, remaining, reset_at, last_request_at, status, window_started_at, recent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (provider) DO UPDATE SET
         requests_used = EXCLUDED.requests_used, request_limit = EXCLUDED.request_limit, remaining = EXCLUDED.remaining,
         reset_at = EXCLUDED.reset_at, last_request_at = EXCLUDED.last_request_at, status = EXCLUDED.status,
         window_started_at = EXCLUDED.window_started_at, recent = EXCLUDED.recent`,
      [
        state.provider,
        state.requestsUsed,
        state.requestLimit,
        state.remaining,
        state.resetAt,
        state.lastRequestAt,
        state.status,
        state.windowStartedAt,
        JSON.stringify(state.recent.slice(-60)),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Rotinas (cooldown entre instâncias)
// ---------------------------------------------------------------------------
export interface JobRow {
  job: string;
  last_run_at: Date | null;
  last_status: string;
  last_message: string | null;
  runs: number;
}

/**
 * Tenta "pegar" a rotina: só devolve true se a última execução foi há mais
 * de `cooldownSeconds`. A atualização é atômica, então duas instâncias não
 * rodam a mesma rotina ao mesmo tempo.
 */
export async function acquireJob(job: string, cooldownSeconds: number): Promise<boolean> {
  const rows = await query<{ job: string }>(
    `INSERT INTO sports_jobs (job, last_run_at, last_status, runs) VALUES ($1, now(), 'RUNNING', 1)
     ON CONFLICT (job) DO UPDATE SET last_run_at = now(), last_status = 'RUNNING', runs = sports_jobs.runs + 1
     WHERE sports_jobs.last_run_at IS NULL
        OR sports_jobs.last_run_at < now() - ($2 || ' seconds')::interval
        -- Rotina marcada como RUNNING e velha demais foi interrompida pela
        -- plataforma antes de gravar o fim (timeout da função serverless).
        -- Três minutos cobrem com folga o teto de 60 s de execução e liberam a
        -- vez antes do próximo disparo do agendador, que roda a cada cinco.
        OR (sports_jobs.last_status = 'RUNNING' AND sports_jobs.last_run_at < now() - INTERVAL '3 minutes')
     RETURNING job`,
    [job, String(cooldownSeconds)],
  );
  return rows.length > 0;
}

export async function finishJob(job: string, status: 'OK' | 'ERROR' | 'SKIPPED', message: string | null): Promise<void> {
  await query('UPDATE sports_jobs SET last_status = $2, last_message = $3 WHERE job = $1', [job, status, message]);
}

export async function listJobs(): Promise<JobRow[]> {
  return query<JobRow>('SELECT job, last_run_at, last_status, last_message, runs FROM sports_jobs ORDER BY job');
}

// ---------------------------------------------------------------------------
// Sobrescritas de estratégia
// ---------------------------------------------------------------------------
export interface StrategyOverrideRow {
  key: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
}

export async function listStrategyOverrides(): Promise<StrategyOverrideRow[]> {
  return query<StrategyOverrideRow>('SELECT key, is_enabled, config FROM bet_strategies');
}
