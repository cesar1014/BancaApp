/**
 * ÂNCORA DE MERCADO — de onde o modelo tira a força dos times.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * O modelo de gols parte da média da competição. Ao vivo isso é aceitável,
 * porque o próprio jogo vai corrigindo a estimativa: finalizações, xG e
 * pressão entram na conta e diferenciam uma partida da outra.
 *
 * No pré-jogo não existe nada disso. Sem estatística da partida, o modelo
 * devolvia exatamente o mesmo número para todos os jogos da mesma liga —
 * 44% para o mandante em Manchester City x Luton e 44% em Luton x Manchester
 * City. Como a estimativa era constante e a odd de mercado não, o "value"
 * virava função apenas da odd: quanto mais azarão o mandante, maior o value
 * aparente. Numa odd 6,00 o sistema anunciava +164%. Era ruído puro, e ruído
 * enviesado para o pior lado possível num app de banca — recomendar azarão em
 * casa de forma sistemática.
 *
 * A SOLUÇÃO
 *
 * No pré-jogo, o mercado é o melhor estimador disponível: as casas conhecem
 * escalação, desfalques, forma e contexto. Então em vez de adivinhar a força
 * dos times, nós a LEMOS do preço.
 *
 * Tirando a margem das cotações (`removeMargin`) chega-se às probabilidades
 * justas do mercado. A partir delas resolvemos numericamente o par de gols
 * esperados (λ do mandante, λ do visitante) que reproduz aquele preço sob
 * Poisson:
 *
 *   - o mercado de total (Over/Under 2.5) fixa λ_total;
 *   - o mercado 1X2 fixa a divisão entre os dois lados.
 *
 * O modelo passa a começar de onde o mercado está, em vez da média da liga.
 * O efeito colateral é o esperado e é desejável: contra o preço de consenso o
 * value cai para perto de zero. O que sobra é value verdadeiro — a diferença
 * entre a MELHOR casa e o consenso das demais, que é uma vantagem real e
 * verificável, não uma opinião do modelo.
 *
 * Módulo puro: sem I/O, sem relógio, sem estado.
 */

import type { MarketKey, OddsQuote, Selection } from './models';
import { poissonPmf } from './poisson';
import { removeMargin } from './odds-math';

/** Gols esperados na partida inteira, lidos do mercado. */
export interface MarketAnchor {
  lambdaHome: number;
  lambdaAway: number;
  lambdaTotal: number;
  /** Fração do total atribuída ao mandante (λH / λ_total). */
  homeShare: number;
  /** Probabilidades justas do 1X2, quando o mercado existia. */
  outcome: { homeWin: number; draw: number; awayWin: number } | null;
  /** Probabilidade justa de Over 2.5, quando o mercado existia. */
  overTwoFive: number | null;
  /** Quais mercados sustentam a âncora. */
  source: 'OUTCOME_AND_TOTAL' | 'OUTCOME' | 'TOTAL';
}

/** Limites de sanidade: nenhum jogo de futebol vive fora desta faixa. */
const MIN_TOTAL = 0.6;
const MAX_TOTAL = 6.0;
const MIN_SHARE = 0.12;
const MAX_SHARE = 0.88;

/**
 * Cotação de consenso de uma seleção: a MEDIANA entre as casas.
 *
 * Mediana e não média porque uma única casa com preço fora da curva — erro de
 * digitação, mercado suspenso, cotação velha — desloca a média e não move a
 * mediana. É justamente a casa fora da curva que queremos detectar depois
 * como oportunidade, então ela não pode contaminar a referência.
 */
export function consensusOddMilli(
  quotes: readonly OddsQuote[],
  market: MarketKey,
  selection: Selection,
  line: number | null = null,
): number | null {
  const values = quotes
    .filter((quote) => {
      if (quote.market !== market || quote.selection !== selection) return false;
      if (line !== null && quote.line !== null && Math.abs(quote.line - line) > 1e-9) return false;
      return Number.isFinite(quote.oddMilli) && quote.oddMilli > 1_000;
    })
    .map((quote) => quote.oddMilli)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? (values[middle] as number)
    : Math.round((((values[middle - 1] as number) + (values[middle] as number)) / 2));
}

/** P(total de gols ≥ 3) para duas Poisson independentes — i.e. Over 2.5. */
export function overTwoFiveProbability(lambdaTotal: number): number {
  // Soma de Poisson independentes é Poisson com λ somado, então basta 1 − P(0,1,2).
  const p0 = poissonPmf(0, lambdaTotal);
  const p1 = poissonPmf(1, lambdaTotal);
  const p2 = poissonPmf(2, lambdaTotal);
  return Math.max(0, Math.min(1, 1 - (p0 + p1 + p2)));
}

/**
 * Inverte Over 2.5 → λ_total por bisseção.
 * P(Over 2.5) cresce estritamente com λ, então a bisseção converge sempre.
 */
