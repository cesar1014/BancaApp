/**
 * Cache da camada esportiva com duas camadas e deduplicação.
 *
 *   memória  → rápido, por instância (some no cold start do serverless)
 *   persistência → opcional (tabela sports_cache), sobrevive entre invocações
 *
 * Deduplicação: se duas partes do sistema pedem a mesma chave ao mesmo tempo,
 * existe UMA chamada ao loader — as duas recebem a mesma promise.
 *
 * Dado vencido não é jogado fora: fica disponível como "stale" para fallback
 * quando o provedor falha ou a quota acabou.
 */

export interface CacheRecord<T = unknown> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

export interface CachePersistence {
  get(key: string): Promise<CacheRecord | null>;
  set(key: string, record: CacheRecord): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface CacheHit<T> {
  value: T;
  stale: boolean;
  storedAt: number;
}

export interface LoadResult<T> {
  value: T;
  fromCache: boolean;
  stale: boolean;
  storedAt: number;
}

const MAX_MEMORY_ENTRIES = 2_000;

export class SportsCache {
  private readonly memory = new Map<string, CacheRecord>();
  private readonly inFlight = new Map<string, Promise<LoadResult<unknown>>>();
  private persistence: CachePersistence | null;
  /** Contadores para o painel administrativo. */
  readonly stats = { hits: 0, staleHits: 0, misses: 0, deduped: 0 };

  constructor(persistence: CachePersistence | null = null) {
    this.persistence = persistence;
  }

  setPersistence(persistence: CachePersistence | null): void {
    this.persistence = persistence;
  }

  async get<T>(key: string, now = Date.now()): Promise<CacheHit<T> | null> {
    const local = this.memory.get(key);
    if (local) {
      return { value: local.value as T, stale: local.expiresAt <= now, storedAt: local.storedAt };
    }
    if (!this.persistence) return null;
    try {
      const record = await this.persistence.get(key);
      if (!record) return null;
      this.remember(key, record);
      return { value: record.value as T, stale: record.expiresAt <= now, storedAt: record.storedAt };
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number, now = Date.now()): Promise<void> {
    const record: CacheRecord<T> = { value, storedAt: now, expiresAt: now + ttlSeconds * 1000 };
    this.remember(key, record);
    if (this.persistence) {
      try {
        await this.persistence.set(key, record);
      } catch {
        /* persistência é melhor-esforço */
      }
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.persistence?.delete) {
      try {
        await this.persistence.delete(key);
      } catch {
        /* ignorar */
      }
    }
  }

  /**
   * Devolve o valor em cache válido; senão carrega (uma única vez por chave,
   * mesmo com chamadas simultâneas) e grava. Se o loader falhar e existir
   * valor vencido, devolve o vencido marcado como stale.
   */
  async getOrLoad<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
    options: { forceRefresh?: boolean; now?: number } = {},
  ): Promise<LoadResult<T>> {
    const now = options.now ?? Date.now();
    const cached = options.forceRefresh ? null : await this.get<T>(key, now);
    if (cached && !cached.stale) {
      this.stats.hits += 1;
      return { value: cached.value, fromCache: true, stale: false, storedAt: cached.storedAt };
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      this.stats.deduped += 1;
      return pending as Promise<LoadResult<T>>;
    }

    this.stats.misses += 1;
    const run = (async (): Promise<LoadResult<T>> => {
      try {
        const value = await loader();
        await this.set(key, value, ttlSeconds, now);
        return { value, fromCache: false, stale: false, storedAt: now };
      } catch (error) {
        if (cached) {
          this.stats.staleHits += 1;
          return { value: cached.value, fromCache: true, stale: true, storedAt: cached.storedAt };
        }
        throw error;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, run as Promise<LoadResult<unknown>>);
    return run;
  }

  private remember(key: string, record: CacheRecord): void {
    this.memory.set(key, record);
    if (this.memory.size > MAX_MEMORY_ENTRIES) {
      // Descarta as mais antigas (ordem de inserção do Map).
      const excess = this.memory.size - MAX_MEMORY_ENTRIES;
      let removed = 0;
      for (const oldKey of this.memory.keys()) {
        this.memory.delete(oldKey);
        removed += 1;
        if (removed >= excess) break;
      }
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __sportsCache: SportsCache | undefined;
}

/** Singleton por processo (sobrevive a hot reloads e entre requests quentes). */
export function getSportsCache(): SportsCache {
  if (!globalThis.__sportsCache) globalThis.__sportsCache = new SportsCache();
  return globalThis.__sportsCache;
}
