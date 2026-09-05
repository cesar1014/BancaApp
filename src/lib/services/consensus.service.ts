import 'server-only';
import { query } from '@/lib/db';
import {
  buildConsensus,
  consensusKey,
  type ConsensusEntry,
  type Pick,
  type SourceRecord,
} from '@/lib/bilhetes/domain/consensus';
import type { MarketKey, Selection } from '@/lib/sports/domain/models';
import { loadSourceScores } from '@/lib/services/bilhetes.service';

/**
 * Cruzamento entre as fontes de bilhete e o modelo próprio.
 *
 * Junta, para as partidas que ainda não começaram ou estão em andamento:
 *   - pernas de bilhete que foram casadas com partida real e tiveram o
 *     mercado interpretado;
 *   - dicas do modelo.
 *
 * As calls de Telegram NÃO entram, e a razão é dura: o canal não escreve qual
 * é a partida, então não há como saber se ele está apontando o mesmo jogo que
 * outra fonte. Incluí-las exigiria adivinhar, e um consenso construído sobre
 * adivinhação é pior que consenso nenhum.
 */

export interface ConsensusFixture {
  id: string;
  home: string;
  away: string;
  league: string;
  startTime: string;
  status: string;
  minute: number | null;
  homeScore: number;
  awayScore: number;
}

export interface ConsensusView {
  /**
   * Seleções com concordância de verdade: duas ou mais fontes, ou uma fonte
   * mais o modelo do app. É o que a aba se propõe a mostrar.
   */
  entries: ConsensusEntry[];
  /**
   * Apontadas por uma única fonte. Ficam à parte porque não são consenso —
   * misturá-las na lista principal esvaziaria o sentido da palavra.
   */
  singles: ConsensusEntry[];
  fixtures: Map<string, ConsensusFixture>;
  /** Quantas pernas existem ao todo e quantas puderam ser cruzadas. */
  coverage: { totalLegs: number; usableLegs: number; sourcesWithout: string[] };
  emptyReason: string | null;
}

interface LegRow {
  fixture_id: string;
  market_key: MarketKey;
  selection_key: Selection;
  line_milli: number | null;
  odd_milli: number | null;
  source_slug: string;
  source_name: string;
}

interface TipRow {
  fixture_id: string;
  market: MarketKey;
  selection: Selection;
  line_milli: number | null;
  probability_bps: number;
  odd_milli: number | null;
}

interface FixtureRow {
  id: string;
  home_name: string;
  away_name: string;
  league_name: string;
  start_time: Date;
  status: string;
  minute: number | null;
  home_score: number;
  away_score: number;
}

interface OddsRow {
  fixture_id: string;
  market: MarketKey;
  selection: Selection;
  line_milli: number | null;
  odd_milli: number;
  bookmaker: string;
}

