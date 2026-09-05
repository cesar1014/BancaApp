/**
 * CONSENSO ENTRE FONTES — o que várias delas apontam ao mesmo tempo.
 *
 * O app reúne palpites de origens que não se conhecem: cinco sites de
 * bilhete pronto, dois canais de Telegram e o modelo próprio. Cada um sozinho
 * vale pouco. O que vale é a coincidência: quando fontes independentes
 * apontam a MESMA seleção no MESMO jogo, ou elas viram algo real, ou erraram
 * juntas — e a segunda hipótese é menos provável quanto mais independentes
 * forem.
 *
 * A palavra "independentes" está fazendo trabalho pesado aqui, e o módulo não
 * finge o contrário. Sites de palpite copiam uns aos outros e todos leem as
 * mesmas estatísticas públicas, então duas fontes concordando não são dois
 * testemunhos separados. O sinal é fraco. O que o app faz é o honesto: mostra
 * QUANTAS e QUAIS fontes apontaram, o histórico medido de cada uma, e deixa a
 * decisão com quem aposta.
 *
 * O modelo próprio entra com peso maior por um motivo específico: ele não é
 * mais um palpiteiro lendo os mesmos sites, é um método diferente — Poisson
 * ancorado no preço de mercado. Concordância entre o modelo e um site é mais
 * informativa que concordância entre dois sites.
 *
 * Módulo puro: sem I/O, sem relógio.
 */

import type { MarketKey, Selection } from '@/lib/sports/domain/models';
import { valueBps as computeValueBps } from '@/lib/sports/domain/odds-math';

export type PickKind = 'SLIP' | 'CALL' | 'MODEL';

/** Uma aposta apontada por uma origem, já normalizada. */
export interface Pick {
  fixtureId: string;
  market: MarketKey;
  selection: Selection;
  line: number | null;
  sourceSlug: string;
  sourceName: string;
  kind: PickKind;
  /** Odd que a fonte publicou, quando publicou. */
  publishedOddMilli: number | null;
}

/** Histórico medido de uma fonte, usado para pesar a concordância. */
export interface SourceRecord {
  slug: string;
  /** ROI em bps sobre o histórico. null quando não há amostra. */
  roiBps: number | null;
  /** Quantas apostas resolvidas sustentam esse ROI. */
  settled: number;
}

export interface ConsensusEntry {
  fixtureId: string;
  market: MarketKey;
  selection: Selection;
  line: number | null;
  /** Fontes distintas que apontaram esta seleção. */
  sources: { slug: string; name: string; kind: PickKind }[];
  sourceCount: number;
  /** O modelo próprio também apontou. */
  modelBacked: boolean;
  /** Melhor odd real disponível no mercado, quando conhecida. */
  bestOddMilli: number | null;
  bookmaker: string | null;
  /** Probabilidade estimada pelo modelo, quando ele avaliou este mercado. */
  modelProbabilityBps: number | null;
  /** Value da melhor odd contra a estimativa do modelo. null sem os dois. */
  valueBps: number | null;
  /** ROI médio das fontes que apontaram, ponderado pela amostra. null sem histórico. */
  backersRoiBps: number | null;
  /** 0–100. Ver rankConsensus. */
  score: number;
}

function keyOf(pick: { fixtureId: string; market: string; selection: string; line: number | null }): string {
  return `${pick.fixtureId}|${pick.market}|${pick.selection}|${pick.line ?? ''}`;
}

/**
 * ROI médio das fontes que sustentam a entrada, ponderado pelo tamanho da
 * amostra de cada uma. Fonte sem histórico não entra: puxar a média com um
 * zero inventado seria pior que admitir que não se sabe.
 */
export function weightedRoiBps(
  slugs: readonly string[],
  records: ReadonlyMap<string, SourceRecord>,
): number | null {
  let peso = 0;
  let soma = 0;
  for (const slug of slugs) {
    const record = records.get(slug);
    if (!record || record.roiBps === null || record.settled <= 0) continue;
    soma += record.roiBps * record.settled;
    peso += record.settled;
  }
  return peso === 0 ? null : Math.round(soma / peso);
}

