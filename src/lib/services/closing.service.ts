import 'server-only';
import type { SessionUser } from '@/lib/domain/types';
import { assertAdmin } from '@/lib/auth/permissions';
import { conflict, notFound } from '@/lib/errors';
import { getSettings } from '@/lib/repos/bankroll';
import { listMembers } from '@/lib/repos/members';
import { listAllEntries } from '@/lib/repos/entries';
import { listTransactions } from '@/lib/repos/transactions';
import { createClosing, deleteClosing, findClosing, listClosings } from '@/lib/repos/closings';
import { buildMonthlyClosing, type MonthlyClosingSnapshot } from '@/lib/domain/closing';
import { loadBankrollState, resolveMonthlyGoal } from './context';
import { formatMonthLabel, monthRange } from '@/lib/datetime';
import { recordAudit } from '@/lib/audit';
import { formatMoney } from '@/lib/money';

/** Monta a prévia do fechamento sem gravar nada. */
export async function previewClosing(
  bankrollId: string,
  year: number,
  month: number,
): Promise<MonthlyClosingSnapshot> {
  const settings = await getSettings(bankrollId);
  const range = monthRange(year, month);

  const [state, goal, entries, transactions, members] = await Promise.all([
    loadBankrollState(bankrollId, settings, year, month),
    resolveMonthlyGoal(bankrollId, settings, year, month),
    listAllEntries(bankrollId, { dateFrom: range.start, dateTo: range.end }),
    listTransactions(bankrollId, { dateFrom: range.start, dateTo: range.end }),
    listMembers(bankrollId),
  ]);

  return buildMonthlyClosing({
    year,
    month,
    openingBankrollCents: state.monthStartBankrollCents,
    goalCents: goal.goalCents,
    dailyGoalCents: goal.dailyGoalCents,
    activeDays: goal.activeDays,
    targetBankrollCents: goal.targetBankrollCents,
    entries,
    transactions,
    members,
  });
}

export async function closeMonth(
  user: SessionUser,
  year: number,
  month: number,
  options: { allowOpenEntries?: boolean } = {},
): Promise<MonthlyClosingSnapshot> {
  assertAdmin(user, 'o fechamento mensal');

  const existing = await findClosing(user.bankrollId, year, month);
  if (existing) {
    throw conflict(`${formatMonthLabel(year, month)} já está fechado.`);
  }

  const snapshot = await previewClosing(user.bankrollId, year, month);

  if (snapshot.openEntries > 0 && !options.allowOpenEntries) {
    throw conflict(
      `Existem ${snapshot.openEntries} entrada(s) ainda em aberto em ${formatMonthLabel(year, month)}. Resolva-as ou confirme o fechamento mantendo-as em aberto — elas não entram no resultado do mês.`,
    );
  }

  await createClosing(user.bankrollId, snapshot, user.id);

  await recordAudit({
    user,
    bankrollId: user.bankrollId,
    action: 'MONTH_CLOSE',
    entity: 'monthly_closing',
    entityId: null,
    description: `Fechou ${formatMonthLabel(year, month)} — banca final ${formatMoney(snapshot.closingBankrollCents)}, lucro ${formatMoney(snapshot.entriesProfitCents)}`,
    newValues: {
      banca_inicial: formatMoney(snapshot.openingBankrollCents),
      lucro: formatMoney(snapshot.entriesProfitCents),
      aportes: formatMoney(snapshot.contributionsCents),
      retiradas: formatMoney(snapshot.withdrawalsCents),
      banca_final: formatMoney(snapshot.closingBankrollCents),
    },
  });

  return snapshot;
}

export async function reopenMonth(user: SessionUser, year: number, month: number): Promise<void> {
  assertAdmin(user, 'a reabertura de um mês fechado');

  const existing = await findClosing(user.bankrollId, year, month);
  if (!existing) throw notFound(`${formatMonthLabel(year, month)} não está fechado.`);

  await deleteClosing(user.bankrollId, year, month);

  await recordAudit({
    user,
    bankrollId: user.bankrollId,
    action: 'MONTH_REOPEN',
    entity: 'monthly_closing',
    entityId: existing.id,
    description: `Reabriu ${formatMonthLabel(year, month)} (fechamento anterior removido)`,
    oldValues: {
      banca_final: formatMoney(existing.closingBankrollCents),
      lucro: formatMoney(existing.entriesProfitCents),
      fechado_em: existing.closedAt,
    },
  });
}

export async function loadClosingHistory(bankrollId: string) {
  return listClosings(bankrollId);
}
