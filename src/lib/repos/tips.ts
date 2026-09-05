import 'server-only';
import { query, queryOne } from '@/lib/db';
import type { TipCandidate } from '@/lib/sports/domain/evaluate';
import type {
  AnalysisState,
  BetTip,
  MarketKey,
  NormalizedStatistics,
  ScoreBreakdown,
  Selection,
  TipConfidence,
  TipResult,
  TipStatus,
} from '@/lib/sports/domain/models';
import type { TipLike } from '@/lib/sports/domain/performance';

interface TipRow {
  id: string;
  fixture_id: string;
  strategy_key: string;
  market_key: MarketKey;
  selection: Selection;
  line_milli: number | null;
  odd_milli: number;
  min_odd_milli: number;
  fair_odd_milli: number;
  probability_bps: number;
  value_bps: number;
  ev_bps: number;
  score: number;
  breakdown: ScoreBreakdown;
  confidence: TipConfidence;
  rationale: string;
  state: AnalysisState;
  status: TipStatus;
  bookmaker: string | null;
  odds_captured_at: Date | null;
  minute_at: number | null;
  home_score_at: number;
  away_score_at: number;
  stats_at: NormalizedStatistics | null;
  result: TipResult | null;
  stake_cents: number;
  payout_cents: number;
  profit_cents: number;
  entry_id: string | null;
  created_at: Date;
  updated_at: Date;
  settled_at: Date | null;
  // Joins
  league_key: string;
  league_name: string;
  home_name: string;
  away_name: string;
  start_time: Date;
  fixture_status: string;
  fixture_minute: number | null;
  fixture_home_score: number;
  fixture_away_score: number;
}

export interface TipWithFixture extends BetTip {
  leagueKey: string;
  leagueName: string;
  homeName: string;
  awayName: string;
  startTime: string;
  fixtureStatus: string;
  fixtureMinute: number | null;
  fixtureScore: { home: number; away: number };
}

function mapTip(row: TipRow): TipWithFixture {
  return {
    id: row.id,
    fixtureId: row.fixture_id,
    strategyKey: row.strategy_key,
    market: row.market_key,
    selection: row.selection,
    line: row.line_milli === null ? null : row.line_milli / 1000,
    oddMilli: row.odd_milli,
    minOddMilli: row.min_odd_milli,
    fairOddMilli: row.fair_odd_milli,
    probabilityBps: row.probability_bps,
    valueBps: row.value_bps,
    evBps: row.ev_bps,
    score: row.score,
    breakdown: row.breakdown ?? { total: row.score, items: [] },
    confidence: row.confidence,
    rationale: row.rationale,
    state: row.state,
    status: row.status,
    bookmaker: row.bookmaker,
    oddsCapturedAt: row.odds_captured_at ? row.odds_captured_at.toISOString() : null,
    minuteAt: row.minute_at,
    scoreAt: { home: row.home_score_at, away: row.away_score_at },
    statsAt: row.stats_at,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    settledAt: row.settled_at ? row.settled_at.toISOString() : null,
    result: row.result,
    stakeCents: row.stake_cents,
    payoutCents: row.payout_cents,
    profitCents: row.profit_cents,
    entryId: row.entry_id,
    leagueKey: row.league_key,
    leagueName: row.league_name,
    homeName: row.home_name,
    awayName: row.away_name,
    startTime: row.start_time.toISOString(),
    fixtureStatus: row.fixture_status,
    fixtureMinute: row.fixture_minute,
    fixtureScore: { home: row.fixture_home_score, away: row.fixture_away_score },
  };
}

const SELECT_TIP = `
  SELECT t.*, f.league_key, f.league_name, f.home_name, f.away_name, f.start_time,
         f.status AS fixture_status, f.minute AS fixture_minute,
         f.home_score AS fixture_home_score, f.away_score AS fixture_away_score
  FROM bet_tips t
  JOIN sport_fixtures f ON f.id = t.fixture_id
`;

/** Cria a dica se ainda não existir para (partida, estratégia, seleção). */
export async function createTipIfMissing(input: {
  fixtureId: string;
  candidate: TipCandidate;
  minuteAt: number | null;
  scoreAt: { home: number; away: number };
  statsAt: NormalizedStatistics | null;
  stakeCents: number;
}): Promise<TipWithFixture | null> {
  const c = input.candidate;
  if (c.oddMilli === null || c.valueBps === null || c.evBps === null) return null;
  const rows = await query<{ id: string }>(
    `INSERT INTO bet_tips (
       fixture_id, strategy_key, market_key, selection, line_milli, odd_milli, min_odd_milli, fair_odd_milli,
       probability_bps, value_bps, ev_bps, score, breakdown, confidence, rationale, state, status,
       bookmaker, odds_captured_at, minute_at, home_score_at, away_score_at, stats_at, stake_cents
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'ACTIVE',$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT (fixture_id, strategy_key, selection) DO NOTHING RETURNING id`,
    [
      input.fixtureId,
      c.strategyKey,
      c.market,
      c.selection,
      c.line === null ? null : Math.round(c.line * 1000),
      c.oddMilli,
      c.minOddMilli,
      c.fairOddMilli,
      c.probabilityBps,
      c.valueBps,
      c.evBps,
      c.score,
      JSON.stringify(c.breakdown),
      c.confidence,
      c.rationale.join(' · '),
      c.state,
      c.bookmaker,
      c.oddsCapturedAt,
      input.minuteAt,
      input.scoreAt.home,
      input.scoreAt.away,
      input.statsAt ? JSON.stringify(input.statsAt) : null,
      input.stakeCents,
    ],
  );
  const created = rows[0];
  if (!created) return null;
  return getTip(created.id);
}

