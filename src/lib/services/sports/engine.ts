import 'server-only';
import {
  acquireJob,
  countSnapshots,
  finishJob,
  getStoredFixture,
  insertLiveSnapshot,
  insertOddsSnapshots,
  listFixturesBetween,
  listFixturesByIds,
  listLiveFixtures,
  listStrategyOverrides,
  markStaleLiveAsFinished,
  purgeExpiredCache,
  rememberTeam,
  updateFixtureAnalysis,
  updateFunnel,
  upsertFixture,
  type StoredFixture,
} from '@/lib/repos/sports';
import {
  createTipIfMissing,
  expireTip,
  listActiveTips,
  listActiveTipsForFixture,
  settleTip,
  touchActiveTip,
} from '@/lib/repos/tips';
import { JOB_COOLDOWN_SECONDS, FIXTURE_COOLDOWN_SECONDS } from '@/lib/sports/config/cache-policy';
import { ENGINE_CONFIG, STRATEGY_CONFIGS, type StrategyConfig } from '@/lib/sports/config/strategy-config';
import { evaluateFixture, identifiedEntries, type TipCandidate } from '@/lib/sports/domain/evaluate';
import { assignTiers, limitsForMode, type FunnelAssignment, type FunnelCandidate } from '@/lib/sports/domain/funnel';
import type { AnalysisState, NormalizedFixture } from '@/lib/sports/domain/models';
import { tipProfitCents } from '@/lib/sports/domain/performance';
import { STRATEGY_MODULES, type StrategyModule } from '@/lib/sports/domain/strategies';
import { sportsLog } from '@/lib/sports/infra/logger';
import { getSportsRuntime, type SportsRuntime } from './runtime';

/**
 * Bet Intelligence Engine — orquestração com I/O.
 *
 * Rotinas (cada uma com cooldown persistido, para que nem duas instâncias nem
 * duas abas disparem o mesmo trabalho):
 *   fixtures     calendário de hoje + próximos dias (1 chamada por dia)
 *   live         partidas ao vivo → funil → detalhes em lote → odds → avaliação
 *   odds         reavalia odds das partidas com dica/estado avançado
 *   settle       resolve dicas de partidas encerradas
 *   performance  materializa as métricas (leve)
 *
 * Nada aqui roda dentro da renderização de página, exceto quando
 * SPORTS_REFRESH_ON_VIEW permite um refresh sob demanda — e mesmo assim só
 * se o cooldown já passou.
 */

export type JobName = 'fixtures' | 'live' | 'odds' | 'settle' | 'performance';