/**
 * Nota de 0 a 100, com as parcelas explícitas para poder ser explicada na
 * interface. Nenhuma delas é mágica:
 *
 *   até 40  concordância — quantas fontes apontaram (satura em 4)
 *      25   o modelo próprio concorda (método diferente, não outro palpiteiro)
 *   até 20  value da melhor odd contra a estimativa do modelo
 *   até 15  histórico medido das fontes que apontaram
 *
 * Uma entrada apontada por uma fonte só, sem modelo e sem histórico, tira
 * 10/100 — que é o que ela merece.
 */
export function scoreConsensus(input: {
  sourceCount: number;
  modelBacked: boolean;
  valueBps: number | null;
  backersRoiBps: number | null;
}): number {
  const concordancia = Math.min(1, input.sourceCount / 4) * 40;
  const modelo = input.modelBacked ? 25 : 0;

  // Value: 0% não vale nada, +10% satura. Negativo não pontua.
  const value = input.valueBps === null ? 0 : Math.max(0, Math.min(1, input.valueBps / 1_000)) * 20;

  // Histórico: −10% de ROI zera, +10% satura, 0% fica no meio.
  const historico =
    input.backersRoiBps === null
      ? 0
      : Math.max(0, Math.min(1, (input.backersRoiBps + 1_000) / 2_000)) * 15;

  return Math.round(concordancia + modelo + value + historico);
}

/**
 * Agrupa os palpites por (partida, mercado, seleção, linha) e ordena.
 *
 * `marketOdds` traz a melhor odd real disponível por chave, e
 * `modelProbabilities` a estimativa do modelo — ambos opcionais: sem eles a
 * entrada ainda aparece, só com menos informação.
 */
export function buildConsensus(
  picks: readonly Pick[],
  options: {
    records?: ReadonlyMap<string, SourceRecord>;
    marketOdds?: ReadonlyMap<string, { oddMilli: number; bookmaker: string }>;
    modelProbabilities?: ReadonlyMap<string, number>;
  } = {},
): ConsensusEntry[] {
  const records = options.records ?? new Map<string, SourceRecord>();
  const grupos = new Map<string, Pick[]>();

  for (const pick of picks) {
    const key = keyOf(pick);
    const lista = grupos.get(key);
    if (lista) lista.push(pick);
    else grupos.set(key, [pick]);
  }

  const entradas: ConsensusEntry[] = [];
  for (const [key, lista] of grupos) {
    const primeiro = lista[0]!;

    // Fontes distintas: a mesma fonte apontando em dois bilhetes conta uma vez.
    const vistos = new Set<string>();
    const sources: ConsensusEntry['sources'] = [];
    for (const pick of lista) {
      if (vistos.has(pick.sourceSlug)) continue;
      vistos.add(pick.sourceSlug);
      sources.push({ slug: pick.sourceSlug, name: pick.sourceName, kind: pick.kind });
    }

    const modelBacked = sources.some((source) => source.kind === 'MODEL');
    const externas = sources.filter((source) => source.kind !== 'MODEL').map((source) => source.slug);
    const backersRoiBps = weightedRoiBps(externas, records);

    const odds = options.marketOdds?.get(key) ?? null;
    const modelProbabilityBps = options.modelProbabilities?.get(key) ?? null;
    const valueBps =
      odds !== null && modelProbabilityBps !== null
        ? computeValueBps(modelProbabilityBps, odds.oddMilli)
        : null;

    entradas.push({
      fixtureId: primeiro.fixtureId,
      market: primeiro.market,
      selection: primeiro.selection,
      line: primeiro.line,
      sources,
      sourceCount: sources.length,
      modelBacked,
      bestOddMilli: odds?.oddMilli ?? null,
      bookmaker: odds?.bookmaker ?? null,
      modelProbabilityBps,
      valueBps,
      backersRoiBps,
      score: scoreConsensus({ sourceCount: sources.length, modelBacked, valueBps, backersRoiBps }),
    });
  }

  return entradas.sort(
    (a, b) =>
      b.score - a.score ||
      b.sourceCount - a.sourceCount ||
      (b.valueBps ?? -Infinity) - (a.valueBps ?? -Infinity),
  );
}

export { keyOf as consensusKey };