export async function getTip(id: string): Promise<TipWithFixture | null> {
  const row = await queryOne<TipRow>(`${SELECT_TIP} WHERE t.id = $1`, [id]);
  return row ? mapTip(row) : null;
}

/** Atualiza score/odd/estado de uma dica ainda ativa (movimentação). */
export async function touchActiveTip(id: string, input: { state: AnalysisState; score: number; oddMilli: number | null; valueBps: number | null; oddsCapturedAt: string | null }): Promise<void> {
  await query(
    `UPDATE bet_tips SET state = $2, score = $3,
       odd_milli = coalesce($4, odd_milli), value_bps = coalesce($5, value_bps), odds_captured_at = coalesce($6, odds_captured_at)
     WHERE id = $1 AND status = 'ACTIVE'`,
    [id, input.state, input.score, input.oddMilli, input.valueBps, input.oddsCapturedAt],
  );
}

export async function settleTip(id: string, result: TipResult, money: { payoutCents: number; profitCents: number }): Promise<void> {
  await query(
    `UPDATE bet_tips SET status = 'SETTLED', result = $2, payout_cents = $3, profit_cents = $4, settled_at = now()
     WHERE id = $1 AND status = 'ACTIVE'`,
    [id, result, money.payoutCents, money.profitCents],
  );
}

export async function expireTip(id: string, reason: string): Promise<void> {
  await query(
    `UPDATE bet_tips SET status = 'EXPIRED', result = 'PUSH', payout_cents = stake_cents, profit_cents = 0, settled_at = now(),
       rationale = rationale || ' · ' || $2
     WHERE id = $1 AND status = 'ACTIVE'`,
    [id, reason],
  );
}

export async function listActiveTips(): Promise<TipWithFixture[]> {
  const rows = await query<TipRow>(`${SELECT_TIP} WHERE t.status = 'ACTIVE' ORDER BY t.score DESC, t.created_at DESC`);
  return rows.map(mapTip);
}

export async function listActiveTipsForFixture(fixtureId: string): Promise<TipWithFixture[]> {
  const rows = await query<TipRow>(`${SELECT_TIP} WHERE t.status = 'ACTIVE' AND t.fixture_id = $1`, [fixtureId]);
  return rows.map(mapTip);
}

export async function listTipsForFixture(fixtureId: string): Promise<TipWithFixture[]> {
  const rows = await query<TipRow>(`${SELECT_TIP} WHERE t.fixture_id = $1 ORDER BY t.created_at DESC`, [fixtureId]);
  return rows.map(mapTip);
}

export interface TipFilters {
  status?: TipStatus | null;
  result?: TipResult | null;
  market?: MarketKey | null;
  leagueKey?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  minScore?: number | null;
}

export interface TipPage {
  tips: TipWithFixture[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

function buildWhere(filters: TipFilters): { sql: string; params: unknown[] } {
  const conditions: string[] = ['TRUE'];
  const params: unknown[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.status) conditions.push(`t.status = ${bind(filters.status)}`);
  if (filters.result) conditions.push(`t.result = ${bind(filters.result)}`);
  if (filters.market) conditions.push(`t.market_key = ${bind(filters.market)}`);
  if (filters.leagueKey) conditions.push(`f.league_key = ${bind(filters.leagueKey)}`);
  if (filters.dateFrom) conditions.push(`t.created_at >= ${bind(filters.dateFrom)}::date`);
  if (filters.dateTo) conditions.push(`t.created_at < (${bind(filters.dateTo)}::date + INTERVAL '1 day')`);
  if (filters.minScore != null) conditions.push(`t.score >= ${bind(filters.minScore)}`);
  return { sql: conditions.join(' AND '), params };
}

export async function listTips(filters: TipFilters = {}, pagination: { page?: number; pageSize?: number } = {}): Promise<TipPage> {
  const page = Math.max(1, pagination.page ?? 1);
  const pageSize = Math.min(Math.max(pagination.pageSize ?? 25, 5), 200);
  const where = buildWhere(filters);

  const countRow = await queryOne<{ total: string }>(
    `SELECT count(*)::text AS total FROM bet_tips t JOIN sport_fixtures f ON f.id = t.fixture_id WHERE ${where.sql}`,
    where.params,
  );
  const total = Number(countRow?.total ?? 0);
  const rows = await query<TipRow>(
    `${SELECT_TIP} WHERE ${where.sql} ORDER BY t.created_at DESC LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
    [...where.params, pageSize, (page - 1) * pageSize],
  );
  return { tips: rows.map(mapTip), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Forma mínima para as métricas de performance (todas as dicas que atendem ao filtro). */
export async function listTipsForPerformance(filters: TipFilters = {}): Promise<(TipLike & { createdAt: string })[]> {
  const where = buildWhere(filters);
  const rows = await query<{
    market_key: MarketKey;
    league_key: string;
    odd_milli: number;
    score: number;
    ev_bps: number;
    result: TipResult | null;
    stake_cents: number;
    profit_cents: number;
    created_at: Date;
  }>(
    `SELECT t.market_key, f.league_key, t.odd_milli, t.score, t.ev_bps, t.result, t.stake_cents, t.profit_cents, t.created_at
     FROM bet_tips t JOIN sport_fixtures f ON f.id = t.fixture_id WHERE ${where.sql} ORDER BY t.created_at ASC`,
    where.params,
  );
  return rows.map((row) => ({
    market: row.market_key,
    leagueKey: row.league_key,
    oddMilli: row.odd_milli,
    score: row.score,
    evBps: row.ev_bps,
    result: row.result,
    stakeCents: row.stake_cents,
    profitCents: row.profit_cents,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function linkTipToEntry(tipId: string, entryId: string): Promise<void> {
  await query('UPDATE bet_tips SET entry_id = $2 WHERE id = $1', [tipId, entryId]);
}
