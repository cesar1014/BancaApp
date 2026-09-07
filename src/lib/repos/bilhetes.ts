import 'server-only';
import { query, queryOne, withTransaction } from '@/lib/db';
import type { MarketKey, Selection, TipResult } from '@/lib/sports/domain/models';
import type { ParsedMarket, RawSlip, Slip, SlipLeg, SlipStatus, SlipVerification, SourceCountry } from '@/lib/bilhetes/domain/types';

/**
 * Persistência dos bilhetes: fontes, bilhetes, pernas e coletas.
 */

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------
export interface SourceRow {
  slug: string;
  name: string;
  url: string;
  country: SourceCountry;
  is_active: boolean;
  notes: string | null;
}

export async function listSources(): Promise<SourceRow[]> {
  return query<SourceRow>('SELECT slug, name, url, country, is_active, notes FROM tip_sources ORDER BY country, name');
}

export async function setSourceActive(slug: string, active: boolean): Promise<void> {
  await query('UPDATE tip_sources SET is_active = $2 WHERE slug = $1', [slug, active]);
}

// ---------------------------------------------------------------------------
// Coletas
// ---------------------------------------------------------------------------
export interface RunRow {
  id: string;
  source_slug: string;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  slips_found: number;
  slips_new: number;
  error: string | null;
}

export async function lastRun(slug: string): Promise<RunRow | null> {
  return queryOne<RunRow>('SELECT * FROM tip_source_runs WHERE source_slug = $1 ORDER BY started_at DESC LIMIT 1', [slug]);
}

export async function lastRuns(): Promise<RunRow[]> {
  return query<RunRow>(
    `SELECT DISTINCT ON (source_slug) * FROM tip_source_runs ORDER BY source_slug, started_at DESC`,
  );
}

export async function startRun(slug: string): Promise<string> {
  const row = await queryOne<{ id: string }>('INSERT INTO tip_source_runs (source_slug) VALUES ($1) RETURNING id', [slug]);
  if (!row) throw new Error('Falha ao registrar a coleta.');
  return row.id;
}

export async function finishRun(id: string, input: { status: 'OK' | 'EMPTY' | 'ERROR' | 'SKIPPED'; found: number; created: number; error?: string | null }): Promise<void> {
  await query(
    'UPDATE tip_source_runs SET finished_at = now(), status = $2, slips_found = $3, slips_new = $4, error = $5 WHERE id = $1',
    [id, input.status, input.found, input.created, input.error ?? null],
  );
}

// ---------------------------------------------------------------------------
// Bilhetes
// ---------------------------------------------------------------------------
interface SlipRow {
  id: string;
  source_slug: string;
  title: string;
  reference_date: string;
  source_url: string;
  informed_odd_milli: number | null;
  computed_odd_milli: number | null;
  real_odd_milli: number | null;
  margin_bps: number | null;
  margin_known_legs: number;
  legs_count: number;
  verified_legs: number;
  verification: SlipVerification;
  status: SlipStatus;
  result: TipResult | null;
  effective_odd_milli: number | null;
  stake_cents: number;
  payout_cents: number;
  profit_cents: number;
  collected_at: Date;
  verified_at: Date | null;
  settled_at: Date | null;
}

interface LegRow {
  id: string;
  slip_id: string;
  position: number;
  home_name: string;
  away_name: string;
  league: string | null;
  kickoff: Date | null;
  market_text: string;
  selection_text: string;
  market_key: MarketKey | null;
  selection_key: Selection | null;
  line_milli: number | null;
  label: string;
  odd_milli: number | null;
  real_odd_milli: number | null;
  real_bookmaker: string | null;
  real_captured_at: Date | null;
  margin_bps: number | null;
  fixture_id: string | null;
  match_confidence_bps: number | null;
  result: TipResult | null;
}

function mapLeg(row: LegRow): SlipLeg {
  return {
    id: row.id,
    position: row.position,
    homeName: row.home_name,
    awayName: row.away_name,
    league: row.league,
    kickoff: row.kickoff ? row.kickoff.toISOString() : null,
    market: row.market_text,
    selection: row.selection_text,
    marketKey: row.market_key,
    selectionKey: row.selection_key,
    line: row.line_milli === null ? null : row.line_milli / 1000,
    label: row.label,
    oddMilli: row.odd_milli,
    realOddMilli: row.real_odd_milli,
    realBookmaker: row.real_bookmaker,
    realCapturedAt: row.real_captured_at ? row.real_captured_at.toISOString() : null,
    marginBps: row.margin_bps,
    fixtureId: row.fixture_id,
    matchConfidenceBps: row.match_confidence_bps,
    result: row.result,
  };
}

