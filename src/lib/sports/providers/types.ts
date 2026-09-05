/**
 * Contrato dos provedores (Sports Data Layer).
 *
 * Todo adaptador devolve SOMENTE modelos normalizados. Cada método pode
 * devolver vazio/null quando o recurso não existe no plano ou falhou — a
 * camada de dados decide fallback; o provedor nunca "inventa" dado.
 */

import type {
  NormalizedEvent,
  NormalizedFixture,
  NormalizedPrediction,
  NormalizedStatistics,
  OddsQuote,
  ProviderKey,
} from '../domain/models';
import type { FetchJson } from '../infra/http';
import type { ProviderQuotaManager } from '../infra/quota';
import type { SportsCache } from '../infra/cache';

export interface ProviderCapabilities {
  fixtures: boolean;
  live: boolean;
  statistics: boolean;
  events: boolean;
  odds: boolean;
  predictions: boolean;
  /** O plano gratuito entrega xG? */
  xg: boolean;
}

export interface FixtureQuery {
  /** YYYY-MM-DD (UTC). */
  date: string;
  /** Restringe às ligas do catálogo informadas (chaves internas). */
  leagueKeys?: readonly string[];
}

export interface OddsRequest {
  fixture: NormalizedFixture;
  /** ID da partida neste provedor, se já casado. */
  providerId: string | null;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
}

export interface SportsProvider {
  readonly key: ProviderKey;
  readonly capabilities: ProviderCapabilities;
  isConfigured(): boolean;

  getFixtures(query: FixtureQuery): Promise<NormalizedFixture[]>;
  getLiveFixtures(): Promise<NormalizedFixture[]>;
  /** Detalhe de UMA partida pelo id do provedor. */
  getFixture(providerId: string): Promise<NormalizedFixture | null>;
  /** Detalhe em lote (com estatísticas/eventos quando o provedor permite). */
  getFixturesByIds(providerIds: readonly string[], priority?: 'HIGH' | 'NORMAL' | 'LOW'): Promise<NormalizedFixture[]>;
  getStatistics(providerId: string): Promise<NormalizedStatistics | null>;
  getEvents(providerId: string): Promise<NormalizedEvent[]>;
  getOdds(request: OddsRequest): Promise<OddsQuote[]>;
  getPredictions(providerId: string): Promise<NormalizedPrediction | null>;
}

/** Dependências injetadas em cada adaptador (permite mock nos testes). */
export interface ProviderDeps {
  fetchJson: FetchJson;
  quota: ProviderQuotaManager;
  cache: SportsCache;
  now: () => Date;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace('%', '').replace(',', '.').trim();
    if (cleaned === '') return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Odd decimal → milli, ignorando lixo. */
export function oddToMilli(value: unknown): number | null {
  const odd = asNumber(value);
  if (odd === null || odd <= 1) return null;
  return Math.round(odd * 1000);
}
