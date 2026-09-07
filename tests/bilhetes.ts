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
  slipProbability,
} from '../src/lib/bilhetes/domain/slip';
import { parseCallOdd, parseChannelCalls, parseUnits, scoreCalls } from '../src/lib/bilhetes/domain/calls';
import { buildConsensus, weightedRoiBps } from '../src/lib/bilhetes/domain/consensus';
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

// ===========================================================================
group('Bilhetes › chance estimada');
// ===========================================================================
/**
 * Ordenar por menor odd não é ordenar por maior chance: a odd implícita já vem
 * inflada pela margem, e numa múltipla a margem se acumula perna a perna.
 */

function probLeg(odd: number | null, real: number | null = null, margin: number | null = null) {
  return { oddMilli: odd, realOddMilli: real, marginBps: margin };
}

test('desconta a margem de cada perna antes de multiplicar', () => {
  // Duas pernas a 2,00 com 5% de margem cada.
  // p = (0,5 / 1,05)^2 = 0,2268
  const p = slipProbability({
    informedOddMilli: 4_000,
    legsCount: 2,
    legs: [probLeg(2_000, 2_000, 500), probLeg(2_000, 2_000, 500)],
  })!;
  assert.equal(p.basis, 'CONFERIDA');
  assert.equal(p.devigedLegs, 2);
  assert.ok(Math.abs(p.probabilityBps - 2_268) <= 2, `veio ${p.probabilityBps}`);
  // A odd implícita crua diria 25%: a margem acumulada come quase 2,3 pontos.
  assert.ok(p.probabilityBps < 2_500);
});

test('mesma odd e mais pernas significa menos chance', () => {
  // As duas múltiplas pagam 10,00. A de 8 pernas embute muito mais margem.
  const tresPernas = slipProbability({ informedOddMilli: 10_000, legsCount: 3, legs: [] })!;
  const oitoPernas = slipProbability({ informedOddMilli: 10_000, legsCount: 8, legs: [] })!;

  assert.equal(tresPernas.basis, 'INFORMADA');
  assert.ok(
    tresPernas.probabilityBps > oitoPernas.probabilityBps,
    `3 pernas (${tresPernas.probabilityBps}) deveria superar 8 pernas (${oitoPernas.probabilityBps})`,
  );
  // Ambas ficam abaixo dos 10% que a odd crua sugeriria.
  assert.ok(tresPernas.probabilityBps < 1_000 && oitoPernas.probabilityBps < 1_000);
});

test('a odd real conferida tem prioridade sobre a publicada pela fonte', () => {
  // A fonte diz 2,50, mas a odd real é 2,00: a chance segue a real.
  const p = slipProbability({
    informedOddMilli: 2_500,
    legsCount: 1,
    legs: [probLeg(2_500, 2_000, 0)],
  })!;
  assert.equal(p.basis, 'CONFERIDA');
  assert.ok(Math.abs(p.probabilityBps - 5_000) <= 2, `veio ${p.probabilityBps}`);
});

test('perna sem margem medida usa a margem assumida e marca como PARCIAL', () => {
  const p = slipProbability({
    informedOddMilli: 4_000,
    legsCount: 2,
    legs: [probLeg(2_000, 2_000, 500), probLeg(2_000, 2_000, null)],
  })!;
  assert.equal(p.basis, 'PARCIAL');
  assert.equal(p.devigedLegs, 1);
  assert.equal(p.legs, 2);
});

test('sem odd real, a odd publicada por perna ainda serve', () => {
  const p = slipProbability({
    informedOddMilli: 4_000,
    legsCount: 2,
    legs: [probLeg(2_000), probLeg(2_000)],
  })!;
  assert.equal(p.basis, 'PARCIAL');
  assert.equal(p.devigedLegs, 0);
});

test('sem preço nenhum não há chance a estimar', () => {
  assert.equal(slipProbability({ informedOddMilli: null, legsCount: 3, legs: [] }), null);
  assert.equal(
    slipProbability({ informedOddMilli: null, legsCount: 2, legs: [probLeg(null), probLeg(null)] }),
    null,
  );
});

test('a chance nunca escapa de 0% a 100%', () => {
  const quaseCerto = slipProbability({
    informedOddMilli: 1_001,
    legsCount: 1,
    legs: [probLeg(1_001, 1_001, 0)],
  })!;
  assert.ok(quaseCerto.probabilityBps <= 10_000 && quaseCerto.probabilityBps >= 0);

  const improvavel = slipProbability({ informedOddMilli: 500_000, legsCount: 10, legs: [] })!;
  assert.ok(improvavel.probabilityBps >= 0);
});

