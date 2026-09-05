/**
 * Interpreta o texto do mercado publicado pela fonte nos termos do motor de
 * dicas (MarketKey + Selection + linha), em português e inglês.
 *
 *   "Cuiabá - Mais de 0,5 gols"            → OVER_0_5 / OVER (gols do time: não conferível → null)
 *   "Total de gols - Mais de 1,5"          → OVER_1_5 / OVER
 *   "CRB - Resultado Final"                → MATCH_WINNER / HOME ou AWAY (pelo nome)
 *   "Levski Sofia to Win" / "Our tip: 1"   → MATCH_WINNER
 *   "Double Chance: Brighton or Draw"      → DOUBLE_CHANCE / 1X ou X2
 *   "BTTS" / "Ambas marcam" / "X e Y marcarem gol" → BTTS / YES
 *
 * O que não é reconhecido volta com market null: a perna é exibida como a
 * fonte publicou, mas não é conferida nem liquidada automaticamente.
 */

import type { MarketKey, Selection } from '@/lib/sports/domain/models';
import { teamSimilarity } from '@/lib/sports/domain/names';
import type { ParsedMarket } from './types';

function norm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[✓✔⭐🔥📊]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lineOf(text: string): number | null {
  const match = /(\d+)[.,](\d)/.exec(text);
  if (!match) return null;
  return Number(`${match[1]}.${match[2]}`);
}

/** Qual lado o texto nomeia? Compara com mandante e visitante. */
function sideOf(text: string, home: string, away: string): 'HOME' | 'AWAY' | null {
  const candidate = text.trim();
  if (!candidate) return null;
  const sh = teamSimilarity(candidate, home);
  const sa = teamSimilarity(candidate, away);
  if (sh >= 0.75 && sh > sa) return 'HOME';
  if (sa >= 0.75 && sa > sh) return 'AWAY';
  // Nome contido no texto (ex.: "Brighton or Draw")
  const nh = norm(home);
  const na = norm(away);
  const nt = norm(candidate);
  const hitHome = nh.split(' ').some((token) => token.length > 3 && nt.includes(token));
  const hitAway = na.split(' ').some((token) => token.length > 3 && nt.includes(token));
  if (hitHome && !hitAway) return 'HOME';
  if (hitAway && !hitHome) return 'AWAY';
  return null;
}

function result(market: MarketKey | null, selection: Selection | null, line: number | null, label: string): ParsedMarket {
  return { market, selection, line, label };
}

