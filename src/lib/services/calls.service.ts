import 'server-only';
import { parseChannelCalls, scoreCalls, type CallScore } from '@/lib/bilhetes/domain/calls';
import { fetchPublicPage } from '@/lib/bilhetes/sources/fetch-page';
import {
  listCallsBySource,
  listCallsForScore,
  listRecentCalls,
  listTelegramSources,
  upsertCall,
  type StoredCall,
  type TelegramSource,
} from '@/lib/repos/calls';

/**
 * Coleta e leitura das calls de canal aberto do Telegram.
 *
 * A página `t.me/s/<canal>` devolve as últimas ~20 mensagens e não exige login
 * nem chave. Uma visita traz de uma vez as calls novas E o resultado que o
 * canal editou nas antigas, então a mesma requisição faz os dois trabalhos.
 *
 * O intervalo é mais curto que o das fontes de site (uma vez por dia) por um
 * motivo concreto: um canal publica de 6 a 8 calls por dia e marca o resultado
 * editando o post. Visitando uma vez ao dia, metade dos resultados nunca seria
 * vista antes do post sair da primeira página. Ainda assim são poucas dezenas
 * de requisições diárias a um endereço do próprio Telegram — carga
 * insignificante para eles, e respeitosa.
 */

/** Intervalo mínimo entre duas visitas ao mesmo canal. */
export const CALLS_COOLDOWN_MINUTES = Number(process.env.CALLS_COOLDOWN_MINUTES ?? 20);

export interface CallsCollectReport {
  source: string;
  ok: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  skippedBeforeTracking: number;
  message: string;
}

/**
 * Visita um canal e grava o que encontrar.
 *
 * Posts anteriores a `tracking_since` são ignorados de propósito: o placar
 * vale a partir de quando passamos a acompanhar. Contar histórico antigo
 * dependeria de o canal ter marcado corretamente resultados de meses atrás, o
 * que ninguém pode verificar — e um placar que não se pode verificar é pior
 * que nenhum.
 */
export async function collectChannel(source: TelegramSource, now: Date = new Date()): Promise<CallsCollectReport> {
  const base = { source: source.slug, fetched: 0, inserted: 0, updated: 0, skippedBeforeTracking: 0 };

  const html = await fetchPublicPage(`https://t.me/s/${source.channel}`);
  if (!html) {
    return { ...base, ok: false, message: 'canal não respondeu ou está indisponível' };
  }

  const calls = parseChannelCalls(html, source.channel);
  if (calls.length === 0) {
    return { ...base, ok: true, message: 'nenhuma call reconhecida nesta página' };
  }

  const since = source.trackingSince ? new Date(source.trackingSince).getTime() : 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const call of calls) {
    if (new Date(call.postedAt).getTime() < since) {
      skipped += 1;
      continue;
    }
    try {
      const outcome = await upsertCall(source.slug, call, now);
      if (outcome === 'INSERTED') inserted += 1;
      else updated += 1;
    } catch {
      // Uma call malformada não derruba a coleta das outras.
    }
  }

  return {
    source: source.slug,
    ok: true,
    fetched: calls.length,
    inserted,
    updated,
    skippedBeforeTracking: skipped,
    message: `${calls.length} lidas · ${inserted} nova(s) · ${updated} atualizada(s)${skipped > 0 ? ` · ${skipped} anterior(es) ao acompanhamento` : ''}`,
  };
}

export async function collectAllChannels(now: Date = new Date()): Promise<CallsCollectReport[]> {
  const sources = (await listTelegramSources()).filter((source) => source.isActive);
  const reports: CallsCollectReport[] = [];
  for (const source of sources) {
    try {
      reports.push(await collectChannel(source, now));
    } catch (error) {
      reports.push({
        source: source.slug,
        ok: false,
        fetched: 0,
        inserted: 0,
        updated: 0,
        skippedBeforeTracking: 0,
        message: error instanceof Error ? error.message : 'falha na coleta',
      });
    }
  }
  return reports;
}

// ---------------------------------------------------------------------------
// Leitura para as páginas
// ---------------------------------------------------------------------------

export interface CallView extends StoredCall {
  sourceName: string;
  sourceUrl: string;
  channel: string;
}

export interface ChannelPanel {
  source: TelegramSource;
  score: CallScore;
  calls: CallView[];
}

export interface CallsPageView {
  panels: ChannelPanel[];
  /** Todas as calls, das mais recentes para as mais antigas. */
  recent: CallView[];
  emptyReason: string | null;
}

function toView(call: StoredCall, source: TelegramSource): CallView {
  return { ...call, sourceName: source.name, sourceUrl: source.url, channel: source.channel };
}

export async function loadCallsPage(): Promise<CallsPageView> {
  const sources = await listTelegramSources();
  if (sources.length === 0) {
    return { panels: [], recent: [], emptyReason: 'Nenhum canal cadastrado.' };
  }

  const byslug = new Map(sources.map((source) => [source.slug, source]));
  const panels: ChannelPanel[] = [];

  for (const source of sources) {
    const [calls, forScore] = await Promise.all([
      listCallsBySource(source.slug, 100),
      listCallsForScore(source.slug),
    ]);
    panels.push({ source, score: scoreCalls(forScore), calls: calls.map((call) => toView(call, source)) });
  }

  const recent = (await listRecentCalls(150))
    .map((call) => {
      const source = byslug.get(call.sourceSlug);
      return source ? toView(call, source) : null;
    })
    .filter((call): call is CallView => call !== null);

  const total = panels.reduce((sum, panel) => sum + panel.score.calls, 0);
  return {
    panels,
    recent,
    emptyReason:
      total === 0
        ? 'Ainda não coletamos nenhuma call. O placar começa do zero e conta o que os canais publicarem daqui pra frente.'
        : null,
  };
}