test('ordenar por chance difere de ordenar por odd', () => {
  // Bilhete A: 3 pernas a 12,00. Bilhete B: 8 pernas a 10,00.
  // Por odd crescente, B viria primeiro. Por chance, A é o melhor.
  const a = slipProbability({ informedOddMilli: 12_000, legsCount: 3, legs: [] })!;
  const b = slipProbability({ informedOddMilli: 10_000, legsCount: 8, legs: [] })!;
  assert.ok(12_000 > 10_000, 'A tem odd maior');
  assert.ok(a.probabilityBps > b.probabilityBps, 'mas A tem mais chance de bater');
});

// ===========================================================================
group('Bilhetes › calls de canal do Telegram');
// ===========================================================================
/**
 * Todos os testes rodam sobre HTML salvo em tests/fixtures/bilhetes/.
 * Nenhum toca a rede.
 */

const LACASA = fixture('canaldolacasa.html');
const TIPSBRASIL = fixture('tipsbrasil.html');

test('lê as calls do La Casa com seleção, odd, casa, unidade e resultado', () => {
  const calls = parseChannelCalls(LACASA, 'canaldolacasa');
  assert.ok(calls.length >= 8, `esperava ao menos 8 calls, veio ${calls.length}`);

  const city = calls.find((c) => c.selection.includes('Gols City'));
  assert.ok(city, 'não achou a call "+1.5 Gols City"');
  assert.equal(city!.oddMilli, 1_640);
  assert.equal(city!.unitsCentis, 100);
  assert.equal(city!.bookmaker, 'BetMGM');
  assert.equal(city!.result, 'RED');
  assert.equal(city!.teamHint, 'City');
  assert.equal(city!.postUrl, `https://t.me/canaldolacasa/${city!.postId}`);
});

test('reconhece green, red e reembolso pelo emoji', () => {
  const calls = parseChannelCalls(LACASA, 'canaldolacasa');
  const porResultado = (r: string) => calls.filter((c) => c.result === r).length;
  assert.ok(porResultado('GREEN') >= 2, 'esperava greens');
  assert.ok(porResultado('RED') >= 2, 'esperava reds');
  assert.ok(porResultado('VOID') >= 1, 'esperava ao menos um reembolso (🔄)');
});

test('lê o Tips Brasil, que escreve "1u" e marca o resultado na linha da odd', () => {
  const calls = parseChannelCalls(TIPSBRASIL, 'Tipsbrasiloficial');
  assert.ok(calls.length >= 3, `esperava ao menos 3 calls, veio ${calls.length}`);
  for (const call of calls) {
    assert.equal(call.unitsCentis, 100, 'todas são de 1 unidade');
    assert.ok(call.oddMilli !== null && call.oddMilli > 1_000);
  }
  assert.ok(calls.some((c) => c.result === 'GREEN'), 'o ✅ na linha da odd precisa virar GREEN');
});

test('a seleção sai limpa de emoji, bandeira e caractere invisível', () => {
  for (const [html, canal] of [[LACASA, 'canaldolacasa'], [TIPSBRASIL, 'Tipsbrasiloficial']] as const) {
    for (const call of parseChannelCalls(html, canal)) {
      assert.ok(call.selection.length > 0, 'seleção vazia');
      assert.equal(call.selection, call.selection.trim());
      assert.ok(
        !/[\u{1F300}-\u{1FAFF}\u{E0000}-\u{E007F}\u{FE0F}]/u.test(call.selection),
        `sobrou caractere invisível ou emoji em "${call.selection}"`,
      );
    }
  }
});

test('propaganda de casa não vira call', () => {
  const calls = parseChannelCalls(LACASA, 'canaldolacasa');
  // "🚨 1 Gol na Frente, TÁ PAGO! ⚡️ Odds @2.00 na SuperBet 💵 Limite Máximo:
  // R$100,00" tem odd, mas é promoção: não declara unidade nem resultado.
  assert.equal(
    calls.some((c) => /Gol na Frente|PAGO|Limite/i.test(c.rawText) && /Limite Máximo/i.test(c.rawText)),
    false,
    'a promoção de cadastro entrou como call',
  );
});

test('mensagem sem odd nunca é call', () => {
  for (const [html, canal] of [[LACASA, 'canaldolacasa'], [TIPSBRASIL, 'Tipsbrasiloficial']] as const) {
    for (const call of parseChannelCalls(html, canal)) {
      assert.ok(call.oddMilli !== null, 'call sem odd não deveria existir');
    }
  }
});

test('cada post aparece uma vez só', () => {
  const calls = parseChannelCalls(LACASA, 'canaldolacasa');
  assert.equal(new Set(calls.map((c) => c.postId)).size, calls.length);
});

