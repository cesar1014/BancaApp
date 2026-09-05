/**
 * Sports Data Layer — a única porta de entrada para dados esportivos.
 *
 *   API-Football ─┐
 *   Sportmonks   ─┼─▶ SportsDataLayer ─▶ Bet Intelligence Engine ─▶ Central de Dicas
 *   The Odds API ─┘
 *
 * Responsabilidades:
 *   - escolher o provedor certo para cada dado (primário / enriquecimento / odds);
 *   - casar a mesma partida entre provedores e lembrar do casamento;
 *   - mesclar respostas (estatísticas do primário + xG do enriquecimento +
 *     odds de todas as casas) num único NormalizedFixture;
 *   - fallback: se um provedor falha, seguir com os outros — nunca derrubar
 *     a partida inteira por falta de um dado.
 *
 * Não conhece banco: persistência de casamentos e aliases chega por
 * interface (MappingStore), implementada em repos/sports.ts.
 */

import { LEAGUE_CATALOG, findLeague, type LeagueCatalogEntry } from './config/leagues';
import type { EconomyMode } from './config/cache-policy';
import type {
  NormalizedFixture,
  NormalizedPrediction,
  NormalizedStatistics,
  OddsQuote,
  ProviderKey,
  TeamStatistics,
} from './domain/models';
import { matchFixture, type MatchCandidate } from './domain/matching';
import { isQuoteStale } from './domain/odds-math';
import type { SportsCache } from './infra/cache';
import { sportsLog } from './infra/logger';
import type { ProviderQuotaManager, ProviderQuotaState } from './infra/quota';
import type { ProviderSet } from './providers';
import { OddsApiProvider } from './providers/odds-api';
import type { SportsProvider } from './providers/types';

export type Priority = 'HIGH' | 'NORMAL' | 'LOW';

export interface MappingStore {
  /** id do provedor para a nossa entidade (ou null se nunca casou). */
  getProviderId(provider: ProviderKey, entityType: 'fixture' | 'team', internalId: string): Promise<string | null>;
  saveMapping(provider: ProviderKey, entityType: 'fixture' | 'team', providerId: string, internalId: string, confidenceBps: number): Promise<void>;
  /** Aliases persistidos: forma normalizada → chave canônica. */
  getAliases(): Promise<Record<string, string>>;
}

/** Implementação em memória (testes e modo mock sem banco). */
export class InMemoryMappingStore implements MappingStore {
  private readonly map = new Map<string, string>();
  private readonly aliases: Record<string, string> = {};

  async getProviderId(provider: ProviderKey, entityType: 'fixture' | 'team', internalId: string): Promise<string | null> {
    return this.map.get(`${provider}:${entityType}:${internalId}`) ?? null;
  }
  async saveMapping(provider: ProviderKey, entityType: 'fixture' | 'team', providerId: string, internalId: string): Promise<void> {
    this.map.set(`${provider}:${entityType}:${internalId}`, providerId);
  }
  async getAliases(): Promise<Record<string, string>> {
    return this.aliases;
  }
}

export interface DataLayerDeps {
  providers: ProviderSet;
  cache: SportsCache;
  quota: ProviderQuotaManager;
  mappings: MappingStore;
  now: () => Date;
}

/** Ligas do catálogo (as "OTHER_*" descobertas ficam de fora do funil). */
function inCatalog(fixture: NormalizedFixture): boolean {
  return findLeague(fixture.league.key) !== null;
}

function fillMissing(target: TeamStatistics, source: TeamStatistics): TeamStatistics {
  const out = { ...target };
  for (const key of Object.keys(source) as (keyof TeamStatistics)[]) {
    if (out[key] === null && source[key] !== null) out[key] = source[key];
  }
  return out;
}

/** Mescla estatísticas: o primário manda; o enriquecimento só preenche lacunas. */
export function mergeStatistics(primary: NormalizedStatistics | null, extra: NormalizedStatistics | null): NormalizedStatistics | null {
  if (!primary) return extra;
  if (!extra) return primary;
  return {
    home: fillMissing(primary.home, extra.home),
    away: fillMissing(primary.away, extra.away),
    source: primary.source,
    lastUpdated: primary.lastUpdated ?? extra.lastUpdated,
    confidence: primary.confidence,
  };
}

