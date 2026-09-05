/**
 * Conversão de odds publicadas em texto para milli (× 1000).
 *
 *   "1,40" / "1.40"  → 1400
 *   "8/13"           → 1615   (fração britânica: 1 + 8/13)
 *   "687/1000"       → 1687
 *   "EVS" / "evens"  → 2000
 */

export function parseDecimalOddMilli(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 1) return null;
  return Math.round(value * 1000);
}

export function fractionalOddToMilli(text: string | null | undefined): number | null {
  if (!text) return null;
  const trimmed = text.trim().toLowerCase();
  if (trimmed === 'evs' || trimmed === 'evens' || trimmed === '1/1') return 2000;
  const match = /^(\d+)\s*[/-]\s*(\d+)$/.exec(trimmed);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return Math.round((1 + numerator / denominator) * 1000);
}

/** Aceita decimal ou fração, o que vier. */
export function parseAnyOddMilli(text: string | null | undefined): number | null {
  if (!text) return null;
  if (/^\s*\d+\s*\/\s*\d+\s*$/.test(text)) return fractionalOddToMilli(text);
  return parseDecimalOddMilli(text);
}