export function parseMarket(marketText: string, selectionText: string, homeName: string, awayName: string): ParsedMarket {
  const m = marketText.trim();
  const s = selectionText.trim();
  // Muitas fontes repetem a seleção no mercado ("Our tip: 1" + "1"): não duplicar.
  const raw = !s || m.toLowerCase().includes(s.toLowerCase()) ? m : !m || s.toLowerCase().includes(m.toLowerCase()) ? s : `${m} ${s}`;
  const t = norm(raw);
  const teamPart = raw.split(/\s[-–—:]\s|:\s/)[0] ?? '';

  // --- Ambas marcam --------------------------------------------------------
  if (/\bbtts\b|both teams to score|ambas marcam|ambos (?:os times )?marcam|ambas as equipes marcam|marcarem gol|os dois marcam/.test(t)) {
    const no = /\bno\b|nao\b/.test(t) && !/yes|sim/.test(t);
    return result('BTTS', no ? 'NO' : 'YES', null, no ? 'Ambas marcam: não' : 'Ambas marcam');
  }

  // --- Dupla chance --------------------------------------------------------
  if (/double chance|dupla chance|or draw|ou empate|empate ou/.test(t)) {
    if (/\b1x\b/.test(t)) return result('DOUBLE_CHANCE', '1X', null, `${homeName} ou empate`);
    if (/\bx2\b/.test(t)) return result('DOUBLE_CHANCE', 'X2', null, `${awayName} ou empate`);
    if (/\b12\b/.test(t)) return result('DOUBLE_CHANCE', '12', null, 'Mandante ou visitante');
    const side = sideOf(raw.replace(/double chance|dupla chance|or draw|ou empate|empate ou/gi, ''), homeName, awayName);
    if (side === 'HOME') return result('DOUBLE_CHANCE', '1X', null, `${homeName} ou empate`);
    if (side === 'AWAY') return result('DOUBLE_CHANCE', 'X2', null, `${awayName} ou empate`);
    return result(null, null, null, raw);
  }

  // --- Gols: over/under ----------------------------------------------------
  const isOver = /\bover\b|mais de|acima de|\+\s?\d/.test(t);
  const isUnder = /\bunder\b|menos de|abaixo de/.test(t);
  if ((isOver || isUnder) && !/escanteio|corner|cartao|cartoes|card|chute|shot|falta|foul/.test(t)) {
    const line = lineOf(t);
    // "Cuiabá - Mais de 0,5 gols" é gol do TIME, não do jogo: sem mercado equivalente.
    const teamScoped = !/total|jogo|match|game|gols? no jogo/.test(t) && sideOf(teamPart, homeName, awayName) !== null && /gol|goal/.test(t);
    if (teamScoped) return result(null, null, line, raw);
    if (line === 0.5 && isOver) return result('OVER_0_5', 'OVER', 0.5, 'Mais de 0,5 gols');
    if (line === 1.5 && isOver) return result('OVER_1_5', 'OVER', 1.5, 'Mais de 1,5 gols');
    if (line === 2.5 && isOver) return result('OVER_2_5', 'OVER', 2.5, 'Mais de 2,5 gols');
    if (line === 2.5 && isUnder) return result('UNDER_2_5', 'UNDER', 2.5, 'Menos de 2,5 gols');
    return result(null, null, line, raw);
  }

  // --- Escanteios e cartões (linhas variadas) ------------------------------
  if (/escanteio|corner/.test(t)) {
    const line = lineOf(t);
    const over = /mais de|over|\+/.test(t);
    if (line !== null && !sideOf(teamPart, homeName, awayName)) {
      return result('CORNERS', over ? 'OVER' : 'UNDER', line, `Escanteios ${over ? 'mais de' : 'menos de'} ${line}`);
    }
    return result(null, null, line, raw);
  }
  if (/cartao|cartoes|\bcards?\b|booking/.test(t)) {
    const line = lineOf(t);
    const over = /mais de|over|\+/.test(t);
    if (line !== null && /total|jogo|match/.test(t)) {
      return result('CARDS', over ? 'OVER' : 'UNDER', line, `Cartões ${over ? 'mais de' : 'menos de'} ${line}`);
    }
    return result(null, null, line, raw);
  }

  // --- Empate ---------------------------------------------------------------
  if (/^(empate|draw|x)$/.test(t) || /\bempate\b(?!.*(ou|anula))/.test(t) && !/ou/.test(t)) {
    return result('MATCH_WINNER', 'DRAW', null, 'Empate');
  }

  // --- Resultado final / vitória -------------------------------------------
  const tipNumber = /^(?:our tip:?\s*)?([12x])$/.exec(t);
  if (tipNumber) {
    const code = tipNumber[1]!;
    if (code === '1') return result('MATCH_WINNER', 'HOME', null, `${homeName} vence`);
    if (code === '2') return result('MATCH_WINNER', 'AWAY', null, `${awayName} vence`);
    return result('MATCH_WINNER', 'DRAW', null, 'Empate');
  }
  if (/to win|\bwin\b|vence|vencer|vitoria|resultado final|match winner|ml\b|moneyline|ganha/.test(t)) {
    const cleaned = raw.replace(/to win|\bwins?\b|vencer?|vitoria(?: do)?|resultado final|match winner|ganha/gi, '');
    const side = sideOf(cleaned, homeName, awayName) ?? sideOf(teamPart, homeName, awayName);
    if (side === 'HOME') return result('MATCH_WINNER', 'HOME', null, `${homeName} vence`);
    if (side === 'AWAY') return result('MATCH_WINNER', 'AWAY', null, `${awayName} vence`);
    return result(null, null, null, raw);
  }

  return result(null, null, null, raw);
}

/**
 * Mercado complementar para devigar: as cotações que, junto com a seleção,
 * formam o livro completo daquele mercado. null quando não há complemento.
 */
export function marketBook(market: MarketKey, selection: Selection, line: number | null): { market: MarketKey; selection: Selection; line: number | null }[] | null {
  switch (market) {
    case 'OVER_2_5':
    case 'UNDER_2_5':
      return [
        { market: 'OVER_2_5', selection: 'OVER', line: 2.5 },
        { market: 'UNDER_2_5', selection: 'UNDER', line: 2.5 },
      ];
    case 'MATCH_WINNER':
      return [
        { market: 'MATCH_WINNER', selection: 'HOME', line: null },
        { market: 'MATCH_WINNER', selection: 'DRAW', line: null },
        { market: 'MATCH_WINNER', selection: 'AWAY', line: null },
      ];
    case 'BTTS':
      return [
        { market: 'BTTS', selection: 'YES', line: null },
        { market: 'BTTS', selection: 'NO', line: null },
      ];
    case 'DOUBLE_CHANCE': {
      const complement: Selection = selection === '1X' ? 'AWAY' : selection === 'X2' ? 'HOME' : 'DRAW';
      return [
        { market: 'DOUBLE_CHANCE', selection, line: null },
        { market: 'MATCH_WINNER', selection: complement, line: null },
      ];
    }
    case 'CORNERS':
    case 'CARDS':
      return line === null
        ? null
        : [
            { market, selection: 'OVER', line },
            { market, selection: 'UNDER', line },
          ];
    default:
      return null; // OVER_0_5 / OVER_1_5 / NEXT_GOAL: sem "under" nas cotações que guardamos
  }
}
