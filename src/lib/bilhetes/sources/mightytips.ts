/**
 * mightytips.com/football-predictions/accumulator/ — dados mais limpos.
 *
 * Conferido em 05/09/2026:
 *   <article class="mtl-accumulator-list__wrap" data-accumulator_item>
 *     <h2 class="mtl-accumulator-list__title_text">Today's football acca tips #1</h2>
 *     <p class="mtl-accumulator-list__title_date">05.09.2026</p>
 *     <li class="mtl-accumulator-list__item_wrap">
 *       <span datetime="2026-09-05T18:45:00.000Z">18:45</span>
 *       <p class="mtl-accumulator-list__name">AS Roma — Atalanta</p>
 *       <p class="mtl-accumulator-list__desc">Our tip: <span>1</span></p>
 *       <p class="mtl-accumulator-list__coef_more" data-coefficient="1.76">
 *     <p data-accumulator_odd_total="8.64597888">8.65</p>
 *
 * Há também um "Mega Accumulator Tip" em <ul class="mtl-tips-list">, com
 * odd total por casa na tabela (usamos a maior).
 */

import { parseDayMonth } from '../domain/dates';
import { elementsByClass, firstGroup, inline, splitBy, splitTeams } from '../domain/html';
import { parseDecimalOddMilli } from '../domain/odds';
import type { RawLeg, RawSlip, SlipSource } from '../domain/types';

export const MIGHTYTIPS_URL = 'https://www.mightytips.com/football-predictions/accumulator/';

export function parseMightyTips(html: string, now: Date, sourceUrl = MIGHTYTIPS_URL): RawSlip[] {
  const slips: RawSlip[] = [];

  // --- Bilhetes em <article data-accumulator_item> ---------------------------
  for (const article of splitBy(html, /<article[^>]*data-accumulator_item/g)) {
    const body = article.split('</article>')[0] ?? article;
    const title = inline(firstGroup(body, /mtl-accumulator-list__title_text[^>]*>([\s\S]*?)<\/h2>/) ?? 'Acca');
    const dateText = inline(firstGroup(body, /mtl-accumulator-list__title_date[^>]*>([\s\S]*?)<\/p>/) ?? '');
    const total = parseDecimalOddMilli(firstGroup(body, /data-accumulator_odd_total="([^"]+)"/));
    const legs: RawLeg[] = [];

    for (const item of elementsByClass(body, 'li', 'mtl-accumulator-list__item_wrap')) {
      const name = inline(firstGroup(item, /mtl-accumulator-list__name[^>]*>([\s\S]*?)<\/p>/) ?? '');
      const teams = splitTeams(name);
      if (!teams) continue;
      const tip = inline(firstGroup(item, /mtl-accumulator-list__desc[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/) ?? '');
      const datetime = firstGroup(item, /datetime="([^"]+)"/);
      const odd = parseDecimalOddMilli(firstGroup(item, /data-coefficient="([^"]+)"/));
      legs.push({
        homeName: teams.home,
        awayName: teams.away,
        league: null,
        kickoff: datetime ? new Date(datetime).toISOString() : null,
        market: tip ? `Our tip: ${tip}` : '',
        selection: tip,
        oddMilli: odd,
      });
    }
    if (legs.length === 0) continue;
    const referenceDate = parseDayMonth(dateText, now, 'UTC') ?? legs.find((l) => l.kickoff)?.kickoff?.slice(0, 10) ?? now.toISOString().slice(0, 10);
    slips.push({ title, referenceDate, totalOddMilli: total, legs, sourceUrl });
  }

  // --- Mega Accumulator Tip (lista de tips + tabela de odd total por casa) ---
  const megaIndex = html.indexOf('<ul class="mtl-tips-list"');
  if (megaIndex !== -1) {
    const mega = html.slice(megaIndex, html.indexOf('</section>', megaIndex));
    const legs: RawLeg[] = [];
    for (const item of elementsByClass(mega, 'li', 'mtl-tips-list__item')) {
      const name = inline(firstGroup(item, /mtl-tips-list__match_name[^>]*>([\s\S]*?)<\/p>/) ?? '');
      const teams = splitTeams(name);
      if (!teams) continue;
      const tip = inline(firstGroup(item, /mtl-tips-list__name[^>]*>([\s\S]*?)<\/p>/) ?? '');
      const datetime = firstGroup(item, /datetime="([^"]+)"/);
      const odd = parseDecimalOddMilli(firstGroup(item, /mtl-tips-list__coef[^>]*>([\s\S]*?)<\/p>/));
      legs.push({ homeName: teams.home, awayName: teams.away, league: null, kickoff: datetime ? new Date(datetime).toISOString() : null, market: tip, selection: tip, oddMilli: odd });
    }
    if (legs.length > 0) {
      const totals = [...mega.matchAll(/mtl-tips-odds__coef[^>]*>([\s\S]*?)<\/td>/g)].map((m) => parseDecimalOddMilli(inline(m[1] ?? ''))).filter((v): v is number => v !== null);
      const referenceDate = legs.find((l) => l.kickoff)?.kickoff?.slice(0, 10) ?? now.toISOString().slice(0, 10);
      slips.push({ title: 'Mega Accumulator Tip', referenceDate, totalOddMilli: totals.length ? Math.max(...totals) : null, legs, sourceUrl });
    }
  }

  return slips;
}

export const mightyTipsSource: SlipSource = {
  slug: 'mightytips',
  label: 'MightyTips',
  url: MIGHTYTIPS_URL,
  country: 'INT',
  async fetchSlips({ now, fetchPage }) {
    const html = await fetchPage(MIGHTYTIPS_URL);
    if (!html) return [];
    return parseMightyTips(html, now);
  },
};
