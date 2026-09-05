'use server';

import { revalidatePath } from 'next/cache';
import { requireUserForAction } from '@/lib/auth/session';
import { assertAdmin } from '@/lib/auth/permissions';
import {
  deleteTransaction,
  getTransaction,
  insertTransaction,
  updateTransaction,
} from '@/lib/repos/transactions';
import { getMember } from '@/lib/repos/members';
import { isPeriodClosed } from '@/lib/repos/closings';
import { fieldErrors, formToObject, transactionSchema } from '@/lib/validation/schemas';
import { periodClosed, toActionError, type ActionResult } from '@/lib/errors';
import { recordAudit, diffValues } from '@/lib/audit';
import { formatMoney } from '@/lib/money';
import { formatDateBR, monthOfDate } from '@/lib/datetime';
import type { Transaction } from '@/lib/domain/types';
import { TRANSACTION_KIND_LABEL } from '@/lib/domain/types';

const AFFECTED_PATHS = ['/dashboard', '/movimentacoes', '/socios', '/metas', '/fechamento', '/auditoria'];

function revalidateAll(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

async function assertPeriodOpen(bankrollId: string, date: string): Promise<void> {
  if (await isPeriodClosed(bankrollId, date)) {
    const { year, month } = monthOfDate(date);
    throw periodClosed(
      `O mês ${String(month).padStart(2, '0')}/${year} já foi fechado e não aceita novas movimentações.`,
    );
  }
}

export async function createTransactionAction(
  _prev: ActionResult<Transaction> | null,
  formData: FormData,
): Promise<ActionResult<Transaction>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'o registro de aportes e retiradas');

    const parsed = transactionSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    await assertPeriodOpen(user.bankrollId, parsed.data.occurredOn);
    if (parsed.data.memberId) await getMember(user.bankrollId, parsed.data.memberId);

    const transaction = await insertTransaction(
      user.bankrollId,
      {
        memberId: parsed.data.memberId,
        kind: parsed.data.kind,
        amountCents: parsed.data.amount,
        occurredOn: parsed.data.occurredOn,
        note: parsed.data.note,
      },
      user.id,
    );

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'TRANSACTION_CREATE',
      entity: 'transaction',
      entityId: transaction.id,
      description: `Registrou ${TRANSACTION_KIND_LABEL[transaction.kind].toLowerCase()} de ${formatMoney(transaction.amountCents)} em ${formatDateBR(transaction.occurredOn)}${transaction.memberName ? ` (${transaction.memberName})` : ''}`,
      newValues: {
        tipo: TRANSACTION_KIND_LABEL[transaction.kind],
        valor: formatMoney(transaction.amountCents),
        data: transaction.occurredOn,
        socio: transaction.memberName,
      },
    });

    revalidateAll();
    return { ok: true, data: transaction };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateTransactionAction(
  _prev: ActionResult<Transaction> | null,
  formData: FormData,
): Promise<ActionResult<Transaction>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a alteração de aportes e retiradas');

    const id = String(formData.get('transactionId') ?? '');
    const parsed = transactionSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const existing = await getTransaction(user.bankrollId, id);
    await assertPeriodOpen(user.bankrollId, existing.occurredOn);
    await assertPeriodOpen(user.bankrollId, parsed.data.occurredOn);

    const transaction = await updateTransaction(user.bankrollId, id, {
      memberId: parsed.data.memberId,
      kind: parsed.data.kind,
      amountCents: parsed.data.amount,
      occurredOn: parsed.data.occurredOn,
      note: parsed.data.note,
    });

    const diff = diffValues(
      {
        tipo: TRANSACTION_KIND_LABEL[existing.kind],
        valor: formatMoney(existing.amountCents),
        data: existing.occurredOn,
        socio: existing.memberName ?? null,
      },
      {
        tipo: TRANSACTION_KIND_LABEL[transaction.kind],
        valor: formatMoney(transaction.amountCents),
        data: transaction.occurredOn,
        socio: transaction.memberName ?? null,
      },
    );

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'TRANSACTION_UPDATE',
      entity: 'transaction',
      entityId: transaction.id,
      description: `Alterou ${TRANSACTION_KIND_LABEL[transaction.kind].toLowerCase()} de ${formatDateBR(transaction.occurredOn)}`,
      oldValues: diff?.old ?? null,
      newValues: diff?.new ?? null,
    });

    revalidateAll();
    return { ok: true, data: transaction };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteTransactionAction(id: string): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a exclusão de aportes e retiradas');

    const existing = await getTransaction(user.bankrollId, id);
    await assertPeriodOpen(user.bankrollId, existing.occurredOn);
    await deleteTransaction(user.bankrollId, id);

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'TRANSACTION_DELETE',
      entity: 'transaction',
      entityId: id,
      description: `Excluiu ${TRANSACTION_KIND_LABEL[existing.kind].toLowerCase()} de ${formatMoney(existing.amountCents)} (${formatDateBR(existing.occurredOn)})`,
      oldValues: {
        tipo: TRANSACTION_KIND_LABEL[existing.kind],
        valor: formatMoney(existing.amountCents),
        data: existing.occurredOn,
      },
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