export function totalFromOverProbability(pOver: number): number {
  if (!(pOver > 0) || !(pOver < 1)) return Number.NaN;
  let low = MIN_TOTAL;
  let high = MAX_TOTAL;
  if (overTwoFiveProbability(low) > pOver) return low;
  if (overTwoFiveProbability(high) < pOver) return high;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (overTwoFiveProbability(mid) < pOver) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** P(mandante vence) e P(visitante vence) para λH e λA, via grade de Poisson. */
function outcomeSplit(lambdaHome: number, lambdaAway: number): { home: number; away: number } {
  const MAX_GOALS = 12;
  const home: number[] = [];
  const away: number[] = [];
  for (let k = 0; k <= MAX_GOALS; k += 1) {
    home.push(poissonPmf(k, lambdaHome));
    away.push(poissonPmf(k, lambdaAway));
  }
  let pHome = 0;
  let pAway = 0;
  for (let h = 0; h <= MAX_GOALS; h += 1) {
    for (let a = 0; a <= MAX_GOALS; a += 1) {
      const joint = (home[h] as number) * (away[a] as number);
      if (h > a) pHome += joint;
      else if (a > h) pAway += joint;
    }
  }
  return { home: pHome, away: pAway };
}

/**
 * Encontra a divisão do total entre os lados que reproduz a razão de vitórias
 * do mercado. A razão P(casa) / [P(casa) + P(fora)] cresce com a fatia do
 * mandante, então de novo a bisseção resolve.
 */
export function shareFromOutcomeRatio(lambdaTotal: number, targetRatio: number): number {
  const clampedTarget = Math.min(0.98, Math.max(0.02, targetRatio));
  let low = MIN_SHARE;
  let high = MAX_SHARE;
  const ratioAt = (share: number): number => {
    const { home, away } = outcomeSplit(lambdaTotal * share, lambdaTotal * (1 - share));
    const sum = home + away;
    return sum === 0 ? 0.5 : home / sum;
  };
  if (ratioAt(low) > clampedTarget) return low;
  if (ratioAt(high) < clampedTarget) return high;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (ratioAt(mid) < clampedTarget) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Lê a força dos times a partir das cotações.
 *
 * Devolve null quando o mercado não oferece nem o 1X2 nem o total: sem preço
 * não há o que ler, e nesse caso é melhor o modelo assumir que não sabe do que
 * inventar um número.
 *
 * `leagueAverageGoals` só é usado como total quando existe 1X2 mas não existe
 * mercado de total — ali a média da liga é uma aproximação aceitável, porque o
 * que realmente importa para o 1X2 é a DIVISÃO entre os lados, e essa vem do
 * preço.
 */
export function buildMarketAnchor(
  quotes: readonly OddsQuote[],
  leagueAverageGoals: number,
): MarketAnchor | null {
  const homeOdd = consensusOddMilli(quotes, 'MATCH_WINNER', 'HOME');
  const drawOdd = consensusOddMilli(quotes, 'MATCH_WINNER', 'DRAW');
  const awayOdd = consensusOddMilli(quotes, 'MATCH_WINNER', 'AWAY');
  const overOdd = consensusOddMilli(quotes, 'OVER_2_5', 'OVER', 2.5);
  const underOdd = consensusOddMilli(quotes, 'UNDER_2_5', 'UNDER', 2.5);

  const hasOutcome = homeOdd !== null && drawOdd !== null && awayOdd !== null;
  const hasTotal = overOdd !== null && underOdd !== null;
  if (!hasOutcome && !hasTotal) return null;

  // --- λ total ---
  let overTwoFive: number | null = null;
  let lambdaTotal = leagueAverageGoals;
  if (hasTotal) {
    const [fairOver] = removeMargin([overOdd as number, underOdd as number]);
    overTwoFive = (fairOver as number) / 10_000;
    const solved = totalFromOverProbability(overTwoFive);
    if (Number.isFinite(solved)) lambdaTotal = solved;
  }
  lambdaTotal = Math.min(MAX_TOTAL, Math.max(MIN_TOTAL, lambdaTotal));

  // --- divisão entre os lados ---
  let homeShare = 0.55;
  let outcome: MarketAnchor['outcome'] = null;
  if (hasOutcome) {
    const [fairHome, fairDraw, fairAway] = removeMargin([
      homeOdd as number,
      drawOdd as number,
      awayOdd as number,
    ]);
    outcome = {
      homeWin: (fairHome as number) / 10_000,
      draw: (fairDraw as number) / 10_000,
      awayWin: (fairAway as number) / 10_000,
    };
    const decisive = outcome.homeWin + outcome.awayWin;
    if (decisive > 0) {
      homeShare = shareFromOutcomeRatio(lambdaTotal, outcome.homeWin / decisive);
    }
  }
  homeShare = Math.min(MAX_SHARE, Math.max(MIN_SHARE, homeShare));

  return {
    lambdaTotal,
    lambdaHome: lambdaTotal * homeShare,
    lambdaAway: lambdaTotal * (1 - homeShare),
    homeShare,
    outcome,
    overTwoFive,
    source: hasOutcome && hasTotal ? 'OUTCOME_AND_TOTAL' : hasOutcome ? 'OUTCOME' : 'TOTAL',
  };
}
