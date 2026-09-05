/**
 * Normalização e comparação de nomes de times.
 *
 * O mesmo clube chega com nomes diferentes de cada provedor ("Man Utd",
 * "Manchester United", "Manchester Utd", "Atlético-MG", "Atletico Mineiro").
 * A chave normalizada + aliases conhecidos + similaridade de bigramas permitem
 * reconhecê-lo sem depender de igualdade exata.
 */

/** Sufixos/prefixos que não identificam o clube. */
const NOISE_TOKENS = new Set([
  'se',
  'aa',
  'ce',
  'fr',
  'fbpa',
  'fc',
  'sc',
  'ec',
  'cf',
  'afc',
  'ac',
  'as',
  'ss',
  'us',
  'sv',
  'fk',
  'bk',
  'if',
  'cd',
  'ca',
  'cr',
  'club',
  'clube',
  'de',
  'do',
  'da',
  'des',
  'del',
  'the',
  'football',
  'futebol',
  'regatas',
  'esporte',
  'sport',
  'sports',
  'associacao',
  'sociedade',
  'esportiva',
  'atletica',
  'women',
  'w',
]);

/** Abreviações comuns → forma canônica. */
const TOKEN_ALIASES: Record<string, string> = {
  utd: 'united',
  ath: 'athletic',
  atl: 'atletico',
  athletico: 'atletico',
  int: 'internacional',
  inter: 'internacional',
  cor: 'corinthians',
  fla: 'flamengo',
  flu: 'fluminense',
  pal: 'palmeiras',
  bot: 'botafogo',
  cru: 'cruzeiro',
  gre: 'gremio',
  vas: 'vasco',
  bah: 'bahia',
  for: 'fortaleza',
  sao: 'sao',
  man: 'manchester',
  city: 'city',
  spurs: 'tottenham',
  wolves: 'wolverhampton',
  psg: 'paris saint germain',
  saint: 'saint',
  st: 'saint',
  bayern: 'bayern',
  dortmund: 'dortmund',
  bvb: 'dortmund',
  real: 'real',
  barca: 'barcelona',
  atleti: 'atletico madrid',
  juve: 'juventus',
  napoli: 'napoli',
  ajax: 'ajax',
  psv: 'psv',
  fcb: 'barcelona',
  rb: 'rb',
  cska: 'cska',
};

/**
 * Aliases de clubes inteiros: forma normalizada alternativa → chave canônica.
 * Cobre os casos mais comuns do Brasileirão e das ligas europeias grandes.
 * O índice persistido em `sport_teams.aliases` complementa esta lista em runtime.
 */
export const KNOWN_TEAM_ALIASES: Record<string, string> = {
  'manchester united': 'manchester united',
  'man united': 'manchester united',
  'manchester utd': 'manchester united',
  'man utd': 'manchester united',
  'manchester city': 'manchester city',
  'man city': 'manchester city',
  'tottenham hotspur': 'tottenham',
  'tottenham': 'tottenham',
  'wolverhampton wanderers': 'wolverhampton',
  'wolves': 'wolverhampton',
  'newcastle united': 'newcastle',
  'newcastle': 'newcastle',
  'west ham united': 'west ham',
  'west ham': 'west ham',
  'brighton hove albion': 'brighton',
  'brighton and hove albion': 'brighton',
  'brighton': 'brighton',
  'nottingham forest': 'nottingham forest',
  'nottm forest': 'nottingham forest',
  'leicester city': 'leicester',
  'leicester': 'leicester',
  'atletico mineiro': 'atletico mineiro',
  'atletico mg': 'atletico mineiro',
  'atletico-mg': 'atletico mineiro',
  'galo': 'atletico mineiro',
  'atletico paranaense': 'athletico paranaense',
  'athletico paranaense': 'athletico paranaense',
  'atletico pr': 'athletico paranaense',
  'athletico pr': 'athletico paranaense',
  'atletico goianiense': 'atletico goianiense',
  'atletico go': 'atletico goianiense',
  'sao paulo': 'sao paulo',
  'sao paulo fc': 'sao paulo',
  'internacional': 'internacional',
  'inter': 'internacional',
  'sc internacional': 'internacional',
  'gremio': 'gremio',
  'gremio fbpa': 'gremio',
  'red bull bragantino': 'bragantino',
  'rb bragantino': 'bragantino',
  'bragantino': 'bragantino',
  'vasco gama': 'vasco',
  'vasco da gama': 'vasco',
  'vasco': 'vasco',
  'botafogo fr': 'botafogo',
  'botafogo': 'botafogo',
  'fluminense': 'fluminense',
  'flamengo': 'flamengo',
  'palmeiras': 'palmeiras',
  'corinthians': 'corinthians',
  'santos': 'santos',
  'cruzeiro': 'cruzeiro',
  'bahia': 'bahia',
  'fortaleza': 'fortaleza',
  'fortaleza ec': 'fortaleza',
  'vitoria': 'vitoria',
  'juventude': 'juventude',
  'cuiaba': 'cuiaba',
  'criciuma': 'criciuma',
  'goias': 'goias',
  'coritiba': 'coritiba',
  'sport recife': 'sport recife',
  'sport': 'sport recife',
  'ceara': 'ceara',
  'mirassol': 'mirassol',
  'paris saint germain': 'paris saint germain',
  'paris sg': 'paris saint germain',
  'psg': 'paris saint germain',
  'bayern munich': 'bayern munich',
  'bayern munchen': 'bayern munich',
  'bayern': 'bayern munich',
  'borussia dortmund': 'dortmund',
  'dortmund': 'dortmund',
  'bvb': 'dortmund',
  'real madrid': 'real madrid',
  'atletico madrid': 'atletico madrid',
  'atletico de madrid': 'atletico madrid',
  'barcelona': 'barcelona',
  'fc barcelona': 'barcelona',
  'inter milan': 'inter milan',
  'internazionale': 'inter milan',
  'inter milano': 'inter milan',
  'ac milan': 'milan',
  'milan': 'milan',
  'juventus': 'juventus',
  'napoli': 'napoli',
  'ssc napoli': 'napoli',
  'roma': 'roma',
  'as roma': 'roma',
  'celtic': 'celtic',
  'rangers': 'rangers',
  'glasgow rangers': 'rangers',
  'fc copenhagen': 'copenhagen',
  'copenhagen': 'copenhagen',
  'kobenhavn': 'copenhagen',
  'fc kobenhavn': 'copenhagen',
  'midtjylland': 'midtjylland',
  'fc midtjylland': 'midtjylland',
  'brondby': 'brondby',
  'brondby if': 'brondby',
};

