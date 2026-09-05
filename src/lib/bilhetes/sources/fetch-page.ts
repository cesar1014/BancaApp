/**
 * Download de página pública para as fontes de bilhetes.
 *
 * - identifica o app no User-Agent;
 * - consulta e respeita robots.txt (cache por host durante o processo);
 * - timeout e tamanho máximo;
 * - nunca lança: devolve null e deixa o chamador registrar "sem dados".
 *
 * O limite de UMA requisição por fonte por dia é garantido pelo serviço
 * (cooldown em tip_source_runs), não aqui.
 */

import type { FetchPage } from '../domain/types';

const USER_AGENT = process.env.BILHETES_USER_AGENT?.trim() || 'BancaBilhetes/1.0 (+gestao de banca; contato via administrador)';
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 3 * 1024 * 1024;

const robotsCache = new Map<string, { disallow: string[]; at: number }>();

async function robotsFor(origin: string): Promise<string[]> {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.disallow;
  let disallow: string[] = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (response.ok) disallow = parseRobots(await response.text());
  } catch {
    /* sem robots acessível: assume permitido */
  }
  robotsCache.set(origin, { disallow, at: Date.now() });
  return disallow;
}

/** Regras Disallow do grupo `User-agent: *` (e de um grupo com o nosso nome). */
export function parseRobots(text: string): string[] {
  const rules: string[] = [];
  let applies = false;
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0]!.trim();
    if (!line) continue;
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (!key) continue;
    if (key.toLowerCase() === 'user-agent') {
      applies = value === '*' || value.toLowerCase().includes('bancabilhetes');
    } else if (applies && key.toLowerCase() === 'disallow' && value) {
      rules.push(value);
    }
  }
  return rules;
}

export function isAllowedByRobots(path: string, disallow: readonly string[]): boolean {
  for (const rule of disallow) {
    const pattern = `^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`;
    if (new RegExp(pattern).test(path)) return false;
  }
  return true;
}

export const fetchPublicPage: FetchPage = async (url) => {
  try {
    const target = new URL(url);
    const disallow = await robotsFor(target.origin);
    if (!isAllowedByRobots(target.pathname + target.search, disallow)) {
      console.warn(`[bilhetes] robots.txt proíbe ${target.pathname} em ${target.host}`);
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7' },
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const text = await response.text();
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  } catch {
    return null;
  }
};
