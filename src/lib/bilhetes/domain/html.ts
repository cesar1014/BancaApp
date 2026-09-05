/**
 * Utilidades mínimas para extrair texto de HTML servidor-side sem
 * dependência externa. Suficiente para as páginas das fontes, que têm
 * estrutura regular; não é um parser de HTML completo.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  eacute: 'é',
  aacute: 'á',
  atilde: 'ã',
  ccedil: 'ç',
  otilde: 'õ',
  oacute: 'ó',
  iacute: 'í',
  uacute: 'ú',
  ecirc: 'ê',
  ocirc: 'ô',
  acirc: 'â',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/** Remove tags, scripts e estilos; normaliza espaços. */
export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h\d|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Texto de um trecho em uma linha. */
export function inline(html: string): string {
  return stripTags(html).replace(/\s+/g, ' ').trim();
}

/** Todos os trechos entre um marcador de abertura e o próximo marcador (ou o fim). */
export function splitBy(html: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    starts.push(match.index);
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

/** Primeiro grupo de captura de `pattern` dentro de `html`, ou null. */
export function firstGroup(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  return match?.[1] !== undefined ? decodeEntities(match[1]).trim() : null;
}

/** Todos os primeiros grupos de captura. */
export function allGroups(html: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...html.matchAll(new RegExp(pattern.source, flags))].map((m) => decodeEntities(m[1] ?? '').trim());
}

/** Conteúdo de um elemento com a classe informada (primeiro nível, sem aninhamento do mesmo tag). */
export function elementByClass(html: string, tag: string, className: string): string | null {
  const re = new RegExp(`<${tag}[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = re.exec(html);
  return match?.[1] ?? null;
}

export function elementsByClass(html: string, tag: string, className: string): string[] {
  const re = new RegExp(`<${tag}[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...html.matchAll(re)].map((m) => m[1] ?? '');
}

/** Divide "Time A x Time B" / "A vs B" / "A — B" / "A v B". */
export function splitTeams(text: string): { home: string; away: string } | null {
  const cleaned = inline(text);
  const match = /^(.+?)\s+(?:x|vs\.?|v|—|–|-|versus)\s+(.+)$/i.exec(cleaned);
  if (!match) return null;
  const home = match[1]!.trim();
  const away = match[2]!.trim();
  if (!home || !away) return null;
  return { home, away };
}