/** Mescla o detalhe (com estatísticas/eventos) sobre a versão da lista. */
export function mergeFixture(base: NormalizedFixture, detail: NormalizedFixture | null, extra: NormalizedFixture | null = null): NormalizedFixture {
  const main = detail ?? base;
  const sources = new Set<ProviderKey>([...base.metadata.sources, ...main.metadata.sources, ...(extra?.metadata.sources ?? [])]);
  return {
    ...main,
    id: base.id,
    league: base.league,
    providerIds: { ...base.providerIds, ...main.providerIds, ...(extra?.providerIds ?? {}) },
    statistics: mergeStatistics(main.statistics, extra?.statistics ?? null),
    events: main.events.length > 0 ? main.events : (extra?.events ?? []),
    odds: base.odds ?? main.odds,
    metadata: {
      ...main.metadata,
      sources: [...sources],
      stale: main.metadata.stale || base.metadata.stale,
      confidence: main.statistics ? main.metadata.confidence : extra?.statistics ? 'MEDIUM' : 'LOW',
    },
  };
}

export class SportsDataLayer {
  constructor(private readonly deps: DataLayerDeps) {}

  get providers(): ProviderSet {
    return this.deps.providers;
  }

  async economyMode(): Promise<EconomyMode> {
    return this.deps.quota.globalEconomyMode(this.deps.providers.keys);
  }

  async quotaSnapshot(): Promise<ProviderQuotaState[]> {
    return this.deps.quota.snapshot(this.deps.providers.keys);
  }

  // -------------------------------------------------------------------------
  // Calendário e ao vivo (provedor primário)
  // -------------------------------------------------------------------------
  async getFixturesForDate(date: string): Promise<NormalizedFixture[]> {
    try {
      const fixtures = await this.deps.providers.primary.getFixtures({ date });
      return fixtures.filter(inCatalog);
    } catch (error) {
      this.report('fixtures', error);
      return [];
    }
  }

