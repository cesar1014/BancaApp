import 'server-only';
import { fetchPublicPage } from '@/lib/bilhetes/sources/fetch-page';
import { SLIP_SOURCES } from '@/lib/bilhetes/sources';
import { dateInZone, addDaysIso, SAO_PAULO } from '@/lib/bilhetes/domain/dates';
import { leagueKeyFromText } from '@/lib/bilhetes/domain/leagues';
import { parseMarket } from '@/lib/bilhetes/domain/markets';
import {
  allLegsHaveOdds,
  bestAvailableOddMilli,
  combinedOddMilli,
  dedupeRawSlips,
  legMarginBps,
  settleSlip,
  slipComparison,
  slipProbability,
  slipDedupeHash,
  slipMarginBps,
  slipMoney,
} from '@/lib/bilhetes/domain/slip';
import { scoreCalls, type CallScore } from '@/lib/bilhetes/domain/calls';
import { listAllCallsForScore } from '@/lib/repos/calls';
import type { RawSlip, SlipLeg, SourceCountry } from '@/lib/bilhetes/domain/types';
import { matchLeg, type FixtureCandidate } from '@/lib/bilhetes/matching';
import {
  finishRun,
  getSlip,
  insertSlip,
  lastRun,
  lastRuns,
  listOpenSlips,
  listSlips,
  listSlipsByDate,
  listSlipsForPerformance,
  listSources,
  settleLeg,
  settleSlipRow,
  startRun,
  updateLegVerification,
  updateSlipVerification,
  type SlipFilters,
  type StoredSlip,
} from '@/lib/repos/bilhetes';
import { DbMappingStore, listFixturesBetween, listFixturesByIds, upsertFixture, type StoredFixture } from '@/lib/repos/sports';
import type { NormalizedFixture, OddsQuote, TipResult } from '@/lib/sports/domain/models';
import { computePerformance, type PerformanceMetrics } from '@/lib/sports/domain/performance';
import { findStrategyModuleByMarket } from '@/lib/sports/domain/strategies';
import { getSportsRuntime } from './sports/runtime';

/**
 * Bilhetes: coleta das fontes, conferência de odd real, margem acumulada,
 * liquidação e placar por fonte. As páginas leem só do banco; a coleta roda
 * pelo worker (cron) ou pelo botão do administrador.
 */

