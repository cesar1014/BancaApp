import 'server-only';
import {
  getStoredFixture,
  listDistinctLeagues,
  listFixturesBetween,
  listJobs,
  listLiveFixtures,
  listOddsHistory,
  listSnapshots,
  type StoredFixture,
} from '@/lib/repos/sports';
import { listActiveTips, listTips, listTipsForFixture, listTipsForPerformance, type TipFilters, type TipWithFixture } from '@/lib/repos/tips';
import { ECONOMY_MODE_LABEL, type EconomyMode } from '@/lib/sports/config/cache-policy';
import type { TipCandidate } from '@/lib/sports/domain/evaluate';
import type { AnalysisState, LiveDisplayState, MarketKey, NormalizedFixture, ProviderKey, TipConfidence } from '@/lib/sports/domain/models';
import { PROVIDER_LABEL } from '@/lib/sports/domain/models';
import { computePerformanceBreakdown, type PerformanceBreakdown } from '@/lib/sports/domain/performance';
import { stateRank } from '@/lib/sports/domain/analysis-state';
import { getSportsCache } from '@/lib/sports/infra/cache';
import type { ProviderQuotaState } from '@/lib/sports/infra/quota';
import { refreshOnView } from './engine';
import { getSportsRuntime } from './runtime';

/**
 * Serviço de leitura da Central de Dicas: transforma o que está no banco em
 * modelos prontos para a interface. Nunca chama provedor diretamente — quem
 * busca dado é o motor (engine.ts).
 */

export interface StatLine {
  label: string;
  home: string;
  away: string;
}

export interface FixtureView {
  id: string;
  league: { key: string; name: string; country: string };
  homeName: string;
  awayName: string;
  startTime: string;
  status: NormalizedFixture['status'];
  minute: number | null;
  score: { home: number; away: number };
  liveState: LiveDisplayState;
  analysisState: AnalysisState;
  bestScore: number;
  funnelTier: StoredFixture['funnelTier'];
  best: TipCandidate | null;
  candidates: TipCandidate[];
  stats: StatLine[];
  pressure: { home: number | null; away: number | null };
  hasOdds: boolean;
  stale: boolean;
  sources: ProviderKey[];
  lastUpdated: string | null;
  confidence: NormalizedFixture['metadata']['confidence'];
  activeTips: TipWithFixture[];
}

function fmtXg(milli: number | null): string {
  return milli === null ? '—' : (milli / 1000).toFixed(2).replace('.', ',');
}

function num(value: number | null): string {
  return value === null ? '—' : String(value);
}

function statLines(fixture: NormalizedFixture): StatLine[] {
  const stats = fixture.statistics;
  if (!stats) return [];
  const lines: StatLine[] = [];
  const push = (label: string, home: number | null, away: number | null, format = num) => {
    if (home === null && away === null) return;
    lines.push({ label, home: format(home), away: format(away) });
  };
  push('Finalizações', stats.home.shots, stats.away.shots);
  push('No alvo', stats.home.shotsOnTarget, stats.away.shotsOnTarget);
  push('xG', stats.home.xgMilli, stats.away.xgMilli, fmtXg);
  push('Escanteios', stats.home.corners, stats.away.corners);
  push('Ataques perigosos', stats.home.dangerousAttacks, stats.away.dangerousAttacks);
  push('Posse', stats.home.possessionBps, stats.away.possessionBps, (v) => (v === null ? '—' : `${Math.round(v / 100)}%`));
  push('Cartões', (stats.home.yellowCards ?? 0) + (stats.home.redCards ?? 0), (stats.away.yellowCards ?? 0) + (stats.away.redCards ?? 0));
  return lines;
}

