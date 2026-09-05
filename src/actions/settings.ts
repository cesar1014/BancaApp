'use server';

import { revalidatePath } from 'next/cache';
import { requireUserForAction } from '@/lib/auth/session';
import { assertAdmin, assertOwner, canManageGoals } from '@/lib/auth/permissions';
import {
  deleteMonthlyGoal,
  getBankroll,
  getSettings,
  updateBankrollProfile,
  updateSettings,
  upsertMonthlyGoal,
} from '@/lib/repos/bankroll';
import { fieldErrors, formToObject, monthlyGoalSchema, settingsSchema } from '@/lib/validation/schemas';
import { toActionError, validation, type ActionResult } from '@/lib/errors';
import { recordAudit, diffValues } from '@/lib/audit';
import { formatMoney } from '@/lib/money';
import { formatBps } from '@/lib/numbers';
import { formatMonthLabel } from '@/lib/datetime';
import { resolveDailyGoalCents } from '@/lib/domain/goals';
import { RISK_BASE_LABEL, type BankrollSettings } from '@/lib/domain/types';

const AFFECTED_PATHS = [
  '/dashboard',
  '/configuracoes',
  '/metas',
  '/entradas',
  '/fechamento',
  '/socios',
  '/auditoria',
];

function revalidateAll(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function describeSettings(settings: BankrollSettings, bankrollName: string, timezone: string) {
  return {
    banca: bankrollName,
    fuso: timezone,
    banca_inicial: formatMoney(settings.initialBankrollCents),
    meta_mensal: formatMoney(settings.monthlyGoalCents),
    banca_alvo: formatMoney(settings.targetBankrollCents),
    dias_ativos: settings.activeDays,
    meta_diaria: formatMoney(
      resolveDailyGoalCents({
        mode: settings.dailyGoalMode,
        monthlyGoalCents: settings.monthlyGoalCents,
        activeDays: settings.activeDays,
        manualDailyGoalCents: settings.dailyGoalCents,
      }),
    ),
    base_de_risco: RISK_BASE_LABEL[settings.riskBase],
    risco_por_entrada: formatBps(settings.maxRiskPerEntryBps),
    teto_absoluto: settings.maxStakeCapCents === null ? 'sem teto' : formatMoney(settings.maxStakeCapCents),
    stop_diario: formatBps(settings.dailyStopBps),
    stop_semanal: formatBps(settings.weeklyStopBps),
    stop_mensal: formatBps(settings.monthlyStopBps),
    politica_stake: settings.stakeLimitPolicy === 'BLOCK' ? 'bloquear' : 'apenas alertar',
    politica_stop: settings.stopLimitPolicy === 'BLOCK' ? 'bloquear' : 'apenas alertar',
    socios_registram_entradas: settings.partnersCanCreateEntries,
  };
}

export async function updateSettingsAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a alteração das configurações');

    const parsed = settingsSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    if (parsed.data.dailyGoalMode === 'MANUAL' && parsed.data.dailyGoal <= 0) {
      return {
        ok: false,
        error: 'Informe a meta diária quando o modo for manual.',
        code: 'VALIDATION',
        details: { dailyGoal: ['Informe a meta diária.'] },
      };
    }

    const [beforeSettings, beforeBankroll] = await Promise.all([
      getSettings(user.bankrollId),
      getBankroll(user.bankrollId),
    ]);

    const bankroll = await updateBankrollProfile(user.bankrollId, {
      name: parsed.data.bankrollName,
      timezone: parsed.data.timezone,
    });

    // Banca inicial e metas são exclusivas do dono. Um administrador que não é
    // o dono salva o restante das configurações, mas esses campos preservam o
    // valor anterior — mesmo que o formulário tente enviá-los.
    const goalsAllowed = canManageGoals(user);
    const goalFields = goalsAllowed
      ? {
          initialBankrollCents: parsed.data.initialBankroll,
          monthlyGoalCents: parsed.data.monthlyGoal,
          targetBankrollCents: parsed.data.targetBankroll,
          activeDays: parsed.data.activeDays,
          dailyGoalMode: parsed.data.dailyGoalMode,
          dailyGoalCents: parsed.data.dailyGoal,
        }
      : {
          initialBankrollCents: beforeSettings.initialBankrollCents,
          monthlyGoalCents: beforeSettings.monthlyGoalCents,
          targetBankrollCents: beforeSettings.targetBankrollCents,
          activeDays: beforeSettings.activeDays,
          dailyGoalMode: beforeSettings.dailyGoalMode,
          dailyGoalCents: beforeSettings.dailyGoalCents,
        };

    const afterSettings = await updateSettings(
      user.bankrollId,
      {
        ...goalFields,
        riskBase: parsed.data.riskBase,
        maxRiskPerEntryBps: parsed.data.maxRiskPerEntry,
        maxStakeCapCents: parsed.data.maxStakeCap,
        dailyStopBps: parsed.data.dailyStop,
        weeklyStopBps: parsed.data.weeklyStop,
        monthlyStopBps: parsed.data.monthlyStop,
        stakeLimitPolicy: parsed.data.stakeLimitPolicy,
        stopLimitPolicy: parsed.data.stopLimitPolicy,
        partnersCanCreateEntries: parsed.data.partnersCanCreateEntries,
      },
      user.id,
    );

    const diff = diffValues(
      describeSettings(beforeSettings, beforeBankroll.name, beforeBankroll.timezone),
      describeSettings(afterSettings, bankroll.name, bankroll.timezone),
    );

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'SETTINGS_UPDATE',
      entity: 'settings',
      entityId: null,
      description: diff
        ? `Alterou as configurações: ${Object.keys(diff.new).join(', ')}`
        : 'Salvou as configurações sem alterações',
      oldValues: diff?.old ?? null,
      newValues: diff?.new ?? null,
    });

    revalidateAll();
    return goalsAllowed
      ? { ok: true, data: null }
      : {
          ok: true,
          data: null,
          warnings: ['Banca inicial e metas não foram alteradas: somente o dono da banca pode mudá-las.'],
        };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveMonthlyGoalAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertOwner(user, 'a alteração da meta do mês');

    const parsed = monthlyGoalSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const dailyGoalCents = Math.round(parsed.data.goal / parsed.data.activeDays);
    await upsertMonthlyGoal(user.bankrollId, {
      year: parsed.data.year,
      month: parsed.data.month,
      goalCents: parsed.data.goal,
      activeDays: parsed.data.activeDays,
      dailyGoalCents,
      targetBankrollCents: parsed.data.targetBankroll,
    });

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'MONTHLY_GOAL_UPDATE',
      entity: 'monthly_goal',
      entityId: null,
      description: `Definiu a meta de ${formatMonthLabel(parsed.data.year, parsed.data.month)} em ${formatMoney(parsed.data.goal)} (${parsed.data.activeDays} dias ativos)`,
      newValues: {
        meta: formatMoney(parsed.data.goal),
        dias_ativos: parsed.data.activeDays,
        meta_diaria: formatMoney(dailyGoalCents),
        banca_alvo: formatMoney(parsed.data.targetBankroll),
      },
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function clearMonthlyGoalAction(
  year: number,
  month: number,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertOwner(user, 'a remoção da meta do mês');
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw validation('Período inválido.');
    }

    await deleteMonthlyGoal(user.bankrollId, year, month);
    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'MONTHLY_GOAL_UPDATE',
      entity: 'monthly_goal',
      entityId: null,
      description: `Removeu a meta específica de ${formatMonthLabel(year, month)} — o mês volta a usar as configurações gerais`,
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