  async getLiveFixtures(): Promise<NormalizedFixture[]> {
    try {
      const fixtures = await this.deps.providers.primary.getLiveFixtures();
      return fixtures.filter(inCatalog);
    } catch (error) {
      this.report('live', error);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Detalhe (estatísticas + eventos), em lote, com enriquecimento opcional
  // -------------------------------------------------------------------------
  async getDetails(fixtures: readonly NormalizedFixture[], priority: Priority): Promise<NormalizedFixture[]> {
    if (fixtures.length === 0) return [];
    const primary = this.deps.providers.primary;
    const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

    // 1) Primário em lote (uma chamada a cada 20 partidas).
    const primaryIds = fixtures.map((fixture) => fixture.providerIds[primary.key]).filter((id): id is string => Boolean(id));
    const detailed = new Map<string, NormalizedFixture>();
    try {
      const details = await primary.getFixturesByIds(primaryIds, priority);
      for (const detail of details) {
        const original = [...byId.values()].find((f) => f.providerIds[primary.key] === detail.providerIds[primary.key]);
        if (original) detailed.set(original.id, detail);
      }
    } catch (error) {
      this.report('details', error);
    }

    // 2) Enriquecimento (Sportmonks) só onde vale: liga coberta e prioridade
    //    alta/normal, e apenas se faltar estatística ou xG.
    const enriched = new Map<string, NormalizedFixture>();
    for (const provider of this.deps.providers.enrichment) {
      const targets = fixtures.filter((fixture) => {
        const league = findLeague(fixture.league.key);
        if (!league?.providerIds[provider.key]) return false;
        const current = detailed.get(fixture.id) ?? fixture;
        const missingStats = current.statistics === null;
        const missingXg = current.statistics !== null && current.statistics.home.xgMilli === null;
        return priority !== 'LOW' && (missingStats || missingXg);
      });
      if (targets.length === 0) continue;

      try {
        const ids: string[] = [];
        const idToFixture = new Map<string, string>();
        for (const fixture of targets) {
          const providerId = await this.resolveProviderId(provider, fixture);
          if (providerId) {
            ids.push(providerId);
            idToFixture.set(providerId, fixture.id);
          }
        }
        if (ids.length === 0) continue;
        const extras = await provider.getFixturesByIds(ids, priority);
        for (const extra of extras) {
          const fixtureId = idToFixture.get(extra.providerIds[provider.key] ?? '');
          if (fixtureId) enriched.set(fixtureId, extra);
        }
      } catch (error) {
        this.report('enrichment', error);
      }
    }

    return fixtures.map((fixture) => mergeFixture(fixture, detailed.get(fixture.id) ?? null, enriched.get(fixture.id) ?? null));
  }

  // -------------------------------------------------------------------------
  // Odds (todas as casas de todos os provedores de odds), com timestamp
  // -------------------------------------------------------------------------
  async getOdds(fixture: NormalizedFixture, priority: Priority): Promise<OddsQuote[]> {
    const quotes: OddsQuote[] = [];
    for (const provider of this.deps.providers.odds) {
      try {
        const providerId = await this.resolveProviderId(provider, fixture);
        if (!providerId && provider.key !== 'mock') continue;
        const result = await provider.getOdds({ fixture, providerId, priority });
        quotes.push(...result);
        // Um provedor já trouxe cotações: só consulta o fallback se este falhou.
        if (result.length > 0 && provider.key === 'odds-api') break;
      } catch (error) {
        this.report('odds', error);
      }
    }
    return quotes;
  }

  async getPrediction(fixture: NormalizedFixture): Promise<NormalizedPrediction | null> {
    const primary = this.deps.providers.primary;
    if (!primary.capabilities.predictions) return null;
    const providerId = fixture.providerIds[primary.key];
    if (!providerId) return null;
    try {
      return await primary.getPredictions(providerId);
    } catch (error) {
      this.report('predictions', error);
      return null;
    }
  }

  /** Monta o objeto de odds da partida, marcando cotações velhas. */
  buildOdds(quotes: readonly OddsQuote[]): NormalizedFixture['odds'] {
    if (quotes.length === 0) return null;
    const now = this.deps.now();
    const latest = quotes.reduce<string | null>((acc, quote) => (acc === null || quote.capturedAt > acc ? quote.capturedAt : acc), null);
    return {
      quotes: [...quotes],
      lastUpdated: latest,
      stale: quotes.every((quote) => isQuoteStale(quote, now)),
    };
  }

  // -------------------------------------------------------------------------
  // Matching entre provedores (com persistência do casamento)
  // -------------------------------------------------------------------------
  async resolveProviderId(provider: SportsProvider, fixture: NormalizedFixture): Promise<string | null> {
    const direct = fixture.providerIds[provider.key];
    if (direct) return direct;

    const saved = await this.deps.mappings.getProviderId(provider.key, 'fixture', fixture.id);
    if (saved) return saved;

    const aliases = await this.deps.mappings.getAliases();

    if (provider instanceof OddsApiProvider) {
      const event = await provider.matchEvent(fixture, aliases);
      if (!event) return null;
      await this.deps.mappings.saveMapping(provider.key, 'fixture', event.id, fixture.id, 10_000);
      return event.id;
    }

    // Provedores com calendário: busca o dia e casa por nome + horário.
    if (!provider.capabilities.fixtures) return null;
    const league = findLeague(fixture.league.key);
    if (!league || !league.providerIds[provider.key]) return null;

    const date = fixture.startTime.slice(0, 10);
    let candidates: NormalizedFixture[];
    try {
      candidates = await provider.getFixtures({ date, leagueKeys: [league.key] });
    } catch (error) {
      this.report('matching', error);
      return null;
    }

    const options: MatchCandidate[] = [];
    for (const candidate of candidates) {
      const providerId = candidate.providerIds[provider.key];
      if (!providerId) continue;
      options.push({ providerId, homeName: candidate.homeTeam.name, awayName: candidate.awayTeam.name, startTime: candidate.startTime, leagueKey: candidate.league.key });
    }

    const decision = matchFixture(
      { homeName: fixture.homeTeam.name, awayName: fixture.awayTeam.name, startTime: fixture.startTime, leagueKey: fixture.league.key },
      options,
      { aliases },
    );

    if (decision.status === 'AMBIGUOUS') {
      sportsLog('warn', 'matching.ambiguous', { provider: provider.key, fixture: fixture.id }, { dedupeKey: `${provider.key}:${fixture.id}` });
      return null;
    }
    if (decision.status !== 'MATCHED' || !decision.best) return null;

    await this.deps.mappings.saveMapping(provider.key, 'fixture', decision.best.candidate.providerId, fixture.id, decision.best.confidenceBps);
    sportsLog('info', 'matching.linked', { provider: provider.key, fixture: fixture.id, providerId: decision.best.candidate.providerId, confidenceBps: decision.best.confidenceBps });
    return decision.best.candidate.providerId;
  }

  leagueOf(fixture: NormalizedFixture): LeagueCatalogEntry {
    return findLeague(fixture.league.key) ?? { ...LEAGUE_CATALOG[0]!, ...fixture.league, oddsApiKey: null, avgGoalsMilli: 2_600, avgCornersMilli: 9_800, avgCardsMilli: 5_000 };
  }

  private report(stage: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    sportsLog('warn', 'provider.failure', { stage, message }, { dedupeKey: `${stage}:${message.slice(0, 40)}` });
  }
}