test('unidades: "1 Unidade", "1u", "0,5u" e "2 un"', () => {
  assert.equal(parseUnits('💵 1 Unidade'), 100);
  assert.equal(parseUnits('0,5 unidades'), 50);
  assert.equal(parseUnits('+2,5 Gols @ 1.67 | 1u ✅'), 100);
  assert.equal(parseUnits('odd 1.90 | 0,5u'), 50);
  assert.equal(parseUnits('| 2 un'), 200);
  assert.equal(parseUnits('sem unidade nenhuma aqui'), null);
});

test('odd aceita ponto, vírgula e espaço depois do arroba', () => {
  assert.equal(parseCallOdd('Odds @1.65 na Betano'), 1_650);
  assert.equal(parseCallOdd('@2,00'), 2_000);
  assert.equal(parseCallOdd('Odd @ 1.70'), 1_700);
  assert.equal(parseCallOdd('sem odd'), null);
  assert.equal(parseCallOdd('@1.00'), null, 'odd 1,00 não paga nada');
});

test('placar: green paga odd−1, red perde a stake, reembolso não conta', () => {
  const score = scoreCalls([
    { result: 'GREEN', oddMilli: 2_000, unitsCentis: 100 }, // +1,00u
    { result: 'RED', oddMilli: 1_500, unitsCentis: 100 }, //   −1,00u
    { result: 'VOID', oddMilli: 1_800, unitsCentis: 100 }, //   0, fora da conta
    { result: null, oddMilli: 1_700, unitsCentis: 100 }, //     em aberto
  ]);
  assert.equal(score.calls, 4);
  assert.equal(score.settled, 2);
  assert.equal(score.voids, 1);
  assert.equal(score.pending, 1);
  assert.equal(score.stakedCentis, 200, 'reembolso e pendente não entram no arriscado');
  assert.equal(score.profitCentis, 0);
  assert.equal(score.roiBps, 0);
  assert.equal(score.hitRateBps, 5_000);
  assert.equal(score.profitFactorBps, 10_000, 'ganhou 1u e perdeu 1u: profit factor 1,00');
});

test('placar sem amostra devolve null em vez de zero', () => {
  const vazio = scoreCalls([]);
  assert.equal(vazio.hitRateBps, null);
  assert.equal(vazio.roiBps, null);
  assert.equal(vazio.averageOddMilli, null);
  assert.equal(vazio.profitFactorBps, null);
});

test('taxa de acerto alta com odd baixa pode dar prejuízo', () => {
  // 3 greens em odd 1,20 e 1 red: 75% de acerto, ROI negativo.
  const score = scoreCalls([
    { result: 'GREEN', oddMilli: 1_200, unitsCentis: 100 },
    { result: 'GREEN', oddMilli: 1_200, unitsCentis: 100 },
    { result: 'GREEN', oddMilli: 1_200, unitsCentis: 100 },
    { result: 'RED', oddMilli: 1_200, unitsCentis: 100 },
  ]);
  assert.equal(score.hitRateBps, 7_500);
  assert.ok(score.roiBps !== null && score.roiBps < 0, 'ROI deveria ser negativo apesar dos 75%');
});

test('unidade não declarada conta como uma no placar', () => {
  const score = scoreCalls([{ result: 'GREEN', oddMilli: 2_000, unitsCentis: null }]);
  assert.equal(score.stakedCentis, 100);
  assert.equal(score.profitCentis, 100);
});

// ===========================================================================
group('Bilhetes › consenso entre fontes');
// ===========================================================================

function pick(
  fixtureId: string,
  market: string,
  selection: string,
  sourceSlug: string,
  kind: 'SLIP' | 'MODEL' = 'SLIP',
  line: number | null = null,
) {
  return {
    fixtureId,
    market,
    selection,
    line,
    sourceSlug,
    sourceName: sourceSlug,
    kind,
    publishedOddMilli: null,
  } as Parameters<typeof buildConsensus>[0][number];
}

test('agrupa a mesma seleção apontada por fontes diferentes', () => {
  const entradas = buildConsensus([
    pick('jogo1', 'OVER_2_5', 'OVER', 'aposta10', 'SLIP', 2.5),
    pick('jogo1', 'OVER_2_5', 'OVER', 'mightytips', 'SLIP', 2.5),
    pick('jogo1', 'MATCH_WINNER', 'HOME', 'aposta10'),
  ]);
  const over = entradas.find((e) => e.market === 'OVER_2_5')!;
  assert.equal(over.sourceCount, 2);
  assert.deepEqual(over.sources.map((s) => s.slug).sort(), ['aposta10', 'mightytips']);
  assert.equal(entradas.find((e) => e.market === 'MATCH_WINNER')!.sourceCount, 1);
});

