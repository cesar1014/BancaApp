import 'server-only';
import { DbCachePersistence, DbMappingStore, DbQuotaPersistence } from '@/lib/repos/sports';
import { SportsDataLayer } from '@/lib/sports/data-layer';
import { getSportsCache } from '@/lib/sports/infra/cache';
import { fetchJson } from '@/lib/sports/infra/http';
import { getQuotaManager } from '@/lib/sports/infra/quota';
import { createProviders, readProviderEnv, type ProviderSet } from '@/lib/sports/providers';

/**
 * Monta (uma vez por processo) a camada de dados com as dependências reais:
 * cache com persistência no Postgres, quota persistida, casamentos gravados
 * e os provedores definidos pelo ambiente.
 */
export interface SportsRuntime {
  dataLayer: SportsDataLayer;
  providers: ProviderSet;
  now: () => Date;
  /** Refresh sob demanda ao abrir as páginas (além do worker). */
  refreshOnView: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __sportsRuntime: SportsRuntime | undefined;
}

export function getSportsRuntime(): SportsRuntime {
  if (globalThis.__sportsRuntime) return globalThis.__sportsRuntime;

  const now = () => new Date();
  const cache = getSportsCache();
  cache.setPersistence(new DbCachePersistence());
  const quota = getQuotaManager();
  quota.setPersistence(new DbQuotaPersistence());

  const providers = createProviders(readProviderEnv(), { fetchJson, quota, cache, now });
  const dataLayer = new SportsDataLayer({ providers, cache, quota, mappings: new DbMappingStore(), now });

  const refreshOnView = (process.env.SPORTS_REFRESH_ON_VIEW ?? 'true').trim().toLowerCase() !== 'false';

  globalThis.__sportsRuntime = { dataLayer, providers, now, refreshOnView };
  return globalThis.__sportsRuntime;
}

export function workerSecret(): string | null {
  const value = process.env.WORKER_SECRET?.trim();
  return value && value.length >= 16 ? value : null;
}