function pressureOf(fixture: NormalizedFixture, candidates: TipCandidate[]): { home: number | null; away: number | null } {
  // A pressão por lado vem dos sinais; aqui aproximamos pelo breakdown quando existe.
  const stats = fixture.statistics;
  if (!stats) return { home: null, away: null };
  const minute = Math.max(1, fixture.minute ?? 90);
  const score = (side: typeof stats.home) => {
    const parts: number[] = [];
    if (side.dangerousAttacks !== null) parts.push(Math.min(1, side.dangerousAttacks / minute / 1.1));
    if (side.shots !== null) parts.push(Math.min(1, side.shots / minute / 0.2));
    if (side.shotsOnTarget !== null) parts.push(Math.min(1, side.shotsOnTarget / minute / 0.075));
    if (side.corners !== null) parts.push(Math.min(1, side.corners / minute / 0.12));
    if (side.xgMilli !== null) parts.push(Math.min(1, side.xgMilli / minute / 22));
    if (side.possessionBps !== null) parts.push(Math.min(1, side.possessionBps / 7000));
    if (parts.length === 0) return null;
    return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
  };
  void candidates;
  return { home: score(stats.home), away: score(stats.away) };
}

function toView(stored: StoredFixture, activeTips: TipWithFixture[] = []): FixtureView {
  const fixture = stored.fixture;
  const applicable = stored.candidates.filter((c) => c.applicable);
  const best = applicable.length === 0 ? null : applicable.reduce((a, b) => (b.score > a.score ? b : a));
  return {
    id: fixture.id,
    league: { key: fixture.league.key, name: fixture.league.name, country: fixture.league.country },
    homeName: fixture.homeTeam.name,
    awayName: fixture.awayTeam.name,
    startTime: fixture.startTime,
    status: fixture.status,
    minute: fixture.minute,
    score: fixture.score,
    liveState: stored.liveState,
    analysisState: stored.analysisState,
    bestScore: stored.bestScore,
    funnelTier: stored.funnelTier,
    best,
    candidates: stored.candidates,
    stats: statLines(fixture),
    pressure: pressureOf(fixture, stored.candidates),
    hasOdds: stored.hasOdds,
    stale: stored.stale || fixture.metadata.stale,
    sources: fixture.metadata.sources,
    lastUpdated: stored.lastRefreshedAt ?? fixture.metadata.lastUpdated,
    confidence: fixture.metadata.confidence,
    activeTips: activeTips.filter((tip) => tip.fixtureId === fixture.id),
  };
}

const LIVE_ORDER: Record<LiveDisplayState, number> = {
  OPORTUNIDADE: 0,
  QUASE_ENTRADA: 1,
  ATENCAO: 2,
  MONITORANDO: 3,
  NORMAL: 4,
  ENCERRADA: 5,
};

// ---------------------------------------------------------------------------
// Destaques
// ---------------------------------------------------------------------------
export interface HighlightsView {
  tips: TipWithFixture[];
  candidates: FixtureView[];
  mode: EconomyMode;
  modeLabel: string;
  usingMock: boolean;
}

export async function loadHighlights(): Promise<HighlightsView> {
  const runtime = getSportsRuntime();
  await refreshOnView('live', runtime);
  await refreshOnView('settle', runtime);

  const [tips, live] = await Promise.all([listActiveTips(), listLiveFixtures()]);
  const tippedFixtures = new Set(tips.map((tip) => tip.fixtureId));
  const candidates = live
    .filter((s) => stateRank(s.analysisState) >= 3 && !tippedFixtures.has(s.fixture.id))
    .map((s) => toView(s))
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, 6);

  const mode = await runtime.dataLayer.economyMode();
  return { tips: tips.slice(0, 12), candidates, mode, modeLabel: ECONOMY_MODE_LABEL[mode], usingMock: runtime.providers.primary.key === 'mock' };
}

// ---------------------------------------------------------------------------
// Hoje / Próximos
// ---------------------------------------------------------------------------
export type TodayGroup = 'todas' | 'analisando' | 'oportunidade' | 'ignoradas';

export interface TodayFilters {
  league?: string | null;
  hour?: string | null; // "manha" | "tarde" | "noite"
  market?: MarketKey | null;
  confidence?: TipConfidence | null;
  group?: TodayGroup;
}

export interface TodayView {
  fixtures: FixtureView[];
  leagues: { key: string; name: string; country: string }[];
  counts: Record<TodayGroup, number>;
  timezone: string;
}