function mapSlip(row: SlipRow, legs: SlipLeg[]): Slip & { marginKnownLegs: number; effectiveOddMilli: number | null } {
  return {
    id: row.id,
    sourceSlug: row.source_slug,
    title: row.title,
    referenceDate: row.reference_date,
    sourceUrl: row.source_url,
    informedOddMilli: row.informed_odd_milli,
    computedOddMilli: row.computed_odd_milli,
    realOddMilli: row.real_odd_milli,
    marginBps: row.margin_bps,
    marginKnownLegs: row.margin_known_legs,
    verification: row.verification,
    legsCount: row.legs_count,
    verifiedLegs: row.verified_legs,
    status: row.status,
    result: row.result,
    effectiveOddMilli: row.effective_odd_milli,
    stakeCents: row.stake_cents,
    payoutCents: row.payout_cents,
    profitCents: row.profit_cents,
    collectedAt: row.collected_at.toISOString(),
    settledAt: row.settled_at ? row.settled_at.toISOString() : null,
    legs,
  };
}

export type StoredSlip = ReturnType<typeof mapSlip>;

async function attachLegs(rows: SlipRow[]): Promise<StoredSlip[]> {
  if (rows.length === 0) return [];
  const legs = await query<LegRow>('SELECT * FROM tip_slip_legs WHERE slip_id = ANY($1::uuid[]) ORDER BY slip_id, position', [rows.map((r) => r.id)]);
  const bySlip = new Map<string, SlipLeg[]>();
  for (const leg of legs) (bySlip.get(leg.slip_id) ?? bySlip.set(leg.slip_id, []).get(leg.slip_id)!).push(mapLeg(leg));
  return rows.map((row) => mapSlip(row, bySlip.get(row.id) ?? []));
}

/** Insere o bilhete com as pernas; devolve null se já existia (dedupe). */
export async function insertSlip(
  slug: string,
  raw: RawSlip,
  dedupeHash: string,
  parsedLegs: readonly (ParsedMarket & { index: number })[],
  computedOddMilli: number | null,
  stakeCents: number,
): Promise<string | null> {
  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tip_slips (source_slug, title, reference_date, source_url, dedupe_hash, informed_odd_milli, computed_odd_milli, legs_count, stake_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (source_slug, reference_date, dedupe_hash) DO NOTHING RETURNING id`,
      [slug, raw.title.slice(0, 200), raw.referenceDate, raw.sourceUrl, dedupeHash, raw.totalOddMilli, computedOddMilli, raw.legs.length, stakeCents],
    );
    const slipId = inserted.rows[0]?.id;
    if (!slipId) return null;

    for (const [index, leg] of raw.legs.entries()) {
      const parsed = parsedLegs.find((p) => p.index === index);
      await client.query(
        `INSERT INTO tip_slip_legs
           (slip_id, position, home_name, away_name, league, kickoff, market_text, selection_text, market_key, selection_key, line_milli, label, odd_milli)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          slipId,
          index + 1,
          leg.homeName,
          leg.awayName,
          leg.league,
          leg.kickoff,
          leg.market,
          leg.selection,
          parsed?.market ?? null,
          parsed?.selection ?? null,
          parsed?.line === null || parsed?.line === undefined ? null : Math.round(parsed.line * 1000),
          parsed?.label ?? leg.market,
          leg.oddMilli,
        ],
      );
    }
    return slipId;
  });
}

export async function getSlip(id: string): Promise<StoredSlip | null> {
  const row = await queryOne<SlipRow>('SELECT * FROM tip_slips WHERE id = $1', [id]);
  return row ? ((await attachLegs([row]))[0] ?? null) : null;
}

export async function listSlipsByDate(from: string, to: string): Promise<StoredSlip[]> {
  const rows = await query<SlipRow>(
    'SELECT * FROM tip_slips WHERE reference_date >= $1::date AND reference_date <= $2::date ORDER BY reference_date ASC, collected_at ASC',
    [from, to],
  );
  return attachLegs(rows);
}

export async function listOpenSlips(): Promise<StoredSlip[]> {
  const rows = await query<SlipRow>("SELECT * FROM tip_slips WHERE status IN ('OPEN','PENDING') ORDER BY reference_date ASC");
  return attachLegs(rows);
}