test('a mesma fonte apontando duas vezes conta uma só', () => {
  const [entrada] = buildConsensus([
    pick('jogo1', 'BTTS', 'YES', 'predictlix'),
    pick('jogo1', 'BTTS', 'YES', 'predictlix'),
  ]);
  assert.equal(entrada!.sourceCount, 1);
  assert.equal(entrada!.sources.length, 1);
});

test('linhas diferentes do mesmo mercado não se misturam', () => {
  const entradas = buildConsensus([
    pick('jogo1', 'CORNERS', 'OVER', 'a', 'SLIP', 8.5),
    pick('jogo1', 'CORNERS', 'OVER', 'b', 'SLIP', 9.5),
  ]);
  assert.equal(entradas.length, 2, 'over 8.5 e over 9.5 são apostas diferentes');
});

test('o modelo do app é reconhecido e pesa mais que outra fonte', () => {
  const comModelo = buildConsensus([
    pick('jogo1', 'OVER_2_5', 'OVER', 'aposta10'),
    pick('jogo1', 'OVER_2_5', 'OVER', 'modelo', 'MODEL'),
  ])[0]!;
  const doisSites = buildConsensus([
    pick('jogo2', 'OVER_2_5', 'OVER', 'aposta10'),
    pick('jogo2', 'OVER_2_5', 'OVER', 'mightytips'),
  ])[0]!;

  assert.equal(comModelo.modelBacked, true);
  assert.equal(doisSites.modelBacked, false);
  assert.ok(
    comModelo.score > doisSites.score,
    `modelo + site (${comModelo.score}) deveria valer mais que site + site (${doisSites.score})`,
  );
});

test('mais fontes concordando aumenta a nota', () => {
  const nota = (n: number) =>
    buildConsensus(
      Array.from({ length: n }, (_, i) => pick('jogo1', 'BTTS', 'YES', `fonte${i}`)),
    )[0]!.score;
  assert.ok(nota(1) < nota(2), 'duas fontes > uma');
  assert.ok(nota(2) < nota(3), 'três fontes > duas');
  assert.ok(nota(4) >= nota(5) - 1, 'a partir de quatro a concordância satura');
});

test('value entra na nota, e value negativo não pontua', () => {
  const chave = 'jogo1|OVER_2_5|OVER|';
  const base = [pick('jogo1', 'OVER_2_5', 'OVER', 'a'), pick('jogo1', 'OVER_2_5', 'OVER', 'b')];

  const bom = buildConsensus(base, {
    marketOdds: new Map([[chave, { oddMilli: 2_200, bookmaker: 'Bet365' }]]),
    modelProbabilities: new Map([[chave, 5_000]]), // odd justa 2,00 → value +10%
  })[0]!;
  const ruim = buildConsensus(base, {
    marketOdds: new Map([[chave, { oddMilli: 1_800, bookmaker: 'Bet365' }]]),
    modelProbabilities: new Map([[chave, 5_000]]), // value −10%
  })[0]!;

  assert.ok(bom.valueBps !== null && bom.valueBps > 0);
  assert.ok(ruim.valueBps !== null && ruim.valueBps < 0);
  assert.ok(bom.score > ruim.score, 'value positivo tem de valer mais que negativo');
});

test('histórico das fontes é ponderado pelo tamanho da amostra', () => {
  const records = new Map([
    // Fonte com muita amostra e yield ruim domina a média.
    ['grande', { slug: 'grande', roiBps: -800, settled: 400 }],
    ['pequena', { slug: 'pequena', roiBps: 2_000, settled: 5 }],
  ]);
  const media = weightedRoiBps(['grande', 'pequena'], records)!;
  assert.ok(media < 0, `esperava média negativa, veio ${media}`);
  assert.ok(media > -800, 'a fonte pequena ainda puxa um pouco para cima');
});

test('fonte sem histórico não entra na média em vez de virar zero', () => {
  const records = new Map([['boa', { slug: 'boa', roiBps: 1_000, settled: 50 }]]);
  assert.equal(weightedRoiBps(['boa', 'desconhecida'], records), 1_000);
  assert.equal(weightedRoiBps(['desconhecida'], records), null);
});

test('entrada sem nada a favor tira nota baixa', () => {
  const [solo] = buildConsensus([pick('jogo1', 'BTTS', 'YES', 'a')]);
  assert.ok(solo!.score <= 15, `uma fonte, sem modelo, sem value e sem histórico: ${solo!.score}`);
});

