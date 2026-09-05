/**
 * Modelos internos NORMALIZADOS da camada de dados esportivos.
 *
 * Nenhum componente de interface e nenhuma estratégia conhece o formato de
 * resposta de uma API específica: os adaptadores (providers/*) traduzem para
 * estes tipos e todo o resto do sistema trabalha só com eles.
 *
 * Convenções numéricas (as mesmas do restante do projeto — nada de float em
 * dado persistido):
 *   odds          inteiro × 1000  (1,58  → 1580)   sufixo Milli
 *   probabilidade basis points    (76%   → 7600)   sufixo Bps
 *   xG            inteiro × 1000  (1,18  → 1180)   sufixo Milli
 *   score         inteiro 0–100
 */

export type ProviderKey = 'api-football' | 'sportmonks' | 'odds-api' | 'mock';

export const PROVIDER_LABEL: Record<ProviderKey, string> = {
  'api-football': 'API-Football',
  sportmonks: 'Sportmonks',
  'odds-api': 'The Odds API',
  mock: 'Simulação',
};

/** Identificadores do mesmo objeto em cada provedor. */
export type ProviderIds = Partial<Record<ProviderKey, string>>;

export type FixtureStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'HALFTIME'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'UNKNOWN';

export const FIXTURE_STATUS_LABEL: Record<FixtureStatus, string> = {
  SCHEDULED: 'Agendada',
  LIVE: 'Ao vivo',
  HALFTIME: 'Intervalo',
  FINISHED: 'Encerrada',
  POSTPONED: 'Adiada',
  CANCELLED: 'Cancelada',
  UNKNOWN: 'Indefinida',
};

export type DataConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type TeamSide = 'HOME' | 'AWAY';

export interface NormalizedLeague {
  /** Chave interna estável (ex.: BRA_SERIE_A). */
  key: string;
  name: string;
  country: string;
  season: number | null;
  providerIds: ProviderIds;
  /** 1 = máxima. Decide quem entra primeiro no funil. */
  priority: number;
}

export interface NormalizedTeam {
  /** Chave interna estável: nome normalizado (ex.: "palmeiras"). */
  key: string;
  name: string;
  shortName: string | null;
  country: string | null;
  aliases: string[];
  providerIds: ProviderIds;
}

/** Estatísticas de um time numa partida. Tudo pode ser null: dado ausente ≠ zero. */
export interface TeamStatistics {
  possessionBps: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  shotsOffTarget: number | null;
  blockedShots: number | null;
  shotsInsideBox: number | null;
  corners: number | null;
  yellowCards: number | null;
  redCards: number | null;
  fouls: number | null;
  offsides: number | null;
  attacks: number | null;
  dangerousAttacks: number | null;
  /** Expected goals × 1000. */
  xgMilli: number | null;
  /** Expected goals on target × 1000. */
  xgotMilli: number | null;
  passes: number | null;
  passAccuracyBps: number | null;
}

export const EMPTY_TEAM_STATISTICS: TeamStatistics = {
  possessionBps: null,
  shots: null,
  shotsOnTarget: null,
  shotsOffTarget: null,
  blockedShots: null,
  shotsInsideBox: null,
  corners: null,
  yellowCards: null,
  redCards: null,
  fouls: null,
  offsides: null,
  attacks: null,
  dangerousAttacks: null,
  xgMilli: null,
  xgotMilli: null,
  passes: null,
  passAccuracyBps: null,
};

export interface NormalizedStatistics {
  home: TeamStatistics;
  away: TeamStatistics;
  source: ProviderKey | null;
  lastUpdated: string | null;
  confidence: DataConfidence;
}

export type EventType =
  | 'GOAL'
  | 'OWN_GOAL'
  | 'PENALTY_GOAL'
  | 'PENALTY_MISSED'
  | 'YELLOW_CARD'
  | 'RED_CARD'
  | 'SUBSTITUTION'
  | 'VAR'
  | 'OTHER';

export interface NormalizedEvent {
  minute: number;
  extraMinute: number | null;
  type: EventType;
  team: TeamSide;
  player: string | null;
  detail: string | null;
}

/**
 * Mercados suportados. Cada um tem seu Strategy Module em domain/strategies.
 * "line" carrega a linha do mercado (2.5 gols, 9.5 escanteios...).
 */
export type MarketKey =
  | 'OVER_0_5'
  | 'OVER_1_5'
  | 'OVER_2_5'
  | 'UNDER_2_5'
  | 'BTTS'
  | 'NEXT_GOAL'
  | 'MATCH_WINNER'
  | 'DOUBLE_CHANCE'
  | 'CORNERS'
  | 'CARDS';

export const MARKET_KEYS: readonly MarketKey[] = [
  'OVER_0_5',
  'OVER_1_5',
  'OVER_2_5',
  'UNDER_2_5',
  'BTTS',
  'NEXT_GOAL',
  'MATCH_WINNER',
  'DOUBLE_CHANCE',
  'CORNERS',
  'CARDS',
];

export const MARKET_LABEL: Record<MarketKey, string> = {
  OVER_0_5: 'Over 0.5 gols',
  OVER_1_5: 'Over 1.5 gols',
  OVER_2_5: 'Over 2.5 gols',
  UNDER_2_5: 'Under 2.5 gols',
  BTTS: 'Ambas marcam',
  NEXT_GOAL: 'Próximo gol',
  MATCH_WINNER: 'Resultado da partida',
  DOUBLE_CHANCE: 'Dupla chance',
  CORNERS: 'Escanteios',
  CARDS: 'Cartões',
};

/** Seleções possíveis dentro de um mercado. */
export type Selection =
  | 'OVER'
  | 'UNDER'
  | 'YES'
  | 'NO'
  | 'HOME'
  | 'AWAY'
  | 'DRAW'
  | 'NONE'
  | '1X'
  | 'X2'
  | '12';