export interface JobReport {
  job: JobName;
  ran: boolean;
  message: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Estratégias efetivas (código + sobrescritas do banco)
// ---------------------------------------------------------------------------
async function loadStrategies(): Promise<{ module: StrategyModule; config: StrategyConfig }[]> {
  let overrides: Awaited<ReturnType<typeof listStrategyOverrides>> = [];
  try {
    overrides = await listStrategyOverrides();
  } catch {
    /* tabela vazia ou indisponível: segue com o padrão */
  }
  const byKey = new Map(overrides.map((row) => [row.key, row]));

  const out: { module: StrategyModule; config: StrategyConfig }[] = [];
  for (const config of STRATEGY_CONFIGS) {
    const strategyModule = STRATEGY_MODULES.find((m) => m.key === config.key);
    if (!strategyModule) continue;
    const override = byKey.get(config.key);
    const merged: StrategyConfig = override
      ? {
          ...config,
          enabled: override.is_enabled,
          thresholds: { ...config.thresholds, ...((override.config.thresholds as Partial<StrategyConfig['thresholds']>) ?? {}) },
          weights: { ...config.weights, ...((override.config.weights as Partial<StrategyConfig['weights']>) ?? {}) },
          params: { ...config.params, ...((override.config.params as Record<string, number>) ?? {}) },
        }
      : config;
    out.push({ module: strategyModule, config: merged });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

async function withJob(job: JobName, cooldownSeconds: number, run: () => Promise<string>): Promise<JobReport> {
  const started = Date.now();
  const acquired = await acquireJob(job, cooldownSeconds);
  if (!acquired) {
    sportsLog('debug', 'worker.skip', { job });
    return { job, ran: false, message: 'cooldown', durationMs: 0 };
  }
  try {
    const message = await run();
    await finishJob(job, 'OK', message);
    sportsLog('info', 'worker.run', { job, message, durationMs: Date.now() - started });
    return { job, ran: true, message, durationMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishJob(job, 'ERROR', message);
    sportsLog('error', 'worker.run', { job, error: message });
    return { job, ran: true, message: `erro: ${message}`, durationMs: Date.now() - started };
  }
}

async function rememberTeams(fixture: NormalizedFixture): Promise<void> {
  try {
    await rememberTeam({ key: fixture.homeTeam.key, name: fixture.homeTeam.name, country: fixture.homeTeam.country, providerIds: fixture.homeTeam.providerIds }, fixture.homeTeam.name.toLowerCase());
    await rememberTeam({ key: fixture.awayTeam.key, name: fixture.awayTeam.name, country: fixture.awayTeam.country, providerIds: fixture.awayTeam.providerIds }, fixture.awayTeam.name.toLowerCase());
  } catch {
    /* aliases são melhor-esforço */
  }
}

function toFunnelCandidate(stored: StoredFixture): FunnelCandidate {
  const stats = stored.fixture.statistics;
  const shots = stats ? (stats.home.shots ?? 0) + (stats.away.shots ?? 0) : null;
  const minute = stored.fixture.minute ?? 0;
  return {
    fixtureId: stored.fixture.id,
    leaguePriority: stored.fixture.league.priority,
    status: stored.fixture.status,
    startTime: stored.fixture.startTime,
    hasOdds: stored.hasOdds,
    activity: shots === null || minute < 5 ? null : Math.min(1, shots / minute / 0.3),
    state: stored.analysisState,
  };
}

// ---------------------------------------------------------------------------
// Rotina: calendário
// ---------------------------------------------------------------------------
export async function runFixturesJob(runtime: SportsRuntime = getSportsRuntime(), daysAhead = 2): Promise<JobReport> {
  return withJob('fixtures', JOB_COOLDOWN_SECONDS.fixtures, async () => {
    const now = runtime.now();
    let total = 0;
    for (let offset = 0; offset <= daysAhead; offset += 1) {
      const date = isoDate(addDays(now, offset));
      const fixtures = await runtime.dataLayer.getFixturesForDate(date);
      for (const fixture of fixtures) {
        const stored = await getStoredFixture(fixture.id);
        // Não regride uma partida que já tem detalhe (estatísticas) para a versão "lista".
        if (stored && stored.fixture.statistics && !fixture.statistics && (fixture.status === 'LIVE' || fixture.status === 'HALFTIME')) continue;
        await upsertFixture(fixture, { refreshed: true });
        if (!stored) await rememberTeams(fixture);
        total += 1;
      }
    }

    // Funil inicial (interesse) para os jogos de hoje e amanhã.
    const stored = await listFixturesBetween(addDays(now, -0.5), addDays(now, daysAhead + 1));
    const mode = await runtime.dataLayer.economyMode();
    const assignments = assignTiers(stored.map(toFunnelCandidate), limitsForMode(mode), now);
    await updateFunnel(assignments);

    try {
      await purgeExpiredCache();
    } catch {
      /* ignora */
    }
    return `${total} partidas em ${daysAhead + 1} dia(s); modo ${mode}`;
  });
}

// ---------------------------------------------------------------------------
// Rotina: ao vivo (o coração do sistema)
// ---------------------------------------------------------------------------
export async function runLiveJob(runtime: SportsRuntime = getSportsRuntime()): Promise<JobReport> {
  return withJob('live', JOB_COOLDOWN_SECONDS.live, async () => {
    const now = runtime.now();
    const strategies = await loadStrategies();
    const mode = await runtime.dataLayer.economyMode();

    // 1) Lista do que está rolando (1 chamada) + o que está prestes a começar.
    const live = await runtime.dataLayer.getLiveFixtures();
    for (const fixture of live) {
      const stored = await getStoredFixture(fixture.id);
      if (stored && stored.fixture.statistics && !fixture.statistics) {
        // Mantém estatísticas já conhecidas até o detalhe chegar.
        await upsertFixture({ ...fixture, statistics: stored.fixture.statistics, events: fixture.events.length ? fixture.events : stored.fixture.events, odds: stored.fixture.odds }, { refreshed: true });
      } else {
        await upsertFixture({ ...fixture, odds: stored?.fixture.odds ?? fixture.odds }, { refreshed: true });
      }
      if (!stored) await rememberTeams(fixture);
    }
    await markStaleLiveAsFinished(200);

    // 2) Funil entre as partidas ao vivo e as que começam em até 2 h.
    const window = await listFixturesBetween(addDays(now, -0.2), new Date(now.getTime() + 2 * 3600 * 1000));
    const activeStored = window.filter((s) => s.fixture.status === 'LIVE' || s.fixture.status === 'HALFTIME' || s.fixture.status === 'SCHEDULED');
    const assignments = assignTiers(activeStored.map(toFunnelCandidate), limitsForMode(mode), now);
    await updateFunnel(assignments);
    const tierOf = new Map(assignments.map((a) => [a.fixtureId, a]));

    // 3) Detalhe em lote só para monitoradas/avançadas ao vivo (respeitando cooldown por estado).
    const liveStored = activeStored.filter((s) => s.fixture.status === 'LIVE' || s.fixture.status === 'HALFTIME');
    const wanted = liveStored.filter((s) => {
      const tier = tierOf.get(s.fixture.id)?.tier ?? 'IGNORED';
      if (tier !== 'MONITORED' && tier !== 'ADVANCED') return false;
      const cooldown = FIXTURE_COOLDOWN_SECONDS[s.analysisState] ?? 120;
      const last = s.evaluatedAt ? new Date(s.evaluatedAt).getTime() : 0;
      return now.getTime() - last >= cooldown * 1000;
    });

    const advanced = wanted.filter((s) => tierOf.get(s.fixture.id)?.tier === 'ADVANCED');
    const monitored = wanted.filter((s) => tierOf.get(s.fixture.id)?.tier === 'MONITORED');
    const detailedAdvanced = await runtime.dataLayer.getDetails(advanced.map((s) => s.fixture), 'HIGH');
    const detailedMonitored = await runtime.dataLayer.getDetails(monitored.map((s) => s.fixture), 'NORMAL');
    const detailed = new Map([...detailedAdvanced, ...detailedMonitored].map((f) => [f.id, f]));

    let evaluated = 0;
    let tipsCreated = 0;

    for (const stored of wanted) {
      const fixture = detailed.get(stored.fixture.id) ?? stored.fixture;
      const tier = tierOf.get(stored.fixture.id)?.tier ?? 'MONITORED';

      // 4) Odds: avançadas sempre; monitoradas só fora do modo crítico.
      let quotes = fixture.odds?.quotes ?? stored.fixture.odds?.quotes ?? [];
      if (tier === 'ADVANCED' || mode !== 'CRITICO') {
        const fresh = await runtime.dataLayer.getOdds(fixture, tier === 'ADVANCED' ? 'HIGH' : 'NORMAL');
        if (fresh.length > 0) {
          quotes = fresh;
          await insertOddsSnapshots(fixture.id, fresh);
        }
      }
      const withOdds: NormalizedFixture = { ...fixture, odds: runtime.dataLayer.buildOdds(quotes) };
      await upsertFixture(withOdds, { refreshed: true });

      // 5) Avaliação pura.
      const previousSnapshot =
        stored.lastSnapshotMinute !== null && stored.fixture.statistics
          ? { minute: stored.lastSnapshotMinute, statistics: stored.fixture.statistics }
          : null;
      const evaluation = evaluateFixture({
        fixture: withOdds,
        league: runtime.dataLayer.leagueOf(withOdds),
        strategies,
        quotes,
        previousStates: stored.strategyStates,
        previousSnapshot,
        monitored: true,
        now,
      });
      evaluated += 1;

      const strategyStates: Record<string, AnalysisState> = {};
      for (const candidate of evaluation.candidates) strategyStates[`${candidate.strategyKey}:${candidate.selection}`] = candidate.state;

      const bestScore = evaluation.best?.score ?? 0;
      if (Math.abs(bestScore - stored.bestScore) >= 10) {
        sportsLog('info', 'score.changed', { fixture: fixture.id, from: stored.bestScore, to: bestScore, state: evaluation.bestState });
      }

      await updateFixtureAnalysis(fixture.id, {
        analysisState: evaluation.bestState ?? 'MONITORANDO',
        liveState: evaluation.liveState,
        funnelTier: tier,
        bestScore,
        strategyStates,
        candidates: evaluation.candidates,
        evaluatedAt: now.toISOString(),
      });

      // 6) Snapshot a cada N minutos (com teto por partida).
      const minute = withOdds.minute ?? 0;
      const due = stored.lastSnapshotMinute === null || minute - stored.lastSnapshotMinute >= ENGINE_CONFIG.snapshotEveryMinutes;
      if (due && withOdds.statistics && (await countSnapshots(fixture.id)) < ENGINE_CONFIG.maxSnapshotsPerFixture) {
        await insertLiveSnapshot({
          fixtureId: fixture.id,
          minute,
          score: withOdds.score,
          statistics: withOdds.statistics,
          quotes,
          bestScore,
          analysisState: evaluation.bestState ?? 'MONITORANDO',
        });
      }

      // 7) Dicas: entrada identificada vira dica (uma por partida/estratégia/seleção).
      for (const entry of identifiedEntries(evaluation)) {
        const created = await createTipIfMissing({
          fixtureId: fixture.id,
          candidate: entry,
          minuteAt: withOdds.minute,
          scoreAt: withOdds.score,
          statsAt: withOdds.statistics,
          stakeCents: ENGINE_CONFIG.referenceStakeCents,
        });
        if (created) {
          tipsCreated += 1;
          sportsLog('info', 'tip.created', { fixture: fixture.id, strategy: entry.strategyKey, selection: entry.selection, odd: entry.oddMilli, score: entry.score, value: entry.valueBps });
        }
      }

      // Dicas ativas desta partida acompanham o estado/odd atual.
      for (const tip of await listActiveTipsForFixture(fixture.id)) {
        const candidate = evaluation.candidates.find((c) => c.strategyKey === tip.strategyKey && c.selection === tip.selection);
        if (!candidate) continue;
        await touchActiveTip(tip.id, {
          state: candidate.state,
          score: candidate.applicable ? candidate.score : tip.score,
          oddMilli: candidate.oddMilli,
          valueBps: candidate.valueBps,
          oddsCapturedAt: candidate.oddsCapturedAt,
        });
        if (candidate.state === 'DESCARTADA') {
          sportsLog('info', 'tip.discarded', { fixture: fixture.id, strategy: tip.strategyKey, note: 'condições pioraram; a dica continua registrada até a liquidação' });
        }
      }
    }

    return `${live.length} ao vivo · ${wanted.length} atualizadas · ${evaluated} avaliadas · ${tipsCreated} dica(s) nova(s) · modo ${mode}`;
  });
}

// ---------------------------------------------------------------------------
// Rotina: odds (pré-jogo próximo + partidas com dica)
// ---------------------------------------------------------------------------
export async function runOddsJob(runtime: SportsRuntime = getSportsRuntime()): Promise<JobReport> {
  return withJob('odds', JOB_COOLDOWN_SECONDS.odds, async () => {
    const now = runtime.now();
    const strategies = await loadStrategies();
    const mode = await runtime.dataLayer.economyMode();
    const limits = limitsForMode(mode);

    // Pré-jogo: partidas que começam em até 3 h, nas ligas mais prioritárias.
    const upcoming = (await listFixturesBetween(now, new Date(now.getTime() + 3 * 3600 * 1000)))
      .filter((s) => s.fixture.status === 'SCHEDULED')
      .sort((a, b) => a.fixture.league.priority - b.fixture.league.priority || a.fixture.startTime.localeCompare(b.fixture.startTime))
      .slice(0, limits.maxMonitored);

    let updated = 0;
    for (const stored of upcoming) {
      const quotes = await runtime.dataLayer.getOdds(stored.fixture, 'LOW');
      if (quotes.length === 0) continue;
      await insertOddsSnapshots(stored.fixture.id, quotes);
      const fixture: NormalizedFixture = { ...stored.fixture, odds: runtime.dataLayer.buildOdds(quotes) };
      await upsertFixture(fixture, { refreshed: false });

      const prediction = mode === 'NORMAL' ? await runtime.dataLayer.getPrediction(fixture) : null;
      const evaluation = evaluateFixture({ fixture, league: runtime.dataLayer.leagueOf(fixture), strategies, quotes, prediction, previousStates: stored.strategyStates, monitored: true, now });
      const strategyStates: Record<string, AnalysisState> = {};
      for (const candidate of evaluation.candidates) strategyStates[`${candidate.strategyKey}:${candidate.selection}`] = candidate.state;
      await updateFixtureAnalysis(fixture.id, {
        analysisState: evaluation.bestState ?? 'OBSERVANDO',
        liveState: evaluation.liveState,
        bestScore: evaluation.best?.score ?? 0,
        strategyStates,
        candidates: evaluation.candidates,
        evaluatedAt: now.toISOString(),
      });
      for (const entry of identifiedEntries(evaluation)) {
        await createTipIfMissing({ fixtureId: fixture.id, candidate: entry, minuteAt: null, scoreAt: fixture.score, statsAt: null, stakeCents: ENGINE_CONFIG.referenceStakeCents });
      }
      updated += 1;
    }
    return `${updated} partida(s) pré-jogo com odds · modo ${mode}`;
  });
}

// ---------------------------------------------------------------------------
// Rotina: liquidação das dicas
// ---------------------------------------------------------------------------
export async function runSettleJob(runtime: SportsRuntime = getSportsRuntime()): Promise<JobReport> {
  return withJob('settle', JOB_COOLDOWN_SECONDS.settle, async () => {
    const now = runtime.now();
    const active = await listActiveTips();
    if (active.length === 0) return 'nenhuma dica ativa';

    const fixtureIds = [...new Set(active.map((tip) => tip.fixtureId))];
    const stored = new Map((await listFixturesByIds(fixtureIds)).map((s) => [s.fixture.id, s]));

    // Partidas que já deveriam ter acabado mas ainda constam ao vivo/agendadas: busca o final.
    const needFinal = [...stored.values()].filter((s) => s.fixture.status !== 'FINISHED' && new Date(s.fixture.startTime).getTime() < now.getTime() - 120 * 60_000);
    if (needFinal.length > 0) {
      const details = await runtime.dataLayer.getDetails(needFinal.map((s) => s.fixture), 'NORMAL');
      for (const detail of details) {
        await upsertFixture(detail, { refreshed: true });
        const current = stored.get(detail.id);
        if (current) stored.set(detail.id, { ...current, fixture: detail });
      }
    }

    let settled = 0;
    let expired = 0;
    for (const tip of active) {
      const fixture = stored.get(tip.fixtureId)?.fixture;
      if (!fixture) continue;
      const strategyModule = STRATEGY_MODULES.find((m) => m.key === tip.strategyKey);

      if (fixture.status === 'CANCELLED' || fixture.status === 'POSTPONED') {
        await expireTip(tip.id, 'partida cancelada/adiada');
        expired += 1;
        continue;
      }

      const result = strategyModule?.settle({ market: tip.market, selection: tip.selection, line: tip.line, minuteAt: tip.minuteAt, scoreAt: tip.scoreAt }, fixture) ?? null;
      if (result) {
        const money = tipProfitCents(result, tip.stakeCents, tip.oddMilli);
        await settleTip(tip.id, result, money);
        settled += 1;
        sportsLog('info', 'tip.settled', { tip: tip.id, fixture: fixture.id, result, profitCents: money.profitCents });
        continue;
      }

      // Encerrada sem como resolver (sem estatística final): expira como push.
      if (fixture.status === 'FINISHED' || new Date(fixture.startTime).getTime() < now.getTime() - 6 * 3600 * 1000) {
        await expireTip(tip.id, 'sem dados para resolver o mercado');
        expired += 1;
      }
    }
    return `${settled} liquidada(s) · ${expired} expirada(s) de ${active.length} ativa(s)`;
  });
}

// ---------------------------------------------------------------------------
// Rotina: performance (materialização leve — o cálculo é puro e barato)
// ---------------------------------------------------------------------------
export async function runPerformanceJob(): Promise<JobReport> {
  return withJob('performance', JOB_COOLDOWN_SECONDS.performance, async () => 'métricas calculadas sob demanda a partir de bet_tips');
}

export async function runJob(job: JobName, runtime: SportsRuntime = getSportsRuntime()): Promise<JobReport> {
  switch (job) {
    case 'fixtures':
      return runFixturesJob(runtime);
    case 'live':
      return runLiveJob(runtime);
    case 'odds':
      return runOddsJob(runtime);
    case 'settle':
      return runSettleJob(runtime);
    case 'performance':
      return runPerformanceJob();
    default:
      return { job, ran: false, message: 'rotina desconhecida', durationMs: 0 };
  }
}

export async function runAllJobs(runtime: SportsRuntime = getSportsRuntime()): Promise<JobReport[]> {
  const reports: JobReport[] = [];
  for (const job of ['fixtures', 'live', 'odds', 'settle', 'performance'] as const) {
    reports.push(await runJob(job, runtime));
  }
  return reports;
}

/**
 * Refresh sob demanda ao abrir uma página. Só roda quando permitido por
 * SPORTS_REFRESH_ON_VIEW e quando o cooldown da rotina já passou; nunca
 * bloqueia a renderização por mais do que uma rodada curta.
 */
export async function refreshOnView(kind: 'fixtures' | 'live' | 'settle', runtime: SportsRuntime = getSportsRuntime()): Promise<void> {
  if (!runtime.refreshOnView) return;
  try {
    await runJob(kind, runtime);
  } catch (error) {
    sportsLog('warn', 'worker.run', { job: kind, error: error instanceof Error ? error.message : String(error) }, { dedupeKey: kind });
  }
}

export type { TipCandidate };
