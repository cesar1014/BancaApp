/**
 * Registro de provedores.
 *
 *   DATA_PROVIDER_MODE=mock  → só o simulador (padrão; zero custo)
 *   DATA_PROVIDER_MODE=live  → os provedores com chave configurada
 *
 * Em modo live sem NENHUMA chave, o sistema cai para o simulador e avisa —
 * a interface continua funcionando.
 *
 * Papéis:
 *   primary     calendário, ao vivo, placar, eventos, estatísticas
 *   enrichment  estatísticas complementares em partidas selecionadas
 *   odds        cotações
 */

import type { ProviderKey } from '../domain/models';
import { ApiFootballProvider } from './api-football';
import { MockProvider } from './mock';
import { OddsApiProvider, DEFAULT_ODDS_API_OPTIONS } from './odds-api';
import { SportmonksProvider } from './sportmonks';
import type { ProviderDeps, SportsProvider } from './types';

export type DataProviderMode = 'mock' | 'live';

export interface ProviderSet {
  mode: DataProviderMode;
  /** true quando o modo live caiu para o simulador por falta de chaves. */
  usingMockFallback: boolean;
  primary: SportsProvider;
  enrichment: SportsProvider[];
  odds: SportsProvider[];
  all: SportsProvider[];
  keys: ProviderKey[];
}

export interface ProviderEnv {
  mode: string | undefined;
  apiFootballKey: string | undefined;
  sportmonksKey: string | undefined;
  oddsApiKey: string | undefined;
  oddsApiRegions: string | undefined;
}

export function readProviderEnv(env: NodeJS.ProcessEnv = process.env): ProviderEnv {
  return {
    mode: env.DATA_PROVIDER_MODE,
    apiFootballKey: env.API_FOOTBALL_KEY,
    sportmonksKey: env.SPORTMONKS_API_KEY,
    oddsApiKey: env.THE_ODDS_API_KEY,
    oddsApiRegions: env.THE_ODDS_API_REGIONS,
  };
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '' ? trimmed : null;
}

export function createProviders(env: ProviderEnv, deps: ProviderDeps): ProviderSet {
  const wantsLive = (env.mode ?? 'mock').trim().toLowerCase() === 'live';
  const mock = new MockProvider(deps.now);

  if (!wantsLive) {
    return { mode: 'mock', usingMockFallback: false, primary: mock, enrichment: [], odds: [mock], all: [mock], keys: ['mock'] };
  }

  const apiFootball = new ApiFootballProvider(clean(env.apiFootballKey), deps);
  const sportmonks = new SportmonksProvider(clean(env.sportmonksKey), deps);
  const oddsApi = new OddsApiProvider(clean(env.oddsApiKey), deps, {
    ...DEFAULT_ODDS_API_OPTIONS,
    regions: clean(env.oddsApiRegions) ?? DEFAULT_ODDS_API_OPTIONS.regions,
  });

  const configured = [apiFootball, sportmonks, oddsApi].filter((provider) => provider.isConfigured());
  if (configured.length === 0) {
    return { mode: 'live', usingMockFallback: true, primary: mock, enrichment: [], odds: [mock], all: [mock], keys: ['mock'] };
  }

  // Primário: API-Football se houver; senão Sportmonks (cobre só 2 ligas no free).
  const primary: SportsProvider = apiFootball.isConfigured() ? apiFootball : sportmonks.isConfigured() ? sportmonks : mock;
  const enrichment = [sportmonks].filter((p) => p.isConfigured() && p !== primary);
  // Odds: The Odds API primeiro; API-Football como fallback.
  const odds = [oddsApi, apiFootball].filter((p) => p.isConfigured());

  const all = [primary, ...enrichment, ...odds].filter((p, index, list) => list.indexOf(p) === index);
  return {
    mode: 'live',
    usingMockFallback: primary === mock,
    primary,
    enrichment,
    odds,
    all,
    keys: all.map((p) => p.key),
  };
}
