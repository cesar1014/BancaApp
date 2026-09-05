'use server';

import { revalidatePath } from 'next/cache';
import { requireUserForAction } from '@/lib/auth/session';
import { closeMonth, reopenMonth } from '@/lib/services/closing.service';
import { toActionError, validation, type ActionResult } from '@/lib/errors';
import type { MonthlyClosingSnapshot } from '@/lib/domain/closing';

const AFFECTED_PATHS = ['/dashboard', '/fechamento', '/historico', '/metas', '/auditoria', '/estatisticas'];

function revalidateAll(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function assertPeriod(year: number, month: number): void {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw validation('Período inválido.');
  }
}

export async function closeMonthAction(input: {
  year: number;
  month: number;
  allowOpenEntries?: boolean;
}): Promise<ActionResult<MonthlyClosingSnapshot>> {
  try {
    const user = await requireUserForAction();
    assertPeriod(input.year, input.month);

    const snapshot = await closeMonth(user, input.year, input.month, {
      allowOpenEntries: input.allowOpenEntries ?? false,
    });

    revalidateAll();
    return { ok: true, data: snapshot };
  } catch (error) {
    return toActionError(error);
  }
}

export async function reopenMonthAction(input: {
  year: number;
  month: number;
}): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertPeriod(input.year, input.month);
    await reopenMonth(user, input.year, input.month);
    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