function dayBounds(dateIso: string, timezone: string): { from: Date; to: Date } {
  // Início do dia local (fuso da banca) em UTC, sem biblioteca externa.
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, 12));
  const local = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).format(guess);
  const offsetHours = 12 - Number(local);
  const from = new Date(Date.UTC(y, m - 1, d, offsetHours));
  return { from, to: new Date(from.getTime() + 24 * 3600 * 1000) };
}

function hourBand(startTime: string, timezone: string): 'manha' | 'tarde' | 'noite' {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(startTime)));
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
}

function groupOf(view: FixtureView): TodayGroup {
  if (view.activeTips.length > 0 || stateRank(view.analysisState) >= 5) return 'oportunidade';
  if (view.funnelTier === 'IGNORED') return 'ignoradas';
  return 'analisando';
}

export async function loadToday(dateIso: string, timezone: string, filters: TodayFilters = {}): Promise<TodayView> {
  const runtime = getSportsRuntime();
  await refreshOnView('fixtures', runtime);
  await refreshOnView('live', runtime);

  const bounds = dayBounds(dateIso, timezone);
  const [stored, tips, leagues] = await Promise.all([listFixturesBetween(bounds.from, bounds.to), listActiveTips(), listDistinctLeagues(bounds.from, bounds.to)]);
  const all = stored.map((s) => toView(s, tips));

  const counts: Record<TodayGroup, number> = { todas: all.length, analisando: 0, oportunidade: 0, ignoradas: 0 };
  for (const view of all) counts[groupOf(view)] += 1;

  const fixtures = all.filter((view) => {
    if (filters.league && view.league.key !== filters.league) return false;
    if (filters.hour && hourBand(view.startTime, timezone) !== filters.hour) return false;
    if (filters.market && !view.candidates.some((c) => c.market === filters.market && c.applicable)) return false;
    if (filters.confidence && (!view.best || view.best.confidence !== filters.confidence)) return false;
    if (filters.group && filters.group !== 'todas' && groupOf(view) !== filters.group) return false;
    return true;
  });

  return { fixtures, leagues, counts, timezone };
}

export interface UpcomingView {
  tomorrow: FixtureView[];
  later: { date: string; fixtures: FixtureView[] }[];
  timezone: string;
}

export async function loadUpcoming(todayIso: string, timezone: string): Promise<UpcomingView> {
  const runtime = getSportsRuntime();
  await refreshOnView('fixtures', runtime);

  const today = dayBounds(todayIso, timezone);
  const tomorrowFrom = today.to;
  const tomorrowTo = new Date(tomorrowFrom.getTime() + 24 * 3600 * 1000);
  const laterTo = new Date(tomorrowTo.getTime() + 5 * 24 * 3600 * 1000);

  const [tomorrowStored, laterStored] = await Promise.all([listFixturesBetween(tomorrowFrom, tomorrowTo), listFixturesBetween(tomorrowTo, laterTo)]);
  const byDate = new Map<string, FixtureView[]>();
  for (const stored of laterStored) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stored.fixture.startTime));
    (byDate.get(date) ?? byDate.set(date, []).get(date)!).push(toView(stored));
  }
  return {
    tomorrow: tomorrowStored.map((s) => toView(s)),
    later: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, fixtures]) => ({ date, fixtures })),
    timezone,
  };
}

// ---------------------------------------------------------------------------
// Ao vivo
// ---------------------------------------------------------------------------
export interface LiveView {
  fixtures: FixtureView[];
  mode: EconomyMode;
  modeLabel: string;
  refreshedAt: string;
}

export async function loadLive(): Promise<LiveView> {
  const runtime = getSportsRuntime();
  await refreshOnView('live', runtime);
  const [stored, tips] = await Promise.all([listLiveFixtures(), listActiveTips()]);
  const fixtures = stored
    .map((s) => toView(s, tips))
    .sort((a, b) => LIVE_ORDER[a.liveState] - LIVE_ORDER[b.liveState] || b.bestScore - a.bestScore || a.startTime.localeCompare(b.startTime));
  const mode = await runtime.dataLayer.economyMode();
  return { fixtures, mode, modeLabel: ECONOMY_MODE_LABEL[mode], refreshedAt: runtime.now().toISOString() };
}

