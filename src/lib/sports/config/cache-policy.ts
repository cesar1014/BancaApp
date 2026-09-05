/**
 * Política de cache por tipo de dado (TTL em segundos).
 *
 * A regra é simples: quanto mais o dado muda, menor o TTL. Ligas e times quase
 * não mudam; odds ao vivo mudam a cada poucos segundos — mas mesmo elas não
 * precisam ser buscadas mais de uma vez por minuto para o que fazemos.
 *
 * O modo de economia multiplica todos os TTLs: com a quota apertando, o
 * sistema aceita dados mais velhos em vez de estourar o limite.
 */

export type CacheKind =
  | 'leagues'
  | 'teams'
  | 'fixtures-upcoming'
  | 'fixtures-today'
  | 'fixtures-live-list'
  | 'fixture-detail'
  | 'live-statistics'
  | 'odds-prematch'
  | 'odds-live'
  | 'predictions'
  | 'odds-events-index';

export const CACHE_TTL_SECONDS: Record<CacheKind, number> = {
  leagues: 7 * 24 * 3600, // muito longo
  teams: 7 * 24 * 3600, // muito longo
  'fixtures-upcoming': 6 * 3600, // longo
  'fixtures-today': 15 * 60, // médio
  'fixtures-live-list': 45, // curto: lista do que está rolando
  'fixture-detail': 12 * 3600, // partida específica não-viva
  'live-statistics': 40, // curto
  'odds-prematch': 20 * 60, // odds pré-jogo mudam devagar
  'odds-live': 60, // curtíssimo (mas nunca < 60s para poupar créditos)
  predictions: 12 * 3600,
  'odds-events-index': 30 * 60, // lista de eventos da Odds API (não gasta crédito)
};

export type EconomyMode = 'NORMAL' | 'ECONOMIA' | 'CRITICO';

export const ECONOMY_MODE_LABEL: Record<EconomyMode, string> = {
  NORMAL: 'Normal',
  ECONOMIA: 'Economia',
  CRITICO: 'Crítico',
};

/** Multiplicador de TTL por modo. */
export const ECONOMY_TTL_MULTIPLIER: Record<EconomyMode, number> = {
  NORMAL: 1,
  ECONOMIA: 3,
  CRITICO: 10,
};

export function ttlFor(kind: CacheKind, mode: EconomyMode = 'NORMAL'): number {
  return Math.round(CACHE_TTL_SECONDS[kind] * ECONOMY_TTL_MULTIPLIER[mode]);
}

/**
 * Cooldown mínimo entre atualizações de UMA partida, segundo o estado da
 * análise. Partida com entrada identificada merece atualização mais frequente
 * do que uma "observando".
 */
export const FIXTURE_COOLDOWN_SECONDS = {
  ENTRADA_IDENTIFICADA: 45,
  VALUE_CONFIRMADO: 45,
  ODD_AGUARDANDO: 60,
  POSSIVEL_OPORTUNIDADE: 60,
  PRESSAO_DETECTADA: 90,
  MONITORANDO: 120,
  OBSERVANDO: 300,
  DESCARTADA: 900,
  ENCERRADA: Number.POSITIVE_INFINITY,
} as const;

/** Cooldown das rotinas globais (evita que duas views disparem o mesmo refresh). */
export const JOB_COOLDOWN_SECONDS = {
  fixtures: 15 * 60,
  live: 45,
  odds: 60,
  settle: 5 * 60,
  performance: 10 * 60,
} as const;