export const SELECTION_LABEL: Record<Selection, string> = {
  OVER: 'Mais de',
  UNDER: 'Menos de',
  YES: 'Sim',
  NO: 'Não',
  HOME: 'Mandante',
  AWAY: 'Visitante',
  DRAW: 'Empate',
  NONE: 'Sem gol',
  '1X': 'Mandante ou empate',
  X2: 'Visitante ou empate',
  '12': 'Mandante ou visitante',
};

export interface OddsQuote {
  market: MarketKey;
  selection: Selection;
  /** Linha do mercado quando aplicável (2.5, 9.5). */
  line: number | null;
  oddMilli: number;
  bookmaker: string;
  provider: ProviderKey;
  /** ISO 8601 — nunca misturar odds sem informar quando foram vistas. */
  capturedAt: string;
}

export interface NormalizedOdds {
  quotes: OddsQuote[];
  lastUpdated: string | null;
  stale: boolean;
}

export interface Score {
  home: number;
  away: number;
}

export interface FixtureMetadata {
  /** Provedores que contribuíram para este objeto. */
  sources: ProviderKey[];
  lastUpdated: string;
  confidence: DataConfidence;
  stale: boolean;
  venue: string | null;
  round: string | null;
}

export interface NormalizedFixture {
  /** Chave interna determinística: data:mandante:visitante (ver matching.ts). */
  id: string;
  providerIds: ProviderIds;
  league: NormalizedLeague;
  homeTeam: NormalizedTeam;
  awayTeam: NormalizedTeam;
  /** Início da partida em ISO 8601 (UTC). */
  startTime: string;
  status: FixtureStatus;
  minute: number | null;
  score: Score;
  halftimeScore: Score | null;
  statistics: NormalizedStatistics | null;
  events: NormalizedEvent[];
  odds: NormalizedOdds | null;
  metadata: FixtureMetadata;
}

/** Previsão pré-jogo (quando o provedor oferece). */
export interface NormalizedPrediction {
  fixtureId: string;
  homeWinBps: number | null;
  drawBps: number | null;
  awayWinBps: number | null;
  /** Força relativa 0–100 estimada pelo provedor. */
  homeStrength: number | null;
  awayStrength: number | null;
  source: ProviderKey;
  lastUpdated: string;
}

/** Estados possíveis da análise de uma partida. */
export type AnalysisState =
  | 'OBSERVANDO'
  | 'MONITORANDO'
  | 'PRESSAO_DETECTADA'
  | 'POSSIVEL_OPORTUNIDADE'
  | 'ODD_AGUARDANDO'
  | 'VALUE_CONFIRMADO'
  | 'ENTRADA_IDENTIFICADA'
  | 'DESCARTADA'
  | 'ENCERRADA';

export const ANALYSIS_STATE_LABEL: Record<AnalysisState, string> = {
  OBSERVANDO: 'Observando',
  MONITORANDO: 'Monitorando',
  PRESSAO_DETECTADA: 'Pressão detectada',
  POSSIVEL_OPORTUNIDADE: 'Possível oportunidade',
  ODD_AGUARDANDO: 'Aguardando odd',
  VALUE_CONFIRMADO: 'Value confirmado',
  ENTRADA_IDENTIFICADA: 'Entrada identificada',
  DESCARTADA: 'Descartada',
  ENCERRADA: 'Encerrada',
};

/** Estado visual da partida ao vivo (o que a aba "Ao vivo" exibe). */
export type LiveDisplayState =
  | 'NORMAL'
  | 'MONITORANDO'
  | 'ATENCAO'
  | 'QUASE_ENTRADA'
  | 'OPORTUNIDADE'
  | 'ENCERRADA';

export const LIVE_DISPLAY_LABEL: Record<LiveDisplayState, string> = {
  NORMAL: 'Normal',
  MONITORANDO: 'Monitorando',
  ATENCAO: 'Atenção',
  QUASE_ENTRADA: 'Quase entrada',
  OPORTUNIDADE: 'Oportunidade',
  ENCERRADA: 'Encerrada',
};

export type TipConfidence = 'BAIXA' | 'MEDIA' | 'ALTA';

export type TipStatus = 'ACTIVE' | 'SETTLED' | 'EXPIRED' | 'DISCARDED';

export type TipResult = 'GREEN' | 'RED' | 'PUSH';

/** Componentes do score, para a interface explicar de onde veio o número. */
export interface ScoreBreakdownItem {
  key: string;
  label: string;
  /** Pontos obtidos (já ponderados). */
  points: number;
  /** Pontos máximos possíveis daquele componente. */
  max: number;
  /** false quando o dado não existia e o peso foi redistribuído. */
  available: boolean;
}

export interface ScoreBreakdown {
  total: number;
  items: ScoreBreakdownItem[];
}

/** Uma dica gerada pelo motor (antes ou depois de persistir). */
export interface BetTip {
  id: string;
  fixtureId: string;
  strategyKey: string;
  market: MarketKey;
  selection: Selection;
  line: number | null;
  oddMilli: number;
  minOddMilli: number;
  fairOddMilli: number;
  probabilityBps: number;
  valueBps: number;
  evBps: number;
  score: number;
  breakdown: ScoreBreakdown;
  confidence: TipConfidence;
  rationale: string;
  state: AnalysisState;
  status: TipStatus;
  bookmaker: string | null;
  oddsCapturedAt: string | null;
  minuteAt: number | null;
  scoreAt: Score;
  statsAt: NormalizedStatistics | null;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
  result: TipResult | null;
  stakeCents: number;
  payoutCents: number;
  profitCents: number;
  /** Se a dica virou uma entrada real registrada na banca. */
  entryId: string | null;
}
