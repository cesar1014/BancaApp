/**
 * Domínio puro do bilhete: odd combinada, margem acumulada, melhor odd real,
 * comparação informada × real, liquidação e chave de deduplicação.
 */

import type { OddsQuote, TipResult } from '@/lib/sports/domain/models';
import { teamKey } from '@/lib/sports/domain/names';
import { bestQuote, impliedProbabilityBps, removeMargin } from '@/lib/sports/domain/odds-math';
import { marketBook } from './markets';
import type { RawLeg, SlipLeg } from './types';

const MILLI = 1000;
const BPS = 10_000;

/** Produto das odds (milli). Ignora pernas sem odd; null se nenhuma tiver. */
export function combinedOddMilli(legs: readonly { oddMilli: number | null }[]): number | null {
  const odds = legs.map((leg) => leg.oddMilli).filter((odd): odd is number => odd !== null && odd > 0);
  if (odds.length === 0) return null;
  let product = 1;
  for (const odd of odds) product *= odd / MILLI;
  return Math.round(product * MILLI);
}

/** true quando todas as pernas têm odd. */
export function allLegsHaveOdds(legs: readonly { oddMilli: number | null }[]): boolean {
  return legs.length > 0 && legs.every((leg) => leg.oddMilli !== null);
}

/**
 * Margem de uma perna (bps) a partir do livro completo do mercado numa casa:
 * overround = Σ(1/odd) − 1. Devolve null se o livro não está completo.
 */
export function legMarginBps(leg: { marketKey: string | null; selectionKey: string | null; line: number | null }, quotes: readonly OddsQuote[], bookmaker: string): number | null {
  if (!leg.marketKey || !leg.selectionKey) return null;
  const book = marketBook(leg.marketKey as OddsQuote['market'], leg.selectionKey as OddsQuote['selection'], leg.line);
  if (!book) return null;
  const odds: number[] = [];
  for (const outcome of book) {
    const quote = quotes.find(
      (q) =>
        q.bookmaker === bookmaker &&
        q.market === outcome.market &&
        q.selection === outcome.selection &&
        (outcome.line === null || q.line === null || Math.abs(q.line - outcome.line) < 1e-9),
    );
    if (!quote) return null;
    odds.push(quote.oddMilli);
  }
  const implied = odds.reduce((acc, odd) => acc + impliedProbabilityBps(odd), 0);
  // removeMargin garante consistência com o restante do sistema (devig proporcional).
  void removeMargin(odds);
  return Math.max(0, implied - BPS);
}

/**
 * Margem acumulada do bilhete: (∏(1 + m_i)) − 1, em bps, sobre as pernas com
 * margem conhecida. Cinco pernas a 5% dão ~27,6%; a 4,3% dão ~23%.
 */
export function slipMarginBps(legs: readonly { marginBps: number | null }[]): { marginBps: number | null; knownLegs: number } {
  const known = legs.map((leg) => leg.marginBps).filter((m): m is number => m !== null);
  if (known.length === 0) return { marginBps: null, knownLegs: 0 };
  let product = 1;
  for (const margin of known) product *= 1 + margin / BPS;
  return { marginBps: Math.round((product - 1) * BPS), knownLegs: known.length };
}

/**
 * PROBABILIDADE REAL DO BILHETE.
 *
 * Ordenar por menor odd NÃO é o mesmo que ordenar por maior chance. A odd
 * implícita (1/odd) já vem inflada pela margem da casa, e numa múltipla essa
 * margem se acumula perna a perna: cinco pernas a 5% custam ~27,6%, não 5%.
 * Duas múltiplas pagando 10,00 podem ter chances bem diferentes se uma tem 3
 * pernas e a outra tem 8 — a de 8 embute muito mais margem e vale menos do que
 * o preço sugere.
 *
 * Por isso a chance é calculada tirando a margem de cada perna antes de
 * multiplicar:
 *
 *   p_perna = (1 / odd) / (1 + margem)
 *   p_bilhete = ∏ p_perna
 *
 * As pernas são tratadas como independentes. É a convenção do mercado e vale
 * enquanto vêm de jogos diferentes; duas pernas do MESMO jogo são
 * correlacionadas e aí o número fica otimista. A interface diz de onde veio
 * cada estimativa para que ninguém confunda cálculo com garantia.
 */

/** Margem assumida por perna quando não há livro completo para medir (5%). */
export const ASSUMED_LEG_MARGIN_BPS = 500;

