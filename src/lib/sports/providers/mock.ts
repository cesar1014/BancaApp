/**
 * Provedor simulado (DATA_PROVIDER_MODE=mock).
 *
 * Gera um calendário determinístico por dia (mesma data → mesmos jogos),
 * partidas ao vivo que evoluem com o relógio real, estatísticas coerentes com
 * o minuto, eventos, odds de três casas e previsões — tudo sem gastar quota.
 *
 * Determinismo: um gerador pseudoaleatório semeado pela data e pelo índice do
 * jogo garante que a mesma partida tenha os mesmos gols/estatísticas em
 * qualquer instância, o que permite testar e persistir sem surpresas.
 */

import { LEAGUE_CATALOG, type LeagueCatalogEntry } from '../config/leagues';
import type {
  FixtureStatus,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedPrediction,
  NormalizedStatistics,
  NormalizedTeam,
  OddsQuote,
  TeamStatistics,
} from '../domain/models';
import { teamKey } from '../domain/names';
import { fixtureKey } from '../domain/matching';
import { impliedProbabilityBps } from '../domain/odds-math';
import { poissonAtLeast, matchOutcomeProbabilities } from '../domain/poisson';
import type { FixtureQuery, OddsRequest, ProviderCapabilities, SportsProvider } from './types';