const REFERENCE_STAKE_CENTS = 10_000; // R$ 100,00
/** Uma requisição por fonte por dia: cooldown entre coletas bem-sucedidas. */
const SOURCE_COOLDOWN_HOURS = Number(process.env.BILHETES_SOURCE_COOLDOWN_HOURS ?? 6);
const ENABLED = (process.env.BILHETES_SOURCES ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export interface CollectReport {
  slug: string;
  status: 'OK' | 'EMPTY' | 'ERROR' | 'SKIPPED';
  found: number;
  created: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------
export async function collectAllSources(options: { force?: boolean; now?: Date } = {}): Promise<CollectReport[]> {
  const now = options.now ?? new Date();
  const sources = await listSources();
  const reports: CollectReport[] = [];
  for (const source of sources) {
    if (!source.is_active) {
      reports.push({ slug: source.slug, status: 'SKIPPED', found: 0, created: 0, message: 'fonte desligada' });
      continue;
    }
    if (ENABLED.length > 0 && !ENABLED.includes(source.slug)) {
      reports.push({ slug: source.slug, status: 'SKIPPED', found: 0, created: 0, message: 'fora de BILHETES_SOURCES' });
      continue;
    }
    reports.push(await collectSource(source.slug, { force: options.force ?? false, now }));
  }
  // Depois de coletar, confere odds e liquida o que der.
  await verifyOpenSlips(now);
  await settleOpenSlips(now);
  return reports;
}

export async function collectSource(slug: string, options: { force: boolean; now: Date }): Promise<CollectReport> {
  const source = SLIP_SOURCES.find((s) => s.slug === slug);
  if (!source) return { slug, status: 'ERROR', found: 0, created: 0, message: 'adaptador não encontrado' };

  // Cooldown: só volta na fonte depois do intervalo, salvo forçado.
  const previous = await lastRun(slug);
  if (!options.force && previous && previous.status !== 'ERROR' && previous.finished_at) {
    const hours = (options.now.getTime() - previous.finished_at.getTime()) / 3_600_000;
    if (hours < SOURCE_COOLDOWN_HOURS) {
      return { slug, status: 'SKIPPED', found: 0, created: 0, message: `cooldown (${Math.round(hours * 10) / 10} h)` };
    }
  }

  const runId = await startRun(slug);
  try {
    const raw = await source.fetchSlips({ now: options.now, fetchPage: fetchPublicPage });
    const today = dateInZone(options.now, source.country === 'BR' ? SAO_PAULO : 'UTC');
    // Só o que ainda pode ser conferido: hoje em diante (ontem entra se ainda não fechou).
    const fresh = dedupeRawSlips(raw.filter((slip) => slip.referenceDate >= addDaysIso(today, -1) && slip.legs.length > 0));
    let created = 0;
    for (const slip of fresh) {
      const id = await persistSlip(slug, slip);
      if (id) created += 1;
    }
    const status = fresh.length === 0 ? 'EMPTY' : 'OK';
    await finishRun(runId, { status, found: fresh.length, created });
    return { slug, status, found: fresh.length, created, message: fresh.length === 0 ? 'sem dados hoje' : `${fresh.length} bilhete(s), ${created} novo(s)` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(runId, { status: 'ERROR', found: 0, created: 0, error: message.slice(0, 500) });
    console.warn(`[bilhetes] fonte ${slug} falhou: ${message}`);
    return { slug, status: 'ERROR', found: 0, created: 0, message };
  }
}

async function persistSlip(slug: string, raw: RawSlip): Promise<string | null> {
  const parsed = raw.legs.map((leg, index) => ({ index, ...parseMarket(leg.market, leg.selection, leg.homeName, leg.awayName) }));
  const computed = allLegsHaveOdds(raw.legs) ? combinedOddMilli(raw.legs) : null;
  return insertSlip(slug, raw, slipDedupeHash(raw.legs), parsed, computed, REFERENCE_STAKE_CENTS);
}

// ---------------------------------------------------------------------------
// Conferência: casamento + odd real + margem
// ---------------------------------------------------------------------------
function candidatesFrom(fixtures: readonly StoredFixture[]): FixtureCandidate[] {
  return fixtures.map((s) => ({
    id: s.fixture.id,
    homeName: s.fixture.homeTeam.name,
    awayName: s.fixture.awayTeam.name,
    startTime: s.fixture.startTime,
    leagueKey: s.fixture.league.key,
  }));
}

function countryOf(slug: string): SourceCountry {
  return SLIP_SOURCES.find((s) => s.slug === slug)?.country ?? 'INT';
}

export async function verifyOpenSlips(now: Date = new Date()): Promise<{ slips: number; verifiedLegs: number }> {
  const open = await listOpenSlips();
  if (open.length === 0) return { slips: 0, verifiedLegs: 0 };

  const dates = open.map((s) => s.referenceDate).sort();
  const from = new Date(`${dates[0]}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 3);
  const fixtures = await listFixturesBetween(from, to);
  const byId = new Map(fixtures.map((f) => [f.fixture.id, f]));
  const candidates = candidatesFrom(fixtures);
  const aliases = await new DbMappingStore().getAliases().catch(() => ({}));
  const runtime = getSportsRuntime();

  let verifiedLegs = 0;
  for (const slip of open) {
    const country = countryOf(slip.sourceSlug);
    const legs: SlipLeg[] = [];
    for (const leg of slip.legs) {
      let fixtureId = leg.fixtureId;
      let confidence = leg.matchConfidenceBps;
      if (!fixtureId) {
        const match = matchLeg(leg, slip.referenceDate, leagueKeyFromText(leg.league, country), candidates, aliases);
        if (match) {
          fixtureId = match.fixtureId;
          confidence = match.confidenceBps;
        }
      }

      let realOdd: ReturnType<typeof bestAvailableOddMilli> = null;
      let margin: number | null = null;
      if (fixtureId && leg.marketKey && leg.selectionKey) {
        const stored = byId.get(fixtureId);
        let quotes: OddsQuote[] = stored?.fixture.odds?.quotes ?? [];
        // Sem cotação guardada: pede à camada de dados (respeita quota; no mock é grátis).
        if (quotes.length === 0 && stored && stored.fixture.status !== 'FINISHED') {
          const fresh = await runtime.dataLayer.getOdds(stored.fixture, 'LOW');
          if (fresh.length > 0) {
            quotes = fresh;
            const updated: NormalizedFixture = { ...stored.fixture, odds: runtime.dataLayer.buildOdds(fresh) };
            await upsertFixture(updated, { refreshed: false });
            byId.set(fixtureId, { ...stored, fixture: updated });
          }
        }
        realOdd = bestAvailableOddMilli(leg, quotes);
        margin = realOdd ? legMarginBps(leg, quotes, realOdd.bookmaker) : null;
      }

      const next: SlipLeg = {
        ...leg,
        fixtureId,
        matchConfidenceBps: confidence,
        realOddMilli: realOdd?.oddMilli ?? leg.realOddMilli,
        realBookmaker: realOdd?.bookmaker ?? leg.realBookmaker,
        realCapturedAt: realOdd?.capturedAt ?? leg.realCapturedAt,
        marginBps: margin ?? leg.marginBps,
      };
      if (next.fixtureId !== leg.fixtureId || next.realOddMilli !== leg.realOddMilli || next.marginBps !== leg.marginBps) {
        await updateLegVerification(leg.id, {
          fixtureId: next.fixtureId,
          matchConfidenceBps: next.matchConfidenceBps,
          realOddMilli: next.realOddMilli,
          realBookmaker: next.realBookmaker,
          realCapturedAt: next.realCapturedAt,
          marginBps: next.marginBps,
        });
      }
      if (next.realOddMilli !== null) verifiedLegs += 1;
      legs.push(next);
    }

    const comparison = slipComparison({ informedOddMilli: slip.informedOddMilli, legs });
    const margin = slipMarginBps(legs);
    await updateSlipVerification(slip.id, {
      realOddMilli: comparison.realOddMilli,
      marginBps: margin.marginBps,
      marginKnownLegs: margin.knownLegs,
      verifiedLegs: comparison.verifiedLegs,
      verification: comparison.verification,
    });
  }
  void now;
  return { slips: open.length, verifiedLegs };
}

// ---------------------------------------------------------------------------
// Liquidação automática
// ---------------------------------------------------------------------------
export async function settleOpenSlips(now: Date = new Date()): Promise<{ settled: number; pending: number }> {
  const open = await listOpenSlips();
  if (open.length === 0) return { settled: 0, pending: 0 };
  const fixtureIds = [...new Set(open.flatMap((s) => s.legs.map((l) => l.fixtureId)).filter((id): id is string => id !== null))];
  const fixtures = new Map((await listFixturesByIds(fixtureIds)).map((f) => [f.fixture.id, f.fixture]));

  let settled = 0;
  let pending = 0;
  for (const slip of open) {
    const legStates: { result: TipResult | null; oddMilli: number | null; realOddMilli: number | null; unresolvable: boolean }[] = [];
    for (const leg of slip.legs) {
      let result = leg.result;
      let unresolvable = false;
      if (result === null) {
        const fixture = leg.fixtureId ? fixtures.get(leg.fixtureId) : null;
        if (fixture && fixture.status === 'FINISHED') {
          const strategyModule = leg.marketKey ? findStrategyModuleByMarket(leg.marketKey) : null;
          const outcome =
            strategyModule && leg.selectionKey
              ? strategyModule.settle({ market: leg.marketKey!, selection: leg.selectionKey, line: leg.line, minuteAt: null, scoreAt: { home: 0, away: 0 } }, fixture)
              : null;
          if (outcome) {
            await settleLeg(leg.id, outcome, 'AUTO');
            result = outcome;
          } else {
            unresolvable = true; // acabou, mas não dá para decidir com segurança
          }
        } else if (fixture && (fixture.status === 'CANCELLED' || fixture.status === 'POSTPONED')) {
          await settleLeg(leg.id, 'PUSH', 'AUTO');
          result = 'PUSH';
        } else if (!fixture) {
          // Sem casamento: depois de 2 dias, precisa de conferência manual.
          const kickoff = leg.kickoff ? new Date(leg.kickoff) : new Date(`${slip.referenceDate}T23:59:00Z`);
          if (now.getTime() - kickoff.getTime() > 2 * 24 * 3_600_000) unresolvable = true;
        }
      }
      legStates.push({ result, oddMilli: leg.oddMilli, realOddMilli: leg.realOddMilli, unresolvable });
    }

    const settlement = settleSlip(legStates, slip.informedOddMilli);
    if (settlement.status === 'SETTLED' && settlement.result) {
      const money = slipMoney(settlement.result, slip.stakeCents, settlement.effectiveOddMilli);
      await settleSlipRow(slip.id, { status: 'SETTLED', result: settlement.result, effectiveOddMilli: settlement.effectiveOddMilli, ...money });
      settled += 1;
    } else if (settlement.status !== slip.status) {
      await settleSlipRow(slip.id, { status: settlement.status, result: null, effectiveOddMilli: null, payoutCents: 0, profitCents: 0 });
      if (settlement.status === 'PENDING') pending += 1;
    } else if (slip.status === 'PENDING') {
      pending += 1;
    }
  }
  return { settled, pending };
}

/** Conferência manual de uma perna que o sistema não conseguiu decidir. */
export async function settleLegManually(legId: string, result: TipResult, now: Date = new Date()): Promise<void> {
  await settleLeg(legId, result, 'MANUAL');
  await settleOpenSlips(now);
}

// ---------------------------------------------------------------------------
// Placar por fonte
// ---------------------------------------------------------------------------
export interface SourceScore {
  slug: string;
  name: string;
  url: string;
  country: SourceCountry;
  isActive: boolean;
  metrics: PerformanceMetrics;
  open: number;
  pending: number;
  /** Amostra pequena: abaixo de 30 bilhetes resolvidos o ROI está no ruído. */
  smallSample: boolean;
  /**
   * Bilhetes resolvidos que ficaram FORA da conta por terem alguma perna que
   * não foi possível apurar. Contá-los enviesaria o placar para baixo, e
   * escondê-los sem dizer quantos são enganaria de outro jeito.
   */
  excludedIncomplete: number;
  /** Calls, quando a fonte é um canal de Telegram. */
  calls: CallScore | null;
  lastRun: { at: string; status: string; found: number; created: number; error: string | null } | null;
}

export async function loadSourceScores(): Promise<SourceScore[]> {
  const [sources, rows, runs, callRows] = await Promise.all([
    listSources(),
    listSlipsForPerformance(),
    lastRuns(),
    listAllCallsForScore(),
  ]);
  const runBySlug = new Map(runs.map((r) => [r.source_slug, r]));

  const callsBySlug = new Map<string, typeof callRows>();
  for (const call of callRows) {
    const lista = callsBySlug.get(call.sourceSlug);
    if (lista) lista.push(call);
    else callsBySlug.set(call.sourceSlug, [call]);
  }

  return sources
    .map((source) => {
      const todos = rows.filter((r) => r.source_slug === source.slug);
      // Só bilhete com todas as pernas apuradas entra na conta. Ver a nota em
      // listSlipsForPerformance: incluir os incompletos enviesa para o RED.
      const mine = todos.filter((r) => r.todas_pernas_apuradas);
      const excludedIncomplete = todos.filter(
        (r) => !r.todas_pernas_apuradas && r.status === 'SETTLED',
      ).length;
      const metrics = computePerformance(
        mine.map((r) => ({
          market: 'MATCH_WINNER' as const,
          leagueKey: source.slug,
          oddMilli: r.effective_odd_milli ?? r.informed_odd_milli ?? 1000,
          score: 0,
          evBps: 0,
          result: r.result,
          stakeCents: r.stake_cents,
          profitCents: r.profit_cents,
        })),
      );
      const run = runBySlug.get(source.slug);
      // Canal de Telegram não publica bilhete, publica call. Sem isto ele
      // aparecia zerado e "nunca coletada" nesta tela, contradizendo a aba
      // Calls, que mostrava o mesmo canal com oito palpites e cinco greens.
      const minhasCalls = callsBySlug.get(source.slug);
      const calls = minhasCalls ? scoreCalls(minhasCalls) : null;

      return {
        slug: source.slug,
        name: source.name,
        url: source.url,
        country: source.country,
        isActive: source.is_active,
        metrics,
        open: todos.filter((r) => r.status === 'OPEN').length,
        pending: todos.filter((r) => r.status === 'PENDING').length,
        smallSample: metrics.settled < 30,
        excludedIncomplete,
        calls,
        lastRun: run ? { at: (run.finished_at ?? run.started_at).toISOString(), status: run.status, found: run.slips_found, created: run.slips_new, error: run.error } : null,
      };
    })
    .sort((a, b) => {
      const roiA = a.metrics.roiBps ?? a.calls?.roiBps ?? -Infinity;
      const roiB = b.metrics.roiBps ?? b.calls?.roiBps ?? -Infinity;
      return roiB - roiA;
    });
}

// ---------------------------------------------------------------------------
// Leitura para as páginas
// ---------------------------------------------------------------------------
export interface SlipView extends StoredSlip {
  sourceName: string;
  sourceCountry: SourceCountry;
  comparison: ReturnType<typeof slipComparison>;
  /** Chance estimada de o bilhete inteiro bater. null sem preço nenhum. */
  probability: ReturnType<typeof slipProbability>;
  /** Odd usada nos filtros: a real conferida quando existe, senão a informada. */
  filterOddMilli: number | null;
}

function toView(slip: StoredSlip, sources: Map<string, { name: string; country: SourceCountry }>): SlipView {
  const source = sources.get(slip.sourceSlug);
  const comparison = slipComparison({ informedOddMilli: slip.informedOddMilli, legs: slip.legs });
  return {
    ...slip,
    sourceName: source?.name ?? slip.sourceSlug,
    sourceCountry: source?.country ?? 'INT',
    comparison,
    probability: slipProbability(slip),
    filterOddMilli: comparison.realOddMilli ?? slip.informedOddMilli,
  };
}

/** Ordenação padrão: fontes com melhor ROI histórico primeiro; dentro da fonte, mais pernas conferidas. */
function sortByScore(views: SlipView[], scores: SourceScore[]): SlipView[] {
  const rank = new Map(scores.map((s, index) => [s.slug, index]));
  return [...views].sort((a, b) => {
    const ra = rank.get(a.sourceSlug) ?? 99;
    const rb = rank.get(b.sourceSlug) ?? 99;
    if (ra !== rb) return ra - rb;
    if (a.verifiedLegs !== b.verifiedLegs) return b.verifiedLegs - a.verifiedLegs;
    return a.referenceDate.localeCompare(b.referenceDate);
  });
}

export interface SlipsPageView {
  slips: SlipView[];
  sources: SourceScore[];
  emptyReason: string | null;
}

export async function loadSlipsForDay(dateIso: string): Promise<SlipsPageView> {
  const [slips, scores] = await Promise.all([listSlipsByDate(dateIso, dateIso), loadSourceScores()]);
  const sourceMap = new Map(scores.map((s) => [s.slug, { name: s.name, country: s.country }]));
  const views = sortByScore(slips.map((s) => toView(s, sourceMap)), scores);
  return { slips: views, sources: scores, emptyReason: views.length === 0 ? emptyReason(scores) : null };
}

export async function loadUpcomingSlips(todayIso: string): Promise<SlipsPageView> {
  const [slips, scores] = await Promise.all([listSlipsByDate(addDaysIso(todayIso, 1), addDaysIso(todayIso, 7)), loadSourceScores()]);
  const sourceMap = new Map(scores.map((s) => [s.slug, { name: s.name, country: s.country }]));
  const views = sortByScore(slips.map((s) => toView(s, sourceMap)), scores);
  return { slips: views, sources: scores, emptyReason: views.length === 0 ? emptyReason(scores) : null };
}

export async function loadSlipHistory(filters: SlipFilters, page: number): Promise<{ page: Awaited<ReturnType<typeof listSlips>> & { views: SlipView[] }; sources: SourceScore[] }> {
  const [result, scores] = await Promise.all([listSlips(filters, { page, pageSize: 20 }), loadSourceScores()]);
  const sourceMap = new Map(scores.map((s) => [s.slug, { name: s.name, country: s.country }]));
  return { page: { ...result, views: result.slips.map((s) => toView(s, sourceMap)) }, sources: scores };
}

export async function loadSlipDetail(id: string): Promise<SlipView | null> {
  const slip = await getSlip(id);
  if (!slip) return null;
  const scores = await loadSourceScores();
  return toView(slip, new Map(scores.map((s) => [s.slug, { name: s.name, country: s.country }])));
}

function emptyReason(scores: SourceScore[]): string {
  const ran = scores.filter((s) => s.lastRun);
  if (ran.length === 0) return 'Nenhuma coleta foi executada ainda. Agende o worker ou use "Coletar agora" em Configurações.';
  const errors = ran.filter((s) => s.lastRun?.status === 'ERROR');
  const empty = ran.filter((s) => s.lastRun?.status === 'EMPTY');
  const parts: string[] = [];
  if (empty.length > 0) parts.push(`sem dados hoje em ${empty.map((s) => s.name).join(', ')}`);
  if (errors.length > 0) parts.push(`falha na coleta de ${errors.map((s) => s.name).join(', ')}`);
  const off = scores.filter((s) => !s.isActive);
  if (off.length > 0) parts.push(`${off.length} fonte(s) desligada(s)`);
  return parts.length > 0 ? `Última coleta: ${parts.join(' · ')}.` : 'As fontes não publicaram bilhetes para este dia.';
}
