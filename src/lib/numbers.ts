/**
 * Odds em "milli" (odd × 1000) e percentuais em "basis points" (% × 100).
 * Mesma motivação de money.ts: nada de float em dado persistido.
 */

export type OddMilli = number;
export type Bps = number;

export const BPS_DENOMINATOR = 10_000;
export const ODD_DENOMINATOR = 1_000;

export function oddToMilli(odd: number): OddMilli {
  if (!Number.isFinite(odd)) throw new Error('Odd inválida');
  return Math.round(odd * ODD_DENOMINATOR);
}

export function milliToOdd(milli: OddMilli): number {
  return milli / ODD_DENOMINATOR;
}

/** Aceita "2,15" ou "2.15". Devolve null se inválido. */
export function parseOddToMilli(input: string): OddMilli | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * ODD_DENOMINATOR);
}

export function formatOdd(milli: OddMilli): string {
  return (milli / ODD_DENOMINATOR).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

export function percentToBps(percent: number): Bps {
  if (!Number.isFinite(percent)) throw new Error('Percentual inválido');
  return Math.round(percent * 100);
}

export function bpsToPercent(bps: Bps): number {
  return bps / 100;
}

/** Aceita "1,5" ou "1.5". Devolve null se inválido. */
export function parsePercentToBps(input: string): Bps | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().replace('%', '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** "1,50%" */
export function formatBps(bps: Bps, fractionDigits = 2): string {
  return `${(bps / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

/**
 * "+12,40%" / "−3,10%" — para ROI e variações.
 *
 * Como em formatMoneySigned, o negativo usa o menos tipográfico (U+2212) para
 * que a coluna não desalinhe entre valores positivos e negativos.
 */
export function formatBpsSigned(bps: Bps, fractionDigits = 2): string {
  if (bps < 0) return `−${formatBps(Math.abs(bps), fractionDigits)}`;
  const sign = bps > 0 ? '+' : '';
  return `${sign}${formatBps(bps, fractionDigits)}`;
}

/** Aplica um percentual (bps) sobre um inteiro, arredondando meio para cima. */
export function applyBps(value: number, bps: Bps): number {
  return Math.round((value * bps) / BPS_DENOMINATOR);
}

/**
 * Razão entre dois inteiros expressa em bps. Devolve null quando o
 * denominador é zero (evita exibir "0%" onde a métrica não existe).
 */
export function ratioToBps(numerator: number, denominator: number): Bps | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * BPS_DENOMINATOR);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
