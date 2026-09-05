import 'server-only';
import { query, queryOne } from '@/lib/db';
import type { CallResult, RawCall } from '@/lib/bilhetes/domain/calls';

/**
 * Persistência das calls de canal do Telegram.
 *
 * A gravação é sempre um upsert por (fonte, post): o canal EDITA o post para
 * marcar o resultado, então a mesma call é vista várias vezes ao longo do dia
 * e precisa evoluir de "pendente" para GREEN/RED/VOID sem virar linha nova.
 *
 * O que nunca é sobrescrito é o resultado já registrado. Se o canal apagar ou
 * trocar a marcação depois — o que acontece —, o placar continua contando o
 * que estava lá quando a aposta se resolveu. Um placar que muda o passado não
 * serve para julgar ninguém.
 */

export interface TelegramSource {
  slug: string;
  name: string;
  url: string;
  channel: string;
  trackingSince: string | null;
  isActive: boolean;
}

export interface StoredCall {
  id: string;
  sourceSlug: string;
  postId: string;
  postUrl: string;
  postedAt: string;
  selection: string;
  teamHint: string | null;
  unitsCentis: number | null;
  oddMilli: number | null;
  bookmaker: string | null;
  result: CallResult | null;
  settledAt: string | null;
  collectedAt: string;
}

interface CallRow {
  id: string;
  source_slug: string;
  post_id: string;
  post_url: string;
  posted_at: Date;
  selection: string;
  team_hint: string | null;
  units_centis: number | null;
  odd_milli: number | null;
  bookmaker: string | null;
  result: CallResult | null;
  settled_at: Date | null;
  collected_at: Date;
}

function mapCall(row: CallRow): StoredCall {
  return {
    id: row.id,
    sourceSlug: row.source_slug,
    postId: row.post_id,
    postUrl: row.post_url,
    postedAt: row.posted_at.toISOString(),
    selection: row.selection,
    teamHint: row.team_hint,
    unitsCentis: row.units_centis,
    oddMilli: row.odd_milli,
    bookmaker: row.bookmaker,
    result: row.result,
    settledAt: row.settled_at ? row.settled_at.toISOString() : null,
    collectedAt: row.collected_at.toISOString(),
  };
}

export async function listTelegramSources(): Promise<TelegramSource[]> {
  const rows = await query<{
    slug: string;
    name: string;
    url: string;
    channel: string;
    tracking_since: Date | null;
    is_active: boolean;
  }>(
    `SELECT slug, name, url, channel, tracking_since, is_active
     FROM tip_sources WHERE kind = 'TELEGRAM' ORDER BY name`,
  );
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    url: row.url,
    channel: row.channel,
    trackingSince: row.tracking_since ? row.tracking_since.toISOString() : null,
    isActive: row.is_active,
  }));
}

/**
 * Grava (ou atualiza) uma call.
 *
 * COALESCE no resultado é o ponto central: uma call já resolvida não volta a
 * pendente porque o canal editou o post de novo, e `settled_at` guarda quando
 * NÓS vimos o resultado, não quando o canal alegou tê-lo publicado.
 */
export async function upsertCall(sourceSlug: string, call: RawCall, now: Date): Promise<'INSERTED' | 'UPDATED'> {
  const row = await queryOne<{ inserido: boolean }>(
    `INSERT INTO tip_calls
       (source_slug, post_id, post_url, posted_at, selection, team_hint,
        units_centis, odd_milli, bookmaker, result, settled_at, raw_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (source_slug, post_id) DO UPDATE SET
       selection    = EXCLUDED.selection,
       team_hint    = EXCLUDED.team_hint,
       units_centis = COALESCE(tip_calls.units_centis, EXCLUDED.units_centis),
       odd_milli    = COALESCE(tip_calls.odd_milli, EXCLUDED.odd_milli),
       bookmaker    = COALESCE(tip_calls.bookmaker, EXCLUDED.bookmaker),
       result       = COALESCE(tip_calls.result, EXCLUDED.result),
       settled_at   = CASE
                        WHEN tip_calls.result IS NOT NULL THEN tip_calls.settled_at
                        WHEN EXCLUDED.result IS NOT NULL THEN EXCLUDED.settled_at
                        ELSE NULL
                      END,
       raw_text     = EXCLUDED.raw_text,
       updated_at   = now()
     RETURNING (xmax = 0) AS inserido`,
    [
      sourceSlug,
      call.postId,
      call.postUrl,
      call.postedAt,
      call.selection,
      call.teamHint,
      call.unitsCentis,
      call.oddMilli,
      call.bookmaker,
      call.result,
      call.result === null ? null : now.toISOString(),
      call.rawText,
    ],
  );
  return row?.inserido ? 'INSERTED' : 'UPDATED';
}

export async function listCallsBySource(sourceSlug: string, limit = 200): Promise<StoredCall[]> {
  const rows = await query<CallRow>(
    `SELECT * FROM tip_calls WHERE source_slug = $1 ORDER BY posted_at DESC LIMIT $2`,
    [sourceSlug, limit],
  );
  return rows.map(mapCall);
}

export async function listRecentCalls(limit = 120): Promise<StoredCall[]> {
  const rows = await query<CallRow>(`SELECT * FROM tip_calls ORDER BY posted_at DESC LIMIT $1`, [limit]);
  return rows.map(mapCall);
}

/** Todas as calls de uma fonte, para o placar — sem o texto bruto. */
export async function listCallsForScore(
  sourceSlug: string,
): Promise<{ result: CallResult | null; oddMilli: number | null; unitsCentis: number | null }[]> {
  const rows = await query<{ result: CallResult | null; odd_milli: number | null; units_centis: number | null }>(
    `SELECT result, odd_milli, units_centis FROM tip_calls WHERE source_slug = $1`,
    [sourceSlug],
  );
  return rows.map((row) => ({ result: row.result, oddMilli: row.odd_milli, unitsCentis: row.units_centis }));
}
