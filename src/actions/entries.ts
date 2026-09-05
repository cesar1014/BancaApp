'use server';

import { revalidatePath } from 'next/cache';
import { requireUserForAction } from '@/lib/auth/session';
import { createEntry, deleteEntry, previewRisk, settleEntry, updateEntry } from '@/lib/services/entries.service';
import { entrySchema, fieldErrors, formToObject } from '@/lib/validation/schemas';
import { toActionError, type ActionResult } from '@/lib/errors';
import { parseMoneyToCents } from '@/lib/money';
import type { Entry, EntryStatus } from '@/lib/domain/types';
import type { RiskEvaluation } from '@/lib/domain/risk';

const AFFECTED_PATHS = [
  '/dashboard',
  '/entradas',
  '/metas',
  '/historico',
  '/socios',
  '/estatisticas',
  '/fechamento',
  '/auditoria',
];

function revalidateAll(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

export async function createEntryAction(
  _prev: ActionResult<Entry> | null,
  formData: FormData,
): Promise<ActionResult<Entry>> {
  try {
    const user = await requireUserForAction();
    const parsed = entrySchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const result = await createEntry(user, parsed.data);
    revalidateAll();
    return { ok: true, data: result.entry, warnings: result.warnings };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateEntryAction(
  _prev: ActionResult<Entry> | null,
  formData: FormData,
): Promise<ActionResult<Entry>> {
  try {
    const user = await requireUserForAction();
    const entryId = String(formData.get('entryId') ?? '');
    const parsed = entrySchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const result = await updateEntry(user, entryId, parsed.data);
    revalidateAll();
    return { ok: true, data: result.entry, warnings: result.warnings };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteEntryAction(entryId: string): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    await deleteEntry(user, entryId);
    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function settleEntryAction(input: {
  entryId: string;
  status: EntryStatus;
  payout?: string;
}): Promise<ActionResult<Entry>> {
  try {
    const user = await requireUserForAction();
    const payoutCents =
      input.status === 'CASHOUT' ? parseMoneyToCents(input.payout ?? '') : null;

    if (input.status === 'CASHOUT' && payoutCents === null) {
      return {
        ok: false,
        error: 'Informe o retorno recebido no cashout.',
        code: 'VALIDATION',
        details: { payout: ['Informe o retorno recebido no cashout.'] },
      };
    }

    const entry = await settleEntry(user, input.entryId, input.status, payoutCents);
    revalidateAll();
    return { ok: true, data: entry };
  } catch (error) {
    return toActionError(error);
  }
}

/** Consulta o risco de uma stake sem gravar nada — usada pelo formulário. */
export async function previewRiskAction(input: {
  date: string;
  stake: string;
  entryId?: string;
}): Promise<ActionResult<RiskEvaluation>> {
  try {
    const user = await requireUserForAction();
    const stakeCents = parseMoneyToCents(input.stake);
    if (stakeCents === null || stakeCents <= 0) {
      return { ok: false, error: 'Stake inválida.', code: 'VALIDATION' };
    }

    const evaluation = await previewRisk({
      user,
      date: input.date,
      stakeCents,
      ...(input.entryId ? { excludeEntryId: input.entryId } : {}),
    });
    return { ok: true, data: evaluation };
  } catch (error) {
    return toActionError(error);
  }
}
