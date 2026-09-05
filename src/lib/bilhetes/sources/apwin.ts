/**
 * apwin.com/accumulator-predictions/ — 1 bilhete/dia, hoje/amanhã/depois.
 *
 * Conferido em 05/09/2026 (abas Alpine `x-show="tabs === 0|1|2"`):
 *   <p>Today's Accumulator Tip</p> <div>Saturday, 05/09</div>
 *   <a href="https://www.apwin.com/predictions/manchester-city-vs-coventry-city-prediction-premier-league-05-09-2026/">
 *     <p>Manchester City Win</p>
 *     <p>11:00</p> … <span>Manchester City</span> … <p>05/09</p> … <span>Coventry City</span>
 *     <div>1.17</div>
 *   … <p>Total odds</p> <a>2.21</a>
 *
 * A URL da previsão carrega a competição e a data (DD-MM-AAAA).
 */

import { leagueLabelFromText } from '../domain/leagues';
import { localToIso, parseTime } from '../domain/dates';
import { firstGroup, inline, splitBy, stripTags } from '../domain/html';
import { parseDecimalOddMilli } from '../domain/odds';
import type { RawLeg, RawSlip, SlipSource } from '../domain/types';

export const APWIN_URL = 'https://apwin.com/accumulator-predictions/';

const TAB_TITLES = ["Today's Accumulator Tip", "Tomorrow's Accumulator Tip", 'Accumulator Tip'];

export function parseApwin(html: string, now: Date, sourceUrl = APWIN_URL): RawSlip[] {
  const slips: RawSlip[] = [];
  const clean = html.replace(/<svg[\s\S]*?<\/svg>/g, '');
  const tabs = splitBy(clean, /x-show="tabs === \d"/g);

  for (const [index, tab] of tabs.entries()) {
    const title = inline(firstGroup(tab, /<p[^>]*>((?:Today|Tomorrow|[A-Z][a-z]+)[^<]*Accumulator Tip)<\/p>/) ?? TAB_TITLES[Math.min(index, 2)]!);
    const legs: RawLeg[] = [];
    let referenceDate: string | null = null;

    for (const block of splitBy(tab, /<a href="https?:\/\/(?:www\.)?apwin\.com\/predictions\//g)) {
      const href = firstGroup(block, /^<a href="([^"]+)"/) ?? '';
      const dateMatch = /-(\d{2})-(\d{2})-(\d{4})\/?$/.exec(href);
      const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null;
      if (date && !referenceDate) referenceDate = date;
      const anchor = block.split('</a>')[0] ?? block;
      const selection = inline(firstGroup(anchor, /<p[^>]*>([^<]+)<\/p>/) ?? '');
      const spans = [...anchor.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((m) => inline(m[1] ?? '')).filter(Boolean);
      const teams = spans.filter((s) => !/^\d{1,2}[:h]\d{2}$/.test(s));
      if (teams.length < 2 || !selection) continue;
      const timeText = inline(firstGroup(anchor, /<p[^>]*>\s*(\d{1,2}:\d{2})\s*<\/p>/) ?? '');
      const time = parseTime(timeText);
      const oddText = stripTags(anchor).match(/(\d+\.\d{2})\s*$/)?.[1] ?? null;
      const leagueSlug = /prediction-([a-z0-9-]+)-\d{2}-\d{2}-\d{4}/.exec(href)?.[1]?.replace(/-/g, ' ') ?? null;
      legs.push({
        homeName: teams[0]!,
        awayName: teams[1]!,
        league: leagueLabelFromText(leagueSlug, 'INT') ?? leagueSlug,
        kickoff: time && date ? localToIso(date, time.hour, time.minute, 'UTC') : null,
        market: selection,
        selection,
        oddMilli: parseDecimalOddMilli(oddText),
      });
    }

    if (legs.length === 0) continue;
    const total = parseDecimalOddMilli(inline(firstGroup(tab, /Total odds<\/p>\s*<a[^>]*>([\s\S]*?)<\/a>/) ?? ''));
    slips.push({
      title,
      referenceDate: referenceDate ?? now.toISOString().slice(0, 10),
      totalOddMilli: total,
      legs,
      sourceUrl,
    });
  }
  return slips;
}

export const apwinSource: SlipSource = {
  slug: 'apwin',
  label: 'APWin',
  url: APWIN_URL,
  country: 'INT',
  async fetchSlips({ now, fetchPage }) {
    const html = await fetchPage(APWIN_URL);
    if (!html) return [];
    return parseApwin(html, now);
  },
};
