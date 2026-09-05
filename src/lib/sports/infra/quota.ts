/**
 * ProviderQuotaManager — controla o consumo de cada API.
 *
 * Lê o restante dos headers reais quando o provedor informa (API-Football,
 * The Odds API) e, na falta deles, conta localmente. A partir do consumo
 * decide o modo de economia:
 *
 *   NORMAL    > 35% da quota restante
 *   ECONOMIA  ≤ 35%  → TTLs ×3, funil pela metade
 *   CRÍTICO   ≤ 12%  → TTLs ×10, só partidas já avançadas
 *   EXAURIDO  0      → nenhuma chamada até o reset
 *
 * O estado é persistido (tabela provider_usage) para sobreviver ao serverless.
 */

import type { ProviderKey } from '../domain/models';
import type { EconomyMode } from '../config/cache-policy';
import { sportsLog } from './logger';

export type QuotaStatus = 'OK' | 'ECONOMY' | 'CRITICAL' | 'EXHAUSTED' | 'DISABLED';

export interface ProviderQuotaState {
  provider: ProviderKey;
  requestsUsed: number;
  requestLimit: number | null;
  remaining: number | null;
  /** ISO 8601 do próximo reset (calculado ou informado). */
  resetAt: string | null;
  lastRequestAt: string | null;
  status: QuotaStatus;
  windowStartedAt: string;
  /** Timestamps (ms) dos últimos requests, para o limite por minuto. */
  recent: number[];
}

export interface QuotaLimit {
  /** Limite total na janela (null = sem limite conhecido). */
  limit: number | null;
  /** Duração da janela em ms (dia, hora, mês). */
  windowMs: number;
  /** Limite por minuto (null = sem). */
  perMinute: number | null;
  /** Reserva: fração da quota que só partidas avançadas podem usar. */
  economyBelowRatio: number;
  criticalBelowRatio: number;
}

export interface QuotaPersistence {
  load(provider: ProviderKey): Promise<ProviderQuotaState | null>;
  save(state: ProviderQuotaState): Promise<void>;
}

export interface SpendCheck {
  ok: boolean;
  status: QuotaStatus;
  reason?: string;
}

const DAY_MS = 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
const MONTH_MS = 31 * DAY_MS;

export const DEFAULT_QUOTA_LIMITS: Record<ProviderKey, QuotaLimit> = {
  'api-football': { limit: 100, windowMs: DAY_MS, perMinute: 10, economyBelowRatio: 0.35, criticalBelowRatio: 0.12 },
  sportmonks: { limit: 3000, windowMs: HOUR_MS, perMinute: null, economyBelowRatio: 0.2, criticalBelowRatio: 0.05 },
  'odds-api': { limit: 500, windowMs: MONTH_MS, perMinute: null, economyBelowRatio: 0.35, criticalBelowRatio: 0.12 },
  mock: { limit: null, windowMs: DAY_MS, perMinute: null, economyBelowRatio: 0, criticalBelowRatio: 0 },
};

