/**
 * Matemática de odds, sem float persistido.
 *
 *   probabilidade implícita = 1 / odd
 *   odd justa               = 1 / probabilidade estimada
 *   EV (por unidade)        = p × odd − 1
 *   value percentual        = odd / odd justa − 1   (= EV, por construção)
 *
 * Tudo em inteiros: odd × 1000 (milli) e probabilidade em basis points.
 */

import type { OddsQuote } from './models';

export const MILLI = 1_000;
export const BPS = 10_000;

/** 1 / odd em bps. Odd 1,58 → 6329 bps (63,29%). */
export function impliedProbabilityBps(oddMilli: number): number {
  if (!Number.isFinite(oddMilli) || oddMilli <= MILLI) return BPS;
  return Math.round((MILLI * BPS) / oddMilli);
}

/** 1 / probabilidade em milli. 76% (7600 bps) → 1316 (odd 1,32). */
export function fairOddMilli(probabilityBps: number): number {
  const clamped = clampBps(probabilityBps);
  if (clamped === 0) return Number.MAX_SAFE_INTEGER;
  return Math.round((MILLI * BPS) / clamped);
}

/**
 * Valor esperado por unidade apostada, em bps.
 * p = 0,70, odd 1,65 → 0,70 × 1,65 − 1 = +15,5% → 1550.
 */
export function expectedValueBps(probabilityBps: number, oddMilli: number): number {
  const clamped = clampBps(probabilityBps);
  return Math.round((clamped * oddMilli) / MILLI - BPS);
}

/** odd disponível / odd justa − 1, em bps. Numericamente igual ao EV. */
export function valueBps(probabilityBps: number, oddMilli: number): number {
  const fair = fairOddMilli(probabilityBps);
  if (!Number.isFinite(fair) || fair <= 0) return -BPS;
  return Math.round(((oddMilli - fair) * BPS) / fair);
}

/** Odd mínima aceitável para um dado EV mínimo: odd = (1 + ev) / p. */
export function minAcceptableOddMilli(probabilityBps: number, minEvBps: number): number {
  const clamped = clampBps(probabilityBps);
  if (clamped === 0) return Number.MAX_SAFE_INTEGER;
  return Math.ceil(((BPS + minEvBps) * MILLI) / clamped);
}

/**
 * Remove a margem (overround) de um conjunto de cotações do mesmo mercado
 * devolvendo probabilidades "justas" que somam 100%.
 */
export function removeMargin(oddsMilli: readonly number[]): number[] {
  const implied = oddsMilli.map(impliedProbabilityBps);
  const total = implied.reduce((acc, value) => acc + value, 0);
  if (total === 0) return implied;
  const fair = implied.map((value) => Math.round((value * BPS) / total));
  // Arredondamento pode deixar 9.999 ou 10.001: ajusta no maior elemento.
  const diff = BPS - fair.reduce((acc, value) => acc + value, 0);
  if (diff !== 0 && fair.length > 0) {
    const index = fair.indexOf(Math.max(...fair));
    fair[index] = (fair[index] ?? 0) + diff;
  }
  return fair;
}

/** Overround em bps (soma das implícitas − 100%). */
export function overroundBps(oddsMilli: readonly number[]): number {
  return oddsMilli.map(impliedProbabilityBps).reduce((acc, value) => acc + value, 0) - BPS;
}

/**
 * Fração de Kelly em bps (informativa — o sistema nunca sugere stake com base
 * nela; o controle de risco da banca é quem manda).
 */
export function kellyFractionBps(probabilityBps: number, oddMilli: number): number {
  const b = (oddMilli - MILLI) / MILLI;
  if (b <= 0) return 0;
  const p = clampBps(probabilityBps) / BPS;
  const q = 1 - p;
  const fraction = (b * p - q) / b;
  return fraction <= 0 ? 0 : Math.round(fraction * BPS);
}

export function clampBps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(BPS, Math.max(0, Math.round(value)));
}

/** Melhor cotação (maior odd) de um mercado/seleção entre várias casas. */
export function bestQuote(
  quotes: readonly OddsQuote[],
  market: OddsQuote['market'],
  selection: OddsQuote['selection'],
  line: number | null = null,
): OddsQuote | null {
  let best: OddsQuote | null = null;
  for (const quote of quotes) {
    if (quote.market !== market || quote.selection !== selection) continue;
    if (line !== null && quote.line !== null && Math.abs(quote.line - line) > 1e-9) continue;
    if (!best || quote.oddMilli > best.oddMilli) best = quote;
  }
  return best;
}

/** Odd considerada "velha" após este intervalo. */
export const ODDS_STALE_AFTER_MS = 3 * 60 * 1000;

export function isQuoteStale(quote: OddsQuote, now: Date = new Date()): boolean {
  const captured = new Date(quote.capturedAt).getTime();
  if (Number.isNaN(captured)) return true;
  return now.getTime() - captured > ODDS_STALE_AFTER_MS;
}

/** "1,58" a partir de milli. */
export function formatOddMilli(oddMilli: number): string {
  return (oddMilli / MILLI).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "76%" / "+19,7%" */
export function formatProbabilityBps(bps: number, digits = 0): string {
  return `${(bps / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatSignedBps(bps: number, digits = 1): string {
  const abs = Math.abs(bps) / 100;
  const text = `${abs.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
  if (bps > 0) return `+${text}`;
  if (bps < 0) return `−${text}`;
  return text;
}
