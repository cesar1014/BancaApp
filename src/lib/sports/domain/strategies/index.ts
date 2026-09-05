/**
 * Registro dos Strategy Modules.
 *
 * Para adicionar um mercado: crie o módulo (implementando StrategyModule),
 * registre-o aqui e adicione a configuração em config/strategy-config.ts.
 * Nada mais precisa mudar.
 */

import type { MarketKey } from '../models';
import { cardsStrategy, cornersStrategy } from './corners-cards';
import { bttsStrategy, nextGoalStrategy, over05Strategy, over15Strategy, over25Strategy, under25Strategy } from './goals';
import { doubleChanceStrategy, matchWinnerStrategy } from './match-winner';
import type { StrategyModule } from './types';

export const STRATEGY_MODULES: readonly StrategyModule[] = [
  over05Strategy,
  over15Strategy,
  over25Strategy,
  under25Strategy,
  bttsStrategy,
  nextGoalStrategy,
  matchWinnerStrategy,
  doubleChanceStrategy,
  cornersStrategy,
  cardsStrategy,
];

const BY_KEY = new Map(STRATEGY_MODULES.map((module) => [module.key, module]));
const BY_MARKET = new Map<MarketKey, StrategyModule>(
  STRATEGY_MODULES.map((module) => [module.market, module]),
);

export function findStrategyModule(key: string): StrategyModule | null {
  return BY_KEY.get(key) ?? null;
}

export function findStrategyModuleByMarket(market: MarketKey): StrategyModule | null {
  return BY_MARKET.get(market) ?? null;
}

export type { StrategyModule, StrategyContext, StrategyEstimate, SettleInput } from './types';