function windowStart(now: number, windowMs: number): number {
  if (windowMs === MONTH_MS) {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  return Math.floor(now / windowMs) * windowMs;
}

export class ProviderQuotaManager {
  private readonly states = new Map<ProviderKey, ProviderQuotaState>();
  private readonly loaded = new Set<ProviderKey>();

  constructor(
    private readonly limits: Record<ProviderKey, QuotaLimit> = DEFAULT_QUOTA_LIMITS,
    private persistence: QuotaPersistence | null = null,
    private readonly now: () => number = () => Date.now(),
  ) {}

  setPersistence(persistence: QuotaPersistence | null): void {
    this.persistence = persistence;
  }

  private async state(provider: ProviderKey): Promise<ProviderQuotaState> {
    const now = this.now();
    const limit = this.limits[provider];
    let state = this.states.get(provider);

    if (!state && this.persistence && !this.loaded.has(provider)) {
      this.loaded.add(provider);
      try {
        const saved = await this.persistence.load(provider);
        if (saved) state = { ...saved, recent: saved.recent ?? [] };
      } catch {
        /* segue sem persistência */
      }
    }

    const start = windowStart(now, limit.windowMs);
    if (!state || new Date(state.windowStartedAt).getTime() < start) {
      // Nova janela: zera o contador local (o header do provedor corrige depois).
      state = {
        provider,
        requestsUsed: 0,
        requestLimit: limit.limit,
        remaining: limit.limit,
        resetAt: new Date(start + limit.windowMs).toISOString(),
        lastRequestAt: state?.lastRequestAt ?? null,
        status: limit.limit === null ? 'OK' : 'OK',
        windowStartedAt: new Date(start).toISOString(),
        recent: [],
      };
    }

    state.status = this.computeStatus(provider, state);
    this.states.set(provider, state);
    return state;
  }

  private computeStatus(provider: ProviderKey, state: ProviderQuotaState): QuotaStatus {
    const limit = this.limits[provider];
    if (limit.limit === null || state.remaining === null) return 'OK';
    if (state.remaining <= 0) return 'EXHAUSTED';
    const ratio = state.remaining / limit.limit;
    if (ratio <= limit.criticalBelowRatio) return 'CRITICAL';
    if (ratio <= limit.economyBelowRatio) return 'ECONOMY';
    return 'OK';
  }

  /**
   * Pode gastar `cost` unidades? `priority` alta (partida já avançada) ignora
   * o modo economia, mas nunca ultrapassa o limite.
   */
  async canSpend(
    provider: ProviderKey,
    cost = 1,
    options: { priority?: 'HIGH' | 'NORMAL' | 'LOW' } = {},
  ): Promise<SpendCheck> {
    const state = await this.state(provider);
    const limit = this.limits[provider];
    const priority = options.priority ?? 'NORMAL';

    if (state.remaining !== null && state.remaining - cost < 0) {
      return { ok: false, status: 'EXHAUSTED', reason: 'quota esgotada até o reset' };
    }

    if (limit.perMinute !== null) {
      const cutoff = this.now() - 60_000;
      state.recent = state.recent.filter((at) => at > cutoff);
      if (state.recent.length >= limit.perMinute) {
        return { ok: false, status: state.status, reason: 'limite por minuto atingido' };
      }
    }

    if (state.status === 'CRITICAL' && priority !== 'HIGH') {
      return { ok: false, status: state.status, reason: 'modo crítico: só partidas prioritárias' };
    }
    if (state.status === 'ECONOMY' && priority === 'LOW') {
      return { ok: false, status: state.status, reason: 'modo economia: chamada de baixa prioridade adiada' };
    }

    return { ok: true, status: state.status };
  }

  /** Registra uma chamada feita, corrigindo pelos headers quando existirem. */
  async recordRequest(
    provider: ProviderKey,
    info: { cost?: number; remaining?: number | null; limit?: number | null; resetAt?: string | null } = {},
  ): Promise<ProviderQuotaState> {
    const state = await this.state(provider);
    const cost = info.cost ?? 1;
    const now = this.now();

    state.requestsUsed += cost;
    state.lastRequestAt = new Date(now).toISOString();
    state.recent.push(now);
    if (state.recent.length > 200) state.recent = state.recent.slice(-100);

    if (info.limit !== undefined && info.limit !== null) state.requestLimit = info.limit;
    if (info.remaining !== undefined && info.remaining !== null) {
      state.remaining = info.remaining;
    } else if (state.remaining !== null) {
      state.remaining = Math.max(0, state.remaining - cost);
    }
    if (info.resetAt) state.resetAt = info.resetAt;

    const before = state.status;
    state.status = this.computeStatus(provider, state);
    if (state.status !== before && state.status !== 'OK') {
      sportsLog('warn', 'provider.quota', {
        provider,
        status: state.status,
        remaining: state.remaining,
        limit: state.requestLimit,
      });
    }

    if (this.persistence) {
      try {
        await this.persistence.save(state);
      } catch {
        /* melhor-esforço */
      }
    }
    return state;
  }

  async economyMode(provider: ProviderKey): Promise<EconomyMode> {
    const state = await this.state(provider);
    if (state.status === 'CRITICAL' || state.status === 'EXHAUSTED') return 'CRITICO';
    if (state.status === 'ECONOMY') return 'ECONOMIA';
    return 'NORMAL';
  }

  /** Pior modo entre os provedores informados (o sistema segue o mais apertado). */
  async globalEconomyMode(providers: readonly ProviderKey[]): Promise<EconomyMode> {
    let worst: EconomyMode = 'NORMAL';
    for (const provider of providers) {
      const mode = await this.economyMode(provider);
      if (mode === 'CRITICO') return 'CRITICO';
      if (mode === 'ECONOMIA') worst = 'ECONOMIA';
    }
    return worst;
  }

  async snapshot(providers: readonly ProviderKey[]): Promise<ProviderQuotaState[]> {
    const out: ProviderQuotaState[] = [];
    for (const provider of providers) out.push({ ...(await this.state(provider)) });
    return out;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __sportsQuota: ProviderQuotaManager | undefined;
}

export function getQuotaManager(): ProviderQuotaManager {
  if (!globalThis.__sportsQuota) globalThis.__sportsQuota = new ProviderQuotaManager();
  return globalThis.__sportsQuota;
}