test('a ordenação põe a maior nota primeiro', () => {
  const entradas = buildConsensus([
    pick('jogoFraco', 'BTTS', 'YES', 'a'),
    pick('jogoForte', 'OVER_2_5', 'OVER', 'a'),
    pick('jogoForte', 'OVER_2_5', 'OVER', 'b'),
    pick('jogoForte', 'OVER_2_5', 'OVER', 'modelo', 'MODEL'),
  ]);
  assert.equal(entradas[0]!.fixtureId, 'jogoForte');
  assert.ok(entradas[0]!.score > entradas[entradas.length - 1]!.score);
});

// ===========================================================================
group('Bilhetes › viés da apuração incompleta');
// ===========================================================================
/**
 * Um bilhete fecha como RED assim que UMA perna perde, mas só fecha como
 * GREEN quando TODAS resolvem. Quando parte das pernas não pode ser apurada —
 * jogo fora das competições acompanhadas, mercado que o leitor não reconhece —
 * os RED continuam fechando e os GREEN ficam presos.
 *
 * Medido no banco de produção: 46 bilhetes fecharam RED, 1 fechou GREEN, e 29
 * tinham perna vencedora, nenhuma perdedora, e estavam travados esperando uma
 * perna que nunca resolveria. O placar exibia −93,9% como se fosse desempenho
 * da fonte.
 *
 * Estes testes fixam as duas metades da regra: a liquidação continua certa, e
 * o que entra na estatística é só o que foi apurado por inteiro.
 */

test('uma perna perdida decide o bilhete mesmo com pernas por apurar', () => {
  const parcial = settleSlip(
    [
      { result: 'GREEN', oddMilli: 1_800, realOddMilli: null, unresolvable: false },
      { result: 'RED', oddMilli: 2_000, realOddMilli: null, unresolvable: false },
      { result: null, oddMilli: 1_500, realOddMilli: null, unresolvable: true },
    ],
    5_400,
  );
  assert.equal(parcial.status, 'SETTLED');
  assert.equal(parcial.result, 'RED', 'uma perna perdida derruba o bilhete inteiro');
});

test('sem perna perdida, perna por apurar impede o green', () => {
  const travado = settleSlip(
    [
      { result: 'GREEN', oddMilli: 1_800, realOddMilli: null, unresolvable: false },
      { result: null, oddMilli: 1_500, realOddMilli: null, unresolvable: true },
    ],
    2_700,
  );
  assert.notEqual(travado.result, 'GREEN', 'não dá para afirmar green sem apurar todas');
  assert.notEqual(travado.status, 'SETTLED');
});

test('a assimetria é real: é isto que torna a amostra incompleta enviesada', () => {
  // Mesmo bilhete, mesma perna pendente. Só muda o resultado da segunda perna.
  const pernaPendente = { result: null, oddMilli: 1_500, realOddMilli: null, unresolvable: true } as const;

  const comRed = settleSlip(
    [{ result: 'RED', oddMilli: 1_800, realOddMilli: null, unresolvable: false }, pernaPendente],
    2_700,
  );
  const comGreen = settleSlip(
    [{ result: 'GREEN', oddMilli: 1_800, realOddMilli: null, unresolvable: false }, pernaPendente],
    2_700,
  );

  assert.equal(comRed.status, 'SETTLED', 'o lado perdedor fecha');
  assert.notEqual(comGreen.status, 'SETTLED', 'o lado vencedor não fecha');
  // Contar os dois na mesma estatística registraria a derrota e perderia a
  // vitória. Por isso o placar só considera bilhete apurado por inteiro.
});

test('bilhete com todas as pernas apuradas fecha green e entra na conta', () => {
  const completo = settleSlip(
    [
      { result: 'GREEN', oddMilli: 1_800, realOddMilli: null, unresolvable: false },
      { result: 'GREEN', oddMilli: 1_500, realOddMilli: null, unresolvable: false },
    ],
    2_700,
  );
  assert.equal(completo.status, 'SETTLED');
  assert.equal(completo.result, 'GREEN');
});

test('perna anulada sai da conta e mantém o bilhete vivo', () => {
  const comPush = settleSlip(
    [
      { result: 'GREEN', oddMilli: 2_000, realOddMilli: null, unresolvable: false },
      { result: 'PUSH', oddMilli: 1_500, realOddMilli: null, unresolvable: false },
    ],
    3_000,
  );
  assert.equal(comPush.status, 'SETTLED');
  assert.equal(comPush.result, 'GREEN');
  assert.equal(comPush.effectiveOddMilli, 2_000, 'a perna anulada sai da odd efetiva');
});
