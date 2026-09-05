/**
 * Formatação compartilhada da Central de Dicas (segura para cliente e servidor).
 */
import { MARKET_LABEL, SELECTION_LABEL, type MarketKey, type Selection } from '@/lib/sports/domain/models';

export { formatOddMilli, formatProbabilityBps, formatSignedBps } from '@/lib/sports/domain/odds-math';

/** "Over 2.5 gols" / "Escanteios · mais de 9.5" / "Próximo gol · mandante" */
export function describeMarket(market: MarketKey, selection: Selection, line: number | null): string {
  switch (market) {
    case 'OVER_0_5':
    case 'OVER_1_5':
    case 'OVER_2_5':
    case 'UNDER_2_5':
      return MARKET_LABEL[market];
    case 'BTTS':
      return `Ambas marcam · ${selection === 'YES' ? 'sim' : 'não'}`;
    case 'CORNERS':
    case 'CARDS':
      return `${MARKET_LABEL[market]} · ${selection === 'OVER' ? 'mais de' : 'menos de'} ${line ?? '?'}`;
    case 'NEXT_GOAL':
    case 'MATCH_WINNER':
    case 'DOUBLE_CHANCE':
    default:
      return `${MARKET_LABEL[market]} · ${SELECTION_LABEL[selection].toLowerCase()}`;
  }
}

/** '20:30' no fuso informado. */
export function formatKickoff(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(date);
}

/** '05/09 20:30' */
export function formatKickoffDate(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

/** "há 2 min" / "há 1 h" */
export function formatAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

export function formatMinute(status: string, minute: number | null): string {
  if (status === 'HALFTIME') return 'INT';
  if (status === 'FINISHED') return 'FIM';
  if (status === 'LIVE') return `${minute ?? 0}'`;
  return '';
}