/** Letras que o NFD não decompõe (ø, æ, ß, ł, đ, œ...). */
const SPECIAL_LETTERS: Record<string, string> = {
  ø: 'o',
  Ø: 'o',
  æ: 'ae',
  Æ: 'ae',
  ß: 'ss',
  ł: 'l',
  Ł: 'l',
  đ: 'd',
  Đ: 'd',
  œ: 'oe',
  Œ: 'oe',
  ð: 'd',
  þ: 'th',
};

/** Remove acentos (marcas combinantes) e letras especiais sem decomposição. */
export function stripDiacritics(value: string): string {
  return value
    .replace(/[øØæÆßłŁđĐœŒðþ]/g, (char) => SPECIAL_LETTERS[char] ?? char)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

/**
 * Normalização base: minúsculas, sem acento, sem pontuação, tokens de ruído
 * removidos e abreviações expandidas.
 *
 *   "Manchester Utd."   → "manchester united"
 *   "Atlético-MG"       → "atletico mg"
 *   "SE Palmeiras"      → "palmeiras"
 */
export function normalizeTeamName(raw: string): string {
  const base = stripDiacritics(raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const tokens = base
    .split(' ')
    .filter((token) => token !== '')
    .map((token) => TOKEN_ALIASES[token] ?? token)
    .join(' ')
    .split(' ')
    .filter((token) => token !== '' && !NOISE_TOKENS.has(token));

  // Nunca reduzir a nada: se só havia ruído ("Sport"), mantém o original.
  const joined = tokens.join(' ').trim();
  return joined === '' ? base : joined;
}

/**
 * Chave canônica do clube: normaliza e resolve aliases conhecidos.
 * Aliases extras (persistidos no banco) podem ser passados por parâmetro.
 */
/** Índice dos aliases conhecidos com as chaves já normalizadas. */
const KNOWN_ALIAS_INDEX = new Map<string, string>(
  Object.entries(KNOWN_TEAM_ALIASES).map(([alias, key]) => [normalizeTeamName(alias), key]),
);

export function teamKey(raw: string, extraAliases: Readonly<Record<string, string>> = {}): string {
  const normalized = normalizeTeamName(raw);
  return extraAliases[normalized] ?? extraAliases[raw.toLowerCase()] ?? KNOWN_ALIAS_INDEX.get(normalized) ?? normalized;
}

function bigrams(value: string): Map<string, number> {
  const map = new Map<string, number>();
  const padded = ` ${value} `;
  for (let i = 0; i < padded.length - 1; i += 1) {
    const gram = padded.slice(i, i + 2);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }
  return map;
}

/** Coeficiente de Dice sobre bigramas: 0 (nada em comum) a 1 (idêntico). */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  let total = 0;
  for (const [gram, count] of ga) {
    total += count;
    const other = gb.get(gram);
    if (other) overlap += Math.min(count, other);
  }
  for (const count of gb.values()) total += count;
  return total === 0 ? 0 : (2 * overlap) / total;
}

/**
 * Similaridade entre dois nomes de time (0–1). Combina:
 *   - chave canônica igual → 1
 *   - Dice de bigramas das formas normalizadas
 *   - bônus quando um é prefixo do outro ou compartilham o token principal
 */
export function teamSimilarity(
  a: string,
  b: string,
  extraAliases: Readonly<Record<string, string>> = {},
): number {
  const ka = teamKey(a, extraAliases);
  const kb = teamKey(b, extraAliases);
  if (ka === kb) return 1;

  let score = diceSimilarity(ka, kb);

  if (ka.startsWith(kb) || kb.startsWith(ka)) score = Math.max(score, 0.9);

  const ta = ka.split(' ');
  const tb = kb.split(' ');
  const shared = ta.filter((token) => token.length > 3 && tb.includes(token));
  if (shared.length > 0) score = Math.max(score, 0.75 + 0.05 * Math.min(shared.length, 3));

  return Math.min(1, score);
}

/** Limiar padrão a partir do qual dois nomes são considerados o mesmo clube. */
export const TEAM_MATCH_THRESHOLD = 0.82;

export function isSameTeam(
  a: string,
  b: string,
  extraAliases: Readonly<Record<string, string>> = {},
  threshold = TEAM_MATCH_THRESHOLD,
): boolean {
  return teamSimilarity(a, b, extraAliases) >= threshold;
}
