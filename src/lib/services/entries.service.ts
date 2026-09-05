import 'server-only';
import type { Entry, SessionUser } from '@/lib/domain/types';
import { computeEntryResult, isSettled } from '@/lib/domain/entry';
import { evaluateEntryRisk, type RiskEvaluation } from '@/lib/domain/risk';
import { AppError, forbidden, notFound, periodClosed, validation } from '@/lib/errors';
import { canCreateEntry, canDeleteEntry, canEditEntry, canOverrideRisk } from '@/lib/auth/permissions';
import { getBankroll, getSettings } from '@/lib/repos/bankroll';
import { getMember, listMembers } from '@/lib/repos/members';
import {
  deleteEntry as deleteEntryRow,
  getEntry,
  insertEntry,
  listAllEntries,
  updateEntry as updateEntryRow,
} from '@/lib/repos/entries';
import { isPeriodClosed } from '@/lib/repos/closings';
import { loadBankrollState } from './context';
import { isoWeekRange, monthOfDate, monthRange, timeNowIn, todayIn, type IsoDate } from '@/lib/datetime';
import { recordAudit, diffValues } from '@/lib/audit';
import { formatMoney } from '@/lib/money';
import { formatOdd } from '@/lib/numbers';
import type { EntryInput } from '@/lib/validation/schemas';

export interface EntryWriteResult {
  entry: Entry;
  warnings: string[];
}

/** Impede qualquer escrita em um mês já fechado. */
async function assertPeriodOpen(bankrollId: string, date: IsoDate): Promise<void> {
  if (await isPeriodClosed(bankrollId, date)) {
    const { year, month } = monthOfDate(date);
    throw periodClosed(
      `O mês ${String(month).padStart(2, '0')}/${year} já foi fechado. Reabra o fechamento antes de alterar registros desse período.`,
    );
  }
}

/**
 * Avalia o risco de uma stake em uma data específica, considerando o resultado
 * já acumulado no dia, na semana e no mês — excluindo, quando for uma edição,
 * a própria entrada que está sendo alterada.
 */
async function evaluateRiskForDate(params: {
  bankrollId: string;
  date: IsoDate;
  stakeCents: number;
  override: boolean;
  excludeEntryId?: string;
}): Promise<RiskEvaluation> {
  const settings = await getSettings(params.bankrollId);
  const { year, month } = monthOfDate(params.date);
  const range = monthRange(year, month);
  const week = isoWeekRange(params.date);

  const [state, monthEntries, weekEntries] = await Promise.all([
    loadBankrollState(params.bankrollId, settings, year, month),
    listAllEntries(params.bankrollId, { dateFrom: range.start, dateTo: range.end }),
    listAllEntries(params.bankrollId, { dateFrom: week.start, dateTo: week.end }),
  ]);

  const keep = (entry: { id: string }) => entry.id !== params.excludeEntryId;
  const sumProfit = (list: readonly Entry[]) =>
    list.filter(keep).reduce((acc, e) => (isSettled(e.status) ? acc + e.profitCents : acc), 0);

  return evaluateEntryRisk({
    stakeCents: params.stakeCents,
    limits: state.limits,
    settings,
    dayProfitCents: sumProfit(monthEntries.filter((e) => e.occurredOn === params.date)),
    weekProfitCents: sumProfit(weekEntries),
    monthProfitCents: sumProfit(monthEntries),
    override: params.override,
  });
}

/** Pré-visualização de risco usada pelo formulário antes de salvar. */
export async function previewRisk(params: {
  user: SessionUser;
  date: IsoDate;
  stakeCents: number;
  excludeEntryId?: string;
}): Promise<RiskEvaluation> {
  return evaluateRiskForDate({
    bankrollId: params.user.bankrollId,
    date: params.date,
    stakeCents: params.stakeCents,
    override: false,
    ...(params.excludeEntryId ? { excludeEntryId: params.excludeEntryId } : {}),
  });
}

/**
 * Entrada com todos os campos resolvidos: o formulário exige apenas evento,
 * odd e stake, e o que faltar é preenchido aqui.
 */
export type ResolvedEntryInput = Omit<EntryInput, 'memberId' | 'occurredOn' | 'occurredAtTime' | 'sport' | 'market'> & {
  memberId: string;
  occurredOn: IsoDate;
  occurredAtTime: string;
  sport: string;
  market: string;
};

/** Rótulo usado quando quem registrou não informou o campo. */
export const NOT_INFORMED = 'Não informado';

/**
 * Preenche o que o formulário não exigiu:
 *   responsável → quem está registrando (ou o único sócio ativo)
 *   data e hora → agora, no fuso da banca
 *   esporte     → Futebol, que é o caso da esmagadora maioria
 *   mercado     → "Não informado"
 */
