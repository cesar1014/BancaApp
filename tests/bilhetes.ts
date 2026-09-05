/**
 * Suíte da aba Bilhetes. Os parsers rodam contra HTML salvo em
 * tests/fixtures/bilhetes/ (baixado em 05/09/2026) — nunca contra a rede.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { group, test } from './harness';

import { fractionalOddToMilli, parseAnyOddMilli, parseDecimalOddMilli } from '../src/lib/bilhetes/domain/odds';
import { localToIso, parseDay, parseDayMonth, parseRelativeDay, parseTime, parseDateTimeAttr, SAO_PAULO } from '../src/lib/bilhetes/domain/dates';
import { marketBook, parseMarket } from '../src/lib/bilhetes/domain/markets';
import { leagueLabelFromText } from '../src/lib/bilhetes/domain/leagues';
import { splitTeams, stripTags, decodeEntities } from '../src/lib/bilhetes/domain/html';
import {
  bestAvailableOddMilli,
  combinedOddMilli,
  dedupeRawSlips,
  legMarginBps,
  settleSlip,
  slipComparison,
  slipDedupeHash,
  slipMarginBps,
  slipMoney,
} from '../src/lib/bilhetes/domain/slip';
import { matchLeg } from '../src/lib/bilhetes/matching';
import { isAllowedByRobots, parseRobots } from '../src/lib/bilhetes/sources/fetch-page';
import { parseApostasePalpites, apostasePalpitesSource } from '../src/lib/bilhetes/sources/apostasepalpites';
import { parseAposta10, aposta10UrlFor, aposta10Source } from '../src/lib/bilhetes/sources/aposta10';
import { parsePredictlix } from '../src/lib/bilhetes/sources/predictlix';
import { parseMightyTips } from '../src/lib/bilhetes/sources/mightytips';
import { parseApwin } from '../src/lib/bilhetes/sources/apwin';
import { SLIP_SOURCES } from '../src/lib/bilhetes/sources';
import type { OddsQuote } from '../src/lib/sports/domain/models';
import type { RawLeg } from '../src/lib/bilhetes/domain/types';

const NOW = new Date('2026-09-05T09:00:00Z');
const fixture = (name: string) => readFileSync(join(process.cwd(), 'tests', 'fixtures', 'bilhetes', name), 'utf8');

function quote(market: OddsQuote['market'], selection: OddsQuote['selection'], odd: number, bookmaker = 'Betano', line: number | null = null): OddsQuote {
  return { market, selection, line, oddMilli: odd, bookmaker, provider: 'mock', capturedAt: '2026-09-05T10:00:00.000Z' };
}

function leg(over: Partial<RawLeg> = {}): RawLeg {
  return { homeName: 'Criciúma', awayName: 'Cuiabá', league: 'Série B', kickoff: null, market: 'Mais de 0,5 gols', selection: 'Mais de 0,5 gols', oddMilli: null, ...over };
}

// ===========================================================================
group('Bilhetes › odds');
// ===========================================================================
test('fração britânica → decimal (8/13 → 1,615; 687/1000 → 1,687; EVS → 2,00)', () => {
  assert.equal(fractionalOddToMilli('8/13'), 1615);
  assert.equal(fractionalOddToMilli('687/1000'), 1687);
  assert.equal(fractionalOddToMilli('EVS'), 2000);
  assert.equal(fractionalOddToMilli('1/1'), 2000);
  assert.equal(fractionalOddToMilli('abc'), null);
  assert.equal(fractionalOddToMilli('3/0'), null);
});

test('decimal em pt-BR e en; lixo vira null', () => {
  assert.equal(parseDecimalOddMilli('1,40'), 1400);
  assert.equal(parseDecimalOddMilli('@ 3.90'), 3900);
  assert.equal(parseDecimalOddMilli('1.00'), null);
  assert.equal(parseAnyOddMilli('8/13'), 1615);
  assert.equal(parseAnyOddMilli('2.05'), 2050);
});

// ===========================================================================
group('Bilhetes › datas');
// ===========================================================================
test('"Hoje"/"Amanhã"/"Today" no fuso da fonte', () => {
  // 05/09 09:00Z ainda é 05/09 em São Paulo.
  assert.equal(parseRelativeDay('Hoje', NOW, SAO_PAULO), '2026-09-05');
  assert.equal(parseRelativeDay('Amanhã', NOW, SAO_PAULO), '2026-09-06');
  assert.equal(parseRelativeDay('tomorrow', NOW, 'UTC'), '2026-09-06');
  // 01:00Z do dia 6 ainda é dia 5 em São Paulo.
  assert.equal(parseRelativeDay('Hoje', new Date('2026-09-06T01:00:00Z'), SAO_PAULO), '2026-09-05');
});

test('"05/09", "04/09/2026", "05.09.2026" e horários "16h05", "14h", "19:30"', () => {
  assert.equal(parseDayMonth('Saturday, 05/09', NOW, 'UTC'), '2026-09-05');
  assert.equal(parseDayMonth('para o dia 04/09/2026', NOW, SAO_PAULO), '2026-09-04');
  assert.equal(parseDayMonth('05.09.2026', NOW, 'UTC'), '2026-09-05');
  assert.equal(parseDay('Amanhã', NOW, SAO_PAULO), '2026-09-06');
  assert.deepEqual(parseTime('16h05'), { hour: 16, minute: 5 });
  assert.deepEqual(parseTime('14h'), { hour: 14, minute: 0 });
  assert.deepEqual(parseTime('⏰ 19:30'), { hour: 19, minute: 30 });
  assert.equal(parseTime('sem hora'), null);
});

test('hora local de Brasília vira UTC (+3h)', () => {
  assert.equal(localToIso('2026-09-05', 19, 30, SAO_PAULO), '2026-09-05T22:30:00.000Z');
  assert.equal(parseDateTimeAttr('2026-09-05 16:00:00', SAO_PAULO), '2026-09-05T19:00:00.000Z');
  assert.equal(parseDateTimeAttr('2026-09-05T18:45:00.000Z', SAO_PAULO), '2026-09-05T18:45:00.000Z');
});

// ===========================================================================
group('Bilhetes › mercados e HTML');
// ===========================================================================
test('interpreta mercados em português e inglês', () => {
  const p = (m: string, s = m) => parseMarket(m, s, 'Criciúma', 'Cuiabá');
  assert.deepEqual([p('Total de gols - Mais de 1,5').market, p('Total de gols - Mais de 1,5').selection, p('Total de gols - Mais de 1,5').line], ['OVER_1_5', 'OVER', 1.5]);
  assert.equal(p('Over 2.5 Goals').market, 'OVER_2_5');
  assert.equal(p('Under 2.5').market, 'UNDER_2_5');
  assert.equal(p('CRB - Resultado Final').market, null); // CRB não é mandante nem visitante deste jogo
  assert.deepEqual([p('Cuiabá - Resultado Final').market, p('Cuiabá - Resultado Final').selection], ['MATCH_WINNER', 'AWAY']);
  assert.deepEqual([p('Criciúma to Win').market, p('Criciúma to Win').selection], ['MATCH_WINNER', 'HOME']);
  assert.deepEqual([p('Our tip: 2', '2').market, p('Our tip: 2', '2').selection], ['MATCH_WINNER', 'AWAY']);
  assert.deepEqual([p('Double Chance: Criciúma or Draw').market, p('Double Chance: Criciúma or Draw').selection], ['DOUBLE_CHANCE', '1X']);
  assert.deepEqual([p('BTTS - Yes').market, p('BTTS - Yes').selection], ['BTTS', 'YES']);
  assert.deepEqual([p('Ambos marcam? - Sim').market, p('Ambos marcam? - Sim').selection], ['BTTS', 'YES']);
  assert.deepEqual([p('Criciúma e Cuiabá marcarem gol').market, p('Criciúma e Cuiabá marcarem gol').selection], ['BTTS', 'YES']);
  assert.deepEqual([p('Total de cartões - Mais de 4,5').market, p('Total de cartões - Mais de 4,5').line], ['CARDS', 4.5]);
  // Gol do time (não do jogo) e mercados de jogador não têm equivalente: ficam sem conferência.
  assert.equal(p('Cuiabá - Mais de 0,5 gols').market, null);
  assert.equal(p('Hulk - 2+ chutes no gol').market, null);
  assert.equal(p('Our tip: AH1 (0)', 'AH1 (0)').market, null);
});

test('livro completo para devigar por mercado', () => {
  assert.equal(marketBook('MATCH_WINNER', 'HOME', null)!.length, 3);
  assert.equal(marketBook('OVER_2_5', 'OVER', 2.5)!.length, 2);
  assert.deepEqual(marketBook('DOUBLE_CHANCE', '1X', null)![1], { market: 'MATCH_WINNER', selection: 'AWAY', line: null });
  assert.equal(marketBook('OVER_0_5', 'OVER', 0.5), null);
});

test('competição inferida do texto depende do país da fonte', () => {
  assert.equal(leagueLabelFromText('no Brasileirão', 'BR'), 'Brasileirão Série A');
  assert.equal(leagueLabelFromText('Série B', 'BR'), 'Brasileirão Série B');
  assert.equal(leagueLabelFromText('serie a', 'INT'), 'Serie A');
  assert.equal(leagueLabelFromText('serie b', 'INT'), 'Serie B');
  assert.equal(leagueLabelFromText('Ligue 1, França', 'BR'), 'Ligue 1');
});

test('utilidades de HTML: times, entidades, texto', () => {
  assert.deepEqual(splitTeams('Criciúma x Cuiabá'), { home: 'Criciúma', away: 'Cuiabá' });
  assert.deepEqual(splitTeams('AS Roma — Atalanta'), { home: 'AS Roma', away: 'Atalanta' });
  assert.deepEqual(splitTeams('Levski Sofia vs CSKA 1948'), { home: 'Levski Sofia', away: 'CSKA 1948' });
  assert.equal(splitTeams('sem separador'), null);
  assert.equal(decodeEntities('T&amp;Cs &#39;x&#39;'), "T&Cs 'x'");
  assert.equal(stripTags('<p>Olá <b>mundo</b></p><script>x()</script>'), 'Olá mundo');
});

// ===========================================================================
group('Bilhetes › domínio do bilhete');
// ===========================================================================
test('odd combinada com 2, 3 e 5 pernas', () => {
  assert.equal(combinedOddMilli([{ oddMilli: 1500 }, { oddMilli: 2000 }]), 3000);
  assert.equal(combinedOddMilli([{ oddMilli: 1080 }, { oddMilli: 1420 }, { oddMilli: 2540 }]), 3895); // ≈ 3,90 da fonte
  assert.equal(combinedOddMilli([{ oddMilli: 1200 }, { oddMilli: 1200 }, { oddMilli: 1200 }, { oddMilli: 1200 }, { oddMilli: 1200 }]), 2488);
  assert.equal(combinedOddMilli([{ oddMilli: null }, { oddMilli: 1500 }]), 1500);
  assert.equal(combinedOddMilli([{ oddMilli: null }]), null);
});

test('margem acumulada: 5 pernas a 5% dão ~27,6%, não 5%', () => {
  const result = slipMarginBps(Array.from({ length: 5 }, () => ({ marginBps: 500 })));
  assert.equal(result.knownLegs, 5);
  assert.ok(result.marginBps! > 2_000 && result.marginBps! < 3_000, `margem ${result.marginBps}`);
  assert.equal(result.marginBps, 2763);
  assert.deepEqual(slipMarginBps([{ marginBps: null }, { marginBps: 500 }]), { marginBps: 500, knownLegs: 1 });
  assert.deepEqual(slipMarginBps([{ marginBps: null }]), { marginBps: null, knownLegs: 0 });
});

test('margem da perna vem do livro devigado da mesma casa', () => {
  const quotes = [
    quote('OVER_2_5', 'OVER', 1900, 'Betano', 2.5),
    quote('UNDER_2_5', 'UNDER', 1900, 'Betano', 2.5),
    quote('OVER_2_5', 'OVER', 2000, 'Pinnacle', 2.5), // sem under: livro incompleto
  ];
  const margin = legMarginBps({ marketKey: 'OVER_2_5', selectionKey: 'OVER', line: 2.5 }, quotes, 'Betano');
  assert.equal(margin, 526); // 2 × (1/1,90) − 1 = 5,26%
  assert.equal(legMarginBps({ marketKey: 'OVER_2_5', selectionKey: 'OVER', line: 2.5 }, quotes, 'Pinnacle'), null);
  assert.equal(legMarginBps({ marketKey: null, selectionKey: null, line: null }, quotes, 'Betano'), null);
});

test('melhor odd disponível entre as casas e comparação informada × real', () => {
  const quotes = [quote('MATCH_WINNER', 'HOME', 2400, 'Betano'), quote('MATCH_WINNER', 'HOME', 2540, 'Bet365'), quote('MATCH_WINNER', 'AWAY', 3000, 'Bet365')];
  const best = bestAvailableOddMilli({ marketKey: 'MATCH_WINNER', selectionKey: 'HOME', line: null }, quotes);
  assert.deepEqual([best?.oddMilli, best?.bookmaker], [2540, 'Bet365']);
  assert.equal(bestAvailableOddMilli({ marketKey: null, selectionKey: null, line: null }, quotes), null);

  const full = slipComparison({ informedOddMilli: 3900, legs: [{ position: 1, realOddMilli: 1100 }, { position: 2, realOddMilli: 1380 }, { position: 3, realOddMilli: 2540 }] });
  assert.equal(full.verification, 'FULL');
  assert.equal(full.realOddMilli, 3856);
  assert.equal(full.differenceBps, -113);

  const partial = slipComparison({ informedOddMilli: 3900, legs: [{ position: 1, realOddMilli: 1100 }, { position: 2, realOddMilli: null }] });
  assert.equal(partial.verification, 'PARTIAL');
  assert.equal(partial.realOddMilli, null);
  assert.deepEqual(partial.unverifiedLegs, [2]);
  assert.equal(slipComparison({ informedOddMilli: null, legs: [] }).verification, 'NONE');
});

test('liquidação: um red derruba; push reduz a odd e mantém vivo; sem odd por perna com push → pendente', () => {
  const g = { result: 'GREEN' as const, oddMilli: 1500, realOddMilli: null };
  const r = { result: 'RED' as const, oddMilli: 2000, realOddMilli: null };
  const p = { result: 'PUSH' as const, oddMilli: 1800, realOddMilli: null };
  const o = { result: null, oddMilli: 1800, realOddMilli: null };

  assert.deepEqual(settleSlip([g, r, g], 4500), { status: 'SETTLED', result: 'RED', effectiveOddMilli: null });
  assert.deepEqual(settleSlip([g, g], 2250), { status: 'SETTLED', result: 'GREEN', effectiveOddMilli: 2250 });
  assert.deepEqual(settleSlip([g, p, g], 4050), { status: 'SETTLED', result: 'GREEN', effectiveOddMilli: 2250 });
  assert.deepEqual(settleSlip([p, p], 3240), { status: 'SETTLED', result: 'PUSH', effectiveOddMilli: 1000 });
  assert.equal(settleSlip([g, o], 2700).status, 'OPEN');
  assert.equal(settleSlip([g, { ...o, unresolvable: true }], 2700).status, 'PENDING');
  // Sem odd por perna: green pleno usa a odd informada; com push não dá para recalcular.
  assert.deepEqual(settleSlip([{ ...g, oddMilli: null }, { ...g, oddMilli: null }], 3900), { status: 'SETTLED', result: 'GREEN', effectiveOddMilli: 3900 });
  assert.equal(settleSlip([{ ...g, oddMilli: null }, { ...p, oddMilli: null }], 3900).status, 'PENDING');
  // A odd real conferida serve quando a fonte não publicou a da perna.
  assert.deepEqual(settleSlip([{ ...g, oddMilli: null, realOddMilli: 1400 }, { ...p, oddMilli: null }], 3900), { status: 'SETTLED', result: 'GREEN', effectiveOddMilli: 1400 });
});

test('dinheiro do bilhete segue a regra das entradas', () => {
  assert.deepEqual(slipMoney('GREEN', 10_000, 3900), { payoutCents: 39_000, profitCents: 29_000 });
  assert.deepEqual(slipMoney('RED', 10_000, 3900), { payoutCents: 0, profitCents: -10_000 });
  assert.deepEqual(slipMoney('PUSH', 10_000, null), { payoutCents: 10_000, profitCents: 0 });
});

test('dedupe: o mesmo bilhete em duas páginas (ordem e título diferentes) entra uma vez só', () => {
  const a = { title: 'Tripla', referenceDate: '2026-09-05', totalOddMilli: 3900, sourceUrl: 'u1', legs: [leg(), leg({ homeName: 'Athletic', awayName: 'Vila Nova', market: 'Mais de 1,5' })] };
  const b = { title: 'Outro título', referenceDate: '2026-09-05', totalOddMilli: 3900, sourceUrl: 'u2', legs: [leg({ homeName: 'Athletic Club', awayName: 'Vila Nova', market: 'Mais de 1,5' }), leg({ homeName: 'Criciuma' })] };
  const c = { ...a, legs: [leg({ market: 'Mais de 1,5 gols' })] };
  assert.equal(slipDedupeHash(a.legs), slipDedupeHash(b.legs));
  assert.notEqual(slipDedupeHash(a.legs), slipDedupeHash(c.legs));
  assert.equal(dedupeRawSlips([a, b, c]).length, 2);
});

test('casamento da perna: só com mandante e visitante batendo, e sem ambiguidade', () => {
  const candidates = [
    { id: 'f1', homeName: 'Criciúma', awayName: 'Cuiabá', startTime: '2026-09-05T22:30:00Z', leagueKey: 'BRA_SERIE_B' },
    { id: 'f2', homeName: 'Athletic Club', awayName: 'Vila Nova', startTime: '2026-09-05T23:30:00Z', leagueKey: 'BRA_SERIE_B' },
    { id: 'f3', homeName: 'Cuiabá', awayName: 'Criciúma', startTime: '2026-09-05T22:30:00Z', leagueKey: 'BRA_SERIE_B' },
  ];
  assert.equal(matchLeg(leg({ kickoff: '2026-09-05T22:30:00Z' }), '2026-09-05', 'BRA_SERIE_B', candidates)?.fixtureId, 'f1');
  assert.equal(matchLeg(leg({ homeName: 'Athletic', awayName: 'Vila Nova' }), '2026-09-05', null, candidates)?.fixtureId, 'f2');
  assert.equal(matchLeg(leg({ homeName: 'Criciúma', awayName: 'Corinthians' }), '2026-09-05', null, candidates), null);
  assert.equal(matchLeg(leg({ kickoff: '2026-09-08T22:30:00Z' }), '2026-09-08', null, candidates), null);
});

// ===========================================================================
group('Bilhetes › robots e fontes');
// ===========================================================================
test('robots.txt: Disallow do grupo * é respeitado', () => {
  const rules = parseRobots('User-agent: PetalBot\nDisallow: /\n\nUser-agent: *\nDisallow: /search/*\nDisallow: /go/\nAllow: /x');
  assert.deepEqual(rules, ['/search/*', '/go/']);
  assert.equal(isAllowedByRobots('/accumulator-predictions/', rules), true);
  assert.equal(isAllowedByRobots('/search/abc', rules), false);
  assert.equal(isAllowedByRobots('/go/bet', rules), false);
});

test('registro tem as 5 fontes iniciais com slug, país e URL', () => {
  assert.deepEqual(SLIP_SOURCES.map((s) => s.slug), ['apostasepalpites', 'aposta10', 'predictlix', 'mightytips', 'apwin']);
  assert.ok(SLIP_SOURCES.every((s) => s.url.startsWith('https://') && (s.country === 'BR' || s.country === 'INT')));
  assert.equal(aposta10UrlFor('2026-09-05'), 'https://aposta10.com/blog/bilhetes-prontos-nos-jogos-de-hoje-05092026');
});

test('fonte que não devolve página não derruba nada (fetchPage null → [])', async () => {
  const fetchPage = async () => null;
  assert.deepEqual(await apostasePalpitesSource.fetchSlips({ now: NOW, fetchPage }), []);
  assert.deepEqual(await aposta10Source.fetchSlips({ now: NOW, fetchPage: async () => '<html>Blog sem post do dia</html>' }), []);
});

// ===========================================================================
group('Bilhetes › parsers contra HTML salvo (sem rede)');
// ===========================================================================
test('apostasepalpites: 12 bilhetes, odd total, dia, hora e odd por perna no texto', () => {
  const slips = parseApostasePalpites(fixture('apostasepalpites.html'), NOW);
  assert.equal(slips.length, 12);
  const bragantino = slips.find((s) => s.title.startsWith('Bragantino x Bahia'))!;
  assert.equal(bragantino.totalOddMilli, 3100);
  assert.equal(bragantino.referenceDate, '2026-09-05');
  assert.equal(bragantino.legs.length, 3);
  assert.equal(bragantino.legs[0]!.kickoff, '2026-09-05T19:00:00.000Z'); // 16:00 em Brasília
  assert.equal(bragantino.legs[0]!.oddMilli, 1400);
  assert.equal(bragantino.legs[0]!.league, 'Brasileirão Série A');
  assert.ok(bragantino.legs.every((l) => l.homeName === 'Bragantino' && l.awayName === 'Bahia'));

  const multi = slips.find((s) => s.title.startsWith('Múltipla Premier League'))!;
  assert.equal(multi.totalOddMilli, 10_000);
  assert.equal(multi.legs.length, 4);
  assert.ok(new Set(multi.legs.map((l) => `${l.homeName}-${l.awayName}`)).size >= 3); // jogos diferentes
  assert.ok(slips.some((s) => s.referenceDate === '2026-09-06')); // bilhetes de "Amanhã"
  assert.ok(slips.every((s) => s.sourceUrl.includes('apostasepalpites.com.br')));
});

test('predictlix: 18 bilhetes em 6 blocos, odd por perna e total, hora e liga', () => {
  const slips = parsePredictlix(fixture('predictlix.html'), NOW);
  assert.equal(slips.length, 18);
  const first = slips[0]!;
  assert.equal(first.title, 'Favourites · Treble #1');
  assert.equal(first.totalOddMilli, 4630);
  assert.deepEqual(first.legs.map((l) => l.oddMilli), [1540, 1700, 1770]);
  assert.equal(first.legs[0]!.homeName, 'Levski Sofia');
  assert.equal(first.legs[0]!.awayName, 'CSKA 1948');
  assert.equal(first.legs[0]!.league, 'First League');
  assert.equal(first.legs[0]!.kickoff, '2026-09-05T18:15:00.000Z');
  assert.equal(first.legs[0]!.market, 'Levski Sofia to Win');
  // Produto das pernas bate com a odd total publicada (±1%).
  assert.ok(Math.abs(combinedOddMilli(first.legs)! - first.totalOddMilli!) < 50);
  // Recicla jogos: a deduplicação reduz.
  assert.ok(dedupeRawSlips(slips).length <= slips.length);
});

test('mightytips: bilhetes com data absoluta, "Our tip" e total de precisão', () => {
  const slips = parseMightyTips(fixture('mightytips.html'), NOW);
  assert.equal(slips.length, 3);
  const acca = slips[0]!;
  assert.equal(acca.referenceDate, '2026-09-05');
  assert.equal(acca.totalOddMilli, 8646);
  assert.equal(acca.legs.length, 4);
  assert.deepEqual([acca.legs[0]!.homeName, acca.legs[0]!.awayName, acca.legs[0]!.selection, acca.legs[0]!.oddMilli], ['AS Roma', 'Atalanta', '1', 1760]);
  assert.equal(acca.legs[0]!.kickoff, '2026-09-05T18:45:00.000Z');
  const mega = slips.find((s) => s.title === 'Mega Accumulator Tip')!;
  assert.equal(mega.legs.length, 6);
  assert.equal(mega.totalOddMilli, 70_150); // maior odd total entre as casas
});

test('apwin: hoje/amanhã com data no link, odd por perna e total', () => {
  const slips = parseApwin(fixture('apwin.html'), NOW);
  assert.ok(slips.length >= 2);
  const today = slips.find((s) => s.title.startsWith("Today's"))!;
  assert.equal(today.referenceDate, '2026-09-05');
  assert.equal(today.totalOddMilli, 2210);
  assert.equal(today.legs.length, 4);
  assert.deepEqual([today.legs[0]!.homeName, today.legs[0]!.awayName, today.legs[0]!.market, today.legs[0]!.oddMilli], ['Manchester City', 'Coventry City', 'Manchester City Win', 1170]);
  assert.equal(today.legs[0]!.league, 'Premier League');
  assert.equal(today.legs[0]!.kickoff, '2026-09-05T11:00:00.000Z');
  const tomorrow = slips.find((s) => s.title.startsWith("Tomorrow's"))!;
  assert.equal(tomorrow.referenceDate, '2026-09-06');
  assert.equal(tomorrow.legs.find((l) => l.homeName === 'Palermo')!.league, 'Serie B'); // italiana, não brasileira
});

test('aposta10: 3 bilhetes (Conservador/Moderado/Ousado) da página datada, sem odd por perna', () => {
  const slips = parseAposta10(fixture('aposta10.html'), NOW, 'https://aposta10.com/blog/bilhetes-prontos-nos-jogos-de-hoje-04092026');
  assert.equal(slips.length, 3);
  const conservador = slips[0]!;
  assert.equal(conservador.title, 'Bilhete Pronto Conservador');
  assert.equal(conservador.referenceDate, '2026-09-04');
  assert.equal(conservador.totalOddMilli, 2290);
  assert.equal(conservador.legs.length, 2);
  assert.deepEqual([conservador.legs[0]!.homeName, conservador.legs[0]!.awayName, conservador.legs[0]!.oddMilli], ['PSG', 'Monaco', null]);
  assert.equal(conservador.legs[0]!.kickoff, '2026-09-04T19:05:00.000Z'); // 16h05 em Brasília
  assert.equal(conservador.legs[0]!.league, 'Ligue 1');
  assert.equal(parseMarket(conservador.legs[0]!.market, conservador.legs[0]!.selection, 'PSG', 'Monaco').market, 'BTTS');
  assert.equal(parseMarket(conservador.legs[1]!.market, conservador.legs[1]!.selection, 'Lyon', 'Auxerre').selection, 'HOME');
});
