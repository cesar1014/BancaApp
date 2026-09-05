/**
 * Datas e horários como as fontes escrevem, em português e inglês.
 *
 *   "Hoje" / "Amanhã" / "Today" / "Tomorrow"       → dia relativo a `now`
 *   "05/09" / "05/09/2026" / "05.09.2026"           → dia absoluto
 *   "19:30" / "16h05" / "14h" / "18:45"             → hora local
 *
 * O "hoje" de uma fonte é o dia no fuso dela: fontes brasileiras usam
 * America/Sao_Paulo; internacionais, UTC (é o que os `datetime` delas usam).
 */

export const SAO_PAULO = 'America/Sao_Paulo';

export function dateInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** "Hoje"/"Amanhã"/"Today"/"Tomorrow" → 'AAAA-MM-DD'; null se não for relativo. */
export function parseRelativeDay(text: string, now: Date, timeZone: string): string | null {
  const t = text.trim().toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '');
  const today = dateInZone(now, timeZone);
  if (t === 'hoje' || t === 'today' || t === 'hoy') return today;
  if (t === 'amanha' || t === 'tomorrow' || t === 'manana') return addDaysIso(today, 1);
  if (t === 'ontem' || t === 'yesterday') return addDaysIso(today, -1);
  if (t === 'depois de amanha' || t === 'day after tomorrow') return addDaysIso(today, 2);
  return null;
}

/** "05/09", "05/09/2026", "05.09.2026", "5/9" → 'AAAA-MM-DD' (ano de `now` quando omitido). */
export function parseDayMonth(text: string, now: Date, timeZone: string): string | null {
  const match = /(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/.exec(text);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  let year = match[3] ? Number(match[3]) : Number(dateInZone(now, timeZone).slice(0, 4));
  if (year < 100) year += 2000;
  // Sem ano: se a data ficou mais de 6 meses no passado, é do ano que vem.
  if (!match[3]) {
    const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const today = dateInZone(now, timeZone);
    if (candidate < addDaysIso(today, -180)) year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Qualquer das formas acima. */
export function parseDay(text: string, now: Date, timeZone: string): string | null {
  return parseRelativeDay(text, now, timeZone) ?? parseDayMonth(text, now, timeZone);
}

/** "19:30", "16h05", "14h", "18:45" → { hour, minute }. */
export function parseTime(text: string): { hour: number; minute: number } | null {
  const match = /(\d{1,2})\s*[:h]\s*(\d{2})?/i.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Combina dia + hora local no fuso informado e devolve ISO em UTC.
 * Calcula o deslocamento do fuso para aquele dia (respeita horário de verão).
 */
export function localToIso(date: string, hour: number, minute: number, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const offset = asLocal - guess;
  return new Date(guess - offset).toISOString();
}

/** "2026-09-05 16:00:00" (sem fuso, hora local do site) ou ISO completo → ISO UTC. */
export function parseDateTimeAttr(value: string, timeZone: string): string | null {
  const trimmed = value.trim();
  if (/Z$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(trimmed);
  if (!match) return null;
  return localToIso(match[1]!, Number(match[2]), Number(match[3]), timeZone);
}