// ---------------------------------------------------------------------------
// Gerador determinístico
// ---------------------------------------------------------------------------
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Times por liga (nomes variados de propósito, para exercitar o matching)
// ---------------------------------------------------------------------------
const TEAMS: Record<string, string[]> = {
  BRA_SERIE_A: ['Palmeiras', 'Flamengo', 'São Paulo', 'Corinthians', 'Atlético-MG', 'Grêmio', 'Internacional', 'Fluminense', 'Botafogo', 'Cruzeiro', 'Bahia', 'Fortaleza', 'Vasco da Gama', 'RB Bragantino', 'Santos', 'Vitória'],
  ENG_PREMIER_LEAGUE: ['Manchester City', 'Arsenal', 'Liverpool', 'Chelsea', 'Manchester United', 'Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham', 'Everton', 'Wolves'],
  ESP_LA_LIGA: ['Real Madrid', 'Barcelona', 'Atlético Madrid', 'Athletic Club', 'Real Sociedad', 'Villarreal', 'Real Betis', 'Sevilla', 'Valencia', 'Girona'],
  ITA_SERIE_A: ['Inter', 'Juventus', 'Milan', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino'],
  GER_BUNDESLIGA: ['Bayern München', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen', 'Eintracht Frankfurt', 'VfB Stuttgart', 'Freiburg', 'Wolfsburg'],
  FRA_LIGUE_1: ['Paris Saint-Germain', 'Marseille', 'Monaco', 'Lyon', 'Lille', 'Nice', 'Lens', 'Rennes'],
  DEN_SUPERLIGA: ['FC København', 'FC Midtjylland', 'Brøndby IF', 'AGF', 'Nordsjælland', 'Randers', 'Silkeborg', 'Viborg'],
  SCO_PREMIERSHIP: ['Celtic', 'Rangers', 'Hearts', 'Aberdeen', 'Hibernian', 'Dundee United', 'Motherwell', 'Kilmarnock'],
  ARG_PRIMERA: ['River Plate', 'Boca Juniors', 'Racing Club', 'Independiente', 'San Lorenzo', 'Estudiantes', 'Vélez Sarsfield', 'Talleres'],
  USA_MLS: ['Inter Miami', 'LA Galaxy', 'LAFC', 'Atlanta United', 'Seattle Sounders', 'Columbus Crew', 'FC Cincinnati', 'Philadelphia Union'],
};

const BOOKMAKERS = ['Bet365', 'Betano', 'Pinnacle'];
const FIXTURES_PER_DAY = 40;

interface MockScript {
  league: LeagueCatalogEntry;
  home: string;
  away: string;
  startTime: Date;
  /** Força relativa 0–1 de cada lado. */
  homeStrength: number;
  awayStrength: number;
  /** Ritmo do jogo (finalizações por minuto, etc.). */
  tempo: number;
  goalMinutes: { minute: number; team: 'HOME' | 'AWAY' }[];
  cardMinutes: { minute: number; team: 'HOME' | 'AWAY'; red: boolean }[];
  cornersPerMinute: number;
  seed: number;
}

function team(name: string, country: string | null, providerId: string): NormalizedTeam {
  return { key: teamKey(name), name, shortName: null, country, aliases: [], providerIds: { mock: providerId } };
}

function buildScript(date: string, index: number): MockScript {
  const seed = hashString(`${date}#${index}`);
  const rng = mulberry32(seed);

  const leagues = LEAGUE_CATALOG.filter((league) => TEAMS[league.key]);
  const league = leagues[Math.floor(rng() * leagues.length)]!;
  const pool = TEAMS[league.key]!;
  const homeIndex = Math.floor(rng() * pool.length);
  let awayIndex = Math.floor(rng() * (pool.length - 1));
  if (awayIndex >= homeIndex) awayIndex += 1;

  // Um jogo a cada ~36 min ao longo do dia (UTC): sempre há algo ao vivo.
  const minuteOfDay = Math.floor((index * (24 * 60)) / FIXTURES_PER_DAY) + Math.floor(rng() * 10);
  const startTime = new Date(`${date}T00:00:00Z`);
  startTime.setUTCMinutes(minuteOfDay);

  const homeStrength = 0.35 + rng() * 0.5;
  const awayStrength = 0.3 + rng() * 0.5;
  const tempo = 0.6 + rng() * 0.9;

  // Gols: Poisson aproximado pela média da liga × tempo.
  const expected = (league.avgGoalsMilli / 1000) * (0.7 + tempo * 0.35);
  const goalMinutes: MockScript['goalMinutes'] = [];
  let minute = 0;
  while (minute < 93) {
    const gap = -Math.log(1 - rng()) / (expected / 90);
    minute += gap;
    if (minute >= 93) break;
    const homeShare = homeStrength / (homeStrength + awayStrength) + 0.08;
    goalMinutes.push({ minute: Math.max(1, Math.round(minute)), team: rng() < homeShare ? 'HOME' : 'AWAY' });
  }

  const cardMinutes: MockScript['cardMinutes'] = [];
  const cards = Math.round((league.avgCardsMilli / 1000) * (0.6 + rng() * 0.9));
  for (let i = 0; i < cards; i += 1) {
    cardMinutes.push({ minute: 15 + Math.floor(rng() * 75), team: rng() < 0.5 ? 'HOME' : 'AWAY', red: rng() < 0.06 });
  }
  cardMinutes.sort((a, b) => a.minute - b.minute);

  return {
    league,
    home: pool[homeIndex]!,
    away: pool[awayIndex]!,
    startTime,
    homeStrength,
    awayStrength,
    tempo,
    goalMinutes,
    cardMinutes,
    cornersPerMinute: ((league.avgCornersMilli / 1000) * (0.7 + tempo * 0.4)) / 90,
    seed,
  };
}

/** Minuto de jogo e status a partir do relógio real. */
function clock(script: MockScript, now: Date): { status: FixtureStatus; minute: number | null } {
  const elapsed = (now.getTime() - script.startTime.getTime()) / 60_000;
  if (elapsed < 0) return { status: 'SCHEDULED', minute: null };
  if (elapsed < 46) return { status: 'LIVE', minute: Math.max(1, Math.floor(elapsed)) };
  if (elapsed < 61) return { status: 'HALFTIME', minute: 45 };
  if (elapsed < 108) return { status: 'LIVE', minute: Math.min(90, 45 + Math.floor(elapsed - 60)) };
  return { status: 'FINISHED', minute: 90 };
}

function statsAt(script: MockScript, minute: number, side: 'HOME' | 'AWAY'): TeamStatistics {
  const rng = mulberry32(script.seed ^ (side === 'HOME' ? 0x9e3779b9 : 0x7f4a7c15));
  const strength = side === 'HOME' ? script.homeStrength + 0.05 : script.awayStrength;
  const otherStrength = side === 'HOME' ? script.awayStrength : script.homeStrength + 0.05;
  const share = strength / (strength + otherStrength);
  const noise = () => 0.85 + rng() * 0.3;

  // ~13 finalizações por time em 90 minutos, que é a média real do futebol.
  const shots = Math.round(0.145 * script.tempo * share * 2 * minute * noise());
  const sot = Math.round(shots * (0.3 + rng() * 0.15));
  // cornersPerMinute é a taxa do JOGO. A parte de cada time é a sua fração —
  // sem o "× 2" dos demais indicadores, que são medidos por time.
  const corners = Math.round(script.cornersPerMinute * share * minute * noise());
  const goals = script.goalMinutes.filter((g) => g.team === side && g.minute <= minute).length;
  const cards = script.cardMinutes.filter((c) => c.team === side && c.minute <= minute);
  // Um chute no alvo vale ~0,16 de gol esperado e um chute fora ~0,03: com
  // isso o xG de um jogo inteiro fica perto dos 2,7 reais, e não no dobro.
  const xg = Math.round((sot * 0.16 + (shots - sot) * 0.03 + goals * 0.1) * 1000 * noise());

  return {
    possessionBps: Math.round(share * 10_000),
    shots,
    shotsOnTarget: sot,
    shotsOffTarget: Math.max(0, shots - sot - Math.round(shots * 0.15)),
    blockedShots: Math.round(shots * 0.15),
    shotsInsideBox: Math.round(shots * 0.55),
    corners,
    yellowCards: cards.filter((c) => !c.red).length,
    redCards: cards.filter((c) => c.red).length,
    fouls: Math.round(0.14 * minute * noise()),
    offsides: Math.round(0.03 * minute * share * 2),
    attacks: Math.round(1.1 * script.tempo * share * 2 * minute),
    dangerousAttacks: Math.round(0.55 * script.tempo * share * 2 * minute * noise()),
    xgMilli: xg,
    xgotMilli: Math.round(xg * 0.9),
    passes: Math.round(4.5 * minute * share * 2),
    passAccuracyBps: Math.round((0.72 + share * 0.15) * 10_000),
  };
}

function eventsAt(script: MockScript, minute: number): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  for (const goal of script.goalMinutes) {
    if (goal.minute <= minute) {
      events.push({ minute: goal.minute, extraMinute: null, type: 'GOAL', team: goal.team, player: null, detail: 'Gol' });
    }
  }
  for (const card of script.cardMinutes) {
    if (card.minute <= minute) {
      events.push({ minute: card.minute, extraMinute: null, type: card.red ? 'RED_CARD' : 'YELLOW_CARD', team: card.team, player: null, detail: card.red ? 'Cartão vermelho' : 'Cartão amarelo' });
    }
  }
  return events.sort((a, b) => a.minute - b.minute);
}

function buildFixture(script: MockScript, index: number, now: Date, detailed: boolean): NormalizedFixture {
  const { status, minute } = clock(script, now);
  const date = script.startTime.toISOString().slice(0, 10);
  const providerId = `mock-${date}-${index}`;
  const effectiveMinute = minute ?? (status === 'FINISHED' ? 90 : 0);
  const home = script.goalMinutes.filter((g) => g.team === 'HOME' && g.minute <= effectiveMinute).length;
  const away = script.goalMinutes.filter((g) => g.team === 'AWAY' && g.minute <= effectiveMinute).length;
  const live = status === 'LIVE' || status === 'HALFTIME';

  let statistics: NormalizedStatistics | null = null;
  let events: NormalizedEvent[] = [];
  if (detailed && (live || status === 'FINISHED')) {
    statistics = {
      home: statsAt(script, effectiveMinute, 'HOME'),
      away: statsAt(script, effectiveMinute, 'AWAY'),
      source: 'mock',
      lastUpdated: now.toISOString(),
      confidence: 'HIGH',
    };
    events = eventsAt(script, effectiveMinute);
  }

  return {
    id: fixtureKey(script.startTime.toISOString(), script.home, script.away),
    providerIds: { mock: providerId },
    league: script.league,
    homeTeam: team(script.home, script.league.country, `mock-t-${teamKey(script.home)}`),
    awayTeam: team(script.away, script.league.country, `mock-t-${teamKey(script.away)}`),
    startTime: script.startTime.toISOString(),
    status,
    minute,
    score: { home, away },
    halftimeScore:
      effectiveMinute >= 45
        ? {
            home: script.goalMinutes.filter((g) => g.team === 'HOME' && g.minute <= 45).length,
            away: script.goalMinutes.filter((g) => g.team === 'AWAY' && g.minute <= 45).length,
          }
        : null,
    statistics,
    events,
    odds: null,
    metadata: {
      sources: ['mock'],
      lastUpdated: now.toISOString(),
      confidence: 'HIGH',
      stale: false,
      venue: null,
      round: null,
    },
  };
}

/** Odds "de mercado": probabilidade verdadeira do roteiro + margem + ruído por casa. */
function buildOdds(script: MockScript, fixture: NormalizedFixture, now: Date): OddsQuote[] {
  const minute = fixture.minute ?? 0;
  const remaining = Math.max(0, 94 - minute);

  /**
   * As casas precificam a partir do que está acontecendo no jogo, não de um
   * roteiro secreto. Por isso o λ das odds parte do xG já produzido, na mesma
   * mistura que o motor usa, e só depois recebe margem e ruído.
   *
   * Sem isso, o simulador e o motor olhavam para números diferentes e o
   * resultado eram "oportunidades" de +50% de value, que não existem no mundo
   * real e ensinariam a expectativa errada a quem usa o app.
   */
  const basePerMinute = (script.league.avgGoalsMilli / 1000) * (0.7 + script.tempo * 0.35) / 90;
  const xgMilli = (fixture.statistics?.home.xgMilli ?? 0) + (fixture.statistics?.away.xgMilli ?? 0);
  const observedPerMinute = minute >= 5 && xgMilli > 0 ? xgMilli / 1000 / minute : null;
  const observedWeight = observedPerMinute === null ? 0 : Math.min(0.6, minute / 60);
  const ratePerMinute =
    observedPerMinute === null ? basePerMinute : observedWeight * observedPerMinute + (1 - observedWeight) * basePerMinute;
  const lambda = Math.min(ratePerMinute * remaining, (script.league.avgGoalsMilli / 1000) * 2 * (remaining / 90));
  const total = fixture.score.home + fixture.score.away;
  const homeShare = (script.homeStrength + 0.05) / (script.homeStrength + script.awayStrength + 0.05);

  const quotes: OddsQuote[] = [];
  const rng = mulberry32(script.seed ^ 0x51ed270b ^ Math.floor(minute / 3));
  const capturedAt = now.toISOString();

  const push = (market: OddsQuote['market'], selection: OddsQuote['selection'], line: number | null, probability: number) => {
    if (probability <= 0.02 || probability >= 0.98) return;
    for (const bookmaker of BOOKMAKERS) {
      // Cada casa erra para um lado (±7%) e embute ~6% de margem. Comparar as
      // três faz a melhor odd ocasionalmente ter value de verdade, na faixa de
      // um dígito, que é o que se encontra no mercado real.
      const noise = 1 + (rng() - 0.5) * 0.14;
      const p = Math.min(0.97, Math.max(0.03, probability * noise));
      const oddMilli = Math.round((1000 / p) * 0.94);
      quotes.push({ market, selection, line, oddMilli: Math.max(1_010, oddMilli), bookmaker, provider: 'mock', capturedAt });
    }
  };

  const overProb = (line: number) => {
    const needed = Math.floor(line) + 1 - total;
    return needed <= 0 ? 1 : poissonAtLeast(needed, lambda);
  };

  push('OVER_0_5', 'OVER', 0.5, overProb(0.5));
  push('OVER_1_5', 'OVER', 1.5, overProb(1.5));
  push('OVER_2_5', 'OVER', 2.5, overProb(2.5));
  push('UNDER_2_5', 'UNDER', 2.5, 1 - overProb(2.5));

  const homeNeeds = fixture.score.home === 0 ? 1 : 0;
  const awayNeeds = fixture.score.away === 0 ? 1 : 0;
  push('BTTS', 'YES', null, poissonAtLeast(homeNeeds, lambda * homeShare) * poissonAtLeast(awayNeeds, lambda * (1 - homeShare)));

  const outcomes = matchOutcomeProbabilities(fixture.score.home, fixture.score.away, lambda * homeShare, lambda * (1 - homeShare));
  push('MATCH_WINNER', 'HOME', null, outcomes.homeWin);
  push('MATCH_WINNER', 'DRAW', null, outcomes.draw);
  push('MATCH_WINNER', 'AWAY', null, outcomes.awayWin);
  push('DOUBLE_CHANCE', '1X', null, outcomes.homeWin + outcomes.draw);
  push('DOUBLE_CHANCE', 'X2', null, outcomes.awayWin + outcomes.draw);

  const anyGoal = poissonAtLeast(1, lambda);
  push('NEXT_GOAL', 'HOME', null, anyGoal * homeShare);
  push('NEXT_GOAL', 'AWAY', null, anyGoal * (1 - homeShare));

  if (fixture.statistics) {
    const corners = (fixture.statistics.home.corners ?? 0) + (fixture.statistics.away.corners ?? 0);
    const cornerLambda = script.cornersPerMinute * remaining;
    for (const extra of [1, 2, 3]) {
      push('CORNERS', 'OVER', corners + extra + 0.5, poissonAtLeast(extra + 1, cornerLambda));
    }
    const cards = (fixture.statistics.home.yellowCards ?? 0) + (fixture.statistics.home.redCards ?? 0) + (fixture.statistics.away.yellowCards ?? 0) + (fixture.statistics.away.redCards ?? 0);
    const cardLambda = ((script.league.avgCardsMilli / 1000) / 90) * remaining;
    for (const extra of [1, 2]) {
      push('CARDS', 'OVER', cards + extra + 0.5, poissonAtLeast(extra + 1, cardLambda));
    }
  }

  return quotes;
}

export class MockProvider implements SportsProvider {
  readonly key = 'mock' as const;
  readonly capabilities: ProviderCapabilities = {
    fixtures: true,
    live: true,
    statistics: true,
    events: true,
    odds: true,
    predictions: true,
    xg: true,
  };

  constructor(private readonly now: () => Date = () => new Date()) {}

  isConfigured(): boolean {
    return true;
  }

  private scriptsFor(date: string): MockScript[] {
    const scripts: MockScript[] = [];
    for (let i = 0; i < FIXTURES_PER_DAY; i += 1) scripts.push(buildScript(date, i));
    return scripts;
  }

  private parseId(providerId: string): { date: string; index: number } | null {
    const match = /^mock-(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(providerId);
    if (!match) return null;
    return { date: match[1]!, index: Number(match[2]) };
  }

  async getFixtures(query: FixtureQuery): Promise<NormalizedFixture[]> {
    const now = this.now();
    return this.scriptsFor(query.date)
      .map((script, index) => buildFixture(script, index, now, false))
      .filter((fixture) => !query.leagueKeys || query.leagueKeys.includes(fixture.league.key));
  }

  async getLiveFixtures(): Promise<NormalizedFixture[]> {
    const now = this.now();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const all = [...this.scriptsFor(yesterday).map((s, i) => buildFixture(s, i, now, true)), ...this.scriptsFor(today).map((s, i) => buildFixture(s, i, now, true))];
    return all.filter((fixture) => fixture.status === 'LIVE' || fixture.status === 'HALFTIME');
  }

  async getFixture(providerId: string): Promise<NormalizedFixture | null> {
    const parsed = this.parseId(providerId);
    if (!parsed) return null;
    const script = buildScript(parsed.date, parsed.index);
    const fixture = buildFixture(script, parsed.index, this.now(), true);
    fixture.odds = { quotes: buildOdds(script, fixture, this.now()), lastUpdated: this.now().toISOString(), stale: false };
    return fixture;
  }

  async getFixturesByIds(providerIds: readonly string[]): Promise<NormalizedFixture[]> {
    const out: NormalizedFixture[] = [];
    for (const id of providerIds) {
      const fixture = await this.getFixture(id);
      if (fixture) out.push(fixture);
    }
    return out;
  }

  async getStatistics(providerId: string): Promise<NormalizedStatistics | null> {
    return (await this.getFixture(providerId))?.statistics ?? null;
  }

  async getEvents(providerId: string): Promise<NormalizedEvent[]> {
    return (await this.getFixture(providerId))?.events ?? [];
  }

  async getOdds(request: OddsRequest): Promise<OddsQuote[]> {
    const id = request.providerId ?? request.fixture.providerIds.mock ?? null;
    if (!id) return [];
    const parsed = this.parseId(id);
    if (!parsed) return [];
    const script = buildScript(parsed.date, parsed.index);
    const fixture = buildFixture(script, parsed.index, this.now(), true);
    return buildOdds(script, fixture, this.now());
  }

  async getPredictions(providerId: string): Promise<NormalizedPrediction | null> {
    const parsed = this.parseId(providerId);
    if (!parsed) return null;
    const script = buildScript(parsed.date, parsed.index);
    const expected = (script.league.avgGoalsMilli / 1000) * (0.7 + script.tempo * 0.35);
    const homeShare = (script.homeStrength + 0.05) / (script.homeStrength + script.awayStrength + 0.05);
    const outcomes = matchOutcomeProbabilities(0, 0, expected * homeShare, expected * (1 - homeShare));
    return {
      fixtureId: fixtureKey(script.startTime.toISOString(), script.home, script.away),
      homeWinBps: Math.round(outcomes.homeWin * 10_000),
      drawBps: Math.round(outcomes.draw * 10_000),
      awayWinBps: Math.round(outcomes.awayWin * 10_000),
      homeStrength: Math.round(script.homeStrength * 100),
      awayStrength: Math.round(script.awayStrength * 100),
      source: 'mock',
      lastUpdated: this.now().toISOString(),
    };
  }
}

/** Exposto para testes: probabilidade implícita média de um conjunto de quotes. */
export function averageImpliedBps(quotes: readonly OddsQuote[]): number | null {
  if (quotes.length === 0) return null;
  return Math.round(quotes.reduce((acc, q) => acc + impliedProbabilityBps(q.oddMilli), 0) / quotes.length);
}
