import { monthOfDate, type IsoDate } from './datetime';

export interface Period {
  year: number;
  month: number;
}

/**
 * Lê ?ano= e ?mes= da URL, caindo para o mês corrente da banca quando ausentes
 * ou inválidos. Valores fora de faixa nunca chegam ao banco.
 */
export function resolvePeriod(
  searchParams: Record<string, string | string[] | undefined>,
  today: IsoDate,
): Period {
  const current = monthOfDate(today);

  const rawYear = first(searchParams.ano);
  const rawMonth = first(searchParams.mes);

  const year = Number(rawYear);
  const month = Number(rawMonth);

  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : current.year;
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : current.month;

  // Se apenas um dos dois veio, o outro segue o mês corrente — evita períodos
  // absurdos como "ano 2026 / mês indefinido".
  if (rawYear === undefined && rawMonth === undefined) return current;

  return { year: validYear, month: validMonth };
}

export function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