async function resolveEntryInput(user: SessionUser, input: EntryInput): Promise<ResolvedEntryInput> {
  let memberId = input.memberId;
  if (!memberId) {
    if (user.memberId) memberId = user.memberId;
    else {
      const active = (await listMembers(user.bankrollId)).filter((m) => m.isActive);
      if (active.length === 0) {
        throw validation('Cadastre ao menos um sócio antes de registrar entradas.');
      }
      memberId = active[0]!.id;
    }
  }

  const bankroll = await getBankroll(user.bankrollId);
  return {
    ...input,
    memberId,
    occurredOn: input.occurredOn ?? todayIn(bankroll.timezone),
    occurredAtTime: input.occurredAtTime ?? timeNowIn(bankroll.timezone),
    sport: input.sport ?? 'Futebol',
    market: input.market ?? NOT_INFORMED,
  };
}

function buildWritePayload(input: ResolvedEntryInput, riskOverride: boolean) {
  // O lucro NUNCA vem do cliente: é recalculado aqui, sempre.
  const result = computeEntryResult({
    status: input.status,
    stakeCents: input.stake,
    oddMilli: input.odd,
    payoutCents: input.payout,
  });

  return {
    memberId: input.memberId,
    occurredOn: input.occurredOn,
    occurredAtTime: input.occurredAtTime,
    sport: input.sport,
    event: input.event,
    market: input.market,
    oddMilli: input.odd,
    stakeCents: input.stake,
    status: input.status,
    payoutCents: result.payoutCents,
    profitCents: result.profitCents,
    note: input.note,
    riskOverride,
    riskOverrideReason: riskOverride ? input.riskOverrideReason : null,
  };
}

export async function createEntry(user: SessionUser, raw: EntryInput): Promise<EntryWriteResult> {
  const settings = await getSettings(user.bankrollId);

  if (!canCreateEntry(user, settings)) {
    throw forbidden('Você não tem permissão para registrar entradas nesta banca.');
  }

  const input = await resolveEntryInput(user, raw);
  const member = await getMember(user.bankrollId, input.memberId);
  if (!member.isActive) throw validation('Este sócio está inativo e não pode receber entradas.');

  // Um sócio só registra entradas em seu próprio nome; o administrador, em qualquer nome.
  if (user.role !== 'ADMIN' && user.memberId !== member.id) {
    throw forbidden('Você só pode registrar entradas no seu próprio nome.');
  }

  await assertPeriodOpen(user.bankrollId, input.occurredOn);

  const wantsOverride = input.confirmRisk && canOverrideRisk(user);
  const risk = await evaluateRiskForDate({
    bankrollId: user.bankrollId,
    date: input.occurredOn,
    stakeCents: input.stake,
    override: wantsOverride,
  });

  if (risk.level === 'BLOCK') {
    throw new AppError('RISK_BLOCKED', risk.blockingMessages.join(' '));
  }

  // A entrada só é marcada como "acima do limite" quando de fato excedeu o
  // teto configurado (uso > 100% da stake máxima) e houve autorização expressa.
  const overrideApplied = wantsOverride && (risk.stake.usageBps ?? 0) > 10_000;

  const entry = await insertEntry(user.bankrollId, buildWritePayload(input, overrideApplied), user.id);

  await recordAudit({
    user,
    bankrollId: user.bankrollId,
    action: 'ENTRY_CREATE',
    entity: 'entry',
    entityId: entry.id,
    description: `${entry.memberName} — ${entry.event} (${entry.market}) · odd ${formatOdd(entry.oddMilli)} · stake ${formatMoney(entry.stakeCents)} · ${entry.status}`,
    newValues: {
      evento: entry.event,
      mercado: entry.market,
      odd: formatOdd(entry.oddMilli),
      stake: formatMoney(entry.stakeCents),
      status: entry.status,
      lucro: formatMoney(entry.profitCents),
    },
  });

  if (overrideApplied) {
    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'RISK_OVERRIDE',
      entity: 'entry',
      entityId: entry.id,
      description: `Entrada registrada acima do limite de risco (${formatMoney(entry.stakeCents)}). Motivo: ${entry.riskOverrideReason ?? 'não informado'}`,
    });
  }

  return { entry, warnings: risk.warningMessages };
}

