import type { Cents } from '@/lib/money';
import { formatMoney } from '@/lib/money';
import type { Bps } from '@/lib/numbers';
import { applyBps, formatBps, ratioToBps } from '@/lib/numbers';
import type { BankrollSettings, LimitPolicy, RiskBase } from './types';

/**
 * Controle de risco.
 *
 * Princípios inegociáveis desta camada:
 *  1. Limites nunca são aumentados automaticamente.
 *  2. O sistema nunca sugere aumentar stake para recuperar prejuízo.
 *  3. Um limite atingido gera bloqueio ou alerta explícito — jamais silêncio.
 */

export interface RiskBaseAmounts {
  currentBankrollCents: Cents;
  monthStartBankrollCents: Cents;
  initialBankrollCents: Cents;
}

export function resolveRiskBaseCents(base: RiskBase, amounts: RiskBaseAmounts): Cents {
  switch (base) {
    case 'CURRENT':
      return amounts.currentBankrollCents;
    case 'MONTH_START':
      return amounts.monthStartBankrollCents;
    case 'INITIAL':
      return amounts.initialBankrollCents;
    default: {
      const exhaustive: never = base;
      throw new Error(`Base de risco desconhecida: ${String(exhaustive)}`);
    }
  }
}

export interface RiskLimits {
  baseCents: Cents;
  maxStakeCents: Cents;
  /** true quando o teto absoluto configurado é menor que o percentual. */
  cappedByAbsolute: boolean;
  dailyStopCents: Cents;
  weeklyStopCents: Cents;
  monthlyStopCents: Cents;
}

export function computeRiskLimits(settings: BankrollSettings, amounts: RiskBaseAmounts): RiskLimits {
  const baseCents = Math.max(resolveRiskBaseCents(settings.riskBase, amounts), 0);
  const percentStake = applyBps(baseCents, settings.maxRiskPerEntryBps);
  const cap = settings.maxStakeCapCents;
  const cappedByAbsolute = cap !== null && cap < percentStake;

  return {
    baseCents,
    maxStakeCents: cappedByAbsolute ? (cap as Cents) : percentStake,
    cappedByAbsolute,
    dailyStopCents: applyBps(baseCents, settings.dailyStopBps),
    weeklyStopCents: applyBps(baseCents, settings.weeklyStopBps),
    monthlyStopCents: applyBps(baseCents, settings.monthlyStopBps),
  };
}

export type RiskLevel = 'OK' | 'WARN' | 'BLOCK';

export interface RiskCheck {
  level: RiskLevel;
  message: string | null;
  /** Quanto da stake máxima esta entrada consome, em bps. */
  usageBps: Bps | null;
}

/** Compara a stake pretendida com o limite configurado. */
export function checkStakeLimit(params: {
  stakeCents: Cents;
  maxStakeCents: Cents;
  policy: LimitPolicy;
  /** Autorização explícita do administrador para exceder o limite. */
  override?: boolean;
}): RiskCheck {
  const { stakeCents, maxStakeCents, policy } = params;
  const usageBps = maxStakeCents > 0 ? ratioToBps(stakeCents, maxStakeCents) : null;

  if (maxStakeCents <= 0) {
    return {
      level: 'WARN',
      message: 'Limite de risco não configurado. Ajuste em Configurações antes de operar.',
      usageBps: null,
    };
  }

  if (stakeCents <= maxStakeCents) {
    if (usageBps !== null && usageBps >= 8_000) {
      return {
        level: 'OK',
        message: `Esta entrada usa ${formatBps(usageBps, 0)} do limite de risco (${formatMoney(maxStakeCents)}).`,
        usageBps,
      };
    }
    return { level: 'OK', message: null, usageBps };
  }

  const base = `Esta entrada ultrapassa o limite de risco configurado (máximo ${formatMoney(maxStakeCents)}).`;

  if (params.override) {
    return {
      level: 'WARN',
      message: `${base} Registrada com autorização expressa do administrador.`,
      usageBps,
    };
  }

  return {
    level: policy === 'BLOCK' ? 'BLOCK' : 'WARN',
    message: base,
    usageBps,
  };
}

