/**
 * Datas de negócio são strings 'YYYY-MM-DD' (coluna DATE no Postgres).
 * Toda aritmética usa UTC internamente para não sofrer deslocamento de fuso;
 * o fuso da banca é usado apenas para responder "que dia é hoje?".
 */

export type IsoDate = string; // 'YYYY-MM-DD'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

export function assertIsoDate(value: unknown, field = 'data'): IsoDate {
  if (!isIsoDate(value)) throw new Error(`${field}: data inválida (use AAAA-MM-DD)`);
  return value;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Data de hoje no fuso informado, como 'YYYY-MM-DD'. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

/** Hora atual 'HH:MM' no fuso informado. */
export function timeNowIn(timeZone: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(now);
}

export function toUtcDate(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUtcDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

export function diffInDays(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

export function monthOf(date: IsoDate): number {
  return Number(date.slice(5, 7));
}

export function dayOf(date: IsoDate): number {
  return Number(date.slice(8, 10));
}

export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

export function monthRange(year: number, month: number): DateRange {
  const mm = String(month).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
  };
}

export function monthOfDate(date: IsoDate): { year: number; month: number } {
  return { year: yearOf(date), month: monthOf(date) };
}

/** Semana ISO: segunda-feira a domingo. */
export function isoWeekRange(date: IsoDate): DateRange {
  const d = toUtcDate(date);
  const weekday = d.getUTCDay(); // 0=domingo
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(date, offsetToMonday);
  return { start, end: addDays(start, 6) };
}

/** Lista de todas as datas do mês, em ordem. */
export function listMonthDates(year: number, month: number): IsoDate[] {
  const total = daysInMonth(year, month);
  const mm = String(month).padStart(2, '0');
  const out: IsoDate[] = [];
  for (let day = 1; day <= total; day += 1) {
    out.push(`${year}-${mm}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

export function isWithin(date: IsoDate, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/** '05/09/2026' */
export function formatDateBR(date: IsoDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** '05/09' */
export function formatDayMonth(date: IsoDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export const MONTH_NAMES_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

/** 'Setembro/2026' */
export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? '—'}/${year}`;
}

/** 'Set/26' */
export function formatMonthShort(year: number, month: number): string {
  return `${MONTH_NAMES_SHORT[month - 1] ?? '—'}/${String(year).slice(2)}`;
}

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export function weekdayShort(date: IsoDate): string {
  return WEEKDAY_SHORT[toUtcDate(date).getUTCDay()] ?? '';
}

/** '04/09/2026 16:32' a partir de um timestamp. */
export function formatDateTimeBR(value: Date | string, timeZone = 'America/Sao_Paulo'): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Normaliza 'HH:MM:SS' -> 'HH:MM'. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(0, 5);
}

/** Mês anterior a (year, month). */
export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Chave ordenável 'AAAA-MM'. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthKey(key: string): { year: number; month: number } | null {
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  if (month < 1 || month > 12) return null;
  return { year, month };
}
