import 'server-only';
import { cache } from 'react';
import type { Bankroll, BankrollSettings, Member, SessionUser } from '@/lib/domain/types';
import { getBankroll, getMonthlyGoal, getSettings } from '@/lib/repos/bankroll';
import { listMembers } from '@/lib/repos/members';
import { sumProfitBefore, sumProfitUpTo } from '@/lib/repos/entries';
import { sumCashBefore, sumCashUpTo } from '@/lib/repos/transactions';
import { computeBankrollCents } from '@/lib/domain/metrics';
import { computeRiskLimits, type RiskLimits } from '@/lib/domain/risk';
import { resolveDailyGoalCents } from '@/lib/domain/goals';
import { monthRange, todayIn, type IsoDate } from '@/lib/datetime';
import { permissionFlags, type PermissionFlags } from '@/lib/auth/permissions';

export interface BankrollContext {
  bankroll: Bankroll;
  settings: BankrollSettings;
  members: Member[];
  today: IsoDate;
  permissions: PermissionFlags;
}

export const loadBankrollContext = cache(async (user: SessionUser): Promise<BankrollContext> => {
  const [bankroll, settings, members] = await Promise.all([
    getBankroll(user.bankrollId),
    getSettings(user.bankrollId),
    listMembers(user.bankrollId),
  ]);

  return {
    bankroll,
    settings,
    members,
    today: todayIn(bankroll.timezone),
    permissions: permissionFlags(user, settings),
  };
});

/** Meta efetiva de um mês: override do mês, se existir; senão, as configurações. */
export interface ResolvedMonthlyGoal {
  goalCents: number;
  activeDays: number;
  dailyGoalCents: number;
  targetBankrollCents: number;
  isOverride: boolean;
}

export async function resolveMonthlyGoal(
  bankrollId: string,
  settings: BankrollSettings,
  year: number,
  month: number,
): Promise<ResolvedMonthlyGoal> {
  const override = await getMonthlyGoal(bankrollId, year, month);
  if (override) {
    return {
      goalCents: override.goal_cents,
      activeDays: override.active_days,
      dailyGoalCents: override.daily_goal_cents,
      targetBankrollCents: override.target_bankroll_cents,
      isOverride: true,
    };
  }

  return {
    goalCents: settings.monthlyGoalCents,
    activeDays: settings.activeDays,
    dailyGoalCents: resolveDailyGoalCents({
      mode: settings.dailyGoalMode,
      monthlyGoalCents: settings.monthlyGoalCents,
      activeDays: settings.activeDays,
      manualDailyGoalCents: settings.dailyGoalCents,
    }),
    targetBankrollCents: settings.targetBankrollCents,
    isOverride: false,
  };
}

export interface BankrollState {
  /** Banca considerando tudo que já foi registrado. */
  currentBankrollCents: number;
  /** Banca no primeiro instante do mês de referência. */
  monthStartBankrollCents: number;
  realizedProfitCents: number;
  contributionsCents: number;
  withdrawalsCents: number;
  limits: RiskLimits;
}

/**
 * Estado financeiro da banca. É a base de todo o resto:
 *   banca = inicial + lucro realizado + aportes − retiradas
 */
export async function loadBankrollState(
  bankrollId: string,
  settings: BankrollSettings,
  year: number,
  month: number,
): Promise<BankrollState> {
  const range = monthRange(year, month);

  const [profitAll, cashAll, profitBefore, cashBefore] = await Promise.all([
    sumProfitUpTo(bankrollId, null),
    sumCashUpTo(bankrollId, null),
    sumProfitBefore(bankrollId, range.start),
    sumCashBefore(bankrollId, range.start),
  ]);

  const currentBankrollCents = computeBankrollCents({
    initialBankrollCents: settings.initialBankrollCents,
    realizedProfitCents: profitAll,
    contributionsCents: cashAll.contributionsCents,
    withdrawalsCents: cashAll.withdrawalsCents,
  });

  const monthStartBankrollCents = computeBankrollCents({
    initialBankrollCents: settings.initialBankrollCents,
    realizedProfitCents: profitBefore,
    contributionsCents: cashBefore.contributionsCents,
    withdrawalsCents: cashBefore.withdrawalsCents,
  });

  const limits = computeRiskLimits(settings, {
    currentBankrollCents,
    monthStartBankrollCents,
    initialBankrollCents: settings.initialBankrollCents,
  });

  return {
    currentBankrollCents,
    monthStartBankrollCents,
    realizedProfitCents: profitAll,
    contributionsCents: cashAll.contributionsCents,
    withdrawalsCents: cashAll.withdrawalsCents,
    limits,
  };
}
