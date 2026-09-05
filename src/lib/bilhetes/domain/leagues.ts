/**
 * Nome da competição como as fontes escrevem → chave do catálogo do módulo
 * de dicas (quando existe). Serve de pista para o casamento da perna — nunca
 * de filtro rígido.
 *
 * "Série A"/"Série B" são ambíguas (Brasil × Itália): em fontes
 * internacionais, sem menção a Brasil, valem como italianas.
 */

import type { SourceCountry } from './types';

interface Hint {
  pattern: RegExp;
  key: string | null;
  label: string;
  /** Só vale para fontes deste país (null = qualquer). */
  only?: SourceCountry;
}

const HINTS: readonly Hint[] = [
  { pattern: /brasileir[aã]o s[ée]rie b|s[ée]rie b do brasil|campeonato brasileiro s[ée]rie b/i, key: 'BRA_SERIE_B', label: 'Brasileirão Série B' },
  { pattern: /brasileir[aã]o|campeonato brasileiro|brazil(?:ian)? serie a|s[ée]rie a do brasil/i, key: 'BRA_SERIE_A', label: 'Brasileirão Série A' },
  { pattern: /copa do brasil/i, key: 'BRA_COPA', label: 'Copa do Brasil' },
  { pattern: /libertadores/i, key: 'CONMEBOL_LIBERTADORES', label: 'Copa Libertadores' },
  { pattern: /sul-?americana|sudamericana/i, key: 'CONMEBOL_SUDAMERICANA', label: 'Copa Sul-Americana' },
  { pattern: /premier league|\bepl\b|campeonato ingl[eê]s/i, key: 'ENG_PREMIER_LEAGUE', label: 'Premier League' },
  { pattern: /la ?liga|campeonato espanhol|primera divisi[oó]n(?!.*argentin)/i, key: 'ESP_LA_LIGA', label: 'La Liga' },
  { pattern: /bundesliga/i, key: 'GER_BUNDESLIGA', label: 'Bundesliga' },
  { pattern: /ligue 1|campeonato franc[eê]s/i, key: 'FRA_LIGUE_1', label: 'Ligue 1' },
  { pattern: /primeira liga|campeonato portugu[eê]s/i, key: 'POR_PRIMEIRA_LIGA', label: 'Primeira Liga' },
  { pattern: /eredivisie/i, key: 'NED_EREDIVISIE', label: 'Eredivisie' },
  { pattern: /champions league|liga dos campe[oõ]es/i, key: 'UEFA_CHAMPIONS_LEAGUE', label: 'Champions League' },
  { pattern: /europa league|liga europa/i, key: 'UEFA_EUROPA_LEAGUE', label: 'Europa League' },
  { pattern: /liga profesional|campeonato argentino|argentine/i, key: 'ARG_PRIMERA', label: 'Liga Profesional' },
  { pattern: /liga mx|campeonato mexicano/i, key: 'MEX_LIGA_MX', label: 'Liga MX' },
  { pattern: /\bmls\b|major league soccer/i, key: 'USA_MLS', label: 'MLS' },
  { pattern: /superliga|danish|dinamarqu/i, key: 'DEN_SUPERLIGA', label: 'Superliga' },
  { pattern: /scottish|premiership|escoc[eê]s/i, key: 'SCO_PREMIERSHIP', label: 'Scottish Premiership' },
  { pattern: /calcio|italian serie a|serie a\b.*it[aá]l/i, key: 'ITA_SERIE_A', label: 'Serie A' },
  // Ambíguas: Brasil em fontes brasileiras, Itália nas internacionais.
  { pattern: /s[ée]rie b\b/i, key: 'BRA_SERIE_B', label: 'Brasileirão Série B', only: 'BR' },
  { pattern: /s[ée]rie a\b/i, key: 'BRA_SERIE_A', label: 'Brasileirão Série A', only: 'BR' },
  { pattern: /serie b\b/i, key: null, label: 'Serie B', only: 'INT' },
  { pattern: /serie a\b/i, key: 'ITA_SERIE_A', label: 'Serie A', only: 'INT' },
];

function find(text: string | null | undefined, country: SourceCountry | null): Hint | null {
  if (!text) return null;
  for (const hint of HINTS) {
    if (hint.only && country && hint.only !== country) continue;
    if (hint.only && !country) continue;
    if (hint.pattern.test(text)) return hint;
  }
  return null;
}

export function leagueKeyFromText(text: string | null | undefined, country: SourceCountry | null = null): string | null {
  return find(text, country)?.key ?? null;
}

export function leagueLabelFromText(text: string | null | undefined, country: SourceCountry | null = null): string | null {
  return find(text, country)?.label ?? null;
}