export interface SlipFilters {
  sourceSlug?: string | null;
  status?: SlipStatus | null;
  result?: TipResult | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export async function listSlips(filters: SlipFilters, pagination: { page: number; pageSize: number }): Promise<{ slips: StoredSlip[]; total: number; page: number; pageCount: number }> {
  const conditions = ['TRUE'];
  const params: unknown[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.sourceSlug) conditions.push(`source_slug = ${bind(filters.sourceSlug)}`);
  if (filters.status) conditions.push(`status = ${bind(filters.status)}`);
  if (filters.result) conditions.push(`result = ${bind(filters.result)}`);
  if (filters.dateFrom) conditions.push(`reference_date >= ${bind(filters.dateFrom)}::date`);
  if (filters.dateTo) conditions.push(`reference_date <= ${bind(filters.dateTo)}::date`);
  const where = conditions.join(' AND ');

  const count = await queryOne<{ total: string }>(`SELECT count(*)::text AS total FROM tip_slips WHERE ${where}`, params);
  const total = Number(count?.total ?? 0);
  const pageSize = Math.min(Math.max(pagination.pageSize, 5), 100);
  const page = Math.max(1, pagination.page);
  const rows = await query<SlipRow>(
    `SELECT * FROM tip_slips WHERE ${where} ORDER BY reference_date DESC, collected_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { slips: await attachLegs(rows), total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Forma mínima para o placar por fonte. */
export interface SlipPerformanceRow {
  source_slug: string;
  informed_odd_milli: number | null;
  effective_odd_milli: number | null;
  result: TipResult | null;
  stake_cents: number;
  profit_cents: number;
  status: SlipStatus;
}

/**
 * Bilhetes para o placar, com a marca de APURAÇÃO COMPLETA.
 *
 * `todas_pernas_apuradas` é o que separa um resultado confiável de um viés.
 * Um bilhete vira RED assim que UMA perna perde, mas só vira GREEN quando
 * TODAS resolvem. Quando parte das pernas não pode ser apurada — jogo que não
 * casou com o calendário, mercado que o parser não entendeu —, os RED
 * continuam fechando e os GREEN ficam presos.
 *
 * Medido no banco: 29 bilhetes tinham perna vencedora, nenhuma perdedora, e
 * estavam travados esperando perna que nunca resolveria; enquanto isso 46
 * fechavam como RED. O placar exibia −93,9% de yield como se fosse desempenho
 * da fonte, quando era, em boa parte, limitação nossa de casamento.
 *
 * Quem consome esta lista deve considerar só as linhas completas.
 */
export type SlipPerformanceCompleteRow = SlipPerformanceRow & {
  todas_pernas_apuradas: boolean;
  legs_total: number;
  legs_sem_resultado: number;
};

export async function listSlipsForPerformance(): Promise<SlipPerformanceCompleteRow[]> {
  return query<SlipPerformanceCompleteRow>(
    `SELECT t.source_slug, t.informed_odd_milli, t.effective_odd_milli, t.result,
            t.stake_cents, t.profit_cents, t.status,
            count(g.id)::int AS legs_total,
            count(*) FILTER (WHERE g.result IS NULL)::int AS legs_sem_resultado,
            (count(*) FILTER (WHERE g.result IS NULL) = 0) AS todas_pernas_apuradas
     FROM tip_slips t
     LEFT JOIN tip_slip_legs g ON g.slip_id = t.id
     GROUP BY t.id`,
  );
}

// ---------------------------------------------------------------------------
// Atualizações (conferência, casamento, liquidação)
// ---------------------------------------------------------------------------
export async function updateLegVerification(
  legId: string,
  input: { fixtureId: string | null; matchConfidenceBps: number | null; realOddMilli: number | null; realBookmaker: string | null; realCapturedAt: string | null; marginBps: number | null },
): Promise<void> {
  await query(
    `UPDATE tip_slip_legs SET fixture_id = $2, match_confidence_bps = $3, real_odd_milli = $4, real_bookmaker = $5, real_captured_at = $6, margin_bps = $7
     WHERE id = $1`,
    [legId, input.fixtureId, input.matchConfidenceBps, input.realOddMilli, input.realBookmaker, input.realCapturedAt, input.marginBps],
  );
}

export async function updateSlipVerification(
  slipId: string,
  input: { realOddMilli: number | null; marginBps: number | null; marginKnownLegs: number; verifiedLegs: number; verification: SlipVerification },
): Promise<void> {
  await query(
    `UPDATE tip_slips SET real_odd_milli = $2, margin_bps = $3, margin_known_legs = $4, verified_legs = $5, verification = $6, verified_at = now() WHERE id = $1`,
    [slipId, input.realOddMilli, input.marginBps, input.marginKnownLegs, input.verifiedLegs, input.verification],
  );
}

export async function settleLeg(legId: string, result: TipResult, by: 'AUTO' | 'MANUAL'): Promise<void> {
  await query('UPDATE tip_slip_legs SET result = $2, settled_at = now(), settled_by = $3 WHERE id = $1', [legId, result, by]);
}

export async function settleSlipRow(
  slipId: string,
  input: { status: SlipStatus; result: TipResult | null; effectiveOddMilli: number | null; payoutCents: number; profitCents: number },
): Promise<void> {
  await query(
    `UPDATE tip_slips SET status = $2, result = $3, effective_odd_milli = $4, payout_cents = $5, profit_cents = $6,
       settled_at = CASE WHEN $2 = 'SETTLED' THEN now() ELSE NULL END
     WHERE id = $1`,
    [slipId, input.status, input.result, input.effectiveOddMilli, input.payoutCents, input.profitCents],
  );
}