export async function updateEntry(
  user: SessionUser,
  entryId: string,
  raw: EntryInput,
): Promise<EntryWriteResult> {
  const existing = await getEntry(user.bankrollId, entryId);
  // Numa edição, o que não vier no formulário mantém o valor que já estava.
  const input = await resolveEntryInput(user, {
    ...raw,
    memberId: raw.memberId ?? existing.memberId,
    occurredOn: raw.occurredOn ?? existing.occurredOn,
    occurredAtTime: raw.occurredAtTime ?? existing.occurredAtTime.slice(0, 5),
    sport: raw.sport ?? existing.sport,
    market: raw.market ?? existing.market,
  });

  if (!canEditEntry(user, existing)) {
    throw forbidden('Você só pode alterar entradas registradas por você.');
  }

  await assertPeriodOpen(user.bankrollId, existing.occurredOn);
  await assertPeriodOpen(user.bankrollId, input.occurredOn);

  const member = await getMember(user.bankrollId, input.memberId);
  if (user.role !== 'ADMIN' && user.memberId !== member.id) {
    throw forbidden('Você só pode registrar entradas no seu próprio nome.');
  }

  const wantsOverride = input.confirmRisk && canOverrideRisk(user);
  const risk = await evaluateRiskForDate({
    bankrollId: user.bankrollId,
    date: input.occurredOn,
    stakeCents: input.stake,
    override: wantsOverride,
    excludeEntryId: entryId,
  });

  if (risk.level === 'BLOCK') {
    throw new AppError('RISK_BLOCKED', risk.blockingMessages.join(' '));
  }

  const overrideApplied = wantsOverride && (risk.stake.usageBps ?? 0) > 10_000;

  const entry = await updateEntryRow(
    user.bankrollId,
    entryId,
    buildWritePayload(input, overrideApplied),
  );

  const diff = diffValues(
    {
      data: existing.occurredOn,
      responsavel: existing.memberName,
      evento: existing.event,
      mercado: existing.market,
      odd: formatOdd(existing.oddMilli),
      stake: formatMoney(existing.stakeCents),
      status: existing.status,
      lucro: formatMoney(existing.profitCents),
    },
    {
      data: entry.occurredOn,
      responsavel: entry.memberName,
      evento: entry.event,
      mercado: entry.market,
      odd: formatOdd(entry.oddMilli),
      stake: formatMoney(entry.stakeCents),
      status: entry.status,
      lucro: formatMoney(entry.profitCents),
    },
  );

  await recordAudit({
    user,
    bankrollId: user.bankrollId,
    action: 'ENTRY_UPDATE',
    entity: 'entry',
    entityId: entry.id,
    description: `Alterou a entrada "${entry.event}"`,
    oldValues: diff?.old ?? null,
    newValues: diff?.new ?? null,
  });

  return { entry, warnings: risk.warningMessages };
}

export async function deleteEntry(user: SessionUser, entryId: string): Promise<void> {
  const existing = await getEntry(user.bankrollId, entryId);
  if (!canDeleteEntry(user, existing)) {
    throw forbidden('Você só pode excluir entradas registradas por você.');
  }
  await assertPeriodOpen(user.bankrollId, existing.occurredOn);

  await deleteEntryRow(user.bankrollId, entryId);

  await recordAudit({
    user,
    bankrollId: user.bankrollId,
    action: 'ENTRY_DELETE',
    entity: 'entry',
    entityId: entryId,
    description: `Excluiu a entrada "${existing.event}" (${formatMoney(existing.stakeCents)} · ${existing.status})`,
    oldValues: {
      data: existing.occurredOn,
      evento: existing.event,
      stake: formatMoney(existing.stakeCents),
      status: existing.status,
      lucro: formatMoney(existing.profitCents),
    },
  });
}

/** Resolve rapidamente uma entrada aberta (Green/Red/Void/Cashout). */
export async function settleEntry(
  user: SessionUser,
  entryId: string,
  status: Entry['status'],
  payoutCents: number | null,
): Promise<Entry> {
  const existing = await getEntry(user.bankrollId, entryId);
  if (!canEditEntry(user, existing)) {
    throw forbidden('Você só pode resolver entradas registradas por você.');
  }
  await assertPeriodOpen(user.bankrollId, existing.occurredOn);

  const result = computeEntryResult({
    status,
    stakeCents: existing.stakeCents,
    oddMilli: existing.oddMilli,
    payoutCents,
  });

  const entry = await updateEntryRow(user.bankrollId, entryId, {
    memberId: existing.memberId,
    occurredOn: existing.occurredOn,
    occurredAtTime: existing.occurredAtTime,
    sport: existing.sport,
    event: existing.event,
    market: existing.market,
    oddMilli: existing.oddMilli,
    stakeCents: existing.stakeCents,
    status,
    payoutCents: result.payoutCents,
    profitCents: result.profitCents,
    note: existing.note,
    riskOverride: existing.riskOverride,
    riskOverrideReason: existing.riskOverrideReason,
  });

  await recordAudit({
    user,
    bankrollId: user.bankrollId,
    action: 'ENTRY_UPDATE',
    entity: 'entry',
    entityId: entry.id,
    description: `Resolveu a entrada "${entry.event}" como ${status} (${formatMoney(entry.profitCents)})`,
    oldValues: { status: existing.status, lucro: formatMoney(existing.profitCents) },
    newValues: { status: entry.status, lucro: formatMoney(entry.profitCents) },
  });

  return entry;
}

/** Sócios que o usuário atual pode selecionar como responsável. */
export async function selectableMembers(user: SessionUser) {
  const members = await listMembers(user.bankrollId);
  const active = members.filter((m) => m.isActive);
  if (user.role === 'ADMIN') return active;
  const own = active.filter((m) => m.id === user.memberId);
  if (own.length === 0) throw notFound('Seu usuário não está vinculado a nenhum sócio desta banca.');
  return own;
}
