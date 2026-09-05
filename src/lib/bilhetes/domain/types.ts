/**
 * Tipos do módulo Bilhetes (múltiplas publicadas por fontes públicas).
 *
 * Um bilhete é conteúdo de terceiro: o app o exibe com crédito, confere a odd
 * real, calcula a margem acumulada e registra o resultado — nunca o recomenda.
 *
 * Convenções: odd × 1000 (milli), percentuais em bps, dinheiro em centavos.
 */

import type { MarketKey, Selection, TipResult } from '@/lib/sports/domain/models';

export type SourceCountry = 'BR' | 'INT';

/** Perna como a fonte publicou, já normalizada em campos. */
export interface RawLeg {
  homeName: string;
  awayName: string;
  /** Nome da competição como a fonte escreveu (ou null). */
  league: string | null;
  /** ISO 8601 do início, quando a fonte informa data+hora; senão null. */
  kickoff: string | null;
  /** Texto do mercado como publicado ("Mais de 1,5 gols", "Levski Sofia to Win"). */
  market: string;
  /** Seleção como publicada (frequentemente igual ao mercado). */
  selection: string;
  /** Odd da perna, quando a fonte publica; muitas não publicam. */
  oddMilli: number | null;
}

export interface RawSlip {
  title: string;
  /** Dia de referência 'AAAA-MM-DD' (dos jogos). */
  referenceDate: string;
  totalOddMilli: number | null;
  legs: RawLeg[];
  /** URL da página de onde veio (crédito obrigatório). */
  sourceUrl: string;
}

export interface SlipSource {
  readonly slug: string;
  readonly label: string;
  readonly url: string;
  readonly country: SourceCountry;
  fetchSlips(options: { now: Date; fetchPage: FetchPage }): Promise<RawSlip[]>;
}

/** Baixa uma página pública respeitando robots.txt; devolve null se proibido/indisponível. */
export type FetchPage = (url: string) => Promise<string | null>;

/** Interpretação do mercado da perna nos termos do motor de dicas. */
export interface ParsedMarket {
  market: MarketKey | null;
  selection: Selection | null;
  line: number | null;
  /** Rótulo curto em português para exibir ("Mais de 1,5 gols", "Cuiabá vence"). */
  label: string;
}

export type LegResult = TipResult;

export type SlipStatus = 'OPEN' | 'SETTLED' | 'PENDING' | 'VOID';

export type SlipVerification = 'FULL' | 'PARTIAL' | 'NONE';

/** Perna persistida, com a conferência de odd real e o casamento. */
export interface SlipLeg extends RawLeg {
  id: string;
  position: number;
  marketKey: MarketKey | null;
  selectionKey: Selection | null;
  line: number | null;
  label: string;
  realOddMilli: number | null;
  realBookmaker: string | null;
  realCapturedAt: string | null;
  /** Margem da perna (bps) a partir do mercado devigado; null se não deu para conferir. */
  marginBps: number | null;
  fixtureId: string | null;
  matchConfidenceBps: number | null;
  result: LegResult | null;
}

export interface Slip {
  id: string;
  sourceSlug: string;
  title: string;
  referenceDate: string;
  sourceUrl: string;
  informedOddMilli: number | null;
  /** Produto das odds informadas por perna (quando existem todas). */
  computedOddMilli: number | null;
  /** Produto das melhores odds reais (só quando todas as pernas foram conferidas). */
  realOddMilli: number | null;
  marginBps: number | null;
  verification: SlipVerification;
  legsCount: number;
  verifiedLegs: number;
  status: SlipStatus;
  result: TipResult | null;
  stakeCents: number;
  payoutCents: number;
  profitCents: number;
  collectedAt: string;
  settledAt: string | null;
  legs: SlipLeg[];
}