export type ProbabilityBasis = 'CONFERIDA' | 'PARCIAL' | 'INFORMADA';

export interface SlipProbability {
  probabilityBps: number;
  /**
   * CONFERIDA  todas as pernas com odd real e margem medida no livro
   * PARCIAL    parte das pernas medida; nas demais, margem assumida
   * INFORMADA  só a odd que a fonte publicou, com margem assumida por perna
   */
  basis: ProbabilityBasis;
  /** Pernas com odd real E margem lida do livro. */
  devigedLegs: number;
  legs: number;
}

/**
 * Estima a chance do bilhete inteiro bater. null quando não há nem odd por
 * perna nem odd informada — sem preço não há probabilidade a estimar.
 */
export function slipProbability(slip: {
  informedOddMilli: number | null;
  legsCount: number;
  legs: readonly { oddMilli: number | null; realOddMilli: number | null; marginBps: number | null }[];
}): SlipProbability | null {
  const legs = slip.legs;
  const total = legs.length > 0 ? legs.length : slip.legsCount;

  // Caminho preferido: preço perna a perna.
  const priced = legs.map((leg) => ({
    oddMilli: leg.realOddMilli ?? leg.oddMilli,
    marginBps: leg.realOddMilli !== null ? leg.marginBps : null,
  }));
  if (legs.length > 0 && priced.every((leg) => leg.oddMilli !== null && leg.oddMilli > MILLI)) {
    let product = 1;
    let deviged = 0;
    for (const leg of priced) {
      const margin = leg.marginBps ?? ASSUMED_LEG_MARGIN_BPS;
      if (leg.marginBps !== null) deviged += 1;
      const implied = MILLI / (leg.oddMilli as number);
      product *= implied / (1 + margin / BPS);
    }
    return {
      probabilityBps: clamp(Math.round(product * BPS)),
      basis: deviged === legs.length ? 'CONFERIDA' : 'PARCIAL',
      devigedLegs: deviged,
      legs: legs.length,
    };
  }

  // Alternativa: a odd que a fonte publicou, com margem assumida por perna.
  // É o que distingue uma múltipla de 3 pernas de uma de 8 pagando o mesmo.
  if (slip.informedOddMilli !== null && slip.informedOddMilli > MILLI && total > 0) {
    const implied = MILLI / slip.informedOddMilli;
    const probability = implied / Math.pow(1 + ASSUMED_LEG_MARGIN_BPS / BPS, total);
    return { probabilityBps: clamp(Math.round(probability * BPS)), basis: 'INFORMADA', devigedLegs: 0, legs: total };
  }

  return null;
}

function clamp(bps: number): number {
  return Math.min(BPS, Math.max(0, bps));
}

/** Maior odd entre as casas para a seleção da perna (com a casa e o horário). */
export function bestAvailableOddMilli(
  leg: { marketKey: string | null; selectionKey: string | null; line: number | null },
  quotes: readonly OddsQuote[],
): { oddMilli: number; bookmaker: string; capturedAt: string } | null {
  if (!leg.marketKey || !leg.selectionKey) return null;
  const best = bestQuote(quotes, leg.marketKey as OddsQuote['market'], leg.selectionKey as OddsQuote['selection'], leg.line);
  return best ? { oddMilli: best.oddMilli, bookmaker: best.bookmaker, capturedAt: best.capturedAt } : null;
}

export interface SlipComparison {
  informedOddMilli: number | null;
  /** Produto das odds reais (só quando TODAS as pernas foram conferidas). */
  realOddMilli: number | null;
  /** real / informada − 1, em bps (negativo = paga menos do que a fonte diz). */
  differenceBps: number | null;
  verifiedLegs: number;
  unverifiedLegs: number[];
  verification: 'FULL' | 'PARTIAL' | 'NONE';
}

export function slipComparison(slip: { informedOddMilli: number | null; legs: readonly { position: number; realOddMilli: number | null }[] }): SlipComparison {
  const unverified = slip.legs.filter((leg) => leg.realOddMilli === null).map((leg) => leg.position);
  const verifiedLegs = slip.legs.length - unverified.length;
  const verification = verifiedLegs === 0 ? 'NONE' : unverified.length === 0 ? 'FULL' : 'PARTIAL';
  const realOddMilli =
    verification === 'FULL' ? combinedOddMilli(slip.legs.map((leg) => ({ oddMilli: leg.realOddMilli }))) : null;
  const differenceBps =
    realOddMilli !== null && slip.informedOddMilli !== null
      ? Math.round(((realOddMilli - slip.informedOddMilli) * BPS) / slip.informedOddMilli)
      : null;
  return { informedOddMilli: slip.informedOddMilli, realOddMilli, differenceBps, verifiedLegs, unverifiedLegs: unverified, verification };
}