export type StopScope = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export const STOP_SCOPE_LABEL: Record<StopScope, string> = {
  DAILY: 'Stop diário',
  WEEKLY: 'Stop semanal',
  MONTHLY: 'Stop mensal',
};

export interface StopStatus {
  scope: StopScope;
  limitCents: Cents;
  /** Prejuízo acumulado no período, como número positivo. Zero se houve lucro. */
  lossCents: Cents;
  /** Quanto do stop já foi consumido (0–10000+ bps). */
  usageBps: Bps;
  isHit: boolean;
  isNear: boolean;
  message: string | null;
}

function buildStopStatus(scope: StopScope, limitCents: Cents, periodProfitCents: Cents): StopStatus {
  const lossCents = periodProfitCents < 0 ? -periodProfitCents : 0;
  const usageBps = limitCents > 0 ? (ratioToBps(lossCents, limitCents) ?? 0) : 0;
  const isHit = limitCents > 0 && lossCents >= limitCents;
  const isNear = !isHit && usageBps >= 8_000;

  let message: string | null = null;
  if (isHit) {
    message = `${STOP_SCOPE_LABEL[scope]} atingido: prejuízo de ${formatMoney(lossCents)} contra um limite de ${formatMoney(limitCents)}. Encerre as operações do período.`;
  } else if (isNear) {
    message = `${STOP_SCOPE_LABEL[scope]} em ${formatBps(usageBps, 0)} do limite (${formatMoney(lossCents)} de ${formatMoney(limitCents)}).`;
  }

  return { scope, limitCents, lossCents, usageBps, isHit, isNear, message };
}

export function evaluateStops(params: {
  limits: RiskLimits;
  dayProfitCents: Cents;
  weekProfitCents: Cents;
  monthProfitCents: Cents;
}): StopStatus[] {
  return [
    buildStopStatus('DAILY', params.limits.dailyStopCents, params.dayProfitCents),
    buildStopStatus('WEEKLY', params.limits.weeklyStopCents, params.weekProfitCents),
    buildStopStatus('MONTHLY', params.limits.monthlyStopCents, params.monthProfitCents),
  ];
}

export function highestStopLevel(stops: readonly StopStatus[], policy: LimitPolicy): RiskLevel {
  if (stops.some((s) => s.isHit)) return policy === 'BLOCK' ? 'BLOCK' : 'WARN';
  if (stops.some((s) => s.isNear)) return 'WARN';
  return 'OK';
}

/** Consolida as verificações de risco de uma tentativa de registro. */
export interface RiskEvaluation {
  stake: RiskCheck;
  stops: StopStatus[];
  level: RiskLevel;
  blockingMessages: string[];
  warningMessages: string[];
}

export function evaluateEntryRisk(params: {
  stakeCents: Cents;
  limits: RiskLimits;
  settings: BankrollSettings;
  dayProfitCents: Cents;
  weekProfitCents: Cents;
  monthProfitCents: Cents;
  override?: boolean;
}): RiskEvaluation {
  const stake = checkStakeLimit({
    stakeCents: params.stakeCents,
    maxStakeCents: params.limits.maxStakeCents,
    policy: params.settings.stakeLimitPolicy,
    override: params.override,
  });

  const stops = evaluateStops({
    limits: params.limits,
    dayProfitCents: params.dayProfitCents,
    weekProfitCents: params.weekProfitCents,
    monthProfitCents: params.monthProfitCents,
  });

  const stopLevel = highestStopLevel(stops, params.settings.stopLimitPolicy);
  const level: RiskLevel =
    stake.level === 'BLOCK' || stopLevel === 'BLOCK'
      ? 'BLOCK'
      : stake.level === 'WARN' || stopLevel === 'WARN'
        ? 'WARN'
        : 'OK';

  const blockingMessages: string[] = [];
  const warningMessages: string[] = [];

  if (stake.message) {
    (stake.level === 'BLOCK' ? blockingMessages : warningMessages).push(stake.message);
  }
  for (const stop of stops) {
    if (!stop.message) continue;
    if (stop.isHit && params.settings.stopLimitPolicy === 'BLOCK') blockingMessages.push(stop.message);
    else warningMessages.push(stop.message);
  }

  return { stake, stops, level, blockingMessages, warningMessages };
}
