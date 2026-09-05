/**
 * CALLS DE CANAL DO TELEGRAM.
 *
 * Canal público do Telegram tem uma prévia HTML aberta em `t.me/s/<canal>`,
 * servida sem login e sem chave. É a mesma natureza das outras fontes de
 * bilhete: página pública, lida uma vez, com crédito e link no card.
 *
 * FORMATO DO POST
 *
 *   🏦 +2.0 Gols ✅
 *   💵 1 Unidade
 *   ➡️ Odds @1.65 na Betano
 *   🔗 LINK DIRETO DA BETANO
 *   🔞 Ministério da Fazenda adverte... #PUBLI
 *
 * A seleção vem dentro de <b>, o resultado é um emoji na mesma linha, e o
 * canal EDITA o post depois para marcar ✅ / ❌ / 🔄. Por isso a coleta precisa
 * atualizar calls já guardadas, não só inserir novas.
 *
 * O QUE NÃO DÁ PARA EXTRAIR
 *
 * A partida não está no texto. "+2.0 Gols" não diz de qual jogo; isso vive na
 * imagem do cupom e atrás do link de afiliado. Às vezes escapa um time
 * ("+1.5 Gols City", "Bayern AH -1.0"), e nesse caso guardamos a pista — mas
 * na maioria não há como identificar o confronto.
 *
 * A consequência é assumida e precisa ficar visível na interface: sem partida,
 * não há como conferir a odd contra o mercado, calcular margem, nem liquidar
 * pelo placar real. O que sobra — e é o que interessa — é o placar honesto do
 * canal, calculado com a odd que ELE publicou e o resultado que ELE marcou.
 *
 * Módulo puro: recebe HTML, devolve dados. Sem rede, sem banco, sem relógio.
 */

import { decodeEntities, stripTags } from './html';

export type CallResult = 'GREEN' | 'RED' | 'VOID';

export interface RawCall {
  /** Id da mensagem no canal ("53927"). Único dentro da fonte. */
  postId: string;
  postUrl: string;
  /** ISO 8601 do envio, direto do atributo datetime do Telegram. */
  postedAt: string;
  /** Texto da seleção, como publicado ("+2.0 Gols", "Criada Al Hilal"). */
  selection: string;
  /** Unidades arriscadas × 100 (1 unidade = 100). null se não declarado. */
  unitsCentis: number | null;
  oddMilli: number | null;
  bookmaker: string | null;
  result: CallResult | null;
  /** Time citado na seleção, quando dá para reconhecer. Só uma pista. */
  teamHint: string | null;
  /** Texto completo, para auditoria e para reprocessar sem baixar de novo. */
  rawText: string;
}

/**
 * Emoji de resultado.
 *
 * ✅ e ✔️ marcam green; ❌ e ⛔ marcam red; 🔄 é reembolso (aposta anulada,
 * devolve a stake). O canal às vezes dobra o emoji ("✅✅") em call de duas
 * seleções — não muda o resultado, só a ênfase.
 */
const RESULT_EMOJI: readonly { emoji: string; result: CallResult }[] = [
  { emoji: '✅', result: 'GREEN' },
  { emoji: '✔️', result: 'GREEN' },
  { emoji: '☑️', result: 'GREEN' },
  { emoji: '❌', result: 'RED' },
  { emoji: '⛔', result: 'RED' },
  { emoji: '🔄', result: 'VOID' },
];

/** Casas reconhecidas. Fora desta lista, o nome é guardado como veio. */
const KNOWN_BOOKMAKERS: readonly string[] = [
  'Bet365', 'Betano', 'BetMGM', 'Novibet', 'Superbet', 'Betfair', 'Betnacional',
  'Estrela Bet', 'EstrelaBet', 'KTO', 'Sportingbet', 'Betsson', 'Vbet', 'Pinnacle',
  'Stake', 'Blaze', 'Betfast', 'Esportes da Sorte', 'Bet7k', 'McGames',
];

/**
 * Times cujo apelido aparece solto na seleção. É só uma pista exibida ao lado
 * da call; nunca é usada para afirmar qual foi a partida.
 */
const TEAM_HINTS: readonly string[] = [
  'City', 'United', 'Bayern', 'Real Madrid', 'Barcelona', 'Liverpool', 'Arsenal',
  'Chelsea', 'Tottenham', 'PSG', 'Juventus', 'Inter', 'Milan', 'Atlético',
  'Al Hilal', 'Al Nassr', 'Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo',
  'Santos', 'Grêmio', 'Internacional', 'Cruzeiro', 'Atlético-MG', 'Botafogo',
  'Fluminense', 'Vasco', 'Bahia', 'Fortaleza', 'Porto', 'Benfica', 'Sporting',
];