export interface SlipSettlement {
  status: 'OPEN' | 'SETTLED' | 'PENDING';
  result: TipResult | null;
  /** Odd efetiva depois de remover pernas push (milli); null se não dá para saber. */
  effectiveOddMilli: number | null;
}

/**
 * Liquidação: qualquer RED derruba o bilhete; push tira a perna da conta e
 * mantém o bilhete vivo; GREEN só quando todas as pernas decidiram.
 * Pernas ainda sem resultado deixam o bilhete OPEN (ou PENDING se a partida
 * já acabou e não deu para decidir — quem chama sinaliza isso).
 */
export function settleSlip(
  legs: readonly { result: TipResult | null; oddMilli: number | null; realOddMilli: number | null; unresolvable?: boolean }[],
  informedOddMilli: number | null,
): SlipSettlement {
  if (legs.length === 0) return { status: 'PENDING', result: null, effectiveOddMilli: null };
  if (legs.some((leg) => leg.result === 'RED')) return { status: 'SETTLED', result: 'RED', effectiveOddMilli: null };
  if (legs.some((leg) => leg.result === null)) {
    return { status: legs.some((leg) => leg.unresolvable) ? 'PENDING' : 'OPEN', result: null, effectiveOddMilli: null };
  }

  const live = legs.filter((leg) => leg.result === 'GREEN');
  if (live.length === 0) return { status: 'SETTLED', result: 'PUSH', effectiveOddMilli: MILLI };

  const pushes = legs.length - live.length;
  const perLeg = live.map((leg) => ({ oddMilli: leg.oddMilli ?? leg.realOddMilli }));
  let effective: number | null;
  if (allLegsHaveOdds(perLeg)) {
    effective = combinedOddMilli(perLeg);
  } else if (pushes === 0) {
    // Sem odd por perna, mas nada foi anulado: vale a odd total informada.
    effective = informedOddMilli;
  } else {
    // Push sem odd por perna: impossível recalcular com segurança.
    return { status: 'PENDING', result: null, effectiveOddMilli: null };
  }
  if (effective === null) return { status: 'PENDING', result: null, effectiveOddMilli: null };
  return { status: 'SETTLED', result: 'GREEN', effectiveOddMilli: effective };
}

/** Dinheiro do bilhete com stake fixa (mesma regra das entradas). */
export function slipMoney(result: TipResult, stakeCents: number, effectiveOddMilli: number | null): { payoutCents: number; profitCents: number } {
  if (result === 'RED') return { payoutCents: 0, profitCents: -stakeCents };
  if (result === 'PUSH' || effectiveOddMilli === null) return { payoutCents: stakeCents, profitCents: 0 };
  const profitCents = Math.round((stakeCents * (effectiveOddMilli - MILLI)) / MILLI);
  return { payoutCents: stakeCents + profitCents, profitCents };
}

/** Hash determinístico (djb2) — sem crypto, para rodar no domínio e nos testes. */
function djb2(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

/**
 * Chave de deduplicação: mesmas seleções (times canônicos + mercado
 * normalizado), em qualquer ordem, dão a mesma chave — mesmo que a fonte
 * republique o bilhete com outro título ou em outra página.
 */
export function slipDedupeHash(legs: readonly RawLeg[]): string {
  const parts = legs
    .map((leg) => `${teamKey(leg.homeName)}|${teamKey(leg.awayName)}|${leg.market.toLowerCase().replace(/\s+/g, ' ').trim()}`)
    .sort();
  const joined = parts.join('||');
  return `${djb2(joined)}${djb2(joined.split('').reverse().join(''))}`;
}

/** Remove bilhetes repetidos dentro da mesma coleta. */
export function dedupeRawSlips<T extends { referenceDate: string; legs: RawLeg[] }>(slips: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const slip of slips) {
    const key = `${slip.referenceDate}:${slipDedupeHash(slip.legs)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slip);
  }
  return out;
}

export function legsCount(slip: { legs: readonly SlipLeg[] }): number {
  return slip.legs.length;
}
