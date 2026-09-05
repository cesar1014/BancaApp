/**
 * apostasepalpites.com.br/palpites/ — prioridade máxima (cobre Brasil).
 *
 * Estrutura conferida em 05/09/2026 (app Nuxt renderizado no servidor):
 *   <h2>TÍTULO … @ 3.10</h2>                          título + odd total
 *   <ul data-testid="tips-hub-event-meta">              jogo, "Hoje"/"Amanhã",
 *     <span>Bragantino x Bahia</span> <time datetime="2026-09-05 16:00:00">
 *   <div data-testid="selection-title"><span>Bragantino - Mais chutes</span>
 *   <p>… Essa opção está com odds 1,40 na bet365 …</p>  odd da perna, no texto
 *
 * Em bilhetes com vários jogos, cada seleção tem o próprio <ul> de evento;
 * nos de um jogo só, o <ul> fica no cabeçalho. A competição não é explícita:
 * é inferida do texto da justificativa ("no Brasileirão", "Série B").
 *
 * A página não arquiva (URLs antigas dão 404/410): a coleta é diária.
 */

import { leagueLabelFromText } from '../domain/leagues';
import { parseDateTimeAttr, parseRelativeDay, SAO_PAULO } from '../domain/dates';
import { allGroups, decodeEntities, firstGroup, inline, splitBy, splitTeams } from '../domain/html';
import { parseDecimalOddMilli } from '../domain/odds';
import type { RawLeg, RawSlip, SlipSource } from '../domain/types';

export const APOSTASEPALPITES_URL = 'https://www.apostasepalpites.com.br/palpites/';

interface EventMeta {
  home: string;
  away: string;
  kickoff: string | null;
  day: string | null;
}

function parseEventMeta(html: string, now: Date): EventMeta | null {
  const spans = allGroups(html, /<span[^>]*>([^<]*)<\/span>/g).filter(Boolean);
  const teams = spans.map(splitTeams).find((t): t is { home: string; away: string } => t !== null);
  if (!teams) return null;
  const dayText = spans.find((s) => /^(hoje|amanh[ãa]|ontem)$/i.test(s));
  const day = dayText ? parseRelativeDay(dayText, now, SAO_PAULO) : null;
  const datetime = firstGroup(html, /<time[^>]*datetime="([^"]+)"/);
  const kickoff = datetime ? parseDateTimeAttr(datetime, SAO_PAULO) : null;
  return { home: teams.home, away: teams.away, kickoff, day };
}

export function parseApostasePalpites(html: string, now: Date, sourceUrl = APOSTASEPALPITES_URL): RawSlip[] {
  const slips: RawSlip[] = [];
  const cards = splitBy(html, /<h2[^>]*>[^<]*@\s?\d+[.,]\d+<\/h2>/g);

  for (const card of cards) {
    const heading = firstGroup(card, /<h2[^>]*>([^<]*@\s?\d+[.,]\d+)<\/h2>/);
    if (!heading) continue;
    const oddText = /@\s?(\d+[.,]\d+)/.exec(heading)?.[1] ?? null;
    const title = inline(heading.replace(/@\s?\d+[.,]\d+/, '')).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();

    // Meta do cabeçalho (bilhetes de um jogo) — o primeiro <ul data-testid="tips-hub-event-meta">
    const headerMetaHtml = /<ul[^>]*data-testid="tips-hub-event-meta"[^>]*>([\s\S]*?)<\/ul>/.exec(card)?.[1] ?? null;
    const headerMeta = headerMetaHtml ? parseEventMeta(headerMetaHtml, now) : null;

    // Corta o card no próximo cabeçalho de seção da página, se houver.
    const body = card.split(/<h2[^>]*>(?![^<]*@)/)[0] ?? card;
    const selections = splitBy(body, /data-testid="selection-title"/g);
    const legs: RawLeg[] = [];
    let day: string | null = headerMeta?.day ?? null;

    for (const selectionHtml of selections) {
      const marketText = firstGroup(selectionHtml, /<span class="min-w-0">([^<]*)<\/span>/) ?? firstGroup(selectionHtml, /<span[^>]*>([^<]*)<\/span>/);
      if (!marketText) continue;

      // <ul> próprio da seleção (bilhetes com vários jogos) ou o do cabeçalho.
      const ownMetaHtml = /<ul[^>]*>([\s\S]*?)<\/ul>/.exec(selectionHtml.split('<button')[0]?.includes('<ul') ? selectionHtml : '')?.[1] ?? null;
      const meta = (ownMetaHtml ? parseEventMeta(ownMetaHtml, now) : null) ?? headerMeta;
      if (!meta) continue;
      if (!day && meta.day) day = meta.day;

      const rationale = firstGroup(selectionHtml, /<p>([\s\S]*?)<\/p>/);
      const rationaleText = rationale ? inline(rationale) : '';
      const oddMatch = /odds?\s+(\d+[.,]\d+)/i.exec(rationaleText);
      const league = leagueLabelFromText(rationaleText, 'BR') ?? leagueLabelFromText(title, 'BR');

      legs.push({
        homeName: meta.home,
        awayName: meta.away,
        league,
        kickoff: meta.kickoff,
        market: decodeEntities(marketText).trim(),
        selection: decodeEntities(marketText).trim(),
        oddMilli: oddMatch ? parseDecimalOddMilli(oddMatch[1]) : null,
      });
    }

    if (legs.length === 0) continue;
    // Bilhete de um jogo só: a competição inferida numa perna vale para todas.
    const sharedLeague = legs.find((leg) => leg.league)?.league ?? null;
    const singleGame = legs.every((leg) => leg.homeName === legs[0]!.homeName && leg.awayName === legs[0]!.awayName);
    if (singleGame && sharedLeague) for (const leg of legs) leg.league = sharedLeague;
    const referenceDate = day ?? legs.find((leg) => leg.kickoff)?.kickoff?.slice(0, 10) ?? parseRelativeDay('hoje', now, SAO_PAULO)!;

    slips.push({
      title,
      referenceDate,
      totalOddMilli: parseDecimalOddMilli(oddText),
      legs,
      sourceUrl,
    });
  }

  return slips;
}

export const apostasePalpitesSource: SlipSource = {
  slug: 'apostasepalpites',
  label: 'Apostas e Palpites',
  url: APOSTASEPALPITES_URL,
  country: 'BR',
  async fetchSlips({ now, fetchPage }) {
    const html = await fetchPage(APOSTASEPALPITES_URL);
    if (!html) return [];
    return parseApostasePalpites(html, now);
  },
};