/** Blocos de mensagem da prévia pública, do mais antigo para o mais recente. */
export function splitMessages(html: string): { postId: string; block: string }[] {
  const messages: { postId: string; block: string }[] = [];
  // Cada mensagem abre com data-post="canal/ID" no wrapper.
  const re = /data-post="([^"/]+)\/(\d+)"/g;
  const marks: { postId: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    marks.push({ postId: match[2] as string, index: match.index });
  }
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i]!.index;
    const end = i + 1 < marks.length ? marks[i + 1]!.index : html.length;
    messages.push({ postId: marks[i]!.postId, block: html.slice(start, end) });
  }
  return messages;
}

/** Texto da mensagem, com <br> virando quebra de linha e emoji preservado. */
export function messageText(block: string): string {
  const match = block.match(
    /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  );
  if (!match) return '';
  return decodeEntities(stripTags(match[1]!.replace(/<br\s*\/?>/gi, '\n')))
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function messageDate(block: string): string | null {
  const match = block.match(/<time[^>]+datetime="([^"]+)"/);
  if (!match) return null;
  const date = new Date(match[1] as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Odd decimal declarada: "Odds @1.65", "@2,00", "Odd @ 1.70". */
export function parseCallOdd(text: string): number | null {
  const match = text.match(/@\s*(\d{1,2})[.,](\d{1,3})/);
  if (!match) return null;
  const milli = Math.round(Number(`${match[1]}.${match[2]}`) * 1000);
  return milli > 1000 && milli <= 100_000 ? milli : null;
}

/**
 * Unidades arriscadas, em centésimos.
 *
 * Cada canal escreve à sua maneira e todas significam a mesma coisa:
 *   "1 Unidade" / "0,5 unidades"   → La Casa de Tips
 *   "1u" / "0,5u" / "2 un"         → Tips Brasil e a maioria dos tipsters
 *
 * O "u" exige fronteira de palavra à esquerda para não capturar o final de
 * outra palavra, e a lista de sufixos é fechada para não confundir com
 * qualquer letra colada num número.
 */
export function parseUnits(text: string): number | null {
  const match = text.match(/(?:^|[\s|·>])(\d+(?:[.,]\d+)?)\s*(?:unidades?|un|u)\b/i);
  if (!match) return null;
  const value = Number((match[1] as string).replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return Math.round(value * 100);
}

export function parseBookmaker(text: string): string | null {
  for (const name of KNOWN_BOOKMAKERS) {
    if (new RegExp(`\\bna\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return name;
    }
  }
  const generic = text.match(/\bna\s+([A-Z][A-Za-z0-9]{2,20})\b/);
  return generic ? (generic[1] as string) : null;
}

/**
 * Resultado da call.
 *
 * A marcação fica onde o canal a edita, e isso varia: o La Casa põe na linha
 * da seleção ("+2.0 Gols ✅"), o Tips Brasil põe na linha da odd
 * ("+2,5 Gols @ 1.67 | 1u ✅"). Procuramos nas duas.
 *
 * O que NÃO entra é o resto do texto: o aviso do Ministério da Fazenda, a
 * chamada de cadastro e os contadores de reação também trazem emoji, e um ❌
 * solto lá viraria um resultado inventado.
 */
export function parseCallResult(...lines: readonly string[]): CallResult | null {
  for (const line of lines) {
    for (const { emoji, result } of RESULT_EMOJI) {
      if (line.includes(emoji)) return result;
    }
  }
  return null;
}

/** Linha que declara a odd — é onde parte dos canais marca o resultado. */
function oddLine(text: string): string {
  return text.split('\n').find((line) => /@\s*\d{1,2}[.,]\d/.test(line)) ?? '';
}

export function parseTeamHint(selection: string): string | null {
  for (const team of TEAM_HINTS) {
    if (new RegExp(`\\b${team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(selection)) {
      return team;
    }
  }
  return null;
}

/**
 * Retira emoji e espaços de sobra, deixando só o texto da seleção.
 *
 * Usa propriedades Unicode em vez de faixas escritas à mão: bandeira, símbolo
 * e pictograma somem, letras e números de qualquer alfabeto ficam.
 */
export function cleanSelection(line: string): string {
  return line
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu, ' ')
    // Bandeiras regionais (🇧🇷) e as de subdivisão (🏴󠁧󠁢󠁥󠁮󠁧󠁿), estas últimas
    // montadas com caracteres de tag INVISÍVEIS que sobrariam como lixo.
    .replace(/[\u{1F1E6}-\u{1F1FF}]|[\u{E0000}-\u{E007F}]/gu, ' ')
    // Seletores de variação e junção de largura zero.
    .replace(/[\u{FE00}-\u{FE0F}\u{200B}-\u{200D}\u{2060}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Uma mensagem é call quando declara uma odd E (unidade OU resultado marcado).
 *
 * A odd sozinha não basta: o canal também publica promoção de casa com odd
 * ("1 Gol na Frente, TÁ PAGO! Odds @2.00 na SuperBet · Limite Máximo:
 * R$100,00"), e isso não é palpite — contá-la sujaria o placar. Exigir unidade
 * OU resultado separa as duas coisas: promoção não declara unidade e nunca é
 * marcada com ✅/❌.
 *
 * O par também deixa entrar a call que o canal publica sem declarar unidade
 * (o "Bilhetinho de Hoje"), assim que ela recebe a marcação de resultado.
 *
 * O resto do canal fica de fora naturalmente, por não ter odd: vídeos,
 * "VAMOS CHAMAR ESSE SÃO PAULO!" e as mensagens soltas de resultado.
 */
export function parseCall(postId: string, block: string, channel: string): RawCall | null {
  const text = messageText(block);
  if (!text) return null;

  // Mensagem encaminhada/citada repete o texto da original: o bloco de citação
  // apareceria como uma call duplicada, com o resultado ainda por marcar.
  if (/tgme_widget_message_reply/.test(block)) return null;

  const oddMilli = parseCallOdd(text);
  if (oddMilli === null) return null;

  const unitsCentis = parseUnits(text);
  const firstLineRaw = text.split('\n').find((line) => line.trim() !== '') ?? '';
  const earlyResult = parseCallResult(firstLineRaw, oddLine(text));
  if (unitsCentis === null && earlyResult === null) return null;

  const lines = text.split('\n').filter((line) => line.trim() !== '');
  const firstLine = lines[0] ?? '';
  const selection = cleanSelection(firstLine);
  if (selection.length < 2 || selection.length > 200) return null;

  const postedAt = messageDate(block);
  if (!postedAt) return null;

  return {
    postId,
    postUrl: `https://t.me/${channel}/${postId}`,
    postedAt,
    selection,
    unitsCentis,
    oddMilli,
    bookmaker: parseBookmaker(text),
    result: earlyResult,
    teamHint: parseTeamHint(selection),
    rawText: text.slice(0, 2_000),
  };
}

/** Todas as calls de uma página de prévia, sem duplicar post. */
export function parseChannelCalls(html: string, channel: string): RawCall[] {
  const seen = new Set<string>();
  const calls: RawCall[] = [];
  for (const { postId, block } of splitMessages(html)) {
    if (seen.has(postId)) continue;
    const call = parseCall(postId, block, channel);
    if (call) {
      seen.add(postId);
      calls.push(call);
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Placar do canal
// ---------------------------------------------------------------------------

export interface CallScore {
  calls: number;
  settled: number;
  greens: number;
  reds: number;
  voids: number;
  pending: number;
  /** Taxa de acerto sobre as calls resolvidas, em bps. null sem amostra. */
  hitRateBps: number | null;
  /** Unidades arriscadas e lucro, ambos ×100. */
  stakedCentis: number;
  profitCentis: number;
  /** Lucro / arriscado, em bps. É o ROI. null sem amostra. */
  roiBps: number | null;
  /** Odd média das calls resolvidas (milli). null sem amostra. */
  averageOddMilli: number | null;
  /** Ganho bruto ÷ perda bruta. null quando não houve perda. */
  profitFactorBps: number | null;
}

/**
 * Placar em unidades, não em reais: o canal publica "1 Unidade" e cada um
 * decide quanto vale a unidade dele. Reembolso (VOID) devolve a stake, então
 * não conta como acerto nem como erro — entra no total, fora da taxa.
 */
export function scoreCalls(
  calls: readonly { result: CallResult | null; oddMilli: number | null; unitsCentis: number | null }[],
): CallScore {
  let greens = 0;
  let reds = 0;
  let voids = 0;
  let pending = 0;
  let stakedCentis = 0;
  let profitCentis = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let oddSum = 0;
  let oddCount = 0;

  for (const call of calls) {
    if (call.result === null) {
      pending += 1;
      continue;
    }
    const units = call.unitsCentis ?? 100;
    const odd = call.oddMilli;
    if (call.result === 'VOID') {
      voids += 1;
      continue;
    }
    if (odd === null) {
      pending += 1;
      continue;
    }
    stakedCentis += units;
    oddSum += odd;
    oddCount += 1;
    if (call.result === 'GREEN') {
      greens += 1;
      const gain = Math.round((units * (odd - 1000)) / 1000);
      profitCentis += gain;
      grossWin += gain;
    } else {
      reds += 1;
      profitCentis -= units;
      grossLoss += units;
    }
  }

  const settled = greens + reds;
  return {
    calls: calls.length,
    settled,
    greens,
    reds,
    voids,
    pending,
    hitRateBps: settled === 0 ? null : Math.round((greens * 10_000) / settled),
    stakedCentis,
    profitCentis,
    roiBps: stakedCentis === 0 ? null : Math.round((profitCentis * 10_000) / stakedCentis),
    averageOddMilli: oddCount === 0 ? null : Math.round(oddSum / oddCount),
    profitFactorBps: grossLoss === 0 ? null : Math.round((grossWin * 10_000) / grossLoss),
  };
}
