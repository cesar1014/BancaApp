/**
 * Logging da camada esportiva.
 *
 * - estruturado (evento + campos), fácil de filtrar;
 * - com supressão de repetição: o mesmo evento não é logado mais de uma vez
 *   por janela, evitando spam quando um provedor fica fora por minutos;
 * - nunca registra segredos: chaves de API são mascaradas mesmo que alguém
 *   as passe por engano nos campos.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type SportsLogEvent =
  | 'provider.failure'
  | 'provider.quota'
  | 'provider.circuit'
  | 'matching.linked'
  | 'matching.ambiguous'
  | 'tip.created'
  | 'tip.discarded'
  | 'tip.settled'
  | 'score.changed'
  | 'odds.error'
  | 'cache.hit'
  | 'worker.run'
  | 'worker.skip';

const SECRET_PATTERN = /(key|token|secret|authorization|apikey|api_key)/i;
const SUPPRESS_WINDOW_MS = 30_000;
const lastLogged = new Map<string, number>();

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_PATTERN.test(key)) {
      out[key] = '[redacted]';
    } else if (typeof value === 'string' && /apiKey=|api_token=|x-apisports-key/i.test(value)) {
      out[key] = value.replace(/(apiKey|api_token)=([^&\s]+)/gi, '$1=[redacted]');
    } else {
      out[key] = value;
    }
  }
  return out;
}

const DEBUG_ENABLED = process.env.SPORTS_LOG_DEBUG === 'true';

export function sportsLog(
  level: LogLevel,
  event: SportsLogEvent,
  fields: Record<string, unknown> = {},
  options: { dedupeKey?: string } = {},
): void {
  if (level === 'debug' && !DEBUG_ENABLED) return;

  const dedupeKey = options.dedupeKey ? `${event}:${options.dedupeKey}` : null;
  if (dedupeKey) {
    const now = Date.now();
    const last = lastLogged.get(dedupeKey) ?? 0;
    if (now - last < SUPPRESS_WINDOW_MS) return;
    lastLogged.set(dedupeKey, now);
    if (lastLogged.size > 500) {
      // Limpa entradas velhas para não crescer sem limite.
      for (const [key, at] of lastLogged) if (now - at > SUPPRESS_WINDOW_MS) lastLogged.delete(key);
    }
  }

  const payload = { event, ...redact(fields) };
  const line = `[sports] ${JSON.stringify(payload)}`;

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}
