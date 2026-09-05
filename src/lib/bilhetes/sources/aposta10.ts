/**
 * aposta10.com — bilhetes prontos em URL datada:
 *   /blog/bilhetes-prontos-nos-jogos-de-hoje-DDMMAAAA
 *
 * Conferido em 05/09/2026 (Next.js RSC, conteúdo em <div id="content body element">):
 *   <h2>🥫 Bilhete Pronto Conservador - para o dia 04/09/2026</h2>
 *   <h3>⬆️ Aposta dupla - Ligue 1, França</h3>
 *   <li>O bilhete traz apostas para os jogos <strong>PSG x Monaco</strong>, 16h05,
 *       e <strong>Lyon x Auxerre</strong>, 14h.</li>
 *   <p>… neste bilhete de <strong>odds 2.29</strong> …</p>
 *   <ul><li>PSG e Monaco marcarem gol.</li><li>Lyon vencer Auxerre.</li></ul>
 *
 * As seleções vêm em texto livre ao redor de uma imagem; sem odd por perna.
 * A página do dia só existe depois que a equipe publica: sem página = sem
 * dados hoje (não é erro).
 */

import { leagueLabelFromText } from '../domain/leagues';
import { dateInZone, localToIso, parseDayMonth, parseTime, SAO_PAULO } from '../domain/dates';
import { allGroups, firstGroup, inline, splitBy, splitTeams, stripTags } from '../domain/html';
import { parseDecimalOddMilli } from '../domain/odds';
import { teamSimilarity } from '@/lib/sports/domain/names';
import type { RawLeg, RawSlip, SlipSource } from '../domain/types';

export const APOSTA10_BASE = 'https://aposta10.com';

export function aposta10UrlFor(date: string): string {
  const [y, m, d] = date.split('-');
  return `${APOSTA10_BASE}/blog/bilhetes-prontos-nos-jogos-de-hoje-${d}${m}${y}`;
}

interface Game {
  home: string;
  away: string;
  kickoff: string | null;
}

/** "<strong>PSG x Monaco</strong>, 16h05, e <strong>Lyon x Auxerre</strong>, 14h." */
function gamesFrom(html: string, date: string): Game[] {
  const games: Game[] = [];
  const text = inline(html.replace(/<\/?strong>/g, '|'));
  const parts = text.split('|');
  for (let i = 1; i < parts.length; i += 2) {
    const teams = splitTeams(parts[i] ?? '');
    if (!teams) continue;
    const after = parts[i + 1] ?? '';
    const time = parseTime(after.slice(0, 20));
    games.push({ home: teams.home, away: teams.away, kickoff: time ? localToIso(date, time.hour, time.minute, SAO_PAULO) : null });
  }
  return games;
}

/** Qual dos jogos a frase da seleção menciona? */
function gameFor(sentence: string, games: Game[]): Game | null {
  let best: { game: Game; score: number } | null = null;
  for (const game of games) {
    const tokens = sentence.split(/[\s,.;]+/).filter((t) => t.length > 2);
    let score = 0;
    for (const token of tokens) {
      score = Math.max(score, teamSimilarity(token, game.home), teamSimilarity(token, game.away));
    }
    if (sentence.toLowerCase().includes(game.home.toLowerCase()) || sentence.toLowerCase().includes(game.away.toLowerCase())) score = 1;
    if (!best || score > best.score) best = { game, score };
  }
  return best && best.score >= 0.8 ? best.game : null;
}

export function parseAposta10(html: string, now: Date, sourceUrl: string): RawSlip[] {
  const content = /<div id="content body element"[^>]*>([\s\S]*)/.exec(html)?.[1] ?? html;
  const slips: RawSlip[] = [];
  const sections = splitBy(content, /<h2[^>]*>[^<]*Bilhete Pronto/gi);

  for (const section of sections) {
    const body = section.split(/<h2[^>]*>(?![^<]*Bilhete Pronto)/i)[0] ?? section;
    const heading = inline(firstGroup(body, /<h2[^>]*>([\s\S]*?)<\/h2>/) ?? '');
    const title = heading.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s*-\s*para o dia.*$/i, '').trim();
    const date = parseDayMonth(heading, now, SAO_PAULO) ?? dateInZone(now, SAO_PAULO);
    const subtitle = inline(firstGroup(body, /<h3[^>]*>([\s\S]*?)<\/h3>/) ?? '');
    const league = leagueLabelFromText(subtitle, 'BR') ?? leagueLabelFromText(stripTags(body).slice(0, 600), 'BR');

    const lists = allGroups(body, /<ul>([\s\S]*?)<\/ul>/g);
    const intro = lists[0] ?? '';
    let games = gamesFrom(intro, date);
    // Bilhete de um jogo só ("Mega Odds - Real Betis x Real Madrid"): jogo no subtítulo.
    if (games.length === 0) {
      const teams = splitTeams(subtitle.replace(/^.*?[-–]\s*/, ''));
      if (teams) {
        const time = parseTime(stripTags(intro));
        games = [{ home: teams.home, away: teams.away, kickoff: time ? localToIso(date, time.hour, time.minute, SAO_PAULO) : null }];
      }
    }
    if (games.length === 0) continue;

    const oddText = /odds?\s*(?:<\/?strong>)?\s*(\d+[.,]\d+)/i.exec(body)?.[1] ?? null;
    const needs = lists.slice(1).find((list) => /vencer|marcar|gol|mais de|menos de|empate|ambas/i.test(stripTags(list))) ?? '';
    const sentences = allGroups(needs, /<li[^>]*>([\s\S]*?)<\/li>/g).map(inline).filter(Boolean);

    const legs: RawLeg[] = [];
    for (const sentence of sentences) {
      const game = games.length === 1 ? games[0]! : gameFor(sentence, games);
      if (!game) continue;
      const market = sentence.replace(/\.$/, '');
      legs.push({ homeName: game.home, awayName: game.away, league, kickoff: game.kickoff, market, selection: market, oddMilli: null });
    }
    if (legs.length === 0) continue;

    slips.push({ title, referenceDate: date, totalOddMilli: parseDecimalOddMilli(oddText), legs, sourceUrl });
  }
  return slips;
}

export const aposta10Source: SlipSource = {
  slug: 'aposta10',
  label: 'Aposta10',
  url: `${APOSTA10_BASE}/blog/c/bilhetes-prontos`,
  country: 'BR',
  async fetchSlips({ now, fetchPage }) {
    const today = dateInZone(now, SAO_PAULO);
    const url = aposta10UrlFor(today);
    const html = await fetchPage(url);
    // A página redireciona para /blog quando o post do dia ainda não existe.
    if (!html || !/Bilhete Pronto/i.test(html)) return [];
    return parseAposta10(html, now, url);
  },
};