export async function loadConsensus(now: Date = new Date()): Promise<ConsensusView> {
  const from = new Date(now.getTime() - 4 * 3_600_000);
  const to = new Date(now.getTime() + 48 * 3_600_000);

  const [legs, tips, fixtures, odds, scores, coverage] = await Promise.all([
    query<LegRow>(
      `SELECT g.fixture_id, g.market_key, g.selection_key, g.line_milli, g.odd_milli,
              s.source_slug, src.name AS source_name
       FROM tip_slip_legs g
       JOIN tip_slips s   ON s.id = g.slip_id
       JOIN tip_sources src ON src.slug = s.source_slug
       JOIN sport_fixtures f ON f.id = g.fixture_id
       WHERE g.market_key IS NOT NULL AND g.selection_key IS NOT NULL
         AND f.start_time BETWEEN $1 AND $2
         AND f.status NOT IN ('FINISHED','CANCELLED','POSTPONED')`,
      [from.toISOString(), to.toISOString()],
    ),
    query<TipRow>(
      `SELECT t.fixture_id, t.market_key AS market, t.selection, t.line_milli, t.probability_bps, t.odd_milli
       FROM bet_tips t
       JOIN sport_fixtures f ON f.id = t.fixture_id
       WHERE f.start_time BETWEEN $1 AND $2
         AND f.status NOT IN ('FINISHED','CANCELLED','POSTPONED')`,
      [from.toISOString(), to.toISOString()],
    ),
    query<FixtureRow>(
      `SELECT id, home_name, away_name, league_name, start_time, status, minute, home_score, away_score
       FROM sport_fixtures
       WHERE start_time BETWEEN $1 AND $2 AND status NOT IN ('FINISHED','CANCELLED','POSTPONED')`,
      [from.toISOString(), to.toISOString()],
    ),
    // Melhor odd por (partida, mercado, seleção, linha), da cotação mais recente.
    query<OddsRow>(
      `SELECT DISTINCT ON (o.fixture_id, o.market_key, o.selection, o.line_milli)
              o.fixture_id, o.market_key AS market, o.selection, o.line_milli, o.odd_milli, o.bookmaker
       FROM odds_snapshots o
       JOIN sport_fixtures f ON f.id = o.fixture_id
       WHERE f.start_time BETWEEN $1 AND $2
       ORDER BY o.fixture_id, o.market_key, o.selection, o.line_milli, o.odd_milli DESC`,
      [from.toISOString(), to.toISOString()],
    ),
    loadSourceScores(),
    query<{ total: number; usaveis: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE fixture_id IS NOT NULL AND market_key IS NOT NULL)::int AS usaveis
       FROM tip_slip_legs`,
    ),
  ]);

  const picks: Pick[] = [
    ...legs.map((row) => ({
      fixtureId: row.fixture_id,
      market: row.market_key,
      selection: row.selection_key,
      line: row.line_milli === null ? null : row.line_milli / 1000,
      sourceSlug: row.source_slug,
      sourceName: row.source_name,
      kind: 'SLIP' as const,
      publishedOddMilli: row.odd_milli,
    })),
    ...tips.map((row) => ({
      fixtureId: row.fixture_id,
      market: row.market,
      selection: row.selection,
      line: row.line_milli === null ? null : row.line_milli / 1000,
      sourceSlug: 'modelo',
      sourceName: 'Modelo do app',
      kind: 'MODEL' as const,
      publishedOddMilli: row.odd_milli,
    })),
  ];

  const records = new Map<string, SourceRecord>(
    scores.map((score) => [
      score.slug,
      { slug: score.slug, roiBps: score.metrics.yieldBps, settled: score.metrics.settled },
    ]),
  );

  const marketOdds = new Map(
    odds.map((row) => [
      consensusKey({
        fixtureId: row.fixture_id,
        market: row.market,
        selection: row.selection,
        line: row.line_milli === null ? null : row.line_milli / 1000,
      }),
      { oddMilli: row.odd_milli, bookmaker: row.bookmaker },
    ]),
  );

  const modelProbabilities = new Map(
    tips.map((row) => [
      consensusKey({
        fixtureId: row.fixture_id,
        market: row.market,
        selection: row.selection,
        line: row.line_milli === null ? null : row.line_milli / 1000,
      }),
      row.probability_bps,
    ]),
  );

  const todas = buildConsensus(picks, { records, marketOdds, modelProbabilities });
  // Consenso exige mais de uma origem. Uma fonte sozinha é palpite, não acordo.
  const entries = todas.filter((entry) => entry.sourceCount >= 2 || entry.modelBacked);
  const singles = todas.filter((entry) => entry.sourceCount < 2 && !entry.modelBacked);

  const semCasamento = await query<{ source_slug: string }>(
    `SELECT s.source_slug
     FROM tip_slip_legs g JOIN tip_slips s ON s.id = g.slip_id
     GROUP BY s.source_slug
     HAVING count(g.fixture_id) = 0`,
  );

  return {
    entries,
    singles,
    fixtures: new Map(
      fixtures.map((row) => [
        row.id,
        {
          id: row.id,
          home: row.home_name,
          away: row.away_name,
          league: row.league_name,
          startTime: row.start_time.toISOString(),
          status: row.status,
          minute: row.minute,
          homeScore: row.home_score,
          awayScore: row.away_score,
        },
      ]),
    ),
    coverage: {
      totalLegs: coverage[0]?.total ?? 0,
      usableLegs: coverage[0]?.usaveis ?? 0,
      sourcesWithout: semCasamento.map((row) => row.source_slug),
    },
    emptyReason:
      entries.length === 0
        ? singles.length === 0
          ? 'Nada a cruzar agora. As fontes precisam publicar bilhetes cujas partidas o sistema consiga casar com o calendário.'
          : `Nenhuma concordância no momento: ${singles.length} seleção(ões) apontada(s), cada uma por uma fonte só. Consenso aparece quando duas origens coincidem no mesmo jogo e mercado.`
        : null,
  };
}