// ---------------------------------------------------------------------------
// Detalhe de uma partida
// ---------------------------------------------------------------------------
export interface FixtureDetailView {
  fixture: FixtureView;
  raw: NormalizedFixture;
  tips: TipWithFixture[];
  snapshots: { minute: number; score: { home: number; away: number }; bestScore: number; state: AnalysisState; capturedAt: string }[];
  oddsHistory: { market: string; selection: string; line: number | null; bookmaker: string; oddMilli: number; provider: string; capturedAt: string }[];
}

export async function loadFixtureDetail(id: string): Promise<FixtureDetailView | null> {
  const stored = await getStoredFixture(id);
  if (!stored) return null;
  const [tips, snapshots, odds] = await Promise.all([listTipsForFixture(id), listSnapshots(id), listOddsHistory(id)]);
  return {
    fixture: toView(stored, tips.filter((tip) => tip.status === 'ACTIVE')),
    raw: stored.fixture,
    tips,
    snapshots: snapshots.map((s) => ({ minute: s.minute, score: { home: s.home_score, away: s.away_score }, bestScore: s.best_score, state: s.analysis_state, capturedAt: s.captured_at.toISOString() })),
    oddsHistory: odds.map((o) => ({ market: o.market_key, selection: o.selection, line: o.line_milli === null ? null : o.line_milli / 1000, bookmaker: o.bookmaker, oddMilli: o.odd_milli, provider: o.provider, capturedAt: o.captured_at.toISOString() })),
  };
}

// ---------------------------------------------------------------------------
// Histórico e performance
// ---------------------------------------------------------------------------
export interface HistoryView {
  page: Awaited<ReturnType<typeof listTips>>;
  performance: PerformanceBreakdown;
  leagues: { key: string; name: string }[];
}

export async function loadHistory(filters: TipFilters, page: number): Promise<HistoryView> {
  const runtime = getSportsRuntime();
  await refreshOnView('settle', runtime);
  const [tipsPage, all] = await Promise.all([listTips(filters, { page, pageSize: 25 }), listTipsForPerformance(filters)]);
  const leagues = new Map<string, string>();
  for (const tip of tipsPage.tips) leagues.set(tip.leagueKey, tip.leagueName);
  return { page: tipsPage, performance: computePerformanceBreakdown(all), leagues: [...leagues.entries()].map(([key, name]) => ({ key, name })) };
}

// ---------------------------------------------------------------------------
// Painel de provedores (administração)
// ---------------------------------------------------------------------------
export interface ProviderStatusView {
  mode: 'mock' | 'live';
  usingMockFallback: boolean;
  economyMode: EconomyMode;
  providers: { key: ProviderKey; label: string; configured: boolean; quota: ProviderQuotaState | null }[];
  cache: { hits: number; staleHits: number; misses: number; deduped: number };
  jobs: { job: string; lastRunAt: string | null; status: string; message: string | null; runs: number }[];
  refreshOnView: boolean;
}

export async function loadProviderStatus(): Promise<ProviderStatusView> {
  const runtime = getSportsRuntime();
  const [quota, jobs] = await Promise.all([runtime.dataLayer.quotaSnapshot(), listJobs().catch(() => [])]);
  const byKey = new Map(quota.map((q) => [q.provider, q]));
  return {
    mode: runtime.providers.mode,
    usingMockFallback: runtime.providers.usingMockFallback,
    economyMode: await runtime.dataLayer.economyMode(),
    providers: runtime.providers.all.map((provider) => ({ key: provider.key, label: PROVIDER_LABEL[provider.key], configured: provider.isConfigured(), quota: byKey.get(provider.key) ?? null })),
    cache: { ...getSportsCache().stats },
    jobs: jobs.map((job) => ({ job: job.job, lastRunAt: job.last_run_at ? job.last_run_at.toISOString() : null, status: job.last_status, message: job.last_message, runs: job.runs })),
    refreshOnView: runtime.refreshOnView,
  };
}
