/**
 * Cliente HTTP dos provedores: timeout, retry com backoff exponencial (só
 * quando faz sentido) e circuit breaker por provedor.
 *
 * - 429 e 5xx → tenta de novo (com espera crescente e jitter);
 * - 4xx (exceto 408/429) → não tenta de novo: a chave está errada ou o
 *   recurso não existe no plano, repetir só gastaria quota;
 * - 3 falhas seguidas → circuito aberto por 60 s: o provedor é considerado
 *   fora e o sistema segue com os outros.
 */

import type { ProviderKey } from '../domain/models';
import { sportsLog } from './logger';

export class ProviderError extends Error {
  readonly provider: ProviderKey;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(provider: ProviderKey, message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold = 3,
    private readonly openMs = 60_000,
  ) {}

  get state(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    if (this.openedAt === null) return 'CLOSED';
    return Date.now() - this.openedAt >= this.openMs ? 'HALF_OPEN' : 'OPEN';
  }

  canRequest(): boolean {
    return this.state !== 'OPEN';
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = Date.now();
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __sportsCircuits: Map<ProviderKey, CircuitBreaker> | undefined;
}

export function circuitFor(provider: ProviderKey): CircuitBreaker {
  if (!globalThis.__sportsCircuits) globalThis.__sportsCircuits = new Map();
  let circuit = globalThis.__sportsCircuits.get(provider);
  if (!circuit) {
    circuit = new CircuitBreaker();
    globalThis.__sportsCircuits.set(provider, circuit);
  }
  return circuit;
}

export interface HttpRequest {
  provider: ProviderKey;
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Tentativas extras em caso de erro transitório. */
  retries?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
}

export type FetchJson = <T = unknown>(request: HttpRequest) => Promise<HttpResponse<T>>;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** URL sem query string, para logs. */
function safeUrl(url: string): string {
  const index = url.indexOf('?');
  return index === -1 ? url : url.slice(0, index);
}

export const fetchJson: FetchJson = async <T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> => {
  const circuit = circuitFor(request.provider);
  if (!circuit.canRequest()) {
    sportsLog('warn', 'provider.circuit', { provider: request.provider, state: circuit.state }, { dedupeKey: request.provider });
    throw new ProviderError(request.provider, `Provedor ${request.provider} temporariamente indisponível (circuito aberto).`, null, true);
  }

  const retries = request.retries ?? DEFAULT_RETRIES;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let attempt = 0;
  let lastError: ProviderError | null = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(request.url, {
        headers: { Accept: 'application/json', ...(request.headers ?? {}) },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        lastError = new ProviderError(
          request.provider,
          `HTTP ${response.status} em ${safeUrl(request.url)}`,
          response.status,
          retryable,
        );
        if (!retryable || attempt === retries) break;
      } else {
        const body = (await response.json()) as T;
        circuit.recordSuccess();
        return { status: response.status, headers: response.headers, body };
      }
    } catch (error) {
      clearTimeout(timer);
      const aborted = error instanceof Error && error.name === 'AbortError';
      lastError = new ProviderError(
        request.provider,
        aborted ? `Timeout (${timeoutMs} ms) em ${safeUrl(request.url)}` : `Falha de rede em ${safeUrl(request.url)}`,
        null,
        true,
      );
      if (attempt === retries) break;
    }

    // Backoff exponencial com jitter: 500 ms, 1 s, 2 s...
    const delay = 500 * 2 ** attempt + Math.random() * 250;
    await sleep(delay);
    attempt += 1;
  }

  circuit.recordFailure();
  const finalError = lastError ?? new ProviderError(request.provider, 'Falha desconhecida', null, true);
  sportsLog(
    'warn',
    'provider.failure',
    { provider: request.provider, status: finalError.status, message: finalError.message },
    { dedupeKey: `${request.provider}:${finalError.status ?? 'net'}` },
  );
  throw finalError;
};
