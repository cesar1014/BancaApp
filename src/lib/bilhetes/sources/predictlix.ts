/**
 * predictlix.com/accumulator-tips/ — melhor estrutura de todas.
 *
 * Conferido em 05/09/2026:
 *   <h2 class="acca-section-title">Favourites Accumulators</h2>
 *   <div class="acca-card">
 *     <span class="acca-type-badge">Treble</span> … <span class="acca-total-odds">4.63</span>
 *     <li class="acca-sel">
 *       <span class="acca-sel-league">First League</span>
 *       <span class="acca-sel-match">Levski Sofia<span class="vs-sep"> vs </span>CSKA 1948</span>
 *       <span class="acca-sel-tip">✓ Levski Sofia to Win</span>
 *       <span class="acca-sel-time">⏰ 18:15</span><span class="acca-sel-odd">1.54</span>
 *
 * Não há data explícita: a página é sempre "hoje" (UTC). Recicla os mesmos
 * jogos em vários bilhetes — a deduplicação por seleções cuida disso.
 */

import { dateInZone, localToIso, parseTime } from '../domain/dates';
import { elementsByClass, firstGroup, inline, splitBy } from '../domain/html';
import { parseDecimalOddMilli } from '../domain/odds';
import type { RawLeg, RawSlip, SlipSource } from '../domain/types';

export const PREDICTLIX_URL = 'https://predictlix.com/accumulator-tips/';

export function parsePredictlix(html: string, now: Date, sourceUrl = PREDICTLIX_URL): RawSlip[] {
  const slips: RawSlip[] = [];
  const referenceDate = dateInZone(now, 'UTC');
  const sections = splitBy(html, /<div class="acca-section">/g);

  for (const section of sections) {
    const sectionTitle = inline(firstGroup(section, /acca-section-title[^>]*>([\s\S]*?)<\/h2>/) ?? 'Accumulator');
    const cards = splitBy(section, /<div class="acca-card">/g);

    for (const [index, card] of cards.entries()) {
      const type = inline(firstGroup(card, /acca-type-badge[^>]*>([\s\S]*?)<\/span>/) ?? '');
      const total = parseDecimalOddMilli(firstGroup(card, /acca-total-odds[^>]*>([\s\S]*?)<\/span>/));
      const legs: RawLeg[] = [];

      for (const item of elementsByClass(card, 'li', 'acca-sel')) {
        const league = inline(firstGroup(item, /acca-sel-league[^>]*>([\s\S]*?)<\/span>/) ?? '');
        const matchHtml = firstGroup(item, /acca-sel-match[^>]*>([\s\S]*?)<\/span>\s*<div/) ?? firstGroup(item, /acca-sel-match[^>]*>([\s\S]*?)<\/span>/);
        const teams = matchHtml ? splitTeamsVs(matchHtml) : null;
        if (!teams) continue;
        const tip = inline(firstGroup(item, /acca-sel-tip[^>]*>([\s\S]*?)<\/span>/) ?? '').replace(/^✓\s*/, '');
        const timeText = inline(firstGroup(item, /acca-sel-time[^>]*>([\s\S]*?)<\/span>/) ?? '');
        const time = parseTime(timeText);
        const odd = parseDecimalOddMilli(firstGroup(item, /acca-sel-odd[^>]*>([\s\S]*?)<\/span>/));
        legs.push({
          homeName: teams.home,
          awayName: teams.away,
          league: league || null,
          kickoff: time ? localToIso(referenceDate, time.hour, time.minute, 'UTC') : null,
          market: tip,
          selection: tip,
          oddMilli: odd,
        });
      }

      if (legs.length === 0) continue;
      slips.push({
        title: slipTitle(sectionTitle, type, index),
        referenceDate,
        totalOddMilli: total,
        legs,
        sourceUrl,
      });
    }
  }
  return slips;
}

function slipTitle(sectionTitle: string, type: string, index: number): string {
  const section = sectionTitle.replace(/ Accumulators?$/i, '').trim();
  const kind = type || 'Acca';
  const head = section.toLowerCase() === kind.toLowerCase() ? kind : `${section} · ${kind}`;
  return `${head} #${index + 1}`;
}

/** "Levski Sofia<span class="vs-sep"> vs </span>CSKA 1948" */
function splitTeamsVs(html: string): { home: string; away: string } | null {
  const parts = html.split(/<span class="vs-sep">[\s\S]*?<\/span>/);
  if (parts.length !== 2) return null;
  const home = inline(parts[0]!);
  const away = inline(parts[1]!);
  return home && away ? { home, away } : null;
}

export const predictlixSource: SlipSource = {
  slug: 'predictlix',
  label: 'Predictlix',
  url: PREDICTLIX_URL,
  country: 'INT',
  async fetchSlips({ now, fetchPage }) {
    const html = await fetchPage(PREDICTLIX_URL);
    if (!html) return [];
    return parsePredictlix(html, now);
  },
};
